/* screens-MyTrip.jsx — マイ旅 再設計（旅日記）
   方針(戦略メモ): /my-trip は「完全に旅日記・写真中心・達成率は小さく」。
   現実装は達成率(PASSPORT)が主役で逆転 → 写真を主役に、達成率は細い二次行へ降格。 */

const MT_RED = "var(--terracotta)";

/* 写真あり = 横長フォトカード（タイトル+日付オーバーレイ） */
function MT_PhotoCard({ title, date, tags }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
      <div style={{ position: "relative", height: 150 }}>
        <div style={{ width: "100%", height: "100%", background: "repeating-linear-gradient(45deg,#cdbf9f 0 10px,#c2b390 10px 20px)" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(30,22,10,.62) 0%, rgba(30,22,10,0) 46%)" }} />
        <div style={{ position: "absolute", left: 12, bottom: 10, right: 12, color: "#fff" }}>
          <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, textShadow: "0 1px 3px rgba(0,0,0,.4)" }}>{title}</div>
          <div style={{ fontFamily: "var(--num)", fontSize: 11.5, opacity: .92, marginTop: 2 }}>{date}</div>
        </div>
      </div>
      <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 5 }}>
        {tags.map((t, i) => (
          <Pill key={i} kind={["peach", "lav", "mint"][i % 3]} icon={i === 0 ? I.star : i === 1 ? I.spark : I.pin} style={{ fontSize: 10, padding: "4px 8px" }}>{t}</Pill>
        ))}
      </div>
    </div>
  );
}

/* 写真ゼロ = コンパクトな写真追加CTA行（P0.2 / PhotoCtaRow と一致） */
function MT_PhotoCtaRow({ title, date, dexCurrent = 9, dexTotal = 12, pref = "愛知県" }) {
  return (
    <div style={{ background: "var(--card)", border: "1.5px solid #efd9a3", borderRadius: 14, padding: 11, display: "flex", alignItems: "center", gap: 11 }}>
      <EmptyFrame size={46}><I.camera size={17} color="#bcae8e" sw={1.8} /></EmptyFrame>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 12.5, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ fontFamily: "var(--num)", fontSize: 10.5, color: MT_RED, fontWeight: 700, margin: "1px 0 4px" }}>{date}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--ink-soft)", fontWeight: 600 }}>
          <I.trophy size={12} color="var(--amber-d)" sw={2.2} />
          {pref} 写真図鑑 <b style={{ fontFamily: "var(--num)" }}>{dexCurrent}</b>→<b style={{ fontFamily: "var(--num)", color: MT_RED }}>{dexCurrent + 1}</b>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4, flex: "0 0 auto" }}>
        <button className="btn primary" style={{ padding: "9px 12px", fontSize: 12, borderRadius: 10 }}><I.camera size={14} sw={2.4} />写真を追加</button>
        <span style={{ fontSize: 10.5, color: "var(--ink-faint)", textAlign: "center", fontWeight: 600 }}>あとで</span>
      </div>
    </div>
  );
}

function MT_MonthHead({ month, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 15, color: "var(--ink)", whiteSpace: "nowrap" }}>{month}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-faint)", background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flex: "0 0 auto" }}>{count}件</span>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
    </div>
  );
}

function MyTrip() {
  return (
    <App title="マイ旅" tab="mytrip" navTabs={window.NAV_MYTRIP}>
      {/* slim header: 訪問=撮影。集めたポケふたを主役、達成率は細い二次行へ降格 */}
      <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div className="micro" style={{ color: "var(--amber-d)", whiteSpace: "nowrap", letterSpacing: ".1em" }}>PHOTO DEX</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600, marginTop: 5 }}>集めたポケふた</div>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 26, lineHeight: 1.05 }}>80<span style={{ fontSize: 15, color: "var(--ink-faint)" }}>/470</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>今月</div>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 26, lineHeight: 1.05, color: MT_RED }}>+6</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 700 }}>今年 24件</div>
          </div>
        </div>
        <Meter pct={17} color="linear-gradient(90deg,#e2a015,#bf5640)" />
        {/* 達成率は小さく：細い二次行 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--line-soft)", paddingTop: 9, fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-soft)" }}>達成率</span>
          <span>全国 <b style={{ fontFamily: "var(--num)", color: "var(--ink-soft)" }}>80/470</b></span>
          <span style={{ opacity: .5 }}>·</span>
          <span>都道府県 <b style={{ fontFamily: "var(--num)", color: "var(--ink-soft)" }}>10/47</b></span>
          <span style={{ marginLeft: "auto" }}><I.chev size={14} color="var(--ink-faint)" /></span>
        </div>
      </div>

      {/* 旅日記タイムライン：写真中心、月でグルーピング。訪問=撮影なので全記録に写真がある */}
      <MT_MonthHead month="2026年5月" count={5} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MT_PhotoCard title="豊橋市・豊橋駅南口駅前広場" date="2026/5/24" tags={["アゴジムシは全国でここだけ", "観光地のポケふた"]} />
        <MT_PhotoCard title="名古屋市中区・金シャチ横丁" date="2026/5/4" tags={["ネッコアラは全国でここだけ", "観光地のポケふた"]} />
      </div>

      <MT_MonthHead month="2026年3月" count={3} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <MT_PhotoCard title="北海道網走市・道の駅 流氷街道" date="2026/3/18" tags={["マニューラは全国でここだけ", "網走で唯一"]} />
        <MT_PhotoCard title="北海道知床・ウトロ温泉" date="2026/3/17" tags={["ユキカブリは全国でここだけ", "世界遺産"]} />
      </div>
    </App>
  );
}

Object.assign(window, { MyTrip, MT_PhotoCard, MT_PhotoCtaRow });
