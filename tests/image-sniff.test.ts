import assert from 'node:assert/strict';
import test from 'node:test';
import { sniffImageFormat } from '../src/lib/image-sniff';

const bytes = (...xs: number[]) => new Uint8Array(xs);
const ascii = (s: string) => new TextEncoder().encode(s);

test('JPEG / PNG / WebP are recognized by their magic bytes', () => {
  assert.equal(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00)), 'jpeg');
  assert.equal(sniffImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)), 'png');
  assert.equal(sniffImageFormat(ascii('RIFF\x10\x00\x00\x00WEBPVP8 ')), 'webp');
  // ArrayBuffer でも同じ
  assert.equal(sniffImageFormat(bytes(0xff, 0xd8, 0xff, 0xdb).buffer), 'jpeg');
});

test('formats whose sharp loaders had RCE advisories are rejected even if labelled image/jpeg', () => {
  // AVIF / HEIC（ISO BMFF: ????ftypavif / ftypheic）→ libheif
  assert.equal(sniffImageFormat(ascii('\x00\x00\x00\x1cftypavif')), null);
  assert.equal(sniffImageFormat(ascii('\x00\x00\x00\x18ftypheic')), null);
  // SVG → librsvg
  assert.equal(sniffImageFormat(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(sniffImageFormat(ascii('<?xml version="1.0"?><svg/>')), null);
  // GIF / TIFF → libvips のローダ
  assert.equal(sniffImageFormat(ascii('GIF89a')), null);
  assert.equal(sniffImageFormat(bytes(0x49, 0x49, 0x2a, 0x00)), null);
  // RIFF だが WebP でない（WAV など）
  assert.equal(sniffImageFormat(ascii('RIFF\x10\x00\x00\x00WAVEfmt ')), null);
});

test('short or empty input is rejected', () => {
  assert.equal(sniffImageFormat(new Uint8Array(0)), null);
  assert.equal(sniffImageFormat(bytes(0xff, 0xd8)), null);
});

test('real encoder output: JPEG/PNG/WebP pass, AVIF/GIF/TIFF are rejected', async () => {
  const sharp = (await import('sharp')).default;
  const base = sharp({ create: { width: 4, height: 4, channels: 3, background: '#7B63A8' } });
  assert.equal(sniffImageFormat(await base.clone().jpeg().toBuffer()), 'jpeg');
  assert.equal(sniffImageFormat(await base.clone().png().toBuffer()), 'png');
  assert.equal(sniffImageFormat(await base.clone().webp().toBuffer()), 'webp');
  assert.equal(sniffImageFormat(await base.clone().avif().toBuffer()), null);
  assert.equal(sniffImageFormat(await base.clone().gif().toBuffer()), null);
  assert.equal(sniffImageFormat(await base.clone().tiff().toBuffer()), null);
});
