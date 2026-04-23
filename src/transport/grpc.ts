import * as grpc from '@grpc/grpc-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import protobuf from 'protobufjs';

import { WatchnocError } from '../errors.js';
import type { LogEvent } from '../event.js';

import type { SendOptions, Transport } from './interface.js';

const require = createRequire(import.meta.url);

export type GrpcTransportOptions = {
  apiKey: string;
  addr: string;
  tlsCert?: string;
  debug?: boolean;
  onError?: (err: WatchnocError) => void;
  client?: GrpcClientLike;
};

type GrpcClientLike = {
  waitForReady(deadline: Date, callback: (err?: grpc.ServiceError | null) => void): void;
  sendLogs(
    metadata: grpc.Metadata,
    callback: (err: grpc.ServiceError | null, response?: unknown) => void,
  ): grpc.ClientWritableStream<any>;
  close(): void;
};

export class GrpcTransport implements Transport {
  readonly name = 'grpc' as const;

  private readonly client: GrpcClientLike;
  private readonly apiKey: string;
  private readonly debug: boolean;
  private readonly onError?: (err: WatchnocError) => void;
  private call: grpc.ClientWritableStream<any> | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;
  private fatalError: WatchnocError | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffAttempt = 0;
  private readonly serializeLogEvent: (e: LogEvent) => Buffer;
  private readonly serializeAck: (a: any) => Buffer;
  private readonly deserializeAck: (b: Buffer) => any;

  constructor(opts: GrpcTransportOptions) {
    this.apiKey = opts.apiKey;
    this.debug = !!opts.debug;
    this.onError = opts.onError;
    const codec = createProtoCodec();
    this.serializeLogEvent = codec.serializeLogEvent;
    this.serializeAck = codec.serializeAck;
    this.deserializeAck = codec.deserializeAck;
    this.client =
      opts.client ??
      createGrpcClient(
        opts.addr,
        credentialsFor(opts.addr, opts.tlsCert),
        {
          'grpc.keepalive_time_ms': 30000,
          'grpc.keepalive_timeout_ms': 5000,
          'grpc.keepalive_permit_without_calls': 1,
          'grpc.max_reconnect_backoff_ms': 10000,
        },
        {
          serializeLogEvent: this.serializeLogEvent,
          serializeAck: this.serializeAck,
          deserializeAck: this.deserializeAck,
        },
      );

    void this.ensureStream(Date.now() + 5000).catch(() => {});
  }

  async sendBatch(events: LogEvent[], opts: SendOptions): Promise<void> {
    if (events.length === 0) return;
    if (this.closed) throw new WatchnocError('network', 'transport closed');
    if (this.fatalError) throw this.fatalError;

    const waitStart = Date.now();
    const waitDeadline = waitStart + 5000;
    while (!this.call && Date.now() < waitDeadline) {
      try {
        await this.ensureStream(waitDeadline);
      } catch {}
      if (this.call) break;
      await delay(50);
    }

    const call = this.call;
    if (!call) throw new WatchnocError('network', 'transport unavailable');

    try {
      for (const e of events) {
        call.write(e);
      }
    } catch (err) {
      const pe = new WatchnocError('network', 'failed to write to grpc stream', err);
      this.handleStreamError((err as any) ?? ({} as any));
      throw pe;
    } finally {
      void opts;
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.call) {
      try {
        this.call.end();
      } catch {}
      this.call = null;
    }
    this.client.close();
  }

