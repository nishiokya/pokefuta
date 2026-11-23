/**
 * 文字列をクリップボードへ写す。成功したら true。
 *
 * `navigator.clipboard` が無い / 権限で拒否される環境（古い WebView、
 * SNS アプリ内ブラウザ、非セキュアコンテキスト）では、見えない textarea を
 * 選択して execCommand('copy') に落とす。どちらも駄目なら false を返すので、
 * 呼び出し側は「長押しでコピーしてください」と案内する。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // ここで諦めない。無反応は失敗と区別できない。
  }
  return copyViaSelection(text);
}

function copyViaSelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(area);
  }
}
