import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../core/config.js';
import type { LogEvent } from '../core/event.js';
import type { Transport } from '../transport/interface.js';

import { QueueFlusher } from './flusher.js';
import { EventQueue } from './queue.js';

describe('QueueFlusher', () => {
  it('unrefs the interval timer', () => {
    const cfg = loadConfig({ apiKey: 'pk_test', transport: 'http' });

    const q = new EventQueue<LogEvent>(10);
    const t: Transport = {
      name: 'http',
      sendBatch: vi.fn(async () => {}),
      shutdown: vi.fn(async () => {}),
    };

    const f = new QueueFlusher({ queue: q, primaryTransport: t, config: cfg });
    f.start();

    const timer = (f as any).timer as NodeJS.Timeout;
    expect(timer).toBeTruthy();
    expect(typeof timer.hasRef).toBe('function');
    expect(timer.hasRef()).toBe(false);

    f.stop();
  });
});
