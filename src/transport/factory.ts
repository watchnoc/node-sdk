import type { WatchnocConfig } from '../config';

import { GrpcTransport } from './grpc';
import { HttpTransport } from './http';
import type { Transport } from './interface';

export function createTransports(cfg: WatchnocConfig): { primary: Transport; fallback?: Transport } {
  if (cfg.transport === 'http') {
    return { primary: new HttpTransport({ apiKey: cfg.apiKey, baseUrl: cfg.httpUrl }) };
  }
  return {
    primary: new GrpcTransport({
      apiKey: cfg.apiKey,
      addr: cfg.grpcAddr,
      tlsCert: cfg.tlsCert,
      debug: cfg.debug,
      onError: cfg.onError,
    }),
    fallback: new HttpTransport({ apiKey: cfg.apiKey, baseUrl: cfg.httpUrl }),
  };
}

