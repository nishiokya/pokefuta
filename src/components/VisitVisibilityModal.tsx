'use client';

import { X } from 'lucide-react';

interface VisitVisibilityModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

/**
 * 非公開 → 公開 に切り替えるときの確認ダイアログ。
 * 公開は外向きの操作なので確認を挟む（公開 → 非公開 は確認なしで即時）。
 */
export default function VisitVisibilityModal({
  isOpen,
  onConfirm,
  onCancel,
  isSaving = false
}: VisitVisibilityModalProps) {
  // 明示的に true の場合のみレンダリング
  if (isOpen !== true) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 safe-area-inset">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-70"
        onClick={isSaving ? undefined : onCancel}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!isSaving && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-label="モーダルを閉じる"
      ></div>

      {/* Modal */}
      <div className="relative rpg-window max-w-md w-full">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-2 right-2 rpg-button p-2"
          disabled={isSaving}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <h2 className="rpg-window-title text-base mb-4">
          この記録を公開しますか？
        </h2>

        {/* Content */}
        <div className="space-y-4">
          <p className="font-pixelJp text-sm text-rpg-textDark">
            公開すると、写真とコメントが他のユーザーにも見えるようになります。
          </p>

          <div className="bg-[#e2f2e9] border-2 border-[#1f9d63] p-3">
            <p className="font-pixelJp text-xs text-rpg-textDark">
              <span className="font-bold text-[#1f9d63]">公開されるもの:</span>{' '}
              写真・コメント・訪問したポケふた。マンホール詳細ページと、あなたの公開スタンプ帳に掲載されます。
            </p>
          </div>

          <div className="bg-[#fbf6ea] border-2 border-[#e9dfc7] p-3">
            <p className="font-pixelJp text-xs text-rpg-textDark">
              <span className="font-bold">個人メモは公開されません。</span>{' '}
              あとから非公開に戻すこともできます。
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onCancel}
              className="rpg-button"
              disabled={isSaving}
            >
              <span className="font-pixelJp text-xs">キャンセル</span>
            </button>
            <button
              onClick={onConfirm}
              className="rpg-button"
              disabled={isSaving}
            >
              <span className="font-pixelJp text-xs">
                {isSaving ? '公開中...' : '公開する'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
