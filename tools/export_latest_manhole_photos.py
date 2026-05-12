#!/usr/bin/env python3
"""
Export the latest photo URL for each manhole as JSON.

This intentionally uses only Python's standard library so it can be run
locally without adding project dependencies.

Example:
  export NEXT_PUBLIC_SUPABASE_URL="https://xxxxx.supabase.co"
  export SUPABASE_SERVICE_ROLE_KEY="xxxxx"
  export R2_PUBLIC_BASE_URL="https://images.pokefuta.com"
  python3 tools/export_latest_manhole_photos.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional


DEFAULT_OUTPUT = "public/data/latest-manhole-photos.json"
DEFAULT_BATCH_SIZE = 1000
DEFAULT_TIMEOUT = 30


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def strip_trailing_slash(value: str) -> str:
    return value.rstrip("/")


def encode_storage_key(storage_key: str) -> str:
    return "/".join(urllib.parse.quote(part) for part in storage_key.split("/"))


def get_r2_public_base_url() -> str:
    value = os.environ.get("R2_PUBLIC_BASE_URL") or os.environ.get("R2_PUBLIC_URL")
    if not value:
        raise RuntimeError("R2_PUBLIC_BASE_URL is required")
    return strip_trailing_slash(value)


def build_original_url(storage_key: str) -> str:
    base_url = get_r2_public_base_url()
    encoded_key = encode_storage_key(storage_key)

    if "r2.cloudflarestorage.com" in base_url:
        bucket = require_env("R2_BUCKET")
        return f"{base_url}/{bucket}/{encoded_key}"

    return f"{base_url}/{encoded_key}"


def parse_datetime(value: Optional[str]) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)

    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def normalize_visit(visit: Any) -> dict[str, Any]:
    if isinstance(visit, list):
        return visit[0] if visit else {}
    return visit if isinstance(visit, dict) else {}


def photo_sort_date(photo: dict[str, Any]) -> datetime:
    visit = normalize_visit(photo.get("visit"))
    return parse_datetime(visit.get("shot_at") or photo.get("created_at"))


def to_photo_entry(photo: dict[str, Any]) -> dict[str, Any]:
    visit = normalize_visit(photo.get("visit"))
    storage_key = photo["storage_key"]

    return {
        "manhole_id": photo["manhole_id"],
        "photo_id": photo["id"],
        "url": build_original_url(storage_key),
        "original_url": build_original_url(storage_key),
        "storage_key": storage_key,
        "content_type": photo.get("content_type"),
        "width": photo.get("width"),
        "height": photo.get("height"),
        "file_size": photo.get("file_size"),
        "created_at": photo.get("created_at"),
        "shot_at": visit.get("shot_at"),
    }


def supabase_get(
    path: str,
    query: dict[str, str],
    batch_size: int,
    offset: int,
    timeout: int,
) -> list[dict[str, Any]]:
    supabase_url = strip_trailing_slash(require_env("NEXT_PUBLIC_SUPABASE_URL"))
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")

    params = dict(query)
    params["limit"] = str(batch_size)
    params["offset"] = str(offset)

    url = f"{supabase_url}/rest/v1/{path}?{urllib.parse.urlencode(params, safe='(),.!:*')}"
    request = urllib.request.Request(
        url,
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def iter_photos(include_private: bool, batch_size: int, timeout: int) -> Iterator[dict[str, Any]]:
    select_visit = "visit(shot_at,is_public)" if include_private else "visit!inner(shot_at,is_public)"
    query = {
        "select": f"id,manhole_id,storage_key,content_type,width,height,file_size,created_at,{select_visit}",
        "manhole_id": "not.is.null",
        "storage_key": "not.is.null",
        "order": "created_at.desc",
    }

    if not include_private:
        query["visit.is_public"] = "eq.true"

    offset = 0

    while True:
        batch = supabase_get("photo", query, batch_size, offset, timeout)
        yield from batch

        if len(batch) < batch_size:
            break
        offset += batch_size


def build_payload(include_private: bool, batch_size: int, timeout: int) -> dict[str, Any]:
    latest_by_manhole_id: dict[int, dict[str, Any]] = {}
    latest_dates: dict[int, datetime] = {}

    for photo in iter_photos(include_private=include_private, batch_size=batch_size, timeout=timeout):
        manhole_id = int(photo["manhole_id"])
        sort_date = photo_sort_date(photo)

        if manhole_id not in latest_dates or sort_date > latest_dates[manhole_id]:
            latest_dates[manhole_id] = sort_date
            latest_by_manhole_id[manhole_id] = to_photo_entry(photo)

    photos = {
        str(manhole_id): latest_by_manhole_id[manhole_id]
        for manhole_id in sorted(latest_by_manhole_id)
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "pokefuta photo table",
        "image": {
            "r2_public_base_url": get_r2_public_base_url(),
        },
        "count": len(photos),
        "photos": photos,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export latest photo URLs by manhole ID as JSON.",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=os.environ.get("OUTPUT_PATH", DEFAULT_OUTPUT),
        help=f"Output JSON path. Default: {DEFAULT_OUTPUT}",
    )
    parser.add_argument(
        "--include-private",
        action="store_true",
        default=os.environ.get("INCLUDE_PRIVATE_PHOTOS") == "true",
        help="Include photos attached to private visits.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=int(os.environ.get("PHOTO_EXPORT_BATCH_SIZE", DEFAULT_BATCH_SIZE)),
        help=f"Supabase page size. Default: {DEFAULT_BATCH_SIZE}",
    )
    parser.add_argument(
        "--compact",
        action="store_true",
        help="Write compact JSON.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.environ.get("PHOTO_EXPORT_TIMEOUT", DEFAULT_TIMEOUT)),
        help=f"HTTP request timeout in seconds. Default: {DEFAULT_TIMEOUT}",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = build_payload(
        include_private=args.include_private,
        batch_size=args.batch_size,
        timeout=args.timeout,
    )

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as output:
        indent = None if args.compact else 2
        json.dump(payload, output, ensure_ascii=False, indent=indent)
        output.write("\n")

    print(f"Exported {payload['count']} latest manhole photos to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
