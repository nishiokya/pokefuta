'use client';

import { Flag, ImageIcon, MapPin, ChevronRight, Trophy, Star, Sparkles, Route, Plus } from 'lucide-react';

const NUM = '"Outfit", "M PLUS Rounded 1c", system-ui, sans-serif';
const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

const VARIETY_TAGS = ['夜・雪の構図はまだ無い', 'ベスト写真を狙える', 'あなたの季節を残す'];

const TINTS = [
  { bg: '#fdeae2', color: '#bf5640' },
  { bg: '#ece9fb', color: '#6a5fc4' },
  { bg: '#e2f2e9', color: '#1f9d63' },
];

const TAG_ICONS = [Star, Trophy, Sparkles] as const;

export interface PhotoPromptProps {
  pokefuta: {
    id: string | number;
    title: string;
    prefecture: string;
    area: string;
    photoCount: number;
    viewerHasPhoto: boolean;
    rarityTags: string[];
    heroImageUrl?: string;
  };
  prefectureDex?: { current: number; total: number } | null;
  seriesProgressDelta?: number;
  onPost: () => void;
  onRoute?: () => void;
  onLater?: () => void;
}

export default function PhotoPrompt({
  pokefuta,
  prefectureDex,
  seriesProgressDelta = 1,
  onPost,
  onRoute,
  onLater,
}: PhotoPromptProps) {
  if (pokefuta.viewerHasPhoto) return null;

  const isEmpty = pokefuta.photoCount === 0;
  const rawTags = isEmpty ? pokefuta.rarityTags.slice(0, 3) : VARIETY_TAGS;
  // Pad to 3
  const tags = Array.from({ length: 3 }, (_, i) => rawTags[i] || VARIETY_TAGS[i]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── 1. HERO ── */}
      {isEmpty ? (
        <div
          style={{
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            height: 192,
            background: 'repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)',
            border: '2px dashed #cdbf9f',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 40, lineHeight: 1, color: '#cdbb92' }}>
              0
            </div>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: '#6f6657', marginTop: 7 }}>
              この場所の写真はまだ0枚
            </div>
            <div style={{ fontSize: 11.5, color: '#bf5640', fontWeight: 700, marginTop: 2 }}>
              あなたが最初の記録者に
            </div>
          </div>
          <Badge top={12} left={12} bg="#bf5640" color="#fff">
            <Flag size={13} />一番乗りチャンス
          </Badge>
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            borderRadius: 16,
            overflow: 'hidden',
            height: 192,
            border: '1px solid #e9dfc7',
            background: '#ece2cd',
          }}
        >
          {pokefuta.heroImageUrl ? (
            <img
              src={pokefuta.heroImageUrl}
              alt={pokefuta.title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'repeating-linear-gradient(45deg,#d9cdb2 0 7px,#cfc2a3 7px 14px)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, color: '#7c6f50' }}>写真</span>
            </div>
          )}
          <Badge top={12} left={12} bg="rgba(255,255,255,.92)" color="#6f6657">
            <ImageIcon size={13} />みんなの写真 {pokefuta.photoCount}枚
          </Badge>
          <Badge top={12} right={12} bg="rgba(191,86,64,.95)" color="#fff">
            あなたは未投稿
          </Badge>
        </div>
      )}

      {/* ── 2. LOCATION + TITLE ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#9b917e', fontSize: 12, fontWeight: 600 }}>
          <MapPin size={13} />
          {pokefuta.prefecture} / {pokefuta.area}
        </div>
        <div style={{ fontFamily: ROUND, fontWeight: 800, fontSize: 21, marginTop: 4, color: '#2c2a26', lineHeight: 1.25 }}>
          {pokefuta.title}
        </div>
        {!isEmpty && (
          <div style={{ fontSize: 13, color: '#bf5640', fontWeight: 700, marginTop: 3 }}>
            あなたの構図で塗り替える
          </div>
        )}
      </div>

      {/* ── 3. COMBINED CARD ── */}
      <div
        style={{
          background: '#fffdf7',
          border: '1.5px solid #efd9a3',
          borderRadius: 18,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(72,55,20,.06), 0 3px 8px rgba(72,55,20,.05)',
        }}
      >
        {/* Ribbon */}
        <div
          style={{
            background: 'linear-gradient(100deg,#fdeae2,#fdf1e6)',
            padding: '11px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
          }}
        >
          {isEmpty ? <Flag size={16} color="#bf5640" /> : <ImageIcon size={16} color="#bf5640" />}
          <span
            style={{
              fontFamily: ROUND,
              fontWeight: 800,
              fontSize: 12.5,
              color: '#7d4536',
              flex: '1 1 auto',
              minWidth: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {isEmpty ? 'まだ誰も投稿していない' : 'あなたはまだ未記録'}
          </span>
          {isEmpty ? (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 15, color: '#9b917e' }}>0人</span>
              <ChevronRight size={13} color="#d6b8a8" />
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color: '#bf5640' }}>#1</span>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 3, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
              <span style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color: '#bf5640' }}>0</span>
              <span style={{ fontFamily: NUM, fontWeight: 700, fontSize: 12, color: '#9b917e' }}>/1 図鑑</span>
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: '#fde2c2',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              <Trophy size={16} color="#b87d0a" />
            </span>
            <div style={{ fontFamily: ROUND, fontWeight: 800, fontSize: 13.5, color: '#2c2a26' }}>
              撮ると写真図鑑も埋まる
            </div>
          </div>

          {prefectureDex && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: '#fbf6ea',
                borderRadius: 12,
                padding: '11px 13px',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: '#6f6657', fontWeight: 600 }}>
                  {pokefuta.prefecture} 写真図鑑
                </div>
                <div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color: '#2c2a26' }}>
                  {prefectureDex.current}{' '}
                  <span style={{ color: '#9b917e', fontSize: 13 }}>→</span>{' '}
                  <span style={{ color: '#bf5640' }}>{prefectureDex.current + 1}</span>{' '}
                  <span style={{ color: '#9b917e', fontSize: 13, fontWeight: 600 }}>
                    / {prefectureDex.total}
                  </span>
                </div>
              </div>
              <div style={{ width: 1, height: 30, background: '#e9dfc7', flexShrink: 0 }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color: '#1f9d63' }}>
                  +{seriesProgressDelta}
                </div>
                <div style={{ fontSize: 10.5, color: '#9b917e', fontWeight: 600 }}>シリーズ進捗</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. PILLS ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {tags.filter(Boolean).map((tag, i) => {
          const tint = TINTS[i % 3];
          const Icon = TAG_ICONS[i % 3];
          return (
            <span
              key={tag}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11.5,
                fontWeight: 700,
                padding: '5px 10px',
                borderRadius: 999,
                background: tint.bg,
                color: tint.color,
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={12} />
              {tag}
            </span>
          );
        })}
      </div>

      {/* ── 5. PRIMARY CTA ── */}
      <CtaButton onClick={onPost} bg="#bf5640" color="#fff" shadow="0 2px 0 #a8462f">
        {isEmpty ? <Flag size={19} /> : <Plus size={19} />}
        {isEmpty ? '一番乗りで投稿する' : 'あなたの1枚を加える'}
      </CtaButton>

      {/* ── 6. SECONDARY CTAs ── */}
      <div style={{ display: 'flex', gap: 10 }}>
        {onRoute && (
          <CtaButton onClick={onRoute} bg="#1f9d63" color="#fff" flex={1} size={13.5}>
            <Route size={16} />経路案内
          </CtaButton>
        )}
        {onLater && (
          <CtaButton
            onClick={onLater}
            bg="#fff"
            color="#6f6657"
            flex={1}
            size={13.5}
            border="1px solid #e9dfc7"
          >
            あとで
          </CtaButton>
        )}
      </div>
    </div>
  );
}

