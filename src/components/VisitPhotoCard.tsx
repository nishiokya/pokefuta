'use client';

import Link from 'next/link';

const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';
const NUM = '"Outfit", "M PLUS Rounded 1c", system-ui, sans-serif';

const TINTS = [
  { bg: '#fdeae2', color: '#bf5640' },
  { bg: '#ece9fb', color: '#6a5fc4' },
  { bg: '#e2f2e9', color: '#1f9d63' },
];

export interface VisitPhotoCardProps {
  manholeId: number;
  thumbnailUrl?: string | null;
  title: string;
  date: string;
  posterName?: string | null;
  tags: string[];
}

export default function VisitPhotoCard({ manholeId, thumbnailUrl, title, date, posterName, tags }: VisitPhotoCardProps) {
  const visiblePosterName = posterName?.trim();

  return (
    <Link href={`/manhole/${manholeId}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
      <div
        style={{
          background: '#fffdf7',
          border: '1px solid #e9dfc7',
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(72,55,20,.05), 0 3px 8px rgba(72,55,20,.05)',
        }}
      >
        <div style={{ position: 'relative', height: 150 }}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              loading="lazy"
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'repeating-linear-gradient(45deg,#cdbf9f 0 10px,#c2b390 10px 20px)',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(to top, rgba(30,22,10,.62) 0%, rgba(30,22,10,0) 46%)',
            }}
          />
          <div style={{ position: 'absolute', left: 12, bottom: 10, right: 12, color: '#fff' }}>
            <div
              style={{
                fontFamily: ROUND,
                fontWeight: 700,
                fontSize: 13,
                lineHeight: 1.3,
                textShadow: '0 1px 3px rgba(0,0,0,.4)',
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {title}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: NUM,
                fontSize: 11,
                lineHeight: 1.25,
                opacity: 0.9,
                marginTop: 2,
                minWidth: 0,
              }}
            >
              <span style={{ flexShrink: 0 }}>{date}</span>
              {visiblePosterName && (
                <>
                  <span style={{ flexShrink: 0, opacity: 0.75 }}>/</span>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {visiblePosterName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        {tags.length > 0 && (
          <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {tags.slice(0, 2).map((tag, i) => (
              <span
                key={tag}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '3px 7px',
                  borderRadius: 999,
                  background: TINTS[i % 3].bg,
                  color: TINTS[i % 3].color,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  maxWidth: '100%',
                  textOverflow: 'ellipsis',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
