import assert from "node:assert/strict";
import { test } from "node:test";
import { AsyncMaxHeap } from "../../src/asyncMaxHeap/asyncMaxHeap.js";

const numericLessThan = async (a: number, b: number) => a < b;

async function drain(heap: AsyncMaxHeap<number>): Promise<number[]> {
  const out: number[] = [];
  for (let item = await heap.pop(); item !== undefined; item = await heap.pop()) out.push(item);
  return out;
}

test("pops items from largest to smallest", async () => {
  const values = [5, 3, 9, 1, 7, 2, 8, 6, 4, 0];
  const heap = new AsyncMaxHeap(numericLessThan);
  for (const value of values) await heap.push(value);

  assert.equal(heap.size, values.length);
  assert.equal(heap.peek(), 9);
  assert.deepEqual(await drain(heap), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(await heap.pop(), undefined);
});

test("a rejected comparison leaves the heap unchanged", async () => {
  let failNext = false;
  const heap = new AsyncMaxHeap(async (a: number, b: number) => {
    if (failNext) throw new Error("judge failed");
    return a < b;
  });
  for (const value of [4, 2, 6, 1, 3]) await heap.push(value);

  failNext = true;
  await assert.rejects(heap.push(10), /judge failed/);
  await assert.rejects(heap.pop(), /judge failed/);
  failNext = false;

  assert.equal(heap.size, 5);
  assert.deepEqual(await drain(heap), [6, 4, 3, 2, 1]);
});
