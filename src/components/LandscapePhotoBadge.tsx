export default function LandscapePhotoBadge({
  isLandscape,
  overlay = false,
}: {
  isLandscape?: boolean;
  /** 写真の上に重ねる用。AiPhotoTags の overlay と大きさを揃える */
  overlay?: boolean;
}) {
  if (!isLandscape) return null;
  return (
    <span
      className={`inline-block rounded-full bg-emerald-100 font-bold text-emerald-900 ${
        overlay ? 'px-1.5 py-0 text-[10px] leading-4 shadow-sm' : 'px-2 py-0.5 text-xs'
      }`}
    >
      周辺の風景
    </span>
  );
}
