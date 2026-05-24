const DEFAULT_HASHTAGS = ['ポケふた', 'ポケモンマンホール'];

function normalizeHashtag(tag: string): string {
  return tag.replace(/^#+/, '').trim();
}

export function buildXShareUrl(text: string, pageUrl: string, hashtags: string[] = []): string {
  const mergedHashtags = [...hashtags, ...DEFAULT_HASHTAGS]
    .map(normalizeHashtag)
    .filter(Boolean);

  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}&hashtags=${encodeURIComponent(mergedHashtags.join(','))}`;
}

export function buildLineShareUrl(pageUrl: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;
}

export function manholeShareText(municipality: string, pokemons: string[] = []): string {
  const pokemonStr = pokemons.slice(0, 3).join('・');
  return pokemonStr
    ? `${pokemonStr}のポケふたを${municipality}で見つけました！`
    : `${municipality}のポケふたを見つけました！`;
}

export function photoShareText(municipality: string, hashtags: string[] = [], pokemons: string[] = []): string {
  const pokemonStr = pokemons.slice(0, 3).join('・');
  const titleTags = hashtags.slice(0, 2).join(' ');
  const base = pokemonStr
    ? `${pokemonStr}のポケふたを${municipality}で記録しました！`
    : `${municipality}のポケふたを記録しました！`;
  return [base, titleTags].filter(Boolean).join('\n');
}

export function visitsShareText(stampCount: number): string {
  return `ポケふた旅を続けています！\n${stampCount}枚のポケふたを巡りました`;
}

export function prefectureProgressShareText(
  completedPrefectureCount: number,
  totalPrefectureCount: number
): string {
  return `${completedPrefectureCount}/${totalPrefectureCount}都道府県のポケふたを制覇しました！`;
}

export function prefectureCardShareText(
  prefectureName: string,
  visited: number,
  total: number,
  complete: boolean
): string {
  return complete
    ? `${prefectureName}のポケふたを全て制覇しました！`
    : `${prefectureName}のポケふたを${visited}/${total}枚制覇中です！`;
}

export interface SharePanelCallbacks {
  onShareX: () => void;
  onShareLine: () => void;
  onCopyLink: () => void;
}

function showToast(message: string, isError: boolean) {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg shadow-lg font-pixelJp text-sm z-50 text-white ${isError ? 'bg-rpg-red' : 'bg-[#4F3828]'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

export function openSharePanel(
  shareText: string,
  shareUrl: string,
  callbacks: SharePanelCallbacks,
  hashtags: string[] = []
): () => void {
  const panel = document.createElement('div');
  panel.id = 'pokefuta-share-panel';
  panel.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#4F3828] text-white rounded-lg shadow-xl font-pixelJp text-sm z-50 p-4 flex flex-col gap-2 min-w-[200px]';

  const titleEl = document.createElement('p');
  titleEl.className = 'text-xs text-center opacity-70 mb-1';
  titleEl.textContent = '共有する';
  panel.appendChild(titleEl);

  let cleanup: () => void;

  const makeBtn = (label: string, onClick: () => void) => {
    const btn = document.createElement('button');
    btn.className = 'w-full text-left px-3 py-2 rounded bg-white/10 hover:bg-white/20 transition-colors text-sm';
    btn.textContent = label;
    btn.addEventListener('click', () => { onClick(); cleanup(); });
    return btn;
  };

  panel.appendChild(makeBtn('X でシェア', () => {
    callbacks.onShareX();
    window.open(buildXShareUrl(shareText, shareUrl, hashtags), '_blank', 'noopener,noreferrer');
  }));

  panel.appendChild(makeBtn('LINE でシェア', () => {
    callbacks.onShareLine();
    window.open(buildLineShareUrl(shareUrl), '_blank', 'noopener,noreferrer');
  }));

  panel.appendChild(makeBtn('通常の共有', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      callbacks.onCopyLink();
      showToast('リンクをコピーしました', false);
    } catch {
      showToast('コピーに失敗しました', true);
    }
  }));

  document.body.appendChild(panel);

  const closeOnOutside = (e: MouseEvent) => {
    if (!panel.contains(e.target as Node)) cleanup();
  };

  cleanup = () => {
    panel.remove();
    document.removeEventListener('click', closeOnOutside);
  };

  setTimeout(() => document.addEventListener('click', closeOnOutside), 0);

  return cleanup;
}
