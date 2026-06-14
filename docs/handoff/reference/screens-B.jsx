/* screens-B.jsx — 案B 一番乗り型 (FOMO / scarcity: "まだ誰も写真を出していない") */

const B_RED = "var(--terracotta)";

function B_FirstBadge({ small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--terracotta)", color: "#fff", fontWeight: 800, fontFamily: "var(--round)", fontSize: small ? 10.5 : 12, padding: small ? "3px 8px" : "5px 10px", borderRadius: 999, boxShadow: "0 2px 6px rgba(160,60,35,.28)" }}>
      <I.flag size={small ? 11 : 13} sw={2.6} />一番乗りチャンス
    </span>
  );
}

/* ---------------- HOME ---------------- */
function B_Home() {
  const feed = [
    { name: "石川県 能登・道の駅", pkmn: "ヌメイル", tag: "能登で唯一", dist: "—", rare: "全国でここだけ" },
    { name: "宮城県 仙台・海岸公園", pkmn: "ホエルコ", tag: "海が見える", dist: "12km", rare: "レアポケふた" },
  ];
  return (
    <App title="スタンプ帳" tab="stamp">
      {/* scarcity counter */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #f0cfc2" }}>
        <div style={{ background: "linear-gradient(100deg,#fdeae2,#fdf1e6)", padding: "15px 16px", display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ textAlign: "center", flex: "0 0 auto" }}>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 32, lineHeight: 1, color: B_RED }}>312</div>
            <div style={{ fontSize: 10.5, color: "var(--peach-tx)", fontWeight: 700, marginTop: 2 }}>件が写真0枚</div>
          </div>
          <div style={{ width: 1, height: 40, background: "#f0cfc2" }} />
          <div style={{ fontSize: 12.5, color: "#7d4536", lineHeight: 1.5, fontWeight: 600 }}>
            まだ<b>誰も写真を出していない</b>ポケふたが全国に。<br />あなたの1枚が<b>最初の記録</b>になります。
          </div>
        </div>
      </div>

      {/* uncharted feed */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <I.target size={15} color="var(--ink-soft)" sw={2.2} />
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>未開拓のポケふた</span>
        <span className="pill peach" style={{ fontSize: 10, padding: "3px 7px" }}>一番乗り募集中</span>
      </div>

      {feed.map((f) => (
        <div key={f.name} className="card" style={{ padding: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", flex: "0 0 auto" }}>
            <EmptyFrame size={72}><span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 22, color: "#c9b78f" }}>0</span></EmptyFrame>
            <span style={{ position: "absolute", top: -5, right: -5, background: B_RED, color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 6px", borderRadius: 999, fontFamily: "var(--round)" }}>0枚</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 5 }}>{f.name}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 9 }}>
              <Pill kind="peach" icon={I.star} style={{ fontSize: 10, padding: "4px 8px" }}>{f.rare}</Pill>
              <Pill kind="lav" style={{ fontSize: 10, padding: "4px 8px" }}>{f.tag}</Pill>
            </div>
            <div className="btn primary" style={{ width: "100%", padding: "9px 0", fontSize: 12.5, borderRadius: 10 }}>
              <I.flag size={14} sw={2.5} />一番乗りで投稿する
            </div>
          </div>
        </div>
      ))}

      {/* near-you nudge */}
      <div className="card" style={{ padding: "13px 14px", display: "flex", alignItems: "center", gap: 11, background: "var(--card-2)" }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "#fff", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}><I.pin size={18} color={B_RED} sw={2.2} /></span>
        <div style={{ flex: 1, fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.45 }}>
          位置情報をオンにすると<b style={{ color: "var(--ink)" }}>近くの未開拓ポケふた</b>を表示
        </div>
        <I.chev size={16} color="var(--ink-faint)" />
      </div>
    </App>
  );
}

/* ---------------- DETAIL ---------------- */
function B_Detail() {
  return (
    <App title="網走のポケふた" tab="post" auth="tako">
      {/* hero with FOMO overlay */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)", border: "2px dashed #cdbf9f", height: 196, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 46, lineHeight: 1, color: "#cdbb92" }}>0</div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink-soft)", marginTop: 6 }}>まだ誰も写真を出していません</div>
        </div>
        <div style={{ position: "absolute", top: 12, left: 12 }}><B_FirstBadge small /></div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 12, fontWeight: 600 }}>
          <I.pin size={13} sw={2.2} />北海道 / 網走
        </div>
        <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 21, marginTop: 4, lineHeight: 1.25 }}>この網走のポケふた、<br /><span style={{ color: B_RED }}>あなたが最初の記録者に。</span></div>
      </div>

      {/* social proof inversion */}
      <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, border: "1.5px solid #f0cfc2" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 30, color: "var(--ink-faint)" }}>0</span>
            <span style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 700 }}>人</span>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>が投稿</div>
        </div>
        <I.chev size={18} color="#d6c7a4" />
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 30, color: B_RED }}>#1</span>
          </div>
          <div style={{ fontSize: 10.5, color: B_RED, fontWeight: 700 }}>あなたが</div>
        </div>
        <div style={{ flex: 1, fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.5, borderLeft: "1px solid var(--line)", paddingLeft: 12 }}>
          最初の投稿者として<b style={{ color: "var(--ink)" }}>名前が残ります</b>
        </div>
      </div>

      {/* rarity tags */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Pill kind="peach" icon={I.star}>マニューラは全国でここだけ</Pill>
        <Pill kind="lav" icon={I.spark}>網走で唯一のポケふた</Pill>
        <Pill kind="mint" icon={I.trophy}>北海道 設置数日本一</Pill>
      </div>

      <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
        <I.flag size={19} sw={2.5} />一番乗りで投稿する
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn block" style={{ background: "var(--green)", color: "#fff", padding: 12, fontSize: 13.5 }}><I.route size={16} sw={2.4} />経路案内</button>
        <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>共有</button>
      </div>
    </App>
  );
}

Object.assign(window, { B_Home, B_Detail });
