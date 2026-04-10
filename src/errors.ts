export type WatchnocErrorKind =
  | 'config'
  | 'auth'
  | 'rate_limit'
  | 'validation'
  | 'network'
  | 'server'
  | 'unknown';

export class WatchnocError extends Error {
  readonly kind: WatchnocErrorKind;
  readonly cause?: unknown;

  constructor(kind: WatchnocErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'WatchnocError';
    this.kind = kind;
    this.cause = cause;
  }
}

export function isRetryableKind(kind: WatchnocErrorKind): boolean {
  return kind === 'network' || kind === 'server';
}


