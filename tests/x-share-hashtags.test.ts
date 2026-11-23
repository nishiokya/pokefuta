import assert from 'node:assert/strict';
import test from 'node:test';
import { buildXShareUrl } from '../src/lib/share';

const hashtagsOf = (url: string) => new URL(url).searchParams.get('hashtags')?.split(',') ?? [];

test('X のシェアには既定タグとサイト名のタグ（ポケふた写真館）が付く', () => {
  const tags = hashtagsOf(buildXShareUrl('本文', 'https://pokefuta.com/users/x', ['ポケふたスタンプ帳']));
  assert.deepEqual(tags, ['ポケふたスタンプ帳', 'ポケふた', 'ポケモンマンホール', 'ポケふた写真館']);
});

test('既定タグを外す文脈（デザインマンホール）でもサイト名のタグは付く', () => {
  const tags = hashtagsOf(buildXShareUrl('本文', 'https://pokefuta.com/design-manholes/1', ['デザインマンホール'], { includeDefaultHashtags: false }));
  assert.deepEqual(tags, ['デザインマンホール', 'ポケふた写真館']);
});

test('呼び出し側が同じタグを渡しても重複させない', () => {
  const tags = hashtagsOf(buildXShareUrl('本文', 'https://pokefuta.com/', ['#ポケふた写真館', 'ポケふた']));
  assert.deepEqual(tags, ['ポケふた写真館', 'ポケふた', 'ポケモンマンホール']);
});
