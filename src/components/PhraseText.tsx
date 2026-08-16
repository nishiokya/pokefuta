import { splitJapanesePhrases } from '@/lib/japanese-phrases';

/**
 * 日本語の文を、句の境目でだけ折り返すように描く。
 *
 * 各句を inline-block にすると、句の内側には改行点が無くなるので
 * 「〜できま／す。」のような1〜2文字の取り残しが出なくなる。
 * 句そのものが行に入りきらない幅では inline-block の中で普通に折り返るため、
 * 狭い端末で溢れることはない。
 *
 * 見出しのように区切り位置を手で決めたいところでは、この共通部品ではなく
 * span を直に書く（src/app/page.tsx のヒーロー見出しなど）。
 */
export function PhraseText({ text, className }: { text: string; className?: string }) {
  const phrases = splitJapanesePhrases(text);

  return (
    <span className={className}>
      {phrases.map((phrase, index) => (
        <span key={`${index}-${phrase}`} className="inline-block">
          {phrase}
        </span>
      ))}
    </span>
  );
}
