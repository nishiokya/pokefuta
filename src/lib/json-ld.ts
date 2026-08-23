/**
 * インライン `<script>` に埋めても安全な JSON にする。
 *
 * `JSON.stringify` は `</script>` を**素通しする**ので、そのまま
 * `dangerouslySetInnerHTML` に渡すと、値に `</script>` が含まれた時点で
 * HTML パーサが script を閉じ、以降が本文として解釈される。
 * 蓋のデータはポケモン公式サイトからのスクレイプなので、こちらで内容を保証できない。
 *
 * 図鑑側は同じ問題を pokefuta-tracker の `generate_manhole_pages.py` の
 * `_js_json()` で処理済み（`</` → `<\/`）。ここは `<` を丸ごと `<` にする。
 * JSON の文字列リテラルとしては同じ値のまま、生のテキストに `</` が現れなくなる。
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
