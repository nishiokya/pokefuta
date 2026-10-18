'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Camera,
  MapPin,
  Navigation,
  RefreshCw,
  Search,
  Stamp,
} from 'lucide-react';
import { Manhole } from '@/types/database';
import PCShell from '@/components/PCShell';
import VisitPhotoCard from '@/components/VisitPhotoCard';
import { fetchAllManholes } from '@/lib/manhole-list-client';
import { createBrowserClient } from '@/lib/supabase/client';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { pageTitle } from '@/lib/constants';
import { PhraseText } from '@/components/PhraseText';
import { manholeHeadingPlace } from '@/lib/manhole-label';
import type { CoverPhoto } from '@/lib/manhole-cover-photos';
import { nearbyArea } from '@/lib/nearby-area';

interface ManholeWithDistance extends Manhole {
  distance?: number;
  visit?: {
    id: string;
    shot_at: string;
    photos: Array<{
      id: string;
      storage_key: string;
      url?: string;
      /** /api/photo/<id>?size=small。一覧のサムネはこちらを使う */
      thumbnail_url?: string;
      is_landscape?: boolean;
    }>;
  };
  /** 自分の訪問に写真が無い蓋に出す、公開写真からの代表1枚（/api/manholes/cover-photos） */
  cover_photo?: CoverPhoto;
}

type OwnVisit = NonNullable<ManholeWithDistance['visit']>;

/** 一覧に並べる蓋の数。/api/manholes から100件取り、近い順にここまで出す */
const NEARBY_DISPLAY_LIMIT = 50;
/** /api/manholes/cover-photos が1回に受け付ける蓋の数 */
const COVER_PHOTO_CHUNK = 100;

/**
 * 「近く」と「一覧」の2つ。以前は「未訪問」も別タブだったが、近くの結果を絞り込むだけの同じ一覧で、
 * 訪問済みかどうかも一覧から読み取れなかった。今は近くに統合し、カードに「訪問済み / 未訪問」を出して
 * 「未訪問だけ」で絞り込む（ログイン時のみ）。`?tab=unvisited` の古いリンクは近く＋未訪問だけで開く
 */
type SearchTab = 'nearby' | 'all';

/**
 * 現在地が取れなかった理由。GeolocationPositionError の code に対応する（unsupported はブラウザに機能が無い）。
 * 以前は理由を問わず日本の中心（長野あたり）の既定位置で探していて、関係のない蓋が「近く」として並んでいた。
 * 今は取れなかった理由と直し方を出し、一覧は「最近写真が投稿されたポケふた（新しい順）」に替える。
 */
type LocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

const LOCATION_FAILURE_CODES: Record<number, LocationFailure> = { 1: 'denied', 2: 'unavailable', 3: 'timeout' };

/** 許可の確認に答えないまま待つ上限。これを過ぎたら新しい順の一覧を出す（取得の timeout 15秒より長く） */
const GEOLOCATION_DEADLINE_MS = 20000;

/** 位置情報が取れないときに並べる、最近写真が投稿された蓋の数 */
const RECENT_DISPLAY_LIMIT = 30;

type Platform = 'ios-safari' | 'ios-other' | 'android' | 'other';

/**
 * 端末とブラウザの種類。直し方の手順を出し分けるだけに使う（分からなければ両方出す）。
 * iPadOS の Safari は Mac と同じ UA を名乗るので、タッチ対応で見分ける。
 * iPhone の Chrome / Firefox / Edge は、Safari の設定を変えても位置情報が使えるようにならない
 * （アプリごとの位置情報の許可を見る）ので、Safari と分ける（#330 の Copilot レビュー）。
 */
function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

const searchTabs: Array<{ key: SearchTab; label: string }> = [
  { key: 'nearby', label: '近く' },
  { key: 'all', label: '一覧' },
];

