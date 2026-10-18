'use client';

import { useState } from 'react';
import exifr from 'exifr';

type Variant = { id: string; name: string; accept?: string; capture?: 'environment' };

// accept の書き方で、Android の Chrome が開く選択画面（標準の写真選択・ファイル・Google フォトなど）が変わる
const VARIANTS: Variant[] = [
  { id: 'A', name: '今の投稿画面と同じ', accept: 'image/*' },
  { id: 'B', name: '形式を並べる', accept: 'image/jpeg,image/png,image/heic' },
  { id: 'C', name: '拡張子で指定', accept: '.jpg,.jpeg,.png,.heic' },
  { id: 'D', name: '画像以外も混ぜる', accept: 'image/*,application/pdf' },
  { id: 'E', name: '指定なし（何でも）' },
  { id: 'F', name: 'カメラで撮る（参考）', accept: 'image/*', capture: 'environment' },
];

const ROUTES = ['標準の写真選択画面', 'Google フォト', 'ファイル / マイファイル', 'ギャラリー（Samsung など）', 'カメラ', 'その他'];

type Result = {
  key: string;
  variant: string;
  route: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  hasGps: boolean;
  lat: number | null;
  lng: number | null;
  gpsKeyCount: number;
  exifKeyCount: number;
  make: string | null;
  model: string | null;
  shotAt: string | null;
  parseError: string | null;
  logged: 'sending' | 'ok' | 'failed';
};

export default function GpsPickerTest() {
  const [route, setRoute] = useState(ROUTES[0]);
  const [results, setResults] = useState<Result[]>([]);

  const handle = async (variant: Variant, file: File) => {
    let ex: Record<string, any> | null = null;
    let parseError: string | null = null;
    try {
      ex = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, translateValues: false });
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
    const hasGps = typeof ex?.latitude === 'number' && typeof ex?.longitude === 'number';
    const result: Result = {
      key: `${Date.now()}-${Math.random()}`,
      variant: variant.id,
      route: variant.capture ? 'カメラ' : route,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      hasGps,
      lat: hasGps ? ex!.latitude : null,
      lng: hasGps ? ex!.longitude : null,
      gpsKeyCount: ex ? Object.keys(ex).filter((k) => k.startsWith('GPS')).length : 0,
      exifKeyCount: ex ? Object.keys(ex).length : 0,
      make: typeof ex?.Make === 'string' ? ex.Make : null,
      model: typeof ex?.Model === 'string' ? ex.Model : null,
      shotAt: ex?.DateTimeOriginal ? String(ex.DateTimeOriginal) : null,
      parseError,
      logged: 'sending',
    };
    setResults((prev) => [result, ...prev]);

    // ファイル名は撮影日時などを含むので送らない
    const { key, fileName, logged, ...payload } = result;
    let ok = false;
    try {
      const res = await fetch('/api/debug/gps-picker-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, accept: variant.accept ?? '', capture: variant.capture ?? '', ua: navigator.userAgent }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    setResults((prev) => prev.map((r) => (r.key === key ? { ...r, logged: ok ? 'ok' : 'failed' } : r)));
  };

  return (
    <main className="mx-auto grid max-w-xl gap-5 px-4 py-6 text-[#2A2A2A]">
      <header className="grid gap-2">
        <h1 className="text-xl font-bold">写真GPS 選び方テスト</h1>
        <p className="text-sm text-[#2A2A2A]/70">
          写真の選び方ごとに、EXIF の GPS がブラウザに届くかを確かめます。写真も結果も保存しません。結果はサーバーのログにだけ出ます。
        </p>
      </header>

      <section className="grid gap-2 text-sm">
        <h2 className="font-bold">手順</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>カメラの位置情報を ON にして撮った写真を1枚決める（Google フォトで場所に「推定」が付いていないもの）</li>
          <li>下の「次に選ぶアプリ」を合わせてから、ボタンを押して同じ写真を選ぶ</li>
          <li>アプリを選ぶ画面が出たら、Google フォト・ファイルなどをそれぞれ試す（ボタンは何度押してもよい）</li>
        </ol>
      </section>

      <label className="grid gap-1 text-sm" htmlFor="gps-test-route">
        <span className="font-bold">次に選ぶアプリ</span>
        <select
          id="gps-test-route"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          className="rounded-lg border border-[#2A2A2A]/20 bg-white px-3 py-2"
        >
          {ROUTES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>

      <section className="grid gap-2">
        {VARIANTS.map((v) => (
          <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#2A2A2A]/15 bg-white px-4 py-3">
            <div className="min-w-0">
              <div className="font-bold">{v.id}. {v.name}</div>
              <code className="break-all text-xs text-[#2A2A2A]/60">
                accept={v.accept ?? '（なし）'}{v.capture ? ` capture=${v.capture}` : ''}
              </code>
            </div>
            <label className="shrink-0 cursor-pointer rounded-lg bg-[#2A2A2A] px-4 py-2 text-sm font-bold text-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2">
              写真を選ぶ
              <input
                type="file"
                className="sr-only"
                accept={v.accept}
                capture={v.capture}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  files.forEach((f) => handle(v, f));
                }}
              />
            </label>
          </div>
        ))}
      </section>

      <section className="grid gap-2">
        <h2 className="font-bold">結果</h2>
        {results.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#2A2A2A]/20 px-4 py-3 text-sm text-[#2A2A2A]/60">
            まだ結果はありません。上のボタンから写真を選ぶと、ここに GPS の有無が出ます。
          </p>
        )}
        {results.map((r) => (
          <article
            key={r.key}
            className={`grid gap-1 rounded-xl border border-l-[6px] bg-white px-4 py-3 text-sm ${r.hasGps ? 'border-l-green-600' : 'border-l-red-600'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{r.variant}. {VARIANTS.find((v) => v.id === r.variant)?.name}（{r.route}）</strong>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.hasGps ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {r.hasGps ? 'GPS あり' : r.exifKeyCount ? 'GPS なし（他の EXIF はあり）' : 'EXIF なし'}
              </span>
            </div>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 font-mono text-xs">
              <dt className="text-[#2A2A2A]/60">緯度経度</dt>
              <dd className="break-all">{r.hasGps ? `${r.lat!.toFixed(6)}, ${r.lng!.toFixed(6)}` : '—'}</dd>
              <dt className="text-[#2A2A2A]/60">GPS 項目数</dt>
              <dd>{r.gpsKeyCount}</dd>
              <dt className="text-[#2A2A2A]/60">撮影日時</dt>
              <dd className="break-all">{r.shotAt ?? '—'}</dd>
              <dt className="text-[#2A2A2A]/60">機種</dt>
              <dd className="break-all">{[r.make, r.model].filter(Boolean).join(' ') || '—'}</dd>
              <dt className="text-[#2A2A2A]/60">ファイル</dt>
              <dd className="break-all">{r.fileName} / {r.fileType || '形式不明'} / {Math.round(r.fileSize / 1024)} KB</dd>
              {r.parseError && (
                <>
                  <dt className="text-[#2A2A2A]/60">読み取りエラー</dt>
                  <dd className="break-all">{r.parseError}</dd>
                </>
              )}
              <dt className="text-[#2A2A2A]/60">ログ</dt>
              <dd>{r.logged === 'sending' ? '送信中' : r.logged === 'ok' ? '出力済み' : '失敗'}</dd>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
