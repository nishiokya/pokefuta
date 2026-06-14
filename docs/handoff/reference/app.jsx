/* app.jsx — mounts the comparison canvas */

const AW = 390, AH = 884;

function Canvas() {
  return (
    <DesignCanvas>
      <DCSection
        id="collection-split"
        title="スタンプ帳 ⇄ マイ旅 の責務分離 ★今回の再設計"
        subtitle="レビュー方針: スタンプ帳=コレクションブック(都道府県/ポケモン/特徴/コンプリート目前が主役)、マイ旅=旅日記(時系列)。現状スタンプ帳が訪問履歴グリッドでマイ旅に寄りすぎ→収集体験を取り戻す。"
      >
        <DCArtboard id="sb-new" label="スタンプ帳 · コレクションブック(再設計)" width={AW} height={1280}><Stampbook /></DCArtboard>
        <DCArtboard id="sb-v2" label="スタンプ帳 v2 · 図鑑の壁で密度回復 ★推奨" width={AW} height={1340}><Stampbook2 /></DCArtboard>
        <DCArtboard id="mytrip-pair" label="マイ旅 · 旅日記(時系列・対比)" width={AW} height={1180}><MyTrip /></DCArtboard>
      </DCSection>

      <DCSection
        id="AB"
        title="採用案 · A基盤 ＋ B一番乗り"
        subtitle="ホームはAの図鑑コンプリート基盤、詳細ページにBの「一番乗り」フック＋ボタンを統合。0人→#1 で先着を煽りつつ、撮影が写真図鑑も埋めると見せる。"
      >
        <DCArtboard id="AB-home" label="採用 · スタンプ帳ホーム(A基盤)" width={AW} height={AH}><A_Home /></DCArtboard>
        <DCArtboard id="AB-detail" label="採用 · 詳細ページ(A＋B一番乗り)" width={AW} height={AH}><AB_Detail /></DCArtboard>
      </DCSection>

      <DCSection
        id="unified"
        title="統合版 詳細ページ ★1テンプレート原則"
        subtitle="「あとで」で旧ページへ全画面トグルする現実装を是正。詳細は1テンプレートのみ：PhotoPromptを最上段、その下に建物・目印／登場ポケモン／場所／共有を常設マージ。詳細では「あとで」ボタンは廃止（スクロールが逃げ道）。"
      >
        <DCArtboard id="unified-detail" label="統合版 · 詳細ページ(下呂)" width={AW} height={1240}><U_Detail /></DCArtboard>
      </DCSection>

      <DCSection
        id="mytrip"
        title="マイ旅 再設計（旅日記）★今回の修正対象"
        subtitle="戦略メモ準拠: 写真中心・達成率は小さく。現実装の達成率(PASSPORT)主役を是正。写真図鑑を主役の細ヘッダーに、達成率は二次行へ降格。写真ゼロ訪問はdedup後1行＋写真追加CTA。"
      >
        <DCArtboard id="mytrip-new" label="マイ旅 · 旅日記(再設計案)" width={AW} height={1180}><MyTrip /></DCArtboard>
      </DCSection>

      <DCSection
        id="states"
        title="詳細ページの状態出し分け"
        subtitle="同じ画面が写真の有無で文言を切替。①写真0枚＝「一番乗り」 ②写真あり＝「あなたの構図で塗り替える」。Aの『あなたの図鑑はこの場所0/1』は常に効くので破綻しない。"
      >
        <DCArtboard id="st-empty" label="状態1 · 写真0枚(一番乗り)" width={AW} height={AH}><AB_Detail /></DCArtboard>
        <DCArtboard id="st-posted" label="状態2 · 写真あり(構図を加える)" width={AW} height={AH}><AB_Detail_Posted /></DCArtboard>
      </DCSection>

      <DCSection
        id="pc"
        title="PC幅(デスクトップ)流用案"
        subtitle="モバイルの縦積みを2カラム化。左=写真ヒーロー＋情報、右にPhotoPromptカードをsticky固定して常に視界へ。CTAはPCでも右上に居続ける。"
      >
        <DCArtboard id="pc-home" label="PC · スタンプ帳ホーム(A基盤)" width={PC_W} height={800}><PC_Home /></DCArtboard>
        <DCArtboard id="pc-detail" label="PC · 詳細ページ(写真0枚)" width={PC_W} height={760}><PC_Detail /></DCArtboard>
        <DCArtboard id="pc-posted" label="PC · 詳細ページ(写真あり)" width={PC_W} height={760}><PC_Detail_Posted /></DCArtboard>
      </DCSection>

      <DCSection
        id="A"
        title="案A · 図鑑コンプリート型"
        subtitle="ゲーミフィケーション。写真投稿＝「写真図鑑を埋める」収集体験に再定義。『あと◯枚で県コンプ』の進捗で煽る。"
      >
        <DCArtboard id="A-home" label="A · スタンプ帳ホーム" width={AW} height={AH}><A_Home /></DCArtboard>
        <DCArtboard id="A-detail" label="A · 詳細ページ(写真0枚)" width={AW} height={AH}><A_Detail /></DCArtboard>
      </DCSection>

      <DCSection
        id="B"
        title="案B · 一番乗り型"
        subtitle="FOMO / 希少性。「まだ誰も写真を出していない」未開拓の価値。0人→#1 のソーシャルプルーフ反転で先着を煽る。"
      >
        <DCArtboard id="B-home" label="B · スタンプ帳ホーム" width={AW} height={AH}><B_Home /></DCArtboard>
        <DCArtboard id="B-detail" label="B · 詳細ページ(写真0枚)" width={AW} height={AH}><B_Detail /></DCArtboard>
      </DCSection>

      <DCSection
        id="C"
        title="案C · 撮影手配 / 写真ハンター型(新案)"
        subtitle="希少性×ゲーム性を融合した別レイヤー。写真0枚を「撮影手配中(WANTED)」の賞金ミッション化。ランク・一番乗り報酬2倍で動かす。"
      >
        <DCArtboard id="C-home" label="C · スタンプ帳ホーム" width={AW} height={AH}><C_Home /></DCArtboard>
        <DCArtboard id="C-detail" label="C · 詳細ページ(写真0枚)" width={AW} height={AH}><C_Detail /></DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Canvas />);
