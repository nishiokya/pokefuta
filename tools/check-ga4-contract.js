#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
// 読めないファイルは pass させない。検査が黙って素通りするのが一番危ない。
const read = (relativePath) => {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
  } catch (error) {
    console.error(`- ${relativePath} を読めませんでした: ${error.message}`);
    process.exit(1);
  }
};

const analytics = read('src/lib/analytics/gtag.ts');
const provider = read('src/components/GoogleAnalytics.tsx');
const submissionFunnelHook = read('src/lib/hooks/useSubmissionFunnel.ts');

// 投稿ファネルを送る2つのフロー。片方だけ計測されている状態を作らせない
// （2026-08-09 の事故当時、デザインふた側はイベントが1つも無かった）。
const SUBMISSION_FLOWS = [
  { file: 'src/app/upload/page.tsx', kind: 'character' },
  { file: 'src/app/design-manholes/new/page.tsx', kind: 'design' },
];

/**
 * コメント行を落とす。落とさないと、実装を消してコメントとして残すだけで
 * 検査が pass してしまう（「呼んでいる」と「書いてある」は別物）。
 *
 * 行頭が `//` `*` `/*` の行だけを除く。ブロックコメントを本文ごと正規表現で
 * 消す方式は使えない — `accept: { 'image/*': ... }` の `/*` を
 * コメント開始と誤認して、後続のコードごと消してしまうため。
 * 完全なパーサではないが、「呼び出しをコメントアウトして残す」という
 * 現実的な逃げ道はこれで塞げる。
 */
