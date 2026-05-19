#!/usr/bin/env python3
"""
ポケふたNDJSONデータからPostgreSQL INSERTステートメントを生成するスクリプト

使い方:
    # 全件出力
    python tools/generate_manhole_sql.py

    # ID 100以下のみ出力
    python tools/generate_manhole_sql.py --max-id 100

    # ID 50から100まで出力
    python tools/generate_manhole_sql.py --min-id 50 --max-id 100

    # ID 200以上のみ出力
    python tools/generate_manhole_sql.py --min-id 200

機能:
    - 公開URLから最新のpokefuta.ndjsonを取得
    - PostgreSQL + PostGIS形式のINSERT文を生成
    - ON CONFLICT DO UPDATE で既存データを更新
    - ポケモン名の配列、位置情報（PostGIS POINT）に対応
    - ID範囲を指定して出力可能
"""

import argparse
import json
import math
import sys
import urllib.request
from datetime import datetime

# 公開NDJSONファイルURL
NDJSON_URL = "https://data.pokefuta.com/pokefuta.ndjson"

# Prefecture code mapping (都道府県コードマッピング)
PREFECTURE_CODE_MAP = {
    '北海道': '01', '青森県': '02', '岩手県': '03', '宮城県': '04',
    '秋田県': '05', '山形県': '06', '福島県': '07', '茨城県': '08',
    '栃木県': '09', '群馬県': '10', '埼玉県': '11', '千葉県': '12',
    '東京都': '13', '神奈川県': '14', '新潟県': '15', '富山県': '16',
    '石川県': '17', '福井県': '18', '山梨県': '19', '長野県': '20',
    '岐阜県': '21', '静岡県': '22', '愛知県': '23', '三重県': '24',
    '滋賀県': '25', '京都府': '26', '大阪府': '27', '兵庫県': '28',
    '奈良県': '29', '和歌山県': '30', '鳥取県': '31', '島根県': '32',
    '岡山県': '33', '広島県': '34', '山口県': '35', '徳島県': '36',
    '香川県': '37', '愛媛県': '38', '高知県': '39', '福岡県': '40',
    '佐賀県': '41', '長崎県': '42', '熊本県': '43', '大分県': '44',
    '宮崎県': '45', '鹿児島県': '46', '沖縄県': '47',
}


def escape_sql_string(s):
    """SQL文字列をエスケープ"""
    if s is None:
        return "NULL"
    # シングルクォートをエスケープ
    return "'" + str(s).replace("'", "''") + "'"


def escape_array(arr):
    """PostgreSQL配列形式にエスケープ"""
    if not arr:
        return "ARRAY[]::TEXT[]"

    # 配列の各要素をエスケープ
    escaped_items = [escape_sql_string(item) for item in arr]
    return "ARRAY[" + ", ".join(escaped_items) + "]"


def escape_jsonb(value):
    """JSONB値をSQLリテラルにエスケープ"""
    if value is None:
        value = []
    return escape_sql_string(json.dumps(value, ensure_ascii=False, separators=(',', ':'))) + "::jsonb"


def first_present(data, keys, default=None):
    """複数候補キーから最初に値が入っているものを返す"""
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return default


def normalize_list(value):
    """配列/カンマ区切り文字列をTEXT[]向け配列に正規化"""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item not in (None, "")]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def normalize_titles(value):
    """titlesフィールドを配列に正規化"""
    return value if isinstance(value, list) else []


def hashtags_from_titles(titles):
    """titles[].hashtag から#付きハッシュタグ配列を生成"""
    hashtags = []
    for title in titles:
        if not isinstance(title, dict):
            continue
        hashtag = title.get("hashtag")
        if isinstance(hashtag, str) and hashtag.strip():
            hashtags.append(hashtag.strip())
    return hashtags


def title_tags_from_titles(titles):
    """titles[].key から称号キー配列を生成"""
    tags = []
    for title in titles:
        if not isinstance(title, dict):
            continue
        key = title.get("key")
        if isinstance(key, str) and key.strip():
            tags.append(key.strip())
    return tags


def is_active_record(data):
    """active/status/is_active の入力ゆれを吸収して有効データか判定"""
    if data.get('active') is False or data.get('is_active') is False:
        return False
    status = str(data.get('status', 'active')).lower()
    return status not in ('inactive', 'removed', 'closed', 'false')


def haversine_km(lat1, lng1, lat2, lng2):
    """2地点間距離をkmで返す"""
    radius = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def title_item(key, label, hashtag, priority, emoji=''):
    """称号オブジェクトを生成"""
    return {
        'key': key,
        'label': label,
        'hashtag': hashtag,
        'emoji': emoji,
        'priority': priority,
    }


