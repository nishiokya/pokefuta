'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle, ChevronDown, FolderOpen, Loader2, MapPin, MessageCircle } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import type { Manhole } from '@/types/database';
import { fetchAllManholes } from '@/lib/manhole-list-client';
import { manholeLabel } from '@/lib/manhole-label';
import { buildAutoVisitNote, extractPhotoMetadata, type PhotoMetadata } from '@/lib/photo-exif';
import {
  BULK_MAX_FILES,
  classifyBulkPhotos,
  countNewManholes,
  jstDayKey,
  type BulkClassification,
  type BulkVisitGroup,
  type OwnVisit,
} from '@/lib/bulk-upload';
import { pokefutaEvents } from '@/lib/analytics/gtag';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { classifyClientSubmissionError } from '@/lib/analytics/submission-error';
import { pageTitle } from '@/lib/constants';
import { filesFromDataTransfer, isImageFile, makeThumbnail } from './browser-files';

// 写真をまとめて選び、写真の GPS から蓋を当てて、当たったものだけを一度に投稿する（PC・iPhone 向け）。
// 確かめる段まではブラウザの中だけで動き、何も送らない。
// Android のスマホはブラウザで写真を選ぶと GPS が消えるので、写真を選ばせずに PC へ案内する。
// 仕様: vault inbox/dev/pokefuta/spec「まとめて投稿ページ（PC・iPhone）仕様」

// まとめて投稿は公開だけ。何十枚もの写真を一度に非公開で抱え込むと、
// 蓋のページに写真が集まらず、本人も公開し直す手間が大きいため（非公開にしたい写真は1枚ずつの投稿で）
const IS_PUBLIC = true;

/** 同時に送る訪問の数 */
const SEND_CONCURRENCY = 2;
// ベータ。不具合は X の @pokemonmanhole で受ける（/photos/plush と同じ形）
const FEEDBACK_URL = `https://x.com/intent/post?text=${encodeURIComponent('@pokemonmanhole まとめて投稿（ベータ）の不具合: ')}&url=${encodeURIComponent('https://pokefuta.com/upload/bulk')}`;

type Phase = 'select' | 'reading' | 'review' | 'sending' | 'done';
type SendState = 'waiting' | 'sending' | 'done' | 'failed';

interface BulkPhoto {
  id: string;
  file: File;
  metadata: PhotoMetadata;
  shotAt: Date;
  thumbnail: string | null;
}

