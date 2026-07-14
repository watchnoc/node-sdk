import { uploadReplayChunk } from '@watchnoc/node';

// Session replay chunks are uploaded independently of the logging client —
// typically from wherever your frontend/session recorder buffers and
// forwards its own captured events to your backend, which then relays them
// here using the same API key as everything else.
await uploadReplayChunk({
  apiKey: process.env.WATCHNOC_API_KEY ?? 'pk_test',
  httpUrl: process.env.WATCHNOC_HTTP_URL ?? 'https://api.watchnoc.com',
  timeoutMs: 10000,
  chunk: {
    sessionId: 'sess_abc123',
    chunkIndex: 0,
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
    events: [{ type: 'snapshot', data: { /* recorder-specific payload */ } }],
  },
});
