'use client';

import React from 'react';
import { Trophy, Zap, Lock } from 'lucide-react';
import { usePrefectureBadges, useGlobalBadge, PrefectureBadge } from '@/lib/hooks/usePrefectureBadges';

interface PrefectureBadgeDisplayProps {
  badge: PrefectureBadge;
}

/**
 * 単一都道府県バッジの表示コンポーネント
 */
export function PrefectureBadgeDisplay({ badge }: PrefectureBadgeDisplayProps) {
  const getStatusDisplay = () => {
    switch (badge.status) {
      case 'active':
        return (
          <div className="flex items-center gap-1">
            <Trophy className="w-4 h-4 text-rpg-yellow" />
            <span className="text-xs font-bold text-rpg-yellow">達成</span>
          </div>
        );
      case 'outdated':
        return (
          <div className="flex items-center gap-1">
            <Zap className="w-4 h-4 text-rpg-orange" />
            <span className="text-xs font-bold text-rpg-orange">古い</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getNewManholeCount = () => {
    if (badge.status !== 'outdated') return 0;
    return badge.totalManholes - (badge.snapshotTotalManholes || 0);
  };

  return (
    <div
      className={`p-3 border-2 ${
        badge.status === 'active'
          ? 'border-rpg-yellow bg-rpg-bgLight'
          : badge.status === 'outdated'
            ? 'border-rpg-orange bg-rpg-bgDark'
            : 'border-rpg-border bg-rpg-bgDark opacity-60'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-pixelJp font-bold text-rpg-textDark">
            {badge.name}
          </p>
          <p className="text-xs text-rpg-textDark opacity-70">{badge.nameEn}</p>
        </div>
        {getStatusDisplay()}
      </div>

      <div className="mb-2">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-bold text-rpg-textDark">
            {badge.visitedCount}/{badge.totalManholes}
          </span>
          <span className="text-xs text-rpg-textDark opacity-70">
            {badge.currentCompletion.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-rpg-bgDark border-1 border-rpg-border h-2">
          <div
            className={`h-full ${
              badge.status === 'active'
                ? 'bg-rpg-yellow'
                : badge.status === 'outdated'
                  ? 'bg-rpg-orange'
                  : 'bg-rpg-border'
            }`}
            style={{ width: `${Math.min(100, badge.currentCompletion)}%` }}
          />
        </div>
      </div>

      {badge.status === 'outdated' && getNewManholeCount() > 0 && (
        <p className="text-xs text-rpg-orange font-bold">
          ✦ {getNewManholeCount()}個の新しいマンホール
        </p>
      )}

      {badge.acquiredAt && (
        <p className="text-xs text-rpg-textDark opacity-60 mt-1">
          {new Date(badge.acquiredAt).toLocaleDateString('ja-JP')} 達成
        </p>
      )}
    </div>
  );
}

interface PrefectureBadgesGridProps {
  showOutdated?: boolean;
  className?: string;
}

/**
 * 都道府県バッジグリッド表示
 */
export function PrefectureBadgesGrid({
  showOutdated = true,
  className = '',
}: PrefectureBadgesGridProps) {
  const { badges, loading, error } = usePrefectureBadges(showOutdated);

  if (loading) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="font-pixelJp text-rpg-textDark">読込中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 text-rpg-red ${className}`}>
        <p className="font-pixelJp text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 ${className}`}>
      {badges?.map((badge) => (
        <PrefectureBadgeDisplay key={badge.badgeId || badge.prefectureId} badge={badge} />
      ))}
    </div>
  );
}

interface GlobalBadgeDisplayProps {
  className?: string;
}

/**
 * グローバルバッジ（全47都道府県制覇）表示
 */
export function GlobalBadgeDisplay({ className = '' }: GlobalBadgeDisplayProps) {
  const { isComplete, activeCount, status, loading, error, completedAt } =
    useGlobalBadge();

  if (loading) {
    return (
      <div className={`rpg-window p-4 ${className}`}>
        <h3 className="rpg-window-title mb-2">全国制覇バッジ</h3>
        <p className="font-pixelJp text-sm text-rpg-textDark">読込中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rpg-window p-4 ${className}`}>
        <h3 className="rpg-window-title mb-2">全国制覇バッジ</h3>
        <p className="font-pixelJp text-sm text-rpg-red">{error}</p>
      </div>
    );
  }

  return (
    <div className={`rpg-window p-4 ${className}`}>
      <h3 className="rpg-window-title mb-3">全国制覇バッジ</h3>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-pixelJp text-sm font-bold text-rpg-textDark">
            都道府県：{activeCount}/47
          </p>
          {isComplete && (
            <Trophy className="w-6 h-6 text-rpg-yellow animate-pulse" />
          )}
        </div>

        <div className="w-full bg-rpg-bgDark border-2 border-rpg-border h-4">
          <div
            className={`h-full transition-all ${
              isComplete ? 'bg-rpg-yellow' : 'bg-rpg-cyan'
            }`}
            style={{ width: `${(activeCount / 47) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        {isComplete && completedAt && (
          <div className="p-2 bg-rpg-yellow/20 border-2 border-rpg-yellow">
            <p className="font-pixelJp text-xs font-bold text-rpg-textDark">
              ✨ 全国制覇達成！
            </p>
            <p className="text-xs text-rpg-textDark opacity-70">
              {new Date(completedAt).toLocaleDateString('ja-JP')}
            </p>
          </div>
        )}

        {status === 'outdated' && !isComplete && (
          <div className="p-2 bg-rpg-orange/20 border-2 border-rpg-orange">
            <p className="font-pixelJp text-xs font-bold text-rpg-orange">
              再チャレンジ中
            </p>
            <p className="text-xs text-rpg-textDark opacity-70">
              新しいマンホールが見つかりました
            </p>
          </div>
        )}

        {status === 'in-progress' && (
          <div className="p-2 bg-rpg-cyan/20 border-2 border-rpg-cyan">
            <p className="font-pixelJp text-xs font-bold text-rpg-textDark">
              {47 - activeCount}都道府県をあと訪問...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface BadgeSummaryProps {
  className?: string;
}

/**
 * バッジ進捗サマリー
 */
export function BadgeSummary({ className = '' }: BadgeSummaryProps) {
  const { summary, loading, error } = usePrefectureBadges(true);

  if (loading || error) {
    return null;
  }

  if (!summary) {
    return null;
  }

  return (
    <div className={`flex gap-4 font-pixelJp text-sm ${className}`}>
      <div className="text-center">
        <p className="text-rpg-yellow font-bold">{summary.active}</p>
        <p className="text-xs text-rpg-textDark">達成</p>
      </div>
      <div className="text-center">
        <p className="text-rpg-orange font-bold">{summary.outdated}</p>
        <p className="text-xs text-rpg-textDark">古い</p>
      </div>
      <div className="text-center">
        <p className="text-rpg-cyan font-bold">{summary.unearned}</p>
        <p className="text-xs text-rpg-textDark">未達成</p>
      </div>
    </div>
  );
}
