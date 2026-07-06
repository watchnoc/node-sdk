import { randomUUID } from 'node:crypto';

import type { WatchnocContext } from './context.js';
import {
  defaultRedactPatterns,
  defaultSensitiveKeyPattern,
  redactString,
  redactValue,
  type RedactPattern,
} from '../utils/redact.js';

const DEFAULT_MAX_FIELD_CHARS = 8192;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogMeta = Record<string, unknown>;

export type LogEvent = {
  log_id: string;
  timestamp_unix_ms: number;
  level: string;
  message: string;
  message_tokens?: number;
  service?: string;
  environment?: string;
  session_id?: string;
  request_id?: string;
  trace_id?: string;
  span_id?: string;
  user_id?: string;
  release?: string;
  country_code?: string;
  browser?: string;
  os?: string;
  runtime?: string;
  error_type?: string;
  error_message?: string;
  stack_trace?: string;
  error_hash?: string;
  ingestion_type?: string;
  metadata?: Record<string, string>;
  file?: string;
  line_number?: number;
  function_name?: string;
  tags?: string[];
};

export type BuildLogEventOptions = {
  level: LogLevel;
  message: string;
  meta?: LogMeta;
  err?: unknown;
  ctx?: WatchnocContext;
  service?: string;
  environment?: string;
  release?: string;
  userId?: string;
  runtime?: string;
  ingestionType: 'grpc' | 'http';
  redactPatterns?: RedactPattern[];
  sensitiveKeyPattern?: RegExp;
  maxFieldChars?: number;
  file?: string;
  lineNumber?: number;
  functionName?: string;
  tags?: string[];
};

export function buildLogEvent(opts: BuildLogEventOptions): LogEvent {
  const patterns = opts.redactPatterns ?? defaultRedactPatterns();
  const keyPattern = opts.sensitiveKeyPattern ?? defaultSensitiveKeyPattern();
  const maxChars = opts.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;
  const ctx = opts.ctx ?? {};

  const ev: LogEvent = {
    log_id: randomUUID(),
    timestamp_unix_ms: Date.now(),
    level: opts.level,
    message: truncate(redactString(String(opts.message ?? ''), patterns), maxChars),
    ingestion_type: opts.ingestionType,
    runtime: opts.runtime ?? 'node',
  };

  setStr(ev, 'service', opts.service);
  setStr(ev, 'environment', opts.environment);
  setStr(ev, 'release', opts.release);
  setStr(ev, 'user_id', opts.userId ?? ctx.userId);
  setStr(ev, 'session_id', ctx.sessionId);
  setStr(ev, 'request_id', ctx.requestId);
  setStr(ev, 'trace_id', ctx.traceId);
  setStr(ev, 'span_id', ctx.spanId);

  if (opts.err) {
    const ef = errorFields(opts.err);
    setStr(ev, 'error_type', ef.error_type);
    setStr(ev, 'error_message', truncate(redactString(ef.error_message, patterns), maxChars));
    setStr(ev, 'stack_trace', truncate(redactString(ef.stack_trace, patterns), maxChars));
  }

  if (opts.meta && Object.keys(opts.meta).length > 0) {
    ev.metadata = normalizeMeta(opts.meta, patterns, keyPattern, maxChars);
  }

  setStr(ev, 'file', opts.file);
  setStr(ev, 'function_name', opts.functionName);
  if (opts.lineNumber) ev.line_number = opts.lineNumber;
  if (opts.tags && opts.tags.length > 0) ev.tags = opts.tags;

  return ev;
}

function truncate(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}...[truncated]`;
}

function setStr<T extends Record<string, unknown>>(obj: T, key: string, v: unknown): void {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s) (obj as any)[key] = s;
}

function errorFields(err: unknown): { error_type: string; error_message: string; stack_trace: string } {
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    const name = typeof anyErr.name === 'string' ? anyErr.name : 'Error';
    const msg = typeof anyErr.message === 'string' ? anyErr.message : String(err);
    const stack = typeof anyErr.stack === 'string' ? anyErr.stack : '';
    return { error_type: name, error_message: msg, stack_trace: stack };
  }
  return { error_type: 'Error', error_message: String(err), stack_trace: '' };
}

function normalizeMeta(
  meta: LogMeta,
  patterns: RedactPattern[],
  keyPattern: RegExp,
  maxChars: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!k) continue;
    if (v === undefined || v === null) continue;
    const redacted = redactValue(k, v, patterns, keyPattern);
    out[k] = truncate(stringifyMetaValue(redacted), maxChars);
  }
  return out;
}

function stringifyMetaValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

