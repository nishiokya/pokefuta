/**
 * 自分のデザインマンホール投稿の一覧（/visits/design-manholes とスタンプ帳の節）の表示用。
 * RPC get_own_design_manholes() の行を、画面に渡す形へ変換する純粋関数。
 * クライアントからも使うので server-only にしない。storage_key は表示用の型に含めない。
 */

export type OwnDesignManholeRow = {
  id: string;
  title: string | null;
  description: string | null;
  status: string;
  storage_key: string;
  created_at: string;
  moved_manhole_id: number | null;
};

export type OwnDesignManholeStatus = 'published' | 'needs_review' | 'moved';

export type OwnDesignManhole = {
  id: string;
  title: string | null;
  description: string | null;
  status: OwnDesignManholeStatus;
  created_at: string;
  photo_url: string;
  /** 詳細ページ。確認待ちは公開分しか出ないので null */
  href: string | null;
};

export const OWN_DESIGN_MANHOLE_STATUS_LABEL: Record<OwnDesignManholeStatus, string | null> = {
  published: null,
  needs_review: '確認待ち',
  moved: 'ポケふたの記録へ移しました',
};

/** 公開中の投稿の写真は共有キャッシュされる公開ルートを使う（署名URLは要らない） */
export function publishedPhotoUrl(id: string): string {
  return `/api/design-manholes/${id}/photo?size=small`;
}

/** 署名URLが要る行か（published 以外） */
export function needsSignedPhotoUrl(row: Pick<OwnDesignManholeRow, 'status'>): boolean {
  return row.status !== 'published';
}

/**
 * 行を表示用に変換する。published 以外は signedUrl（署名付きの写真URL）が必要。
 * 表示できない行（想定外の status、署名URLが無い）は null を返す。
 */
export function toOwnDesignManhole(row: OwnDesignManholeRow, signedUrl?: string | null): OwnDesignManhole | null {
  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    created_at: row.created_at,
  };
  if (row.status === 'published') {
    return { ...base, status: 'published', href: `/design-manholes/${row.id}`, photo_url: publishedPhotoUrl(row.id) };
  }
  if (!signedUrl) return null;
  if (row.status === 'needs_review') {
    return { ...base, status: 'needs_review', href: null, photo_url: signedUrl };
  }
  if (row.status === 'hidden' && row.moved_manhole_id != null) {
    return { ...base, status: 'moved', href: `/manhole/${row.moved_manhole_id}`, photo_url: signedUrl };
  }
  return null;
}
