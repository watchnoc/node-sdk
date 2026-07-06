import { describe, expect, it } from 'vitest';

import {
  defaultRedactPatterns,
  defaultSensitiveKeyPattern,
  redactMetadata,
  redactUrl,
  redactValue,
} from './redact';

describe('redact', () => {
  it('redacts email address in metadata value', () => {
    const patterns = defaultRedactPatterns();
    const out = redactMetadata({ user: 'alice@example.com' }, patterns);
    expect(out?.user).toBe('[REDACTED_EMAIL]');
  });

  it('redacts by key name even when the value matches no value pattern', () => {
    const patterns = defaultRedactPatterns();
    const out = redactMetadata({ password: 'hunter2', name: 'alice' }, patterns);
    expect(out?.password).toBe('[REDACTED]');
    expect(out?.name).toBe('alice');
  });
});

describe('redactValue', () => {
  const patterns = defaultRedactPatterns();
  const keyPattern = defaultSensitiveKeyPattern();

  it('redacts sensitive keys nested inside objects', () => {
    const out = redactValue(
      undefined,
      { user: { name: 'alice', password: 'hunter2' } },
      patterns,
      keyPattern,
    ) as any;
    expect(out.user.name).toBe('alice');
    expect(out.user.password).toBe('[REDACTED]');
  });

  it('redacts sensitive keys inside arrays of objects', () => {
    const out = redactValue(
      undefined,
      [{ token: 'abc123' }, { name: 'bob' }],
      patterns,
      keyPattern,
    ) as any;
    expect(out[0].token).toBe('[REDACTED]');
    expect(out[1].name).toBe('bob');
  });

  it('still applies value-pattern redaction on non-sensitive keys', () => {
    const out = redactValue(undefined, { contact: 'alice@example.com' }, patterns, keyPattern) as any;
    expect(out.contact).toBe('[REDACTED_EMAIL]');
  });

  it('redacts Error objects by message/stack, not raw properties', () => {
    const err = new Error('login failed for alice@example.com');
    const out = redactValue(undefined, err, patterns, keyPattern) as any;
    expect(out.message).toBe('login failed for [REDACTED_EMAIL]');
  });
});

describe('redactUrl', () => {
  it('redacts sensitive query string parameters', () => {
    const out = redactUrl('https://api.example.com/orders?token=abc123&id=42');
    expect(out).not.toContain('abc123');
    expect(out).toContain('id=42');
  });

  it('redacts common secret param name variants', () => {
    for (const param of ['api_key', 'apiKey', 'access_token', 'session_id', 'signature']) {
      const out = redactUrl(`https://api.example.com/?${param}=super-secret-value`);
      expect(out).not.toContain('super-secret-value');
    }
  });

  it('leaves non-sensitive query params and plain urls untouched', () => {
    expect(redactUrl('https://api.example.com/orders?id=42')).toBe(
      'https://api.example.com/orders?id=42',
    );
  });

  it('returns the input unchanged if it is not a valid URL', () => {
    expect(redactUrl('not a url')).toBe('not a url');
  });
});