def parse_manhole_position(data):
    """称号算出に必要な id/lat/lng を数値化。失敗時は None を返す"""
    if not all(key in data for key in ['id', 'lat', 'lng']):
        return None
    try:
        return int(data['id']), float(data['lat']), float(data['lng'])
    except (TypeError, ValueError):
        return None


def build_nearby_counts(coords, radius_km=30):
    """簡易グリッドで近傍候補を絞り、半径内の他マンホール数を事前計算"""
    if not coords:
        return {}

    cell_size = radius_km / 111.0
    grid = {}
    for coord in coords:
        cell = (math.floor(coord['lat'] / cell_size), math.floor(coord['lng'] / cell_size))
        grid.setdefault(cell, []).append(coord)

    nearby_counts = {}
    for coord in coords:
        cell_lat = math.floor(coord['lat'] / cell_size)
        cell_lng = math.floor(coord['lng'] / cell_size)
        count = 0
        for lat_offset in range(-2, 3):
            for lng_offset in range(-2, 3):
                for other in grid.get((cell_lat + lat_offset, cell_lng + lng_offset), []):
                    if other['id'] == coord['id']:
                        continue
                    if haversine_km(coord['lat'], coord['lng'], other['lat'], other['lng']) <= radius_km:
                        count += 1
        nearby_counts[coord['id']] = count

    return nearby_counts


def build_title_context(records):
    """upstream titles が無い場合の自動称号算出に必要な集計を作る"""
    coords = []
    pref_counts = {}
    city_counts = {}
    pokemon_counts = {}
    newest_added_at = None
    errors = 0

    for _, data in records:
        if not is_active_record(data) or 'prefecture' not in data:
            continue
        position = parse_manhole_position(data)
        if position is None:
            errors += 1
            continue
        manhole_id, lat, lng = position
        prefecture = data.get('prefecture', '')
        city = first_present(data, ['city', 'municipality'], '') or ''
        pokemons = normalize_list(first_present(data, ['pokemons', 'pokemon_names'], []))
        added_at = data.get('added_at')

        coords.append({'id': manhole_id, 'lat': lat, 'lng': lng})
        pref_counts[prefecture] = pref_counts.get(prefecture, 0) + 1
        city_key = (prefecture, city)
        city_counts[city_key] = city_counts.get(city_key, 0) + 1

        for pokemon in pokemons:
            pokemon_counts[pokemon] = pokemon_counts.get(pokemon, 0) + 1

        if added_at and (newest_added_at is None or added_at > newest_added_at):
            newest_added_at = added_at

    def extreme_id(field, reverse):
        if not coords:
            return None
        sorted_coords = sorted(coords, key=lambda item: ((-item[field] if reverse else item[field]), item['id']))
        return sorted_coords[0]['id']

    max_pref_count = max(pref_counts.values()) if pref_counts else 0
    top_prefectures = {pref for pref, count in pref_counts.items() if count == max_pref_count}

    return {
        'coords': coords,
        'pref_counts': pref_counts,
        'city_counts': city_counts,
        'pokemon_counts': pokemon_counts,
        'nearby_counts': build_nearby_counts(coords),
        'north_id': extreme_id('lat', True),
        'south_id': extreme_id('lat', False),
        'east_id': extreme_id('lng', True),
        'west_id': extreme_id('lng', False),
        'newest_added_at': newest_added_at,
        'max_pref_count': max_pref_count,
        'top_prefectures': top_prefectures,
        'errors': errors,
    }


