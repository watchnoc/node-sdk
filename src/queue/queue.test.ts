import { describe, expect, it } from 'vitest';

import { EventQueue } from './queue';

describe('EventQueue', () => {
  it('drops oldest when full', () => {
    const q = new EventQueue<number>(3);
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    q.enqueue(4);

    expect(q.size()).toBe(3);
    expect(q.dequeueMany(10)).toEqual([2, 3, 4]);
  });
});

