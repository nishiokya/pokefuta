/* screens-Stampbook.jsx — スタンプ帳 再設計（コレクションブック）
   レビュー方針: スタンプ帳は「旅日記」ではなく「コレクションブック」。
   訪問履歴グリッドをやめ、都道府県/ポケモン/特徴コレクションとコンプリート目前を主役に。
   マイ旅(時系列ログ)とは完全に別コンセプト。 */

const SB_RED = "var(--terracotta)";

/* 都道府県コレクションの1行（横バー） */
function SB_PrefRow({ name, cur, total, done }) {
  const pct = Math.round((cur / total) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0" }}>
      <div style={{ width: 64, flex: "0 0 auto", fontSize: 12.5, fontWeight: 700, color: "var(--ink)" }}>{name}</div>
      <div style={{ flex: 1 }}>
        <Meter pct={pct} color={done ? "var(--green)" : "linear-gradient(90deg,#e2a015,#bf5640)"} />
      </div>
      <div style={{ width: 52, flex: "0 0 auto", textAlign: "right", fontFamily: "var(--num)", fontWeight: 800, fontSize: 13, color: done ? "var(--green)" : "var(--ink)" }}>
        {done ? "✓" : ""}{cur}<span style={{ color: "var(--ink-faint)", fontSize: 11, fontWeight: 600 }}>/{total}</span>
      </div>
    </div>
  );
}

/* ポケモン収集トークン（円形・完成はリング／現物パターン） */
function SB_PokeToken({ name, cur, total }) {
  const done = cur >= total;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: 64 }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, padding: 3, background: done ? "var(--green)" : "var(--line)", display: "grid", placeItems: "center" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 999, overflow: "hidden", background: "repeating-linear-gradient(45deg,#d9cdb2 0 4px,#cfc2a3 4px 8px)", border: "1px solid " + (done ? "#bfe6cf" : "var(--line)"), opacity: done ? 1 : 0.45, filter: done ? "none" : "grayscale(.5)" }} />
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink-soft)", textAlign: "center", lineHeight: 1.1 }}>{name}</div>
      <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 11, color: done ? "var(--green)" : "var(--ink-faint)" }}>{done ? "コンプ" : cur + "/" + total}</div>
    </div>
  );
}

/* コンプリート目前カード（再訪動機） */
function SB_AlmostCard({ label, left, tone }) {
  const t = tone === "green" ? { bg: "var(--mint-bg)", tx: "var(--mint-tx)" } : tone === "amber" ? { bg: "var(--gold-bg)", tx: "var(--gold-tx)" } : { bg: "var(--peach-bg)", tx: "var(--peach-tx)" };
  return (
    <div style={{ flex: "0 0 auto", width: 150, background: "var(--card)", border: "1.5px solid #efd9a3", borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 9 }}>
      <span style={{ alignSelf: "flex-start", fontFamily: "var(--round)", fontWeight: 800, fontSize: 11, color: t.tx, background: t.bg, borderRadius: 999, padding: "4px 9px", whiteSpace: "nowrap" }}>あと{left}</span>
      <div style={{ fontWeight: 800, fontSize: 13.5, fontFamily: "var(--round)", lineHeight: 1.3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: SB_RED, fontWeight: 700, marginTop: "auto" }}>
        <I.camera size={13} sw={2.4} />次を撮る
      </div>
    </div>
  );
}

function SB_SecHead({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{children}</span>
      {right && <span style={{ marginLeft: "auto", fontSize: 11.5, color: SB_RED, fontWeight: 700, whiteSpace: "nowrap", flex: "0 0 auto" }}>{right}</span>}
    </div>
  );
}

