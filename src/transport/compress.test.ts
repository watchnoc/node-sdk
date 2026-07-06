import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { compressJsonBody, GZIP_THRESHOLD_BYTES } from './compress';

describe('compressJsonBody', () => {
  it('leaves small payloads as plain JSON', () => {
    const { body, headers } = compressJsonBody({ hello: 'world' });
    expect(typeof body).toBe('string');
    expect(body).toBe(JSON.stringify({ hello: 'world' }));
    expect(headers['content-encoding']).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });

  it('gzips payloads at or above the threshold and sets content-encoding', () => {
    const payload = { message: 'x'.repeat(GZIP_THRESHOLD_BYTES + 100) };
    const { body, headers } = compressJsonBody(payload);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(headers['content-encoding']).toBe('gzip');

    const decompressed = JSON.parse(gunzipSync(body as Buffer).toString('utf8'));
    expect(decompressed).toEqual(payload);
  });

  it('gzip output is smaller than the original for repetitive payloads', () => {
    const payload = { events: Array.from({ length: 200 }, (_, i) => ({ id: i, message: 'db.query slow' })) };
    const json = JSON.stringify(payload);
    const { body } = compressJsonBody(payload);
    expect(Buffer.isBuffer(body)).toBe(true);
    expect((body as Buffer).length).toBeLessThan(Buffer.byteLength(json));
  });
});
