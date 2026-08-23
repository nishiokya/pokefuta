import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeJsonLd } from '../src/lib/json-ld.ts';

test('生の出力に "</script>" を残さない', () => {
  // 蓋のデータはポケモン公式サイトからのスクレイプなので、こちらで内容を保証できない。
  // JSON.stringify だけだと `</script>` がそのまま出て、インライン script を抜けられる。
  const out = serializeJsonLd({ name: 'ポケふた</script><img src=x onerror=alert(1)>' });
  assert.ok(!out.includes('</script>'));
  assert.ok(!out.includes('<'));
  assert.ok(out.includes('\\u003c'));
});

test('エスケープしても JSON の値は変わらない', () => {
  const value = {
    '@type': 'TouristAttraction',
    name: '宮城県大河原のポケふた（チェリム・ラプラス）',
    url: 'https://pokefuta.com/manhole/128',
    weird: 'a<b</script>c',
    geo: { latitude: 38.0485032, longitude: 140.738089 },
  };
  assert.deepEqual(JSON.parse(serializeJsonLd(value)), value);
});

test('エスケープが必要ない値はそのまま', () => {
  assert.equal(serializeJsonLd({ a: 1 }), '{"a":1}');
});