function Stampbook() {
  return (
    <App title="スタンプ帳" tab="stamp" navTabs={window.NAV_MYTRIP}>
      {/* segmented: コレクション軸の切替（コレクションブックである宣言） */}
      <div style={{ display: "flex", gap: 6, background: "#f0e7d3", padding: 4, borderRadius: 12 }}>
        {["ぜんぶ", "都道府県", "ポケモン", "特徴"].map((t, i) => (
          <div key={t} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "8px 0", borderRadius: 9, background: i === 0 ? "#fff" : "transparent", color: i === 0 ? "var(--ink)" : "var(--ink-faint)", boxShadow: i === 0 ? "var(--shadow-sm)" : "none" }}>{t}</div>
        ))}
      </div>

      {/* ① 写真図鑑：集めた枚数を強く（訪問=撮影。分母は全国470） */}
      <div className="card" style={{ padding: 15, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="micro" style={{ color: "var(--amber-d)" }}>PHOTO DEX</div>
            <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 18, marginTop: 3 }}>写真図鑑コンプリート</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 27, lineHeight: 1, color: "var(--ink)" }}>80<span style={{ fontSize: 15, color: "var(--ink-faint)" }}>/470</span></div>
            <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>集めたポケふた</div>
          </div>
        </div>
        <Meter pct={17} color="linear-gradient(90deg,#e2a015,#bf5640)" />
        <div style={{ display: "flex", gap: 0 }}>
          {[["17%", "完成率", "var(--ink)"], ["+6", "今月", SB_RED], ["390", "あと", "var(--ink-soft)"]].map(([n, l, c], i) => (
            <div key={l} style={{ flex: 1, textAlign: "center", borderLeft: i ? "1px solid var(--line)" : "none" }}>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 19, color: c }}>{n}</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ⑤ コンプリート目前：再訪動機を上部に（横スクロール） */}
      <div>
        <SB_SecHead right="すべて見る ›"><I.trophy size={15} color="var(--amber-d)" sw={2.2} style={{ marginRight: 6, verticalAlign: "-2px" }} />コンプリート目前</SB_SecHead>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, margin: "0 -16px", padding: "0 16px 4px" }}>
          <SB_AlmostCard label="岐阜県 完成" left="1枚" tone="peach" />
          <SB_AlmostCard label="ロコン 完成" left="2枚" tone="amber" />
          <SB_AlmostCard label="道の駅 制覇" left="1枚" tone="green" />
        </div>
      </div>

      {/* ② 都道府県コレクション：中心コンテンツ */}
      <div className="card" style={{ padding: "13px 15px" }}>
        <SB_SecHead right="47都道府県 ›">都道府県コレクション</SB_SecHead>
        <div>
          <SB_PrefRow name="北海道" cur={42} total={50} />
          <div style={{ height: 1, background: "var(--line-soft)" }} />
          <SB_PrefRow name="岐阜県" cur={14} total={15} />
          <div style={{ height: 1, background: "var(--line-soft)" }} />
          <SB_PrefRow name="鹿児島県" cur={18} total={26} />
          <div style={{ height: 1, background: "var(--line-soft)" }} />
          <SB_PrefRow name="愛知県" cur={9} total={9} done />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-soft)", fontWeight: 600, textAlign: "center", background: "var(--card-2)", borderRadius: 9, padding: "8px 0" }}>
          あと<b style={{ color: SB_RED }}>3県</b>でコンプリート
        </div>
      </div>

      {/* ③ ポケモンコレクション：ポケふたならでは */}
      <div className="card" style={{ padding: "13px 15px" }}>
        <SB_SecHead right="534匹 ›">ポケモンコレクション</SB_SecHead>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <SB_PokeToken name="イーブイ" cur={8} total={8} />
          <SB_PokeToken name="ロコン" cur={27} total={27} />
          <SB_PokeToken name="ピカチュウ" cur={5} total={18} />
          <SB_PokeToken name="ヤドン" cur={3} total={11} />
        </div>
      </div>

      {/* ④ 特徴コレクション：旅好きに刺さる */}
      <div className="card" style={{ padding: "13px 15px" }}>
        <SB_SecHead right="すべて ›">特徴コレクション</SB_SecHead>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          {[["道の駅", "8/9", true], ["世界遺産", "3/7", false], ["離島", "2/12", false], ["駅前", "11/14", false], ["海沿い", "6/20", false]].map(([n, v, near]) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: near ? "var(--gold-bg)" : "#fff", border: "1px solid " + (near ? "#ecd9a8" : "var(--line)"), borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 700, color: near ? "var(--gold-tx)" : "var(--ink-soft)" }}>
              {n}<span style={{ fontFamily: "var(--num)", fontWeight: 800, color: near ? "var(--gold-tx)" : "var(--ink-faint)" }}>{v}</span>
            </span>
          ))}
        </div>
      </div>
    </App>
  );
}

Object.assign(window, { Stampbook });

/* ============================================================
   Stampbook v2 — 密度バンド「図鑑（集めたスタンプの壁）」を追加
   日付グリッドには戻さない。図鑑/地域順に“集めた現物”をぎっしり見せ、
   空き枠で「あと少しで埋まる」を煽る＝御朱印帳の充実感を回復。
   ============================================================ */

/* 集めたスタンプ1個（円形・現物感） */
function SB_Stamp({ filled, near }) {
  if (filled) {
    return (
      <div style={{ width: "100%", aspectRatio: "1", borderRadius: 999, border: "2px solid #b9aa86", background: "repeating-linear-gradient(45deg,#d9cdb2 0 4px,#cfc2a3 4px 8px)", boxShadow: "inset 0 0 0 2px #fffdf7" }} />
    );
  }
  return (
    <div style={{ width: "100%", aspectRatio: "1", borderRadius: 999, border: near ? "2px dashed var(--terracotta)" : "2px dashed #d8ccae", background: near ? "var(--peach-bg)" : "transparent", display: "grid", placeItems: "center" }}>
      {near && <I.camera size={13} color="var(--terracotta)" sw={2} />}
    </div>
  );
}

