import { describe, expect, it } from 'vitest';

import { WatchnocContextStore, sanitizeExternalId } from './context';

describe('WatchnocContextStore', () => {
  it('propagates context through run()', () => {
    WatchnocContextStore.run({ requestId: 'r1', sessionId: 's1' }, () => {
      expect(WatchnocContextStore.get().requestId).toBe('r1');
      expect(WatchnocContextStore.get().sessionId).toBe('s1');
    });
  });
});

describe('sanitizeExternalId', () => {
  it('accepts common id shapes', () => {
    expect(sanitizeExternalId('req_123')).toBe('req_123');
    expect(sanitizeExternalId('a1b2c3d4-e5f6-4a5b-8c9d-000000000000')).toBe(
      'a1b2c3d4-e5f6-4a5b-8c9d-000000000000',
    );
  });

  it('rejects missing or empty values', () => {
    expect(sanitizeExternalId(undefined)).toBeUndefined();
    expect(sanitizeExternalId(null)).toBeUndefined();
    expect(sanitizeExternalId('   ')).toBeUndefined();
  });

  it('rejects values with control characters or injection-style content', () => {
    expect(sanitizeExternalId('id\nX-Forged-Header: 1')).toBeUndefined();
    expect(sanitizeExternalId('id" onerror="alert(1)')).toBeUndefined();
    expect(sanitizeExternalId('id,drop table users')).toBeUndefined();
  });

  it('rejects values longer than the max length', () => {
    expect(sanitizeExternalId('a'.repeat(129))).toBeUndefined();
    expect(sanitizeExternalId('a'.repeat(128))).toBe('a'.repeat(128));
  });
});

