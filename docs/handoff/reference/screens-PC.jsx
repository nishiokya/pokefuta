/* screens-PC.jsx — PC幅(デスクトップ)の詳細ページ流用案
   モバイルの縦積みを 2カラム化: 左=写真ヒーロー+情報、右=PhotoPromptカードを sticky 固定。
   採用案(A基盤+B一番乗り)の詳細ページ(写真0枚=empty)をデスクトップに展開したもの。 */

const PC_RED = "var(--terracotta)";
const PC_W = 1040;

/* デスクトップ用ヘッダー(横長ナビ) */
function PC_TopNav() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 28px", background: "var(--header)", borderBottom: "1px solid var(--line)" }}>
      <Logo size={28} />
      <span style={{ fontWeight: 700, fontSize: 18, color: "#38414f" }}>ポケふた</span>
      <nav style={{ display: "flex", gap: 4, marginLeft: 18 }}>
        {[["探す", false], ["スタンプ帳", false], ["まい旅", false]].map(([t]) => (
          <span key={t} style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-soft)", padding: "7px 13px", borderRadius: 9 }}>{t}</span>
        ))}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", border: "1px solid var(--line)", borderRadius: 999, padding: "6px 8px 6px 14px" }}>
        <I.search size={15} color="var(--ink-faint)" sw={2.2} />
        <span style={{ fontSize: 12.5, color: "var(--ink-faint)", width: 120 }}>ポケふたを探す</span>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--ink-soft)" }}>
        <span style={{ width: 26, height: 26, borderRadius: 999, background: "#dfe7f3", display: "grid", placeItems: "center", fontSize: 13 }}>👤</span>tako
      </span>
    </div>
  );
}

