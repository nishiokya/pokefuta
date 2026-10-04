import { AI_TAG_HELP, photoAiTags } from '@/lib/photo-ai-tags';

/**
 * 自動で付いたタグ（ぬいぐるみ・夜・風景）を小さなチップで出す。
 * 投稿者の申告（LandscapePhotoBadge）と見分けられるよう色を変え、AI が判定したもの（ぬいぐるみ・風景）には
 * 先頭に「AI」を付ける。夜は撮影時刻と場所から決まるので印を付けない。
 */
export default function AiPhotoTags({
  photo,
  compact = false,
}: {
  photo: { ai_tags?: unknown; is_landscape?: boolean | null };
  /** 小さなタイル用（訪問一覧の見本など）。文字と余白を詰める */
  compact?: boolean;
}) {
  const tags = photoAiTags(photo);
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" title={AI_TAG_HELP}>
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`inline-flex items-center gap-1 rounded-full bg-indigo-50 font-bold text-indigo-900 ring-1 ring-indigo-200 ${
            compact ? 'px-1.5 py-0 text-[9px]' : 'px-2 py-0.5 text-xs'
          }`}
          aria-label={tag.ai ? `${tag.label}（AIによる判定）` : `${tag.label}（撮影時刻から自動）`}
        >
          {tag.ai && (
            <span className={`${compact ? 'text-[7px]' : 'text-[9px]'} font-extrabold tracking-wide text-indigo-500`}>AI</span>
          )}
          {tag.label}
        </span>
      ))}
    </span>
  );
}
