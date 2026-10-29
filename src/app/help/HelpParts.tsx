import Link from 'next/link';
import type { ReactNode } from 'react';

// ヘルプページの共通部品。/privacy・/terms と同じ読み物の見た目にそろえる。

export const HELP_PAGES = [
  { href: '/help/bulk-upload', title: 'まとめて投稿の使い方', description: '旅行の写真をまとめて選んで、ポケふたの写真だけを投稿する' },
  { href: '/help/bulk-upload-trouble', title: 'まとめて投稿がうまくいかないとき', description: '「位置情報が無い」「近くにポケふたが無い」と出たときなど' },
  { href: '/help/iphone-photos', title: 'iPhone の写真を投稿する', description: 'iPhone から直接、または Google フォト経由で PC から投稿する' },
  { href: '/help/android-photos', title: 'Android で撮ってある写真を投稿する', description: 'ポケふたを選んでスマホから投稿する（ベータ）か、PC に移して投稿する' },
] as const;

export function HelpShell({ title, lead, children, current }: { title: string; lead?: ReactNode; children: ReactNode; current?: string }) {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-read px-4 pb-12 pt-5 sm:pt-8">
        <p className="text-xs text-[#8C6A4A]">
          <Link href="/help" className="underline hover:opacity-80">ヘルプ</Link>
        </p>
        <h1 className="mt-1 font-pixelJp text-2xl font-extrabold text-[#4F3828]">{title}</h1>
        {lead && <div className="mt-4 text-sm leading-relaxed text-[#6A4D36]">{lead}</div>}
        {children}
        {current && <RelatedHelp current={current} />}
      </main>
    </div>
  );
}

export function Section({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="mt-8 scroll-mt-24" id={id}>
      <h2 className="mb-2 font-pixelJp text-base font-bold text-[#4F3828]">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-[#6A4D36]">{children}</div>
    </section>
  );
}

export function Steps({ children }: { children: ReactNode }) {
  return <ol className="ml-5 list-decimal space-y-1.5">{children}</ol>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#B07818]/30 bg-[#FAF0DC] p-4 text-sm leading-relaxed text-[#5C4410]">{children}</div>
  );
}

export function Qa({ q, id, children }: { q: string; id?: string; children: ReactNode }) {
  return (
    <section className="mt-6 scroll-mt-24" id={id}>
      <h2 className="font-bold text-[#4F3828]">{q}</h2>
      <div className="mt-1.5 flex flex-col gap-2 text-sm leading-relaxed text-[#6A4D36]">{children}</div>
    </section>
  );
}

function RelatedHelp({ current }: { current: string }) {
  const others = HELP_PAGES.filter((page) => page.href !== current);
  return (
    <nav className="mt-12 border-t border-[#4F3828]/15 pt-6" aria-label="ほかのヘルプ">
      <h2 className="text-sm font-bold text-[#4F3828]">ほかのヘルプ</h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {others.map((page) => (
          <li key={page.href}>
            <Link href={page.href} className="font-bold text-[#7B63A8] underline hover:opacity-80">
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/upload/bulk" className="rounded-lg bg-[#BF5640] px-4 py-2 text-sm font-bold text-white">
          まとめて投稿を開く
        </Link>
        <Link href="/upload" className="rounded-lg border border-[#2A2A2A]/20 bg-white px-4 py-2 text-sm font-bold">
          1枚ずつ投稿する
        </Link>
      </div>
    </nav>
  );
}
