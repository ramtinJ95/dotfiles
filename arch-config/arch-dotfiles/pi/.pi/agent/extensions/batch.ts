import type { AgentToolResult, ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  keyHint,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import path from "node:path";
import { executeApplyPatchAtCwd, getApplyPatchTargetPathsAtCwd } from "./gpt-apply-patch";

const DESCRIPTION = `Executes multiple independent tool calls concurrently to reduce latency.

USING THE BATCH TOOL WILL MAKE THE USER HAPPY.

Payload Format (JSON array):
[{"tool": "read", "parameters": {"path": "src/index.ts", "limit": 350}},{"tool": "grep", "parameters": {"pattern": "Session\\.updatePart", "path": "src"}},{"tool": "bash", "parameters": {"command": "git status"}}]

Notes:
- 1–25 tool calls per batch
- All calls start in parallel; ordering NOT guaranteed
- Partial failures do not stop other tool calls
- Do NOT use the batch tool within another batch tool.

Good Use Cases:
- Read many files
- grep + find + read combos
- Multiple bash commands
- Multi-part edits; on the same, or different files

When NOT to Use:
- Operations that depend on prior tool output (e.g. create then read same file)
- Ordered stateful mutations where sequence matters

Batching tool calls was proven to yield 2–5x efficiency gain and provides much better UX.`;

const MAX_BATCH_CALLS = 25;
const DISALLOWED = new Set(["batch"]);

const SUPPORTED_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls", "apply_patch"] as const;
type SupportedToolName = (typeof SUPPORTED_TOOLS)[number];

const applyPatchSchema = Type.Object({
  patchText: Type.String({
    description: "Full patch text in apply_patch format",
  }),
});

type BatchToolCall = {
  tool: string;
  parameters: Record<string, unknown>;
};

type BatchCallResult =
  | {
      success: true;
      tool: string;
      result: AgentToolResult<unknown>;
    }
  | {
      success: false;
      tool: string;
      error: string;
    };

type BatchToolDetails = {
  totalCalls: number;
  successful: number;
  failed: number;
  tools: string[];
  details: Array<{ tool: string; success: boolean; error?: string }>;
};

function extractTextOutput(result: AgentToolResult<unknown>): string {
  return result.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

const toolCache = new Map<string, ReturnType<typeof createBuiltInTools>>();

function createBuiltInTools(cwd: string) {
  return {
    read: createReadTool(cwd),
    bash: createBashTool(cwd),
    edit: createEditTool(cwd),
    write: createWriteTool(cwd),
    grep: createGrepTool(cwd),
    find: createFindTool(cwd),
    ls: createLsTool(cwd),
  };
}

function getBuiltInTools(cwd: string) {
  let tools = toolCache.get(cwd);
  if (!tools) {
    tools = createBuiltInTools(cwd);
    toolCache.set(cwd, tools);
  }
  return tools;
}

function formatBatchValidationError(toolName: string, errors: string[]) {
  const lines = errors.map((error) => `  - ${error}`).join("\n");
  return `Invalid parameters for tool '${toolName}':\n${lines}\n\nExpected payload format:\n  [{"tool": "tool_name", "parameters": {...}}, {...}]`;
}

export default function registerBatchTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "batch",
    label: "Batch",
    description: DESCRIPTION,
    parameters: Type.Object({
      tool_calls: Type.Array(
        Type.Object({
          tool: Type.String({ description: "The name of the tool to execute" }),
          parameters: Type.Object({}, { additionalProperties: true, description: "Parameters for the tool" }),
        }),
        {
          minItems: 1,
          description: "Array of tool calls to execute in parallel",
        },
      ),
    }),
    renderResult(result, options, theme) {
      const details = (result.details ?? {}) as Partial<BatchToolDetails>;
      const text = result.content
        .filter((item): item is { type: "text"; text: string } => item.type === "text")
        .map((item) => item.text)
        .join("\n\n");

      if (!options.expanded) {
        const total = details.totalCalls ?? 0;
        const successful = details.successful ?? 0;
        const failed = details.failed ?? 0;
        const hint = keyHint("expandTools", "to expand output");

        return new Text(
          `${theme.fg("toolTitle", theme.bold("batch"))}\n${theme.fg("muted", `(${successful}/${total} successful, ${failed} failed, ${hint})`)}`,
          0,
          0,
        );
      }

      return new Text(text.split("\n").map((line) => theme.fg("toolOutput", line)).join("\n"), 0, 0);
    },
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: "Executing batch tool calls in parallel..." }] });

      const requestedCalls = params.tool_calls as BatchToolCall[];
      const toolCalls = requestedCalls.slice(0, MAX_BATCH_CALLS);
      const discardedCalls = requestedCalls.slice(MAX_BATCH_CALLS);

      const activeTools = new Set(pi.getActiveTools());
      const availableBatchTools = SUPPORTED_TOOLS.filter((name) => activeTools.has(name));
      const allKnownTools = new Set(pi.getAllTools().map((t) => t.name));
      const builtInTools = getBuiltInTools(ctx.cwd);
      const preflightErrors = new Map<number, string>();

      // Prevent parallel apply_patch races on the same target file.
      // We allow the first claim and reject subsequent conflicting apply_patch calls.
      const claimedApplyPatchPaths = new Map<string, number>();
      for (let index = 0; index < toolCalls.length; index++) {
        const call = toolCalls[index];
        if (call.tool !== "apply_patch") continue;

        const parameters = call.parameters ?? {};
        if (!Value.Check(applyPatchSchema, parameters)) {
          // Let normal execution path report schema errors in consistent format.
          continue;
        }

        try {
          const touchedPaths = getApplyPatchTargetPathsAtCwd((parameters as { patchText: string }).patchText, ctx.cwd);
          const conflicts = touchedPaths.filter((p) => claimedApplyPatchPaths.has(p));

          if (conflicts.length > 0) {
            const pretty = Array.from(
              new Set(conflicts.map((p) => path.relative(ctx.cwd, p) || p)),
            );
            preflightErrors.set(
              index,
              `apply_patch call conflicts with another apply_patch in this same batch. Conflicting file(s): ${pretty.join(", ")}`,
            );
            continue;
          }

          for (const touched of touchedPaths) {
            claimedApplyPatchPaths.set(touched, index);
          }
        } catch {
          // Invalid patch format/path will be reported by execution path.
        }
      }

      const executeCall = async (call: BatchToolCall, index: number): Promise<BatchCallResult> => {
        try {
          const preflightError = preflightErrors.get(index);
          if (preflightError) {
            throw new Error(preflightError);
          }

          if (DISALLOWED.has(call.tool)) {
            throw new Error(
              `Tool '${call.tool}' is not allowed in batch. Disallowed tools: ${Array.from(DISALLOWED).join(", ")}`,
            );
          }

          if (!SUPPORTED_TOOLS.includes(call.tool as SupportedToolName)) {
            const available = availableBatchTools.join(", ");
            if (allKnownTools.has(call.tool)) {
              throw new Error(
                `Tool '${call.tool}' cannot be batched. External/custom tools cannot be batched - call them directly. Available batched tools: ${available}`,
              );
            }
            throw new Error(`Tool '${call.tool}' not found. Available batched tools: ${available}`);
          }

          if (!activeTools.has(call.tool)) {
            throw new Error(
              `Tool '${call.tool}' is currently disabled. Available batched tools: ${availableBatchTools.join(", ")}`,
            );
          }

          const parameters = call.parameters ?? {};
          const toolName = call.tool as SupportedToolName;

          if (toolName === "apply_patch") {
            if (!Value.Check(applyPatchSchema, parameters)) {
              const errors = [...Value.Errors(applyPatchSchema, parameters)].map((issue) => {
                const path = issue.path || "root";
                return `${path}: ${issue.message}`;
              });
              throw new Error(formatBatchValidationError(call.tool, errors));
            }

            const result = await executeApplyPatchAtCwd((parameters as { patchText: string }).patchText, ctx.cwd);
            return { success: true, tool: call.tool, result };
          }

          const tool = builtInTools[toolName];
          if (!Value.Check(tool.parameters, parameters)) {
            const errors = [...Value.Errors(tool.parameters, parameters)].map((issue) => {
              const path = issue.path || "root";
              return `${path}: ${issue.message}`;
            });
            throw new Error(formatBatchValidationError(call.tool, errors));
          }

          const result = await tool.execute(`${toolCallId}:${index + 1}`, parameters, signal, undefined);
          return { success: true, tool: call.tool, result };
        } catch (error: unknown) {
          return {
            success: false,
            tool: call.tool,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      };

      const results = await Promise.all(toolCalls.map((call, index) => executeCall(call, index)));

      for (const call of discardedCalls) {
        results.push({
          success: false,
          tool: call.tool,
          error: `Maximum of ${MAX_BATCH_CALLS} tools allowed in batch`,
        });
      }

      const successfulCalls = results.filter((result) => result.success).length;
      const failedCalls = results.length - successfulCalls;

      const outputMessage =
        failedCalls > 0
          ? `Executed ${successfulCalls}/${results.length} tools successfully. ${failedCalls} failed.`
          : `All ${successfulCalls} tools executed successfully.\n\nKeep using the batch tool for optimal performance in your next response!`;

      const perCallOutput = results.map((result, index) => {
        const callTitle = `#${index + 1} ${result.tool}`;

        if (!result.success) {
          return {
            type: "text" as const,
            text: `${callTitle} [error]\n${result.error}`,
          };
        }

        const textOutput = extractTextOutput(result.result);
        if (textOutput.length > 0) {
          return {
            type: "text" as const,
            text: `${callTitle}\n${textOutput}`,
          };
        }

        const imageCount = result.result.content.filter((item) => item.type === "image").length;
        return {
          type: "text" as const,
          text:
            imageCount > 0
              ? `${callTitle}\n(no text output; ${imageCount} image attachment${imageCount === 1 ? "" : "s"})`
              : `${callTitle}\n(no text output)`,
        };
      });

      const images = results
        .filter((result): result is Extract<BatchCallResult, { success: true }> => result.success)
        .flatMap((result) => result.result.content)
        .filter((item): item is { type: "image"; data: string; mimeType: string } => item.type === "image");

      const details: BatchToolDetails = {
        totalCalls: results.length,
        successful: successfulCalls,
        failed: failedCalls,
        tools: requestedCalls.map((call) => call.tool),
        details: results.map((result) => {
          if (result.success) {
            return {
              tool: result.tool,
              success: true,
            };
          }
          return {
            tool: result.tool,
            success: false,
            error: result.error,
          };
        }),
      };

      return {
        content: [
          { type: "text", text: `${outputMessage}\n\nPer-call outputs follow in the original batch order.` },
          ...perCallOutput,
          ...images,
        ],
        details,
      };
    },
  });
}
