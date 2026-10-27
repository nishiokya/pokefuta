import type { NotePart, RingColors } from '@/components/users/HeroStat';
import type { BadgeRank } from '@/lib/badge-catalog';
import { REGULAR_BADGE_LABEL, type RegularTier } from '@/lib/regular-badges';
import { SITE_NAME } from '@/lib/constants';

/**
 * 公開スタンプ帳の OGP 画像（1200×630）。ページの上の段と同じ部品を並べる:
 * 称号の札 → 名前 → 3つの輪（ポケふた・都道府県・ポケモン）→ バッジのメダル → ステッカー、右に訪問写真。
 * satori で描くので、子を2つ以上持つ div は必ず display:flex にする。データ取得は route.tsx 側。
 */

export type OgpStat = {
  label: string;
  value: number;
  total?: number;
  colors?: RingColors;
  note?: readonly NotePart[];
};

export type OgpMedal =
  | { kind: 'prefecture'; key: string; label: string; rank: BadgeRank | null; rate: number }
  | { kind: 'pokemon'; key: string; image: string | null; rank: BadgeRank | null; rate: number };

export type StampbookOgpProps = {
  displayName: string;
  tier: RegularTier | null;
  stats: readonly OgpStat[];
  medals: readonly OgpMedal[];
  /** 載せきれなかったメダルの数 */
  moreMedals: number;
  stickers: readonly { key: string; icon: string; name: string }[];
  photos: readonly string[];
};

const INK = '#4F3828';
const INK_SOFT = '#6A4D36';
const RED = '#B5483C';
const PAPER = '#FFF7E5';

// 称号の札（RegularBadge の TIER_CLASS）と同じ色
const TIER_PILL: Record<RegularTier, { background: string; color: string }> = {
  legend: { background: 'linear-gradient(90deg, #F0ABFC, #FDE68A, #7DD3FC)', color: '#4C1D95' },
  crown: { background: 'linear-gradient(180deg, #FDE68A, #FACC15)', color: '#78350F' },
  ranger: { background: 'linear-gradient(180deg, #E0F2FE, #7DD3FC)', color: '#0C4A6E' },
  regular: { background: 'linear-gradient(180deg, #F1F5F9, #CBD5E1)', color: '#334155' },
  rookie: { background: 'linear-gradient(180deg, #ECFCCB, #6EE7B7)', color: '#065F46' },
};

// バッジのメダル（RankMedal）と同じ色
const RANK_COLOR: Record<BadgeRank, string> = { gold: '#E5B83E', silver: '#9AA6B2', bronze: '#C27A48' };
const RANK_ICON: Record<BadgeRank, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };
const PREFECTURE_FILL: Record<BadgeRank | 'none', { background: string; color: string }> = {
  gold: { background: 'linear-gradient(135deg, #FBE08A 0%, #E5B83E 50%, #C38A12 100%)', color: '#FFFFFF' },
  silver: { background: 'linear-gradient(135deg, #F7F9FA 0%, #C9D0D7 100%)', color: '#3F4A55' },
  bronze: { background: '#F8E8DA', color: '#7A4524' },
  none: { background: '#F3EEE4', color: '#8C7F6E' },
};

// ステッカー（StickerStrip）と同じ色と傾き
const STICKER_COLORS = [
  { background: '#FFE3A3', color: '#7A4B00' },
  { background: '#CDEBD8', color: '#1F6A45' },
  { background: '#FFD0C2', color: '#8A2E1C' },
  { background: '#D9D2F2', color: '#4B3A82' },
  { background: '#CFE6F7', color: '#1F4F7A' },
];
const STICKER_TILTS = ['-3deg', '2deg', '-1deg', '3deg', '-2deg', '1deg'];

// 写真のコラージュ。枚数で並べ方を変える（1枚なら大きく1枚）。右の欄は幅 388・高さ 526
type PhotoPlacement = { top: number; left: number; size: number; rotate: string };
const PHOTO_LAYOUTS: Record<number, readonly PhotoPlacement[]> = {
  1: [{ top: 40, left: 40, size: 300, rotate: '4deg' }],
  2: [
    { top: 10, left: 110, size: 240, rotate: '5deg' },
    { top: 230, left: 20, size: 240, rotate: '-5deg' },
  ],
  3: [
    { top: 0, left: 130, size: 220, rotate: '5deg' },
    { top: 150, left: 10, size: 220, rotate: '-6deg' },
    { top: 290, left: 140, size: 210, rotate: '3deg' },
  ],
};
/** route.tsx が写真を縮める大きさ（いちばん大きい置き方に合わせる） */
export const OGP_PHOTO_SIZE = 300;
export const OGP_PHOTO_COUNT = 3;
export const OGP_MEDAL_SIZE = 66;
/** メダルの段に並べる数。超えた分は +N */
export const OGP_MEDAL_COUNT = 8;