function stripComments(text) {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

/** gtag.ts の `as const` 配列から文字列リテラルを取り出す。 */
function readLedger(name) {
  const block = analytics.match(new RegExp(`${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`));
  if (!block) {
    console.error(`- ${name} を src/lib/analytics/gtag.ts から読み取れませんでした`);
    process.exit(1);
  }
  const values = block[1].match(/'([^']+)'/g);
  if (!values || values.length === 0) {
    console.error(`- ${name} が空です`);
    process.exit(1);
  }
  return values.map((value) => value.slice(1, -1));
}

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const analyticsCallers = sourceFiles(path.join(root, 'src'))
  .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }))
  .filter(({ text }) => /useAnalytics|analytics\/gtag/.test(text));

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const hostAllowlist = analytics.match(/ANALYTICS_HOSTS\s*=\s*new Set\(\[([^\]]+)\]\)/)?.[1] || '';
expect(hostAllowlist.includes("'pokefuta.com'"), 'pokefuta.com is missing from the production hostname allowlist');
expect(hostAllowlist.includes("'www.pokefuta.com'"), 'www.pokefuta.com is missing from the production hostname allowlist');
expect(!/localhost|127\.0\.0\.1/.test(hostAllowlist), 'development hosts must not be in the production allowlist');
expect(/window\.gtag!?\('event', 'page_view'/.test(provider), 'standard page_view tracking is missing');
expect(analytics.includes("trackEvent('p_page_view'"), 'legacy helper must not emit another standard page_view');
expect(provider.includes("'code'") && provider.includes("'access_token'"), 'sensitive query filtering is missing');
expect(provider.includes("get('from') === 'data'"), 'data-site referral tracking is missing');
expect(provider.includes("'p_data_referral'"), 'data-site referral event is missing');
expect(provider.includes('page_location: analyticsPageLocation'), 'sanitized page_location must be configured globally');
expect(provider.includes('(function() {'), 'analytics bootstrap must not leak variables to window');
expect(
  provider.includes("document.visibilityState === 'hidden'") && provider.includes('window.setTimeout(send, 0)'),
  'hidden tabs must send page_view without waiting for requestAnimationFrame'
);
expect(!analytics.includes("trackEvent('error_event'"), 'legacy key event error_event must not be emitted');
expect(!analytics.includes("trackEvent('auth_error'"), 'legacy key event auth_error must not be emitted');
for (const { file, text } of analyticsCallers) {
  expect(!text.match(/\bsource\s*:/), `${path.relative(root, file)} must use surface instead of GA reserved source`);
}

// ==========================================
// 投稿ファネル
//
// 事故（2026-08-09）の再発防止として、ファネルが「片肺」になっていないことを検査する。
// 定義があるのに誰も送っていない／片方のフローだけ送っている、を落とす。
// ==========================================

const funnelEvents = readLedger('SUBMISSION_FUNNEL_EVENTS');
const blockReasons = readLedger('SUBMISSION_BLOCK_REASONS');

// 1. 台帳の各イベントに、実際に送るヘルパーが gtag.ts にある
const analyticsCode = stripComments(analytics);
for (const eventName of funnelEvents) {
  expect(
    analyticsCode.includes(`trackEvent('${eventName}'`),
    `${eventName} は SUBMISSION_FUNNEL_EVENTS にあるが、送信するヘルパーが gtag.ts に無い`
  );
}

// 2. 共有フックが、フック側が担当するステップを実際に送っている
const hookCode = stripComments(submissionFunnelHook);
for (const helper of [
  'trackSubmissionStart',
  'trackSubmissionPhotoSelected',
  'trackSubmissionBlocked',
  'trackSubmissionAbandoned',
]) {
  expect(
    hookCode.includes(`${helper}({`),
    `useSubmissionFunnel が ${helper} を呼んでいない（ファネルに穴が空く）`
  );
}
// 離脱は2経路ある。pagehide だけだと Next.js の <Link> によるクライアント遷移
// （ヘッダー・下タブからの離脱＝最頻経路）が丸ごと取れない。
expect(
  hookCode.includes("addEventListener('pagehide'"),
  'useSubmissionFunnel が pagehide を購読していない（タブを閉じる離脱を検知できない）'
);
expect(
  /return\s*\(\)\s*=>\s*\{[\s\S]*?emitAbandoned\(\);[\s\S]*?\}/.test(hookCode),
  'useSubmissionFunnel がアンマウント時に離脱を送っていない（Link遷移の離脱が取れない）'
);

// 3. 両フローが、フックを使い、ファネルの各ステップを実際に呼んでいる。
//    片方のフローだけ計測されている状態を fail closed で防ぐ。
const flowCode = new Map();
for (const { file, kind } of SUBMISSION_FLOWS) {
  const text = stripComments(read(file));
  flowCode.set(file, text);
  expect(
    text.includes(`useSubmissionFunnel('${kind}')`),
    `${file} が useSubmissionFunnel('${kind}') を使っていない`
  );
  // start / photoSelected はフック経由、残りは直接ヘルパーを呼ぶ
  for (const call of ['funnel.start()', 'funnel.photoSelected({', 'funnel.completed()', 'funnel.failed()']) {
    expect(text.includes(call), `${file} が ${call} を呼んでいない`);
  }
  for (const helper of ['trackPhotoUploadStart', 'trackPhotoUploadComplete', 'trackSubmissionFailed']) {
    expect(text.includes(`${helper}({`), `${file} が ${helper} を呼んでいない`);
  }
  expect(
    /funnel\.blocked\('/.test(text),
    `${file} が funnel.blocked を呼んでいない（離脱理由が取れない）`
  );
  expect(
    text.includes(`submission_kind: '${kind}'`),
    `${file} が submission_kind: '${kind}' を付けていない`
  );
}

// 4. block_reason の全値が、どこかで実際に送られている（定義だけの値を作らせない）
const callerCode = analyticsCallers.map(({ text }) => stripComments(text)).join('\n');
for (const reason of blockReasons) {
  expect(
    callerCode.includes(`blocked('${reason}')`),
    `block_reason '${reason}' は定義されているが、どこからも送られていない`
  );
}

// 5. 投稿導線のクリックが計測されている
expect(
  callerCode.includes('trackSubmissionEntry({'),
  '投稿導線に trackSubmissionEntry が無い（流入元の内訳が取れない）'
);

// 6. 投稿APIは失敗時に機械可読な code を返し、生のDBメッセージを外へ出さない。
//    ここが崩れると、事故が起きても GA4 の error_code が UNEXPECTED に丸まる。
for (const routeFile of [
  'src/app/api/design-manholes/route.ts',
  'src/app/api/image-upload/route.ts',
]) {
  const routeCode = stripComments(read(routeFile));
  expect(
    routeCode.includes('classifySubmissionError('),
    `${routeFile} が classifySubmissionError を使っていない`
  );
  // `error.message` と `error?.message` の両方を拾う（`?.` を必須にすると素通りする）
  expect(
    !/details:\s*\w+\??\.message/.test(routeCode),
    `${routeFile} が生のエラーメッセージを details でクライアントへ返している`
  );
  // PostgrestError の code を捨てると分類できない
  expect(
    !/throw new Error\(`[^`]*\$\{(?:visitError|photoError|insertError)\?\.message\}[^`]*`\)/.test(routeCode),
    `${routeFile} が PostgrestError を cause 無しで包んでいる（code が失われる）`
  );
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('GA4 contract check passed');
