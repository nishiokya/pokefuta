import assert from 'node:assert/strict';
import test from 'node:test';
import { TOP_FEATURE_STORAGE_KEY, otherFeature, pickRotatingFeature } from '../src/lib/top-feature-rotation';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    data,
  };
}

test('前回と違う方を選び、今回の分を覚える', () => {
  const s = memoryStorage({ [TOP_FEATURE_STORAGE_KEY]: 'snow' });
  assert.equal(pickRotatingFeature(s), 'plush');
  assert.equal(s.data.get(TOP_FEATURE_STORAGE_KEY), 'plush');
  assert.equal(pickRotatingFeature(s), 'snow');
  assert.equal(pickRotatingFeature(s), 'plush');
});

test('初めての人はランダムで選ぶ', () => {
  assert.equal(pickRotatingFeature(memoryStorage(), () => 0.1), 'snow');
  assert.equal(pickRotatingFeature(memoryStorage(), () => 0.9), 'plush');
});

test('知らない値が入っていたらランダムで選び直す', () => {
  assert.equal(pickRotatingFeature(memoryStorage({ [TOP_FEATURE_STORAGE_KEY]: 'x' }), () => 0.9), 'plush');
});

test('storage が使えなくても落ちない', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  assert.equal(pickRotatingFeature(broken, () => 0.1), 'snow');
  assert.equal(pickRotatingFeature(null, () => 0.9), 'plush');
});

test('otherFeature', () => {
  assert.equal(otherFeature('snow'), 'plush');
  assert.equal(otherFeature('plush'), 'snow');
});
