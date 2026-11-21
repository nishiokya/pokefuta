import { unstable_cache } from 'next/cache';
import { fetchTaggedPhotos, type PlushPhoto } from './plush-photos';

/**
 * 特集ページ（/photos/plush・/photos/snow）が読む写真。結果をサーバ側に10分持つ。
 *
 * 以前はページを ISR（revalidate = 600）にしていたが、ビルドのときに DB から取れず 0 枚のまま
 * 焼き込まれ、Amplify 上では画面遷移用のデータ（RSC）がそのまま作り直されなかった。
 * トップの特集カードから移動すると「0 枚」、再読み込みすると正しい枚数、という状態になった（2026-11-22）。
 *
 * そこでページはリクエストごとに組み立て、DB への問い合わせだけをここで10分持つ。
 * fetchTaggedPhotos は失敗すると例外を投げるので、失敗はキャッシュされない（次のリクエストで取り直す）。
 */
export const loadTaggedPhotosForPage: (
  tag: 'plush' | 'snow',
  limit: number,
  order: 'score' | 'recent',
  interleave: boolean,
) => Promise<PlushPhoto[]> = unstable_cache(
  (tag: 'plush' | 'snow', limit: number, order: 'score' | 'recent', interleave: boolean) =>
    fetchTaggedPhotos(tag, limit, order, interleave),
  ['tagged-photos-page-v1'],
  { revalidate: 600 },
);
