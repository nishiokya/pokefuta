'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { commentThreadState, pokefutaEvents } from '@/lib/analytics/gtag';
import CommentComposer from './CommentComposer';
import CommentItem, { type PublicComment } from './CommentItem';

interface Props {
  manholeId: number | string;
  isLoggedIn: boolean;
  /** 発生箇所。GA4 予約語の source は使わない。 */
  surface?: string;
}

/**
 * 蓋のコメントスレッド。
 *
 * **未ログインにも常に描画する。** 以前は `(comments.length > 0 || currentUserId)` で
 * 囲われており、コメント6件・蓋482枚という比率のため、ほぼ全ての蓋で
 * 未ログイン訪問者にはコメント欄が存在しなかった。新規定着がゴールである以上、
 * 「人がいる／書いてよい」と最初に気づくべき相手にだけ見えていなかったことになる。
 */
export default function ManholeCommentThread({ manholeId, isLoggedIn, surface = 'manhole_detail' }: Props) {
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  // 1スレッドにつき1回だけ送るもの。件数の水増しを防ぐ。
  const threadViewSentRef = useRef(false);
  const composeStartSentRef = useRef(false);

  const threadState = commentThreadState(comments.length);

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments?limit=50&offset=0`);
      const data = await response.json();
      if (response.ok && data.success) {
        setComments(data.comments || []);
      } else {
        setError(data.error || 'コメントの読み込みに失敗しました');
      }
    } catch {
      setError('コメントの読み込み中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [manholeId]);

  useEffect(() => {
    threadViewSentRef.current = false;
    composeStartSentRef.current = false;
    setReportedIds(new Set());
    setDraft('');
    loadComments();
  }, [loadComments]);

  // **分母。** PV ではなく「スレッドが実際に描画されたこと」を数える。
  useEffect(() => {
    if (loading || threadViewSentRef.current) return;
    threadViewSentRef.current = true;
    pokefutaEvents.commentThreadView({
      surface,
      thread_state: commentThreadState(comments.length),
      thread_size: comments.length,
    });
  }, [loading, comments.length, surface]);

  const handleSubmit = async () => {
    const content = draft.trim();
    if (!content || content.length > 1000) return;

    setSubmitting(true);
    setError(null);
    pokefutaEvents.commentSubmit({ surface, thread_state: threadState });

    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setComments((prev) => [...prev, data.comment]);
        setDraft('');
        composeStartSentRef.current = false;
        pokefutaEvents.commentPosted({ surface, thread_state: threadState, is_reply: false });
        return;
      }

      // 失敗の理由を機械可読に残す。ここが丸まると
      // 「レート制限で弾かれている」と「壊れている」が GA4 上で区別できない。
      const errorCode =
        response.status === 429 ? 'rate_limited'
          : response.status === 401 ? 'unauthorized'
          : response.status === 400 ? 'invalid_content'
          : 'unexpected';

      pokefutaEvents.commentFailed({
        surface,
        thread_state: threadState,
        error_code: errorCode,
        status_code: response.status,
      });

      setError(
        data.message
        || (response.status === 401 ? 'ログインが必要です' : 'コメントの投稿に失敗しました')
      );
    } catch {
      pokefutaEvents.commentFailed({
        surface,
        thread_state: threadState,
        error_code: 'network',
      });
      setError('コメントの投稿中にエラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setBusyCommentId(commentId);
    setError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        pokefutaEvents.commentDelete({ surface, thread_state: threadState });
      } else {
        setError(data.error || 'コメントの削除に失敗しました');
      }
    } catch {
      setError('コメントの削除中にエラーが発生しました');
    } finally {
      setBusyCommentId(null);
    }
  };

  const handleReport = async (commentId: string) => {
    setBusyCommentId(commentId);
    setError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments/${commentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        // 既に通報済み（`already_reported`）でも利用者には同じ結果を見せる。
        // 「誰が通報したか」を推測させないため。
        setReportedIds((prev) => new Set(prev).add(commentId));
        pokefutaEvents.commentReport({ surface, thread_state: threadState });
      } else {
        setError(data.error || '通報を受け付けられませんでした');
      }
    } catch {
      setError('通報の送信中にエラーが発生しました');
    } finally {
      setBusyCommentId(null);
    }
  };

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
        <MessageCircle className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
        コメント
        {/* 件数がゼロのときは件数を出さない。「0件」を482枚に並べるのが最悪の選択肢。 */}
        {comments.length > 0 && (
          <span className="font-pixelJp text-[11px] font-normal text-[#9b917e]">
            {comments.length}
          </span>
        )}
      </h3>

      <div className="flex flex-col gap-3">
        {loading && <p className="font-pixelJp text-xs text-[#9b917e]">読み込み中…</p>}

        {!loading && comments.length === 0 && (
          <p className="font-pixelJp text-xs leading-relaxed text-[#9b917e]">
            まだコメントはありません。最初のひとことを書いてみませんか。
          </p>
        )}

        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            busy={busyCommentId === comment.id}
            canReport={isLoggedIn}
            reported={reportedIds.has(comment.id)}
            onDelete={handleDelete}
            onReport={handleReport}
          />
        ))}

        <CommentComposer
          value={draft}
          onChange={setDraft}
          onSubmit={handleSubmit}
          submitting={submitting}
          isLoggedIn={isLoggedIn}
          onComposeStart={() => {
            if (composeStartSentRef.current) return;
            composeStartSentRef.current = true;
            pokefutaEvents.commentComposeStart({ surface, thread_state: threadState });
          }}
          onLoginPromptClick={() => {
            pokefutaEvents.commentLoginPrompt({ surface, thread_state: threadState });
          }}
        />

        {error && <p className="font-pixelJp text-xs text-[#bf5640]">{error}</p>}

        <p className="font-pixelJp text-[10px] leading-relaxed text-[#9b917e]">
          投稿すると
          <Link href="/terms" className="underline decoration-[#e9dfc7] underline-offset-2">
            利用規約
          </Link>
          に同意したことになります。
        </p>
      </div>
    </div>
  );
}
