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
 * コメントを落とす。落とさないと、実装を消してコメントとして残すだけで
 * 検査が pass してしまう（「呼んでいる」と「書いてある」は別物）。
 *
 * 行頭だけを見る方式では `const x = 1; /* funnel.failed() *\/` のような
 * **行内**のコメントが残り、そこに退行を隠せてしまう。かといって正規表現で
 * ブロックコメントを消すと `accept: { 'image/*': ... }` の `/*` を
 * コメント開始と誤認して後続のコードごと消す。
 * そこで文字列リテラルの内側かどうかを見ながら1文字ずつ走る。
 */
function stripCommentsStrict(text) {
  let out = '';
  let quote = null;      // 文字列リテラルの内側なら引用符
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        out += char;
      }
      continue;
    }
    if (blockComment) {
      // 行数を保つため改行だけ残す
      if (char === '\n') out += char;
      else if (char === '*' && next === '/') { blockComment = false; i += 1; }
      continue;
    }
    if (quote) {
      out += char;
      if (char === '\\') { out += next ?? ''; i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') { lineComment = true; i += 1; continue; }
    if (char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; out += char; continue; }
    out += char;
  }

  // 引用符が閉じないまま終わったら、文字列の判定を誤っている（JSX の
  // アポストロフィや正規表現リテラルなど）。誤って本文を消すより、
  // 行頭だけを見る従来の方式へ落ちる方が安全。
  return quote ? null : out;
}

