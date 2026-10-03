import { AI_TAG_HELP, photoAiTags } from '@/lib/photo-ai-tags';

/**
 * AI が判定したタグ（ぬいぐるみ・夜・風景）を小さなチップで出す。
 * 投稿者の申告（LandscapePhotoBadge）と見分けられるよう、先頭に「AI」を付け、色も変える。
 */
export default function AiPhotoTags({
  photo,
}: {
  photo: { ai_tags?: unknown; is_landscape?: boolean | null };
}) {
  const tags = photoAiTags(photo);
  if (tags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1" title={AI_TAG_HELP}>
      {tags.map((tag) => (
        <span
          key={tag.key}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-900 ring-1 ring-indigo-200"
          aria-label={`${tag.label}（AIによる判定）`}
        >
          <span className="text-[9px] font-extrabold tracking-wide text-indigo-500">AI</span>
          {tag.label}
        </span>
      ))}
    </span>
  );
}
