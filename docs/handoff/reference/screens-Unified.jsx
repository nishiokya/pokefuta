/* screens-Unified.jsx — あるべき統合版の詳細ページ
   原則: 詳細ページは1テンプレートのみ。PhotoPrompt を最上段に置き、
   旧ページ固有の要素(建物・目印 / 登場ポケモン / 共有 / 場所)を「その下に常設」マージ。
   「あとで」での全画面トグルは廃止。詳細では「あとで」ボタン自体を削除。 */

const U_RED = "var(--terracotta)";

/* 共通の節見出し */
function U_SecHead({ icon: Ic, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
      {Ic && <Ic size={15} color="var(--ink-soft)" sw={2.2} />}
      <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink)" }}>{children}</span>
    </div>
  );
}

function U_Detail() {
  return (
    <App title="下呂のポケふた" tab="post" auth="tako">
      {/* ===== ① PhotoPrompt（最上段・主役） ===== */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)", border: "2px dashed #cdbf9f", height: 188, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 40, lineHeight: 1, color: "#cdbb92" }}>0</div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink-soft)", marginTop: 7 }}>この場所の写真はまだ0枚</div>
          <div style={{ fontSize: 11.5, color: U_RED, marginTop: 2, fontWeight: 700 }}>あなたが最初の記録者に</div>
        </div>
        <div style={{ position: "absolute", top: 12, left: 12 }}><B_FirstBadge small /></div>
        <span className="pill" style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.9)", color: "var(--ink-soft)", boxShadow: "var(--shadow-sm)" }}>未訪問</span>
      </div>

      {/* title */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 12, fontWeight: 600 }}>
          <I.pin size={13} sw={2.2} />岐阜県 / 下呂
        </div>
        <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 21, marginTop: 4 }}>岐阜県下呂のポケふた</div>
        <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 5, lineHeight: 1.5 }}>オタマロ・ガマガル・ガマゲロゲが描かれたポケモンマンホール</div>
      </div>

      {/* combined card: #1 ribbon + 図鑑 impact */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
        <div style={{ background: "linear-gradient(100deg,#fdeae2,#fdf1e6)", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9 }}>
          <I.flag size={16} color={U_RED} sw={2.4} />
          <span style={{ fontWeight: 800, fontSize: 12.5, color: "#7d4536", fontFamily: "var(--round)", flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap" }}>まだ誰も投稿していない</span>
          <span style={{ marginLeft: "auto", flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 15, color: "var(--ink-faint)" }}>0人</span>
            <I.chev size={13} color="#d6b8a8" />
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: U_RED }}>#1</span>
          </span>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fde2c2", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.trophy size={16} color="var(--amber-d)" sw={2.2} /></span>
            <div style={{ fontWeight: 800, fontSize: 13.5, fontFamily: "var(--round)" }}>撮ると写真図鑑も埋まる</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card-2)", borderRadius: 12, padding: "11px 13px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>岐阜県 写真図鑑</div>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18 }}>0 <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>→</span> <span style={{ color: U_RED }}>1</span> <span style={{ color: "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>/ 5</span></div>
            </div>
            <div style={{ width: 1, height: 30, background: "var(--line)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: "var(--green)" }}>+1</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>シリーズ進捗</div>
            </div>
          </div>
        </div>
      </div>

      {/* rarity pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Pill kind="peach" icon={I.star}>オタマロは全国でここだけ</Pill>
        <Pill kind="lav" icon={I.spark}>下呂で唯一のポケふた</Pill>
        <Pill kind="mint" icon={I.pin}>観光地のポケふた</Pill>
      </div>

      {/* primary CTA — あとで は無し。スクロールが逃げ道。 */}
      <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
        <I.flag size={19} sw={2.5} />一番乗りで投稿する
      </button>

      {/* ===== 区切り: ここから常設の詳細情報（旧ページからマージ） ===== */}
      <div style={{ height: 1, background: "var(--line)", margin: "2px 0" }} />

      {/* ② 建物・目印 */}
      <div className="card" style={{ padding: 13, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "#eef2f7", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.home size={19} color="#5b667b" sw={2} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 700 }}>建物・目印</div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginTop: 2 }}>下呂市観光交流センター「湯めぐり館」</div>
        </div>
      </div>

      {/* ③ 登場ポケモン */}
      <div>
        <U_SecHead icon={I.spark}>登場ポケモン</U_SecHead>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["オタマロ", "ガマガル", "ガマゲロゲ"].map((p) => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "7px 13px 7px 8px", fontSize: 12.5, fontWeight: 700, color: "var(--ink-soft)" }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: "#f6e4b6", display: "grid", placeItems: "center", fontSize: 10 }}>◓</span>{p}
            </span>
          ))}
        </div>
      </div>

      {/* ④ 場所 */}
      <div>
        <U_SecHead icon={I.pin}>場所</U_SecHead>
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--line)" }}>
          <div style={{ height: 130, background: "repeating-linear-gradient(45deg,#e7eddf 0 11px,#dde6d3 11px 22px)", position: "relative" }}>
            <span style={{ position: "absolute", left: "50%", top: "52%", transform: "translate(-50%,-50%)" }}><I.pin size={28} color={U_RED} sw={2} /></span>
          </div>
          <div style={{ padding: "11px 13px", display: "flex", alignItems: "center", gap: 10, background: "var(--card)" }}>
            <div style={{ flex: 1, fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>岐阜県下呂市湯之島</div>
            <button className="btn" style={{ background: "var(--green)", color: "#fff", padding: "9px 14px", fontSize: 12.5 }}><I.route size={15} sw={2.4} />経路案内</button>
          </div>
        </div>
      </div>

      {/* ⑤ 共有（SNS拡散はKPIなので常設で下部に） */}
      <div>
        <U_SecHead icon={I.users}>このポケふたを共有</U_SecHead>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn block" style={{ background: "#1d1d1f", color: "#fff", padding: 11, fontSize: 12.5 }}>X で共有</button>
          <button className="btn block" style={{ background: "#06c755", color: "#fff", padding: 11, fontSize: 12.5 }}>LINEで共有</button>
          <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 11, fontSize: 12.5 }}>共有</button>
        </div>
      </div>
    </App>
  );
}

Object.assign(window, { U_Detail });
