'use client';

import { Camera, ImageIcon, MapPin } from 'lucide-react';

const NUM = '"Outfit", "M PLUS Rounded 1c", system-ui, sans-serif';
const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

interface PrefectureProgress {
  name: string;
  visited: number;
  total: number;
}

export interface PhotoCtaRowProps {
  manholeId: number;
  title: string;
  prefecture: string;
  municipality: string;
  prefectureProgress: PrefectureProgress | null;
  onPost: () => void;
  onLater: () => void;
}

export default function PhotoCtaRow({
  title,
  prefecture,
  municipality,
  prefectureProgress,
  onPost,
  onLater,
}: PhotoCtaRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderRadius: 14,
        border: '1.5px solid #efd9a3',
        background: '#fffdf7',
        padding: '10px 12px',
        boxShadow: '0 1px 2px rgba(72,55,20,.05)',
      }}
    >
      {/* Thumbnail placeholder */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          background: '#ece2cd',
          border: '1px dashed #cdbf9f',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        <ImageIcon size={16} color="#9b917e" />
      </div>

      {/* Title + dex hook */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#9b917e', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
          <MapPin size={11} />
          {prefecture} / {municipality}
        </div>
        <div
          style={{
            fontFamily: ROUND,
            fontWeight: 800,
            fontSize: 13,
            color: '#2c2a26',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </div>
        {prefectureProgress && (
          <div style={{ fontFamily: NUM, fontSize: 11, color: '#6f6657', marginTop: 1 }}>
            {prefecture}図鑑{' '}
            <span style={{ fontWeight: 700, color: '#9b917e' }}>{prefectureProgress.visited}</span>
            <span style={{ color: '#c5b89e', margin: '0 2px' }}>→</span>
            <span style={{ fontWeight: 800, color: '#bf5640' }}>{prefectureProgress.visited + 1}</span>
            <span style={{ color: '#9b917e' }}> / {prefectureProgress.total}</span>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onPost}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            fontFamily: ROUND,
            fontWeight: 800,
            fontSize: 12.5,
            padding: '6px 11px',
            borderRadius: 8,
            border: 'none',
            background: '#bf5640',
            color: '#fff',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Camera size={13} />
          写真を追加
        </button>
        <button
          onClick={onLater}
          style={{
            fontFamily: ROUND,
            fontWeight: 700,
            fontSize: 11,
            color: '#9b917e',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
          }}
        >
          あとで
        </button>
      </div>
    </div>
  );
}
