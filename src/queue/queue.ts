export class EventQueue<T> {
  private items: T[] = [];
  /** Index of the logical front of the queue. Avoids O(n) Array#shift on every dequeue/trim. */
  private head = 0;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
  }

  size(): number {
    return this.items.length - this.head;
  }

  enqueue(item: T): 'ok' | 'dropped' {
    this.items.push(item);
    return this.trim();
  }

  enqueueMany(items: T[]): 'ok' | 'dropped' {
    for (const it of items) this.items.push(it);
    return this.trim();
  }

  prependMany(newItems: T[]): 'ok' | 'dropped' {
    if (newItems.length > 0) {
      if (this.head >= newItems.length) {
        // Common case: this is the batch we just dequeued being re-queued after a
        // failed send, so there's exactly enough consumed space in front of `head`
        // to drop it back in without touching the rest of the array.
        this.head -= newItems.length;
        for (let i = 0; i < newItems.length; i++) {
          this.items[this.head + i] = newItems[i];
        }
      } else {
        const remaining = this.items.slice(this.head);
        this.items = newItems.concat(remaining);
        this.head = 0;
      }
    }
    return this.trim();
  }

  dequeueMany(max: number): T[] {
    const n = Math.max(0, Math.floor(max));
    const available = this.size();
    if (n <= 0 || available === 0) return [];
    const count = Math.min(n, available);
    const result = this.items.slice(this.head, this.head + count);
    this.head += count;
    this.compactIfNeeded();
    return result;
  }

  private trim(): 'ok' | 'dropped' {
    let dropped = false;
    while (this.size() > this.maxSize) {
      this.head += 1;
      dropped = true;
    }
    if (dropped) this.compactIfNeeded();
    return dropped ? 'dropped' : 'ok';
  }

  /**
   * Reclaims consumed slots by slicing the array back down, but only once
   * `head` accounts for at least half of it (or the queue just drained). This
   * makes compaction amortized O(1) per enqueue/dequeue instead of the O(n)
   * cost `Array#shift`/`splice(0, n)` paid on every single call.
   */
  private compactIfNeeded(): void {
    if (this.head === 0) return;
    if (this.head === this.items.length || this.head >= this.items.length / 2) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
  }
}
