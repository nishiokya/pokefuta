import { Award, Stamp } from 'lucide-react';

const MOCKUP_STAMPS = [
  { src: '/mockup/s1.jpeg', name: 'ルギア' },
  { src: '/mockup/s2.jpeg', name: 'ホエルオー' },
  { src: '/mockup/s3.jpeg', name: 'ロコン' },
];

const PREFECTURE_GRID: Array<{ short: string; state: 'complete' | 'partial' | 'empty'; title: string }> = [
  { short: '北海', state: 'complete', title: '北海道 制覇済み' },
  { short: '青森', state: 'complete', title: '青森県 制覇済み' },
  { short: '岩手', state: 'partial', title: '岩手県 訪問済み' },
  { short: '宮城', state: 'complete', title: '宮城県 制覇済み' },
  { short: '秋田', state: 'partial', title: '秋田県 訪問済み' },
  { short: '山形', state: 'empty', title: '山形県 未訪問' },
  { short: '福島', state: 'partial', title: '福島県 訪問済み' },
  { short: '茨城', state: 'partial', title: '茨城県 訪問済み' },
  { short: '栃木', state: 'empty', title: '栃木県 未訪問' },
  { short: '群馬', state: 'empty', title: '群馬県 未訪問' },
  { short: '埼玉', state: 'complete', title: '埼玉県 制覇済み' },
  { short: '千葉', state: 'complete', title: '千葉県 制覇済み' },
  { short: '東京', state: 'complete', title: '東京都 制覇済み' },
  { short: '神奈', state: 'complete', title: '神奈川県 制覇済み' },
  { short: '新潟', state: 'partial', title: '新潟県 訪問済み' },
  { short: '富山', state: 'empty', title: '富山県 未訪問' },
  { short: '石川', state: 'partial', title: '石川県 訪問済み' },
  { short: '福井', state: 'empty', title: '福井県 未訪問' },
  { short: '山梨', state: 'empty', title: '山梨県 未訪問' },
  { short: '長野', state: 'partial', title: '長野県 訪問済み' },
  { short: '岐阜', state: 'partial', title: '岐阜県 訪問済み' },
  { short: '静岡', state: 'complete', title: '静岡県 制覇済み' },
  { short: '愛知', state: 'complete', title: '愛知県 制覇済み' },
  { short: '三重', state: 'partial', title: '三重県 訪問済み' },
  { short: '滋賀', state: 'empty', title: '滋賀県 未訪問' },
  { short: '京都', state: 'complete', title: '京都府 制覇済み' },
  { short: '大阪', state: 'complete', title: '大阪府 制覇済み' },
  { short: '兵庫', state: 'complete', title: '兵庫県 制覇済み' },
  { short: '奈良', state: 'partial', title: '奈良県 訪問済み' },
  { short: '和歌', state: 'empty', title: '和歌山県 未訪問' },
  { short: '鳥取', state: 'empty', title: '鳥取県 未訪問' },
  { short: '島根', state: 'empty', title: '島根県 未訪問' },
  { short: '岡山', state: 'partial', title: '岡山県 訪問済み' },
  { short: '広島', state: 'complete', title: '広島県 制覇済み' },
  { short: '山口', state: 'partial', title: '山口県 訪問済み' },
  { short: '徳島', state: 'empty', title: '徳島県 未訪問' },
  { short: '香川', state: 'partial', title: '香川県 訪問済み' },
  { short: '愛媛', state: 'empty', title: '愛媛県 未訪問' },
  { short: '高知', state: 'empty', title: '高知県 未訪問' },
  { short: '福岡', state: 'complete', title: '福岡県 制覇済み' },
  { short: '佐賀', state: 'partial', title: '佐賀県 訪問済み' },
  { short: '長崎', state: 'partial', title: '長崎県 訪問済み' },
  { short: '熊本', state: 'partial', title: '熊本県 訪問済み' },
  { short: '大分', state: 'empty', title: '大分県 未訪問' },
  { short: '宮崎', state: 'empty', title: '宮崎県 未訪問' },
  { short: '鹿児', state: 'partial', title: '鹿児島県 訪問済み' },
  { short: '沖縄', state: 'complete', title: '沖縄県 制覇済み' },
];

const PREFECTURE_STATE_CLASS = {
  complete: 'bg-[#7B63A8] text-white',
  partial: 'bg-[#DDD0F5] text-[#7B63A8]',
  empty: 'bg-[#F0EEF5] text-[#C0B8D0]',
} as const;

export default function StampBookMockup() {
  return (
    <div className="overflow-hidden rounded-[10px] border-2 border-[#C9B8E8] bg-[#FFFDF7] text-xs">
      {/* Passport header */}
      <div className="flex items-center justify-between bg-[#7B63A8] px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-white">
          <Stamp className="h-3.5 w-3.5" />
          ポケふたパスポート
        </div>
        <div className="flex items-center gap-1 rounded-full bg-[#FFB347] px-2 py-0.5 text-[9px] font-extrabold text-white">
          <Award className="h-2.5 w-2.5" />
          355達成!
        </div>
      </div>

      <div className="space-y-1.5 p-2.5">
        {/* 全国 + 都道府県コンプ + ポケモンコンプ 横並び */}
        <div className="flex gap-2 border-b border-dashed border-[#DDD0F5] pb-1.5">
          <div className="flex-1">
            <div className="text-[9px] font-bold text-[#9B9B9B]">全国</div>
            <div className="text-xl font-extrabold leading-tight text-[#7B63A8]">
              355<span className="ml-0.5 text-[9px] font-bold text-[#9B9B9B]">/470</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[9px] font-bold text-[#9B9B9B]">都道府県</div>
            <div className="text-xl font-extrabold leading-tight text-[#2C765E]">
              15<span className="ml-0.5 text-[9px] font-bold text-[#9B9B9B]">/47</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-[9px] font-bold text-[#9B9B9B]">ポケモン</div>
            <div className="text-xl font-extrabold leading-tight text-[#FFB347]">
              42<span className="ml-0.5 text-[9px] font-bold text-[#9B9B9B]">/151</span>
            </div>
          </div>
        </div>

        {/* Recent 3 stamps with real photos */}
        <div>
          <div className="mb-0.5 text-[9px] font-extrabold text-[#6B6B6B]">最近集めたポケふた</div>
          <div className="flex gap-1">
            {MOCKUP_STAMPS.slice(0, 3).map(({ src, name }) => (
              <div key={src} className="flex flex-1 flex-col items-center gap-0.5">
                <div className="mx-auto h-[52px] w-[52px] overflow-hidden rounded-full border-2 border-[#7B63A8] shadow-sm">
                  <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </div>
                <span className="text-center text-[7px] font-bold leading-tight text-[#7B63A8]">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 都道府県達成 Grid */}
        <div className="border-t border-dashed border-[#DDD0F5] pt-2">
          <div className="mb-1 text-[9px] font-extrabold text-[#6B6B6B]">都道府県達成</div>
          <div className="flex flex-wrap gap-0.5">
            {PREFECTURE_GRID.map(({ short, state, title }) => (
              <div
                key={short}
                title={title}
                className={`rounded-sm px-[3px] py-[1px] text-[7px] font-bold leading-tight ${PREFECTURE_STATE_CLASS[state]}`}
              >
                {short}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
