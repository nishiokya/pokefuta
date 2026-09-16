/**
 * 訪問記録の公開/非公開切り替え。
 * マンホール詳細（ManholePage）と マイ旅（/my-trip）の両方から使う。
 */

/** PATCH /api/visits/[id] を叩く。成功したら true。 */
export async function updateVisitVisibility(
  visitId: string,
  isPublic: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`/api/visits/${visitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.success === true;
  } catch {
    return false;
  }
}

/**
 * POST /api/visits/publish-all を叩いて、自分の非公開の訪問記録をまとめて公開する。
 *
 * 単体の PATCH を件数分ループしないのは、非公開が数十件たまっている人がいるため
 * （2026-09-06 時点で非公開592件）。1リクエストで済ませ、途中で失敗して
 * 半端に公開された状態が残らないようにする。
 *
 * @returns 公開できた件数。失敗したら null
 */
export async function publishAllPrivateVisits(): Promise<number | null> {
  try {
    const res = await fetch('/api/visits/publish-all', { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.success !== true) return null;
    return typeof data.published_count === 'number' ? data.published_count : null;
  } catch {
    return null;
  }
}

/**
 * 簡易トースト。グローバルなトースト基盤が無いので
 * ShareButtons.tsx の showCopyToast と同じ DOM 差し込み方式に揃えている。
 */
export function showVisibilityToast(message: string, success: boolean = true) {
  if (typeof document === 'undefined') return;
  const toast = document.createElement('div');
  toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg shadow-lg font-pixelJp text-sm z-50 text-white ${
    success ? 'bg-[#4F3828]' : 'bg-rpg-red'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
