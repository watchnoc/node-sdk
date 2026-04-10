import { createRequire } from 'node:module';

import { WatchnocError } from '../errors';

const nodeRequire = createRequire(typeof __filename !== 'undefined' ? __filename : importMetaUrl());

type FetchFn = (input: any, init?: any) => Promise<Response>;

export function getFetch(): FetchFn {
  const f = (globalThis as any).fetch as unknown;
  if (typeof f === 'function') {
    return f as FetchFn;
  }
  try {
    const undici = nodeRequire('undici');
    if (undici && typeof undici.fetch === 'function') {
      return undici.fetch as FetchFn;
    }
  } catch {}
  throw new WatchnocError('config', 'fetch is not available in this runtime');
}

function importMetaUrl(): string {
  return (0, eval)('import.meta.url') as string;
}