def compute_auto_titles(data, ctx):
    """upstream titles が未提供の場合に自動称号を算出"""
    if 'prefecture' not in data:
        return []

    position = parse_manhole_position(data)
    if position is None:
        return []
    manhole_id, _, _ = position
    prefecture = data.get('prefecture', '')
    city = first_present(data, ['city', 'municipality'], '') or ''
    pokemons = normalize_list(first_present(data, ['pokemons', 'pokemon_names'], []))
    titles = []

    if manhole_id == ctx.get('north_id'):
        titles.append(title_item('north_end', '日本最北のポケふた', '#日本最北のポケふた', 100))
    if manhole_id == ctx.get('south_id'):
        titles.append(title_item('south_end', '日本最南のポケふた', '#日本最南のポケふた', 100))
    if manhole_id == ctx.get('east_id'):
        titles.append(title_item('east_end', '日本最東のポケふた', '#日本最東のポケふた', 100))
    if manhole_id == ctx.get('west_id'):
        titles.append(title_item('west_end', '日本最西のポケふた', '#日本最西のポケふた', 100))

    pokemon_counts = [ctx['pokemon_counts'].get(pokemon, 0) for pokemon in pokemons]
    if pokemon_counts and min(pokemon_counts) == 1:
        titles.append(title_item('unique_pokemon', 'このポケモンは全国でここだけ', '#激レアポケふた', 90, '⭐'))
    elif pokemon_counts:
        rare_count = min(pokemon_counts)
        if rare_count <= 3:
            titles.append(title_item('rare_pokemon', f'レアポケふた（全国{rare_count}枚）', '#レアポケふた', 70))

    if ctx['pref_counts'].get(prefecture, 0) == 1:
        titles.append(title_item('only_in_pref', f'{prefecture}で唯一のポケふた', f'#{prefecture}唯一のポケふた', 80))

    if ctx['nearby_counts'].get(manhole_id, 0) == 0:
        titles.append(title_item('lone', 'ぽつんと一枚', '#秘境ポケふた', 65))

    if ctx['city_counts'].get((prefecture, city), 0) == 1 and ctx['pref_counts'].get(prefecture, 0) != 1:
        titles.append(title_item('only_in_city', f'{city}で唯一のポケふた', '#ご当地ポケふた', 60))

    if prefecture in ctx['top_prefectures'] and ctx['max_pref_count'] > 0:
        titles.append(title_item('pref_top', f'{prefecture}は設置数日本一（{ctx["max_pref_count"]}枚）', '#ポケふた聖地', 55))

    if data.get('added_at') and data.get('added_at') == ctx.get('newest_added_at'):
        titles.append(title_item('newest', '最新設置ロット', '#新作ポケふた', 50))

    if manhole_id <= 30:
        titles.append(title_item('pioneer', '初期ポケふた', '#元祖ポケふた', 45))

    return sorted(titles, key=lambda title: (-title['priority'], title['key']))


