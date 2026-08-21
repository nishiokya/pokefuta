'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAnalytics } from './useAnalytics';
import type {
  PhotoSource,
  SubmissionBlockPhase,
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
 *   funnel.blocked('invalid_gps', 'photo');       // 送信に進めず止まった（理由 × 位置）
 *   funnel.submitting(); / funnel.completed(); / funnel.failed();
 *
 * 数え方の約束（軸を混ぜないための3つ）:
 * - **到達の終端**は `p_photo_upload_complete` か `p_submission_abandoned` のどちらか1つ。
 *   `p_submission_failed` は**試行の結果**であって到達の終端ではない
 *   （失敗して再試行し完了した人は complete、失敗したまま去った人は
 *   `abandoned{last_step:'failed'}` に出る）。両方を終端として足さない。
 * - **送信済みの試行**は `p_photo_upload_start`
 *   = complete + failed + blocked{block_phase:'postsend'} で閉じる。
 *   サーバーが差し戻したものを失敗に混ぜないので、この等式が成り立つ。
 * - **詰まった人数**は `p_submission_blocked{is_repeat:false}`。
 *   件数そのものは再試行のたびに増える。
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
  /** 送信した回数。`submitting()` で増える。送信前は 0。 */
  const attemptRef = useRef(0);
  /** この写真で既に送った (理由 × 位置)。再試行の重複を is_repeat で畳む。 */
  const seenBlocksRef = useRef<Set<string>>(new Set());
  /** 直近のブロックがどの位置で起きたか。離脱イベントに理由と一緒に載せる。 */
  const blockPhaseRef = useRef<SubmissionBlockPhase | undefined>(undefined);

  const start = useCallback(() => {
    startedAtRef.current = Date.now();
    trackSubmissionStart({ submission_kind, attempt_no: 0 });
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
      blockPhaseRef.current = undefined;
      // 写真を選び直したら詰まりも数え直す。別の写真で同じ理由に当たったのは
      // 「同じ人が同じ壁に2回ぶつかった」であって、再試行の重複ではない。
      seenBlocksRef.current.clear();
      trackSubmissionPhotoSelected({
        submission_kind,
        attempt_no: attemptRef.current,
        ...params,
      });
    },
    [submission_kind, trackSubmissionPhotoSelected]
  );

  /**
   * 送信に進めず止まったこと。位置（block_phase）は理由と直交する軸なので必ず渡す。
   * `postsend` はサーバーが差し戻した場合だけ — ここを間違えると
   * 「送信した数 = 完了 + 失敗 + postsend の差し戻し」が閉じなくなる。
   */
  const blocked = useCallback(
    (block_reason: SubmissionBlockReason, block_phase: SubmissionBlockPhase) => {
      stepRef.current = 'blocked';
      blockReasonRef.current = block_reason;
      blockPhaseRef.current = block_phase;

      const key = `${block_reason}:${block_phase}`;
      const is_repeat = seenBlocksRef.current.has(key);
      seenBlocksRef.current.add(key);

      trackSubmissionBlocked({
        submission_kind,
        block_reason,
        block_phase,
        is_repeat,
        attempt_no: attemptRef.current,
        photo_source: selectedPhotoSourceRef.current,
      });
    },
    [submission_kind, trackSubmissionBlocked]
  );

  const submitting = useCallback(() => {
    stepRef.current = 'submitting';
    blockReasonRef.current = undefined;
    blockPhaseRef.current = undefined;
    attemptRef.current += 1;
  }, []);

  const completed = useCallback(() => {
    completedRef.current = true;
  }, []);

  const failed = useCallback(() => {
    stepRef.current = 'failed';
  }, []);

  /** 以降のイベントに載せる、選ばれた写真の入力手段。 */
  const photoSource = useCallback((): PhotoSource | undefined => selectedPhotoSourceRef.current, []);

  /** この到達で何回目の送信か。送信・完了・失敗の各イベントに載せる。 */
  const attemptNo = useCallback((): number => attemptRef.current, []);

  useEffect(() => {
    // 離脱は2経路ある。片方だけでは systematically 取りこぼす。
    //
    // 1. pagehide — タブを閉じる、URL直打ち、外部サイトへ。
    //    beforeunload と違いモバイルの bfcache 遷移でも発火する。
    // 2. アンマウント — Next.js の <Link> によるクライアント遷移。
    //    ドキュメントを破棄しないので pagehide は**発火しない**。
    //    ヘッダーと下タブは常時表示なので、実際にはこちらが最頻経路。
    //
    // visibilitychange は使わない。別アプリへ切り替えただけでも hidden になり、
    // 戻ってくる人まで離脱に数えてしまう。
    const emitAbandoned = () => {
      if (completedRef.current || abandonSentRef.current) return;
      abandonSentRef.current = true;
      trackSubmissionAbandoned({
        submission_kind,
        last_step: stepRef.current,
        dwell_ms: Date.now() - startedAtRef.current,
        block_reason: blockReasonRef.current,
        block_phase: blockPhaseRef.current,
        attempt_no: attemptRef.current,
        photo_source: selectedPhotoSourceRef.current,
      });
    };

    window.addEventListener('pagehide', emitAbandoned);
    return () => {
      window.removeEventListener('pagehide', emitAbandoned);
      // クライアント遷移でここに来る。abandonSentRef が二重送信を防ぐので、
      // pagehide が既に送っていれば何もしない。
      emitAbandoned();
    };
    // 依存を空にするのは、クリーンアップをアンマウント時だけに限るため。
    // submission_kind は呼び出し側で固定のリテラル、trackSubmissionAbandoned は
    // useAnalytics の安定した useCallback なので、閉じ込めても古い値にならない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    start,
    setPhotoSource,
    consumePhotoSource,
    photoSource,
    attemptNo,
    photoSelected,
    blocked,
    submitting,
    completed,
    failed,
  };
}
