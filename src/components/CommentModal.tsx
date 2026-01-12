'use client';

import { useState, useEffect } from 'react';
import { X, Send, Loader } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email?: string | null;
    display_name?: string | null;
  };
}

interface CommentModalProps {
  isOpen: boolean;
  visitId: string;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export default function CommentModal({
  isOpen,
  visitId,
  onClose,
  onCommentAdded,
}: CommentModalProps) {
    const getUserLabel = (comment: Comment) => {
      const name = comment.user.display_name;
      if (name && name.trim().length > 0) return name;
      const email = comment.user.email;
      if (email && email.trim().length > 0) return email;
      const uid = comment.user.id;
      if (uid && uid.length >= 8) return `ユーザー:${uid.slice(0, 8)}`;
      return '名無し';
    };

    const getUserInitial = (comment: Comment) => {
      const label = getUserLabel(comment);
      return label?.[0]?.toUpperCase() || 'U';
    };

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadComments();
    }
  }, [isOpen, visitId]);

  const loadComments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/visits/${visitId}/comments`);
      const data = await response.json();

      if (response.ok && data.success) {
        setComments(data.comments || []);
      } else {
        setError(data.error || 'コメントの読み込みに失敗しました');
      }
    } catch (err) {
      console.error('Failed to load comments:', err);
      setError('コメントの読み込み中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) {
      return;
    }

    if (newComment.length > 1000) {
      setError('コメントは1000文字以内で入力してください');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/visits/${visitId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newComment.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // コメントを先頭に追加
        setComments([data.comment, ...comments]);
        setNewComment('');
        // 親コンポーネントに通知
        if (onCommentAdded) {
          onCommentAdded();
        }
      } else {
        setError(data.error || 'コメントの投稿に失敗しました');
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
      setError('コメントの投稿中にエラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] sm:max-h-[90vh] bg-rpg-bgLight border-4 border-rpg-border flex flex-col m-0 sm:m-4 rounded-t-lg sm:rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-2 border-rpg-border bg-rpg-bgDark">
          <h2 className="font-pixelJp text-lg text-rpg-textGold">
            コメント
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-rpg-border/30 transition-colors rounded"
          >
            <X className="w-5 h-5 text-rpg-textGold" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 text-rpg-textDark animate-spin" />
              <span className="ml-2 font-pixelJp text-sm text-rpg-textDark">
                読み込み中...
              </span>
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <p className="font-pixelJp text-sm text-rpg-textDark opacity-70">
                まだコメントがありません
              </p>
            </div>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="bg-rpg-bgDark border-2 border-rpg-border p-3 rounded"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-rpg-yellow border-2 border-rpg-border rounded-full flex items-center justify-center">
                    <span className="font-pixelJp text-xs text-rpg-textDark">
                      {getUserInitial(comment)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-pixelJp text-sm text-rpg-textGold font-bold truncate">
                        {getUserLabel(comment)}
                      </span>
                      <span className="font-pixelJp text-xs text-rpg-textDark opacity-70 flex-shrink-0">
                        {format(new Date(comment.created_at), 'M/d HH:mm', { locale: ja })}
                      </span>
                    </div>
                    <p className="font-pixelJp text-sm text-rpg-textDark whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-4 pb-2">
            <div className="bg-rpg-red/20 border-2 border-rpg-red p-2 rounded">
              <p className="font-pixelJp text-xs text-rpg-red">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Comment Input */}
        <form onSubmit={handleSubmit} className="p-4 border-t-2 border-rpg-border bg-rpg-bgDark">
          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="コメントを入力..."
              className="flex-1 bg-rpg-bgLight border-2 border-rpg-border p-2 font-pixelJp text-sm text-rpg-textDark placeholder-rpg-textDark/50 resize-none focus:outline-none focus:border-rpg-yellow rounded"
              rows={2}
              maxLength={1000}
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={submitting || !newComment.trim()}
              className="rpg-button rpg-button-success px-4 self-end disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <Loader className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="font-pixelJp text-xs text-rpg-textDark opacity-70">
              {newComment.length}/1000
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
