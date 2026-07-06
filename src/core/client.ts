import { WatchnocContextStore } from './context.js';
import type { WatchnocContext } from './context.js';
import { loadConfig, type WatchnocConfig } from './config.js';
import { WatchnocError } from './errors.js';
import { buildLogEvent, type LogMeta, type LogLevel, type LogEvent } from './event.js';
import { redactString, type RedactPattern, defaultRedactPatterns, defaultSensitiveKeyPattern } from '../utils/redact.js';
import { uploadReplayChunk, type ReplayChunk } from '../replay/upload.js';
import { QueueFlusher } from '../queue/flusher.js';
import { EventQueue } from '../queue/queue.js';
import { createTransports } from '../transport/factory.js';
import type { Transport } from '../transport/interface.js';
import { registry } from '../instrumentation/registry.js';
import { HttpInstrumentation } from '../instrumentation/http.js';
import { captureSourceLocation } from '../utils/stack-trace.js';

export type WatchnocClientOptions = Partial<WatchnocConfig> & { apiKey: string };

const NEVER_MATCH = /(?!)/;


export class WatchnocClient {
  private readonly cfg: WatchnocConfig;
  private readonly primary: Transport;
  private readonly fallback?: Transport;
  private readonly queue: EventQueue<LogEvent>;
  private readonly flusher: QueueFlusher;
  private readonly patterns: RedactPattern[];
  private readonly keyPattern: RegExp;
  private closed = false;

  constructor(options: WatchnocClientOptions) {
    this.cfg = loadConfig(options);
    if (!this.cfg.apiKey) {
      throw new WatchnocError('config', 'WATCHNOC_API_KEY is required');
    }

    const transports = createTransports(this.cfg);
    this.primary = transports.primary;
    this.fallback = transports.fallback;
    this.queue = new EventQueue<LogEvent>(this.cfg.queueMax);

    this.patterns = this.cfg.redactPatterns ?? defaultRedactPatterns();
    this.keyPattern = this.cfg.sensitiveKeyPattern ?? defaultSensitiveKeyPattern();

    this.flusher = new QueueFlusher({
      queue: this.queue,
      primaryTransport: this.primary,
      fallbackTransport: this.fallback,
      config: this.cfg,
      onError: this.cfg.onError,
    });
    this.flusher.start();

    // Init instrumentation
    registry.register(new HttpInstrumentation());
    registry.initAll(this);
  }



  debug(message: string, meta?: LogMeta): void {
    this.capture('debug', message, meta);
  }
  info(message: string, meta?: LogMeta): void {
    this.capture('info', message, meta);
  }
  warn(message: string, meta?: LogMeta): void {
    this.capture('warn', message, meta);
  }
  error(message: string, meta?: LogMeta): void {
    this.capture('error', message, meta);
  }
  fatal(message: string, meta?: LogMeta): void {
    this.capture('fatal', message, meta);
  }

  captureException(error: Error, meta?: LogMeta): void {
    const msg = error?.message ? error.message : 'Unhandled exception';
    this.capture('error', msg, meta, error);
  }

  async uploadReplayChunk(chunk: ReplayChunk): Promise<void> {
    await uploadReplayChunk({
      apiKey: this.cfg.apiKey,
      httpUrl: this.cfg.httpUrl,
      chunk,
      timeoutMs: this.cfg.timeoutMs,
      allowInsecureHttp: this.cfg.allowInsecureHttp,
    });
  }

  async flush(): Promise<void> {
    await this.flusher.flush();
  }

  async shutdown(): Promise<void> {
    return this.shutdownWithDeadline(5000);
  }

  async shutdownWithDeadline(deadlineMs = 5000): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.flusher.shutdown(deadlineMs);
    await Promise.allSettled([this.primary.shutdown(), this.fallback?.shutdown()]);
  }

  setUserId(id: string): void {
    WatchnocContextStore.set({ userId: id });
  }

  setSessionId(id: string): void {
    WatchnocContextStore.set({ sessionId: id });
  }

  redact(value: string): string {
    if (!this.cfg.redact) return value;
    return redactString(value, this.patterns);
  }

  getConfig(): WatchnocConfig {
    return this.cfg;
  }

  private capture(level: LogLevel, message: string, meta?: LogMeta, err?: unknown): void {
    if (this.closed) return;

    // Sampling Check
    if (this.cfg.samplingRate < 1.0 && Math.random() > this.cfg.samplingRate) {
      return;
    }

    const ctx = WatchnocContextStore.get();
    
    // Merge Global Tags
    const mergedMeta = { ...this.cfg.globalTags, ...meta };
    
    // Extract special fields (handle both camelCase and snake_case)
    const rawTags = mergedMeta.tags ?? (mergedMeta as any).tags;
    const rawFile = mergedMeta.file ?? (mergedMeta as any).file;
    const rawLineNumber = mergedMeta.lineNumber ?? mergedMeta.line_number ?? (mergedMeta as any).lineNumber ?? (mergedMeta as any).line_number;
    const rawFunctionName = mergedMeta.functionName ?? mergedMeta.function_name ?? (mergedMeta as any).functionName ?? (mergedMeta as any).function_name;

    // Remove extracted fields from finalMeta
    const { tags, file, lineNumber, functionName, line_number, function_name, ...finalMeta } = mergedMeta as any;

    let finalFile = typeof rawFile === 'string' ? rawFile : undefined;
    let finalLineNumber = typeof rawLineNumber === 'number' ? rawLineNumber : (typeof rawLineNumber === 'string' ? parseInt(rawLineNumber, 10) : undefined);
    let finalFunctionName = typeof rawFunctionName === 'string' ? rawFunctionName : undefined;

    // Auto-capture source if missing
    if (!finalFile || !finalLineNumber) {
      const location = captureSourceLocation();
      if (location) {
        finalFile = finalFile || location.file;
        finalLineNumber = finalLineNumber || location.lineNumber;
        finalFunctionName = finalFunctionName || location.functionName;
      }
    }

    const ev = buildLogEvent({
      level,
      message,
      meta: finalMeta,
      err,
      ctx: ctx as WatchnocContext,
      service: this.cfg.service,
      environment: this.cfg.environment,
      release: this.cfg.release,
      runtime: 'node',
      ingestionType: this.cfg.transport === 'http' ? 'http' : 'grpc',
      redactPatterns: this.cfg.redact ? this.patterns : [],
      sensitiveKeyPattern: this.cfg.redact ? this.keyPattern : NEVER_MATCH,
      maxFieldChars: this.cfg.maxFieldChars,
      tags: parseTags(rawTags),
      file: finalFile,
      lineNumber: finalLineNumber,
      functionName: finalFunctionName,
    });

    const res = this.flusher.enqueue(ev);
    if (this.cfg.debug && res === 'dropped') {
      try {
        process.stderr.write('[watchnoc] queue overflow, event dropped\n');
      } catch {}
    }
  }
}

function parseTags(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}
