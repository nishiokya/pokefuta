'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * ログインしていない人にだけ中身を出す。ログイン中は fallback（既定は何も出さない）。
 *
 * 公開スタンプ帳の「自分のスタンプ帳を作る」用。ログイン済みの人（持ち主本人を含む）は
 * もうスタンプ帳を持っている。
 * サーバーでは認証を見ない（公開ページは表示専用）ので、まずゲスト向けを出しておき、
 * セッションが分かってから差し替える。ページの一番下で使うので、変わっても上の中身は動かない。
 */
export default function GuestOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    createBrowserClient()
      .auth.getSession()
      .then(({ data: { session } }) => setLoggedIn(Boolean(session?.user)))
      .catch(() => setLoggedIn(false));
  }, []);

  return <>{loggedIn ? fallback : children}</>;
}
