import { WatchnocError } from '../errors';
import { getFetch } from '../transport/fetch';

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
}): Promise<void> {
  const baseUrl = opts.httpUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/v1/replay/chunks`;

  const body = {
    session_id: opts.chunk.sessionId,
    chunk_index: opts.chunk.chunkIndex,
    started_at: opts.chunk.startedAt,
    ended_at: opts.chunk.endedAt,
    events: opts.chunk.events,
  };

  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
      },
      body: JSON.stringify(body),
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
