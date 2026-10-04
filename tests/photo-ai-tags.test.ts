import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_TAG_HELP, LID_ZOOM_MAX, photoAiTags, photoLidZoom, photoObjectPosition } from '../src/lib/photo-ai-tags';

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

test('注釈は夜を AI の判定と言わない', () => {
  assert.match(AI_TAG_HELP, /ぬいぐるみ・風景のタグは AI/);
  assert.match(AI_TAG_HELP, /夜のタグは撮影時刻と場所から/);
});

test('夜だけは AI の印を付けない（撮影時刻と場所から決まる）', () => {
  const tags = photoAiTags({ ai_tags: { plush: true, night: true, scene: 'landscape' } });
  assert.deepEqual(tags.map((t) => [t.label, t.ai]), [['ぬいぐるみ', true], ['夜', false], ['風景', true]]);
});

test('投稿者が「周辺の風景」を選んだ写真には AI の風景を重ねない', () => {
  assert.deepEqual(labels({ ai_tags: { scene: 'landscape' }, is_landscape: true }), []);
  assert.deepEqual(labels({ ai_tags: { scene: 'landscape', night: true }, is_landscape: true }), ['夜']);
});

test('photoObjectPosition turns the k11 crop into an object-position for a square cover', () => {
  // 横長 4:3（正方形の幅 0.75）。左端に寄せた正方形 → 0%、右端 → 100%、真ん中 → 指定なし
  assert.equal(photoObjectPosition({ crop: [0, 0, 0.75, 1] }), '0% 50%');
  assert.equal(photoObjectPosition({ crop: [0.25, 0, 1, 1] }), '100% 50%');
  assert.equal(photoObjectPosition({ crop: [0.125, 0, 0.875, 1] }), undefined);
  assert.equal(photoObjectPosition({ crop: [0.05, 0, 0.8, 1] }), '20% 50%');
  // 縦長 3:4
  assert.equal(photoObjectPosition({ crop: [0, 0.2, 1, 0.95] }), '50% 80%');
});

test('photoObjectPosition ignores missing or malformed crops', () => {
  assert.equal(photoObjectPosition(null), undefined);
  assert.equal(photoObjectPosition({ scene: 'centered_clean' }), undefined);
  assert.equal(photoObjectPosition({ crop: [0, 0, 1] }), undefined);
  assert.equal(photoObjectPosition({ crop: [0.5, 0, 0.5, 1] }), undefined);
  assert.equal(photoObjectPosition({ crop: ['0', 0, 0.75, 1] }), undefined);
  assert.equal(photoObjectPosition({ crop: [0, 0, 1.5, 1] }), undefined);
});

test('photoLidZoom fills the stamp with the lid', () => {
  // 正方形の写真（crop が全体）、蓋が真ん中で幅・高さ 0.5 → 枠の一辺は 0.52、写真は 1/0.52 ≒ 192.3% に拡大
  const z = photoLidZoom({ crop: [0, 0, 1, 1], lid: [0.25, 0.25, 0.75, 0.75] });
  assert.deepEqual(z, { position: 'absolute', width: '192.3%', height: '192.3%', left: '-46.2%', top: '-46.2%', maxWidth: 'none' });
});

test('photoLidZoom keeps the aspect ratio of a portrait photo and centres the lid', () => {
  // 縦長 3:4（幅 1・高さ 4/3）。crop は短辺の正方形 = 高さ 0.75
  const z = photoLidZoom({ crop: [0, 0.1, 1, 0.85], lid: [0.1, 0.3, 0.9, 0.9] })!;
  // 蓋の枠: 幅 0.8、高さ 0.6 × 4/3 = 0.8 → 一辺 0.832
  assert.equal(z.width, '120.2%');
  assert.equal(z.height, '160.3%');
  assert.equal(z.left, '-10.1%');
  // 蓋の中心 y = 0.6 × 4/3 = 0.8 → 0.5 − 0.8 / 0.832
  assert.equal(z.top, '-46.2%');
});

test('photoLidZoom does not zoom tiny lids beyond LID_ZOOM_MAX', () => {
  const z = photoLidZoom({ crop: [0, 0, 1, 1], lid: [0.45, 0.45, 0.5, 0.5] })!;
  assert.equal(z.width, `${Math.round((LID_ZOOM_MAX) * 1000) / 10}%`);
});

test('photoLidZoom needs both lid and crop', () => {
  assert.equal(photoLidZoom({ crop: [0, 0, 1, 1] }), undefined);
  assert.equal(photoLidZoom({ lid: [0.2, 0.2, 0.8, 0.8] }), undefined);
  assert.equal(photoLidZoom({ crop: [0, 0, 1, 1], lid: [0.8, 0.2, 0.2, 0.8] }), undefined);
  assert.equal(photoLidZoom(null), undefined);
});
