/**
 * Google Analytics 4 ユーティリティ関数
 * 型安全なGA追跡とSSR対応
 */

import type { SubmissionErrorType } from './submission-error';

// ==========================================
// 型定義
// ==========================================

export interface GAEventParams {
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface GAUserProperties {
  [key: string]: string | number | boolean | undefined;
}

/** pokefuta.com 共通イベントパラメータ */
export interface PokefutaEventParams extends GAEventParams {
  site_type?: 'photo' | 'map';
  manhole_id?: string | number;
  prefecture?: string;
  pokemon_ids?: string;    // カンマ区切り文字列 (GA4は配列非対応)
  is_logged_in?: boolean;
  source_app?: 'tracker' | 'map';
  surface?: string;        // イベント発生箇所。GA予約語の source は使用しない
}

// ==========================================
// 投稿ファネル
//
// キャラふた（/upload）とデザインふた（/design-manholes/new）で同じイベント名を使い、
// submission_kind で出し分ける。GA4 の探索は1つのファネル定義で両方を見られる。
// ==========================================

export type SubmissionKind = 'character' | 'design';

/**
 * 送信に進めず止まった理由。ここが「静かな離脱」の可視化そのものなので、
 * return するだけの分岐を足したら必ずこの一覧にも足す。
 */
export const SUBMISSION_BLOCK_REASONS = [
  'invalid_gps',              // 写真にGPSが無い
  'no_nearby_manhole',        // 50m以内に登録済みの蓋が無い
  'too_far',                  // 蓋から50m以上離れている
  'manhole_location_missing', // 蓋側に座標が無い
  'manholes_unavailable',     // 蓋の一覧を取得できなかった
  'official_manhole_nearby',  // 公式ポケふたが近く、確認待ちに差し戻した
  'unsupported_format',       // 画像形式を変換できなかった
  'suspended',                // 投稿受付を停止中
] as const;

export type SubmissionBlockReason = (typeof SUBMISSION_BLOCK_REASONS)[number];

/**
 * ブロックが**いつ**起きたか。理由（block_reason）と直交する軸で、
 * これが無いと「送信前に止まった人」と「送信したのに差し戻された人」が同じ数に混ざる。
 *
 * postsend は送信済みの試行の終端でもある。この軸があって初めて
 * `p_photo_upload_start = complete + failed + blocked{postsend}` が成り立つ。
 */
export const SUBMISSION_BLOCK_PHASES = [
  'entry',    // 画面に着いた時点で既に進めない（停止中、蓋の一覧が取れない）
  'photo',    // 写真を選んだ直後の判定で止まった
  'presend',  // 送信ボタンを押した後、送信前の再チェック・圧縮で止まった
  'postsend', // 送信したがサーバーが差し戻した（障害ではない 4xx/5xx）
] as const;

export type SubmissionBlockPhase = (typeof SUBMISSION_BLOCK_PHASES)[number];

/**
 * ブロックの性質。**打ち手の持ち主で分ける**（理由の粒度では誰が直すのか判らない）。
 * 理由を足したら下の対応表がコンパイルエラーになるので、分類漏れは起きない。
 */
export const SUBMISSION_BLOCK_CLASSES = [
  'photo',     // 利用者の写真そのものの問題。打ち手はUIの事前説明
  'proximity', // 位置関係の問題。打ち手は判定の閾値と蓋データ
  'catalog',   // 蓋データの欠損。打ち手はデータ補修
  'system',    // こちら側の障害。打ち手は修正
  'policy',    // 運用judgment で止めている。打ち手は運用
] as const;

export type SubmissionBlockClass = (typeof SUBMISSION_BLOCK_CLASSES)[number];

export const SUBMISSION_BLOCK_CLASS_BY_REASON: Record<SubmissionBlockReason, SubmissionBlockClass> = {
  invalid_gps: 'photo',
  unsupported_format: 'photo',
  no_nearby_manhole: 'proximity',
  too_far: 'proximity',
  official_manhole_nearby: 'proximity',
  manhole_location_missing: 'catalog',
  manholes_unavailable: 'system',
  suspended: 'policy',
};

/**
 * 系統ごとに**起こりうる**理由。片方でしか起きない理由をゼロ件で眺めても
 * 「起きていない」のか「送っていない」のか判らないので、期待値を先に書く。
 * `tools/check-ga4-contract.js` が実装側の呼び出しと突き合わせる。
 */
export const SUBMISSION_BLOCK_REASONS_BY_KIND: Record<SubmissionKind, readonly SubmissionBlockReason[]> = {
  character: [
    'invalid_gps',
    'no_nearby_manhole',
    'too_far',
    'manhole_location_missing',
    'manholes_unavailable',
    'unsupported_format',
  ],
  design: [
    'invalid_gps',
    'manholes_unavailable',
    'official_manhole_nearby',
    'unsupported_format',
    'suspended',
  ],
};

/** 失敗がどの段階で起きたか。原因の切り分けに使う。 */
export type SubmissionStage = 'compress' | 'upload' | 'persist';

/**
 * 写真をどう選んだか。
 * その場で撮ればEXIFにGPSが乗るが、ライブラリやSNS経由の写真は剥がれていることが多い。
 * `invalid_gps` の主因を説明できるのはこの軸なので、写真選択以降の全イベントに載せる。
 */
export type PhotoSource = 'camera' | 'library';

/**
 * 離脱時点で到達していた最も先のステップ。完了は離脱ではないので含めない。
 * `failed` は「失敗した後そのまま去った」— 再試行して完了した人と区別できる。
 */
export type SubmissionStep = 'start' | 'photo_selected' | 'blocked' | 'submitting' | 'failed';

export interface SubmissionEventParams extends PokefutaEventParams {
  submission_kind: SubmissionKind;
  photo_source?: PhotoSource;
  /**
   * この到達の中で何回目の送信か。`submitting()` ごとに増える（送信前は 0）。
   * 再送は同じ人の同じ投稿なので、これが無いと失敗率が試行の数だけ水増しされる。
   */
  attempt_no?: number;
}

export interface SubmissionEntryParams extends SubmissionEventParams {
  surface: string;
}

export interface SubmissionPhotoSelectedParams extends SubmissionEventParams {
  photo_source: PhotoSource;
  has_gps: boolean;
  has_exif_datetime?: boolean;
}

/**
 * 投稿しないままページを離れたこと。`pagehide` で1回だけ送る。
 * ファネルの段差は「どこで落ちたか」しか示さないが、こちらは
 * 滞在時間と、止まっていた理由（block_reason）を併せて残す。
 */
export interface SubmissionAbandonedParams extends SubmissionEventParams {
  last_step: SubmissionStep;
  dwell_ms: number;
  block_reason?: SubmissionBlockReason;
  block_phase?: SubmissionBlockPhase;
}

export interface SubmissionBlockedParams extends SubmissionEventParams {
  block_reason: SubmissionBlockReason;
  /** いつ止まったか。理由と直交する軸なので、理由と必ずセットで送る。 */
  block_phase: SubmissionBlockPhase;
  /**
   * 打ち手の持ち主。`block_reason` から機械的に決まるので呼び出し側では指定しない
   * （helper が `SUBMISSION_BLOCK_CLASS_BY_REASON` から付ける）。
   */
  block_class?: SubmissionBlockClass;
  /**
   * この写真で同じ（理由 × 位置）を既に送っているか。
   * 「何人が詰まったか」は `is_repeat:false` だけを数える。再送のたびに
   * 増える件数をそのまま人数として読むと、詰まりの深刻さを取り違える。
   */
  is_repeat?: boolean;
}

export interface SubmissionCompleteParams extends SubmissionEventParams {
  /** デザインふた固有。掲載されたか確認待ちか（キャラふたに審査は無い）。 */
  review_status?: string;
  upload_duration_ms?: number;
  /** 任意入力（ひとこと・説明）を書いたか。両系統で同じ意味にする。 */
  has_note?: boolean;
}

export interface SubmissionFailedParams extends SubmissionEventParams {
  stage: SubmissionStage;
  status_code?: number;
  /** API が返す機械可読なコード。`src/lib/api-error-code.ts` を参照。 */
  error_code?: string;
  /**
   * サーバーが code を返せなかったとき用のクライアント側の分類。
   * `src/lib/analytics/submission-error.ts` で両系統とも同じ規則を使う。
   */
  error_type?: SubmissionErrorType;
}

/**
 * 投稿ファネルの台帳。`tools/check-ga4-contract.js` がこの並びを正として、
 * 両フローが全ステップを送っているかを検査する。順序はファネルの順序。
 */
export const SUBMISSION_FUNNEL_EVENTS = [
  'p_submission_entry',          // 1. 投稿導線のクリック（補助。分母には使わない）
  'p_submission_start',          // 2. 投稿画面に到達（ファネルの起点）
  'p_submission_photo_selected', // 3. 写真を選んだ
  'p_submission_blocked',        // 4. 送信に進めず止まった
  'p_photo_upload_start',        // 5. 送信した
  'p_photo_upload_complete',     // 6a. 完了（キーイベント）
  'p_submission_failed',         // 6b. 失敗（キーイベントにしない）
  'p_submission_abandoned',      // 6c. 投稿せずに離脱（pagehide で1回だけ）
] as const;

export interface GoFriendEventParams extends GAEventParams {
  /** 発生箇所。GA4 予約語の source は使わない。 */
  surface: string;
}

export interface GoFriendSavedParams extends GoFriendEventParams {
  /** 保存後に募集中として公開されているか。設定率と公開率を分けて見る。 */
  is_open: boolean;
  /** ひとことを書いたか。フリーワードの中身は送らない（個人情報が混じりうる）。 */
  has_note: boolean;
}

/**
 * Pokémon GO フレンド募集の台帳。`tools/check-ga4-contract.js` が
 * 「定義だけあって誰も送っていない」状態を落とす。
 *
 * 分母の取り方は投稿ファネルと同じ考え方で、導線クリックではなく**画面到達**を使う。
 * 導線は散らばって取りこぼす（2026-08-10 の #208 で同じ判断をしている）。
 */
export const GO_FRIEND_EVENTS = [
  'p_go_friend_edit_view',  // 1. プロフィール編集画面に到達（設定率の分母）
  'p_go_friend_saved',      // 2. トレーナーコードを保存した
  'p_go_friend_card_view',  // 3. 公開ページで募集カードが表示された（コピー率の分母）
  'p_go_friend_code_copy',  // 4. コードをコピーした
] as const;

/**
 * スレッドの賑わい。**設計の当否はこの次元での分解でしか答えられない。**
 *
 * 「コメント欄を目立たせれば書かれる」という仮説が正しいなら、
 * `p_comment_posted / p_comment_thread_view` は `active` で高く `empty` で低いはず。
 * 全部の状態で等しく低いなら、問題はUIではなく**部屋あたりの観客がいない**ことで、
 * 次の打ち手は蓋ページの磨き込みではなく部屋の単位を変えること（県 / ポケモン / ルート）。
 */
export const COMMENT_THREAD_STATES = [
  'empty',   // 0件。482枚のうち大半がこれ
  'single',  // 1件
  'small',   // 2件
  'active',  // 3件以上
] as const;

export type CommentThreadState = (typeof COMMENT_THREAD_STATES)[number];

export function commentThreadState(commentCount: number): CommentThreadState {
  if (commentCount <= 0) return 'empty';
  if (commentCount === 1) return 'single';
  if (commentCount === 2) return 'small';
  return 'active';
}

export interface CommentEventParams extends GAEventParams {
  /** 発生箇所。GA4 予約語の source は使わない。 */
  surface: string;
  thread_state: CommentThreadState;
}

export interface CommentThreadViewParams extends CommentEventParams {
  /** スレッドの件数そのもの。カスタム**指標**として登録が要る。 */
  thread_size: number;
}

export interface CommentPostedParams extends CommentEventParams {
  /** 返信か。Phase 1b では常に false（返信UIは通知と同時に出す）。 */
  is_reply: boolean;
}

export interface CommentFailedParams extends CommentEventParams {
  /**
   * 'invalid_content' / 'unauthorized' / 'network' / 'unexpected'
   * レート制限を入れ直すときに 'rate_limited' を足す（今は 429 を返す経路が無い）。
   */
  error_code: string;
  status_code?: number;
}

/**
 * 蓋コメントの台帳。`tools/check-ga4-contract.js` が
 * 「定義だけあって誰も送っていない」状態を落とす。
 *
 * **コメント総数を指標にしない。** 6→30 は5倍だが何も意味しない。
 * 見るのは `p_comment_posted / p_comment_thread_view` を thread_state で割ったもの。
 *
 * `compose_start` はあるのに `posted` が無い＝コンポーザ / 文字数UIの問題。
 * `compose_start` すら無い＝発見・配置の問題。
 * **別の修正であり、両方のイベントが無いと区別できない。**
 *
 * デプロイ前に GA4 管理画面で登録が要る（遡及しない）:
 *   カスタムディメンション … thread_state, is_reply
 *   カスタム指標         … thread_size
 *   （surface / error_code / is_logged_in は登録済み）
 */
export const COMMENT_EVENTS = [
  'p_comment_thread_view',        // 1. スレッドが描画された（**分母**。PVではない）
  'p_comment_login_prompt_click', // 2. 未ログインがコンポーザを叩いた
  'p_comment_compose_start',      // 3. 最初のキーストローク
  'p_comment_submit',             // 4. 送信した
  'p_comment_posted',             // 5a. 投稿できた（キーイベント）
  'p_comment_failed',             // 5b. 失敗（キーイベントにしない）
  'p_comment_delete',             // 6. 自分のコメントを消した
  'p_comment_report',             // 7. 通報した
] as const;

export interface ApiErrorEventParams extends GAEventParams {
  api_path: string;
  endpoint?: string;
  status_code: number;
  method: string;
  error_message?: string;
  is_logged_in?: boolean | 'unknown';
  page_type?: string;
  component?: string;
}

// ==========================================
// グローバル型拡張
// ==========================================

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
  }
}

