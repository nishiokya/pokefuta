'use client';

import { X } from 'lucide-react';

interface DeletePhotoModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export default function DeletePhotoModal({
  isOpen,
  onConfirm,
  onCancel,
  isDeleting = false
}: DeletePhotoModalProps) {
  // 明示的に true の場合のみレンダリング
  if (isOpen !== true) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 safe-area-inset">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-70"
        onClick={isDeleting ? undefined : onCancel}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!isDeleting && (e.key === 'Enter' || e.key === ' ')) {
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
          disabled={isDeleting}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <h2 className="rpg-window-title text-base mb-4">
          ⚠️ 写真を削除
        </h2>

        {/* Content */}
        <div className="space-y-4">
          <p className="font-pixelJp text-sm text-rpg-textDark">
            この写真と訪問記録を削除してもよろしいですか？
          </p>

          <div className="bg-rpg-red bg-opacity-10 border-2 border-rpg-red p-3">
            <p className="font-pixelJp text-xs text-rpg-textDark">
              <span className="font-bold text-rpg-red">注意:</span> この操作は取り消せません。同じ訪問記録に紐づく写真、コメント、いいね、ブックマークも削除されます。
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onCancel}
              className="rpg-button"
              disabled={isDeleting}
            >
              <span className="font-pixelJp text-xs">キャンセル</span>
            </button>
            <button
              onClick={onConfirm}
              className="rpg-button rpg-button-danger"
              disabled={isDeleting}
            >
              <span className="font-pixelJp text-xs">
                {isDeleting ? '削除中...' : '削除する'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
