import type { RedactPattern } from './redact';
import type { WatchnocError } from './errors';

export type WatchnocConfig = {
  apiKey: string;
  transport: 'grpc' | 'http';
  httpUrl: string;
  grpcAddr: string;
  tlsCert?: string;

  service?: string;
  environment?: string;
  release?: string;

  batchMax: number;
  batchFlushMs: number;
  queueMax: number;
  timeoutMs: number;

  retryMax: number;
  retryBaseMs: number;
  retryMaxMs: number;

  redact: boolean;
  redactPatterns?: RedactPattern[];

  slowQueryMs: number;
  nPlusOneThreshold: number;

  samplingRate: number;
  globalTags: Record<string, string>;

  debug: boolean;
  onError?: (err: WatchnocError) => void;
};


export function loadConfig(input: Partial<WatchnocConfig> & { apiKey?: string }): WatchnocConfig {
  const env = typeof process !== 'undefined' ? process.env : {};

  const apiKey = (input.apiKey ?? env.WATCHNOC_API_KEY ?? '').trim();
  const transport = (input.transport ??
    (env.WATCHNOC_TRANSPORT as any) ??
    'grpc') as WatchnocConfig['transport'];
  const grpcAddr = (input.grpcAddr ?? env.WATCHNOC_GRPC_ADDR ?? 'localhost:50051').trim();
  const httpUrl = (input.httpUrl ?? env.WATCHNOC_HTTP_URL ?? 'http://localhost:8080').trim();
  const tlsCert = (input.tlsCert ?? env.WATCHNOC_TLS_CERT ?? '').trim() || undefined;

  const service = (input.service ?? env.WATCHNOC_SERVICE ?? '').trim() || undefined;
  const environment = (input.environment ?? env.WATCHNOC_ENVIRONMENT ?? '').trim() || undefined;
  const release = (input.release ?? env.WATCHNOC_RELEASE ?? '').trim() || undefined;

  const batchMax = toInt(input.batchMax ?? env.WATCHNOC_BATCH_MAX, 50);
  const batchFlushMs = toInt(input.batchFlushMs ?? env.WATCHNOC_BATCH_FLUSH_MS, 1000);
  const queueMax = toInt(input.queueMax ?? env.WATCHNOC_QUEUE_MAX, 10000);
  const timeoutMs = toInt(input.timeoutMs ?? env.WATCHNOC_TIMEOUT_MS, 10000);

  const retryMax = toInt(input.retryMax ?? env.WATCHNOC_RETRY_MAX, 3);
  const retryBaseMs = toInt(input.retryBaseMs ?? env.WATCHNOC_RETRY_BASE_MS, 200);
  const retryMaxMs = toInt(input.retryMaxMs ?? env.WATCHNOC_RETRY_MAX_MS, 5000);

  const redact = toBool(input.redact ?? env.WATCHNOC_REDACT, true);
  const slowQueryMs = toInt(input.slowQueryMs ?? env.WATCHNOC_SLOW_QUERY_MS, 100);
  const nPlusOneThreshold = toInt(input.nPlusOneThreshold ?? env.WATCHNOC_N_PLUS_ONE_THRESHOLD, 5);
  const samplingRate = toFloat(input.samplingRate ?? env.WATCHNOC_SAMPLING_RATE, 1.0);
  const globalTags = input.globalTags ?? parseTags(env.WATCHNOC_GLOBAL_TAGS);
  const debug = toBool(input.debug ?? env.WATCHNOC_DEBUG, false);


  return {
    apiKey,
    transport,
    tlsCert,
    grpcAddr,
    httpUrl,
    service,
    environment,
    release,
    batchMax,
    batchFlushMs,
    queueMax,
    timeoutMs,
    retryMax,
    retryBaseMs,
    retryMaxMs,
    redact,
    redactPatterns: input.redactPatterns,
    slowQueryMs,
    nPlusOneThreshold,
    samplingRate,
    globalTags,
    debug,
    onError: input.onError,
  };
}



function toInt(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return def;
}

function toBool(v: unknown, def: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  }
  return def;
}
function toFloat(v: unknown, def: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return def;
}

function parseTags(v: unknown): Record<string, string> {
  if (typeof v !== 'string' || v.trim() === '') return {};
  const tags: Record<string, string> = {};
  const pairs = v.split(',');
  for (const pair of pairs) {
    const [key, val] = pair.split('=').map((s) => s.trim());
    if (key && val) {
      tags[key] = val;
    }
  }
  return tags;
}