// ==========================================
// ヘルパー関数: SSR チェック
// ==========================================

function isClientSide(): boolean {
  return typeof window !== 'undefined';
}

const ANALYTICS_HOSTS = new Set(['pokefuta.com', 'www.pokefuta.com']);

export function isProductionAnalyticsHost(hostname: string): boolean {
  return ANALYTICS_HOSTS.has(hostname.toLowerCase());
}

function isGtagAvailable(): boolean {
  return (
    isClientSide() &&
    isProductionAnalyticsHost(window.location.hostname) &&
    typeof window.gtag === 'function'
  );
}

// ==========================================
// auth 状態（全イベント自動付与用）
// ==========================================

let _analyticsIsLoggedIn: boolean | null = null;

/** ApiErrorAnalytics や認証フローから呼ぶ。全イベントに is_logged_in が自動付与される。 */
export function setAnalyticsAuthState(isLoggedIn: boolean): void {
  _analyticsIsLoggedIn = isLoggedIn;
}

// ==========================================
// コア関数: イベント送信
// ==========================================

export function trackEvent(
  eventName: string,
  eventParams?: GAEventParams,
  context?: GAEventParams
): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. Event not tracked:', eventName);
    }
    return;
  }

  const enrichedParams: GAEventParams = {
    site_type: 'photo',
    page_path: isClientSide() ? window.location.pathname : undefined,
    page_title: isClientSide() ? document.title : undefined,
    event_timestamp: new Date().toISOString(),
    user_locale: navigator.language || 'ja-JP',
    is_logged_in: _analyticsIsLoggedIn !== null ? _analyticsIsLoggedIn : undefined,
    ...context,
    ...eventParams,
  };

  if (process.env.NODE_ENV === 'development') {
    console.log('[GA Event]', {
      event: eventName,
      params: enrichedParams,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    window.gtag!('event', eventName, enrichedParams);
  } catch (error) {
    console.error('[GA] Failed to track event:', eventName, error);
  }
}

// ==========================================
// ページビュー関数
// ==========================================

export function trackPageView(
  pagePath: string,
  pageTitle: string,
  pageType?: string,
  isLoggedIn: boolean = false
): void {
  trackEvent('p_page_view', {
    page_path: pagePath,
    page_title: pageTitle,
    page_type: pageType,
    is_logged_in: isLoggedIn,
  });
}

// ==========================================
// ユーザー設定関数
// ==========================================

export function setUserId(userId: string): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. User ID not set.');
    }
    return;
  }

  try {
    window.gtag!('set', { 'user_id': userId });
    if (process.env.NODE_ENV === 'development') {
      console.log('[GA] User ID set');
    }
  } catch (error) {
    console.error('[GA] Failed to set user ID:', error);
  }
}

