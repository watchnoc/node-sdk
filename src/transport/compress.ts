import { gzipSync } from 'node:zlib';

/**
 * Below this size, gzip's own framing overhead (and the CPU cost of compressing
 * synchronously) outweighs the bandwidth saved — most single-event batches land
 * well under this, larger batches and replay chunks are typically well above it.
 */
export const GZIP_THRESHOLD_BYTES = 1024;

export type CompressedBody = {
  body: string | Buffer;
  headers: Record<string, string>;
};

/**
 * JSON-encodes and, for payloads above GZIP_THRESHOLD_BYTES, gzips the body.
 * Log/error/replay payloads are highly repetitive JSON (shared keys, similar
 * messages/stack traces), so gzip typically cuts 80-90% off the wire size.
 */
export function compressJsonBody(payload: unknown): CompressedBody {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) < GZIP_THRESHOLD_BYTES) {
    return { body: json, headers: { 'content-type': 'application/json' } };
  }
  return {
    body: gzipSync(json),
    headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
  };
}
