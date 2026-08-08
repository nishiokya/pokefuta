import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestGenerationGuard } from '../src/lib/latest-generation.ts';

test('UI race: 古い写真の非同期結果は新しい写真を上書きしない', async () => {
  const guard = createLatestGenerationGuard();
  const applied: string[] = [];

  const firstGeneration = guard.begin();
  const first = Promise.resolve().then(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    if (guard.isCurrent(firstGeneration)) applied.push('old-photo');
  });

  const secondGeneration = guard.begin();
  const second = Promise.resolve().then(() => {
    if (guard.isCurrent(secondGeneration)) applied.push('new-photo');
  });

  await Promise.all([first, second]);

  assert.deepEqual(applied, ['new-photo']);
  assert.equal(guard.isCurrent(firstGeneration), false);
  assert.equal(guard.isCurrent(secondGeneration), true);
});

test('UI race: finallyも現在世代だけがEXIF確認中を解除できる', () => {
  const guard = createLatestGenerationGuard();
  const oldGeneration = guard.begin();
  const currentGeneration = guard.begin();

  assert.equal(guard.isCurrent(oldGeneration), false);
  assert.equal(guard.isCurrent(currentGeneration), true);
});