export function clearUserId(): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. User ID not cleared.');
    }
    return;
  }

  try {
    window.gtag!('set', { 'user_id': null });
    if (process.env.NODE_ENV === 'development') {
      console.log('[GA] User ID cleared');
    }
  } catch (error) {
    console.error('[GA] Failed to clear user ID:', error);
  }
}

export function setUserProperties(properties: GAUserProperties): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. User properties not set.');
    }
    return;
  }

  try {
    window.gtag!('set', { user_properties: properties });
    if (process.env.NODE_ENV === 'development') {
      console.log('[GA] User properties set:', properties);
    }
  } catch (error) {
    console.error('[GA] Failed to set user properties:', error);
  }
}

// ==========================================
// pokefuta.com イベント (p_ prefix)
// ==========================================

export const pokefutaEvents = {
  // --- 認証系 ---
  loginStart:          (p?: PokefutaEventParams) => trackEvent('p_login_start', p),
  loginSuccess:        (p?: PokefutaEventParams) => trackEvent('p_login_success', p),
  signupStart:         (p?: PokefutaEventParams) => trackEvent('p_signup_start', p),
  signupComplete:      (p?: PokefutaEventParams) => trackEvent('p_signup_complete', p),
  signupEmailConfirmed:(p?: PokefutaEventParams) => trackEvent('p_signup_email_confirmed', p),
  logout:              (p?: PokefutaEventParams) => trackEvent('p_logout', p),

  // --- 訪問記録系 ---
  /**
   * 訪問記録が1件できたこと。**ファネルの完了は p_photo_upload_complete が正**で、
   * こちらはキャラふた固有の意味に絞る（両者を同じパラメータで送ると完了数が二重に見える）。
   */
  visitRegister:       (p?: PokefutaEventParams) => trackEvent('p_visit_register', p),
  visitDelete:         (p?: PokefutaEventParams) => trackEvent('p_visit_delete', p),
  /** 登録後の公開/非公開切り替え。params: is_public(切替後), surface */
  visitVisibilityChange:    (p?: PokefutaEventParams) => trackEvent('p_visit_visibility_change', p),
  /** 非公開バナーのタップ。params: private_count */
  privateVisitsBannerClick: (p?: PokefutaEventParams) => trackEvent('p_private_visits_banner_click', p),
  passportOpen:        (p?: PokefutaEventParams) => trackEvent('p_passport_open', p),
  collectionOpen:      (p?: PokefutaEventParams) => trackEvent('p_collection_open', p),

  // --- 投稿ファネル（SUBMISSION_FUNNEL_EVENTS の順） ---
  submissionEntry:         (p: SubmissionEntryParams)         => trackEvent('p_submission_entry', p),
  submissionStart:         (p: SubmissionEventParams)         => trackEvent('p_submission_start', p),
  submissionPhotoSelected: (p: SubmissionPhotoSelectedParams) => trackEvent('p_submission_photo_selected', p),
  submissionBlocked:       (p: SubmissionBlockedParams)       =>
    trackEvent('p_submission_blocked', {
      block_class: SUBMISSION_BLOCK_CLASS_BY_REASON[p.block_reason],
      ...p,
    }),
  /** 送信（fetch 直前）。submission_kind は必須 — 付け忘れは型で落ちる。 */
  photoUploadStart:        (p: SubmissionEventParams)         => trackEvent('p_photo_upload_start', p),
  /** 完了。写真館の主要コンバージョンで、GA4 のキーイベントはこれだけにする。 */
  photoUploadComplete:     (p: SubmissionCompleteParams)      => trackEvent('p_photo_upload_complete', p),
  /** 失敗。エラーをキーイベントにしない（gtag.ts 末尾の経緯を参照）。 */
  submissionFailed:        (p: SubmissionFailedParams)        => trackEvent('p_submission_failed', p),
  submissionAbandoned:     (p: SubmissionAbandonedParams)     => trackEvent('p_submission_abandoned', p),

  // --- 写真閲覧系 ---
  photoView:           (p?: PokefutaEventParams) => trackEvent('p_photo_view', p),
  photoExpand:         (p?: PokefutaEventParams) => trackEvent('p_photo_expand', p),

  // --- 回遊系 ---
  manholeDetailOpen:   (p?: PokefutaEventParams) => trackEvent('p_manhole_detail_open', p),
  prefectureOpen:      (p?: PokefutaEventParams) => trackEvent('p_prefecture_open', p),
  userProfileOpen:     (p?: PokefutaEventParams) => trackEvent('p_user_profile_open', p),
  mapReturn:           (p?: PokefutaEventParams) => trackEvent('p_map_return', p),

  // --- ソーシャル共有系 ---
  shareClick:          (p?: PokefutaEventParams) => trackEvent('p_share_click', p),
  shareX:              (p?: PokefutaEventParams) => trackEvent('p_share_x', p),
  shareLine:           (p?: PokefutaEventParams) => trackEvent('p_share_line', p),
  copyLink:            (p?: PokefutaEventParams) => trackEvent('p_copy_link', p),

  // --- 旅・位置情報系 ---
  nearbyOpen:          (p?: PokefutaEventParams) => trackEvent('p_nearby_open', p),
  geolocationEnable:   (p?: PokefutaEventParams) => trackEvent('p_geolocation_enable', p),
  routeOpen:           (p?: PokefutaEventParams) => trackEvent('p_route_open', p),

  // --- SNS導線系 ---
  xLinkClick:          (p?: PokefutaEventParams) => trackEvent('p_x_link_click', p),

  // --- Pokémon GO フレンド募集（GO_FRIEND_EVENTS の順） ---
  /** プロフィール編集画面に到達。設定率の分母。 */
  goFriendEditView:    (p: GoFriendEventParams)  => trackEvent('p_go_friend_edit_view', p),
  goFriendSaved:       (p: GoFriendSavedParams)  => trackEvent('p_go_friend_saved', p),
  /** 公開ページで募集カードが出た。コピー率の分母。 */
  goFriendCardView:    (p: GoFriendEventParams)  => trackEvent('p_go_friend_card_view', p),
  goFriendCodeCopy:    (p: GoFriendEventParams)  => trackEvent('p_go_friend_code_copy', p),

  // --- 蓋コメント（COMMENT_EVENTS の順） ---
  /** スレッドが描画された。全コメント指標の分母。 */
  commentThreadView:   (p: CommentThreadViewParams) => trackEvent('p_comment_thread_view', p),
  /** 未ログインがコンポーザを叩いた。ゲートが何を失わせていたかを示す唯一の数字。 */
  commentLoginPrompt:  (p: CommentEventParams)   => trackEvent('p_comment_login_prompt_click', p),
  commentComposeStart: (p: CommentEventParams)   => trackEvent('p_comment_compose_start', p),
  commentSubmit:       (p: CommentEventParams)   => trackEvent('p_comment_submit', p),
  commentPosted:       (p: CommentPostedParams)  => trackEvent('p_comment_posted', p),
  commentFailed:       (p: CommentFailedParams)  => trackEvent('p_comment_failed', p),
  commentDelete:       (p: CommentEventParams)   => trackEvent('p_comment_delete', p),
  commentReport:       (p: CommentEventParams)   => trackEvent('p_comment_report', p),
};

