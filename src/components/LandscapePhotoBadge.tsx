export default function LandscapePhotoBadge({ isLandscape }: { isLandscape?: boolean }) {
  if (!isLandscape) return null;
  return (
    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
      周辺の風景
    </span>
  );
}
