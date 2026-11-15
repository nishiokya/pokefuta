'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PCShell from '@/components/PCShell';
import OwnDesignManholeCard from '@/components/DesignManhole/OwnDesignManholeCard';
import { SubmitCta } from '@/components/DesignManhole/SubmitCta';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { pageTitle } from '@/lib/constants';
import type { OwnDesignManhole } from '@/lib/own-design-manholes';

type State =
  | { kind: 'loading' }
  | { kind: 'loggedOut' }
  | { kind: 'error' }
  | { kind: 'ready'; items: OwnDesignManhole[] };

// スタンプ帳から辿る「投稿したデザインマンホール」。タブは増やさず、スタンプ帳（/visits）へ戻るリンクを置く。
// /visits 配下は robots.txt で巡回拒否している（robots.ts）ので、このページ個別の noindex は付けない。
export default function VisitsDesignManholesPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const { trackView } = useAnalytics();

  useEffect(() => {
    document.title = pageTitle('投稿したデザインマンホール');
    (async () => {
      try {
        const { data: { session } } = await createBrowserClient().auth.getSession();
        const loggedIn = Boolean(session?.user);
        trackView('/visits/design-manholes', '投稿したデザインマンホール', 'visits_design_manholes', loggedIn);
        if (!loggedIn) {
          setState({ kind: 'loggedOut' });
          return;
        }
        const res = await fetch('/api/design-manholes/mine', { cache: 'no-store' });
        if (res.status === 401) {
          setState({ kind: 'loggedOut' });
          return;
        }
        const body = res.ok ? await res.json() : null;
        if (body?.success && Array.isArray(body.design_manholes)) {
          setState({ kind: 'ready', items: body.design_manholes });
        } else {
          setState({ kind: 'error' });
        }
      } catch {
        setState({ kind: 'error' });
      }
    })();
  }, []);

  const items = state.kind === 'ready' ? state.items : [];
  const hasPending = items.some((item) => item.status === 'needs_review');

  return (
    <div className="min-h-content safe-area-body bg-[#efe6cf]">
      <PCShell className="pb-32 pt-4 lg:pt-6">
        <div className="space-y-5">
          <Link href="/visits" className="inline-block font-pixelJp text-xs font-bold text-[#7B63A8]">
            ← スタンプ帳へ戻る
          </Link>
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-pixelJp text-lg font-bold text-[#4F3828]">投稿したデザインマンホール</h1>
            {state.kind === 'ready' && items.length > 0 && (
              <span className="font-pixelJp text-sm text-[#8C6A4A]">{items.length} 枚</span>
            )}
          </div>

          {state.kind === 'loading' && (
            <div className="py-10 text-center font-pixelJp text-[#6A4D36]">読み込み中<span className="rpg-loading" /></div>
          )}

          {state.kind === 'loggedOut' && (
            <div className="rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] p-5 text-center">
              <p className="font-pixelJp text-sm text-[#4F3828]">投稿を見るにはログインしてください。</p>
              <Link
                href="/login?redirect=/visits/design-manholes"
                className="mt-3 inline-flex items-center rounded-lg bg-[#7B63A8] px-5 py-2.5 text-sm font-bold text-white hover:opacity-90"
              >
                ログインする
              </Link>
            </div>
          )}

          {state.kind === 'error' && (
            <div role="alert" className="rounded-[12px] border border-[#B5483C]/40 bg-[#B5483C]/10 p-4 text-sm font-bold text-[#B5483C]">
              投稿を読み込めませんでした。時間をおいてもう一度お試しください。
            </div>
          )}

          {state.kind === 'ready' && items.length === 0 && (
            <div className="rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] p-6 text-center">
              <p className="font-pixelJp text-sm text-[#4F3828]">まだ投稿がありません</p>
              <SubmitCta
                surface="own_design_manhole_list_empty"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-dm-line px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#6A5299]"
              />
            </div>
          )}

          {state.kind === 'ready' && items.length > 0 && (
            <>
              {hasPending && (
                <p className="rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-2.5 text-xs leading-relaxed text-[#6A4D36]">
                  「確認待ち」の投稿は、近くに公式のポケふたがあるため確認しています。確認が済むまで、まだ公開されていません。
                </p>
              )}
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {items.map((item, index) => (
                  <li key={item.id}>
                    <OwnDesignManholeCard item={item} eager={index < 4} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </PCShell>
    </div>
  );
}
