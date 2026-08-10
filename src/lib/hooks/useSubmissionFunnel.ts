'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAnalytics } from './useAnalytics';
import type {
  PhotoSource,
  SubmissionBlockReason,
  SubmissionKind,
  SubmissionStep,
} from '@/lib/analytics/gtag';

/**
 * 投稿ファネルの状態を持ち、離脱を1回だけ送るフック。
 *
 * キャラふた（/upload）とデザインふた（/design-manholes/new）で同じ離脱判定を使う。
 * イベント名の台帳は `SUBMISSION_FUNNEL_EVENTS`（src/lib/analytics/gtag.ts）。
 *
 * 使い方:
 *   const funnel = useSubmissionFunnel('character');
 *   useEffect(() => funnel.start(), []);          // 画面到達
 *   funnel.setPhotoSource('camera');              // カメラ導線から onDrop を呼ぶ直前
 *   funnel.photoSelected({ has_gps: true });      // 写真を選んだ
 *   funnel.blocked('invalid_gps');                // 送信に進めず止まった
 *   funnel.submitting(); / funnel.completed(); / funnel.failed();
 */
export function useSubmissionFunnel(submission_kind: SubmissionKind) {
  const {
    trackSubmissionStart,
    trackSubmissionPhotoSelected,
    trackSubmissionBlocked,
    trackSubmissionAbandoned,
  } = useAnalytics();

  const startedAtRef = useRef<number>(Date.now());
  const stepRef = useRef<SubmissionStep>('start');
  const blockReasonRef = useRef<SubmissionBlockReason | undefined>(undefined);
  /** 次に onDrop が読む入力手段。カメラ導線が1回だけ 'camera' に上書きする。 */
  const photoSourceRef = useRef<PhotoSource>('library');
  /** 直近に選ばれた写真の入力手段。以降のイベントに載せる。 */
  const selectedPhotoSourceRef = useRef<PhotoSource | undefined>(undefined);
  const completedRef = useRef(false);
  const abandonSentRef = useRef(false);

  const start = useCallback(() => {
    startedAtRef.current = Date.now();
    trackSubmissionStart({ submission_kind });
  }, [submission_kind, trackSubmissionStart]);

  /**
   * カメラ導線から onDrop を呼ぶ直前に 'camera' を立てる。onDrop 側が1回だけ消費する。
   * 引数名に `source` を使わないのは、GA4 の予約語との取り違えを検査が拾うため。
   */
  const setPhotoSource = useCallback((nextSource: PhotoSource) => {
    photoSourceRef.current = nextSource;
  }, []);

  /**
   * 入力手段を取り出して 'library' に戻す。
   * カメラ撮影の判定が、次にドロップした写真へ持ち越さないようにする。
   */
  const consumePhotoSource = useCallback((): PhotoSource => {
    const used = photoSourceRef.current;
    photoSourceRef.current = 'library';
    selectedPhotoSourceRef.current = used;
    return used;
  }, []);

  const photoSelected = useCallback(
    (params: { photo_source: PhotoSource; has_gps: boolean; has_exif_datetime?: boolean }) => {
      // 写真を選び直したら必ず photo_selected へ戻す。
      // `start` のときだけ進めると、blocked / failed の後に良い写真へ差し替えて
      // 離脱した人が「blocked なのに理由なし」という矛盾した離脱データになる。
      stepRef.current = 'photo_selected';
      blockReasonRef.current = undefined;
      trackSubmissionPhotoSelected({ submission_kind, ...params });
    },
    [submission_kind, trackSubmissionPhotoSelected]
  );

  const blocked = useCallback(
    (block_reason: SubmissionBlockReason) => {
      stepRef.current = 'blocked';
      blockReasonRef.current = block_reason;
      trackSubmissionBlocked({
        submission_kind,
        block_reason,
        photo_source: selectedPhotoSourceRef.current,
      });
    },
    [submission_kind, trackSubmissionBlocked]
  );

  const submitting = useCallback(() => {
    stepRef.current = 'submitting';
    blockReasonRef.current = undefined;
  }, []);

  const completed = useCallback(() => {
    completedRef.current = true;
  }, []);

  const failed = useCallback(() => {
    stepRef.current = 'failed';
  }, []);

  /** 以降のイベントに載せる、選ばれた写真の入力手段。 */
  const photoSource = useCallback((): PhotoSource | undefined => selectedPhotoSourceRef.current, []);

  useEffect(() => {
    // pagehide は beforeunload と違い、モバイルの bfcache 遷移でも発火する。
    // visibilitychange は別アプリへ切り替えただけでも hidden になり、
    // 戻ってくる人まで離脱に数えてしまうので使わない。
    const handlePageHide = () => {
      if (completedRef.current || abandonSentRef.current) return;
      abandonSentRef.current = true;
      trackSubmissionAbandoned({
        submission_kind,
        last_step: stepRef.current,
        dwell_ms: Date.now() - startedAtRef.current,
        block_reason: blockReasonRef.current,
        photo_source: selectedPhotoSourceRef.current,
      });
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [submission_kind, trackSubmissionAbandoned]);

  return {
    start,
    setPhotoSource,
    consumePhotoSource,
    photoSource,
    photoSelected,
    blocked,
    submitting,
    completed,
    failed,
  };
}
