'use client';

import { useCallback, useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

type PrefectureProgress = {
  name: string;
  total: number;
  visited: number;
  remaining: number;
  rate: number;
};

type TooltipState = {
  name: string;
  rate: number;
  visited: number;
  total: number;
  x: number;
  y: number;
} | null;

// JIS prefecture code → Japanese name
const PREF_ID_TO_NAME: Record<string, string> = {
  1: '北海道', 2: '青森県', 3: '岩手県', 4: '宮城県', 5: '秋田県',
  6: '山形県', 7: '福島県', 8: '茨城県', 9: '栃木県', 10: '群馬県',
  11: '埼玉県', 12: '千葉県', 13: '東京都', 14: '神奈川県', 15: '新潟県',
  16: '富山県', 17: '石川県', 18: '福井県', 19: '山梨県', 20: '長野県',
  21: '岐阜県', 22: '静岡県', 23: '愛知県', 24: '三重県', 25: '滋賀県',
  26: '京都府', 27: '大阪府', 28: '兵庫県', 29: '奈良県', 30: '和歌山県',
  31: '鳥取県', 32: '島根県', 33: '岡山県', 34: '広島県', 35: '山口県',
  36: '徳島県', 37: '香川県', 38: '愛媛県', 39: '高知県', 40: '福岡県',
  41: '佐賀県', 42: '長崎県', 43: '熊本県', 44: '大分県', 45: '宮崎県',
  46: '鹿児島県', 47: '沖縄県',
};

const NAME_TO_PREF_ID = Object.fromEntries(
  Object.entries(PREF_ID_TO_NAME).map(([id, name]) => [name, id])
);

const getPrefColor = (visited: number, rate: number): string => {
  if (visited === 0) return '#EDEAE6';
  if (rate >= 100) return '#2E9E6B';
  if (rate >= 50) return '#E8402E';
  return '#F5A623';
};

export function JapanPrefectureMap({ prefectureProgress }: { prefectureProgress: PrefectureProgress[] }) {
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    const progressByName = new Map(prefectureProgress.map((p) => [p.name, p]));

    fetch('/japan-prefecture-map.svg')
      .then((r) => r.text())
      .then((raw) => {
        let svg = raw;

        // Apply fill color for each visited prefecture
        progressByName.forEach((p, name) => {
          const id = NAME_TO_PREF_ID[name];
          if (!id) return;
          const color = getPrefColor(p.visited, p.rate);
          // Replace fill for this specific path
          svg = svg.replace(
            new RegExp(`(id="pref-${id}"[^>]*?)fill="[^"]*"`),
            `$1fill="${color}"`
          );
          // Embed rate/visited/total for click handler
          svg = svg.replace(
            new RegExp(`(id="pref-${id}"[^>]*?)(/>|>)`),
            `$1 data-prate="${p.rate.toFixed(1)}" data-pvisited="${p.visited}" data-ptotal="${p.total}"$2`
          );
        });

        setSvgContent(svg);
      })
      .catch(() => setSvgContent(''));
  }, [prefectureProgress]);

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const path = (e.target as Element).closest('[data-name]') as Element | null;
    if (!path) {
      setTooltip(null);
      return;
    }
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setTooltip({
      name: path.getAttribute('data-name')!,
      rate: Number(path.getAttribute('data-prate') ?? 0),
      visited: Number(path.getAttribute('data-pvisited') ?? 0),
      total: Number(path.getAttribute('data-ptotal') ?? 0),
      x,
      y,
    });
  }, []);

  const visitedPrefCount = prefectureProgress.filter((p) => p.visited > 0).length;
  const totalVisits = prefectureProgress.reduce((s, p) => s + p.visited, 0);
  const totalManholes = prefectureProgress.reduce((s, p) => s + p.total, 0);
  const nationalRate =
    totalManholes > 0 ? ((totalVisits / totalManholes) * 100).toFixed(1) : '0.0';

  return (
    <section className="rounded-lg border border-[#8C6A4A]/10 bg-[#F5F0E8] p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-[#7B63A8]" />
        <h2 className="font-pixelJp text-base font-bold text-[#4F3828]">あなたのポケふた旅マップ</h2>
      </div>
      <p className="mb-4 font-pixelJp text-[10px] text-[#8C6A4A]">
        訪れた都道府県が少しずつ色づきます
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-md bg-white/60 p-2 text-center">
          <p className="font-pixel text-xl leading-tight text-[#4F3828]">
            {visitedPrefCount}
            <span className="font-pixelJp text-[9px] text-[#8C6A4A]"> / 47</span>
          </p>
          <p className="font-pixelJp text-[9px] text-[#6A4D36]">訪問済み県数</p>
        </div>
        <div className="rounded-md bg-white/60 p-2 text-center">
          <p className="font-pixel text-xl leading-tight text-[#4F3828]">
            {totalVisits}
            <span className="font-pixelJp text-[9px] text-[#8C6A4A]"> / {totalManholes}</span>
          </p>
          <p className="font-pixelJp text-[9px] text-[#6A4D36]">総訪問数</p>
        </div>
        <div className="rounded-md bg-white/60 p-2 text-center">
          <p className="font-pixel text-xl leading-tight text-[#B5483C]">
            {nationalRate}
            <span className="font-pixelJp text-[9px] text-[#8C6A4A]"> %</span>
          </p>
          <p className="font-pixelJp text-[9px] text-[#6A4D36]">全国達成率</p>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[67%]" onClick={handleMapClick}>
        {svgContent === null ? (
          <div className="flex h-48 items-center justify-center font-pixelJp text-xs text-[#8C6A4A]">
            地図を読み込み中...
          </div>
        ) : svgContent === '' ? (
          <div className="flex h-24 items-center justify-center font-pixelJp text-xs text-[#8C6A4A]">
            地図を読み込めませんでした
          </div>
        ) : (
          <div
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svgContent }}
            className="w-full [&>svg]:h-auto [&>svg]:w-full"
            style={{ cursor: 'pointer' }}
          />
        )}

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 min-w-[100px] rounded-lg border border-[#8C6A4A]/20 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm"
            style={{
              left: Math.min(tooltip.x + 10, 240),
              top: Math.max(tooltip.y - 56, 4),
            }}
          >
            <p className="font-pixelJp text-sm font-bold text-[#4F3828]">{tooltip.name}</p>
            {tooltip.visited > 0 ? (
              <p className="font-pixelJp text-xs text-[#6A4D36]">
                {tooltip.visited} / {tooltip.total}（{Number(tooltip.rate).toFixed(0)}%）
              </p>
            ) : (
              <p className="font-pixelJp text-xs text-[#8C6A4A]">未訪問</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {[
          { color: '#EDEAE6', label: '未訪問' },
          { color: '#F5A623', label: '少し' },
          { color: '#E8402E', label: '半分以上' },
          { color: '#2E9E6B', label: '制覇' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="h-3 w-3 flex-shrink-0 rounded-[1px] border border-[#8C6A4A]/20"
              style={{ backgroundColor: color }}
            />
            <span className="font-pixelJp text-[10px] text-[#6A4D36]">{label}</span>
          </div>
        ))}
        <a
          href="https://github.com/dataofjapan/land"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-pixelJp text-[8px] text-[#8C6A4A]/40 hover:text-[#8C6A4A]"
        >
          地図データ: dataofjapan/land (CC-BY)
        </a>
      </div>
    </section>
  );
}