function PC_Detail() {
  return (
    <div style={{ width: PC_W, background: "var(--app-bg)", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 4px rgba(60,45,15,.08), 0 18px 50px rgba(60,45,15,.16)", border: "1px solid rgba(255,255,255,.5)" }}>
      <PC_TopNav />

      {/* breadcrumb */}
      <div style={{ padding: "14px 28px 0", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 600 }}>
        <span>探す</span><I.chev size={13} /><span>北海道</span><I.chev size={13} /><span style={{ color: "var(--ink-soft)" }}>網走</span>
      </div>

      {/* 2-col body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 372px", gap: 24, padding: "16px 28px 28px", alignItems: "start" }}>
        {/* LEFT: hero + info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "repeating-linear-gradient(135deg,#f3ecdc 0 13px,#ece2cd 13px 26px)", border: "2px dashed #cdbf9f", height: 360, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 72, lineHeight: 1, color: "#cdbb92" }}>0</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--ink-soft)", marginTop: 12 }}>この場所の写真はまだ0枚</div>
              <div style={{ fontSize: 13.5, color: PC_RED, marginTop: 4, fontWeight: 700 }}>あなたが最初の記録者に</div>
            </div>
            <div style={{ position: "absolute", top: 16, left: 16 }}><B_FirstBadge /></div>
          </div>

          {/* title block */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>
              <I.pin size={14} sw={2.2} />北海道 / 網走
            </div>
            <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 30, marginTop: 6 }}>北海道網走のポケふた</div>
            <div style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.7, marginTop: 10, maxWidth: 560 }}>
              網走市に設置されたポケふた。マニューラがデザインされ、流氷の街・網走を訪れた記念に。最寄り駅から徒歩圏、訪問記録と写真投稿に対応しています。
            </div>
          </div>

          {/* rarity pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill kind="peach" icon={I.star}>マニューラは全国でここだけ</Pill>
            <Pill kind="lav" icon={I.spark}>網走で唯一のポケふた</Pill>
            <Pill kind="mint" icon={I.trophy}>北海道 設置数日本一</Pill>
          </div>

          {/* map row placeholder */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 14 }}>
            <div style={{ width: 88, height: 64, borderRadius: 10, background: "repeating-linear-gradient(45deg,#e7eddf 0 8px,#dde6d3 8px 16px)", display: "grid", placeItems: "center", flex: "0 0 auto" }}>
              <I.pin size={22} color="var(--green)" sw={2} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>北海道網走市</div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 2 }}>道の駅 流氷街道網走 付近</div>
            </div>
            <button className="btn" style={{ background: "var(--green)", color: "#fff", padding: "10px 16px", fontSize: 13.5 }}><I.route size={16} sw={2.4} />経路案内</button>
          </div>
        </div>

        {/* RIGHT: sticky PhotoPrompt card */}
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
            {/* ribbon */}
            <div style={{ background: "linear-gradient(100deg,#fdeae2,#fdf1e6)", padding: "13px 16px", display: "flex", alignItems: "center", gap: 9 }}>
              <I.flag size={17} color={PC_RED} sw={2.4} />
              <span style={{ fontWeight: 800, fontSize: 13.5, color: "#7d4536", fontFamily: "var(--round)", flex: "1 1 auto", whiteSpace: "nowrap" }}>まだ誰も投稿していない</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap", flex: "0 0 auto" }}>
                <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 16, color: "var(--ink-faint)" }}>0人</span>
                <I.chev size={14} color="#d6b8a8" />
                <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 20, color: PC_RED }}>#1</span>
              </span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "#fde2c2", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.trophy size={17} color="var(--amber-d)" sw={2.2} /></span>
                <div style={{ fontWeight: 800, fontSize: 14.5, fontFamily: "var(--round)" }}>撮ると写真図鑑も埋まる</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card-2)", borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>北海道 写真図鑑</div>
                  <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 20 }}>13 <span style={{ color: "var(--ink-faint)", fontSize: 14 }}>→</span> <span style={{ color: PC_RED }}>14</span> <span style={{ color: "var(--ink-faint)", fontSize: 14, fontWeight: 600 }}>/ 50</span></div>
                </div>
                <div style={{ width: 1, height: 32, background: "var(--line)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 20, color: "var(--green)" }}>+1</div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>シリーズ進捗</div>
                </div>
              </div>

              <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
                <I.flag size={19} sw={2.5} />一番乗りで投稿する
              </button>
              <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>あとで</button>
            </div>
          </div>

          {/* tiny reassurance */}
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--ink-faint)", padding: "0 4px", lineHeight: 1.5 }}>
            <I.users size={15} color="var(--ink-faint)" sw={2} />
            あなたの1枚が、この場所を探す次の人の道しるべになります。
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PC_Detail });

