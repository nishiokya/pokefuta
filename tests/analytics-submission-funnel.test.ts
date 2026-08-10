import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBMISSION_BLOCK_REASONS,
  SUBMISSION_FUNNEL_EVENTS,
  pokefutaEvents,
  trackEvent,
} from '../src/lib/analytics/gtag.ts';
import { classifySubmissionError } from '../src/lib/api-error-code.ts';

/**
 * GA4 は本番ホストでしか送らない（gtag.ts の ANALYTICS_HOSTS）。
 * isGtagAvailable() は window.location.hostname と window.gtag しか見ないので、
 * その2つを差し替えれば送信内容をそのまま検証できる。
 */
type SentEvent = { name: string; params: Record<string, unknown> };

function withStubbedGtag(hostname: string, run: () => void): SentEvent[] {
  const sent: SentEvent[] = [];
  // Node 20 の globalThis.navigator は getter のみなので defineProperty で差し替える
  const stubbed: Array<[string, PropertyDescriptor | undefined]> = [];
  const stub = (key: string, value: unknown) => {
    stubbed.push([key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  };

  stub('window', {
    location: { hostname, pathname: '/upload' },
    gtag: (kind: string, name: string, params: Record<string, unknown>) => {
      if (kind === 'event') sent.push({ name, params });
    },
  });
  stub('navigator', { language: 'ja-JP' });
  stub('document', { title: 'テスト' });

  try {
    run();
  } finally {
    for (const [key, descriptor] of stubbed.reverse()) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
  return sent;
}

const onProduction = (run: () => void) => withStubbedGtag('pokefuta.com', run);

test('ファネル: 台帳の全ステップに送信ヘルパーがあり、そのイベント名で送られる', () => {
  const senders: Record<(typeof SUBMISSION_FUNNEL_EVENTS)[number], () => void> = {
    p_submission_entry: () =>
      pokefutaEvents.submissionEntry({ submission_kind: 'character', surface: 'header' }),
    p_submission_start: () => pokefutaEvents.submissionStart({ submission_kind: 'character' }),
    p_submission_photo_selected: () =>
      pokefutaEvents.submissionPhotoSelected({
        submission_kind: 'character',
        photo_source: 'camera',
        has_gps: true,
      }),
    p_submission_blocked: () =>
      pokefutaEvents.submissionBlocked({ submission_kind: 'character', block_reason: 'invalid_gps' }),
    p_photo_upload_start: () => pokefutaEvents.photoUploadStart({ submission_kind: 'character' }),
    p_photo_upload_complete: () => pokefutaEvents.photoUploadComplete({ submission_kind: 'character' }),
    p_submission_failed: () =>
      pokefutaEvents.submissionFailed({ submission_kind: 'character', stage: 'persist' }),
    p_submission_abandoned: () =>
      pokefutaEvents.submissionAbandoned({
        submission_kind: 'character',
        last_step: 'photo_selected',
        dwell_ms: 1234,
      }),
  };

  for (const eventName of SUBMISSION_FUNNEL_EVENTS) {
    const sent = onProduction(senders[eventName]);
    assert.equal(sent.length, 1, `${eventName} が1件だけ送られること`);
    assert.equal(sent[0].name, eventName);
  }
});

test('ファネル: submission_kind が両系統で必ず載る', () => {
  for (const kind of ['character', 'design'] as const) {
    const sent = onProduction(() => {
      pokefutaEvents.submissionStart({ submission_kind: kind });
      pokefutaEvents.photoUploadComplete({ submission_kind: kind, review_status: 'published' });
    });
    assert.equal(sent.length, 2);
    for (const event of sent) {
      assert.equal(event.params.submission_kind, kind);
    }
  }
});

test('ファネル: block_reason の全値を送れる', () => {
  const sent = onProduction(() => {
    for (const reason of SUBMISSION_BLOCK_REASONS) {
      pokefutaEvents.submissionBlocked({ submission_kind: 'design', block_reason: reason });
    }
  });
  assert.deepEqual(
    sent.map((event) => event.params.block_reason),
    [...SUBMISSION_BLOCK_REASONS]
  );
});

test('ファネル: 失敗イベントに stage / status_code / error_code が載る', () => {
  const [sent] = onProduction(() =>
    pokefutaEvents.submissionFailed({
      submission_kind: 'design',
      stage: 'persist',
      status_code: 500,
      error_code: 'DB_SCHEMA_MISMATCH',
    })
  );
  assert.equal(sent.params.stage, 'persist');
  assert.equal(sent.params.status_code, 500);
  assert.equal(sent.params.error_code, 'DB_SCHEMA_MISMATCH');
});

test('ファネル: 写真の入力手段（撮影 / 選択）が載る', () => {
  const sent = onProduction(() => {
    pokefutaEvents.submissionPhotoSelected({
      submission_kind: 'character',
      photo_source: 'camera',
      has_gps: true,
    });
    pokefutaEvents.submissionPhotoSelected({
      submission_kind: 'character',
      photo_source: 'library',
      has_gps: false,
    });
  });
  assert.deepEqual(
    sent.map((event) => event.params.photo_source),
    ['camera', 'library']
  );
  assert.deepEqual(
    sent.map((event) => event.params.has_gps),
    [true, false]
  );
});

test('本番ホスト以外では送信しない', () => {
  for (const hostname of ['localhost', '127.0.0.1', 'preview.example.com']) {
    const sent = withStubbedGtag(hostname, () =>
      pokefutaEvents.submissionStart({ submission_kind: 'character' })
    );
    assert.equal(sent.length, 0, `${hostname} からは送らないこと`);
  }
});

test('trackEvent は GA4 予約語 source をイベント引数に使っていない', () => {
  const [sent] = onProduction(() => trackEvent('p_submission_start', { submission_kind: 'design' }));
  assert.equal(Object.prototype.hasOwnProperty.call(sent.params, 'source'), false);
});

/**
 * 2026-08-09 の事故の再現。マイグレーション未適用の INSERT は PostgREST が
 * PGRST204 を返す。これが DB_SCHEMA_MISMATCH として GA4 に届けば、
 * 「投稿に失敗しました」という汎用文言しか出ない状態でも原因が分かる。
 */
test('エラー分類: PGRST204 はスキーマのズレとして分類される', () => {
  assert.equal(classifySubmissionError({ code: 'PGRST204' }), 'DB_SCHEMA_MISMATCH');
  assert.equal(classifySubmissionError({ code: '42703' }), 'DB_SCHEMA_MISMATCH');
  // テーブルごと未適用なら PGRST205。列の欠落と同じ事故クラスなので同じ分類にする
  assert.equal(classifySubmissionError({ code: 'PGRST205' }), 'DB_SCHEMA_MISMATCH');
  assert.equal(classifySubmissionError({ code: 'PGRST202' }), 'DB_SCHEMA_MISMATCH');
  assert.equal(classifySubmissionError({ code: '42P01' }), 'DB_SCHEMA_MISMATCH');
  // route.ts は PostgrestError を Error の cause に入れて投げ直す
  assert.equal(
    classifySubmissionError(new Error('column does not exist', { cause: { code: 'PGRST204' } })),
    'DB_SCHEMA_MISMATCH'
  );
});

test('エラー分類: 42501 は権限として、スキーマのズレと切り分ける', () => {
  assert.equal(classifySubmissionError({ code: '42501' }), 'DB_PERMISSION_DENIED');
  assert.notEqual(classifySubmissionError({ code: '42501' }), 'DB_SCHEMA_MISMATCH');
});

test('エラー分類: ストレージ例外と、分類できない例外', () => {
  assert.equal(classifySubmissionError({ $metadata: { httpStatusCode: 503 } }), 'STORAGE_ERROR');
  assert.equal(classifySubmissionError(new Error('boom')), 'UNEXPECTED');
  assert.equal(classifySubmissionError(undefined), 'UNEXPECTED');
  // ストレージ操作を包む catch は fallback を渡せる
  assert.equal(classifySubmissionError(new Error('boom'), 'STORAGE_ERROR'), 'STORAGE_ERROR');
});

/**
 * ここから下は、実際のコードが例外をどう包み直すかを写した回帰テスト。
 * 分類関数の単体テストだけでは、呼び出し側が code を捨てていても気づけない
 * （それがまさに 2026-08-09 の見えなさの正体だった）。
 */
test('エラー分類: image-upload が包み直す形でも PGRST204 を拾う', () => {
  // src/app/api/image-upload/route.ts の visit / photo INSERT 失敗時と同じ形
  const visitError = { code: 'PGRST204', message: "column 'x' does not exist" };
  const thrown = new Error(`Visit creation failed: ${visitError.message}`, { cause: visitError });
  assert.equal(classifySubmissionError(thrown), 'DB_SCHEMA_MISMATCH');
});

test('エラー分類: R2 が包み直す形でもストレージ障害を拾う', () => {
  // src/lib/storage/r2.ts の catch と同じ形（AWS SDK 例外を Error で包む）
  const sdkError = Object.assign(new Error('NoSuchBucket'), {
    $metadata: { httpStatusCode: 404 },
  });
  const thrown = new Error(`Failed to upload to R2: ${sdkError.message}`, { cause: sdkError });
  assert.equal(classifySubmissionError(thrown), 'STORAGE_ERROR');
});

test('エラー分類: cause が壊れていても例外を投げない', () => {
  // cause に文字列が入ると `'$metadata' in cause` が TypeError になっていた
  assert.equal(classifySubmissionError(new Error('x', { cause: 'text' })), 'UNEXPECTED');
  assert.equal(classifySubmissionError(new Error('x', { cause: 42 })), 'UNEXPECTED');
  assert.equal(classifySubmissionError(new Error('x', { cause: null })), 'UNEXPECTED');

  // 循環参照でも止まる
  const a: any = new Error('a');
  const b: any = new Error('b');
  a.cause = b;
  b.cause = a;
  assert.equal(classifySubmissionError(a), 'UNEXPECTED');

  // 深く埋まっていても拾う
  const deep = new Error('1', { cause: new Error('2', { cause: { code: '42501' } }) });
  assert.equal(classifySubmissionError(deep), 'DB_PERMISSION_DENIED');
});