/* 図鑑グリッド：集めた現物の壁（充実感の核） */
function SB_DexWall() {
  // 先頭=集めた現物をぎっしり、末尾に「次に狙える」空き枠を数個
  const cells = [];
  for (let i = 0; i < 40; i++) cells.push(i < 33 ? "filled" : i < 36 ? "near" : "empty");
  return (
    <div className="card" style={{ padding: "13px 15px" }}>
      <SB_SecHead right="すべて見る 80 ›">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I.stamp size={15} color="var(--ink-soft)" sw={2.2} />集めたスタンプ</span>
      </SB_SecHead>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 7 }}>
        {cells.map((t, i) => <SB_Stamp key={i} filled={t === "filled"} near={t === "near"} />)}
      </div>
      <div style={{ marginTop: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, border: "2px dashed var(--terracotta)", background: "var(--peach-bg)" }} />
        点線＝次に狙える近くのポケふた
      </div>
    </div>
  );
}

function Stampbook2() {
  return (
    <App title="スタンプ帳" tab="stamp" navTabs={window.NAV_MYTRIP}>
      <div style={{ display: "flex", gap: 6, background: "#f0e7d3", padding: 4, borderRadius: 12 }}>
        {["ぜんぶ", "都道府県", "ポケモン", "特徴"].map((t, i) => (
          <div key={t} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: 700, padding: "8px 0", borderRadius: 9, background: i === 0 ? "#fff" : "transparent", color: i === 0 ? "var(--ink)" : "var(--ink-faint)", boxShadow: i === 0 ? "var(--shadow-sm)" : "none" }}>{t}</div>
        ))}
      </div>

      {/* 写真図鑑：完成率＋数字（コンパクト） */}
      <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div className="micro" style={{ color: "var(--amber-d)", whiteSpace: "nowrap" }}>PHOTO DEX</div>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 22, lineHeight: 1, marginTop: 6 }}>80<span style={{ fontSize: 14, color: "var(--ink-faint)" }}>/470</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 22, lineHeight: 1, color: SB_RED }}>17<span style={{ fontSize: 13 }}>%</span></div>
            <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>完成率 · あと390</div>
          </div>
        </div>
        <Meter pct={17} color="linear-gradient(90deg,#e2a015,#bf5640)" />
      </div>

      {/* ★図鑑の壁＝集めた現物（充実感） */}
      <SB_DexWall />

      {/* コンプリート目前 */}
      <div>
        <SB_SecHead right="すべて見る ›"><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><I.trophy size={15} color="var(--amber-d)" sw={2.2} />コンプリート目前</span></SB_SecHead>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px 4px" }}>
          <SB_AlmostCard label="岐阜県 完成" left="1枚" tone="peach" />
          <SB_AlmostCard label="ロコン 完成" left="2枚" tone="amber" />
          <SB_AlmostCard label="道の駅 制覇" left="1枚" tone="green" />
        </div>
      </div>

      {/* 都道府県コレクション（ミニ現物サムネ付き） */}
      <div className="card" style={{ padding: "13px 15px" }}>
        <SB_SecHead right="47都道府県 ›">都道府県コレクション</SB_SecHead>
        <div>
          <SB_PrefRow name="北海道" cur={42} total={50} />
          <div style={{ height: 1, background: "var(--line-soft)" }} />
          <SB_PrefRow name="三重県" cur={18} total={31} />
          <div style={{ height: 1, background: "var(--line-soft)" }} />
          <SB_PrefRow name="愛知県" cur={9} total={9} done />
          <div style={{ height: 1, background: "var(--line-soft)" }} />
          <SB_PrefRow name="岐阜県" cur={3} total={5} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-soft)", fontWeight: 600, textAlign: "center", background: "var(--card-2)", borderRadius: 9, padding: "8px 0" }}>
          あと<b style={{ color: SB_RED }}>31県</b>でコンプリート
        </div>
      </div>

      {/* ポケモンコレクション（現物円＝塗りパターン） */}
      <div className="card" style={{ padding: "13px 15px" }}>
        <SB_SecHead right="534匹 ›">ポケモンコレクション</SB_SecHead>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <SB_PokeToken name="イーブイ" cur={8} total={8} />
          <SB_PokeToken name="ロコン" cur={27} total={27} />
          <SB_PokeToken name="ピカチュウ" cur={5} total={18} />
          <SB_PokeToken name="ヤドン" cur={3} total={11} />
        </div>
      </div>
    </App>
  );
}

Object.assign(window, { Stampbook2 });
