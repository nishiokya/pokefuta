'use client';

import { useCallback } from 'react';
import {
  trackEvent,
  trackPageView,
  setUserId,
  clearUserId,
  setUserProperties,
  pokefutaEvents,
  errorEvents,
  GAEventParams,
  GAUserProperties,
  PokefutaEventParams,
} from '@/lib/analytics/gtag';

// 後方互換用の内部ヘルパー
const legacyEvents = {
  search: (query: string, resultCount: number, metadata?: GAEventParams) =>
    trackEvent('search', { search_term: query, result_count: resultCount, ...metadata }),
  filterApply: (filterType: string, filterValue: string, resultCount: number) =>
    trackEvent('filter_apply', { filter_type: filterType, filter_value: filterValue, result_count: resultCount }),
  navClick: (navItem: string) =>
    trackEvent('navigation_click', { nav_item: navItem }),
};

export function useAnalytics() {
  // 汎用イベント
  const track = useCallback(
    (eventName: string, params?: GAEventParams) => trackEvent(eventName, params),
    []
  );

  const trackView = useCallback(
    (pagePath: string, pageTitle: string, pageType?: string, isLoggedIn?: boolean) =>
      trackPageView(pagePath, pageTitle, pageType, isLoggedIn),
    []
  );

  // ユーザーID管理
  const setUser = useCallback((userId: string) => setUserId(userId), []);
  const clearUser = useCallback(() => clearUserId(), []);

  // User Properties
  const updateUserProperties = useCallback(
    (props: GAUserProperties) => setUserProperties(props),
    []
  );

  // --- 認証系 ---
  const trackLoginStart    = useCallback((p?: PokefutaEventParams) => pokefutaEvents.loginStart(p), []);
  const trackLoginSuccess  = useCallback((p?: PokefutaEventParams) => pokefutaEvents.loginSuccess(p), []);
  const trackSignupStart   = useCallback((p?: PokefutaEventParams) => pokefutaEvents.signupStart(p), []);
  const trackSignupComplete= useCallback((p?: PokefutaEventParams) => pokefutaEvents.signupComplete(p), []);
  const trackSignupEmailConfirmed = useCallback((p?: PokefutaEventParams) => pokefutaEvents.signupEmailConfirmed(p), []);
  const trackLogout        = useCallback((p?: PokefutaEventParams) => pokefutaEvents.logout(p), []);

  // --- 訪問記録系 ---
  const trackVisitRegister = useCallback((p?: PokefutaEventParams) => pokefutaEvents.visitRegister(p), []);
  const trackVisitDelete   = useCallback((p?: PokefutaEventParams) => pokefutaEvents.visitDelete(p), []);
  const trackPassportOpen  = useCallback((p?: PokefutaEventParams) => pokefutaEvents.passportOpen(p), []);
  const trackCollectionOpen= useCallback((p?: PokefutaEventParams) => pokefutaEvents.collectionOpen(p), []);

  // --- 写真投稿系 ---
  const trackPhotoUploadStart    = useCallback((p?: PokefutaEventParams) => pokefutaEvents.photoUploadStart(p), []);
  const trackPhotoUploadComplete = useCallback((p?: PokefutaEventParams) => pokefutaEvents.photoUploadComplete(p), []);
  const trackPhotoView           = useCallback((p?: PokefutaEventParams) => pokefutaEvents.photoView(p), []);
  const trackPhotoExpand         = useCallback((p?: PokefutaEventParams) => pokefutaEvents.photoExpand(p), []);

  // --- 回遊系 ---
  const trackManholeDetailOpen = useCallback((p?: PokefutaEventParams) => pokefutaEvents.manholeDetailOpen(p), []);
  const trackPrefectureOpen    = useCallback((p?: PokefutaEventParams) => pokefutaEvents.prefectureOpen(p), []);
  const trackUserProfileOpen   = useCallback((p?: PokefutaEventParams) => pokefutaEvents.userProfileOpen(p), []);
  const trackMapReturn         = useCallback((p?: PokefutaEventParams) => pokefutaEvents.mapReturn(p), []);

  // --- ソーシャル共有系 ---
  const trackShareClick = useCallback((p?: PokefutaEventParams) => pokefutaEvents.shareClick(p), []);
  const trackShareX     = useCallback((p?: PokefutaEventParams) => pokefutaEvents.shareX(p), []);
  const trackShareLine  = useCallback((p?: PokefutaEventParams) => pokefutaEvents.shareLine(p), []);
  const trackCopyLink   = useCallback((p?: PokefutaEventParams) => pokefutaEvents.copyLink(p), []);

  // --- 旅・位置情報系 ---
  const trackNearbyOpen       = useCallback((p?: PokefutaEventParams) => pokefutaEvents.nearbyOpen(p), []);
  const trackGeolocationEnable= useCallback((p?: PokefutaEventParams) => pokefutaEvents.geolocationEnable(p), []);
  const trackRouteOpen        = useCallback((p?: PokefutaEventParams) => pokefutaEvents.routeOpen(p), []);

  // --- SNS導線系 ---
  const trackFooterXClick = useCallback((p?: PokefutaEventParams) => pokefutaEvents.footerXClick(p), []);
  const trackXLinkClick = useCallback((p?: PokefutaEventParams) => pokefutaEvents.xLinkClick(p), []);

  // --- 後方互換用 ---
  const trackSearch = useCallback(
    (query: string, resultCount: number, metadata?: GAEventParams) =>
      legacyEvents.search(query, resultCount, metadata),
    []
  );
  const trackFilterApply = useCallback(
    (filterType: string, filterValue: string, resultCount: number) =>
      legacyEvents.filterApply(filterType, filterValue, resultCount),
    []
  );
  const trackNavClick = useCallback((navItem: string) => legacyEvents.navClick(navItem), []);

  // --- 内部エラー追跡 ---
  const trackApiError  = useCallback(
    (endpoint: string, statusCode: number, _errorMessage?: string, method?: string) =>
      errorEvents.api(endpoint, statusCode, method),
    []
  );
  const trackAuthError = useCallback(
    (errorCode: string, _errorMessage?: string) => errorEvents.auth(errorCode),
    []
  );
  const trackAppError  = useCallback(
    (errorCode: string, errorType?: string) => errorEvents.app(errorCode, errorType),
    []
  );

  return {
    track,
    trackView,
    setUser,
    clearUser,
    updateUserProperties,

    // 認証系
    trackLoginStart,
    trackLoginSuccess,
    trackSignupStart,
    trackSignupComplete,
    trackSignupEmailConfirmed,
    trackLogout,

    // 訪問記録系
    trackVisitRegister,
    trackVisitDelete,
    trackPassportOpen,
    trackCollectionOpen,

    // 写真投稿系
    trackPhotoUploadStart,
    trackPhotoUploadComplete,
    trackPhotoView,
    trackPhotoExpand,

    // 回遊系
    trackManholeDetailOpen,
    trackPrefectureOpen,
    trackUserProfileOpen,
    trackMapReturn,

    // ソーシャル共有系
    trackShareClick,
    trackShareX,
    trackShareLine,
    trackCopyLink,

    // 旅・位置情報系
    trackNearbyOpen,
    trackGeolocationEnable,
    trackRouteOpen,

    // SNS導線系
    trackFooterXClick,
    trackXLinkClick,

    // 内部エラー追跡
    trackApiError,
    trackAuthError,
    trackAppError,

    // 後方互換
    trackSearch,
    trackFilterApply,
    trackNavClick,
  };
}
