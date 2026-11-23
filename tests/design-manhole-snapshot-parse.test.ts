import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDesignManholeNdjson } from '../src/lib/design-manhole-snapshot-parse.ts';

const row = (over: Record<string, unknown>) =>
  JSON.stringify({
    id: 'pokefuta-design:f3a89eb2-6b75-49e5-8d29-f48a8877c8ef',
    title: '名城公園の蓋',
    lat: 35.19,
    lng: 136.9,
    status: 'active',
    source: 'pokefuta.com',
    ...over,
  });

test('写真館の投稿の行を、接頭辞を外した id と緯度経度で読む', () => {
  const rows = parseDesignManholeNdjson(`${row({})}\n`);
  assert.deepEqual(rows, [
    {
      id: 'f3a89eb2-6b75-49e5-8d29-f48a8877c8ef',
      title: '名城公園の蓋',
      latitude: 35.19,
      longitude: 136.9,
    },
  ]);
});

test('写真館以外・active でない・位置の無い・壊れた行は捨てる', () => {
  const text = [
    row({ id: 'gmanhole:123' }),
    row({ status: 'hidden' }),
    row({ lat: null }),
    row({ lng: '136.9' }),
    '{not json',
    '',
    row({ id: 'pokefuta-design:aaaa', title: null }),
  ].join('\n');
  assert.deepEqual(parseDesignManholeNdjson(text), [
    { id: 'aaaa', title: null, latitude: 35.19, longitude: 136.9 },
  ]);
});
