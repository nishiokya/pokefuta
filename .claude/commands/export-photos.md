Export the latest manhole photos from Supabase and generate `public/data/latest-manhole-photos.json`.

Steps:
1. Load env vars from `.env.local` with: `set -a && source .env.local && set +a`
2. Run `python3 tools/export_latest_manhole_photos.py`
3. Show the stderr output (exported count and output path)
4. Show the first few lines of the generated JSON as a sanity check (generated_at and count fields)

Notes:
- The script uses `SUPABASE_SERVICE_ROLE_KEY` if set, or falls back to `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The anon key works because exported photos are all public.
- `R2_PUBLIC_URL` and `R2_BUCKET` from `.env.local` are used for image URLs.
- Output goes to `public/data/latest-manhole-photos.json` by default.
