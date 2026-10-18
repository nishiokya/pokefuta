import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyTopics, formatGap, type TopicManhole, type TopicPhoto } from '../src/lib/monthly-topics';

const manholes: TopicManhole[] = [
  { id: 1, prefecture: '長崎県', municipality: '壱岐' },
  { id: 2, prefecture: '山口県', municipality: '下関' },
  { id: 3, prefecture: '山口県', municipality: '下関' },
  { id: 4, prefecture: '石川県', municipality: '輪島' },
  { id: 5, prefecture: '石川県', municipality: '穴水' },
  { id: 6, prefecture: '岩手県', municipality: '盛岡' },
];

const photo = (manholeId: number, takenAt: string, posterKey = 'a'): TopicPhoto => ({ manholeId, takenAt, posterKey });
const NOW = new Date('2026-10-18T03:00:00Z');

test('初めての写真・久しぶり・にぎわう県を拾う', () => {
  const photos = [
    photo(1, '2026-10-05T01:00:00Z'),
    photo(2, '2025-07-01T01:00:00Z'), photo(2, '2026-10-10T01:00:00Z'),
    photo(3, '2025-08-01T01:00:00Z'), photo(3, '2026-10-10T02:00:00Z'),
    photo(6, '2026-09-01T01:00:00Z'), photo(6, '2026-10-01T01:00:00Z'),
    photo(4, '2026-01-01T01:00:00Z'), photo(5, '2026-02-01T01:00:00Z'),
    photo(4, '2026-10-02T01:00:00Z', 'a'), photo(4, '2026-10-03T01:00:00Z', 'b'),
    photo(5, '2026-10-04T01:00:00Z', 'c'), photo(5, '2026-10-04T02:00:00Z', 'c'),
  ];
  const result = buildMonthlyTopics(photos, manholes, NOW);
  assert.equal(result?.month, 10);
  assert.deepEqual(result?.topics, [
    { kind: 'first', place: '長崎県壱岐', manholeIds: [1], count: 1 },
    { kind: 'comeback', place: '山口県下関', manholeIds: [2, 3], days: 466 },
    { kind: 'busy', prefecture: '石川県', manholeIds: [4, 5], lids: 2, photos: 4 },
  ]);
});

test('撮った人が少ない県はにぎわいと言わない（1人の大量投稿）', () => {
  const photos = [4, 4, 4, 4, 5, 5].map((id, i) => photo(id, `2026-10-0${i + 1}T01:00:00Z`, 'a'));
  const result = buildMonthlyTopics([...photos, photo(1, '2026-09-01T00:00:00Z')], manholes, NOW);
  assert.ok(!result?.topics.some((t) => t.kind === 'busy'));
});

test('今月の話題が足りなければ先月に切り替え、月の境目は JST で切る', () => {
  const photos = [
    photo(1, '2026-09-30T15:30:00Z'), // JST 10/1 0:30 → 10月
    photo(2, '2025-01-01T00:00:00Z'), photo(2, '2026-09-15T00:00:00Z'),
  ];
  const result = buildMonthlyTopics(photos, manholes, NOW);
  // 10月は first だけ（1つ）なので9月へ。9月は下関の comeback
  assert.equal(result?.month, 9);
  assert.deepEqual(result?.topics.map((t) => t.kind), ['comeback']);
  assert.equal(buildMonthlyTopics([], manholes, NOW), null);
});

test('間隔の言い方', () => {
  assert.equal(formatGap(436), '1年2か月');
  assert.equal(formatGap(370), '1年');
  assert.equal(formatGap(200), '6か月');
});