// 「◯◯のスタンプ帳」が左の欄（幅 700）の1行に収まる大きさ。全角で数えて、半角は 0.64
const LEFT_WIDTH = 700;
const TITLE_FONT = { min: 30, max: 58 } as const;
const textWidth = (text: string) =>
  Array.from(text).reduce((sum, ch) => sum + (/[\x20-\x7E]/.test(ch) ? 0.64 : 1), 0);
const titleFontSize = (title: string) =>
  Math.max(TITLE_FONT.min, Math.min(TITLE_FONT.max, Math.floor((LEFT_WIDTH * 0.96) / textWidth(title))));
// 最小の文字でも入らない名前は名前のほうを … で切り、「のスタンプ帳」は残す
const STAMPBOOK_SUFFIX = 'のスタンプ帳';
const stampbookTitle = (name: string) => {
  const budget = (LEFT_WIDTH * 0.96) / TITLE_FONT.min - textWidth(STAMPBOOK_SUFFIX);
  if (textWidth(name) <= budget) return `${name}${STAMPBOOK_SUFFIX}`;
  const chars = Array.from(name);
  while (chars.length > 1 && textWidth(chars.join('')) > budget - 1) chars.pop();
  return `${chars.join('')}…${STAMPBOOK_SUFFIX}`;
};

export default function StampbookOgpCard({
  displayName,
  tier,
  stats,
  medals,
  moreMedals,
  stickers,
  photos,
}: StampbookOgpProps) {
  const title = stampbookTitle(displayName);
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#F6EEDC',
        color: INK,
        fontFamily: 'NotoSansCJK, sans-serif',
        position: 'relative',
      }}
    >
      {/* ページの台紙と同じ方眼 */}
      <div
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0, left: 0,
          backgroundImage:
            'linear-gradient(90deg, #8C6A4A14 1px, transparent 1px), linear-gradient(#8C6A4A14 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 22, right: 22, bottom: 22, left: 22,
          display: 'flex',
          borderRadius: 18,
          border: '3px solid rgba(140,106,74,0.22)',
          background: PAPER,
          boxShadow: '0 12px 30px rgba(95,68,42,0.16)',
          padding: '30px 34px',
        }}
      >
        {/* 左: 称号・名前・輪・バッジ・ステッカー */}
        <div style={{ display: 'flex', flexDirection: 'column', width: LEFT_WIDTH }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {tier && (
              <div
                style={{
                  display: 'flex',
                  borderRadius: 999,
                  padding: '7px 18px',
                  fontSize: 24,
                  fontWeight: 800,
                  boxShadow: '0 2px 6px rgba(79,56,40,0.18)',
                  ...TIER_PILL[tier],
                }}
              >
                {REGULAR_BADGE_LABEL[tier]}
              </div>
            )}
            <div style={{ display: 'flex', fontSize: 22, fontWeight: 800, color: RED }}>{SITE_NAME}</div>
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 10,
              fontSize: titleFontSize(title),
              fontWeight: 900,
              lineHeight: 1.15,
              color: INK,
              // 文字幅の見積もりが外れたときの保険
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>

          <div style={{ display: 'flex', gap: 14, marginTop: 18 }}>
            {stats.map((stat) => (
              <StatBox key={stat.label} stat={stat} />
            ))}
          </div>

          {medals.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
              {medals.map((medal) => (
                <Medal key={medal.key} medal={medal} />
              ))}
              {moreMedals > 0 && (
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 900, color: '#8C6A4A' }}>{`+${moreMedals}`}</div>
              )}
            </div>
          )}

          {stickers.length > 0 && (
            <div style={{ display: 'flex', gap: 14, marginTop: 16 }}>
              {stickers.map((sticker, i) => (
                <div
                  key={sticker.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 999,
                    border: '4px solid #FFFFFF',
                    padding: '4px 16px',
                    fontSize: 20,
                    fontWeight: 800,
                    boxShadow: '0 3px 6px rgba(79,56,40,0.25)',
                    transform: `rotate(${STICKER_TILTS[i % STICKER_TILTS.length]})`,
                    ...STICKER_COLORS[i % STICKER_COLORS.length],
                  }}
                >
                  <span>{sticker.icon}</span>
                  <span>{sticker.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右: 訪問写真のコラージュ。無ければスタンプの印 */}
        <div style={{ display: 'flex', flex: 1, position: 'relative' }}>
          {photos.slice(0, OGP_PHOTO_COUNT).map((uri, index) => {
            const place = PHOTO_LAYOUTS[Math.min(photos.length, OGP_PHOTO_COUNT)][index];
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={index}
                src={uri}
                alt=""
                width={place.size}
                height={place.size}
                style={{
                  position: 'absolute',
                  top: place.top,
                  left: place.left,
                  width: place.size,
                  height: place.size,
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '9px solid #FFFFFF',
                  boxShadow: '0 12px 26px rgba(95,68,42,0.28)',
                  transform: `rotate(${place.rotate})`,
                }}
              />
            );
          })}
          <div
            style={{
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              ...(photos.length > 0
                ? { left: -40, bottom: -6, width: 130, height: 130, fontSize: 23, border: '5px solid rgba(181,72,60,0.85)' }
                : { right: 50, top: 130, width: 240, height: 240, fontSize: 40, border: '10px solid rgba(181,72,60,0.6)' }),
              borderRadius: 999,
              color: RED,
              fontWeight: 900,
              background: 'rgba(255,247,229,0.85)',
              transform: 'rotate(-12deg)',
            }}
          >
            ポケふた旅
          </div>
        </div>
      </div>
    </div>
  );
}

function Ring({ size, ratio, colors, id }: { size: number; ratio: number; colors: RingColors; id: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
      {colors.length > 1 && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {colors.map((color, i) => (
              <stop key={`${color}-${i}`} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={color} />
            ))}
          </linearGradient>
        </defs>
      )}
      <circle cx="32" cy="32" r={r} fill="none" stroke="#8C6A4A" strokeOpacity="0.15" strokeWidth="7" />
      {ratio > 0 && (
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={colors.length > 1 ? `url(#${id})` : colors[0]}
          strokeWidth="7"
          strokeLinecap="round"
          // 1つでもあれば点くらいは見えるように
          strokeDasharray={`${Math.max(ratio * c, 2)} ${c}`}
        />
      )}
    </svg>
  );
}

