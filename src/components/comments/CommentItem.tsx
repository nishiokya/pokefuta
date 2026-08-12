'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Flag, Trash2 } from 'lucide-react';

export interface PublicComment {
  id: string;
  content: string;
  created_at: string;
  is_own: boolean;
  user: {
    display_name: string | null;
    public_user_id: string | null;
  };
}

/**
 * 頭文字バッジの色を `public_user_id` から決める。
 *
 * **auth uid をハッシュ元にしないこと。** 同じ人がいつも同じ色になる性質は、
 * uid から作ると DOM に弱いオラクルを埋めることになる。`public_user_id` は
 * そもそも公開URLに出ているIDなので、ここから作るぶんには何も増えない。
 */
function badgeHue(publicUserId: string | null): number {
  if (!publicUserId) return 210;
  let hash = 0;
  for (let i = 0; i < publicUserId.length; i += 1) {
    hash = (hash * 31 + publicUserId.charCodeAt(i)) % 360;
  }
  return hash;
}

const userLabel = (comment: PublicComment) =>
  comment.user.display_name?.trim() || '名無しのトレーナー';

interface Props {
  comment: PublicComment;
  /** 削除中・通報中の二重送信を止める */
  busy: boolean;
  canReport: boolean;
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => void;
  reported: boolean;
}

export default function CommentItem({
  comment,
  busy,
  canReport,
  onDelete,
  onReport,
  reported,
}: Props) {
  // 削除は必ず確認を挟む。取り消せない操作をワンタップにしない。
  const [confirming, setConfirming] = useState(false);

  const label = userLabel(comment);
  const hue = badgeHue(comment.user.public_user_id);

  return (
    <div className="flex gap-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-pixelJp text-sm font-bold text-[#4a4335]"
        style={{ backgroundColor: `hsl(${hue} 55% 86%)` }}
        aria-hidden="true"
      >
        {label[0]?.toUpperCase() || 'U'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          {comment.user.public_user_id ? (
            <Link
              href={`/users/${comment.user.public_user_id}/visits`}
              className="font-pixelJp text-xs font-bold text-[#2c2a26] underline decoration-[#e9dfc7] underline-offset-2"
            >
              {label}
            </Link>
          ) : (
            <span className="font-pixelJp text-xs font-bold text-[#2c2a26]">{label}</span>
          )}
          <span className="font-pixelJp text-[10px] text-[#9b917e]">
            {new Date(comment.created_at).toLocaleDateString('ja-JP')}
          </span>
        </div>

        {/*
          本文はテキストノードとして描画する。`dangerouslySetInnerHTML` はもちろん、
          HTML属性・`<meta>`・JSON-LD にも入れないこと（特に OGP description。
          検索結果におけるスパムの増幅器になる）。
        */}
        <p className="whitespace-pre-wrap break-words font-pixelJp text-xs leading-relaxed text-[#6f6657]">
          {comment.content}
        </p>

        <div className="mt-1.5 flex items-center gap-3">
          {comment.is_own && !confirming && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="inline-flex items-center gap-1 font-pixelJp text-[10px] text-[#9b917e] disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" strokeWidth={2.2} />
              削除
            </button>
          )}

          {comment.is_own && confirming && (
            <span className="inline-flex items-center gap-2">
              <span className="font-pixelJp text-[10px] text-[#6f6657]">削除しますか？</span>
              <button
                type="button"
                onClick={() => onDelete(comment.id)}
                disabled={busy}
                className="rounded-[8px] bg-[#bf5640] px-2 py-1 font-pixelJp text-[10px] font-bold text-white disabled:opacity-50"
              >
                削除する
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="font-pixelJp text-[10px] text-[#9b917e] disabled:opacity-50"
              >
                やめる
              </button>
            </span>
          )}

          {/* 自分のコメントは通報できない（自作自演で滞留件数を膨らませない） */}
          {!comment.is_own && canReport && (
            reported ? (
              <span className="font-pixelJp text-[10px] text-[#9b917e]">通報しました</span>
            ) : (
              <button
                type="button"
                onClick={() => onReport(comment.id)}
                disabled={busy}
                className="inline-flex items-center gap-1 font-pixelJp text-[10px] text-[#9b917e] disabled:opacity-50"
              >
                <Flag className="h-3 w-3" strokeWidth={2.2} />
                通報
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
