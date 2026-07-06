import { describe, expect, it } from 'vitest';

import { EventQueue } from './queue.js';

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

  it('re-queues a dequeued batch at the front via prependMany, preserving order', () => {
    const q = new EventQueue<number>(100);
    q.enqueueMany([1, 2, 3, 4, 5]);

    const batch = q.dequeueMany(3); // [1, 2, 3], head now consumed 3 slots
    expect(batch).toEqual([1, 2, 3]);

    q.prependMany(batch); // simulate a failed send being retried
    expect(q.dequeueMany(10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('prependMany falls back correctly when there is no consumed space to reuse', () => {
    const q = new EventQueue<number>(100);
    q.enqueueMany([3, 4, 5]);
    q.prependMany([1, 2]);
    expect(q.dequeueMany(10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('maintains correct size and order across many enqueue/dequeue/prepend cycles', () => {
    const q = new EventQueue<number>(50);
    let next = 0;
    const expected: number[] = [];

    for (let round = 0; round < 200; round++) {
      const toAdd = [next++, next++, next++];
      q.enqueueMany(toAdd);
      expected.push(...toAdd);
      while (expected.length > 50) expected.shift();

      if (round % 7 === 0) {
        const batch = q.dequeueMany(2);
        q.prependMany(batch); // put it right back, should be a no-op on order
      }

      const drained = q.dequeueMany(2);
      for (let i = 0; i < drained.length; i++) {
        expect(drained[i]).toBe(expected.shift());
      }
    }

    expect(q.size()).toBe(expected.length);
  });

  it('respects maxSize after prependMany would otherwise exceed it', () => {
    const q = new EventQueue<number>(3);
    q.enqueueMany([1, 2, 3]);
    const dropped = q.prependMany([0]);
    expect(dropped).toBe('dropped');
    expect(q.size()).toBe(3);
  });
});