function StatBox({ stat }: { stat: OgpStat }) {
  const ringSize = 112;
  const ratio = stat.total ? Math.min(stat.value / stat.total, 1) : 0;
  // 画面の欄は「今の段・次の段まで」の2つだが、今の称号は上の札に出ているので次の段までだけ
  const last = stat.note?.[stat.note.length - 1];
  const note = last === undefined ? null : typeof last === 'string' ? last : last.join('');
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: 1,
        borderRadius: 12,
        border: '2px solid rgba(140,106,74,0.15)',
        background: 'rgba(255,255,255,0.75)',
        padding: '12px 8px 12px',
      }}
    >
      <div style={{ display: 'flex', fontSize: 19, fontWeight: 800, color: INK_SOFT }}>{stat.label}</div>
      <div style={{ display: 'flex', position: 'relative', width: ringSize, height: ringSize, marginTop: 6 }}>
        <Ring size={ringSize} ratio={stat.value > 0 ? ratio : 0} colors={stat.colors ?? [RED]} id={`ring-${stat.label}`} />
        <div
          style={{
            position: 'absolute',
            top: 0, right: 0, bottom: 0, left: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, color: INK }}>{`${stat.value}`}</div>
          {stat.total !== undefined && (
            <div style={{ display: 'flex', fontSize: 17, fontWeight: 800, color: '#8C6A4A', marginTop: 2 }}>{`/${stat.total}`}</div>
          )}
        </div>
      </div>
      {note && (
        <div style={{ display: 'flex', marginTop: 6, fontSize: 17, fontWeight: 800, color: INK_SOFT }}>{note}</div>
      )}
    </div>
  );
}

function Medal({ medal }: { medal: OgpMedal }) {
  const size = OGP_MEDAL_SIZE;
  const ringColors: RingColors = [medal.rank ? RANK_COLOR[medal.rank] : '#7B63A8'];
  const inner = size - 16;
  const fill = PREFECTURE_FILL[medal.rank ?? 'none'];
  return (
    <div style={{ display: 'flex', position: 'relative', width: size, height: size }}>
      <Ring size={size} ratio={medal.rate / 100} colors={ringColors} id={`medal-${medal.key}`} />
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          width: inner,
          height: inner,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          border: '2px solid #FFFFFF',
          overflow: 'hidden',
          ...(medal.kind === 'prefecture' ? fill : { background: '#EFE4CC' }),
          fontSize: medal.kind === 'prefecture' && medal.label.length >= 3 ? 14 : 18,
          fontWeight: 900,
        }}
      >
        {medal.kind === 'prefecture' ? (
          medal.label
        ) : medal.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={medal.image} alt="" width={inner} height={inner} style={{ width: inner, height: inner, objectFit: 'cover', opacity: medal.rank ? 1 : 0.6 }} />
        ) : null}
      </div>
      {medal.rank && (
        <div style={{ position: 'absolute', top: -6, right: -6, display: 'flex', fontSize: medal.rank === 'gold' ? 24 : 18 }}>
          {RANK_ICON[medal.rank]}
        </div>
      )}
    </div>
  );
}
