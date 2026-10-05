import PosterRegularBadge from '@/components/PosterRegularBadge';

/** 公開スタンプ帳の見出しに出す称号。中身は PosterRegularBadge の大きいサイズ */
export default function UserRegularBadge({ userId }: { userId: string }) {
  return <PosterRegularBadge publicUserId={userId} size="md" />;
}
