const HASHTAGS = 'ポケふた,ポケモンマンホール';

export function buildXShareUrl(text: string, pageUrl: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(pageUrl)}&hashtags=${HASHTAGS}`;
}

export function buildLineShareUrl(pageUrl: string): string {
  return `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;
}

export function manholeShareText(municipality: string): string {
  return `${municipality}のポケふたを見つけました。\n訪問記録や写真を残せるポケふた用スタンプ帳です。`;
}

export function visitsShareText(): string {
  return 'ポケふた巡りのスタンプ帳を更新しました。\n訪問したポケふたを写真付きで記録しています。';
}
