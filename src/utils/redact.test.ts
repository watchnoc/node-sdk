import { describe, expect, it } from 'vitest';

import { defaultRedactPatterns, redactMetadata } from './redact';

describe('redact', () => {
  it('redacts email address in metadata value', () => {
    const patterns = defaultRedactPatterns();
    const out = redactMetadata({ user: 'alice@example.com' }, patterns);
    expect(out?.user).toBe('[REDACTED_EMAIL]');
  });
});

