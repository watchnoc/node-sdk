import { describe, expect, it, vi } from 'vitest';

import { uploadReplayChunk } from './upload';

describe('uploadReplayChunk', () => {
  it('posts to /api/v1/replay/chunks/upload with the api key and chunk body', async () => {
    const fetchSpy = vi.fn(async (url: string, init: any) => {
      expect(url).toBe('http://localhost:8080/api/v1/replay/chunks/upload');
      expect(init.headers['x-api-key']).toBe('pk_test');
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        session_id: 'sess_1',
        chunk_index: 0,
        started_at: 1000,
        ended_at: 2000,
        events: [{ type: 'snapshot' }],
      });
      return { ok: true, status: 201, headers: { get: () => null } } as any;
    });
    (globalThis as any).fetch = fetchSpy;

    await uploadReplayChunk({
      apiKey: 'pk_test',
      httpUrl: 'http://localhost:8080',
      timeoutMs: 1000,
      chunk: {
        sessionId: 'sess_1',
        chunkIndex: 0,
        startedAt: 1000,
        endedAt: 2000,
        events: [{ type: 'snapshot' }],
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws an auth WatchnocError on 401', async () => {
    (globalThis as any).fetch = vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => null } }) as any);

    await expect(
      uploadReplayChunk({
        apiKey: 'bad_key',
        httpUrl: 'http://localhost:8080',
        timeoutMs: 1000,
        chunk: { sessionId: 'sess_1', chunkIndex: 0, startedAt: 1000, endedAt: 2000, events: [] },
      }),
    ).rejects.toMatchObject({ kind: 'auth' });
  });
});
