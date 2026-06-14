/* screens-A.jsx — 案A 図鑑コンプリート型 (gamification: "あと◯枚でコンプリート") */

const A_RED = "var(--terracotta)";

function A_SectionLabel({ icon: Ic, children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      {Ic && <Ic size={15} color="var(--ink-soft)" sw={2.2} />}
      <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{children}</span>
      {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
    </div>
  );
}

/* ---------------- HOME (スタンプ帳) ---------------- */
function A_Home() {
  const empties = [
    { name: "岐阜・養老の滝", pkmn: "ナイトメア" },
    { name: "岐阜・白川郷", pkmn: "ヤドン" },
  ];
  return (
    <App title="スタンプ帳" tab="stamp">
      {/* hero: 写真図鑑 progress */}
      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div className="micro" style={{ color: "var(--amber-d)" }}>PHOTO POKÉDEX</div>
            <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 19, marginTop: 3 }}>あなたの写真図鑑</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 26, lineHeight: 1, color: "var(--ink)" }}>52<span style={{ fontSize: 15, color: "var(--ink-faint)" }}>/80</span></div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>訪問済みの写真化</div>
          </div>
        </div>
        <Meter pct={17} color="linear-gradient(90deg,#e2a015,#bf5640)" />
        <div style={{ fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          <b style={{ color: A_RED }}>あと390枚</b>で全国コンプリート。1枚撮るごとに図鑑が埋まります。
        </div>
      </div>

      {/* the hook: あと2枚でコンプリート */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
        <div style={{ background: "linear-gradient(100deg,#fef3d6,#fce8d8)", padding: "13px 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <I.trophy size={17} color="var(--amber-d)" sw={2.2} />
          <span style={{ fontWeight: 800, fontSize: 14, fontFamily: "var(--round)", color: "#8a5a16" }}>あと2枚で岐阜県をコンプリート</span>
          <span style={{ marginLeft: "auto", fontFamily: "var(--num)", fontWeight: 800, color: "#8a5a16", fontSize: 14 }}>3/5</span>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <Meter pct={60} color="var(--amber)" />
          <div style={{ display: "flex", gap: 10 }}>
            {empties.map((e) => (
              <div key={e.name} style={{ flex: 1, background: "var(--card-2)", border: "1px solid var(--line)", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                <EmptyFrame size={62} />
                <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>{e.name}</div>
                <div className="btn primary" style={{ width: "100%", padding: "8px 0", fontSize: 12, borderRadius: 9 }}>
                  <I.camera size={14} sw={2.4} />撮る
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* collection grid with "写真募集" ribbons */}
      <A_SectionLabel icon={I.stamp} right={<span style={{ fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 600 }}>愛知県 9/9</span>}>コレクション</A_SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
        {[
          { p: true }, { p: false, n: "あと1枚" }, { p: true }, { p: true },
          { p: false, n: "あと1枚" }, { p: true }, { p: true }, { p: false, n: "あと1枚" },
        ].map((c, i) => (
          <div key={i} style={{ position: "relative" }}>
            {c.p
              ? <Mh size={72} label="撮影済" />
              : <div style={{ position: "relative" }}>
                  <EmptyFrame size={72} />
                  <div style={{ position: "absolute", left: "50%", bottom: -4, transform: "translateX(-50%)", background: A_RED, color: "#fff", fontSize: 9, fontWeight: 800, padding: "3px 7px", borderRadius: 999, whiteSpace: "nowrap", fontFamily: "var(--round)", boxShadow: "0 2px 5px rgba(150,60,30,.3)" }}>📷 {c.n}</div>
                </div>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-faint)", textAlign: "center", marginTop: -2 }}>点線の枠 = 写真がまだ無いポケふた</div>
    </App>
  );
}

/* ---------------- DETAIL (zero-photo pokefuta) ---------------- */
function A_Detail() {
  return (
    <App title="網走のポケふた" tab="post" auth="tako">
      {/* hero empty frame */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)", border: "2px dashed #cdbf9f", height: 188, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <I.camera size={34} color="#bcae8e" sw={1.7} />
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8 }}>この場所の写真はまだ0枚</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 2 }}>あなたの1枚が図鑑の最初の記録に</div>
        </div>
        <span className="pill" style={{ position: "absolute", top: 12, left: 12, background: "rgba(255,255,255,.9)", color: "var(--ink-soft)", boxShadow: "var(--shadow-sm)" }}>未訪問</span>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 12, fontWeight: 600 }}>
          <I.pin size={13} sw={2.2} />北海道 / 網走
        </div>
        <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 21, marginTop: 4 }}>北海道網走のポケふた</div>
      </div>

      {/* completion impact card — the gamified core */}
      <div className="card" style={{ padding: 15, border: "1.5px solid #efd9a3", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "#fde2c2", display: "grid", placeItems: "center" }}><I.trophy size={17} color="var(--amber-d)" sw={2.2} /></span>
          <div style={{ fontWeight: 800, fontSize: 14, fontFamily: "var(--round)" }}>撮ると図鑑が埋まる</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card-2)", borderRadius: 12, padding: "11px 13px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>北海道 写真図鑑</div>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18 }}>13 <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>→</span> <span style={{ color: A_RED }}>14</span> <span style={{ color: "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>/ 50</span></div>
          </div>
          <div style={{ width: 1, height: 30, background: "var(--line)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: "var(--green)" }}>+1</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>シリーズ進捗</div>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Pill kind="peach" icon={I.spark}>道の駅シリーズ あと3枚でコンプ</Pill>
          <Pill kind="gold" icon={I.star}>レア +10pt</Pill>
        </div>
      </div>

      {/* primary CTA */}
      <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
        <I.camera size={19} sw={2.4} />図鑑を埋める
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn block" style={{ background: "var(--green)", color: "#fff", padding: 12, fontSize: 13.5 }}><I.route size={16} sw={2.4} />経路案内</button>
        <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>あとで</button>
      </div>
    </App>
  );
}

Object.assign(window, { A_Home, A_Detail });