/* ---- PC: posted状態(写真あり・自分は未投稿) ---- */
function PC_Detail_Posted() {
  return (
    <div style={{ width: PC_W, background: "var(--app-bg)", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 4px rgba(60,45,15,.08), 0 18px 50px rgba(60,45,15,.16)", border: "1px solid rgba(255,255,255,.5)" }}>
      <PC_TopNav />
      <div style={{ padding: "14px 28px 0", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 600 }}>
        <span>探す</span><I.chev size={13} /><span>北海道</span><I.chev size={13} /><span style={{ color: "var(--ink-soft)" }}>網走</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 372px", gap: 24, padding: "16px 28px 28px", alignItems: "start" }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* gallery: 1 large + thumbs */}
          <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", height: 360, border: "1px solid var(--line)" }}>
            <div style={{ width: "100%", height: "100%", background: "repeating-linear-gradient(45deg,#d9cdb2 0 9px,#cfc2a3 9px 18px)", display: "grid", placeItems: "center" }}>
              <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 12, color: "#7c6f50" }}>みんなの投稿写真</span>
            </div>
            <span className="pill" style={{ position: "absolute", top: 16, left: 16, background: "rgba(255,255,255,.92)", color: "var(--ink-soft)", boxShadow: "var(--shadow-sm)" }}><I.image size={13} sw={2.2} />みんなの写真 2枚</span>
            <span className="pill" style={{ position: "absolute", top: 16, right: 16, background: "rgba(191,86,64,.95)", color: "#fff" }}>あなたは未投稿</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ width: 88, height: 64, borderRadius: 10, background: "repeating-linear-gradient(45deg,#d9cdb2 0 7px,#cfc2a3 7px 14px)", border: "1px solid var(--line)" }} />
            ))}
            <div style={{ width: 88, height: 64, borderRadius: 10, border: "2px dashed #cdbf9f", background: "repeating-linear-gradient(135deg,#f3ecdc 0 8px,#ece2cd 8px 16px)", display: "grid", placeItems: "center", color: "var(--ink-faint)" }}>
              <I.plus size={20} color={PC_RED} sw={2.4} />
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--ink-faint)", fontSize: 13, fontWeight: 600 }}>
              <I.pin size={14} sw={2.2} />北海道 / 網走
            </div>
            <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 30, marginTop: 6 }}>北海道網走のポケふた</div>
            <div style={{ fontSize: 15, color: PC_RED, fontWeight: 700, marginTop: 6 }}>あなたの構図で塗り替える</div>
            <div style={{ fontSize: 14.5, color: "var(--ink-soft)", lineHeight: 1.7, marginTop: 8, maxWidth: 560 }}>
              すでに2枚の写真が投稿されていますが、あなたの季節・時間帯・構図はまだありません。
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Pill kind="peach" icon={I.star}>夜・雪の構図はまだ無い</Pill>
            <Pill kind="lav" icon={I.trophy}>ベスト写真を狙える</Pill>
            <Pill kind="mint" icon={I.spark}>あなたの季節を残す</Pill>
          </div>
        </div>

        {/* RIGHT sticky */}
        <div style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
            <div style={{ background: "linear-gradient(100deg,#fdeae2,#fdf1e6)", padding: "13px 16px", display: "flex", alignItems: "center", gap: 9 }}>
              <I.image size={17} color={PC_RED} sw={2.2} />
              <span style={{ fontWeight: 800, fontSize: 13.5, color: "#7d4536", fontFamily: "var(--round)", flex: "1 1 auto", whiteSpace: "nowrap" }}>あなたはまだ未記録</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 3, whiteSpace: "nowrap", flex: "0 0 auto" }}>
                <span style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 20, color: PC_RED }}>0</span>
                <span style={{ fontFamily: "var(--num)", fontWeight: 700, fontSize: 13, color: "var(--ink-faint)" }}>/1 図鑑</span>
              </span>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: "#fde2c2", display: "grid", placeItems: "center", flex: "0 0 auto" }}><I.trophy size={17} color="var(--amber-d)" sw={2.2} /></span>
                <div style={{ fontWeight: 800, fontSize: 14.5, fontFamily: "var(--round)" }}>撮ると写真図鑑も埋まる</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--card-2)", borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>北海道 写真図鑑</div>
                  <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 20 }}>13 <span style={{ color: "var(--ink-faint)", fontSize: 14 }}>→</span> <span style={{ color: PC_RED }}>14</span> <span style={{ color: "var(--ink-faint)", fontSize: 14, fontWeight: 600 }}>/ 50</span></div>
                </div>
                <div style={{ width: 1, height: 32, background: "var(--line)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 20, color: "var(--green)" }}>+1</div>
                  <div style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>シリーズ進捗</div>
                </div>
              </div>
              <button className="btn primary block" style={{ fontSize: 16, padding: 15 }}>
                <I.plus size={19} sw={2.6} />あなたの1枚を加える
              </button>
              <button className="btn block" style={{ background: "#fff", color: "var(--ink-soft)", border: "1px solid var(--line)", padding: 12, fontSize: 13.5 }}>あとで</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 11.5, color: "var(--ink-faint)", padding: "0 4px", lineHeight: 1.5 }}>
            <I.users size={15} color="var(--ink-faint)" sw={2} />
            別の季節・構図の写真は、この場所の魅力をもっと伝えます。
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- PC: スタンプ帳ホーム(A基盤) ---- */
function PC_Home() {
  const grid = [
    { p: true }, { p: false, n: "あと1枚" }, { p: true }, { p: true }, { p: false, n: "あと1枚" }, { p: true },
    { p: true }, { p: false, n: "あと1枚" }, { p: true }, { p: true }, { p: true }, { p: false, n: "あと1枚" },
  ];
  return (
    <div style={{ width: PC_W, background: "var(--app-bg)", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 4px rgba(60,45,15,.08), 0 18px 50px rgba(60,45,15,.16)", border: "1px solid rgba(255,255,255,.5)" }}>
      <PC_TopNav />
      <div style={{ padding: "22px 28px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* wide photo-dex hero */}
        <div className="card" style={{ padding: 22, display: "grid", gridTemplateColumns: "1.3fr 1px 1fr", gap: 22, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div className="micro" style={{ color: "var(--amber-d)" }}>PHOTO POKÉDEX</div>
              <div style={{ fontFamily: "var(--round)", fontWeight: 800, fontSize: 24, marginTop: 4 }}>あなたの写真図鑑</div>
            </div>
            <Meter pct={17} color="linear-gradient(90deg,#e2a015,#bf5640)" />
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.6 }}>
              <b style={{ color: PC_RED }}>あと390枚</b>で全国コンプリート。1枚撮るごとに図鑑が埋まります。
            </div>
          </div>
          <div style={{ width: 1, height: 90, background: "var(--line)", justifySelf: "center" }} />
          <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
            <div>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 34, lineHeight: 1 }}>80<span style={{ fontSize: 18, color: "var(--ink-faint)" }}>/470</span></div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 600, marginTop: 4 }}>集めたポケふた</div>
            </div>
            <div>
              <div style={{ fontFamily: "var(--num)", fontWeight: 800, fontSize: 34, lineHeight: 1, color: PC_RED }}>+6</div>
              <div style={{ fontSize: 12, color: "var(--ink-faint)", fontWeight: 600, marginTop: 4 }}>今月</div>
            </div>
          </div>
        </div>

        {/* あと2枚でコンプ — wide */}
        <div className="card" style={{ padding: 0, overflow: "hidden", border: "1.5px solid #efd9a3" }}>
          <div style={{ background: "linear-gradient(100deg,#fef3d6,#fce8d8)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 10 }}>
            <I.trophy size={18} color="var(--amber-d)" sw={2.2} />
            <span style={{ fontWeight: 800, fontSize: 15, fontFamily: "var(--round)", color: "#8a5a16" }}>あと2枚で岐阜県をコンプリート</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--num)", fontWeight: 800, color: "#8a5a16", fontSize: 15 }}>3/5</span>
          </div>
          <div style={{ padding: 18, display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ flex: 1 }}><Meter pct={60} color="var(--amber)" /></div>
            {[{ n: "岐阜・養老の滝" }, { n: "岐阜・白川郷" }].map((e) => (
              <div key={e.n} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--card-2)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px 8px 8px" }}>
                <EmptyFrame size={44} />
                <div style={{ fontSize: 12, fontWeight: 700 }}>{e.n}</div>
                <button className="btn primary" style={{ padding: "8px 14px", fontSize: 12.5, borderRadius: 9 }}><I.camera size={14} sw={2.4} />撮る</button>
              </div>
            ))}
          </div>
        </div>

        {/* collection multi-col grid */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <I.stamp size={17} color="var(--ink-soft)" sw={2.2} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>コレクション</span>
            <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-faint)", fontWeight: 600 }}>愛知県 9/9 ・ 点線 = 写真がまだ無い</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 18, justifyItems: "center" }}>
            {grid.map((c, i) => (
              <div key={i} style={{ position: "relative" }}>
                {c.p
                  ? <Mh size={104} label="撮影済" />
                  : <div style={{ position: "relative" }}>
                      <EmptyFrame size={104} />
                      <div style={{ position: "absolute", left: "50%", bottom: -6, transform: "translateX(-50%)", background: PC_RED, color: "#fff", fontSize: 10.5, fontWeight: 800, padding: "4px 9px", borderRadius: 999, whiteSpace: "nowrap", fontFamily: "var(--round)", boxShadow: "0 2px 5px rgba(150,60,30,.3)" }}>📷 {c.n}</div>
                    </div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PC_Detail_Posted, PC_Home });
