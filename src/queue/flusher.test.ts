import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../config';
import type { LogEvent } from '../event';
import type { Transport } from '../transport/interface';

import { QueueFlusher } from './flusher';
import { EventQueue } from './queue';

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
