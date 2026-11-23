import test from 'node:test';
import assert from 'node:assert/strict';
import { memoizedSnapshot } from '../src/lib/memoized-snapshot';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('初回取得が応答しなくても時間切れでフォールバックでき、完了後はキャッシュを使う', async () => {
  const pending = deferred<number[] | null>();
  let calls = 0;
  const load = memoizedSnapshot(() => { calls++; return pending.promise; });
  // DBへ戻る呼び出し側と同じく、null のときだけ代替データを使う。
  const rows = (await load({ timeoutMs: 10 })) ?? [99];
  assert.deepEqual(rows, [99]);
  const second = load({ timeoutMs: 10 });
  pending.resolve([1]);
  assert.deepEqual(await second, [1]);
  assert.deepEqual(await load({ timeoutMs: 10 }), [1]);
  assert.equal(calls, 1, '時間切れ後も進行中の取得を共有する');
});

test('期限切れキャッシュの更新が遅いときは以前のデータを返す', async (t) => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const pending = deferred<number[] | null>();
  let calls = 0;
  const load = memoizedSnapshot(() => ++calls === 1 ? Promise.resolve([1]) : pending.promise);
  assert.deepEqual(await load(), [1]);
  now = 3_600_001;
  assert.deepEqual(await load({ timeoutMs: 10 }), [1]);
  const update = load();
  pending.resolve([2]);
  assert.deepEqual(await update, [2]);
  assert.deepEqual(await load(), [2]);
  assert.equal(calls, 2);
});

test('取得失敗は1分間覚え、期限後に再取得できる', async (t) => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  let calls = 0;
  const load = memoizedSnapshot<number>(async () => {
    if (++calls === 1) throw new Error('snapshot unavailable');
    return [2];
  });
  assert.equal(await load(), null);
  assert.equal(await load(), null);
  assert.equal(calls, 1);
  now = 60_001;
  assert.deepEqual(await load(), [2]);
  assert.equal(calls, 2);
});
