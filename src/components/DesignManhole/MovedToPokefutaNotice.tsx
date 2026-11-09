import Link from 'next/link';
import { Info } from 'lucide-react';

// デザインふたとして投稿された新しいポケふたを、公式の番号の訪問記録へ移したお知らせ（2026-11-09）。
// 公式サイト（local.pokemon.jp）が 10/31〜11/8 に止まっていた間、新しく設置されたポケふたは
// デザインふた投稿で受けていた。公式に載ったので、投稿者のスタンプ帳へ移して投稿は非公開にした
// （マイグレーション 20261110100000）。投稿した人から「写真が消えた」ように見えるので、しばらく出す。
export const MOVED_TO_POKEFUTA_NOTICE_UNTIL = '2026-12-10T00:00:00+09:00';

export function isMovedToPokefutaNoticeActive(now: Date = new Date()): boolean {
  return now.getTime() < new Date(MOVED_TO_POKEFUTA_NOTICE_UNTIL).getTime();
}

export function MovedToPokefutaNotice({ className = 'mt-5', now }: { className?: string; now?: Date }) {
  if (!isMovedToPokefutaNoticeActive(now)) return null;
  return (
    <div
      role="note"
      className={`${className} flex items-start gap-2 rounded-lg border border-dm-line/30 bg-white/80 p-3 text-[#2A2A2A]`}
    >
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-dm-line" aria-hidden="true" />
      <div>
        <p className="text-sm font-bold text-dm-ink">
          デザインふたに投稿されたポケふたを、ポケふたの記録へ移しました
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[#2A2A2A]/75">
          公式サイトが止まっていた間にデザインふたとして投稿いただいた新しいポケふた（ポケモンマンホール）を、
          公式の情報をもとに、ポケふたの訪問記録へ移しました（2026年11月9日）。
          写真とひとことは、投稿した方の
          <Link href="/visits" className="mx-0.5 underline hover:opacity-80">
            スタンプ帳
          </Link>
          にそのまま入っています。
        </p>
      </div>
    </div>
  );
}
