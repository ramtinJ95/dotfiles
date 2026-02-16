export const MAX_FETCH_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
export const FETCH_DEFAULT_TIMEOUT_MS = 30_000;
export const FETCH_MAX_TIMEOUT_MS = 120_000;

export function abortAfterAny(ms: number, ...signals: Array<AbortSignal | undefined>) {
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), ms);

  const active = [timeoutController.signal, ...signals.filter((s): s is AbortSignal => Boolean(s))];
  const signal = active.length === 1 ? active[0] : AbortSignal.any(active);

  return {
    signal,
    clearTimeout: () => globalThis.clearTimeout(timeoutId),
  };
}

export function extractMimeType(contentTypeHeader: string): string {
  return contentTypeHeader.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "AbortError"
  );
}

export async function readResponseWithLimit(
  response: Response,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => undefined);
      throw new Error(`Response too large (>${Math.round(maxBytes / 1024)}KB)`);
    }
    chunks.push(value);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

export function decodeBytes(bytes: Uint8Array, contentTypeHeader: string): string {
  const charsetMatch = /charset=([^;]+)/i.exec(contentTypeHeader);
  const requestedCharset = charsetMatch?.[1]?.trim();

  if (requestedCharset) {
    try {
      return new TextDecoder(requestedCharset).decode(bytes);
    } catch {
      // fall through to utf-8
    }
  }

  return new TextDecoder("utf-8").decode(bytes);
}
