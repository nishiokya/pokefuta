/**
 * PhotoPrompt.template.tsx
 * ------------------------------------------------------------
 * 写真投稿プロンプト 共通コンポーネントの実装出発点（テンプレート）。
 * これは「参照デザインを本番コードベースに作り直す」ための骨組みです。
 * - スタイルは inline で書いていますが、実コードベースの規約
 *   （CSS Modules / Tailwind / styled-components / 既存DS）に置換してください。
 * - アイコン（Icon コンポーネント）は既存アイコンライブラリに差し替え。
 * - トークンは §7（README）の確定値。既存DSに対応があればそちらを優先。
 *
 * variant 決定ロジック（README §3.1）:
 *   empty  : photoCount === 0
 *   posted : photoCount > 0 && !viewerHasPhoto
 *   done   : viewerHasPhoto === true  → プロンプトは描画しない
 */

import React from 'react';

// --- トークン（既存DSがあれば置換）---
const T = {
  card: '#fffdf7', card2: '#fbf6ea', line: '#e9dfc7',
  ink: '#2c2a26', inkSoft: '#6f6657', inkFaint: '#9b917e',
  terracotta: '#bf5640', terracottaD: '#a8462f',
  green: '#1f9d63', amber: '#e2a015', amberD: '#b87d0a',
  cardBorderHi: '#efd9a3',
  ribbonGrad: 'linear-gradient(100deg,#fdeae2,#fdf1e6)',
  peachBg: '#fdeae2', peachTx: '#bf5640',
  lavBg: '#ece9fb', lavTx: '#6a5fc4',
  mintBg: '#e2f2e9', mintTx: '#1f9d63',
  round: '"M PLUS Rounded 1c", system-ui, sans-serif',
  num: '"Outfit", system-ui, sans-serif',
};

export type PhotoPromptVariant = 'empty' | 'posted' | 'done';

export interface PhotoPromptProps {
  pokefuta: {
    id: string;
    title: string;            // "北海道網走のポケふた"
    prefecture: string;       // "北海道"
    area: string;             // "網走"
    photoCount: number;       // みんなの写真枚数
    viewerHasPhoto: boolean;
    rarityTags: string[];     // 希少性タグ（empty時に使用）
    heroImageUrl?: string;    // posted時の実写真
  };
  prefectureDex: { current: number; total: number }; // {13,50} → 撮ると current+1
  seriesProgressDelta?: number;                       // +1
  onPost: () => void;
  onRoute?: () => void;
  onLater?: () => void;
}

/** variant をサーバ値から純粋に導出 */
export function resolveVariant(p: PhotoPromptProps['pokefuta']): PhotoPromptVariant {
  if (p.viewerHasPhoto) return 'done';
  if (p.photoCount === 0) return 'empty';
  return 'posted';
}

// 出し分けコピー（README §3.3）
const COPY = {
  empty: {
    subhead: null as string | null,
    ribbonLeft: 'まだ誰も投稿していない',
    cta: '一番乗りで投稿する',
    postedSub: false,
  },
  posted: {
    subhead: 'あなたの構図で塗り替える',
    ribbonLeft: 'あなたはまだ未記録',
    cta: 'あなたの1枚を加える',
    postedSub: true,
  },
} as const;

const VARIETY_TAGS = ['夜・雪の構図はまだ無い', 'ベスト写真を狙える', 'あなたの季節を残す'];

