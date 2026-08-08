import React from 'react';

interface PCShellProps {
  children: React.ReactNode;
  /** 右レール（sticky）。未指定時は単一カラム */
  rail?: React.ReactNode;
  className?: string;
}

/**
 * PC統一レイアウト: フレーム1120 / ガター32 / 本文1fr+gap28+レール360
 * - lg+: 2カラムグリッド（左=children, 右=rail sticky）
 * - モバイル: rail→children の順で縦積み
 *
 * ヘッダー（旧 PCTopNav）は持たない。クロムは `layout.tsx` の SiteChrome が
 * 全ページに描画するので、ここは本文のグリッドだけを担当する。
 * アクティブタブの判定も SiteChrome 側（`@/lib/siteNav` のルート表）に移した。
 */
export default function PCShell({ children, rail, className }: PCShellProps) {
  return (
    <div className={`mx-auto w-full max-w-[1120px] px-4 lg:px-8 ${className ?? ''}`}>
      {rail ? (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-[28px]">
          {/* モバイル: rail を children より先に表示 */}
          <div className="lg:hidden">{rail}</div>
          <div className="min-w-0">{children}</div>
          {/* PC: 右カラム sticky */}
          <div className="hidden lg:block">
            <div className="sticky top-[20px] flex flex-col gap-[14px]">{rail}</div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
