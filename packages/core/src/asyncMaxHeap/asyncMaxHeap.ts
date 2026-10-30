type AsyncLessThan<T> = (a: T, b: T) => Promise<boolean>;

export class AsyncMaxHeap<T> {
  readonly #items: T[] = [];
  readonly #lessThan: AsyncLessThan<T>;

  constructor(lessThan: AsyncLessThan<T>) {
    this.#lessThan = lessThan;
  }

  get size(): number {
    return this.#items.length;
  }

  peek(): T | undefined {
    return this.#items[0];
  }

  async push(item: T): Promise<void> {
    const items = this.#items;
    const path: number[] = [];
    let index = items.length;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!(await this.#lessThan(items[parent] as T, item))) break;
      path.push(parent);
      index = parent;
    }

    let hole = items.length;
    items.push(item);
    for (const parent of path) {
      items[hole] = items[parent] as T;
      hole = parent;
    }
    items[hole] = item;
  }

  async pop(): Promise<T | undefined> {
    const items = this.#items;
    if (items.length <= 1) return items.pop();

    const top = items[0] as T;
    const lastIndex = items.length - 1;
    const last = items[lastIndex] as T;
    const path: number[] = [];
    let hole = 0;
    for (;;) {
      const left = 2 * hole + 1;
      if (left >= lastIndex) break;
      const right = left + 1;
      let child = left;
      if (right < lastIndex && (await this.#lessThan(items[left] as T, items[right] as T))) {
        child = right;
      }
      if (!(await this.#lessThan(last, items[child] as T))) break;
      path.push(child);
      hole = child;
    }

    items.pop();
    hole = 0;
    for (const child of path) {
      items[hole] = items[child] as T;
      hole = child;
    }
    items[hole] = last;
    return top;
  }
}
