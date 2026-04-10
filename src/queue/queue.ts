export class EventQueue<T> {
  private items: T[] = [];
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = Math.max(1, Math.floor(maxSize));
  }

  size(): number {
    return this.items.length;
  }

  enqueue(item: T): 'ok' | 'dropped' {
    this.items.push(item);
    return this.trim();
  }

  enqueueMany(items: T[]): 'ok' | 'dropped' {
    for (const it of items) this.items.push(it);
    return this.trim();
  }

  prependMany(items: T[]): 'ok' | 'dropped' {
    for (let i = items.length - 1; i >= 0; i--) {
      this.items.unshift(items[i]);
    }
    return this.trim();
  }

  dequeueMany(max: number): T[] {
    const n = Math.max(0, Math.floor(max));
    if (n <= 0 || this.items.length === 0) return [];
    return this.items.splice(0, Math.min(n, this.items.length));
  }

  private trim(): 'ok' | 'dropped' {
    let dropped = false;
    while (this.items.length > this.maxSize) {
      this.items.shift();
      dropped = true;
    }
    return dropped ? 'dropped' : 'ok';
  }
}