export function PhotoPrompt(props: PhotoPromptProps) {
  const { pokefuta, prefectureDex, seriesProgressDelta = 1, onPost, onRoute, onLater } = props;
  const variant = resolveVariant(pokefuta);
  if (variant === 'done') return null; // 投稿済みは非表示（or 別の控えめ表示）

  const c = COPY[variant];
  const tags = variant === 'empty' ? pokefuta.rarityTags.slice(0, 3) : VARIETY_TAGS;
  const tints = [
    { bg: T.peachBg, tx: T.peachTx },
    { bg: T.lavBg, tx: T.lavTx },
    { bg: T.mintBg, tx: T.mintTx },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. HERO */}
      {variant === 'empty' ? (
        <div style={heroEmpty}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: T.num, fontWeight: 800, fontSize: 40, lineHeight: 1, color: '#cdbb92' }}>0</div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: T.inkSoft, marginTop: 7 }}>この場所の写真はまだ0枚</div>
            <div style={{ fontSize: 11.5, color: T.terracotta, fontWeight: 700, marginTop: 2 }}>あなたが最初の記録者に</div>
          </div>
          <Badge style={{ top: 12, left: 12 }} bg={T.terracotta} color="#fff"><Icon name="flag" size={13} />一番乗りチャンス</Badge>
        </div>
      ) : (
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', height: 192, border: `1px solid ${T.line}` }}>
          {/* 実写真。無ければプレースホルダ */}
          <img src={pokefuta.heroImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <Badge style={{ top: 12, left: 12 }} bg="rgba(255,255,255,.92)" color={T.inkSoft}><Icon name="image" size={13} />みんなの写真 {pokefuta.photoCount}枚</Badge>
          <Badge style={{ top: 12, right: 12 }} bg="rgba(191,86,64,.95)" color="#fff">あなたは未投稿</Badge>
        </div>
      )}

      {/* 2. LOCATION + TITLE */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: T.inkFaint, fontSize: 12, fontWeight: 600 }}>
          <Icon name="pin" size={13} />{pokefuta.prefecture} / {pokefuta.area}
        </div>
        <div style={{ fontFamily: T.round, fontWeight: 800, fontSize: 21, marginTop: 4 }}>{pokefuta.title}</div>
        {c.postedSub && <div style={{ fontSize: 13, color: T.terracotta, fontWeight: 700, marginTop: 3 }}>{c.subhead}</div>}
      </div>

      {/* 3. COMBINED CARD: B's ribbon + A's 図鑑 impact */}
      <div style={{ background: T.card, border: `1.5px solid ${T.cardBorderHi}`, borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ background: T.ribbonGrad, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name={variant === 'empty' ? 'flag' : 'image'} size={16} color={T.terracotta} />
          <span style={{ fontWeight: 800, fontSize: 12.5, color: '#7d4536', fontFamily: T.round, flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap' }}>{c.ribbonLeft}</span>
          {variant === 'empty' ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <span style={{ fontFamily: T.num, fontWeight: 800, fontSize: 15, color: T.inkFaint }}>0人</span>
              <Icon name="chevron" size={13} color="#d6b8a8" />
              <span style={{ fontFamily: T.num, fontWeight: 800, fontSize: 18, color: T.terracotta }}>#1</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <span style={{ fontFamily: T.num, fontWeight: 800, fontSize: 18, color: T.terracotta }}>0</span>
              <span style={{ fontFamily: T.num, fontWeight: 700, fontSize: 12, color: T.inkFaint }}>/1 図鑑</span>
            </span>
          )}
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: '#fde2c2', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
              <Icon name="trophy" size={16} color={T.amberD} />
            </span>
            <div style={{ fontWeight: 800, fontSize: 13.5, fontFamily: T.round }}>撮ると写真図鑑も埋まる</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: T.card2, borderRadius: 12, padding: '11px 13px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: T.inkSoft, fontWeight: 600 }}>{pokefuta.prefecture} 写真図鑑</div>
              <div style={{ fontFamily: T.num, fontWeight: 800, fontSize: 18 }}>
                {prefectureDex.current} <span style={{ color: T.inkFaint, fontSize: 13 }}>→</span>{' '}
                <span style={{ color: T.terracotta }}>{prefectureDex.current + 1}</span>{' '}
                <span style={{ color: T.inkFaint, fontSize: 13, fontWeight: 600 }}>/ {prefectureDex.total}</span>
              </div>
            </div>
            <div style={{ width: 1, height: 30, background: T.line }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: T.num, fontWeight: 800, fontSize: 18, color: T.green }}>+{seriesProgressDelta}</div>
              <div style={{ fontSize: 10.5, color: T.inkFaint, fontWeight: 600 }}>シリーズ進捗</div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. TAG PILLS */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.map((t, i) => (
          <span key={t} style={{ ...pill, background: tints[i % 3].bg, color: tints[i % 3].tx }}>
            <Icon name={i === 0 ? 'star' : i === 1 ? 'trophy' : 'sparkle'} size={12} />{t}
          </span>
        ))}
      </div>

      {/* 5. PRIMARY CTA */}
      <button onClick={onPost} style={{ ...ctaBase, background: T.terracotta, color: '#fff', boxShadow: `0 2px 0 ${T.terracottaD}` }}>
        <Icon name={variant === 'empty' ? 'flag' : 'plus'} size={19} />{c.cta}
      </button>

      {/* 6. SECONDARY */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onRoute} style={{ ...ctaBase, flex: 1, padding: 12, fontSize: 13.5, background: T.green, color: '#fff' }}>
          <Icon name="route" size={16} />経路案内
        </button>
        <button onClick={onLater} style={{ ...ctaBase, flex: 1, padding: 12, fontSize: 13.5, background: '#fff', color: T.inkSoft, border: `1px solid ${T.line}`, boxShadow: 'none' }}>
          あとで
        </button>
      </div>
    </div>
  );
}

// --- style fragments ---
const heroEmpty: React.CSSProperties = {
  position: 'relative', borderRadius: 16, overflow: 'hidden', height: 192,
  background: 'repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)',
  border: '2px dashed #cdbf9f', display: 'grid', placeItems: 'center',
};
const pill: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, lineHeight: 1, whiteSpace: 'nowrap',
};
const ctaBase: React.CSSProperties = {
  border: 'none', borderRadius: 12, fontFamily: T.round, fontWeight: 800,
  fontSize: 16, padding: 15, width: '100%', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, letterSpacing: '.02em',
};

// --- Badge ---
function Badge({ children, style, bg, color }: { children: React.ReactNode; style?: React.CSSProperties; bg: string; color: string }) {
  return (
    <span style={{ position: 'absolute', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: bg, color, boxShadow: '0 1px 2px rgba(72,55,20,.06), 0 3px 8px rgba(72,55,20,.05)', ...style }}>
      {children}
    </span>
  );
}

/**
 * Icon: プレースホルダ。実装では既存のアイコンライブラリに差し替えてください。
 * 使用名: flag / image / pin / chevron / trophy / star / sparkle / route / plus / camera
 */
function Icon({ name, size = 16, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return <span data-icon={name} style={{ display: 'inline-block', width: size, height: size, color }} />;
}

export default PhotoPrompt;
