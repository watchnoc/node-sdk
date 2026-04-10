import { describe, expect, it } from 'vitest';

import { WatchnocContextStore } from './context';

describe('WatchnocContextStore', () => {
  it('propagates context through run()', () => {
    WatchnocContextStore.run({ requestId: 'r1', sessionId: 's1' }, () => {
      expect(WatchnocContextStore.get().requestId).toBe('r1');
      expect(WatchnocContextStore.get().sessionId).toBe('s1');
    });
  });
});

