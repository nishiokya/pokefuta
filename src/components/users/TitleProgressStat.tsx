import HeroStat from '@/components/users/HeroStat';
import { titleProgress } from '@/components/users/title-progress';

/** 「訪問したポケふた」の欄。中身は titleProgress（OGP 画像と共用）。称号は枚数だけで決める */
export default function TitleProgressStat({ visited, totalManholes }: { visited: number; totalManholes: number }) {
  const { total, colors, note } = titleProgress(visited, totalManholes);
  return (
    <HeroStat
      id="title"
      label={['訪問した', 'ポケふた']}
      value={visited}
      total={total}
      colors={colors}
      note={note}
    />
  );
}
