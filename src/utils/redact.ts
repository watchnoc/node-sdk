export type RedactPattern = {
  pattern: RegExp;
  replacement: string;
};

export function defaultRedactPatterns(): RedactPattern[] {
  return [
    { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]' },
    { pattern: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[REDACTED_CC]' },
    { pattern: /\bpk_[A-Za-z0-9_-]{8,}\b/g, replacement: 'pk_***' },
    { pattern: /\bsk_[A-Za-z0-9_-]{8,}\b/g, replacement: 'sk_***' },
    { pattern: /\bBearer\s+[A-Za-z0-9._-]+\b/gi, replacement: 'Bearer ***' },
    { pattern: /\bBasic\s+[A-Za-z0-9+/=]+\b/gi, replacement: 'Basic ***' },
    { pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: '[REDACTED_AWS_KEY]' },
    { pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, replacement: '[REDACTED_JWT]' },
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED_SSN]' },
  ];
}

/**
 * Key names that, when seen as an object property, cause the entire value to be
 * redacted regardless of its shape — value-pattern matching alone misses secrets
 * that don't look like an email/card/token (e.g. a raw password string).
 */
const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'auth',
  'authorization',
  'apikey',
  'api_key',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'clientsecret',
  'client_secret',
  'credential',
  'credentials',
  'ssn',
  'socialsecurity',
  'social_security',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'refreshtoken',
  'refresh_token',
  'sessiontoken',
  'session_token',
  'cookie',
  'setcookie',
  'set_cookie',
];

export function defaultSensitiveKeyPattern(): RegExp {
  return new RegExp(`(${DEFAULT_SENSITIVE_KEYS.join('|')})`, 'i');
}

export function isSensitiveKey(key: string, keyPattern: RegExp): boolean {
  if (!key) return false;
  return keyPattern.test(key.replace(/[-\s]/g, '_'));
}

export function redactString(input: string, patterns: RedactPattern[]): string {
  if (patterns.length === 0) return input;

  let out = input;
  for (let i = 0; i < patterns.length; i++) {
    out = out.replace(patterns[i].pattern, patterns[i].replacement);
  }
  return out;
}

const MAX_REDACT_DEPTH = 6;

/**
 * Recursively redacts a value: any object key matching `keyPattern` is fully
 * masked, and every remaining string (at any depth) is passed through the
 * value-pattern redactor. Handles nested objects/arrays so secrets buried
 * inside metadata payloads don't survive JSON.stringify unredacted.
 */
export function redactValue(
  key: string | undefined,
  value: unknown,
  patterns: RedactPattern[],
  keyPattern: RegExp,
  depth = 0,
): unknown {
  if (key !== undefined && isSensitiveKey(key, keyPattern)) {
    return '[REDACTED]';
  }
  if (value === null || value === undefined) return value;
  if (depth >= MAX_REDACT_DEPTH) return '[REDACTED_DEPTH]';

  if (typeof value === 'string') return redactString(value, patterns);
  if (typeof value !== 'object') return value;

  if (value instanceof Date || value instanceof RegExp) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message, patterns),
      stack: value.stack ? redactString(value.stack, patterns) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map((v) => redactValue(undefined, v, patterns, keyPattern, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactValue(k, v, patterns, keyPattern, depth + 1);
  }
  return out;
}

export function redactMetadata(
  meta: Record<string, string> | undefined,
  patterns: RedactPattern[],
  keyPattern: RegExp = defaultSensitiveKeyPattern(),
): Record<string, string> | undefined {
  if (!meta) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = isSensitiveKey(k, keyPattern) ? '[REDACTED]' : redactString(v, patterns);
  }
  return out;
}

const SENSITIVE_QUERY_PARAM_NAMES = new Set([
  'token',
  'apikey',
  'accesstoken',
  'refreshtoken',
  'secret',
  'clientsecret',
  'password',
  'auth',
  'authorization',
  'credential',
  'credentials',
  'session',
  'sessionid',
  'sessiontoken',
  'sig',
  'signature',
  'key',
  'xamzsignature',
  'xamzsecuritytoken',
  'xamzcredential',
]);

function normalizeParamName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]/g, '');
}

/**
 * Redacts sensitive query-string parameter values in a URL (e.g. ?token=..., ?api_key=...).
 * URLs are logged verbatim by HTTP instrumentation, and secrets embedded in query strings
 * don't match any value pattern (they aren't shaped like a JWT/card number/etc), so they
 * need their own denylist rather than relying on `redactString`.
 */
export function redactUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  let changed = false;
  for (const name of Array.from(parsed.searchParams.keys())) {
    if (SENSITIVE_QUERY_PARAM_NAMES.has(normalizeParamName(name))) {
      parsed.searchParams.set(name, '[REDACTED]');
      changed = true;
    }
  }
  return changed ? parsed.toString() : rawUrl;
}

export function redactApiKey(raw: string): string {
  const s = (raw ?? '').trim();
  if (s.startsWith('pk_')) return 'pk_***';
  if (s.length === 0) return '';
  return '***';
}