/** 自分の訪問を全部読む（100件ずつ）。ログインしていなければ null */
async function fetchOwnVisits(): Promise<OwnVisit[] | null> {
  const visits: OwnVisit[] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`/api/visits?limit=100&offset=${offset}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`visits ${res.status}`);
    const body = await res.json();
    if (!body?.success || !body.authenticated) return null;
    const page = (body.visits ?? []) as {
      id: string;
      manhole_id: number;
      shot_at: string;
      is_public: boolean;
      photos?: { file_size?: number | null }[];
    }[];
    visits.push(
      ...page.map(({ id, manhole_id, shot_at, is_public, photos }) => ({
        id,
        manhole_id,
        shot_at,
        is_public: is_public !== false,
        photo_sizes: (photos ?? []).map((p) => p.file_size).filter((n): n is number => typeof n === 'number'),
      }))
    );
    if (page.length < 100) return visits;
  }
}

/** 送信の失敗。API の code（無ければ通信の種別）を持って、完了イベントに載せる */
class BulkSendError extends Error {
  /**
   * サーバーで保存されたか分からない失敗（応答が来なかった・壊れていた・5xx）。
   * API は訪問と写真を保存してから応答するので、応答だけ失われると保存済みのことがある
   */
  readonly uncertain: boolean;
  constructor(message: string, readonly code: string, options?: { cause?: unknown; uncertain?: boolean }) {
    super(message, options);
    this.uncertain = options?.uncertain ?? false;
  }
}

/** 一番多かった失敗の原因 */
function topErrorCode(codes: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const code of codes) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function formatShotAt(date: Date): string {
  return date.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function BulkUploadPage() {
  const { track, trackView, trackNavClick } = useAnalytics();
  const [isAndroid, setIsAndroid] = useState(false);
  const [phase, setPhase] = useState<Phase>('select');

  const [manholes, setManholes] = useState<Manhole[] | null>(null);
  const [ownVisits, setOwnVisits] = useState<OwnVisit[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [photos, setPhotos] = useState<Record<string, BulkPhoto>>({});
  const [classification, setClassification] = useState<BulkClassification<Manhole> | null>(null);
  const [readProgress, setReadProgress] = useState({ done: 0, total: 0 });
  const [skipped, setSkipped] = useState({ notImage: 0, overLimit: 0 });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [landscape, setLandscape] = useState<Set<string>>(new Set());
  const [isDragActive, setIsDragActive] = useState(false);

  const [sendState, setSendState] = useState<Record<string, SendState>>({});
  const [photoResult, setPhotoResult] = useState<Record<string, 'done' | 'failed'>>({});
  const [groupError, setGroupError] = useState<Record<string, string>>({});
  const [aborted, setAborted] = useState(false);
  const abortRef = useRef(false);
  // 訪問ができたら、その訪問に残りの写真を足す（再送でも同じ訪問に足す）
  const visitIdByGroupRef = useRef<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  // 写真の取り込み中に、もう一度選ばれた分を受け付けない（フォルダの読み込みは時間がかかり、
  // 遅い方が先の取り込み結果を上書きする）
  const ingestingRef = useRef(false);
  // 送信中の回の結果。p_bulk_complete を、送り終えたとき・ページを離れたときのどちらか1回だけ送る
  // ページが bfcache に入って戻ってきたら、そこからは新しい回として数える（送った分を取りこぼさない）
  const runRef = useRef<{
    runResults: Record<string, 'done' | 'failed'>;
    errorCodes: string[];
    succeededBefore: Set<string>;
    groups: BulkVisitGroup<Manhole>[];
    newManholeIds: Set<number>;
    flushed: boolean;
    /** 画面に出す累計（再送をまたいで持つ） */
    cumulative: Record<string, 'done' | 'failed'>;
  } | null>(null);
  // 応答が失われて、保存されたか分からない写真と、そのとき送ったファイルサイズ（再送前の照合用）
  const uncertainIdsRef = useRef<Set<string>>(new Set());
  const sentSizeByIdRef = useRef<Record<string, number>>({});

  /** この回の p_bulk_complete を送る。二度目以降は何もしない */
  const flushBulkComplete = useCallback((isAborted: boolean) => {
    const run = runRef.current;
    if (!run || run.flushed) return;
    run.flushed = true;
    const runSucceededKeys = new Set(
      run.groups
        .filter((g) => !run.succeededBefore.has(g.key) && g.photoIds.some((id) => run.runResults[id] === 'done'))
        .map((g) => g.key)
    );
    const newManholesBefore = countNewManholes(run.groups, run.newManholeIds, run.succeededBefore);
    const newManholesNow = countNewManholes(run.groups, run.newManholeIds, new Set([...run.succeededBefore, ...runSucceededKeys]));
    pokefutaEvents.bulkComplete({
      photo_succeeded: Object.values(run.runResults).filter((r) => r === 'done').length,
      photo_failed: Object.values(run.runResults).filter((r) => r === 'failed').length,
      new_manhole_count: newManholesNow - newManholesBefore,
      is_aborted: isAborted,
      ...(run.errorCodes.length > 0 ? { error_code: topErrorCode(run.errorCodes) } : {}),
    });
  }, []);

  /**
   * 準備（蓋の一覧・自分の訪問）に失敗して写真を選べないまま止まったこと。
   * 数えないと、ただ開いて離れた人と区別できない。投稿の失敗ではないので p_app_error で送る
   */
  const reportPrepareFailure = (cause: 'manholes' | 'visits' | 'session') => {
    track('p_app_error', {
      error_code: 'bulk_prepare_failed',
      error_type: cause,
      surface: 'upload_bulk',
    });
  };

  useEffect(() => {
    document.title = pageTitle('まとめて投稿');
    const android = /Android/i.test(navigator.userAgent);
    setIsAndroid(android);
    trackView('/upload/bulk', 'まとめて投稿', 'upload', true); // middleware がログインを保証
    pokefutaEvents.bulkStart({ is_logged_in: true, is_android: android });
    if (android) return;

    (async () => {
      try {
        const [list, visits] = await Promise.all([fetchAllManholes(), fetchOwnVisits()]);
        if (!list) throw new Error('manholes');
        if (visits === null) {
          setLoadError('ログインが切れています。ログインし直してから開いてください。');
          reportPrepareFailure('session');
          return;
        }
        setManholes(list.manholes as unknown as Manhole[]);
        setOwnVisits(visits);
      } catch (error) {
        console.error('Failed to prepare bulk upload:', error);
        // 自分の投稿が読めないまま進むと、投稿済みの判定ができず同じ訪問が二重にできる
        setLoadError('蓋の一覧かあなたの投稿を読めませんでした。ページを再読み込みしてください。');
        reportPrepareFailure(error instanceof Error && error.message === 'manholes' ? 'manholes' : 'visits');
      }
    })();
  }, [trackView]);

  // 送信中にページを離れようとしたら止める。サイト内のリンクは beforeunload が出ないので、
  // クリックを先に捕まえて確かめる
  useEffect(() => {
    if (phase !== 'sending') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClickCapture = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor || (anchor as HTMLAnchorElement).target === '_blank') return;
      if (!window.confirm('送信中です。ページを移ると、まだ送っていない写真は送られません。移りますか？')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [phase]);

  // ページを離れたら、まだ送っていない写真は送らず、ここまでの結果を計測に残す。経路は2つ:
  // - pagehide（タブを閉じる・再読み込み）: ドキュメントごと消えるので、その場で送る（できる範囲で）
  // - アンマウント（Next.js の Link によるクライアント遷移。pagehide は出ない）: 次の写真は送らないが、
  //   送信中の1枚は終わるまで待ち、runSend の最後でその結果も含めて送る（先に送ると成功を取りこぼす）
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      flushBulkComplete(true);
      // bfcache に入るだけなら、戻ってきた後も送信は続く。続きを新しい回として数え直す
      const run = runRef.current;
      if (event.persisted && run) {
        runRef.current = {
          ...run,
          runResults: {},
          errorCodes: [],
          succeededBefore: new Set(
            run.groups.filter((g) => g.photoIds.some((id) => run.cumulative[id] === 'done')).map((g) => g.key)
          ),
          flushed: false,
        };
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      abortRef.current = true;
    };
  }, [flushBulkComplete]);

  const ready = manholes !== null && ownVisits !== null;

  /** 取り込みは同時に1つだけ。フォルダの読み込みを含めて、終わるまで次を受け付けない */
  const ingest = useCallback(async (getFiles: () => Promise<File[]>) => {
    if (ingestingRef.current) return;
    ingestingRef.current = true;
    try {
      await readFiles(await getFiles());
    } finally {
      ingestingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manholes, ownVisits]);

  const readFiles = useCallback(
    async (rawFiles: File[]) => {
      if (!manholes || !ownVisits) return;
      const images = rawFiles.filter(isImageFile);
      const files = images.slice(0, BULK_MAX_FILES);
      setSkipped({ notImage: rawFiles.length - images.length, overLimit: images.length - files.length });
      if (files.length === 0) return;

      setPhase('reading');
      setReadProgress({ done: 0, total: files.length });
      const read: BulkPhoto[] = [];
      for (const [index, file] of files.entries()) {
        const metadata = await extractPhotoMetadata(file);
        const exifDate = metadata.datetime ? new Date(metadata.datetime) : null;
        const shotAt = exifDate && !Number.isNaN(exifDate.getTime()) ? exifDate : new Date(file.lastModified);
        read.push({ id: `p${index}-${file.name}`, file, metadata, shotAt, thumbnail: null });
        setReadProgress({ done: index + 1, total: files.length });
      }

      const result = classifyBulkPhotos(
        read.map((p) => ({ id: p.id, latitude: p.metadata.latitude, longitude: p.metadata.longitude, shotAt: p.shotAt })),
        manholes,
        ownVisits
      );

      // サムネイルは投稿の候補（蓋に当たった写真）だけ作る
      const byId = Object.fromEntries(read.map((p) => [p.id, p]));
      for (const group of result.groups) {
        for (const id of group.photoIds) byId[id].thumbnail = await makeThumbnail(byId[id].file);
      }

      setPhotos(byId);
      setClassification(result);
      setSelected(new Set(result.groups.filter((g) => !g.existingVisitId).flatMap((g) => g.photoIds)));
      setLandscape(new Set());
      setPhase('review');

      const okCount = Object.values(result.statusById).filter((s) => s === 'ok').length;
      const postedCount = Object.values(result.statusById).filter((s) => s === 'posted').length;
      pokefutaEvents.bulkFilesSelected({
        file_count: files.length,
        ok_count: okCount,
        posted_count: postedCount,
        far_count: result.far.length,
        no_gps_count: result.noGps.length,
      });
    },
    [manholes, ownVisits]
  );

  const resetSelection = () => {
    setPhotos({});
    setClassification(null);
    setSelected(new Set());
    setLandscape(new Set());
    setSendState({});
    setPhotoResult({});
    setGroupError({});
    setAborted(false);
    abortRef.current = false;
    visitIdByGroupRef.current = {};
    uncertainIdsRef.current = new Set();
    sentSizeByIdRef.current = {};
    runRef.current = null;
    setPhase('select');
  };

  const groups = classification?.groups ?? [];
  const selectedGroups = groups.filter((g) => g.photoIds.some((id) => selected.has(id)));
  const selectedCount = groups.reduce((n, g) => n + g.photoIds.filter((id) => selected.has(id)).length, 0);

  const toggle = (setter: typeof setSelected, id: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (group: BulkVisitGroup<Manhole>, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      group.photoIds.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  /** 1枚送る。成功したら訪問 id を返す */
  const sendPhoto = async (group: BulkVisitGroup<Manhole>, photo: BulkPhoto, visitId: string | null): Promise<string> => {
    let compressed: File;
    try {
      compressed = await imageCompression(photo.file, { maxSizeMB: 2, maxWidthOrHeight: 1920, useWebWorker: true });
    } catch (error) {
      throw new BulkSendError('この画像形式は変換できませんでした（HEIC は Safari で開くか、JPEG に書き出してください）', 'unsupported_format', { cause: error });
    }
    sentSizeByIdRef.current[photo.id] = compressed.size;
    const form = new FormData();
    form.append('file', compressed);
    form.append('is_landscape', String(landscape.has(photo.id)));
    form.append('manhole_id', String(group.manhole.id));
    form.append('shot_at', photo.shotAt.toISOString());
    form.append('latitude', String(photo.metadata.latitude));
    form.append('longitude', String(photo.metadata.longitude));
    form.append('is_public', String(IS_PUBLIC));
    if (photo.metadata.exifPayload) form.append('exif', JSON.stringify(photo.metadata.exifPayload));
    if (visitId) {
      form.append('visit_id', visitId);
    } else {
      const note = buildAutoVisitNote(photo.metadata, group.manhole);
      if (note) form.append('note', note);
    }
    let res: Response;
    try {
      res = await fetch('/api/image-upload', { method: 'POST', body: form });
    } catch (error) {
      throw new BulkSendError('通信できませんでした。電波の良いところで「もう一度送る」を押してください', classifyClientSubmissionError(error), {
        cause: error,
        uncertain: true,
      });
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      const message = body?.error || `送信に失敗しました（${res.status}）`;
      const code = typeof body?.code === 'string' ? body.code : classifyClientSubmissionError(new Error(message), res.status);
      // 5xx と、成功のはずの応答が読めなかったときは、保存されたか分からない
      throw new BulkSendError(message, code, { uncertain: res.status >= 500 || (res.ok && !body) });
    }
    return (typeof body.visit_id === 'string' ? body.visit_id : visitId) as string;
  };

  /** 訪問1つ分を送る。送信済みの写真は飛ばす（再送で二重に投稿しない） */
  const sendGroup = async (group: BulkVisitGroup<Manhole>, results: Record<string, 'done' | 'failed'>) => {
    setSendState((prev) => ({ ...prev, [group.key]: 'sending' }));
    let visitId = visitIdByGroupRef.current[group.key] ?? group.existingVisitId ?? null;
    let failed = false;
    let lastError = '';
    for (const id of group.photoIds) {
      if (!selected.has(id)) continue;
      if (results[id] === 'done') continue;
      if (abortRef.current) break;
      // 計測は今の回（bfcache から戻ると差し替わる）に書く
      const run = runRef.current;
      try {
        visitId = await sendPhoto(group, photos[id], visitId);
        if (visitId) visitIdByGroupRef.current[group.key] = visitId;
        results[id] = 'done';
        if (run) runRef.current!.runResults[id] = 'done';
        uncertainIdsRef.current.delete(id);
      } catch (error) {
        console.error('Bulk upload failed:', error);
        results[id] = 'failed';
        if (run) {
          runRef.current!.runResults[id] = 'failed';
          runRef.current!.errorCodes.push(error instanceof BulkSendError ? error.code : classifyClientSubmissionError(error));
        }
        failed = true;
        lastError = error instanceof Error ? error.message : String(error);
        if (error instanceof BulkSendError && error.uncertain) {
          uncertainIdsRef.current.add(id);
          // 訪問を作るはずの1枚目が保存されたか分からないまま次を送ると、同じ蓋・同じ日に
          // 訪問がもう1つできる。このカードは止めて、再送の前に照合する
          if (!visitId) {
            setPhotoResult({ ...results });
            break;
          }
        }
      }
      setPhotoResult({ ...results });
    }
    // この回の結果だけでなく、前回までの失敗も含めて決める（再送を途中で止めると、前回の失敗が残る）
    const selectedIds = group.photoIds.filter((id) => selected.has(id));
    const allDone = selectedIds.every((id) => results[id] === 'done');
    const anyFailed = selectedIds.some((id) => results[id] === 'failed');
    setSendState((prev) => ({ ...prev, [group.key]: allDone ? 'done' : 'failed' }));
    setGroupError((prev) => ({
      ...prev,
      [group.key]: allDone ? '' : failed ? lastError : anyFailed ? '送れなかった写真があります' : '中止したため送っていない写真があります',
    }));
  };

  const runSend = async (targets: BulkVisitGroup<Manhole>[], baseResults: Record<string, 'done' | 'failed'> = photoResult) => {
    setPhase('sending');
    abortRef.current = false;
    setAborted(false);
    let wakeLock: { release: () => Promise<void> } | null = null;
    try {
      wakeLock = await (navigator as any).wakeLock?.request('screen');
    } catch {
      // 使えなければ諦める
    }
    // 画面は累計（results）で、GA4 はこの回の分（runResults）だけで数える。再送で二重に数えない
    const results: Record<string, 'done' | 'failed'> = { ...baseResults };
    const runResults: Record<string, 'done' | 'failed'> = {};
    const errorCodes: string[] = [];
    const succeededBefore = new Set(groups.filter((g) => g.photoIds.some((id) => baseResults[id] === 'done')).map((g) => g.key));
    runRef.current = {
      runResults,
      errorCodes,
      succeededBefore,
      groups,
      newManholeIds: classification?.newManholeIds ?? new Set(),
      flushed: false,
      cumulative: results,
    };
    setSendState((prev) => ({ ...prev, ...Object.fromEntries(targets.map((g) => [g.key, 'waiting' as SendState])) }));
    const queue = [...targets];
    const worker = async () => {
      for (let group = queue.shift(); group && !abortRef.current; group = queue.shift()) {
        await sendGroup(group, results);
      }
    };
    await Promise.all(Array.from({ length: SEND_CONCURRENCY }, worker));
    wakeLock?.release().catch(() => {});

    flushBulkComplete(abortRef.current);

    // この回で作った訪問を自分の訪問に足しておく。「続けて投稿する」で同じ蓋・同じ日の写真を選んだとき、
    // 投稿済みとして判定され、新しい訪問を作らずにそこへ足せるように
    const created = groups
      .filter((g) => !g.existingVisitId && visitIdByGroupRef.current[g.key])
      .map((g) => ({ id: visitIdByGroupRef.current[g.key], manhole_id: g.manhole.id, shot_at: g.firstShotAt.toISOString(), is_public: IS_PUBLIC }));
    if (created.length > 0) {
      setOwnVisits((prev) => {
        const known = new Set((prev ?? []).map((v) => v.id));
        return [...(prev ?? []), ...created.filter((v) => !known.has(v.id))];
      });
    }
    setPhase('done');
  };

  const submit = () => {
    if (selectedCount === 0) return;
    pokefutaEvents.bulkSubmit({ photo_count: selectedCount, visit_count: selectedGroups.length, is_public: IS_PUBLIC });
    void runSend(selectedGroups);
  };

  /**
   * 再送の前に、応答が失われた写真がサーバーに保存されていないかを照合する。
   * 自分の訪問を読み直し、同じ蓋・同じ日の訪問があればそこへ足す先にし、
   * 送ったときと同じファイルサイズの写真があれば保存済みとみなして送らない。
   */
  const reconcileUncertain = async (targets: BulkVisitGroup<Manhole>[], results: Record<string, 'done' | 'failed'>) => {
    if (uncertainIdsRef.current.size === 0) return;
    const visits = await fetchOwnVisits();
    if (!visits) return;
    for (const group of targets) {
      const matching = visits.filter(
        (v) => v.manhole_id === group.manhole.id && jstDayKey(new Date(v.shot_at)) === group.day
      );
      if (matching.length === 0) continue;
      if (!visitIdByGroupRef.current[group.key] && !group.existingVisitId) {
        visitIdByGroupRef.current[group.key] = matching[0].id;
      }
      const sizes = new Set(matching.flatMap((v) => v.photo_sizes ?? []));
      for (const id of group.photoIds) {
        const size = sentSizeByIdRef.current[id];
        if (uncertainIdsRef.current.has(id) && size != null && sizes.has(size)) {
          results[id] = 'done';
          uncertainIdsRef.current.delete(id);
        }
      }
    }
  };

  const retryFailed = async () => {
    const targets = groups.filter((g) => g.photoIds.some((id) => photoResult[id] === 'failed' || (selected.has(id) && !photoResult[id])));
    if (targets.length === 0) return;
    const results = { ...photoResult };
    try {
      await reconcileUncertain(targets, results);
    } catch (error) {
      // 照合できなくても再送はする（訪問が二重になる可能性は残る）
      console.error('Failed to reconcile before retry:', error);
    }
    setPhotoResult(results);
    const pendingIds = targets.flatMap((g) => g.photoIds.filter((id) => selected.has(id) && results[id] !== 'done'));
    const pendingGroups = targets.filter((g) => g.photoIds.some((id) => selected.has(id) && results[id] !== 'done'));
    if (pendingIds.length === 0) {
      setPhase('done');
      return;
    }
    // 再送も1回の投稿として数える（complete だけが増えないように）
    pokefutaEvents.bulkSubmit({ photo_count: pendingIds.length, visit_count: pendingGroups.length, is_public: IS_PUBLIC });
    void runSend(pendingGroups, results);
  };

  const summary = useMemo(() => {
    if (!classification) return null;
    const statuses = Object.values(classification.statusById);
    const okGroups = classification.groups.filter((g) => !g.existingVisitId);
    const postedGroups = classification.groups.filter((g) => g.existingVisitId);
    return {
      total: statuses.length,
      ok: statuses.filter((s) => s === 'ok').length,
      okPlaces: okGroups.length,
      posted: statuses.filter((s) => s === 'posted').length,
      postedPlaces: postedGroups.length,
      far: classification.far.length,
      noGps: classification.noGps.length,
    };
  }, [classification]);

  const doneCount = Object.values(photoResult).filter((r) => r === 'done').length;
  const failedCount = Object.values(photoResult).filter((r) => r === 'failed').length;
  const succeededKeys = new Set(groups.filter((g) => g.photoIds.some((id) => photoResult[id] === 'done')).map((g) => g.key));
  const newManholeCount = countNewManholes(groups, classification?.newManholeIds ?? new Set(), succeededKeys);

  // ---------- 描画 ----------

  if (isAndroid) {
    return (
      <Shell>
        <h1 className="text-xl font-extrabold">
          まとめて投稿
          <BetaBadge />
        </h1>
        <div className="mt-4 rounded-xl border border-[#B07818]/30 bg-[#FAF0DC] p-4 text-sm leading-relaxed text-[#5C4410]">
          <p className="font-bold">Android のスマホでは使えません</p>
          <p className="mt-1">
            Android のスマホでは、撮ってある写真をブラウザで選ぶと位置情報が消え、どの蓋の写真か分かりません。
            写真を PC に移して、PC でこのページを開いてください。
          </p>
          <p className="mt-2">
            PC へは Google フォトのウェブ版（photos.google.com）からダウンロードしてください。
            LINE で送った写真は位置情報が消えています。
          </p>
          <p className="mt-2">
            <Link href="/help/android-photos" className="font-bold underline">
              Android の写真を PC に移す方法（手順）
            </Link>
          </p>
          <CopyLinkButton />
        </div>
        <p className="mt-4 text-sm">
          その場で撮るなら <Link href="/upload" className="font-bold underline">1枚ずつの投稿（カメラで撮影）</Link> を使えます。
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-extrabold">
          まとめて投稿
          <BetaBadge />
        </h1>
        <span className="flex gap-3 text-sm">
          {/* 読み込んだ写真と選択を残すため、別タブで開く */}
          <Link href="/help/bulk-upload" target="_blank" className="underline hover:opacity-80">使い方</Link>
          <Link href="/upload" className="underline hover:opacity-80">1枚ずつ投稿する</Link>
        </span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[#2A2A2A]/70">
        旅行の写真をまとめて選ぶと、写真の位置情報から蓋を見つけて、ポケふたの写真だけを投稿します。
        確認するまで何も送りません。
      </p>
      <FeedbackNote />

      {loadError && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-[#B5483C]/40 bg-[#FBEAE8] p-3 text-sm text-[#B5483C]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {loadError}
        </p>
      )}

      {phase === 'select' && (
        <section className="mt-5">
          <div
            role="button"
            tabIndex={0}
            aria-disabled={!ready}
            onClick={() => ready && inputRef.current?.click()}
            onKeyDown={(e) => {
              if (ready && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setIsDragActive(false);
              if (!ready) return;
              // dataTransfer はイベントの間しか読めないので、項目だけ先に取り出しておく
              const dataTransfer = e.dataTransfer;
              const entriesPromise = filesFromDataTransfer(dataTransfer);
              void ingest(() => entriesPromise);
            }}
            className={`flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition ${
              isDragActive ? 'border-[#BF5640] bg-[#FFF3EE]' : 'border-[#7B63A8]/30 bg-white/70 hover:bg-white'
            } ${ready ? '' : 'cursor-wait opacity-60'}`}
          >
            {ready ? <FolderOpen className="h-10 w-10 text-[#7B63A8]" /> : <Loader2 className="h-8 w-8 animate-spin text-[#7B63A8]" />}
            <p className="font-bold">{ready ? '写真を選ぶ（複数可）' : '準備中…'}</p>
            <p className="text-xs text-[#2A2A2A]/60">
              PC は写真やフォルダをここにドラッグ＆ドロップできます。1回 {BULK_MAX_FILES} 枚まで。JPEG・PNG・HEIC
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void ingest(async () => files);
            }}
          />
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-[#2A2A2A]/60">
            <li>・iPhone で選ぶときは、写真選択の「オプション」で位置情報を ON のままにしてください</li>
            <li>・Google フォトで場所が「推定」と出ている写真や、LINE で受け取った写真は位置情報が無く、投稿できません</li>
          </ul>
        </section>
      )}

      {phase === 'reading' && (
        <section className="mt-6 rounded-xl bg-white/70 p-5 text-center" aria-live="polite">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#7B63A8]" />
          <p className="mt-2 font-bold">読み取り中 {readProgress.done} / {readProgress.total}</p>
          <p className="mt-1 text-xs text-[#2A2A2A]/60">写真の位置情報と撮影日時を端末の中で読んでいます。まだ送っていません。</p>
        </section>
      )}

      {(phase === 'review' || phase === 'sending' || phase === 'done') && classification && summary && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div className="grid min-w-0 gap-4">
            {phase === 'done' && (
              <DoneSummary
                doneCount={doneCount}
                failedCount={failedCount}
                placeCount={succeededKeys.size}
                newManholeCount={newManholeCount}
                aborted={aborted}
                onRetry={retryFailed}
                onRestart={resetSelection}
                trackNavClick={trackNavClick}
              />
            )}

            <section className="rounded-xl bg-white/70 p-4 text-sm">
              <p className="font-bold">{summary.total} 枚を読みました</p>
              <ul className="mt-2 grid gap-1">
                <li><Dot className="bg-[#4C9A57]" />投稿できる {summary.ok} 枚（{summary.okPlaces} か所）</li>
                {summary.posted > 0 && <li><Dot className="bg-[#7B63A8]" />投稿済みの訪問に当たった {summary.posted} 枚（{summary.postedPlaces} か所）</li>}
                <li><Dot className="bg-[#2A2A2A]/25" />近くにポケふたが無い {summary.far} 枚</li>
                <li><Dot className="bg-[#2A2A2A]/25" />位置情報が無い {summary.noGps} 枚</li>
              </ul>
              {(skipped.notImage > 0 || skipped.overLimit > 0) && (
                <p className="mt-2 text-xs text-[#2A2A2A]/60">
                  {skipped.notImage > 0 && `画像でないファイル ${skipped.notImage} 件は除きました。`}
                  {skipped.overLimit > 0 && `${BULK_MAX_FILES} 枚を超えた ${skipped.overLimit} 枚は読んでいません。続けて投稿で選び直してください。`}
                </p>
              )}
            </section>

            {groups.length === 0 && (
              <section className="rounded-xl border border-[#B07818]/30 bg-[#FAF0DC] p-4 text-sm leading-relaxed">
                <p className="font-bold">投稿できる写真がありませんでした</p>
                <p className="mt-1">
                  蓋から 50m 以内で撮った、位置情報つきの写真だけを投稿できます。下の内訳で、蓋までの距離や位置情報の有無を確かめてください。
                </p>
                <button type="button" onClick={resetSelection} className="mt-3 rounded-lg bg-[#2A2A2A] px-4 py-2 font-bold text-white">
                  別の写真を選ぶ
                </button>
              </section>
            )}

            {groups.map((group) => (
              <VisitCard
                key={group.key}
                group={group}
                photos={photos}
                selected={selected}
                landscape={landscape}
                distanceMById={classification.distanceMById}
                state={sendState[group.key]}
                error={groupError[group.key]}
                photoResult={photoResult}
                locked={phase !== 'review'}
                onTogglePhoto={(id) => toggle(setSelected, id)}
                onToggleLandscape={(id) => toggle(setLandscape, id)}
                onToggleGroup={(on) => toggleGroup(group, on)}
              />
            ))}

            {classification.far.length > 0 && (
              <details className="rounded-xl bg-white/50 p-4 text-sm">
                <summary className="cursor-pointer font-bold">近くにポケふたが無い {classification.far.length} 枚</summary>
                <p className="mt-2 text-xs text-[#2A2A2A]/60">
                  蓋から 50m 以内で撮った写真だけを投稿できます。一番近い蓋と距離を出しています。
                  <Link href="/help/bulk-upload-trouble#far" target="_blank" className="underline">蓋の写真なのにここに入るとき</Link>
                </p>
                <ul className="mt-2 grid gap-1 text-xs">
                  {classification.far.map(({ photoId, nearest }) => (
                    <li key={photoId} className="flex flex-wrap gap-x-2">
                      <span className="break-all text-[#2A2A2A]/70">{photos[photoId]?.file.name}</span>
                      <span>{nearest ? `${manholeLabel(nearest.manhole)} まで ${formatMeters(nearest.distanceM)}` : '蓋が見つかりません'}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {classification.noGps.length > 0 && (
              <details className="rounded-xl bg-white/50 p-4 text-sm">
                <summary className="cursor-pointer font-bold">位置情報が無い {classification.noGps.length} 枚</summary>
                <p className="mt-2 text-xs leading-relaxed text-[#2A2A2A]/60">
                  撮影時にカメラの位置情報が OFF だった写真、Google フォトで場所が「推定」の写真、LINE で受け取った写真、
                  iPhone の写真選択の「オプション」で位置情報を外した写真には位置情報がありません。
                  <Link href="/help/bulk-upload-trouble#no-gps" target="_blank" className="ml-1 underline">詳しく</Link>
                </p>
                <ul className="mt-2 grid gap-1 text-xs text-[#2A2A2A]/70">
                  {classification.noGps.map((id) => (
                    <li key={id} className="break-all">{photos[id]?.file.name}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {groups.length > 0 && phase !== 'done' && (
            <aside className="sticky bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] z-20 rounded-xl border border-[#2A2A2A]/10 bg-white p-4 shadow-lg lg:top-24 lg:bottom-auto">
              {phase === 'review' ? (
                <>
                  <p className="text-sm">
                    <span className="font-bold">公開で投稿します</span>
                    <span className="block text-xs text-[#2A2A2A]/60">
                      写真は蓋のページに並びます。非公開にしたい写真は
                      <Link href="/upload" target="_blank" className="underline">1枚ずつの投稿</Link>から
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={selectedCount === 0}
                    className="mt-3 w-full rounded-xl bg-[#BF5640] px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {selectedCount > 0 ? `${selectedCount} 枚（${selectedGroups.length} か所）を投稿する` : '投稿する写真を選んでください'}
                  </button>
                  <button type="button" onClick={resetSelection} className="mt-2 w-full text-xs underline text-[#2A2A2A]/60">
                    選び直す
                  </button>
                </>
              ) : (
                <div aria-live="polite">
                  <p className="font-bold">送信中 {doneCount + failedCount} / {selectedCount} 枚</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#2A2A2A]/10">
                    <div className="h-full bg-[#4C9A57] transition-all" style={{ width: `${selectedCount ? ((doneCount + failedCount) / selectedCount) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[#2A2A2A]/60">送り終わるまで、このページを閉じないでください。</p>
                  <button
                    type="button"
                    onClick={() => {
                      abortRef.current = true;
                      setAborted(true);
                    }}
                    disabled={aborted}
                    className="mt-3 w-full rounded-lg border border-[#2A2A2A]/20 px-3 py-2 text-sm disabled:opacity-40"
                  >
                    {aborted ? '止めています…' : '中止する（送った分は残ります）'}
                  </button>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-content safe-area-body bg-[#F6EEDC] pb-nav-safe text-[#2A2A2A]">
      <main className="mx-auto max-w-page px-4 pb-8 pt-5 sm:pt-8">{children}</main>
    </div>
  );
}

function BetaBadge() {
  return (
    <span className="ml-2 rounded-full bg-[#7B63A8] px-2 py-0.5 align-middle text-[10px] font-extrabold text-white">ベータ</span>
  );
}

function FeedbackNote() {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-[#2A2A2A]/70">
      <span>試験中の機能です。うまく動かないときは、X で教えてください。</span>
      <a
        href={FEEDBACK_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-extrabold text-[#5B4688] ring-1 ring-[#7B63A8]/40 hover:bg-[#F3EEFA]"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        不具合を知らせる
      </a>
    </p>
  );
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle ${className}`} />;
}

function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const url = 'https://pokefuta.com/upload/bulk';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <code className="select-all rounded bg-white px-2 py-1 text-xs">{url}</code>
      <button
        type="button"
        className="rounded-lg bg-[#2A2A2A] px-3 py-1.5 text-xs font-bold text-white"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false));
        }}
      >
        {copied ? 'コピーしました' : 'リンクをコピー'}
      </button>
    </div>
  );
}

function VisitCard({
  group,
  photos,
  selected,
  landscape,
  distanceMById,
  state,
  error,
  photoResult,
  locked,
  onTogglePhoto,
  onToggleLandscape,
  onToggleGroup,
}: {
  group: BulkVisitGroup<Manhole>;
  photos: Record<string, BulkPhoto>;
  selected: Set<string>;
  landscape: Set<string>;
  distanceMById: Record<string, number>;
  state?: SendState;
  error?: string;
  photoResult: Record<string, 'done' | 'failed'>;
  locked: boolean;
  onTogglePhoto: (id: string) => void;
  onToggleLandscape: (id: string) => void;
  onToggleGroup: (on: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const count = group.photoIds.filter((id) => selected.has(id)).length;
  const minDistance = Math.min(...group.photoIds.map((id) => distanceMById[id] ?? Infinity));
  const posted = !!group.existingVisitId;
  // 非公開の訪問に写真を足すと、その写真も非公開になる（サーバーは足す先の訪問の公開設定に従う）。
  // まとめて投稿は公開だけなので、非公開の訪問には足させない
  const privateVisit = posted && group.existingVisitIsPublic === false;
  const disabled = locked || privateVisit;
  const stripe =
    state === 'done' ? 'border-l-[#4C9A57]' : state === 'failed' ? 'border-l-[#B5483C]' : count > 0 ? 'border-l-[#BF5640]' : 'border-l-[#2A2A2A]/15';

  return (
    <article className={`rounded-xl border border-l-[6px] border-[#2A2A2A]/10 bg-white p-4 ${stripe}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {group.isNewManhole && <span className="rounded-full bg-[#BF5640] px-2 py-0.5 text-xs font-bold text-white">初めて</span>}
            {posted && <span className="rounded-full bg-[#7B63A8]/15 px-2 py-0.5 text-xs font-bold text-[#5B4688]">投稿済みの訪問</span>}
            <Link href={`/manhole/${group.manhole.id}`} target="_blank" className="font-bold hover:underline">
              {manholeLabel(group.manhole)}
            </Link>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#2A2A2A]/60">
            <span>{formatShotAt(group.firstShotAt)}</span>
            <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />蓋から {formatMeters(minDistance)}</span>
            {/* 足した写真は訪問の作成日時のまま並ぶので、トップの新着には上がらない（新着は visit.created_at 順） */}
            {posted && !privateVisit && <span>チェックすると、その訪問に写真を足します（トップページの新着には出ません）</span>}
            {privateVisit && (
              <span>
                この日の訪問は非公開なので、まとめて投稿では写真を足せません。
                <Link href="/visits?tab=trip" target="_blank" className="underline">スタンプ帳の「旅の記録」</Link>
                で公開にしてから、このページを開き直して写真を選び直すと足せます
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <SendBadge state={state} />
          {!disabled && (
            <button type="button" className="underline text-[#2A2A2A]/70" onClick={() => onToggleGroup(count === 0)}>
              {count === 0 ? 'すべて選ぶ' : 'すべて外す'}
            </button>
          )}
          <button type="button" aria-label={open ? 'たたむ' : '開く'} onClick={() => setOpen(!open)}>
            <ChevronDown className={`h-4 w-4 transition ${open ? '' : '-rotate-90'}`} />
          </button>
        </div>
      </div>

      {open && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {group.photoIds.map((id) => {
            const photo = photos[id];
            const isOn = selected.has(id);
            const isScenery = landscape.has(id);
            const result = photoResult[id];
            return (
              <li key={id} className="grid gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onTogglePhoto(id)}
                  aria-pressed={isOn}
                  aria-label={`${photo.file.name} を${isOn ? '外す' : '選ぶ'}`}
                  className={`relative aspect-square overflow-hidden rounded-lg border-2 ${isOn ? 'border-[#BF5640]' : 'border-transparent opacity-40'}`}
                >
                  {photo.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.thumbnail} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-[#2A2A2A]/10 text-[10px] text-[#2A2A2A]/60">
                      {photo.file.name.split('.').pop()?.toUpperCase()}
                    </span>
                  )}
                  {isOn && <CheckCircle className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white text-[#BF5640]" />}
                  {result === 'done' && <span className="absolute inset-x-0 bottom-0 bg-[#4C9A57] py-0.5 text-center text-[10px] font-bold text-white">送信済み</span>}
                  {result === 'failed' && <span className="absolute inset-x-0 bottom-0 bg-[#B5483C] py-0.5 text-center text-[10px] font-bold text-white">失敗</span>}
                </button>
                <label className={`flex items-center gap-1 text-[11px] ${isOn ? '' : 'invisible'}`}>
                  <input type="checkbox" disabled={disabled} checked={isScenery} onChange={() => onToggleLandscape(id)} />
                  周辺の風景
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-[#B5483C]">{error}</p>}
    </article>
  );
}

function SendBadge({ state }: { state?: SendState }) {
  if (!state) return null;
  const label = { waiting: '待機', sending: '送信中', done: '完了', failed: '失敗あり' }[state];
  const tone = {
    waiting: 'bg-[#2A2A2A]/10 text-[#2A2A2A]/70',
    sending: 'bg-[#7B63A8]/15 text-[#5B4688]',
    done: 'bg-[#EAF4EC] text-[#3C7A46]',
    failed: 'bg-[#FBEAE8] text-[#B5483C]',
  }[state];
  return <span className={`rounded-full px-2 py-0.5 font-bold ${tone}`}>{label}</span>;
}

function DoneSummary({
  doneCount,
  failedCount,
  placeCount,
  newManholeCount,
  aborted,
  onRetry,
  onRestart,
  trackNavClick,
}: {
  doneCount: number;
  failedCount: number;
  placeCount: number;
  newManholeCount: number;
  aborted: boolean;
  onRetry: () => void;
  onRestart: () => void;
  trackNavClick: (label: string) => void;
}) {
  return (
    <section
      className={`rounded-xl border p-5 ${doneCount > 0 ? 'border-[#4C9A57]/30 bg-[#EAF4EC]' : 'border-[#B5483C]/30 bg-[#FBEAE8]'}`}
      aria-live="polite"
    >
      <p className="text-lg font-extrabold">
        {doneCount > 0 ? `${placeCount} か所・${doneCount} 枚を投稿しました` : '投稿できませんでした'}
      </p>
      {newManholeCount > 0 && <p className="mt-1 font-bold text-[#BF5640]">新しく集めた蓋 {newManholeCount} 枚</p>}
      {(failedCount > 0 || aborted) && (
        <div className="mt-3 rounded-lg bg-white p-3 text-sm">
          <p className="font-bold text-[#B5483C]">
            {failedCount > 0 ? `${failedCount} 枚を送れませんでした。` : ''}
            {aborted ? '途中で中止しました。' : ''}
          </p>
          <button type="button" onClick={onRetry} className="mt-2 rounded-lg bg-[#2A2A2A] px-3 py-1.5 text-xs font-bold text-white">
            残りをもう一度送る
          </button>
          <p className="mt-2 text-xs text-[#2A2A2A]/70">
            何度送っても失敗するときは、
            <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className="font-bold underline">
              X で教えてください
            </a>
            。
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-[#2A2A2A]/70">次に来る人へのひとことは、下の蓋の名前から蓋のページで書けます。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/visits"
          onClick={() => trackNavClick('まとめて投稿完了:スタンプ帳')}
          className="rounded-lg bg-[#BF5640] px-4 py-2 text-sm font-bold text-white"
        >
          スタンプ帳を見る
        </Link>
        <button
          type="button"
          onClick={() => {
            trackNavClick('まとめて投稿完了:続けて投稿');
            onRestart();
          }}
          className="rounded-lg border border-[#2A2A2A]/20 bg-white px-4 py-2 text-sm font-bold"
        >
          続けて投稿する
        </button>
      </div>
    </section>
  );
}
