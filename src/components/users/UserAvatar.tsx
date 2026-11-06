import { UserRound } from 'lucide-react';

// プロフィールのアイコン。本人が撮った公開写真の1枚を丸く切り抜いて出す。
// マンホールは丸いので、正方形の中央で切り抜けばほぼ蓋だけが残る。
//
// 写真は配信量を抑えるため小さい版（size=small）だけを使う。元画像は出さない。
// 未設定・読み込み前は人のマークを出す（今までの見た目と同じ）。

type Props = {
  photoId: string | null | undefined;
  /** 直径（px）。枠線を含む */
  size?: number;
  className?: string;
  alt?: string;
};

export function avatarPhotoUrl(photoId: string) {
  return `/api/photo/${encodeURIComponent(photoId)}?size=small`;
}

export default function UserAvatar({ photoId, size = 48, className = '', alt = '' }: Props) {
  return (
    <span
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#bf5640]/40 bg-[#efe6cf] ${className}`}
      style={{ width: size, height: size }}
    >
      {photoId ? (
        <img
          src={avatarPhotoUrl(photoId)}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <UserRound className="text-[#8C6A4A]" style={{ width: size / 2, height: size / 2 }} aria-hidden />
      )}
    </span>
  );
}
