'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

// 画面の近くに来てから src を入れる img。
// ネイティブの loading="lazy" はスマホの Chrome だと画面の 1250〜2500px 先まで読みに行くので、
// トップのフィードでは見えていない写真まで LCP の写真と回線を取り合っていた（2026-11-15、最初の表示で39枚）。
// 枠の大きさは呼び出し側の width/height・aspect-ratio・className で取っておく（src が入っても CLS は出ない）。
// IntersectionObserver が無い環境では最初から src を入れる
const DEFAULT_ROOT_MARGIN = '200px 0px';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'loading'> & {
  src: string;
  rootMargin?: string;
};

export default function NearViewportImg({ src, rootMargin = DEFAULT_ROOT_MARGIN, ...rest }: Props) {
  const ref = useRef<HTMLImageElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  // src を入れる前は alt を出さない（読み込み前に代替テキストや壊れた画像の印が見えないように）
  return <img ref={ref} {...rest} alt={near ? rest.alt : ''} src={near ? src : undefined} decoding="async" />;
}
