import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_TAG_HELP, LID_ZOOM_MAX, avatarCropSquare, hasPlushClip, photoAiTags, photoBoxZoom, photoLidZoom, photoObjectPosition } from '../src/lib/photo-ai-tags';

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
  assert.match(AI_TAG_HELP, /ぬいぐるみ・風景.*のタグは AI/);
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

test('ぬいぐるみの特集: 1つの枠を正方形いっぱいに切り抜く', () => {
  // 正方形の写真、枠 0.2〜0.6（一辺 0.4）× 1 → 2.5 倍、枠の左上が正方形の左上
  assert.deepEqual(photoBoxZoom({ crop: [0, 0, 1, 1] }, [0.2, 0.2, 0.6, 0.6], 1), {
    position: 'absolute', width: '250%', height: '250%', left: '-50%', top: '-50%', maxWidth: 'none',
  });
});

test('ぬいぐるみの特集: 切り抜きは写真の外を見せず、短辺より大きくせず、最大倍率まで', () => {
  // 写真の右下の隅の枠 → 写真の内側にずらす（右端・下端で止まる）
  const corner = photoBoxZoom({ crop: [0, 0, 1, 1] }, [0.8, 0.8, 1, 1], 1, 10);
  assert.deepEqual([corner?.left, corner?.top], ['-400%', '-400%']);
  // 写真より大きい枠 → 短辺の正方形（拡大しない）
  assert.equal(photoBoxZoom({ crop: [0.25, 0, 0.75, 1] }, [0, 0, 1, 1], 1.2)?.height, '100%');
  // 小さい枠は LID_ZOOM_MAX 倍まで
  assert.equal(photoBoxZoom({ crop: [0, 0, 1, 1] }, [0.5, 0.5, 0.51, 0.51])?.width, `${LID_ZOOM_MAX * 100}%`);
  // crop が無いと縦横比が分からないので切り抜かない
  assert.equal(photoBoxZoom({}, [0.2, 0.2, 0.6, 0.6]), undefined);
});

test('ぬいぐるみの特集: 蓋とぬいぐるみの枠と crop がそろった写真だけ切り抜ける', () => {
  assert.equal(hasPlushClip({ crop: [0, 0, 1, 1], lid: [0.1, 0.1, 0.5, 0.5], plush_box: [0.5, 0.5, 0.9, 0.9] }), true);
  assert.equal(hasPlushClip({ crop: [0, 0, 1, 1], lid: [0.1, 0.1, 0.5, 0.5] }), false);
  assert.equal(hasPlushClip({ crop: [0, 0, 1, 1], plush_box: [0.5, 0.5, 0.9, 0.9] }), false);
  assert.equal(hasPlushClip({ lid: [0.1, 0.1, 0.5, 0.5], plush_box: [0.5, 0.5, 0.9, 0.9] }), false);
  assert.equal(hasPlushClip(null), false);
});

test('avatarCropSquare: 蓋の枠の長辺 × 1.04 の正方形を蓋の中心に合わせる', () => {
  // 300×400 の縦長写真、蓋は (0.2〜0.8, 0.3〜0.75) → 幅 180px・高さ 180px
  const sq = avatarCropSquare({ lid: [0.2, 0.3, 0.8, 0.75], crop: [0, 0.1, 1, 0.85] }, 300, 400);
  assert.deepEqual(sq, { left: 57, top: 117, width: 187, height: 187 });
});

test('avatarCropSquare: 端の蓋は写真の内側にずらし、短辺を超えない', () => {
  const sq = avatarCropSquare({ lid: [0, 0, 0.99, 0.6] }, 300, 400);
  assert.deepEqual(sq, { left: 0, top: 0, width: 300, height: 300 });
});

test('avatarCropSquare: 小さい蓋は短辺の 1/3 までしか拡大しない', () => {
  const sq = avatarCropSquare({ lid: [0.45, 0.45, 0.55, 0.55] }, 300, 300);
  assert.deepEqual(sq, { left: 100, top: 100, width: 100, height: 100 });
});

test('avatarCropSquare: lid が無ければ crop、それも無ければ真ん中の正方形', () => {
  assert.deepEqual(avatarCropSquare({ crop: [0, 0.25, 1, 1] }, 300, 400), { left: 0, top: 100, width: 300, height: 300 });
  assert.deepEqual(avatarCropSquare(null, 300, 400), { left: 0, top: 50, width: 300, height: 300 });
  assert.deepEqual(avatarCropSquare({ lid: [0.5, 0.5, 0.4, 0.6] }, 400, 300), { left: 50, top: 0, width: 300, height: 300 });
});

test('avatarCropSquare: 正方形から大きく外れた蓋の枠（90° 回った向きで採点した跡）は lid も crop も使わず真ん中', () => {
  // 300×400 の写真で、横長の写真なら正方形だった枠（縦/横 ≈ 1.78）
  const tags = { lid: [0.1564, 0.0359, 0.7703, 0.8549], crop: [0, 0.0704, 1, 0.8204] };
  assert.deepEqual(avatarCropSquare(tags, 300, 400), { left: 0, top: 50, width: 300, height: 300 });
});


test('追加属性は true のときだけ表示し、未採用の属性は表示しない', () => {
  assert.deepEqual(labels({ ai_tags: { person: true, snow: true, autumn: true, feet: true } }),
    ['人物', '雪', '紅葉', '足元']);
  assert.deepEqual(labels({ ai_tags: { person: 'true', snow: 0.9, autumn: null, feet: false,
    rain: true, shadow: true, glare: true, cut: true, sakura: true } }), []);
  assert.ok(photoAiTags({ ai_tags: { person: true, snow: true, autumn: true, feet: true } }).every(t => t.ai));
});
