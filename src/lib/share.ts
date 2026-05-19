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

export function manholeShareText(municipality: string): string {
  return `${municipality}のポケふたを見つけました。\n訪問記録や写真を残せるポケふた用スタンプ帳です。`;
}

export function photoShareText(municipality: string, hashtags: string[] = []): string {
  const titleTags = hashtags.slice(0, 2).join(' ');
  return [
    `${municipality}のポケふたを見つけました。`,
    titleTags,
    '訪問記録や写真を残せるポケふた用スタンプ帳です。',
  ].filter(Boolean).join('\n');
}

export function visitsShareText(): string {
  return 'ポケふた巡りのスタンプ帳を更新しました。\n訪問したポケふたを写真付きで記録しています。';
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

  panel.appendChild(makeBtn('リンクをコピー', async () => {
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