function Badge({
  children,
  top,
  left,
  right,
  bg,
  color,
}: {
  children: React.ReactNode;
  top?: number;
  left?: number;
  right?: number;
  bg: string;
  color: string;
}) {
  return (
    <span
      style={{
        position: 'absolute',
        top,
        left,
        right,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11.5,
        fontWeight: 700,
        padding: '5px 10px',
        borderRadius: 999,
        background: bg,
        color,
        boxShadow: '0 1px 2px rgba(72,55,20,.06), 0 3px 8px rgba(72,55,20,.05)',
      }}
    >
      {children}
    </span>
  );
}

function CtaButton({
  children,
  onClick,
  bg,
  color,
  shadow,
  border,
  flex,
  size = 16,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  bg: string;
  color: string;
  shadow?: string;
  border?: string;
  flex?: number;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: border ?? 'none',
        borderRadius: 12,
        fontFamily: '"M PLUS Rounded 1c", system-ui, sans-serif',
        fontWeight: 800,
        fontSize: size,
        padding: size >= 16 ? 15 : 12,
        width: flex ? undefined : '100%',
        flex: flex ? `${flex} 1 0` : undefined,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        letterSpacing: '.02em',
        background: bg,
        color,
        boxShadow: shadow ?? 'none',
        transition: 'box-shadow 0.1s, transform 0.1s',
      }}
      onPointerDown={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(2px)';
        el.style.boxShadow = 'none';
      }}
      onPointerUp={(e) => {
        const el = e.currentTarget;
        el.style.transform = '';
        el.style.boxShadow = shadow ?? 'none';
      }}
      onPointerLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = '';
        el.style.boxShadow = shadow ?? 'none';
      }}
    >
      {children}
    </button>
  );
}
