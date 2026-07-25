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
