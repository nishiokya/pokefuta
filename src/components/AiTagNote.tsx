import { AI_TAG_HELP } from '@/lib/photo-ai-tags';

/**
 * タグ（ぬいぐるみ・夜・風景）を出す画面の下に置く注釈。チップに「AI」の印を付けないので、
 * 自動判定であることはここで伝える（タッチ端末ではチップの title が見えない）。
 */
export default function AiTagNote({ show, className = '' }: { show: boolean; className?: string }) {
  if (!show) return null;
  return <p className={`text-[11px] leading-snug text-[#8b816f] ${className}`}>※ {AI_TAG_HELP}</p>;
}
