import { WatchnocError } from '../core/errors.js';
import { getFetch } from '../transport/fetch.js';
import { assertSecureUrl } from '../transport/http.js';
import { compressJsonBody } from '../transport/compress.js';

export type ReplayChunk = {
  sessionId: string;
  chunkIndex: number;
  startedAt: number | string;
  endedAt: number | string;
  events: unknown;
};

export async function uploadReplayChunk(opts: {
  apiKey: string;
  httpUrl: string;
  chunk: ReplayChunk;
  timeoutMs: number;
  allowInsecureHttp?: boolean;
}): Promise<void> {
  const baseUrl = opts.httpUrl.replace(/\/+$/, '');
  assertSecureUrl(baseUrl, opts.allowInsecureHttp);
  const url = `${baseUrl}/v1/replay/chunks`;

  const { body, headers } = compressJsonBody({
    session_id: opts.chunk.sessionId,
    chunk_index: opts.chunk.chunkIndex,
    started_at: opts.chunk.startedAt,
    ended_at: opts.chunk.endedAt,
    events: opts.chunk.events,
  });

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { ...headers, 'x-api-key': opts.apiKey },
      body,
    },
    opts.timeoutMs,
  );

  if (res.ok) return;
  const status = res.status;
  if (status === 401 || status === 403) throw new WatchnocError('auth', 'authentication failed');
  if (status === 429) throw new WatchnocError('rate_limit', 'rate limited');
  if (status >= 400 && status < 500) throw new WatchnocError('validation', `invalid request (${status})`);
  if (status >= 500) throw new WatchnocError('server', `server error (${status})`);
  throw new WatchnocError('unknown', `unexpected response (${status})`);
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  t.unref?.();

  try {
    const f = getFetch();
    return await f(input, { ...init, signal: controller.signal });
  } catch (err) {
    throw new WatchnocError('network', 'network error', err);
  } finally {
    clearTimeout(t);
  }
}
