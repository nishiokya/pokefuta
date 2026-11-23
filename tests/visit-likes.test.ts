import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VISIT_LIKES_PER_REQUEST,
  loadVisitLikeState,
  parseVisitIds,
  setVisitLikesFetcherForTest,
} from '../src/lib/visit-likes.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('ids は uuid だけを小文字・重複なしで読む', () => {
  assert.deepEqual(parseVisitIds(null), []);
  assert.deepEqual(
    parseVisitIds(`${uuid(1).toUpperCase()}, ${uuid(1)},not-a-uuid,,${uuid(2)}`),
    [uuid(1), uuid(2)]
  );
});

test('同じ描画の間の依頼は1回のリクエストにまとめ、上限ごとに分ける', async () => {
  const urls: string[] = [];
  setVisitLikesFetcherForTest(async (url) => {
    urls.push(url);
    const ids = decodeURIComponent(url.split('ids=')[1]).split(',');
    const likes = Object.fromEntries(ids.map((id) => [id, { likes: 2, userLiked: id === uuid(1) }]));
    return new Response(JSON.stringify({ success: true, likes }), { status: 200 });
  });
  try {
    const count = MAX_VISIT_LIKES_PER_REQUEST + 1;
    const states = await Promise.all(Array.from({ length: count }, (_, i) => loadVisitLikeState(uuid(i + 1))));
    assert.equal(urls.length, 2);
    assert.deepEqual(states[0], { likes: 2, userLiked: true });
    assert.deepEqual(states[1], { likes: 2, userLiked: false });
  } finally {
    setVisitLikesFetcherForTest(null);
  }
});

test('返ってこなかった訪問と失敗は null', async () => {
  setVisitLikesFetcherForTest(async () => new Response(JSON.stringify({ success: true, likes: {} }), { status: 200 }));
  try {
    assert.equal(await loadVisitLikeState(uuid(9)), null);
  } finally {
    setVisitLikesFetcherForTest(null);
  }
  setVisitLikesFetcherForTest(async () => {
    throw new Error('network');
  });
  try {
    assert.equal(await loadVisitLikeState(uuid(9)), null);
  } finally {
    setVisitLikesFetcherForTest(null);
  }
});
