'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * ログインしていない人にだけ中身を出す。
 *
 * 公開スタンプ帳の「あなたもポケふた旅へ」用。ログイン済みの人（持ち主本人を含む）には
 * 「自分のスタンプ帳を作る」は要らず、「近くを探す」「全国マップ」もヘッダーのナビと同じになる。
 * サーバーでは認証を見ない（公開ページは表示専用）ので、まず出しておき、
 * セッションが分かってから消す。ページの一番下なので、消えても上の中身は動かない。
 */
export default function GuestOnly({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => setLoggedIn(Boolean(session?.user)))
      .catch(() => setLoggedIn(false));
  }, []);

  return loggedIn ? null : <>{children}</>;
}
