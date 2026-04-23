import { WatchnocError, isRetryableKind } from '../core/errors.js';

import type { LogEvent } from '../core/event.js';
import type { WatchnocConfig } from '../core/config.js';
import type { Transport } from '../transport/interface.js';

import { EventQueue } from './queue.js';

export type FlusherOptions = {
  queue: EventQueue<LogEvent>;
  primaryTransport: Transport;
  fallbackTransport?: Transport;
  config: WatchnocConfig;
  onError?: (err: WatchnocError) => void;
};

export class QueueFlusher {
  private readonly queue: EventQueue<LogEvent>;
  private readonly primary: Transport;
  private readonly fallback?: Transport;
  private readonly cfg: WatchnocConfig;
  private readonly onError?: (err: WatchnocError) => void;

  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private stopped = false;

  constructor(opts: FlusherOptions) {
    this.queue = opts.queue;
    this.primary = opts.primaryTransport;
    this.fallback = opts.fallbackTransport;
    this.cfg = opts.config;
    this.onError = opts.onError;
  }

  start(): void {
    if (this.timer) return;
    const t = setInterval(() => {
      void this.flush();
    }, this.cfg.batchFlushMs);
    t.unref?.();
    this.timer = t;
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  enqueue(event: LogEvent): 'ok' | 'dropped' {
    const res = this.queue.enqueue(event);
    if (this.queue.size() >= this.cfg.batchMax) {
      void this.flush();
    }
    return res;
  }

  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = this.runFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async shutdown(deadlineMs = 5000): Promise<void> {
    this.stop();
    const deadline = Date.now() + Math.max(0, Math.floor(deadlineMs));
    
    // Final flush attempts
    try {
      while (this.queue.size() > 0 && Date.now() < deadline) {
        const remaining = deadline - Date.now();
        await this.flushOnce(Math.max(1, remaining));
        if (this.queue.size() > 0) {
          await delay(Math.min(50, Math.max(1, deadline - Date.now())));
        }
      }
    } catch (err) {
      if (this.cfg.debug) {
        process.stderr.write(`[watchnoc] error during shutdown: ${err}\n`);
      }
    }
  }

  private async runFlush(): Promise<void> {
    const size = this.queue.size();
    if (size === 0) return;
    
    await this.flushOnce(undefined);

    // If we still have a lot of items, keep flushing immediately
    if (!this.stopped && this.queue.size() >= this.cfg.batchMax) {
      await this.runFlush();
    }
  }

  private async flushOnce(deadlineMs?: number): Promise<void> {
    const batch = this.queue.dequeueMany(this.cfg.batchMax);
    if (!batch || batch.length === 0) return;

    try {
      await this.sendWithRetry(batch, deadlineMs);
    } catch (err) {
      const pe = err instanceof WatchnocError ? err : null;
      // Re-queue if it's a network/server error
      if (!pe || (pe.kind !== 'auth' && pe.kind !== 'validation')) {
        this.queue.prependMany(batch);
      }
      if (pe && (pe.kind === 'auth' || pe.kind === 'validation')) {
        this.onError?.(pe);
      }
    }
  }

  private async sendWithRetry(batch: LogEvent[], deadlineMs?: number): Promise<void> {
    let lastErr: unknown;
    const attempts = Math.max(1, this.cfg.retryMax);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const timeoutMs = boundedTimeout(this.cfg.timeoutMs, deadlineMs);
        await this.primary.sendBatch(batch, { timeoutMs });
        return;
      } catch (err) {
        lastErr = err;
        const pe = err instanceof WatchnocError ? err : null;
        if (pe && pe.kind === 'rate_limit') {
          await delay(backoffMs(500, this.cfg.retryMaxMs, attempt));
          continue;
        }
        if (pe && isRetryableKind(pe.kind)) {
          await delay(backoffMs(this.cfg.retryBaseMs, this.cfg.retryMaxMs, attempt));
          continue;
        }
        throw err;
      }
    }

    if (this.fallback) {
      try {
        await this.fallback.sendBatch(batch, { timeoutMs: boundedTimeout(this.cfg.timeoutMs, deadlineMs) });
        return;
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr;
  }
}

function backoffMs(base: number, max: number, attempt: number): number {
  const jitter = Math.floor(Math.random() * (base / 2));
  const d = base * Math.pow(2, attempt) + jitter;
  return Math.min(d, max);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function boundedTimeout(defaultTimeoutMs: number, deadlineMs?: number): number {
  if (deadlineMs === undefined) return defaultTimeoutMs;
  return Math.max(1, Math.min(defaultTimeoutMs, Math.floor(deadlineMs)));
}

