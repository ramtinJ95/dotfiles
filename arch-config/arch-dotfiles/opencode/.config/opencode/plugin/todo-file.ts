import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"
import { randomBytes } from "crypto"

const TTL_DAYS = 7
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000

const STATUS = ["pending", "in_progress", "completed", "cancelled"] as const
const OPEN_STATUS = ["pending", "in_progress"] as const
const DONE_STATUS = ["completed", "cancelled"] as const
const PRIORITY = ["low", "medium", "high"] as const

type TodoStatus = (typeof STATUS)[number]
type TodoPriority = (typeof PRIORITY)[number]
type TodoLocation = "open" | "done"

const OPEN_SET = new Set<TodoStatus>(OPEN_STATUS)
const DONE_SET = new Set<TodoStatus>(DONE_STATUS)

const z = tool.schema

const TodoMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(STATUS),
  priority: z.enum(PRIORITY),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  closedAt: z.string().optional(),
  expiresAt: z.string().optional(),
})

type TodoMetadata = ReturnType<(typeof TodoMetadataSchema)["parse"]>

type TodoRecord = {
  metadata: TodoMetadata
  body: string
  location: TodoLocation
  filePath: string
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/

function nowIso() {
  return new Date().toISOString()
}

function expiresIn7DaysIso(fromIso: string) {
  const from = new Date(fromIso)
  return new Date(from.getTime() + TTL_MS).toISOString()
}

function isValidDate(value?: string) {
  if (!value) return false
  return !Number.isNaN(new Date(value).getTime())
}

function isDone(status: TodoStatus) {
  return DONE_SET.has(status)
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase()
}

function normalizeTags(tags?: string[]) {
  if (!tags) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    result.push(tag)
  }
  return result
}

function validateID(id: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(id)
}

function newID() {
  const stamp = Date.now().toString(36)
  const rand = randomBytes(3).toString("hex")
  return `todo_${stamp}_${rand}`
}

function toMarkdown(todo: TodoMetadata, body: string) {
  const payload = JSON.stringify(todo, null, 2)
  const content = body.trimEnd()
  if (!content) return `---\n${payload}\n---\n`
  return `---\n${payload}\n---\n${content}\n`
}

function parseTodoFile(content: string, filePath: string): { metadata: TodoMetadata; body: string } {
  const match = content.match(FRONTMATTER)
  if (!match) throw new Error(`Invalid todo format in ${filePath}`)

  let metadataRaw: unknown
  try {
    metadataRaw = JSON.parse(match[1])
  } catch {
    throw new Error(`Invalid todo metadata JSON in ${filePath}`)
  }

  const parsed = TodoMetadataSchema.safeParse(metadataRaw)
  if (!parsed.success) {
    throw new Error(`Invalid todo metadata in ${filePath}`)
  }

  return {
    metadata: parsed.data,
    body: match[2] ?? "",
  }
}

function paths(root: string) {
  const todos = path.join(root, ".opencode", "todos")
  return {
    root: todos,
    open: path.join(todos, "open"),
    done: path.join(todos, "done"),
  }
}

function fileFor(dir: string, id: string) {
  if (!validateID(id)) throw new Error(`Invalid todo id: ${id}`)
  return path.join(dir, `${id}.md`)
}

async function ensureStore(root: string) {
  const p = paths(root)
  await fs.mkdir(p.open, { recursive: true })
  await fs.mkdir(p.done, { recursive: true })
  return p
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readOne(filePath: string, location: TodoLocation): Promise<TodoRecord> {
  const content = await fs.readFile(filePath, "utf8")
  const parsed = parseTodoFile(content, filePath)
  return {
    metadata: parsed.metadata,
    body: parsed.body,
    location,
    filePath,
  }
}

async function findTodo(storeRoot: string, id: string): Promise<TodoRecord> {
  const p = paths(storeRoot)
  const openPath = fileFor(p.open, id)
  if (await exists(openPath)) return readOne(openPath, "open")

  const donePath = fileFor(p.done, id)
  if (await exists(donePath)) return readOne(donePath, "done")

  throw new Error(`Todo not found: ${id}`)
}

async function writeTodo(storeRoot: string, record: TodoRecord, location: TodoLocation) {
  const p = paths(storeRoot)
  const targetDir = location === "open" ? p.open : p.done
  const targetPath = fileFor(targetDir, record.metadata.id)
  const tempPath = `${targetPath}.tmp-${randomBytes(3).toString("hex")}`

  await fs.writeFile(tempPath, toMarkdown(record.metadata, record.body), "utf8")
  await fs.rename(tempPath, targetPath)

  if (record.filePath !== targetPath && (await exists(record.filePath))) {
    await fs.unlink(record.filePath)
  }

  return {
    ...record,
    location,
    filePath: targetPath,
  }
}

async function readAllFrom(dir: string, location: TodoLocation) {
  const entries = await fs.readdir(dir).catch(() => [] as string[])
  const files = entries.filter((entry) => entry.endsWith(".md"))

  const loaded = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(dir, file)
      try {
        return await readOne(filePath, location)
      } catch {
        return undefined
      }
    }),
  )

  return loaded.filter((item): item is TodoRecord => Boolean(item))
}

