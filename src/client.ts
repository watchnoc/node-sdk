import { WatchnocContextStore } from './context';
import type { WatchnocContext } from './context';
import { loadConfig, type WatchnocConfig } from './config';
import { WatchnocError } from './errors';
import { buildLogEvent, type LogMeta, type LogLevel, type LogEvent } from './event';
import { defaultRedactPatterns, redactString, type RedactPattern } from './redact';
import { uploadReplayChunk, type ReplayChunk } from './replay/upload';
import { QueueFlusher } from './queue/flusher';
import { EventQueue } from './queue/queue';
import { createTransports } from './transport/factory';
import type { Transport } from './transport/interface';
import { registry } from './instrumentation/registry';
import { HttpInstrumentation } from './instrumentation/http';

export type WatchnocClientOptions = Partial<WatchnocConfig> & { apiKey: string };


export class WatchnocClient {
  private readonly cfg: WatchnocConfig;
  private readonly primary: Transport;
  private readonly fallback?: Transport;
  private readonly queue: EventQueue<LogEvent>;
  private readonly flusher: QueueFlusher;
  private readonly patterns: RedactPattern[];
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
    const finalMeta = { ...this.cfg.globalTags, ...meta };

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
    });

    const res = this.flusher.enqueue(ev);
    if (this.cfg.debug && res === 'dropped') {
      try {
        process.stderr.write('[watchnoc] queue overflow, event dropped\n');
      } catch {}
    }
  }
}
