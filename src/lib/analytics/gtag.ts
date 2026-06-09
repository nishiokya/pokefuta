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

/** pokefuta.com 共通イベントパラメータ */
export interface PokefutaEventParams extends GAEventParams {
  manhole_id?: string | number;
  prefecture?: string;
  pokemon_ids?: string;    // カンマ区切り文字列 (GA4は配列非対応)
  is_logged_in?: boolean;
  source_app?: 'tracker' | 'map';
}

export interface ApiErrorEventParams extends GAEventParams {
  api_path: string;
  endpoint?: string;
  status_code: number;
  method: string;
  error_message?: string;
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

function isGtagAvailable(): boolean {
  return isClientSide() && typeof window.gtag === 'function';
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
    page_path: isClientSide() ? window.location.pathname : undefined,
    page_title: isClientSide() ? document.title : undefined,
    event_timestamp: new Date().toISOString(),
    user_locale: navigator.language || 'ja-JP',
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
  visitRegister:       (p?: PokefutaEventParams) => trackEvent('p_visit_register', p),
  visitDelete:         (p?: PokefutaEventParams) => trackEvent('p_visit_delete', p),
  passportOpen:        (p?: PokefutaEventParams) => trackEvent('p_passport_open', p),
  collectionOpen:      (p?: PokefutaEventParams) => trackEvent('p_collection_open', p),

  // --- 写真投稿系 ---
  photoUploadStart:    (p?: PokefutaEventParams) => trackEvent('p_photo_upload_start', p),
  photoUploadComplete: (p?: PokefutaEventParams) => trackEvent('p_photo_upload_complete', p),
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
  footerXClick:        (p?: PokefutaEventParams) => trackEvent('p_footer_x_click', p),
  xLinkClick:          (p?: PokefutaEventParams) => trackEvent('p_x_link_click', p),
};

// ==========================================
// 内部エラー追跡 (prefix なし、内部用)
// ==========================================

export const errorEvents = {
  api: (
    endpoint: string,
    statusCode: number,
    method: string = 'GET',
    errorMessage?: string
  ) =>
    trackEvent('error_event', {
      error_type: 'api_error',
      api_path: endpoint,
      endpoint,
      status_code: statusCode,
      method,
      error_message: errorMessage?.slice(0, 100),
    } satisfies ApiErrorEventParams),

  auth: (errorCode: string) =>
    trackEvent('auth_error', { error_code: errorCode }),

  app: (errorCode: string, errorType: string = 'unknown') =>
    trackEvent('app_error', { error_code: errorCode, error_type: errorType }),
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
