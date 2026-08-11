import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/route-handler';
import {
  FRIEND_NOTE_MAX,
  type FriendFieldsStored,
  hasFriendFieldsInput,
  isValidFriendCode,
  normalizeFriendCode,
  resolveFriendFields,
} from '@/lib/pokemon-go-friend-code';

// Keep these limits in sync with database/migrations/025_add_public_user_profiles.sql.
// The API gives users friendly errors; the database constraints remain the final guard.
const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 160;
const URL_MAX = 300;
type ProfileInput = {
  displayName: string;
  bio: string;
  xUrl: string;
  instagramUrl: string;
  pokemonGoFriendCode: string;
  pokemonGoFriendNote: string;
  pokemonGoFriendOpen: boolean;
};

function isProfileInput(value: unknown): value is ProfileInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const strings = ['displayName', 'bio', 'xUrl', 'instagramUrl'].every(
    (key) => typeof input[key] === 'string'
  );
  if (!strings) return false;
  // Pokémon GO の3項目は後から足したもの。古いクライアントが送ってこなくても
  // 保存は落とさない。未指定の扱いは PATCH 側で「変更なし」に寄せる。
  const goStrings = ['pokemonGoFriendCode', 'pokemonGoFriendNote'].every(
    (key) => input[key] === undefined || typeof input[key] === 'string'
  );
  const goOpen =
    input.pokemonGoFriendOpen === undefined || typeof input.pokemonGoFriendOpen === 'boolean';
  return goStrings && goOpen;
}

function isSocialUrl(value: string, hosts: string[]) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && hosts.includes(url.hostname.toLowerCase())
      && url.pathname.split('/').filter(Boolean).length === 1;
  } catch {
    return false;
  }
}

type OwnProfileRow = {
  public_user_id: string | null;
  display_name: string | null;
  bio: string | null;
  x_url: string | null;
  instagram_url: string | null;
  profile_is_customized: boolean;
  pokemon_go_friend_code: string | null;
  pokemon_go_friend_note: string | null;
  pokemon_go_friend_open: boolean | null;
};

export async function GET() {
  const supabase = createRouteHandlerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  const { data, error } = await supabase.rpc('get_own_profile' as never);

  if (error) {
    // RPC未適用(migration 025前)でもカード側が壊れないよう、メタデータの名前だけ返す
    console.warn('Failed to load own profile via get_own_profile RPC:', error);
  }

  const row = ((data as unknown as OwnProfileRow[] | null) || [])[0] ?? null;
  const fallbackName =
    (user.user_metadata?.display_name as string | undefined) ||
    user.email?.split('@')[0] ||
    'トレーナー';

  return NextResponse.json({
    profile: {
      displayName: row?.display_name || fallbackName,
      bio: row?.bio ?? null,
      xUrl: row?.x_url ?? null,
      instagramUrl: row?.instagram_url ?? null,
      publicUserId: row?.public_user_id ?? null,
      pokemonGoFriendCode: row?.pokemon_go_friend_code ?? null,
      pokemonGoFriendNote: row?.pokemon_go_friend_note ?? null,
      pokemonGoFriendOpen: row?.pokemon_go_friend_open ?? false,
    },
  });
}

export async function PATCH(request: Request) {
  const supabase = createRouteHandlerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: '入力内容を読み取れませんでした。' }, { status: 400 });
  }

  if (!isProfileInput(input)) {
    return NextResponse.json({ error: 'プロフィールの全項目を送信してください。' }, { status: 400 });
  }

  const displayName = input.displayName.trim();
  const bio = input.bio.trim();
  const xUrl = input.xUrl.trim();
  const instagramUrl = input.instagramUrl.trim();
  // 3項目が1つも来ていないのは、デプロイ前に開かれたプロフィール画面やキャッシュされた
  // PWA が旧4項目だけを送ってきた場合。既定値で埋めると update_own_public_profile が
  // 保存済みのコード・一言・スイッチを黙って消すので、現在値を読み直して据え置く。
  let stored: FriendFieldsStored | null = null;
  if (!hasFriendFieldsInput(input)) {
    const { data, error: storedError } = await supabase.rpc('get_own_profile' as never);
    if (storedError) {
      console.error('Failed to load current profile for a legacy payload:', storedError);
      return NextResponse.json({ error: 'プロフィールを保存できませんでした。' }, { status: 500 });
    }
    stored = ((data as unknown as OwnProfileRow[] | null) || [])[0] ?? null;
  }
  const go = resolveFriendFields(input, stored);

  const goFriendCode = normalizeFriendCode(go.code);
  const goFriendNote = go.note.trim();
  // コードが無ければ募集は成立しない。DB側でも同じ判断をするが、
  // ここで揃えておかないと「保存したのにスイッチが戻っている」ように見える。
  const goFriendOpen = go.open && goFriendCode !== '';

  if (!displayName || [...displayName].length > DISPLAY_NAME_MAX) {
    return NextResponse.json({ error: `表示名は1〜${DISPLAY_NAME_MAX}文字で入力してください。` }, { status: 400 });
  }
  if ([...bio].length > BIO_MAX) {
    return NextResponse.json({ error: `一言は${BIO_MAX}文字以内で入力してください。` }, { status: 400 });
  }
  if (xUrl.length > URL_MAX || !isSocialUrl(xUrl, ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'])) {
    return NextResponse.json({ error: 'XのプロフィールURLを https://x.com/ユーザー名 の形で入力してください。' }, { status: 400 });
  }
  if (instagramUrl.length > URL_MAX || !isSocialUrl(instagramUrl, ['instagram.com', 'www.instagram.com'])) {
    return NextResponse.json({ error: 'InstagramのプロフィールURLを https://instagram.com/ユーザー名 の形で入力してください。' }, { status: 400 });
  }
  if (!isValidFriendCode(go.code)) {
    return NextResponse.json({ error: 'トレーナーコードは数字12桁で入力してください。' }, { status: 400 });
  }
  if ([...goFriendNote].length > FRIEND_NOTE_MAX) {
    return NextResponse.json({ error: `フレンド募集の一言は${FRIEND_NOTE_MAX}文字以内で入力してください。` }, { status: 400 });
  }

  const { error } = await supabase.rpc('update_own_public_profile', {
    p_display_name: displayName,
    p_bio: bio || null,
    p_x_url: xUrl || null,
    p_instagram_url: instagramUrl || null,
    p_pokemon_go_friend_code: goFriendCode || null,
    p_pokemon_go_friend_note: goFriendNote || null,
    p_pokemon_go_friend_open: goFriendOpen,
  });

  if (error) {
    console.error('Failed to update public profile:', error);
    return NextResponse.json({ error: 'プロフィールを保存できませんでした。' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
