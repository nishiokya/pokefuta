import { useEffect, useState } from 'react';
import { useCallback } from 'react';

export interface PrefectureBadge {
  badgeId: string;
  userId: string;
  prefectureId: number;
  code: string;
  name: string;
  nameEn: string | null;
  status: 'active' | 'outdated' | 'none';
  totalManholes: number;
  visitedCount: number;
  currentCompletion: number;
  acquiredAt: string | null;
  outdatedAt: string | null;
  // Snapshot at badge acquisition
  snapshotTotalManholes: number | null;
  snapshotVisitedCount: number | null;
  snapshotCompletion: number | null;
}

export interface GlobalBadge {
  completedAt: string | null;
  outdatedAt: string | null;
  totalActiveCount: number;
  isComplete: boolean;
}

export interface PrefectureBadgesSummary {
  total: number;
  active: number;
  outdated: number;
  unearned: number;
}

export interface UsePrefectureBadgesReturn {
  badges: PrefectureBadge[] | null;
  globalBadge: GlobalBadge | null;
  summary: PrefectureBadgesSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook: Get all prefecture badges for the current user
 */
export function usePrefectureBadges(
  includeOutdated: boolean = true
): UsePrefectureBadgesReturn {
  const [badges, setBadges] = useState<PrefectureBadge[] | null>(null);
  const [globalBadge, setGlobalBadge] = useState<GlobalBadge | null>(null);
  const [summary, setSummary] = useState<PrefectureBadgesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBadges = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.append('includeOutdated', includeOutdated ? 'true' : 'false');

      const response = await fetch(
        `/api/badges/prefectures?${params.toString()}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setBadges(data.badges);
      setGlobalBadge(data.globalBadge);
      setSummary(data.summary);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch badges';
      setError(errorMessage);
      console.error('Error fetching prefecture badges:', err);
    } finally {
      setLoading(false);
    }
  }, [includeOutdated]);

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  return {
    badges,
    globalBadge,
    summary,
    loading,
    error,
    refetch: fetchBadges,
  };
}

export interface UseGlobalBadgeReturn {
  isComplete: boolean;
  completedAt: string | null;
  outdatedAt: string | null;
  activeCount: number;
  totalPrefectures: number;
  remainingCount: number;
  remainingPrefectures: string[];
  status: 'complete' | 'outdated' | 'in-progress';
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook: Get global badge status (all 47 prefectures)
 */
export function useGlobalBadge(): UseGlobalBadgeReturn {
  const [isComplete, setIsComplete] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [outdatedAt, setOutdatedAt] = useState<string | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [remainingCount, setRemainingCount] = useState(47);
  const [remainingPrefectures, setRemainingPrefectures] = useState<string[]>([]);
  const [status, setStatus] = useState<'complete' | 'outdated' | 'in-progress'>(
    'in-progress'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGlobalBadge = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/badges/global');

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      setIsComplete(data.isComplete);
      setCompletedAt(data.completedAt);
      setOutdatedAt(data.outdatedAt);
      setActiveCount(data.activeCount);
      setRemainingCount(data.remainingCount);
      setRemainingPrefectures(data.remainingPrefectures);
      setStatus(data.status);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch global badge';
      setError(errorMessage);
      console.error('Error fetching global badge:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalBadge();
  }, [fetchGlobalBadge]);

  return {
    isComplete,
    completedAt,
    outdatedAt,
    activeCount,
    totalPrefectures: 47,
    remainingCount,
    remainingPrefectures,
    status,
    loading,
    error,
    refetch: fetchGlobalBadge,
  };
}

/**
 * Hook: Check and create badge for a specific prefecture
 */
export function useCheckPrefectureBadge() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(
    async (prefectureId: number) => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/badges/prefectures', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prefectureId }),
        });

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to check badge';
        setError(errorMessage);
        console.error('Error checking prefecture badge:', err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    check,
    loading,
    error,
  };
}
