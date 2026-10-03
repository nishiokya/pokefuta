import assert from 'node:assert/strict';
import test from 'node:test';
import { photoAiTags } from '../src/lib/photo-ai-tags';

const labels = (photo: Parameters<typeof photoAiTags>[0]) => photoAiTags(photo).map((t) => t.label);

test('ai_tags が無い・形が違うときはタグを出さない', () => {
  assert.deepEqual(labels({}), []);
  assert.deepEqual(labels({ ai_tags: null }), []);
  assert.deepEqual(labels({ ai_tags: [] }), []);
  assert.deepEqual(labels({ ai_tags: 'plush' }), []);
});

test('ぬいぐるみ・夜・風景を出す', () => {
  assert.deepEqual(
    labels({ ai_tags: { model: 'scene_attrs/1', scene: 'landscape', plush: true, plush_score: 0.9, night: true } }),
    ['ぬいぐるみ', '夜', '風景'],
  );
});

test('真偽が true のときだけ出す（文字列や確率だけでは出さない）', () => {
  assert.deepEqual(labels({ ai_tags: { plush: 'true', plush_score: 0.99, night: null } }), []);
});

test('周辺（wide_context）と看板（signage_info）はタグにしない', () => {
  assert.deepEqual(labels({ ai_tags: { scene: 'wide_context' } }), []);
  assert.deepEqual(labels({ ai_tags: { scene: 'signage_info' } }), []);
});

test('投稿者が「周辺の風景」を選んだ写真には AI の風景を重ねない', () => {
  assert.deepEqual(labels({ ai_tags: { scene: 'landscape' }, is_landscape: true }), []);
  assert.deepEqual(labels({ ai_tags: { scene: 'landscape', night: true }, is_landscape: true }), ['夜']);
});
