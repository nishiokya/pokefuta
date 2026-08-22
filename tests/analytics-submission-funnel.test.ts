import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBMISSION_BLOCK_CLASSES,
  SUBMISSION_BLOCK_CLASS_BY_REASON,
  SUBMISSION_BLOCK_PHASES,
  SUBMISSION_BLOCK_REASONS,
  SUBMISSION_BLOCK_REASONS_BY_KIND,
  SUBMISSION_FUNNEL_EVENTS,
  pokefutaEvents,
  trackEvent,
} from '../src/lib/analytics/gtag.ts';
import { classifySubmissionError } from '../src/lib/api-error-code.ts';
import {
  SUBMISSION_ERROR_TYPES,
  classifyClientSubmissionError,
} from '../src/lib/analytics/submission-error.ts';

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
      pokefutaEvents.submissionBlocked({
        submission_kind: 'character',
        block_reason: 'invalid_gps',
        block_phase: 'photo',
      }),
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
      pokefutaEvents.submissionBlocked({
        submission_kind: 'design',
        block_reason: reason,
        block_phase: 'photo',
      });
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


// ==========================================
// MECE — 軸が直交していること
//
// ファネルの読み違いは「同じ人・同じ試行を別の軸で二度数える」ときに起きる。
// 各軸が排他かつ網羅であることを、実装ではなく台帳の側で担保する。
// ==========================================

test('MECE: block_reason は全値が1つの block_class に分類される', () => {
  // 理由を足して分類を忘れると Record の型で落ちる。ここでは値の側を確認する
  assert.deepEqual(
    Object.keys(SUBMISSION_BLOCK_CLASS_BY_REASON).sort(),
    [...SUBMISSION_BLOCK_REASONS].sort()
  );
  for (const reason of SUBMISSION_BLOCK_REASONS) {
    assert.ok(
      SUBMISSION_BLOCK_CLASSES.includes(SUBMISSION_BLOCK_CLASS_BY_REASON[reason]),
      `${reason} の block_class が台帳の外にある`
    );
  }
});

test('MECE: block_class は呼び出し側が指定しなくても理由から自動で載る', () => {
  const sent = onProduction(() => {
    pokefutaEvents.submissionBlocked({
      submission_kind: 'design',
      block_reason: 'suspended',
      block_phase: 'entry',
    });
    pokefutaEvents.submissionBlocked({
      submission_kind: 'character',
      block_reason: 'too_far',
      block_phase: 'presend',
    });
  });
  assert.deepEqual(
    sent.map((event) => event.params.block_class),
    ['policy', 'proximity']
  );
});

test('MECE: block_class は呼び出し側が渡した値で上書きできない', () => {
  // `PokefutaEventParams` に索引シグネチャがあるので、型だけでは混入を止められない。
  // spread の後ろで台帳から載せ直していることを、実際の送信内容で確かめる。
  const sent = onProduction(() => {
    pokefutaEvents.submissionBlocked({
      submission_kind: 'design',
      block_reason: 'suspended',
      block_phase: 'entry',
      // 運用judgment の停止を「こちら側の障害」に見せかけようとする呼び出し
      block_class: 'system',
    } as unknown as Parameters<typeof pokefutaEvents.submissionBlocked>[0]);
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].params.block_class, SUBMISSION_BLOCK_CLASS_BY_REASON.suspended);
  assert.equal(sent[0].params.block_class, 'policy');
});

test('MECE: block_phase が理由と直交して載る（同じ理由でも位置で分かれる）', () => {
  const sent = onProduction(() => {
    for (const phase of SUBMISSION_BLOCK_PHASES) {
      pokefutaEvents.submissionBlocked({
        submission_kind: 'design',
        block_reason: 'official_manhole_nearby',
        block_phase: phase,
      });
    }
  });
  assert.deepEqual(sent.map((event) => event.params.block_phase), [...SUBMISSION_BLOCK_PHASES]);
  // 理由は同じまま。位置だけが変わる＝2軸が独立している
  assert.deepEqual(
    new Set(sent.map((event) => event.params.block_reason)),
    new Set(['official_manhole_nearby'])
  );
});

test('MECE: 系統ごとの理由表が、全体の台帳を過不足なく覆う', () => {
  const declared = new Set([
    ...SUBMISSION_BLOCK_REASONS_BY_KIND.character,
    ...SUBMISSION_BLOCK_REASONS_BY_KIND.design,
  ]);
  // 網羅: どの理由も、少なくとも片方の系統で起きうると宣言されている
  for (const reason of SUBMISSION_BLOCK_REASONS) {
    assert.ok(declared.has(reason), `${reason} がどちらの系統でも起きないことになっている`);
  }
  // 逆向き: 台帳に無い理由を系統表に書けない
  for (const reason of declared) {
    assert.ok(
      (SUBMISSION_BLOCK_REASONS as readonly string[]).includes(reason),
      `${reason} は SUBMISSION_BLOCK_REASONS に無い`
    );
  }
  // 重複した宣言を残さない（同じ理由を2回並べると期待件数がぶれる）
  for (const kind of ['character', 'design'] as const) {
    const list = SUBMISSION_BLOCK_REASONS_BY_KIND[kind];
    assert.equal(new Set(list).size, list.length, `${kind} の理由表に重複がある`);
  }
});

test('MECE: 送信・完了・失敗に attempt_no が載る（再送を人数に混ぜない）', () => {
  const sent = onProduction(() => {
    pokefutaEvents.photoUploadStart({ submission_kind: 'design', attempt_no: 2 });
    pokefutaEvents.photoUploadComplete({ submission_kind: 'design', attempt_no: 2 });
    pokefutaEvents.submissionFailed({ submission_kind: 'design', stage: 'upload', attempt_no: 1 });
  });
  assert.deepEqual(sent.map((event) => event.params.attempt_no), [2, 2, 1]);
});

test('MECE: 失敗の分類は両系統で同じ規則（ステータスが文言より優先される）', () => {
  // サーバーが答えているならステータスが正。文言を変えても分類は動かない
  assert.equal(classifyClientSubmissionError(new Error('セッションが切れました'), 401), 'unauthorized');
  assert.equal(classifyClientSubmissionError(new Error('投稿に失敗しました'), 503), 'server');
  assert.equal(classifyClientSubmissionError(new Error('投稿に失敗しました'), 409), 'rejected');
  assert.equal(classifyClientSubmissionError(new Error('too large'), 413), 'file_size');

  // 応答が無い場合だけ文言と例外の型を見る
  assert.equal(
    classifyClientSubmissionError(Object.assign(new Error('Failed to fetch'), { name: 'TypeError' })),
    'network'
  );
  assert.equal(classifyClientSubmissionError(new Error('セッションが切れました')), 'unauthorized');
  assert.equal(classifyClientSubmissionError(new Error('GPS座標が見つかりません')), 'gps_validation');
  assert.equal(classifyClientSubmissionError(new Error('なにか')), 'unknown');
  assert.equal(classifyClientSubmissionError(undefined), 'unknown');

  // 返す値は必ず台帳の中
  for (const status of [400, 401, 403, 404, 409, 413, 500, 503, undefined]) {
    assert.ok(
      (SUBMISSION_ERROR_TYPES as readonly string[]).includes(
        classifyClientSubmissionError(new Error('x'), status)
      )
    );
  }
});
