import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_NEW_POKEFUTA_WANTED,
  STATIC_NEW_POKEFUTA_WANTED_URL,
  fetchNewPokefutaWanted,
  newPokefutaWantedLabel,
  parseNewPokefutaWanted,
} from '../src/lib/new-pokefuta-wanted';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

const SNAPSHOT = {
  total: 8,
  prefectures: [
    { prefecture: '群馬県', slug: 'gunma', count: 4, places: [{ city: '沼田市', place: '吹割の滝遊歩道入口' }] },
    { prefecture: '高知県', slug: 'kochi', count: 4, places: [] },
  ],
};

test('parses the tracker snapshot and recounts the total', () => {
  const wanted = parseNewPokefutaWanted({ ...SNAPSHOT, total: 999 });
  assert.equal(wanted.total, 8);
  assert.deepEqual(wanted.prefectures.map((p) => p.slug), ['gunma', 'kochi']);
  assert.equal(newPokefutaWantedLabel(wanted), '群馬・高知');
});

test('drops malformed rows and returns empty for bad payloads', () => {
  const wanted = parseNewPokefutaWanted({ prefectures: [{ prefecture: '', count: 1 }, { prefecture: '東京都', count: 0 }, { prefecture: '大阪府', count: 2 }] });
  assert.deepEqual(wanted, { total: 2, prefectures: [{ prefecture: '大阪府', slug: '', count: 2 }] });
  assert.equal(newPokefutaWantedLabel(wanted), '大阪');
  assert.deepEqual(parseNewPokefutaWanted(null), EMPTY_NEW_POKEFUTA_WANTED);
  assert.deepEqual(parseNewPokefutaWanted({ prefectures: 'x' }), EMPTY_NEW_POKEFUTA_WANTED);
});

test('fetches from data.pokefuta.com and hides the card when the fetch fails', async () => {
  let requested = '';
  const wanted = await fetchNewPokefutaWanted(async (url) => {
    requested = url;
    return ok(SNAPSHOT);
  });
  assert.equal(requested, STATIC_NEW_POKEFUTA_WANTED_URL);
  assert.equal(wanted.total, 8);
  assert.deepEqual(await fetchNewPokefutaWanted(async () => new Response('', { status: 404 })), EMPTY_NEW_POKEFUTA_WANTED);
  assert.deepEqual(await fetchNewPokefutaWanted(async () => { throw new Error('offline'); }), EMPTY_NEW_POKEFUTA_WANTED);
});
