/* screens-C.jsx — 案C 撮影手配 / 写真ハンター型 (bold: bounty board + ranks) */

const C_DARK = "#2c2823";
const C_DARK2 = "#37312a";
const C_AMBER = "#f0b429";
const C_RED = "#e8714d";

function Stars({ n, size = 12 }) {
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <I.star key={i} size={size} sw={1.6} color={i < n ? C_AMBER : "rgba(255,255,255,.22)"} style={{ fill: i < n ? C_AMBER : "transparent" }} />
      ))}
    </span>
  );
}

function C_WantedCard({ name, loc, rank, pts, first }) {
  return (
    <div style={{ background: C_DARK2, borderRadius: 14, padding: 12, display: "flex", gap: 12, alignItems: "center", border: "1px solid rgba(240,180,41,.16)" }}>
      <div style={{ position: "relative", flex: "0 0 auto" }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: "repeating-linear-gradient(135deg,#3f3830 0 8px,#453d33 8px 16px)", border: "2px dashed rgba(240,180,41,.4)", display: "grid", placeItems: "center" }}>
          <I.camera size={22} color="rgba(240,180,41,.55)" sw={1.8} />
        </div>
        <span style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", background: C_AMBER, color: "#2c2823", fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 999, fontFamily: "var(--round)", whiteSpace: "nowrap" }}>+{pts}pt</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#f3ede2" }}>{name}</span>
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(243,237,226,.55)", marginBottom: 6 }}>{loc}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Stars n={rank} />
          {first && <span style={{ fontSize: 9.5, fontWeight: 800, color: C_RED, fontFamily: "var(--round)", border: "1px solid rgba(232,113,77,.5)", borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}>一番乗り×2</span>}
        </div>
      </div>
      <div style={{ background: C_AMBER, color: C_DARK, fontFamily: "var(--round)", fontWeight: 800, fontSize: 11.5, padding: "8px 12px", borderRadius: 10, whiteSpace: "nowrap" }}>受ける</div>
    </div>
  );
}

/* ---------------- HOME ---------------- */
function C_Home() {
  return (
    <App title="スタンプ帳" tab="stamp">
      {/* mission board panel (bold dark) */}
      <div style={{ background: C_DARK, borderRadius: 18, padding: 16, boxShadow: "0 10px 28px rgba(40,28,10,.28)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(240,180,41,.16)", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.target size={18} color={C_AMBER} sw={2.2} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 16, color: "#f7f1e6" }}>撮影ミッション</div>
            <div style={{ fontSize: 10.5, color: "rgba(247,241,230,.5)", fontWeight: 600 }}>写真0枚のポケふたを狙え</div>
          </div>
          <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(240,180,41,.16)", color: C_AMBER, fontFamily: "var(--round)", fontWeight: 800, fontSize: 12, padding: "6px 11px", borderRadius: 999, whiteSpace: "nowrap" }}>
            <I.bolt size={13} color={C_AMBER} sw={2.2} />ハンターLv.4
          </span>
        </div>

        {/* hunter progress */}
        <div>
          <div className="meter" style={{ background: "rgba(255,255,255,.1)" }}>
            <span style={{ width: "55%", background: "linear-gradient(90deg,#f0b429,#e8714d)" }} />
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: "rgba(247,241,230,.5)", fontWeight: 600, marginTop: 5 }}>次のランクまで 写真3枚</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <C_WantedCard name="石川・能登 道の駅" loc="能登で唯一・全国でここだけ" rank={4} pts={50} first />
          <C_WantedCard name="宮城・仙台 海岸公園" loc="海が見えるポケふた" rank={3} pts={30} first />
          <C_WantedCard name="岐阜・白川郷" loc="あと1枚で県コンプ" rank={2} pts={20} />
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: C_AMBER, fontWeight: 700, fontFamily: "var(--round)" }}>手配中をすべて見る →</div>
      </div>

      {/* normal collection peek below to anchor context */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <I.stamp size={15} color="var(--ink-soft)" sw={2.2} />
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>あなたのコレクション</span>
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-faint)", fontWeight: 600 }}>80/470</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => <Mh key={i} size={58} label="撮影済" />)}
      </div>
    </App>
  );
}

/* ---------------- DETAIL ---------------- */
function C_Detail() {
  return (
    <App title="網走のポケふた" tab="post" auth="tako">
      {/* hero with WANTED stamp */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)", border: "2px dashed #cdbf9f", height: 196, display: "grid", placeItems: "center" }}>
        <I.camera size={30} color="#c9b78f" sw={1.7} />
        <div style={{ position: "absolute", top: 18, right: 14, transform: "rotate(7deg)", border: "3px solid " + C_RED, borderRadius: 8, padding: "5px 12px", color: C_RED, background: "rgba(255,250,247,.82)", textAlign: "center", boxShadow: "0 4px 10px rgba(150,50,30,.18)" }}>
          <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 15, letterSpacing: ".12em", lineHeight: 1 }}>WANTED</div>
          <div style={{ fontSize: 10, fontWeight: 800, fontFamily: "var(--round)", marginTop: 2 }}>撮影手配中</div>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 12, fontWeight: 600 }}>
          <I.pin size={13} sw={2.2} />北海道 / 網走
        </div>
        <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 21, marginTop: 4 }}>北海道網走のポケふた</div>
      </div>

      {/* 手配書 (dark bounty card) */}
      <div style={{ background: C_DARK, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 13, boxShadow: "0 10px 26px rgba(40,28,10,.26)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <I.flag size={16} color={C_AMBER} sw={2.4} />
          <span style={{ fontWeight: 800, fontSize: 13.5, color: "#f7f1e6", fontFamily: "var(--round)" }}>撮影手配書</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <Stars n={4} size={14} />
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { v: "+50", l: "撮影報酬", c: C_AMBER },
            { v: "×2", l: "一番乗りボーナス", c: C_RED },
            { v: "0", l: "撮影者", c: "#f3ede2" },
          ].map((x) => (
            <div key={x.l} style={{ flex: 1, background: C_DARK2, borderRadius: 12, padding: "11px 8px", textAlign: "center", border: "1px solid rgba(240,180,41,.14)" }}>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 21, color: x.c, lineHeight: 1 }}>{x.v}</div>
              <div style={{ fontSize: 9.5, color: "rgba(243,237,226,.55)", fontWeight: 600, marginTop: 4 }}>{x.l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "rgba(243,237,226,.62)", lineHeight: 1.5, textAlign: "center" }}>
          まだ誰も達成していないミッション。<b style={{ color: C_AMBER }}>一番乗りで報酬2倍。</b>
        </div>
      </div>

      <button className="btn block" style={{ background: "linear-gradient(100deg,#f0b429,#e8714d)", color: "#2c2823", fontSize: 16, padding: 15, boxShadow: "0 2px 0 #b87d0a" }}>
        <I.camera size={19} sw={2.6} />撮影ミッションを開始
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn block" style={{ background: "var(--green)", color: "#fff", padding: 12, fontSize: 13.5 }}><I.route size={16} sw={2.4} />経路案内</button>
        <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>あとで狙う</button>
      </div>
    </App>
  );
}

Object.assign(window, { C_Home, C_Detail });
