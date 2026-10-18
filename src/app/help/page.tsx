import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME, SITE_URL } from '@/lib/constants';
import { HELP_PAGES, HelpShell } from './HelpParts';

export const metadata: Metadata = {
  title: `ヘルプ | ${SITE_NAME}`,
  description: `${SITE_NAME}で写真を投稿するときのヘルプです。まとめて投稿の使い方、iPhone・Android の写真の扱い、うまくいかないときの対処をまとめています。`,
  alternates: { canonical: `${SITE_URL}/help` },
  robots: { index: true, follow: true },
};

export default function HelpIndexPage() {
  return (
    <HelpShell title="ヘルプ" lead={<p>写真の投稿で迷ったときに読むページです。</p>}>
      <ul className="mt-6 grid gap-3">
        {HELP_PAGES.map((page) => (
          <li key={page.href}>
            <Link href={page.href} className="block rounded-xl border border-[#4F3828]/10 bg-white/80 p-4 hover:bg-white">
              <span className="font-bold text-[#4F3828]">{page.title}</span>
              <span className="mt-1 block text-xs leading-relaxed text-[#6A4D36]">{page.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </HelpShell>
  );
}
