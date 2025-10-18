'use client';

import { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

interface TermsOfServiceProps {
  isChecked: boolean;
  onCheckChange: (checked: boolean) => void;
  className?: string;
}

export default function TermsOfService({ isChecked, onCheckChange, className = '' }: TermsOfServiceProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`bg-rpg-bgLight border-2 border-rpg-border p-3 ${className}`}>
      {/* チェックボックス */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onCheckChange(e.target.checked)}
          className="mt-1 w-4 h-4 cursor-pointer"
          required
        />
        <div className="flex-1">
          <span className="font-pixelJp text-xs text-rpg-textDark">
            利用規約に同意します
          </span>
        </div>
      </label>

      {/* 展開ボタン */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1 mt-2 font-pixelJp text-xs text-rpg-blue hover:opacity-70 transition-opacity"
      >
        <Info className="w-3 h-3" />
        <span>利用規約を確認</span>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" />
        ) : (
          <ChevronDown className="w-3 h-3" />
        )}
      </button>

      {/* 利用規約詳細（展開時のみ表示） */}
      {isExpanded && (
        <div className="mt-3 p-3 bg-rpg-bgDark border-2 border-rpg-border max-h-64 overflow-y-auto">
          <div className="space-y-3 font-pixelJp text-xs text-rpg-textDark">
            <div>
              <h3 className="font-bold text-rpg-yellow mb-2">📸 写真の公開について</h3>
              <p className="leading-relaxed opacity-90">
                本サービスにアップロードされた写真は、サイト管理者によってSNS（Twitter/X、Instagram等）や
                ブログ、その他のメディアで公開される場合があります。
              </p>
            </div>

            <div>
              <h3 className="font-bold text-rpg-yellow mb-2">🔒 個人情報の取り扱い</h3>
              <p className="leading-relaxed opacity-90">
                メールアドレス等の個人情報は、サービスの提供目的でのみ使用し、第三者に提供することはありません。
                ただし、投稿された写真や訪問記録のデータは公開コンテンツとして扱われます。
              </p>
            </div>

            <div>
              <h3 className="font-bold text-rpg-yellow mb-2">⚠️ 禁止事項</h3>
              <ul className="list-disc list-inside space-y-1 opacity-90">
                <li>他者の権利を侵害する写真の投稿</li>
                <li>個人を特定できる情報が含まれる写真の投稿</li>
                <li>公序良俗に反する内容の投稿</li>
                <li>虚偽の情報やスパム行為</li>
              </ul>
            </div>

            <div>
              <h3 className="font-bold text-rpg-yellow mb-2">📝 権利関係</h3>
              <p className="leading-relaxed opacity-90">
                アップロードされた写真の著作権は投稿者に帰属しますが、本サービスおよびサイト管理者は、
                写真を非営利目的で使用する権利を有します。これには、SNSでの共有、ブログ記事での掲載、
                プロモーション活動での利用などが含まれます。
              </p>
            </div>

            <div>
              <h3 className="font-bold text-rpg-yellow mb-2">🗑️ 削除依頼について</h3>
              <p className="leading-relaxed opacity-90">
                投稿した写真の削除を希望する場合は、アプリ内の削除機能をご利用ください。
                ただし、すでにSNS等で公開された写真については、完全な削除をお約束できない場合があります。
              </p>
            </div>

            <div className="pt-2 border-t-2 border-rpg-border">
              <p className="text-[10px] opacity-70">
                本規約は予告なく変更される場合があります。
                継続してサービスをご利用いただくことで、変更後の規約に同意したものとみなします。
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
