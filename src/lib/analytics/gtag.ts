/**
 * Google Analytics 4 ユーティリティ関数
 * 型安全なGA追跡とSSR対応
 */

// ==========================================
// 型定義
// ==========================================

export interface GAEventParams {
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface GAUserProperties {
  [key: string]: string | number | boolean | undefined;
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

/**
 * クライアント側でのみ実行されるかをチェック
 */
function isClientSide(): boolean {
  return typeof window !== 'undefined';
}

/**
 * gtag が利用可能かをチェック
 */
function isGtagAvailable(): boolean {
  return isClientSide() && typeof window.gtag === 'function';
}

// ==========================================
// コア関数: イベント送信
// ==========================================

/**
 * GA4 イベントを送信
 *
 * @param eventName - イベント名 (例: 'file_upload', 'sign_in')
 * @param eventParams - イベントパラメータ
 * @param context - 追加コンテキスト情報
 *
 * @example
 * trackEvent('file_upload', {
 *   file_size: 1024000,
 *   file_type: 'image/jpeg',
 *   manhole_id: 123
 * });
 */
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

  // ==========================================
  // 共通属性の自動付与
  // ==========================================
  const enrichedParams: GAEventParams = {
    // ページ情報（デフォルト値）
    page_path: isClientSide() ? window.location.pathname : undefined,
    page_title: isClientSide() ? document.title : undefined,
    // タイムスタンプ
    event_timestamp: new Date().toISOString(),
    // ユーザーロケール
    user_locale: navigator.language || 'ja-JP',
    // カスタムコンテキスト
    ...context,
    // eventParams で明示指定された値を優先
    ...eventParams,
  };

  // ==========================================
  // 開発環境でのログ出力
  // ==========================================
  if (process.env.NODE_ENV === 'development') {
    console.log('[GA Event]', {
      event: eventName,
      params: enrichedParams,
      timestamp: new Date().toISOString(),
    });
  }

  // ==========================================
  // GA に送信
  // ==========================================

  try {
    window.gtag!('event', eventName, enrichedParams);
  } catch (error) {
    console.error('[GA] Failed to track event:', eventName, error);
  }
}

// ==========================================
// ページビュー関数
// ==========================================

/**
 * ページビューイベントを送信
 * 必要な箇所で明示的に呼び出して使用する
 */
export function trackPageView(
  pagePath: string,
  pageTitle: string,
  pageType?: string
): void {
  trackEvent('page_view', {
    page_path: pagePath,
    page_title: pageTitle,
    page_type: pageType,
  });
}

// ==========================================
// ユーザー設定関数
// ==========================================

/**
 * ユーザー ID を GA に設定
 * ログイン時に呼び出す
 *
 * @param userId - Supabase auth.user.id
 *
 * @example
 * setUserId(session.user.id);
 */
export function setUserId(userId: string): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. User ID not set.');
    }
    return;
  }

  try {
    // gtag('set') を使用してユーザーIDを設定
    window.gtag!('set', { 'user_id': userId });
    if (process.env.NODE_ENV === 'development') {
      console.log('[GA] User ID set');
    }
  } catch (error) {
    console.error('[GA] Failed to set user ID:', error);
  }
}

/**
 * ユーザー ID をクリア
 * ログアウト時に呼び出す
 */
export function clearUserId(): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. User ID not cleared.');
    }
    return;
  }

  try {
    // gtag('set') を使用してユーザーIDをクリア
    window.gtag!('set', { 'user_id': null });
    if (process.env.NODE_ENV === 'development') {
      console.log('[GA] User ID cleared');
    }
  } catch (error) {
    console.error('[GA] Failed to clear user ID:', error);
  }
}

/**
 * ユーザープロパティを設定
 * ユーザーの属性情報（ロール、プラン等）を設定
 *
 * @param properties - ユーザープロパティ
 *
 * @example
 * setUserProperties({
 *   user_tier: 'free',
 *   is_beta_tester: false,
 *   registration_source: 'organic'
 * });
 */