function expirationTimestamp(record: TodoRecord, statMtimeMs: number) {
  const expiresAt = record.metadata.expiresAt
  if (isValidDate(expiresAt)) return new Date(expiresAt!).getTime()

  const closedAt = record.metadata.closedAt
  if (isValidDate(closedAt)) return new Date(closedAt!).getTime() + TTL_MS

  return statMtimeMs + TTL_MS
}

async function gcDone(storeRoot: string) {
  const p = paths(storeRoot)
  const entries = await fs.readdir(p.done).catch(() => [] as string[])
  const now = Date.now()
  const deleted: string[] = []
  const failed: string[] = []

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue
    const filePath = path.join(p.done, entry)

    try {
      const [stat, content] = await Promise.all([fs.stat(filePath), fs.readFile(filePath, "utf8")])
      const parsed = parseTodoFile(content, filePath)
      const record: TodoRecord = {
        metadata: parsed.metadata,
        body: parsed.body,
        location: "done",
        filePath,
      }

      if (expirationTimestamp(record, stat.mtimeMs) > now) continue
      await fs.unlink(filePath)
      deleted.push(record.metadata.id)
    } catch {
      failed.push(entry)
    }
  }

  return {
    deleted,
    failed,
  }
}

function summarize(record: TodoRecord, includeBody: boolean) {
  const info: Record<string, unknown> = {
    id: record.metadata.id,
    title: record.metadata.title,
    status: record.metadata.status,
    priority: record.metadata.priority,
    tags: record.metadata.tags,
    createdAt: record.metadata.createdAt,
    updatedAt: record.metadata.updatedAt,
    closedAt: record.metadata.closedAt,
    expiresAt: record.metadata.expiresAt,
    location: record.location,
  }

  if (includeBody) info.body = record.body
  return info
}

function withGc<T>(data: T, gc: { deleted: string[]; failed: string[] }) {
  return JSON.stringify(
    {
      ...data,
      gc: {
        ttlDays: TTL_DAYS,
        deleted: gc.deleted.length,
        deletedIDs: gc.deleted,
        failed: gc.failed,
      },
    },
    null,
    2,
  )
}

