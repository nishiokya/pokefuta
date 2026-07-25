'use client';

import { X } from 'lucide-react';

interface VisitVisibilityModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

/**
 * 公開 → 非公開 に戻すときの確認ダイアログ。
 *
 * 非公開の投稿は写真館にもマンホール詳細にも出ず、UGC としての価値が失われる。
 * そのため摩擦は「非公開にする側」だけに置き、何を失うかを /upload の警告（#192）と
 * 同じ文言で明示する。逆方向（公開する）は望ましい操作なので確認を挟まず即時に行う。
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
          この記録を非公開にしますか？
        </h2>

        {/* Content */}
        <div className="space-y-4">
          <div className="bg-amber-100/70 border-2 border-amber-300 p-3">
            <p className="font-pixelJp text-xs font-bold text-amber-900">⚠️ 非公開にすると…</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 font-pixelJp text-xs text-amber-900">
              <li>トップページや写真館の「最新の投稿」に掲載されません</li>
              <li>マンホール詳細ページで他のユーザーに見てもらえません</li>
              <li>あなたの公開スタンプ帳からも消えます</li>
            </ul>
          </div>

          <p className="font-pixelJp text-xs text-rpg-textDark">
            記録そのものは残ります。あとから公開に戻すこともできます。
          </p>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={onCancel}
              className="rpg-button"
              disabled={isSaving}
            >
              <span className="font-pixelJp text-xs">公開のままにする</span>
            </button>
            <button
              onClick={onConfirm}
              className="rpg-button"
              disabled={isSaving}
            >
              <span className="font-pixelJp text-xs">
                {isSaving ? '変更中...' : '非公開にする'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