function stripComments(text) {
  const strict = stripCommentsStrict(text);
  if (strict !== null) return strict;
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

/** `Record<A, B>` 形式の対応表から key と value を取り出す。 */
function readRecord(name) {
  const block = analytics.match(new RegExp(`${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!block) {
    console.error(`- ${name} を src/lib/analytics/gtag.ts から読み取れませんでした`);
    process.exit(1);
  }
  return Object.fromEntries(
    [...block[1].matchAll(/^\s*(\w+):\s*'([\w]+)'/gm)].map((match) => [match[1], match[2]])
  );
}

/** `Record<SubmissionKind, readonly ...[]>` から系統ごとの配列を取り出す。 */
function readKindLedger(name, kind) {
  const block = analytics.match(
    new RegExp(`${name}[^=]*=\\s*\\{[\\s\\S]*?${kind}:\\s*\\[([\\s\\S]*?)\\]`)
  );
  if (!block) {
    console.error(`- ${name} の ${kind} を読み取れませんでした`);
    process.exit(1);
  }
  return (block[1].match(/'([^']+)'/g) || []).map((value) => value.slice(1, -1));
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
  // 圧縮できない写真は両フローに共通で起きる。片方だけ「失敗」に数えると、
  // 障害の件数が水増しされたうえ、もう片方の block_reason が永久にゼロになって
  // 2系統を並べて比較できなくなる。
  expect(
    text.includes("blocked('unsupported_format', 'presend')"),
    `${file} が圧縮失敗を blocked('unsupported_format', 'presend') として扱っていない`
  );
}

// 4. ブロックの2軸が直交していること。
//    理由（なぜ止まったか）と位置（いつ止まったか）は独立なので、必ず両方送る。
//    位置が無いと「送信前に止まった人」と「送信したのに差し戻された人」が同じ数に混ざり、
//    p_photo_upload_start = complete + failed + blocked{postsend} が閉じなくなる。
const callerCode = analyticsCallers.map(({ text }) => stripComments(text)).join('\n');
const blockPhases = readLedger('SUBMISSION_BLOCK_PHASES');
const blockClasses = readLedger('SUBMISSION_BLOCK_CLASSES');
const blockClassByReason = readRecord('SUBMISSION_BLOCK_CLASS_BY_REASON');

// 4a. 分類表が理由を過不足なく覆う（片方向だけだと、消した理由が表に残る）
for (const reason of blockReasons) {
  expect(
    Object.prototype.hasOwnProperty.call(blockClassByReason, reason),
    `block_reason '${reason}' が SUBMISSION_BLOCK_CLASS_BY_REASON に無い（block_class が空になる）`
  );
}
for (const [reason, blockClass] of Object.entries(blockClassByReason)) {
  expect(blockReasons.includes(reason), `SUBMISSION_BLOCK_CLASS_BY_REASON の '${reason}' は台帳に無い理由`);
  expect(
    blockClasses.includes(blockClass),
    `block_reason '${reason}' の block_class '${blockClass}' が SUBMISSION_BLOCK_CLASSES に無い`
  );
}

// 4b. 呼び出しは必ず (理由, 位置) の2引数。位置は台帳の値だけ
for (const { file, text } of analyticsCallers) {
  const relativePath = path.relative(root, file);
  const code = stripComments(text);
  // 第3引数の `submittedAttribution()` を含むので、内側の括弧1段までを許して拾う
  for (const call of code.match(/funnel\.blocked\((?:[^()]|\([^()]*\))*\)/g) || []) {
    // 位置は必ず第2引数。第3引数（属性）と取り違えないよう、順番で見る
    const phase = call.match(/funnel\.blocked\(\s*[^,]+,\s*'([\w]+)'/);
    expect(phase !== null, `${relativePath} の ${call} に block_phase が無い`);
    if (phase) {
      expect(
        blockPhases.includes(phase[1]),
        `${relativePath} の block_phase '${phase[1]}' が SUBMISSION_BLOCK_PHASES に無い`
      );
    }
  }
}

// 4c. 系統ごとに「起きうる理由」を宣言し、実装と突き合わせる。
//     ゼロ件を見たときに「起きていない」のか「送っていない」のか判るようにする。
const declaredReasons = new Set();
for (const { file, kind } of SUBMISSION_FLOWS) {
  const code = flowCode.get(file);
  const expectedReasons = readKindLedger('SUBMISSION_BLOCK_REASONS_BY_KIND', kind);
  expect(expectedReasons.length > 0, `SUBMISSION_BLOCK_REASONS_BY_KIND.${kind} が空`);

  for (const reason of expectedReasons) {
    declaredReasons.add(reason);
    expect(
      code.includes(`blocked('${reason}',`),
      `${file} が blocked('${reason}', ...) を送っていない（${kind} で起きうると宣言されている）`
    );
  }
  // 宣言していない理由を送らない（系統をまたいだ理由の混入を止める）
  for (const call of code.match(/funnel\.blocked\('([\w]+)'/g) || []) {
    const reason = call.match(/'([\w]+)'/)[1];
    expect(
      expectedReasons.includes(reason),
      `${file} が ${kind} では起きないはずの block_reason '${reason}' を送っている`
    );
  }
}
// 定義だけの理由を作らせない
for (const reason of blockReasons) {
  expect(
    declaredReasons.has(reason),
    `block_reason '${reason}' はどちらの系統でも起きないことになっている（定義だけの値）`
  );
}

// 4d. 送信・完了・失敗の**それぞれ**に attempt_no が載っていること。
//     出現回数だけを数えると、3つとも同じイベントに置いても通ってしまう。
//     値は送信時に控えた定数であること — 応答時に funnel.attemptNo() を読み直すと、
//     間に別の送信が始まっていた場合に先行リクエストの終端へ後続試行の番号が付く。
for (const { file } of SUBMISSION_FLOWS) {
  const code = flowCode.get(file);
  for (const helper of ['trackPhotoUploadStart', 'trackPhotoUploadComplete', 'trackSubmissionFailed']) {
    const args = code.match(new RegExp(`${helper}\\(\\{([\\s\\S]*?)\\n\\s*\\}\\)`));
    expect(args !== null, `${file} の ${helper} の引数を読み取れない`);
    if (args) {
      expect(
        /attempt_no:/.test(args[1]),
        `${file} の ${helper} に attempt_no が無い（再送を試行として数えられない）`
      );
      expect(
        !/attempt_no:\s*funnel\.attemptNo\(\)/.test(args[1]),
        `${file} の ${helper} が attempt_no を応答時に読み直している（送信時に控えた値を使うこと）`
      );
    }
  }
  // 終端は各1回だけ。増やすと同じ到達・同じ試行に終端が2つ出る
  for (const call of ['funnel.completed()', 'funnel.failed()', 'trackPhotoUploadStart({']) {
    const count = code.split(call).length - 1;
    expect(count === 1, `${file} の ${call} が ${count} 箇所ある（終端は試行につき1つ）`);
  }
  // postsend のブロックは、その送信の属性を明示して送る（refを読み直さない）
  for (const call of code.match(/funnel\.blocked\([^;]*?'postsend'[^;]*?\)/g) || []) {
    expect(
      /,\s*submittedAttribution\(\)/.test(call),
      `${file} の ${call.replace(/\s+/g, ' ')} が送信時の属性を渡していない`
    );
  }
}

// 4e. 失敗の分類は両系統で同じ関数を使う。
//     片方だけが独自分類を持っていると、error_type を横並びで読めない。
for (const { file } of SUBMISSION_FLOWS) {
  expect(
    flowCode.get(file).includes('classifyClientSubmissionError('),
    `${file} が classifyClientSubmissionError を使っていない（error_type が系統で揃わない）`
  );
}

// 4f. 同じ失敗を p_app_error と p_submission_failed に二重計上しない
expect(
  !callerCode.includes("trackAppError('upload_error'"),
  '投稿の失敗を p_app_error にも送っている（p_submission_failed と二重に数える）'
);

// 4g. has_note は両系統で「利用者が任意で書いたか」を指すこと。
//     キャラふたの visitNote は onDrop が EXIF（カメラ・撮影日時・位置）から
//     自動生成するので、そこから導くと常に true になる。デザインふたの
//     description（純粋な任意入力）と並べた瞬間、記入率の比較が壊れる。
for (const { file, kind } of SUBMISSION_FLOWS) {
  const args = flowCode.get(file).match(/trackPhotoUploadComplete\(\{([\s\S]*?)\n\s*\}\)/);
  expect(args !== null, `${file} の trackPhotoUploadComplete の引数を読み取れない`);
  if (!args) continue;
  const hasNote = args[1].match(/has_note:\s*([^,\n]+)/);
  expect(hasNote !== null, `${file} の完了イベントに has_note が無い`);
  if (kind === 'character' && hasNote) {
    expect(
      !/visitNote/.test(hasNote[1]),
      `${file} の has_note が自動生成される visitNote から導かれている（常に true になり、デザインふたと比較できない）`
    );
  }
}

// 4h. 蓋の一覧の取得に失敗したとき、行き止まりの位置を写真の有無で出し分けること。
//     一覧の到着前に写真を選んだ人の行き止まりは photo、着いた時点で既に駄目な人は entry。
//     取得失敗を常に entry で送ると、回線の速さだけで同じ利用者が2つの位置に割れる。
//     onDrop 側にも 'photo' の呼び出しがあるので、ファイル全体を見るだけでは
//     この分岐が消えたことに気づけない。失敗経路の関数の中だけを見る。
{
  const characterCode = flowCode.get('src/app/upload/page.tsx');
  const helper = characterCode.match(
    /const reportManholesUnavailable = \(\) => \{([\s\S]*?)\n  \};/
  );
  expect(
    helper !== null,
    'src/app/upload/page.tsx に reportManholesUnavailable が無い（一覧取得の失敗を位置で出し分けていない）'
  );
  if (helper) {
    for (const phase of ['entry', 'photo']) {
      expect(
        helper[1].includes(`blocked('manholes_unavailable', '${phase}')`),
        `reportManholesUnavailable が blocked('manholes_unavailable', '${phase}') を送っていない`
      );
    }
  }
  // 失敗経路が helper を通ること。直接 blocked を呼ぶと分岐を迂回できる
  const loader = characterCode.match(/const loadManholes = async \(\) => \{([\s\S]*?)\n  \};/);
  expect(loader !== null, 'src/app/upload/page.tsx の loadManholes を読み取れない');
  if (loader) {
    expect(
      !/funnel\.blocked\('manholes_unavailable'/.test(loader[1]),
      'loadManholes が reportManholesUnavailable を通さず blocked を直接呼んでいる（位置の分岐を迂回する）'
    );
    expect(
      /reportManholesUnavailable\(\)/.test(loader[1]),
      'loadManholes が失敗時に reportManholesUnavailable を呼んでいない'
    );
  }
}

// 4b. Pokémon GO フレンド募集も、台帳の各イベントに送信ヘルパーと呼び出し元がある。
//     設定率・コピー率は分母（画面到達・カード表示）が無いと読めないので、
//     4つ揃っていることを fail closed で担保する。
for (const eventName of readLedger('GO_FRIEND_EVENTS')) {
  expect(
    analyticsCode.includes(`trackEvent('${eventName}'`),
    `${eventName} は GO_FRIEND_EVENTS にあるが、送信するヘルパーが gtag.ts に無い`
  );
}
for (const helper of [
  'goFriendEditView',
  'goFriendSaved',
  'goFriendCardView',
  'goFriendCodeCopy',
]) {
  expect(
    callerCode.includes(`${helper}({`),
    `${helper} がどこからも呼ばれていない（Pokémon GO フレンド募集の計測に穴が空く）`
  );
}

// 4c. 蓋コメントも同じ形で担保する。
//     ここが崩れると「機能はあるが行動が無い」と「そもそも計測が無い」を区別できなくなる。
//     特に thread_view（分母）と login_prompt_click は、片方欠けるだけで
//     設計の当否を判定する式そのものが成立しない。
for (const eventName of readLedger('COMMENT_EVENTS')) {
  expect(
    analyticsCode.includes(`trackEvent('${eventName}'`),
    `${eventName} は COMMENT_EVENTS にあるが、送信するヘルパーが gtag.ts に無い`
  );
}
for (const helper of [
  'commentThreadView',
  'commentLoginPrompt',
  'commentComposeStart',
  'commentSubmit',
  'commentPosted',
  'commentFailed',
  'commentDelete',
  'commentReport',
]) {
  expect(
    callerCode.includes(`${helper}({`),
    `${helper} がどこからも呼ばれていない（蓋コメントの計測に穴が空く）`
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