export default function NearbyPage() {
  const [nearbyManholes, setNearbyManholes] = useState<ManholeWithDistance[]>([]);
  const [allManholes, setAllManholes] = useState<ManholeWithDistance[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [allLoading, setAllLoading] = useState(true);
  const [locationFailure, setLocationFailure] = useState<LocationFailure | null>(null);
  // 位置情報が取れないときの一覧（最近写真が投稿された蓋の id、新しい順）。null は未取得
  const [recentManholeIds, setRecentManholeIds] = useState<number[] | null>(null);
  const recentRequestedRef = useRef(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [radius, setRadius] = useState(30);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<SearchTab>('nearby');
  const [unvisitedOnly, setUnvisitedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const { trackNearbyRadiusChange, trackNearbyOpen, trackGeolocationEnable } = useAnalytics();
  // 直前に読み込んだ半径。初回ロード（既定30km）では送らず、実際に動かしたときだけ送る。
  const loadedRadiusRef = useRef<number | null>(null);
  // userLocation が端末の現在地か、位置情報が取れずに使った既定の中心か
  const locationFromDeviceRef = useRef(false);
  // いま並んでいる近傍結果が端末の現在地で探したものか。「いまいるのは」はこれが true のときだけ出す。
  // locationFailure だけで判定すると、現在地の更新中や再読み込みの失敗時に前の結果（既定の中心のものを含む）を
  // 新しい現在地の地域として出してしまう（#322 の Codex レビュー）。
  const [resultsFromDevice, setResultsFromDevice] = useState(false);
  // 近傍の読み込みの通し番号。最新の呼び出し以外の応答は画面に反映しない
  // （範囲変更の読み込み中に現在地を更新すると、古い応答が後から上書きしていた。#322 の Codex レビュー）
  const nearbyLoadSeqRef = useRef(0);
  // 現在地の取得の通し番号。「現在地を更新」を続けて押すと応答が逆順に届くことがあり、
  // 古い成功（や既定の中心での失敗）が後から勝っていた（#322 の Codex レビュー）
  const geolocationSeqRef = useRef(0);
  // 現在地の取得待ちか。待っている間は範囲を変えても古い位置で探さない（取れたら最新の範囲で探す）
  const geolocationPendingRef = useRef(false);
  // 現在地の取得の締め切り（GEOLOCATION_DEADLINE_MS）のタイマー
  const geolocationDeadlineRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(geolocationDeadlineRef.current), []);
  const radiusRef = useRef(radius);
  radiusRef.current = radius;
  const uploadHref = isLoggedIn ? '/upload' : '/login?redirect=/upload';
  // 自分の訪問は「近く」と「一覧」で同じものを使うので1回だけ取る
  const ownVisitsRef = useRef<Promise<Map<number, OwnVisit>> | null>(null);

  /**
   * 自分の訪問を蓋ごとに1件。写真のある訪問を優先し、その中で新しいもの。
   *
   * ログインしていないときは取らない。/api/visits はログアウト中だと全員の公開訪問を返すので、
   * 以前は他人の訪問日が「訪問 〇〇」と出ていた。
   * 件数は全件（以前「近く」は既定の100件で切れ、それより古い訪問の蓋が未訪問扱いになっていた）。
   */
  const loadOwnVisits = () => {
    ownVisitsRef.current ??= (async () => {
      const byManholeId = new Map<number, OwnVisit>();
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return byManholeId;

        const response = await fetch('/api/visits?limit=10000');
        if (!response.ok) return byManholeId;
        const data = await response.json();
        if (!data.success || !Array.isArray(data.visits)) return byManholeId;

        data.visits.forEach((visit: any) => {
          if (!visit.manhole_id) return;
          const existing = byManholeId.get(visit.manhole_id);
          const hasPhoto = (visit.photos?.length ?? 0) > 0;
          const existingHasPhoto = (existing?.photos?.length ?? 0) > 0;
          if (
            !existing ||
            (hasPhoto && !existingHasPhoto) ||
            (hasPhoto === existingHasPhoto && new Date(visit.shot_at) > new Date(existing.shot_at))
          ) {
            byManholeId.set(visit.manhole_id, visit);
          }
        });
      } catch (error) {
        console.error('Failed to load own visits:', error);
      }
      return byManholeId;
    })();
    return ownVisitsRef.current;
  };

  /**
   * 自分の写真が無い蓋に、公開写真から代表1枚を付ける。失敗した分はプレースホルダーのまま出す。
   * 「一覧」は全件（約500）なので API の上限（100件）ごとに分けて取る。
   */
  const attachCoverPhotos = async (manholes: ManholeWithDistance[]) => {
    const ids = manholes.filter((m) => !m.visit?.photos?.length).map((m) => m.id);
    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += COVER_PHOTO_CHUNK) {
      chunks.push(ids.slice(i, i + COVER_PHOTO_CHUNK));
    }
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        try {
          const response = await fetch(`/api/manholes/cover-photos?ids=${chunk.join(',')}`);
          if (!response.ok) return {};
          const data = await response.json();
          return (data.photos ?? {}) as Record<string, CoverPhoto>;
        } catch (error) {
          console.error('Failed to load cover photos:', error);
          return {};
        }
      })
    );
    const photos: Record<string, CoverPhoto> = Object.assign({}, ...results);
    return manholes.map((m) => (photos[m.id] ? { ...m, cover_photo: photos[m.id] } : m));
  };

  useEffect(() => {
    document.title = pageTitle('ポケふたを探す');
    trackNearbyOpen();

    const tab = new URLSearchParams(window.location.search).get('tab');
    const initialTab: SearchTab = tab === 'all' ? 'all' : 'nearby';
    setActiveTab(initialTab);
    loadAllManholes();

    (async () => {
      let loggedIn = false;
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        loggedIn = Boolean(session?.user);
        setIsLoggedIn(loggedIn);
      } catch {
        setIsLoggedIn(false);
      } finally {
        setSessionChecked(true);
      }

      if (initialTab === 'all') {
        setLoading(false);
        return;
      }

      if (tab === 'unvisited' && loggedIn) setUnvisitedOnly(true);

      getCurrentLocationAndLoadManholes();
    })();
  }, []);

  // 設定で位置情報を許可し直したら、ページを開き直さなくても探し直す（Permissions API が無い端末は「もう一度試す」で）
  useEffect(() => {
    if (!locationFailure || typeof navigator === 'undefined' || !navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === 'granted') getCurrentLocationAndLoadManholes();
    };
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((result) => {
        if (cancelled) return;
        status = result;
        result.addEventListener('change', onChange);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [locationFailure]);

  useEffect(() => {
    if (sessionChecked && !isLoggedIn && unvisitedOnly) {
      setUnvisitedOnly(false);
    }
  }, [unvisitedOnly, isLoggedIn, sessionChecked]);

  useEffect(() => {
    if (!sessionChecked || activeTab === 'all') return;
    if (!userLocation) return;
    if (geolocationPendingRef.current) return;
    loadNearbyManholes(userLocation.lat, userLocation.lng);
  }, [radius]);

  const loadAllManholes = async () => {
    try {
      setAllLoading(true);
      const manholesData = await fetchAllManholes();
      if (!manholesData) {
        console.error('Failed to load all manholes');
        setAllLoading(false);
        return;
      }

      const manholes = manholesData.manholes;

      const visitsByManholeId = await loadOwnVisits();

      const manholesWithVisits = await attachCoverPhotos(
        manholes.map((manhole: any) => ({
          ...manhole,
          distance: undefined, // Don't show distance for "all" tab
          visit: visitsByManholeId.get(manhole.id)
        }))
      );

      setAllManholes(manholesWithVisits);
    } catch (error) {
      console.error('Failed to load all manholes:', error);
    } finally {
      setAllLoading(false);
    }
  };

  const getCurrentLocationAndLoadManholes = () => {
    if (navigator.geolocation) {
      setLoading(true);
      setResultsFromDevice(false);
      // 現在地の取得を待つ間に、それまでに出した読み込みの応答が届いても捨てる
      nearbyLoadSeqRef.current += 1;
      const geolocationSeq = ++geolocationSeqRef.current;
      const isStaleGeolocation = () => geolocationSeq !== geolocationSeqRef.current;
      geolocationPendingRef.current = true;
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (isStaleGeolocation()) return;
          window.clearTimeout(geolocationDeadlineRef.current);
          geolocationPendingRef.current = false;
          setLocationFailure(null);
          // 締め切り（GEOLOCATION_DEADLINE_MS）の後に届いたときは failLocation が「検索中」を消しているので、付け直す
          setLoading(true);
          trackGeolocationEnable();
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          locationFromDeviceRef.current = true;
          setUserLocation(location);
          loadNearbyManholes(location.lat, location.lng);
        },
        (error) => {
          if (isStaleGeolocation()) return;
          window.clearTimeout(geolocationDeadlineRef.current);
          geolocationPendingRef.current = false;
          console.error('Location unavailable:', error);
          failLocation(LOCATION_FAILURE_CODES[error.code] ?? 'unavailable');
        },
        // 既定は timeout が無限で、端末の位置情報サービスが応答しないと「検索中」のまま終わらなかった
        { timeout: 15000, maximumAge: 60000 }
      );
      // timeout は許可の確認を待つ時間を含まない。確認に答えないままだと「検索中」が終わらないので、
      // こちらでも締め切りを置いて新しい順の一覧を出す。後から許可されて位置が届いたら、そのまま近くを探す
      // （failLocation は geolocationSeq を進めないので、届いた応答は捨てない。#330 の Copilot レビュー）
      window.clearTimeout(geolocationDeadlineRef.current);
      geolocationDeadlineRef.current = window.setTimeout(() => {
        if (!isStaleGeolocation() && geolocationPendingRef.current) failLocation('timeout');
      }, GEOLOCATION_DEADLINE_MS);
    } else {
      failLocation('unsupported');
    }
  };

  /** 現在地が取れなかった。前の結果（別の場所のもの）を消し、新しい順の一覧に替える */
  const failLocation = (failure: LocationFailure) => {
    nearbyLoadSeqRef.current += 1;
    locationFromDeviceRef.current = false;
    setLocationFailure(failure);
    setUserLocation(null);
    setNearbyManholes([]);
    setResultsFromDevice(false);
    setLoading(false);
    loadRecentManholes();
  };

  /**
   * 最近写真が投稿された蓋（新しい順）。トップの「最新の投稿」と同じ取り方で、全員の公開訪問を読む
   * （credentials: 'omit'。ログイン中にクッキーを送ると自分の訪問だけが返る）。
   * 蓋の中身（自分の訪問・代表写真）は「一覧」タブ用に読み込み済みの allManholes から引く
   */
  const loadRecentManholes = async () => {
    if (recentRequestedRef.current) return;
    recentRequestedRef.current = true;
    try {
      // limit は訪問の数で、蓋の数ではない。同じ蓋への訪問が続くと蓋が足りないので、集まるまで次のページも読む（最大3ページ）
      const ids: number[] = [];
      for (let page = 0; page < 3 && ids.length < RECENT_DISPLAY_LIMIT; page += 1) {
        const response = await fetch(`/api/visits?with_photos=true&limit=100&offset=${page * 100}&order_by=created_at`, { credentials: 'omit' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        const visits = Array.isArray(data?.visits) ? data.visits : [];
        for (const visit of visits) {
          const id = visit?.manhole_id;
          if (typeof id === 'number' && !ids.includes(id)) ids.push(id);
        }
        if (visits.length < 100) break;
      }
      setRecentManholeIds(ids.slice(0, RECENT_DISPLAY_LIMIT));
    } catch (error) {
      console.error('Failed to load recent manholes:', error);
      recentRequestedRef.current = false;
      setRecentManholeIds([]);
    }
  };

  const loadNearbyManholes = async (lat: number, lng: number) => {
    // 呼んだ時点の出どころを持っておく（読み込み中に現在地が変わっても取り違えない）
    const fromDevice = locationFromDeviceRef.current;
    const seq = ++nearbyLoadSeqRef.current;
    // 範囲は呼んだ時点の最新を読む。現在地の取得を待つ間に範囲を変えると、
    // 位置情報のコールバックは古い描画のこの関数を持っていて古い radius で探していた（#322 の Codex レビュー）
    const radius = radiusRef.current;
    const isStale = () => seq !== nearbyLoadSeqRef.current;
    setResultsFromDevice(false);
    try {
      setDataError(null);
      console.log(`Loading manholes near ${lat}, ${lng} with radius ${radius}km`);

      const manholesResponse = await fetch(`/api/manholes?lat=${lat}&lng=${lng}&radius=${radius}&limit=100`);

      if (!manholesResponse.ok) {
        const errorText = await manholesResponse.text();
        console.error('Failed to load nearby manholes:', errorText);
        if (isStale()) return;
        setDataError(`マンホールデータの取得に失敗しました: ${manholesResponse.status}`);
        setLoading(false);
        return;
      }

      const manholesData = await manholesResponse.json();
      console.log('Manholes response:', manholesData);

      const allNearbyManholes = manholesData.manholes || [];
      console.log(`Loaded ${allNearbyManholes.length} nearby manholes`);

      if (!Array.isArray(allNearbyManholes)) {
        console.error('Invalid response format:', manholesData);
        if (isStale()) return;
        setDataError('マンホールデータの形式が不正です');
        setLoading(false);
        return;
      }

      const visitsByManholeId = await loadOwnVisits();

      const manholesWithVisits = await attachCoverPhotos(
        allNearbyManholes
          .slice(0, NEARBY_DISPLAY_LIMIT)
          .map((manhole: any) => ({
            ...manhole,
            visit: visitsByManholeId.get(manhole.id)
          }))
      );

      if (isStale()) return;
      console.log(`Setting ${manholesWithVisits.length} manholes with visit info`);
      setNearbyManholes(manholesWithVisits);
      setResultsFromDevice(fromDevice);
      const previousRadius = loadedRadiusRef.current;
      loadedRadiusRef.current = radius;
      if (previousRadius !== null && previousRadius !== radius) {
        trackNearbyRadiusChange({
          radius_km: radius,
          result_count: manholesWithVisits.length,
          surface: 'nearby_radius_slider',
        });
      }
    } catch (error) {
      console.error('Failed to load nearby manholes:', error);
      if (isStale()) return;
      setDataError(`データの読み込みに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    } finally {
      // 古い読み込みが終わっても、新しい読み込みの「検索中」は消さない
      if (!isStale()) setLoading(false);
    }
  };

  const formatDistance = (distance: number | undefined): string => {
    if (distance === undefined || isNaN(distance)) {
      return '-';
    }
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 経路案内は詳細ページの「経路案内」（緑の全幅ボタン）に一本化した。
  // 一覧の全カードに経路ボタンを置くのをやめ、タイル全体を詳細への導線にしている。

  const handleTabChange = (tab: SearchTab) => {
    setActiveTab(tab);
    if (tab === 'nearby' && !userLocation && nearbyManholes.length === 0 && !locationFailure) {
      getCurrentLocationAndLoadManholes();
    }
  };

  const visibleSearchTabs = searchTabs;
  const isUnvisited = (m: ManholeWithDistance) => !m.visit && !m.is_visited;

  const filteredAllManholes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return allManholes;

    return allManholes.filter((manhole) => {
      const target = [
        manhole.title,
        manhole.prefecture,
        manhole.municipality,
        manhole.city,
        ...(manhole.pokemons || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return target.includes(normalized);
    });
  }, [allManholes, query]);

  const NUM = '"Outfit", system-ui, sans-serif';
  const ROUND = '"M PLUS Rounded 1c", system-ui, sans-serif';

  /*
    実際に一覧へ並ぶ配列。以前はここと一覧側の IIFE に別々の定義があり、
    「未訪問」タブでレールの《発見》だけが絞り込み前の件数を出していた
    （一覧は0件なのにレールは7と表示される）。数える対象は1か所に持つ。
  */
  // 位置情報が取れないときの「近く」「未訪問」は、最近写真が投稿された蓋（新しい順）
  const recentManholes = useMemo(() => {
    if (!recentManholeIds) return [];
    const byId = new Map(allManholes.map((m) => [m.id, m]));
    return recentManholeIds.map((id) => byId.get(id)).filter((m): m is ManholeWithDistance => Boolean(m));
  }, [recentManholeIds, allManholes]);
  const showingRecent = Boolean(locationFailure) && activeTab !== 'all';
  const recentLoading = showingRecent && (allLoading || recentManholeIds === null);

  const displayManholes =
    showingRecent
      ? unvisitedOnly ? recentManholes.filter(isUnvisited) : recentManholes
      : activeTab === 'all' ? filteredAllManholes :
    // 訪問済みかは /api/manholes の is_visited（サーバが自分の訪問を全件見て付ける）でも判定する
    unvisitedOnly ? nearbyManholes.filter(isUnvisited) :
    nearbyManholes;
  // レールの「最寄り」も並んでいる一覧に合わせる（上と同じ理由）。
  const nearestDistance = displayManholes[0]?.distance;
  // 現在地のだいたいの地域と図鑑リンク。未訪問タブで絞っても地域は変わらないので全件から出す。
  // 端末の現在地で探して読み込みが済んだ結果だけを「いる場所」として扱う（resultsFromDevice 参照）。
  const area = useMemo(
    () => (resultsFromDevice ? nearbyArea(nearbyManholes) : null),
    [resultsFromDevice, nearbyManholes]
  );

  const guestNearbyRail = (
    <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-4 shadow-sm space-y-3">
      <p className="font-bold text-sm text-[#7B63A8]">無料でポケふたスタンプ帳を作れます</p>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs text-[#6B6B6B]">
        <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#B5483C]" />行ったポケふたを記録</span>
        <span className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-[#B5483C]" />写真で思い出を保存</span>
        <span className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 text-[#B5483C]" />都道府県の達成状況</span>
        <span className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-[#B5483C]" />近くの未訪問を探せる</span>
      </div>
      <Link
        href="/login"
        className="flex items-center justify-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-3 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
      >
        <Stamp className="h-4 w-4" />
        スタンプ帳をはじめる
      </Link>
      <Link
        href="/nearby"
        className="flex items-center justify-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white px-4 py-2 text-sm font-bold text-[#7B63A8]"
      >
        <MapPin className="h-4 w-4" />
        近くのポケふたを見る
      </Link>
      <p className="text-right text-[11px] text-[#9B9B9B]">地図で探す → data.pokefuta.com</p>
    </div>
  );

  /*
    セッション判定が付くまではゲスト扱いにする（isLoggedIn の初期値が false）。
    判定待ちに undefined を返すと PCShell が1カラムで描いてから2カラムに
    切り替わり、横にもズレる。初回訪問者は実際に未ログインなので、
    ゲスト表示を初期状態にするのが当たっている場合が多い。
  */
  // ログイン時はレールを出さない（以前の「近くのポケふた」の数字の枠と「写真を投稿する」は、
  // 数字が上の検索パネルと、投稿が右下の固定ボタンと重複していた）
  const nearbyRail = isLoggedIn ? undefined : guestNearbyRail;

  return (
    <div className="min-h-content safe-area-body pb-nav-safe bg-[#efe6cf] text-[#2A2A2A]">

      <PCShell className="pb-32 pt-3 lg:pt-6" rail={nearbyRail}>
      <main className="relative px-0 lg:px-0">
        {/*
          判定待ちを「ログイン済み扱い」にすると、未ログインの全アクセスで
          コンパクト見出し → 背の高いゲストヒーロー と入れ替わり、タブと一覧が
          下にずれる。ゲスト側を初期状態にして、判定が付いたときだけ縮める。
        */}
        <section
          className={
            !isLoggedIn
              ? 'relative overflow-hidden rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-4 shadow-sm sm:px-10 sm:py-10'
              : 'relative'
          }
        >
          <div className="relative max-w-3xl">
            {!isLoggedIn ? (
              <>
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#FFB347]/50 bg-[#FFB347]/20 px-2.5 py-1 text-[11px] font-bold text-[#7B63A8] sm:mb-4 sm:px-3 sm:text-xs">
                  <Stamp className="h-3 w-3" />
                  ポケふたスタンプ帳
                </div>
                {/*
                  max-w-2xl（=588px。ルートの font-size が 14px なので 2xl は 588px）は
                  親の 604px より狭く、収まる幅を自分で削っていた。加えて句で切らないと
                  「…スタンプ／帳に。」と語の途中で割れる。
                */}
                <h1 className="text-2xl font-extrabold leading-tight tracking-normal sm:text-4xl">
                  <PhraseText text="ポケふた巡りを、あなただけのスタンプ帳に。" />
                </h1>
                <p className="mt-2 text-sm font-medium leading-relaxed text-[#4A4A4A] sm:mt-3 sm:text-base">
                  <PhraseText text="旅先で見つけたポケふたを写真と一緒に記録。訪問済みの場所やみんなの投稿写真を見ながら、ポケふた巡りを楽しく残しましょう。" />
                </p>
                <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 rounded-lg bg-[#7B63A8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
                  >
                    <Stamp className="h-4 w-4" />
                    スタンプ帳をはじめる
                  </Link>
                  <Link
                    href="/nearby"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#7B63A8]/30 bg-white/80 px-4 py-2.5 text-sm font-bold text-[#7B63A8] shadow-sm transition hover:bg-white"
                  >
                    <MapPin className="h-4 w-4" />
                    近くのポケふたを見る
                  </Link>
                </div>
              </>
            ) : (
              /*
                ログイン済みは検索が目的なので、デザインふた一覧と同じ
                「見出し1行＋補足1行」に留める。大きなヒーローは未ログインの
                勧誘用（下の分岐）だけに残す。
              */
              <>
                <h1 className="text-lg font-bold sm:text-xl">ポケふたを探す</h1>
                <p className="mt-1 text-sm text-[#2A2A2A]/70">
                  <PhraseText text="現在地の近くから、全国一覧まで。次に会いに行くポケふたをここで見つけよう。" />
                </p>
              </>
            )}
          </div>
        </section>

        {/* ヒーロー直下なので、上と同じくゲスト側を初期状態にする */}
        {!isLoggedIn && (
          <div className="mt-4 lg:hidden rounded-[8px] border border-[#7B63A8]/10 bg-white/70 px-4 py-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="font-bold text-sm text-[#7B63A8]">無料でポケふたスタンプ帳を作れます</p>
              <Link
                href="/login"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-[#7B63A8] px-3 py-2 text-xs font-bold text-white shadow-[0_2px_0_#5f55b8] transition hover:bg-[#6A5299]"
              >
                <Stamp className="h-3 w-3" />
                無料ではじめる
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[#6B6B6B]">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[#B5483C]" />行ったポケふたを記録</span>
              <span className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5 text-[#B5483C]" />写真で思い出を保存</span>
              <span className="flex items-center gap-1.5"><Navigation className="h-3.5 w-3.5 text-[#B5483C]" />都道府県の達成状況</span>
              <span className="flex items-center gap-1.5"><Search className="h-3.5 w-3.5 text-[#B5483C]" />近くの未訪問を探せる</span>
            </div>
            <p className="text-right text-[11px] text-[#9B9B9B]">地図で探す → data.pokefuta.com</p>
          </div>
        )}

        {locationFailure && activeTab !== 'all' && (
          <LocationHelp failure={locationFailure} onRetry={getCurrentLocationAndLoadManholes} />
        )}

        {dataError && (
          <div className="mt-4 rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
            <p className="text-sm font-bold text-red-700">{dataError}</p>
          </div>
        )}

        {/*
          「一覧」タブでは出さない。半径も最寄りも近傍検索の話なので、全国一覧の
          横に並べると《発見 482 / 範囲 30km》のように矛盾した組になる
          （一覧タブの件数は下の検索パネルの「総数 / 表示中」が持つ）。
        */}
        {userLocation && activeTab !== 'all' && (
          <section id="nearby-controls" className="mt-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3 shadow-sm sm:mt-5 sm:p-4">
            {/* ログイン時は「未訪問」の数も並べる（範囲内の近くの蓋のうち、行っていないもの） */}
            <div
              className={`grid gap-px overflow-hidden rounded-[10px] border border-[#e9dfc7] ${isLoggedIn ? 'grid-cols-4' : 'grid-cols-3'}`}
            >
              {([
                ['発見', displayManholes.length, '#2c2a26'],
                ...(isLoggedIn ? [['未訪問', nearbyManholes.filter(isUnvisited).length, '#bf5640']] : []),
                ['範囲', `${radius}km`, '#6f6657'],
                /*
                  最寄りも並んでいる一覧に合わせる。nearbyManholes[0] だと
                  「未訪問だけ」のとき、一覧に出ていない訪問済みの蓋までの距離を
                  出してしまう（近傍結果は距離順なので絞り込んでも先頭が最寄り）。
                */
                ['最寄り', displayManholes.length > 0 ? formatDistance(displayManholes[0].distance) : '-', '#6f6657'],
              ] as [string, string | number, string][]).map(([label, value, color]) => (
                <div key={label} className="bg-[#fffdf7] px-2 py-2.5 text-center">
                  <p style={{ fontFamily: ROUND, fontSize: 10, color: '#9b917e', fontWeight: 700 }}>{label}</p>
                  <p style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color }}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 lg:mt-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0" style={{ fontFamily: ROUND, fontSize: 11, fontWeight: 700, color: '#9b917e' }}>
                  <span>検索範囲</span>
                  <span className="ml-2">1km - 100km</span>
                </div>
                <button
                  onClick={getCurrentLocationAndLoadManholes}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#e9dfc7] bg-white px-3 text-xs font-bold text-[#6f6657] shadow-sm transition hover:bg-[#f4ecda] sm:gap-2 sm:px-4 sm:text-sm"
                  title="現在地を更新"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sm:hidden">更新</span>
                  <span className="hidden sm:inline">現在地を更新</span>
                </button>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={radius}
                onChange={(e) => setRadius(parseInt(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full"
                style={{
                  // 進捗の色はマイ旅の達成率バーと同じ（#e2a015 → #bf5640）
                  background: `linear-gradient(to right, #e2a015 0%, #bf5640 ${radius}%, #e9dfc7 ${radius}%, #e9dfc7 100%)`
                }}
              />
            </div>

            {area && area.prefectures.length > 0 && (
              <div className="mt-3 border-t border-[#e9dfc7] pt-3">
                {area.areaLabel && (
                  <p style={{ fontFamily: ROUND, fontSize: 11, fontWeight: 700, color: '#9b917e' }}>
                    いまいるのは だいたい <span className="text-[#2c2a26]">{area.areaLabel}</span> あたり
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {area.prefectures.map((prefecture) => (
                    <a
                      key={prefecture.name}
                      href={prefecture.dexUrl}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] border border-[#e9dfc7] bg-white px-3 text-xs font-bold text-[#6f6657] shadow-sm transition hover:border-[#d7c8a7] hover:bg-[#fbf6ea] hover:text-[#bf5640]"
                      aria-label={`${prefecture.name}のポケふたを図鑑で見る`}
                    >
                      <BookOpen className="h-4 w-4 shrink-0" />
                      {prefecture.name}の図鑑
                      <span aria-hidden="true">›</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="mt-3 sm:mt-5">
          <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4">
            <div className="flex min-w-max gap-1.5 rounded-[12px] border border-[#e9dfc7] bg-[#fffdf7] p-1 shadow-sm sm:min-w-0 sm:gap-2">
              {visibleSearchTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => handleTabChange(tab.key)}
                    className={`min-h-[44px] rounded-[9px] px-4 text-sm font-bold transition sm:px-5 ${
                      isActive
                        ? 'bg-[#e9dfc7] text-[#2c2a26]'
                        : 'text-[#6f6657] hover:bg-[#f4ecda]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
              {/* 未訪問は近くの結果の絞り込み（別タブにしない）。押すたびに切り替わり、押されているかは色と aria-pressed で示す */}
              {activeTab === 'nearby' && isLoggedIn && (
                <button
                  type="button"
                  onClick={() => setUnvisitedOnly((v) => !v)}
                  aria-pressed={unvisitedOnly}
                  className={`ml-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-[9px] border px-3 text-sm font-bold transition sm:px-4 ${
                    unvisitedOnly
                      ? 'border-[#bf5640] bg-[#bf5640] text-white'
                      : 'border-[#e9dfc7] bg-white text-[#bf5640] hover:bg-[#fdeae2]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                      unvisitedOnly ? 'border-white bg-white text-[#bf5640]' : 'border-[#bf5640]'
                    }`}
                  >
                    {unvisitedOnly ? '✓' : ''}
                  </span>
                  未訪問だけ
                </button>
              )}
            </div>
          </div>
        </section>

        {activeTab === 'all' && (
          <section className="mt-3 rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] p-3 shadow-sm sm:mt-5 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9b917e]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="地域名・ポケモン名で検索"
                  className="min-h-[44px] w-full rounded-[10px] border border-[#e9dfc7] bg-white py-2 pl-10 pr-3 text-sm font-bold outline-none focus:border-[#c47e0f]"
                  placeholder="地域名・ポケモン名で検索"
                />
              </label>
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[#e9dfc7] sm:min-w-[15rem]">
                {([
                  ['総数', allManholes.length, '#6f6657'],
                  ['表示中', filteredAllManholes.length, '#2c2a26'],
                ] as [string, number, string][]).map(([label, value, color]) => (
                  <div key={label} className="bg-[#fffdf7] px-2 py-2.5 text-center">
                    <p style={{ fontFamily: ROUND, fontSize: 10, color: '#9b917e', fontWeight: 700 }}>{label}</p>
                    <p style={{ fontFamily: NUM, fontWeight: 800, fontSize: 18, color }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {((activeTab === 'nearby' && (loading || recentLoading)) || (activeTab === 'all' && allLoading)) && (
          <div className="flex items-center justify-center py-7 sm:py-10">
            <div className="text-center">
              <div className="font-bold text-[#6f6657]">
                {activeTab === 'all' ? '全ポケふたを読み込み中' : '検索中'}<span className="rpg-loading"></span>
              </div>
            </div>
          </div>
        )}

        {!((activeTab === 'nearby' && (loading || recentLoading)) || (activeTab === 'all' && allLoading)) && (
          <section className="mt-3 sm:mt-5">
            {showingRecent && displayManholes.length > 0 && (
              <h2 className="mb-2 text-sm font-extrabold text-[#2c2a26]">
                最近写真が投稿されたポケふた<span className="ml-1 text-xs font-bold text-[#9b917e]">新しい順</span>
              </h2>
            )}
            {(() => {
              return displayManholes.length === 0 ? (
                <div className="rounded-[14px] border border-[#e9dfc7] bg-[#fffdf7] px-4 py-7 text-center shadow-sm sm:px-5 sm:py-10">
                  <MapPin className="mx-auto mb-2 h-9 w-9 text-[#c9bda4] sm:mb-3 sm:h-10 sm:w-10" />
                  <p className="text-sm font-bold text-[#2c2a26]">
                    {showingRecent
                      ? unvisitedOnly && recentManholes.length > 0
                        ? '最近写真が投稿されたポケふたは、すべて訪問済みです'
                        : '最近写真が投稿されたポケふたを読み込めませんでした'
                      : activeTab === 'nearby' && unvisitedOnly
                      ? '近くに未訪問のポケふたが見つかりませんでした'
                      : activeTab === 'all'
                      ? 'ポケふたが見つかりませんでした'
                      : '近くにポケふたが見つかりませんでした'}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[#9b917e]">
                    {activeTab === 'nearby' && !showingRecent && '検索範囲を広げてみてください'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {displayManholes.map((manhole) => {
                    // 自分の写真を優先し、無ければ公開写真の代表1枚
                    const photo = manhole.visit?.photos?.[0] ?? manhole.cover_photo;
                    const visitedAt = manhole.visit?.shot_at ?? manhole.last_visit ?? undefined;
                    return (
                      <VisitPhotoCard
                        key={manhole.id}
                        manholeId={manhole.id}
                        // マイ旅と同じく小サイズを使う。原寸（url）は1枚1.5MB級で、
                        // 一覧に数十枚並べると読み込みが終わらない。
                        thumbnailUrl={photo?.thumbnail_url || (photo && 'url' in photo ? photo.url : undefined)}
                        isLandscape={photo?.is_landscape}
                        // 見出しは詳細ページの h1 と同じ（施設名があれば「〈県〉〈市区町村〉 〈施設名〉のポケふた」）。
                        title={manholeHeadingPlace(manhole)}
                        date={`#${manhole.id}`}
                        // 施設名は見出しに入ったので、ここは訪問日だけ。VisitPhotoCard 側で省略記号付きに切り詰まる。
                        posterName={visitedAt ? `訪問 ${formatDate(visitedAt)}` : undefined}
                        tags={(manhole.pokemons || []).slice(0, 2)}
                        // ログイン時は行ったかどうかを全カードに出す（未ログインは自分の訪問が無いので出さない）
                        visitStatus={isLoggedIn ? (isUnvisited(manhole) ? 'unvisited' : 'visited') : undefined}
                        cornerLabel={
                          activeTab !== 'all' && manhole.distance !== undefined
                            ? formatDistance(manhole.distance)
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              );
            })()}
          </section>
        )}
      </main>

      </PCShell>

      <Link
        href={uploadHref}
        // 投稿は唯一の主要CTA なので、ヘッダーの「投稿する」やレールと同じ
        // --chrome-cta（#bf5640）に揃える。紫はナビ／サインアップ用のアクセント。
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] right-3 z-40 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-[#bf5640] px-4 py-3 text-xs font-extrabold text-white shadow-[0_8px_18px_rgba(168,70,47,0.30)] transition hover:bg-[#a8462f] sm:bottom-6 sm:right-6 sm:gap-2 sm:px-5 sm:py-4 sm:text-sm"
      >
        <Camera className="h-4 w-4 sm:h-5 sm:w-5" />
        写真を投稿
      </Link>

    </div>
  );
}

/**
 * 現在地が取れなかったときの案内。理由ごとに直し方を出し、「もう一度試す」を置く。
 * 一度「許可しない」を選ぶと、ブラウザはページから許可を求め直せない（ボタンを押しても即座に失敗する）。
 * なので denied は「設定で許可してから押す」手順を、端末に合わせて具体的に書く。
 */
function LocationHelp({ failure, onRetry }: { failure: LocationFailure; onRetry: () => void }) {
  const [platform, setPlatform] = useState<Platform>('other');
  useEffect(() => setPlatform(detectPlatform()), []);

  const title = {
    denied: '位置情報の使用が許可されていません',
    unavailable: '現在地がわかりませんでした',
    timeout: '現在地の取得に時間がかかっています',
    unsupported: 'このブラウザでは現在地を使えません',
  }[failure];

  const steps: Array<{ label: string; text: string }> = [];
  // other は PC（UA で iPhone・iPad・Android と判定できなかったもの）。PC で拒否したままの人が一番多いので、PC の手順を出す
  if (failure === 'denied') {
    if (platform === 'ios-other') {
      steps.push({ label: 'iPhone', text: '設定アプリ →（アプリ →）お使いのブラウザ（Chrome など）→「位置情報」を「このAppの使用中」に' });
    } else if (platform === 'ios-safari') {
      steps.push({ label: 'iPhone（Safari）', text: 'アドレスバーの「ぁあ」→「Webサイトの設定」→「位置情報」を「許可」。出てこないときは 設定アプリ →（アプリ →）Safari →「位置情報」を「確認」か「許可」に' });
    } else if (platform === 'android') {
      steps.push({ label: 'Android', text: 'アドレスバー左のアイコン →「権限」→「位置情報」を許可' });
    } else {
      steps.push({ label: 'Chrome・Edge', text: 'アドレスバー左のアイコン →「位置情報」を「許可」' });
      steps.push({ label: 'Mac の Safari', text: 'メニューの Safari →「設定」→「Webサイト」→「位置情報」でこのサイトを「許可」' });
    }
  } else if (failure === 'unavailable') {
    if (platform === 'ios-safari' || platform === 'ios-other') {
      steps.push({ label: 'iPhone', text: '設定アプリ →「プライバシーとセキュリティ」→「位置情報サービス」をオン' });
    } else if (platform === 'android') {
      steps.push({ label: 'Android', text: '画面上から下にスワイプして「位置情報」をオン' });
    } else {
      steps.push({ label: 'Mac', text: 'システム設定 →「プライバシーとセキュリティ」→「位置情報サービス」でお使いのブラウザをオン' });
      steps.push({ label: 'Windows', text: '設定 →「プライバシーとセキュリティ」→「位置情報」をオン' });
    }
  }

  return (
    <div className="mt-4 rounded-[14px] border border-[#e2a015]/40 bg-[#fff8e6] px-4 py-3 shadow-sm">
      <p className="flex items-center gap-1.5 text-sm font-extrabold text-[#8a5a00]">
        <MapPin className="h-4 w-4 shrink-0" />
        {title}
      </p>
      {steps.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {steps.map((step) => (
            <li key={step.label} className="text-xs leading-relaxed text-[#5c4a2a]">
              <span className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-[#8a5a00]">{step.label}</span>
              {step.text}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {failure !== 'unsupported' && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[10px] bg-[#bf5640] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#a8462f]"
          >
            <RefreshCw className="h-4 w-4" />
            {failure === 'denied' ? '許可したら、もう一度試す' : 'もう一度試す'}
          </button>
        )}
        <p className="text-xs text-[#6f6657]">それまでは、最近写真が投稿されたポケふたを新しい順に出しています</p>
      </div>
    </div>
  );
}
