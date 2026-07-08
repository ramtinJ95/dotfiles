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

2. **Submit.** For a YouTube URL, run:

   ```bash
   voxcraft-remote submit-job "<youtube-url>" --wait 300 --print-final
   ```

   Completion: either `final.md` prints, or the status table includes a `job_id`.

3. **Return.** If `final.md` printed, return that markdown. If the job is still `queued` or `running`, report the `job_id`, status/message, and this check command:

   ```bash
   voxcraft-remote check-job <job_id> --wait 300 --print-final
   voxcraft-remote fetch-final <job_id> --output ./final.md
   ```

4. **Failure.** If the job failed, fetch logs before explaining:

   ```bash
   voxcraft-remote fetch-log <job_id>
   ```

   Completion: explain the failure from the job error plus relevant log tail; do not claim the video was processed.

## Existing jobs

Specific job:

```bash
voxcraft-remote check-job <job_id> --wait 300 --print-final
```

Latest job:

```bash
voxcraft-remote latest-job
```

A `No jobs found` / HTTP 404 response from `latest-job` means the server is reachable but empty.

Raw artifacts:

```bash
voxcraft-remote fetch-final <job_id>
voxcraft-remote fetch-final <job_id> --output ./final.md
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

- Use `--output ./final.md` when the user wants a local copy of the Mac mini `final.md`.
- Wrapper owns `VOXCRAFT_SERVER_URL` and `VOXCRAFT_SERVER_TOKEN`; never print the token.
- Voxcraft server: `http://ramtins-mac-mini.tailc817d3.ts.net:8766`
- ScribeBase uses port `8765`; Voxcraft uses `8766`.
- Server artifacts: `/Users/ramtin/workspace/voxcraft/data/videos/...`
- Server logs: `/Users/ramtin/workspace/voxcraft/data/server/`