  private async ensureStream(deadlineMs: number): Promise<void> {
    if (this.closed) throw new WatchnocError('network', 'transport closed');
    if (this.fatalError) throw this.fatalError;
    if (this.call) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise<void>((resolve, reject) => {
      const deadline = new Date(deadlineMs);
      this.client.waitForReady(deadline, (err) => {
        if (err) {
          reject(new WatchnocError('network', 'transport unavailable', err));
          return;
        }
        try {
          const md = new grpc.Metadata();
          md.set('x-api-key', this.apiKey);
          const call = this.client.sendLogs(md, (e: grpc.ServiceError | null) => {
            if (e) this.handleStreamError(e);
          });
          call.on('error', (e) => this.handleStreamError(e as grpc.ServiceError));
          call.on('status', (s) => {
            if (s.code !== grpc.status.OK) {
              this.handleStreamError(s as any);
            }
          });
          this.call = call;
          this.backoffAttempt = 0;
          resolve();
        } catch (e) {
          reject(new WatchnocError('network', 'failed to open stream', e));
        }
      });
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private handleStreamError(err: grpc.ServiceError): void {
    if (this.closed) return;
    const pe = classifyGrpcError(err);
    if (this.debug) {
      try {
        process.stderr.write(`[watchnoc] grpc stream error kind=${pe.kind}\n`);
      } catch {}
    }
    if (pe.kind === 'auth' || pe.kind === 'validation') {
      this.fatalError = pe;
      this.onError?.(pe);
      if (this.call) {
        try {
          this.call.end();
        } catch {}
      }
      this.call = null;
      this.closed = true;
      return;
    }
    if (this.call) {
      try {
        this.call.end();
      } catch {}
    }
    this.call = null;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    if (this.fatalError) return;
    if (this.reconnectTimer) return;

    const ms = backoffMs(200, 10000, this.backoffAttempt);
    this.backoffAttempt++;
    const t = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureStream(Date.now() + 5000).catch(() => {
        this.scheduleReconnect();
      });
    }, ms);
    t.unref?.();
    this.reconnectTimer = t;
  }
}

function classifyGrpcError(err: grpc.ServiceError): WatchnocError {
  switch (err.code) {
    case grpc.status.UNAUTHENTICATED:
    case grpc.status.PERMISSION_DENIED:
      return new WatchnocError('auth', 'authentication failed', err);
    case grpc.status.INVALID_ARGUMENT:
      return new WatchnocError('validation', 'invalid payload', err);
    case grpc.status.RESOURCE_EXHAUSTED:
      return new WatchnocError('rate_limit', 'rate limited', err);
    case grpc.status.UNAVAILABLE:
    case grpc.status.DEADLINE_EXCEEDED:
      return new WatchnocError('network', 'transport unavailable', err);
    case grpc.status.INTERNAL:
      return new WatchnocError('server', 'server error', err);
    default:
      return new WatchnocError('unknown', 'unknown grpc error', err);
  }
}

function credentialsFor(addr: string, tlsCert?: string): grpc.ChannelCredentials {
  if (tlsCert) {
    const ca = readFileSync(tlsCert);
    return grpc.credentials.createSsl(ca);
  }
  const a = addr.toLowerCase();
  if (a.startsWith('localhost') || a.startsWith('127.0.0.1') || a.startsWith('[::1]')) {
    return grpc.credentials.createInsecure();
  }
  return grpc.credentials.createSsl();
}

function createGrpcClient(
  addr: string,
  creds: grpc.ChannelCredentials,
  opts: Record<string, unknown>,
  codec: {
    serializeLogEvent: (e: LogEvent) => Buffer;
    serializeAck: (a: any) => Buffer;
    deserializeAck: (b: Buffer) => any;
  },
): GrpcClientLike {
  const service = {
    SendLogs: {
      path: '/logs.v1.LogIngestionService/SendLogs',
      requestStream: true,
      responseStream: false,
      requestSerialize: codec.serializeLogEvent,
      requestDeserialize: () => {
        throw new Error('not used');
      },
      responseSerialize: codec.serializeAck,
      responseDeserialize: codec.deserializeAck,
    },
  } satisfies grpc.ServiceDefinition;

  const ClientCtor = grpc.makeGenericClientConstructor(service, 'LogIngestionService', {}) as any;
  return new ClientCtor(addr, creds, opts) as GrpcClientLike;
}

function createProtoCodec(): {
  serializeLogEvent: (e: LogEvent) => Buffer;
  serializeAck: (a: any) => Buffer;
  deserializeAck: (b: Buffer) => any;
} {
  const protoDir = join(require.resolve('@watchnoc/proto/package.json'), '../logs/v1');
  const protoPath = join(protoDir, 'ingest.proto');
  const root = protobuf.loadSync(protoPath);
  const logEvent = root.lookupType('logs.v1.LogEvent');
  const ack = root.lookupType('logs.v1.Ack');

  const serializeLogEvent = (e: LogEvent): Buffer => {
    const withIngestion: any = { ...e };
    if (!withIngestion.ingestion_type) {
      withIngestion.ingestion_type = 'grpc';
    }
    if (e.timestamp_unix_ms) {
      const seconds = Math.floor(e.timestamp_unix_ms / 1000);
      const nanos = (e.timestamp_unix_ms % 1000) * 1e6;
      withIngestion.timestamp = { seconds, nanos };
    }
    const msg = logEvent.fromObject(withIngestion);
    return Buffer.from(logEvent.encode(msg).finish());
  };

  return {
    serializeLogEvent,
    serializeAck: (a: any) => Buffer.from(ack.encode(ack.fromObject(a ?? {})).finish()),
    deserializeAck: (b: Buffer) => ack.decode(b),
  };
}

function backoffMs(base: number, max: number, attempt: number): number {
  const jitter = Math.floor(Math.random() * base);
  const d = base * Math.pow(2, attempt) + jitter;
  return Math.min(d, max);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

