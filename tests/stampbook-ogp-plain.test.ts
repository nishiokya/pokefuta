import assert from 'node:assert/strict';
import { test } from 'node:test';

import { withoutEmoji } from '../src/app/users/[userId]/opengraph-image/StampbookOgpCard';
import { titleProgress } from '../src/components/users/title-progress';
import { REGULAR_TIER_MIN_MANHOLES } from '../src/lib/regular-badges';

// 絵文字なしの描き直し（絵文字 CDN が落ちたとき）で、注記に絵文字が残るとまた CDN を引いて落ちる。
const EMOJI = /\p{Extended_Pictographic}/u;

const noteText = (visited: number) => {
  const { note } = titleProgress(visited, 498);
  const last = note[note.length - 1];
  return typeof last === 'string' ? last : last.join('');
};

test('称号の注記は、絵文字を外すと絵文字が残らない', () => {
  const counts = [0, 1, ...Object.values(REGULAR_TIER_MIN_MANHOLES).flatMap((min) => [min - 1, min]), 498];
  let withEmoji = 0;
  for (const visited of counts) {
    const text = noteText(Math.max(visited, 0));
    if (EMOJI.test(text)) withEmoji += 1;
    assert.equal(EMOJI.test(withoutEmoji(text)), false, `visited=${visited}: ${text}`);
    assert.ok(withoutEmoji(text).length > 0, `visited=${visited}: 文字が残る`);
  }
  // 注記に絵文字が入らなくなったら、この試験は何も確かめていない
  assert.ok(withEmoji > 0, '絵文字入りの注記が1つも無い');
});