def generate_sql_from_ndjson(ndjson_url=NDJSON_URL, min_id=None, max_id=None, update_only=False):
    """NDJSONからSQL INSERT文を生成

    Args:
        ndjson_url: NDJSONファイルのURL
        min_id: 最小ID（この値以上のIDを出力）
        max_id: 最大ID（この値以下のIDを出力）
        update_only: 既存行更新用のUPDATE文だけを出力
    """

    print(f"-- ポケふたマンホールデータ SQL生成スクリプト", file=sys.stderr)
    print(f"-- 生成日時: {datetime.now().isoformat()}", file=sys.stderr)
    print(f"-- データソース: {ndjson_url}", file=sys.stderr)

    if min_id is not None or max_id is not None:
        filter_msg = "-- フィルタ: "
        if min_id is not None and max_id is not None:
            filter_msg += f"ID {min_id} ~ {max_id}"
        elif min_id is not None:
            filter_msg += f"ID {min_id}以上"
        elif max_id is not None:
            filter_msg += f"ID {max_id}以下"
        print(filter_msg, file=sys.stderr)

    print("", file=sys.stderr)

    # 公開URLからNDJSONを取得
    try:
        print(f"データを取得中... {ndjson_url}", file=sys.stderr)
        with urllib.request.urlopen(ndjson_url) as response:
            ndjson_content = response.read().decode('utf-8')
    except Exception as e:
        print(f"エラー: データの取得に失敗しました: {e}", file=sys.stderr)
        sys.exit(1)

    # SQL生成
    print("-- ==========================================")
    print("-- ポケふたマンホールデータ UPDATE文" if update_only else "-- ポケふたマンホールデータ INSERT文")
    print(f"-- 生成日時: {datetime.now().isoformat()}")
    print(f"-- データソース: {ndjson_url}")
    print("-- ==========================================")
    print("")

    if not update_only:
        print("-- テーブルが存在しない場合は作成")
        print("CREATE TABLE IF NOT EXISTS public.manhole (")
        print("  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,")
        print("  title TEXT,")
        print("  prefecture TEXT,")
        print("  prefecture_id INTEGER,")
        print("  prefecture_code VARCHAR(2),")
        print("  municipality TEXT,")
        print("  address TEXT,")
        print("  address_norm TEXT,")
        print("  building TEXT,")
        print("  region TEXT,")
        print("  location GEOGRAPHY,")
        print("  pokemons TEXT[],")
        print("  detail_url TEXT,")
        print("  prefecture_site_url TEXT,")
        print("  official_url TEXT,")
        print("  titles JSONB NOT NULL DEFAULT '[]'::jsonb,")
        print("  hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],")
        print("  title_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],")
        print("  is_active BOOLEAN DEFAULT true,")
        print("  last_verified_at TIMESTAMPTZ DEFAULT NOW(),")
        print("  data_source TEXT,")
        print("  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
        print(");")
        print("")

    print("-- 既存テーブル向けの拡張カラム追加")
    print("ALTER TABLE IF EXISTS public.manhole")
    print("ADD COLUMN IF NOT EXISTS address_norm TEXT,")
    print("ADD COLUMN IF NOT EXISTS building TEXT,")
    print("ADD COLUMN IF NOT EXISTS official_url TEXT,")
    print("ADD COLUMN IF NOT EXISTS titles JSONB NOT NULL DEFAULT '[]'::jsonb,")
    print("ADD COLUMN IF NOT EXISTS hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],")
    print("ADD COLUMN IF NOT EXISTS title_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];")
    print("")
    if not update_only:
        print("-- インデックス作成")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_location_gist ON public.manhole USING GIST(location);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_id ON public.manhole(prefecture_id);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_code ON public.manhole(prefecture_code);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_address ON public.manhole(address);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_titles_gin ON public.manhole USING GIN(titles);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_title_tags_gin ON public.manhole USING GIN(title_tags);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_official_url ON public.manhole(official_url);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_is_active ON public.manhole(is_active);")
        print("CREATE INDEX IF NOT EXISTS idx_manhole_prefecture_active ON public.manhole(prefecture_id, is_active);")
        print("")
    else:
        print("")
        print("BEGIN;")
        print("")

    records = []
    parse_errors = 0

    for line_num, line in enumerate(ndjson_content.strip().split('\n'), 1):
        if not line.strip():
            continue

        try:
            data = json.loads(line)
            records.append((line_num, data))
        except json.JSONDecodeError as e:
            print(f"-- エラー: 行 {line_num} - JSON解析失敗: {e}", file=sys.stderr)
            parse_errors += 1

    title_context = build_title_context(records)
    count = 0
    errors = parse_errors + title_context.get('errors', 0)

    for line_num, data in records:
        try:

            # 必須フィールドのチェック
            if 'id' not in data:
                print(f"-- 警告: 行 {line_num} - 必須フィールドが不足しています", file=sys.stderr)
                errors += 1
                continue

            # データ抽出
            manhole_id = int(data['id'])

            # ID範囲フィルタ
            if min_id is not None and manhole_id < min_id:
                continue
            if max_id is not None and manhole_id > max_id:
                continue

            is_active = is_active_record(data)

            if not is_active:
                sql = f"""UPDATE public.manhole
SET is_active = false,
    last_verified_at = NOW()
WHERE id = {manhole_id};
"""
                print(sql)
                count += 1
                continue

            if not all(key in data for key in ['lat', 'lng', 'prefecture']):
                print(f"-- 警告: 行 {line_num} - active行の必須フィールドが不足しています", file=sys.stderr)
                errors += 1
                continue

            title = first_present(data, ['title', 'name'], '')
            prefecture = data.get('prefecture', '')
            prefecture_code = PREFECTURE_CODE_MAP.get(prefecture, None)
            municipality = first_present(data, ['city', 'municipality'], None)
            address = data.get('address', None)
            address_norm = data.get('address_norm', None)
            building = data.get('building', None)
            lat = float(data['lat'])
            lng = float(data['lng'])
            pokemons = normalize_list(first_present(data, ['pokemons', 'pokemon_names'], []))
            detail_url = first_present(data, ['detail_url', 'source_url'], None)
            prefecture_site_url = data.get('prefecture_site_url', None)
            official_url = first_present(
                data,
                ['official_url', 'city_official_url', 'prefecture_site_url', 'detail_url'],
                None
            )
            titles = normalize_titles(data.get('titles')) or compute_auto_titles(data, title_context)
            hashtags = hashtags_from_titles(titles)
            title_tags = title_tags_from_titles(titles)

            # PostGIS POINT形式: POINT(経度 緯度)
            location = f"POINT({lng} {lat})"

            if update_only:
                sql = f"""UPDATE public.manhole
SET
  title = {escape_sql_string(title)},
  prefecture = {escape_sql_string(prefecture)},
  prefecture_code = {escape_sql_string(prefecture_code)},
  municipality = {escape_sql_string(municipality)},
  address = {escape_sql_string(address)},
  address_norm = {escape_sql_string(address_norm)},
  building = {escape_sql_string(building)},
  location = ST_GeogFromText('SRID=4326;{location}'),
  pokemons = {escape_array(pokemons)},
  detail_url = {escape_sql_string(detail_url)},
  prefecture_site_url = {escape_sql_string(prefecture_site_url)},
  official_url = {escape_sql_string(official_url)},
  titles = {escape_jsonb(titles)},
  hashtags = {escape_array(hashtags)},
  title_tags = {escape_array(title_tags)},
  is_active = true,
  last_verified_at = NOW()
WHERE id = {manhole_id};
"""
            else:
                # INSERT文生成（ON CONFLICT DO UPDATE）
                sql = f"""INSERT INTO public.manhole (id, title, prefecture, prefecture_code, municipality, address, address_norm, building, location, pokemons, detail_url, prefecture_site_url, official_url, titles, hashtags, title_tags, is_active, last_verified_at)
VALUES (
  {manhole_id},
  {escape_sql_string(title)},
  {escape_sql_string(prefecture)},
  {escape_sql_string(prefecture_code)},
  {escape_sql_string(municipality)},
  {escape_sql_string(address)},
  {escape_sql_string(address_norm)},
  {escape_sql_string(building)},
  ST_GeogFromText('SRID=4326;{location}'),
  {escape_array(pokemons)},
  {escape_sql_string(detail_url)},
  {escape_sql_string(prefecture_site_url)},
  {escape_sql_string(official_url)},
  {escape_jsonb(titles)},
  {escape_array(hashtags)},
  {escape_array(title_tags)},
  true,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  prefecture = EXCLUDED.prefecture,
  prefecture_code = EXCLUDED.prefecture_code,
  municipality = EXCLUDED.municipality,
  address = EXCLUDED.address,
  address_norm = EXCLUDED.address_norm,
  building = EXCLUDED.building,
  location = EXCLUDED.location,
  pokemons = EXCLUDED.pokemons,
  detail_url = EXCLUDED.detail_url,
  prefecture_site_url = EXCLUDED.prefecture_site_url,
  official_url = EXCLUDED.official_url,
  titles = EXCLUDED.titles,
  hashtags = EXCLUDED.hashtags,
  title_tags = EXCLUDED.title_tags,
  is_active = true,
  last_verified_at = NOW();
"""
            print(sql)
            count += 1

        except Exception as e:
            print(f"-- エラー: 行 {line_num} - {e}", file=sys.stderr)
            errors += 1

    if update_only:
        print("COMMIT;")
        print("")

    # サマリー
    print("", file=sys.stderr)
    print(f"完了: {count}件のマンホールデータを処理しました", file=sys.stderr)
    if errors > 0:
        print(f"警告: {errors}件のエラーがありました", file=sys.stderr)


def main():
    """メイン関数：コマンドライン引数を解析してSQL生成を実行"""
    parser = argparse.ArgumentParser(
        description='ポケふたNDJSONデータからPostgreSQL INSERT/UPDATEステートメントを生成',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "使用例:\n"
            "  # 全件出力\n"
            "  python tools/generate_manhole_sql.py > manhole_data.sql\n\n"
            "  # ID 100以下のみ出力\n"
            "  python tools/generate_manhole_sql.py --max-id 100 > manhole_data.sql\n\n"
            "  # ID 50から100まで出力\n"
            "  python tools/generate_manhole_sql.py --min-id 50 --max-id 100 > manhole_data.sql\n\n"
            "  # ID 200以上のみ出力（新規追加分のみ）\n"
            "  python tools/generate_manhole_sql.py --min-id 200 > new_manholes.sql\n\n"
            "  # 既存DBの手動更新用UPDATE文だけを出力\n"
            "  python tools/generate_manhole_sql.py --update-only 2>/dev/null > manhole_titles_update.sql"
        )
    )

    parser.add_argument(
        '--min-id',
        type=int,
        metavar='ID',
        help='最小ID（この値以上のIDを出力）'
    )

    parser.add_argument(
        '--max-id',
        type=int,
        metavar='ID',
        help='最大ID（この値以下のIDを出力）'
    )

    parser.add_argument(
        '--url',
        default=NDJSON_URL,
        metavar='URL',
        help=f'NDJSONファイルのURL（デフォルト: {NDJSON_URL}）'
    )

    parser.add_argument(
        '--update-only',
        action='store_true',
        help='既存行更新用のUPDATE文だけを出力する（INSERT/UPSERTは出力しない）'
    )

    args = parser.parse_args()

    # バリデーション
    if args.min_id is not None and args.max_id is not None:
        if args.min_id > args.max_id:
            print("エラー: --min-id は --max-id より小さい値を指定してください", file=sys.stderr)
            sys.exit(1)

    # SQL生成実行
    generate_sql_from_ndjson(
        ndjson_url=args.url,
        min_id=args.min_id,
        max_id=args.max_id,
        update_only=args.update_only
    )


if __name__ == "__main__":
    main()
