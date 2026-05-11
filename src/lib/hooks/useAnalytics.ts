/**
 * Google Analytics カスタム Hook
 * コンポーネントでの GA イベント追跡を簡潔に
 */

'use client';

import { useCallback } from 'react';
import {
  trackEvent,
  setUserId,
  clearUserId,
  trackPageView,
  authEvents,
  uploadEvents,
  searchEvents,
  navigationEvents,
  errorEvents,
  GAEventParams,
} from '@/lib/analytics/gtag';

/**
 * Google Analytics カスタム Hook
 *
 * @example
 * const { track, trackView, trackSignIn } = useAnalytics();
 *
 * // 基本的なイベント
 * track('custom_event', { custom_field: 'value' });
 *
 * // 認証イベント
 * trackSignIn();
 *
 * // ファイルアップロード
 * track('upload.success', {
 *   file_size: 1024000,
 *   file_type: 'image/jpeg',
 *   duration_ms: 2000
 * });
 */
export function useAnalytics() {
  // ==========================================
  // 基本的なイベント追跡
  // ==========================================

  const track = useCallback(
    (eventName: string, params?: GAEventParams) => {
      trackEvent(eventName, params);
    },
    []
  );

  // ==========================================
  // ページビュー追跡
  // ==========================================

  const trackView = useCallback(
    (pagePath: string, pageTitle: string, pageType?: string) => {
      trackPageView(pagePath, pageTitle, pageType);
    },
    []
  );

  // ==========================================
  // 認証イベント
  // ==========================================

  const trackSignIn = useCallback((metadata?: GAEventParams) => {
    authEvents.signIn(metadata);
  }, []);

  const trackSignUp = useCallback((metadata?: GAEventParams) => {
    authEvents.signUp(metadata);
  }, []);

  const trackSignOut = useCallback((metadata?: GAEventParams) => {
    authEvents.signOut(metadata);
  }, []);

  // ==========================================
  // ユーザーID管理
  // ==========================================

  const setUser = useCallback((userId: string) => {
    setUserId(userId);
  }, []);

  const clearUser = useCallback(() => {
    clearUserId();
  }, []);

  // ==========================================
  // ファイルアップロード
  // ==========================================

  const trackUploadStart = useCallback(
    (fileSize: number, fileType: string) => {
      uploadEvents.start(fileSize, fileType);
    },
    []
  );

  const trackUploadSuccess = useCallback(
    (
      fileSize: number,
      fileType: string,
      durationMs: number,
      metadata?: GAEventParams
    ) => {
      uploadEvents.success(fileSize, fileType, durationMs, metadata);
    },
    []
  );

  const trackUploadError = useCallback(
    (
      errorCode: string,
      errorMessage: string,
      fileSize?: number,
      metadata?: GAEventParams
    ) => {
      uploadEvents.error(errorCode, errorMessage, fileSize, metadata);
    },
    []
  );

  // ==========================================
  // 検索・フィルタリング
  // ==========================================

  const trackSearch = useCallback(
    (query: string, resultCount: number, metadata?: GAEventParams) => {
      searchEvents.search(query, resultCount, metadata);
    },
    []
  );

  const trackFilterApply = useCallback(
    (filterType: string, filterValue: string, resultCount: number) => {
      searchEvents.filterApply(filterType, filterValue, resultCount);
    },
    []
  );

  // ==========================================
  // ナビゲーション
  // ==========================================

  const trackNavClick = useCallback((navItem: string) => {
    navigationEvents.click(navItem);
  }, []);

  const trackNavBack = useCallback(() => {
    navigationEvents.back();
  }, []);

  // ==========================================
  // エラー追跡
  // ==========================================

  const trackApiError = useCallback(
    (
      endpoint: string,
      statusCode: number,
      errorMessage: string,
      method?: string
    ) => {
      errorEvents.api(endpoint, statusCode, errorMessage, method);
    },
    []
  );

  const trackAuthError = useCallback(
    (errorCode: string, errorMessage: string) => {
      errorEvents.auth(errorCode, errorMessage);
    },
    []
  );

  const trackAppError = useCallback(
    (errorCode: string, errorType?: string) => {
      errorEvents.app(errorCode, errorType);
    },
    []
  );

  return {
    // ==========================================
    // 基本機能
    // ==========================================
    track,
    trackView,

    // ==========================================
    // ユーザー認証
    // ==========================================
    trackSignIn,
    trackSignUp,
    trackSignOut,
    setUser,
    clearUser,

    // ==========================================
    // ファイルアップロード
    // ==========================================
    trackUploadStart,
    trackUploadSuccess,
    trackUploadError,

    // ==========================================
    // 検索・フィルタリング
    // ==========================================
    trackSearch,
    trackFilterApply,

    // ==========================================
    // ナビゲーション
    // ==========================================
    trackNavClick,
    trackNavBack,

    // ==========================================
    // エラー追跡
    // ==========================================
    trackApiError,
    trackAuthError,
    trackAppError,
  };
}
