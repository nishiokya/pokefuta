/** 図鑑の `design_manholes.ndjson` のうち、写真館の投稿（`pokefuta-design:<uuid>`）1枚分 */
export interface SnapshotDesignManhole {
  /** 写真館の design_manhole.id（接頭辞を外した uuid） */
  id: string;
  title: string | null;
  latitude: number;
  longitude: number;
}

const DESIGN_MANHOLE_ID_PREFIX = 'pokefuta-design:';

/**
 * `design_manholes.ndjson`（pokefuta-tracker の update-design-manholes.yml が日次で書き出す）を読む。
 * 写真館の投稿以外の行・壊れた行・位置の無い行・active でない行は捨てる。
 */
export function parseDesignManholeNdjson(text: string): SnapshotDesignManhole[] {
  const rows: SnapshotDesignManhole[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row: Record<string, unknown>;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const rawId = typeof row.id === 'string' ? row.id : '';
    if (!rawId.startsWith(DESIGN_MANHOLE_ID_PREFIX)) continue;
    if (row.status !== undefined && row.status !== 'active') continue;
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue;
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
    rows.push({
      id: rawId.slice(DESIGN_MANHOLE_ID_PREFIX.length),
      title: typeof row.title === 'string' ? row.title : null,
      latitude: row.lat,
      longitude: row.lng,
    });
  }
  return rows;
}
