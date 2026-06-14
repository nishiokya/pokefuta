/* screens-AB.jsx — 採用案: A(図鑑コンプリート基盤) + B(詳細の一番乗りフック) */

const AB_RED = "var(--terracotta)";

function AB_Detail() {
  return (
    <App title="網走のポケふた" tab="post" auth="tako">
      {/* hero: empty frame + 一番乗りチャンス badge */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "repeating-linear-gradient(135deg,#f3ecdc 0 11px,#ece2cd 11px 22px)", border: "2px dashed #cdbf9f", height: 192, display: "grid", placeItems: "center", textAlign: "center" }}>
        <div>
          <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 40, lineHeight: 1, color: "#cdbb92" }}>0</div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink-soft)", marginTop: 7 }}>この場所の写真はまだ0枚</div>
          <div style={{ fontSize: 11.5, color: AB_RED, marginTop: 2, fontWeight: 700 }}>あなたが最初の記録者に</div>
        </div>
        <div style={{ position: "absolute", top: 12, left: 12 }}><B_FirstBadge small /></div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 12, fontWeight: 600 }}>
          <I.pin size={13} sw={2.2} />北海道 / 網走
        </div>
        <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 21, marginTop: 4 }}>北海道網走のポケふた</div>
      </div>

      {/* combined card: B's #1 ribbon + A's 図鑑 impact */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
        {/* ribbon — B's first-to-post */}
        <div style={{ background: "linear-gradient(100deg,#fdeae2,#fdf1e6)", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9 }}>
          <I.flag size={16} color={AB_RED} sw={2.4} />
          <span style={{ fontWeight: 800, fontSize: 12.5, color: "#7d4536", fontFamily: "var(--round)", flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap" }}>まだ誰も投稿していない</span>
          <span style={{ marginLeft: "auto", flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 15, color: "var(--ink-faint)" }}>0人</span>
            <I.chev size={13} color="#d6b8a8" />
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: AB_RED }}>#1</span>
          </span>
        </div>
        {/* A's 図鑑 impact */}
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fde2c2", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.trophy size={16} color="var(--amber-d)" sw={2.2} /></span>
            <div style={{ fontWeight: 800, fontSize: 13.5, fontFamily: "var(--round)" }}>撮ると写真図鑑も埋まる</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card-2)", borderRadius: 12, padding: "11px 13px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>北海道 写真図鑑</div>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18 }}>13 <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>→</span> <span style={{ color: AB_RED }}>14</span> <span style={{ color: "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>/ 50</span></div>
            </div>
            <div style={{ width: 1, height: 30, background: "var(--line)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: "var(--green)" }}>+1</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>シリーズ進捗</div>
            </div>
          </div>
        </div>
      </div>

      {/* rarity pills (B) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Pill kind="peach" icon={I.star}>マニューラは全国でここだけ</Pill>
        <Pill kind="lav" icon={I.spark}>網走で唯一のポケふた</Pill>
        <Pill kind="mint" icon={I.trophy}>北海道 設置数日本一</Pill>
      </div>

      {/* primary CTA — the 一番乗り button */}
      <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
        <I.flag size={19} sw={2.5} />一番乗りで投稿する
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn block" style={{ background: "var(--green)", color: "#fff", padding: 12, fontSize: 13.5 }}><I.route size={16} sw={2.4} />経路案内</button>
        <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>あとで</button>
      </div>
    </App>
  );
}

Object.assign(window, { AB_Detail });

/* ---- 状態2: 写真がすでにある(誰かが投稿済み)ポケふた ---- */
function AB_Detail_Posted() {
  return (
    <App title="網走のポケふた" tab="post" auth="tako">
      {/* hero: existing photo placeholder + count badge */}
      <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", height: 192, border: "1px solid var(--line)" }}>
        <div style={{ width: "100%", height: "100%", background: "repeating-linear-gradient(45deg,#d9cdb2 0 7px,#cfc2a3 7px 14px)", display: "grid", placeItems: "center" }}>
          <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 11, color: "#7c6f50" }}>投稿写真</span>
        </div>
        <span className="pill" style={{ position: "absolute", top: 12, left: 12, background: "rgba(255,255,255,.92)", color: "var(--ink-soft)", boxShadow: "var(--shadow-sm)" }}>
          <I.image size={13} sw={2.2} />みんなの写真 2枚
        </span>
        <span className="pill" style={{ position: "absolute", top: 12, right: 12, background: "rgba(191,86,64,.95)", color: "#fff" }}>あなたは未投稿</span>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 12, fontWeight: 600 }}>
          <I.pin size={13} sw={2.2} />北海道 / 網走
        </div>
        <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 21, marginTop: 4 }}>北海道網走のポケふた</div>
        <div style={{ fontSize: 13, color: AB_RED, fontWeight: 700, marginTop: 3 }}>あなたの構図で塗り替える</div>
      </div>

      {/* combined card: 個人ギャップ ribbon + A's 図鑑 impact */}
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
        <div style={{ background: "linear-gradient(100deg,#fdeae2,#fdf1e6)", padding: "11px 14px", display: "flex", alignItems: "center", gap: 9 }}>
          <I.image size={16} color={AB_RED} sw={2.2} />
          <span style={{ fontWeight: 800, fontSize: 12.5, color: "#7d4536", fontFamily: "var(--round)", flex: "1 1 auto", minWidth: 0, whiteSpace: "nowrap" }}>あなたはまだ未記録</span>
          <span style={{ marginLeft: "auto", flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: 3, whiteSpace: "nowrap" }}>
            <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: AB_RED }}>0</span>
            <span style={{ fontFamily: "var(--num)", fontWeight: 700, fontSize: 12, color: "var(--ink-faint)" }}>/1 図鑑</span>
          </span>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fde2c2", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.trophy size={16} color="var(--amber-d)" sw={2.2} /></span>
            <div style={{ fontWeight: 800, fontSize: 13.5, fontFamily: "var(--round)" }}>撮ると写真図鑑も埋まる</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card-2)", borderRadius: 12, padding: "11px 13px" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-soft)", fontWeight: 600 }}>北海道 写真図鑑</div>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18 }}>13 <span style={{ color: "var(--ink-faint)", fontSize: 13 }}>→</span> <span style={{ color: AB_RED }}>14</span> <span style={{ color: "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>/ 50</span></div>
            </div>
            <div style={{ width: 1, height: 30, background: "var(--line)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 18, color: "var(--green)" }}>+1</div>
              <div style={{ fontSize: 10.5, color: "var(--ink-faint)", fontWeight: 600 }}>シリーズ進捗</div>
            </div>
          </div>
        </div>
      </div>

      {/* variety / ranking FOMO (still valid when photos exist) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <Pill kind="peach" icon={I.star}>夜・雪の構図はまだ無い</Pill>
        <Pill kind="lav" icon={I.trophy}>ベスト写真を狙える</Pill>
        <Pill kind="mint" icon={I.spark}>あなたの季節を残す</Pill>
      </div>

      <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
        <I.plus size={19} sw={2.6} />あなたの1枚を加える
      </button>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn block" style={{ background: "var(--green)", color: "#fff", padding: 12, fontSize: 13.5 }}><I.route size={16} sw={2.4} />経路案内</button>
        <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>あとで</button>
      </div>
    </App>
  );
}

Object.assign(window, { AB_Detail_Posted });