export const TodoFilePlugin: Plugin = async () => {
  return {
    tool: {
      todo_file: tool({
        description:
          "Manage persistent project todo files in .opencode/todos with open/done folders and automatic 7-day cleanup for completed items.",
        args: {
          action: z
            .enum(["list", "get", "create", "update", "append", "close", "reopen", "delete", "gc"])
            .describe("Todo action to run"),
          id: z.string().optional().describe("Todo ID for get/update/append/close/reopen/delete"),
          title: z.string().optional().describe("Todo title for create/update"),
          body: z.string().optional().describe("Todo body for create/update"),
          appendText: z.string().optional().describe("Text to append to an existing todo body"),
          status: z
            .enum(STATUS)
            .optional()
            .describe("Todo status for update/close/reopen. close supports completed/cancelled."),
          priority: z.enum(PRIORITY).optional().describe("Todo priority"),
          tags: z.array(z.string()).optional().describe("Todo tags"),
          includeBody: z.boolean().optional().describe("Include full body text in list output"),
          search: z.string().optional().describe("Case-insensitive search across id/title/body"),
          tag: z.string().optional().describe("Filter list by tag"),
          listStatus: z.enum(["open", "done", "all"]).optional().describe("List scope (default: open)"),
          limit: z.number().int().min(1).max(500).optional().describe("Maximum todos to return for list"),
        },
        async execute(args, context) {
          const root = context.worktree || context.directory
          await ensureStore(root)

          const gc = await gcDone(root)

          if (args.action === "gc") {
            return withGc(
              {
                action: "gc",
                message: "Expired done todos cleanup completed.",
              },
              gc,
            )
          }

          if (args.action === "list") {
            const p = paths(root)
            const listStatus = args.listStatus ?? "open"
            const includeBody = args.includeBody ?? false

            const openTodos = listStatus === "open" || listStatus === "all" ? await readAllFrom(p.open, "open") : []
            const doneTodos = listStatus === "done" || listStatus === "all" ? await readAllFrom(p.done, "done") : []
            let todos = [...openTodos, ...doneTodos]

            if (args.priority) {
              todos = todos.filter((item) => item.metadata.priority === args.priority)
            }

            if (args.tag) {
              const tag = normalizeTag(args.tag)
              todos = todos.filter((item) => item.metadata.tags.includes(tag))
            }

            if (args.search) {
              const query = args.search.toLowerCase()
              todos = todos.filter((item) => {
                const haystack = `${item.metadata.id}\n${item.metadata.title}\n${item.body}`.toLowerCase()
                return haystack.includes(query)
              })
            }

            todos.sort((a, b) => b.metadata.updatedAt.localeCompare(a.metadata.updatedAt))

            const limited = todos.slice(0, args.limit ?? 100)

            return withGc(
              {
                action: "list",
                listStatus,
                count: limited.length,
                todos: limited.map((item) => summarize(item, includeBody)),
              },
              gc,
            )
          }

          if (args.action === "get") {
            if (!args.id) throw new Error("id is required for get")
            const item = await findTodo(root, args.id)
            return withGc(
              {
                action: "get",
                todo: summarize(item, true),
              },
              gc,
            )
          }

          if (args.action === "create") {
            const title = args.title?.trim()
            if (!title) throw new Error("title is required for create")

            const id = args.id?.trim() || newID()
            if (!validateID(id)) throw new Error(`Invalid todo id: ${id}`)

            const p = paths(root)
            const openPath = fileFor(p.open, id)
            const donePath = fileFor(p.done, id)
            if ((await exists(openPath)) || (await exists(donePath))) {
              throw new Error(`Todo already exists: ${id}`)
            }

            const requested = args.status ?? "pending"
            const status = OPEN_SET.has(requested) ? requested : "pending"
            const now = nowIso()
            const metadata: TodoMetadata = {
              id,
              title,
              status,
              priority: args.priority ?? "medium",
              tags: normalizeTags(args.tags),
              createdAt: now,
              updatedAt: now,
            }

            const record: TodoRecord = {
              metadata,
              body: args.body?.trim() ?? "",
              location: "open",
              filePath: openPath,
            }

            const saved = await writeTodo(root, record, "open")

            return withGc(
              {
                action: "create",
                todo: summarize(saved, true),
              },
              gc,
            )
          }

          if (args.action === "update") {
            if (!args.id) throw new Error("id is required for update")
            let record = await findTodo(root, args.id)
            const updated: TodoMetadata = {
              ...record.metadata,
            }

            if (args.title !== undefined) {
              const title = args.title.trim()
              if (!title) throw new Error("title cannot be empty")
              updated.title = title
            }

            if (args.priority) updated.priority = args.priority
            if (args.tags) updated.tags = normalizeTags(args.tags)
            if (args.body !== undefined) record.body = args.body.trim()

            if (args.status) {
              updated.status = args.status
            }

            if (isDone(updated.status)) {
              if (!isValidDate(updated.closedAt)) updated.closedAt = nowIso()
              updated.expiresAt = expiresIn7DaysIso(updated.closedAt!)
            } else {
              delete updated.closedAt
              delete updated.expiresAt
            }

            updated.updatedAt = nowIso()

            record = {
              ...record,
              metadata: updated,
            }

            const location: TodoLocation = isDone(updated.status) ? "done" : "open"
            const saved = await writeTodo(root, record, location)

            return withGc(
              {
                action: "update",
                todo: summarize(saved, true),
              },
              gc,
            )
          }

          if (args.action === "append") {
            if (!args.id) throw new Error("id is required for append")
            if (!args.appendText?.trim()) throw new Error("appendText is required for append")

            const record = await findTodo(root, args.id)
            const nextBody = record.body.trimEnd()
            const appendText = args.appendText.trim()
            record.body = nextBody ? `${nextBody}\n\n${appendText}` : appendText
            record.metadata.updatedAt = nowIso()

            const saved = await writeTodo(root, record, record.location)

            return withGc(
              {
                action: "append",
                todo: summarize(saved, true),
              },
              gc,
            )
          }

          if (args.action === "close") {
            if (!args.id) throw new Error("id is required for close")
            const status = args.status && DONE_SET.has(args.status) ? args.status : "completed"

            const record = await findTodo(root, args.id)
            record.metadata.status = status
            record.metadata.closedAt = nowIso()
            record.metadata.expiresAt = expiresIn7DaysIso(record.metadata.closedAt)
            record.metadata.updatedAt = nowIso()

            const saved = await writeTodo(root, record, "done")

            return withGc(
              {
                action: "close",
                todo: summarize(saved, true),
              },
              gc,
            )
          }

          if (args.action === "reopen") {
            if (!args.id) throw new Error("id is required for reopen")
            const status = args.status && OPEN_SET.has(args.status) ? args.status : "pending"

            const record = await findTodo(root, args.id)
            record.metadata.status = status
            delete record.metadata.closedAt
            delete record.metadata.expiresAt
            record.metadata.updatedAt = nowIso()

            const saved = await writeTodo(root, record, "open")

            return withGc(
              {
                action: "reopen",
                todo: summarize(saved, true),
              },
              gc,
            )
          }

          if (args.action === "delete") {
            if (!args.id) throw new Error("id is required for delete")
            const record = await findTodo(root, args.id)
            await fs.unlink(record.filePath)

            return withGc(
              {
                action: "delete",
                deletedID: args.id,
              },
              gc,
            )
          }

          throw new Error(`Unsupported action: ${args.action}`)
        },
      }),
    },
  }
}

export default TodoFilePlugin
