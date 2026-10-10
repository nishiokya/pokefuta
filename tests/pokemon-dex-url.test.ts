import test from 'node:test';
import assert from 'node:assert/strict';
import { pokemonDexUrl } from '../src/lib/pokemonSlug.ts';

test('ポケモン名から図鑑のポケモンページへ', () => {
  assert.equal(pokemonDexUrl('ピカチュウ'), 'https://data.pokefuta.com/pokemon/pikachu/');
  assert.equal(pokemonDexUrl('アローラロコン'), 'https://data.pokefuta.com/pokemon/vulpix-alola/');
});

test('ひらがな混じりの表記もカタカナに寄せて引く', () => {
  assert.equal(pokemonDexUrl('ゴンべ'), 'https://data.pokefuta.com/pokemon/munchlax/');
});

test('載っていない名前・プロトタイプの名前は図鑑のポケモン一覧へ', () => {
  assert.equal(pokemonDexUrl('ミライドン'), 'https://data.pokefuta.com/pokemon/');
  assert.equal(pokemonDexUrl('toString'), 'https://data.pokefuta.com/pokemon/');
});
