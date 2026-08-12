'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { commentThreadState, pokefutaEvents } from '@/lib/analytics/gtag';
import CommentComposer from './CommentComposer';
import CommentItem, { type PublicComment } from './CommentItem';

const PAGE_SIZE = 50;

interface Props {
  manholeId: number | string;
  /**
   * `null` は「まだ分からない」。セッション取得は蓋の取得と別便なので、
   * false で代用すると**ログイン済みの人に一瞬ログインCTAが出る**。
   * その窓でCTAを押されると、ゲート撤去の効果を測る唯一の指標
   * `p_comment_login_prompt_click` がログイン済みの人で汚れ、
   * さらに本人は不要なログイン画面へ飛ばされる。
   */
  isLoggedIn: boolean | null;
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
  const [total, setTotal] = useState(0);
  // 続きの有無はサーバに直接答えてもらう。保持件数と total の差から導かない。
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');
  const [busyCommentId, setBusyCommentId] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  // 1スレッドにつき1回だけ送るもの。件数の水増しを防ぐ。
  const threadViewSentRef = useRef(false);
  const composeStartSentRef = useRef(false);

  // 取得の世代。古い世代の応答は state に反映しない。
  //
  // **蓋から蓋への遷移では、現状これは発火しない。** App Router は
  // `/manhole/[id]` のパラメータが変わるとページを作り直すので、この
  // コンポーネントはアンマウントされ、state ごと捨てられる。
  // 実測（Playwright で遷移前後の mount/unmount を記録）: 遷移時に
  // UNMOUNT → MOUNT が起きる。したがって「蓋Bに蓋Aのコメントが残る」
  // 「進行中フラグが固まる」はいずれも現状では起こらない。
  //
  // それでも残しているのは、この安全性が**マウントの寿命という外部の前提**に
  // ぶら下がっているため。Phase 2 で統合スレッドを別の場所に置いたり、
  // モーダルに載せたりして再マウントされなくなった瞬間、**黙って**
  // 「別の蓋のコメントが混ざる」に戻る。3行の保険でその失敗を静かでなくする。
  const requestGenerationRef = useRef(0);

  const threadState = commentThreadState(comments.length);

