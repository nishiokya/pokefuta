import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDebugUser } from '@/lib/debug-access';
import GpsPickerTest from './GpsPickerTest';

// Android で端末内の写真を選ぶと EXIF の GPS が消える件の検証用。
// 写真の選び方（accept の書き方・選ぶアプリ）ごとに GPS がブラウザへ届くかを見る。
// 開発者だけが開ける。写真も結果も保存せず、結果はサーバーのログに出すだけ。

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '写真GPS 選び方テスト',
  robots: { index: false, follow: false },
};

export default async function GpsTestPage() {
  if (!(await isDebugUser())) notFound();
  return <GpsPickerTest />;
}
