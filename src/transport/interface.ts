import type { LogEvent } from '../event';

export type SendOptions = {
  timeoutMs: number;
};

export interface Transport {
  readonly name: 'grpc' | 'http' | 'fallback';
  sendBatch(events: LogEvent[], opts: SendOptions): Promise<void>;
  shutdown(): Promise<void>;
}