export function setUserProperties(
  properties: GAUserProperties
): void {
  if (!isGtagAvailable()) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GA] gtag not available. User properties not set.');
    }
    return;
  }

  try {
    window.gtag!('set', {
      user_properties: properties,
    });
    if (process.env.NODE_ENV === 'development') {
      console.log('[GA] User properties set:', properties);
    }
  } catch (error) {
    console.error('[GA] Failed to set user properties:', error);
  }
}

// ==========================================
// カテゴリ別追跡関数
// ==========================================

/**
 * 認証イベント
 */
export const authEvents = {
  signIn: (metadata?: GAEventParams) =>
    trackEvent('sign_in', metadata),

  signUp: (metadata?: GAEventParams) =>
    trackEvent('sign_up', metadata),

  signOut: (metadata?: GAEventParams) =>
    trackEvent('sign_out', metadata),
};

/**
 * ファイルアップロードイベント
 */
export const uploadEvents = {
  start: (fileSize: number, fileType: string) =>
    trackEvent('upload_start', { file_size: fileSize, file_type: fileType }),

  success: (
    fileSize: number,
    fileType: string,
    durationMs: number,
    metadata?: GAEventParams
  ) =>
    trackEvent('file_upload', {
      file_size: fileSize,
      file_type: fileType,
      upload_duration_ms: durationMs,
      ...metadata,
    }),

  error: (
    errorCode: string,
    fileSize?: number,
    metadata?: GAEventParams
  ) =>
    trackEvent('upload_error', {
      error_code: errorCode,
      file_size: fileSize,
      ...metadata,
    }),
};

/**
 * 検索イベント
 */
export const searchEvents = {
  search: (query: string, resultCount: number, metadata?: GAEventParams) =>
    trackEvent('search', {
      search_term: query,
      result_count: resultCount,
      ...metadata,
    }),

  filterApply: (filterType: string, filterValue: string, resultCount: number) =>
    trackEvent('filter_apply', {
      filter_type: filterType,
      filter_value: filterValue,
      result_count: resultCount,
    }),
};

/**
 * ナビゲーション・クリックイベント
 */
export const navigationEvents = {
  click: (navItem: string) =>
    trackEvent('navigation_click', {
      nav_item: navItem,
    }),

  back: () =>
    trackEvent('navigation_back'),
};

/**
 * エラーイベント
 */
export const errorEvents = {
  api: (
    endpoint: string,
    statusCode: number,
    method: string = 'GET'
  ) =>
    trackEvent('error_event', {
      error_type: 'api_error',
      endpoint,
      status_code: statusCode,
      method,
    }),

  auth: (errorCode: string) =>
    trackEvent('auth_error', {
      error_code: errorCode,
    }),

  app: (errorCode: string, errorType: string = 'unknown') =>
    trackEvent('app_error', {
      error_code: errorCode,
      error_type: errorType,
    }),
};

/**
 * エンゲージメントイベント（将来用）
 */
export const engagementEvents = {
  like: (targetType: string, targetId: string) =>
    trackEvent('engagement_click', {
      engagement_type: 'like',
      target_type: targetType,
      target_id: targetId,
    }),

  bookmark: (targetType: string, targetId: string) =>
    trackEvent('bookmark_click', {
      engagement_type: 'bookmark',
      target_type: targetType,
      target_id: targetId,
    }),

  comment: (targetType: string, targetId: string) =>
    trackEvent('comment_submit', {
      engagement_type: 'comment',
      target_type: targetType,
      target_id: targetId,
    }),
};

// ==========================================
// デバッグ・初期化関数
// ==========================================

/**
 * GA の初期化状態を確認
 */
export function isGAInitialized(): boolean {
  return isGtagAvailable();
}

/**
 * GA 初期化情報をコンソール出力（開発用）
 */
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

  // dataLayer の内容を表示
  if (window.dataLayer) {
    console.log('[GA dataLayer]', window.dataLayer.slice(-5));
  }
}
