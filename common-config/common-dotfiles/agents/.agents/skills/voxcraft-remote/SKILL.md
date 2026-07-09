---
name: voxcraft-remote
description: Submit YouTube URLs to the Mac mini Voxcraft server and retrieve final.md.
disable-model-invocation: true
---

# Voxcraft remote

User-invoked only. If this skill was not explicitly named by the user, stop.

## Flow

1. **Gate.** Confirm a YouTube URL or job id is present, and confirm the client exists:

   ```bash
   command -v voxcraft-remote || test -x ~/.local/bin/voxcraft-remote
   ```

   Completion: the command resolves. If it does not, report that the local wrapper is missing.

2. **Choose local output.** By default, save a local copy under `~/Downloads/voxcraft/` and tell the user the path. Create the directory if needed.

   For a URL, prefer a human-readable filename from the video title plus the YouTube id:

   ```text
   ~/Downloads/voxcraft/<video_title_slug>--<youtube_id>-final.md
   ```

   Include the YouTube id to avoid collisions and keep the file traceable. If the title lookup fails, fall back to:

   ```text
   ~/Downloads/voxcraft/<youtube_id>-final.md
   ```

   For an existing job id where the video title is unknown, use:

   ```text
   ~/Downloads/voxcraft/<job_id>-final.md
   ```

   If the user asks for a specific destination, use that path instead.

3. **Submit.** For a YouTube URL, build the local output path first, then submit:

   ```bash
   mkdir -p ~/Downloads/voxcraft
   title="$(~/personal/voxcraft/.venv/bin/python -m yt_dlp --print title --skip-download "<youtube-url>" 2>/dev/null | head -n 1 || true)"
   slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g; s/-+/-/g' | cut -c1-120)"
   if [ -n "$slug" ]; then
     output="$HOME/Downloads/voxcraft/${slug}--<youtube_id>-final.md"
   else
     output="$HOME/Downloads/voxcraft/<youtube_id>-final.md"
   fi
   voxcraft-remote submit-job "<youtube-url>" --wait 300 --print-final --output "$output"
   ```

   Completion: either `final.md` prints and the command reports/saves the local file, or the status table includes a `job_id`.

4. **Return.** If `final.md` printed, return the markdown and the local file path. If the job is still `queued` or `running`, report the `job_id`, status/message, and this check command using the same output path chosen above:

   ```bash
   voxcraft-remote check-job <job_id> --wait 300 --print-final --output "$output"
   ```

5. **Failure.** If the job failed, fetch logs before explaining:

   ```bash
   voxcraft-remote fetch-log <job_id>
   ```

   Completion: explain the failure from the job error plus relevant log tail; do not claim the video was processed.

## Existing jobs

Specific job, printing markdown and saving a local copy:

```bash
mkdir -p ~/Downloads/voxcraft
voxcraft-remote check-job <job_id> --wait 300 --print-final --output ~/Downloads/voxcraft/<job_id>-final.md
```

Latest job:

```bash
voxcraft-remote latest-job
```

A `No jobs found` / HTTP 404 response from `latest-job` means the server is reachable but empty.

Raw artifacts:

```bash
voxcraft-remote fetch-final <job_id>
voxcraft-remote fetch-final <job_id> --output ~/Downloads/voxcraft/<human_readable_or_job_id>-final.md
voxcraft-remote fetch-log <job_id>
```

## Options

Use options only when the user asks or the input requires them:

- `--diarize` for multi-speaker speaker labels
- `--num-speakers <n>` when speaker count is known
- `--min-speakers <n> --max-speakers <n>` when speaker count is bounded
- `--force` only when the user wants an uncached rerun
- `--asr-backend whisper-cpp` only as a fallback; never combine with `--diarize`

## Server facts

- Default behavior is both: return markdown inline when available and save a local `final.md` copy.
- Local filenames should be human-readable: prefer `<video_title_slug>--<youtube_id>-final.md`.
- Always report the local saved path when a file is saved.
- Wrapper owns `VOXCRAFT_SERVER_URL` and `VOXCRAFT_SERVER_TOKEN`; never print the token.
- Voxcraft server: `http://ramtins-mac-mini.tailc817d3.ts.net:8766`
- ScribeBase uses port `8765`; Voxcraft uses `8766`.
- Server artifacts: `/Users/ramtin/workspace/voxcraft/data/videos/...`
- Server logs: `/Users/ramtin/workspace/voxcraft/data/server/`
