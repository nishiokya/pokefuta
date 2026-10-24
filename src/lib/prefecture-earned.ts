/** 公開スタンプ帳の都道府県の制覇（いつ成立したか・何回成立したか）。DB に依存しない純粋な関数 */

/**
 * 「その時点で存在していたポケふたを全て訪問済みだった瞬間」があったかを判定し、
 * 最初に成立した日時と、最後に成立していた時点の設置枚数を返す。
 *
 * 現在の枚数と訪問数を比べるだけだと、制覇後にポケふたが新設された県で
 * 制覇の事実そのものが消えてしまう(実際に初回一括投入422件のあと60件が追加されている)。
 * 制覇は履歴上の出来事なので、カタログへの登場時刻とユーザーの初回訪問時刻を
 * 時系列に並べ、両方をイベントとして走査して復元する。
 *
 * 候補を訪問時刻だけに絞ると、カタログ登録より先に現地訪問していたポケふた
 * (v < created_at)で成立時刻を取りこぼすため、登場時刻もイベントに含める。
 *
 * earnedAt は最初の成立時刻(=実績としての制覇日)、earnedTotal は最後に成立して
 * いた時点の枚数を返す。後から増えた分を訪問済みなら現在の枚数に追いつき、
 * 未訪問なら制覇時の枚数のまま残るので「その後N枚 追加」の判定に使える。
 * earnedCount は制覇が成立した回数。制覇したあとに増えた分まで回ってもう一度そろえると2になる（金メダル2つ）。
 */
export function findEarnedCompletion(
  manholes: readonly { id: number; created_at: string | null }[],
  firstVisitTimeByManhole: Map<number, number>,
  catalogBaselineCutoff: number
): { earnedAt: string | null; earnedTotal: number; earnedCount: number } {
  if (manholes.length === 0) return { earnedAt: null, earnedTotal: 0, earnedCount: 0 };

  // 各ポケふたが「存在するようになった時刻」。0 は最初から存在していた扱い
  const existsFrom = manholes.map((manhole) => {
    const time = new Date(manhole.created_at || 0).getTime();
    // created_at が欠けている行は最初から存在していたとみなす
    if (Number.isNaN(time) || time <= 0) return 0;
    // 一括投入分の created_at は「DBに入れた日」であって設置日ではない。
    // これを設置時刻として扱うと、投入日より前に訪問していたユーザーが
    // 「当時0枚」と判定されて制覇を失うため、投入バッチ内は常在扱いにする
    return time <= catalogBaselineCutoff ? 0 : time;
  });
  const visitedAt = manholes.map((manhole) => firstVisitTimeByManhole.get(manhole.id) ?? null);

  if (visitedAt.every((time) => time === null)) return { earnedAt: null, earnedTotal: 0, earnedCount: 0 };

  const candidates = Array.from(
    new Set([
      ...existsFrom.filter((time) => time > 0),
      ...visitedAt.filter((time): time is number => typeof time === 'number' && time > 0),
    ])
  ).sort((a, b) => a - b);

  let earnedAt: number | null = null;
  let earnedTotal = 0;
  let earnedCount = 0;
  let wasComplete = false;

  for (const candidate of candidates) {
    let existing = 0;
    let visitedExisting = 0;
    for (let index = 0; index < manholes.length; index++) {
      if (existsFrom[index] > candidate) continue;
      existing++;
      const visited = visitedAt[index];
      if (visited !== null && visited <= candidate) visitedExisting++;
    }

    const complete = existing > 0 && visitedExisting >= existing;
    if (complete) {
      if (earnedAt === null) earnedAt = candidate;
      // 成立していた最後の時点の枚数を残す
      earnedTotal = existing;
      // 新設で崩れたあと、もう一度そろった回も数える
      if (!wasComplete) earnedCount++;
    }
    wasComplete = complete;
  }

  return {
    earnedAt: earnedAt === null ? null : new Date(earnedAt).toISOString(),
    earnedTotal,
    earnedCount,
  };
}