  const loadComments = useCallback(async () => {
    // 取得を始めるときに前の内容を消す。現状は遷移でアンマウントされるので
    // 実害は出ないが、それはマウントの寿命に依存した安全性でしかない
    // （requestGenerationRef のコメント参照）。
    const generation = ++requestGenerationRef.current;
    setComments([]);
    setTotal(0);
    setHasMore(false);
    setLoading(true);
    setError(null);

    // 進行中フラグも戻す。世代照合は `finally` にも掛かっているので、
    // これが無いと「応答が返るころに世代が変わっていた」ケースで
    // `setSubmitting(false)` ごと捨てられ、ボタンが無効のまま固定される。
    // 解除を無条件にするのでは駄目で（新しい世代の操作中に古い応答が来て
    // 再有効化し、二重送信の窓を開ける）、開始時に戻すのが正しい形。
    setSubmitting(false);
    setLoadingMore(false);
    setBusyCommentId(null);
    try {
      const response = await fetch(
        `/api/manholes/${manholeId}/comments?limit=${PAGE_SIZE}&offset=0`
      );
      const data = await response.json();
      // 自分より新しい取得が始まっていたら、この応答は捨てる。
      if (generation !== requestGenerationRef.current) return;
      if (response.ok && data.success) {
        // API は新しい順。表示は会話の流れどおり古い順に戻す。
        const loaded: PublicComment[] = [...(data.comments || [])].reverse();
        setComments(loaded);
        setTotal(typeof data.total === 'number' ? data.total : loaded.length);
        setHasMore(Boolean(data.has_more));

        // **分母は「読み込みに成功して描画されたスレッド」だけ。**
        // 読み込みが失敗した状態で送ると、障害が「コメント0件の部屋を見た人」として
        // 積み上がり、thread_state='empty' の変換率と分母の両方が壊れる。
        // この計画の当否は p_comment_posted / p_comment_thread_view で判定するので、
        // ここが汚れると判定式そのものが成立しない。
        if (!threadViewSentRef.current) {
          threadViewSentRef.current = true;
          pokefutaEvents.commentThreadView({
            surface,
            thread_state: commentThreadState(loaded.length),
            thread_size: loaded.length,
          });
        }
      } else {
        setError(data.error || 'コメントの読み込みに失敗しました');
      }
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setError('コメントの読み込み中にエラーが発生しました');
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  }, [manholeId, surface]);

  useEffect(() => {
    threadViewSentRef.current = false;
    composeStartSentRef.current = false;
    setReportedIds(new Set());
    setDraft('');
    loadComments();
  }, [loadComments]);

  // 古い側へ遡る。起点が常に最新なので、増えても新着が押し出されない。
  //
  // 続きは **今持っている中でいちばん古い1件をカーソルに**して取る。
  // 件数を offset にすると、取りに行く間に新着が入った分だけ窓がずれて
  // 同じコメントが二度返る（React の duplicate key と件数の不整合）。
  const loadOlder = async () => {
    const oldest = comments[0];
    if (!oldest) return;

    const generation = requestGenerationRef.current;
    setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        before_created_at: oldest.created_at,
        before_id: oldest.id,
      });
      const response = await fetch(`/api/manholes/${manholeId}/comments?${params}`);
      const data = await response.json();
      // 遡っている間に別の蓋へ移っていたら捨てる。
      if (generation !== requestGenerationRef.current) return;
      if (response.ok && data.success) {
        const older: PublicComment[] = [...(data.comments || [])].reverse();
        setComments((prev) => {
          // カーソルで境界は揃うが、念のため id で重複を落とす。
          // 表示が壊れるより、1件多く捨てるほうがましなので防御を二重にする。
          const seen = new Set(prev.map((c) => c.id));
          return [...older.filter((c) => !seen.has(c.id)), ...prev];
        });
        // total はカーソル付きの取得では返らない（フィルタ後の件数になるため）。
        // 見出しの件数は初回取得の値を保つ。
        setHasMore(Boolean(data.has_more));
      } else {
        setError(data.error || 'コメントの読み込みに失敗しました');
      }
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setError('コメントの読み込み中にエラーが発生しました');
    } finally {
      if (generation === requestGenerationRef.current) setLoadingMore(false);
    }
  };

  const handleSubmit = async () => {
    const content = draft.trim();
    if (!content || content.length > 1000) return;

    // GET と同じ世代照合を書き込み側にも入れる。捨てるのは
    // 「もう表示していないスレッドへの反映」だけで、投稿そのものは
    // サーバで完了していてよい。
    const generation = requestGenerationRef.current;
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
      if (generation !== requestGenerationRef.current) return;

      if (response.ok && data.success) {
        setComments((prev) => [...prev, data.comment]);
        setTotal((prev) => prev + 1);
        setDraft('');
        composeStartSentRef.current = false;
        pokefutaEvents.commentPosted({ surface, thread_state: threadState, is_reply: false });
        return;
      }

      // 失敗の理由を機械可読に残す。ここが丸まると
      // 「レート制限で弾かれている」と「壊れている」が GA4 上で区別できない。
      const errorCode =
        response.status === 401 ? 'unauthorized'
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
      if (generation !== requestGenerationRef.current) return;
      pokefutaEvents.commentFailed({
        surface,
        thread_state: threadState,
        error_code: 'network',
      });
      setError('コメントの投稿中にエラーが発生しました');
    } finally {
      if (generation === requestGenerationRef.current) setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const generation = requestGenerationRef.current;
    setBusyCommentId(commentId);
    setError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (generation !== requestGenerationRef.current) return;
      if (response.ok && data.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setTotal((prev) => Math.max(0, prev - 1));
        pokefutaEvents.commentDelete({ surface, thread_state: threadState });
      } else {
        setError(data.error || 'コメントの削除に失敗しました');
      }
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setError('コメントの削除中にエラーが発生しました');
    } finally {
      if (generation === requestGenerationRef.current) setBusyCommentId(null);
    }
  };

  const handleReport = async (commentId: string) => {
    const generation = requestGenerationRef.current;
    setBusyCommentId(commentId);
    setError(null);
    try {
      const response = await fetch(`/api/manholes/${manholeId}/comments/${commentId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (generation !== requestGenerationRef.current) return;
      if (response.ok && data.success) {
        // 既に通報済み（`already_reported`）でも利用者には同じ結果を見せる。
        // 「誰が通報したか」を推測させないため。
        setReportedIds((prev) => new Set(prev).add(commentId));
        pokefutaEvents.commentReport({ surface, thread_state: threadState });
      } else {
        setError(data.error || '通報を受け付けられませんでした');
      }
    } catch {
      if (generation !== requestGenerationRef.current) return;
      setError('通報の送信中にエラーが発生しました');
    } finally {
      if (generation === requestGenerationRef.current) setBusyCommentId(null);
    }
  };

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 font-pixelJp text-[13.5px] font-bold text-[#2c2a26]">
        <MessageCircle className="h-3.5 w-3.5 text-[#6f6657]" strokeWidth={2.2} />
        コメント
        {/* 件数がゼロのときは件数を出さない。「0件」を482枚に並べるのが最悪の選択肢。 */}
        {total > 0 && (
          <span className="font-pixelJp text-[11px] font-normal text-[#9b917e]">
            {total}
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

        {hasMore && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingMore}
            className="self-start font-pixelJp text-xs text-[#6f6657] underline decoration-[#e9dfc7] underline-offset-2 disabled:opacity-50"
          >
            {loadingMore ? '読み込み中…' : '以前のコメントを見る'}
          </button>
        )}

        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            busy={busyCommentId === comment.id}
            canReport={isLoggedIn === true}
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
          loginRedirectPath={`/manhole/${manholeId}`}
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