// ==========================================
// 内部エラー追跡。旧イベント名は GA4 でキーイベント登録されているため使用しない。
// ==========================================

export const errorEvents = {
  api: (
    endpoint: string,
    statusCode: number,
    method: string = 'GET',
    errorMessage?: string,
    additionalParams?: Pick<ApiErrorEventParams, 'is_logged_in' | 'page_type' | 'component'>
  ) =>
    trackEvent('p_api_error', {
      error_type: 'api_error',
      api_path: endpoint,
      endpoint,
      status_code: statusCode,
      method,
      error_message: errorMessage?.slice(0, 100),
      ...additionalParams,
    } satisfies ApiErrorEventParams),

  auth: (errorCode: string) =>
    trackEvent('p_auth_error', { error_code: errorCode }),

  app: (errorCode: string, errorType: string = 'unknown') =>
    trackEvent('p_app_error', { error_code: errorCode, error_type: errorType }),
};

// ==========================================
// デバッグ・初期化関数
// ==========================================

export function isGAInitialized(): boolean {
  return isGtagAvailable();
}

export function debugGA(): void {
  if (!isClientSide()) {
    console.log('[GA Debug] Not on client side');
    return;
  }

  console.log('[GA Debug]', {
    isGtagAvailable: isGtagAvailable(),
    gaId: process.env.NEXT_PUBLIC_GA_ID,
    dataLayerLength: window.dataLayer?.length || 0,
    userAgent: navigator.userAgent,
    cookiesEnabled: navigator.cookieEnabled,
  });

  if (window.dataLayer) {
    console.log('[GA dataLayer]', window.dataLayer.slice(-5));
  }
}
