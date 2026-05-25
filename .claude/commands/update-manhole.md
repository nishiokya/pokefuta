Generate a SQL file to update the manhole table from the latest pokefuta.ndjson data.

Steps:
1. Parse the user's request for optional arguments:
   - `--update-only`: generate UPDATE statements only (no INSERT/UPSERT)
   - `--min-id N`: only process manholes with id >= N
   - `--max-id N`: only process manholes with id <= N
   - If no arguments are specified, run with no flags (full UPSERT for all manholes)

2. Run the script with the determined arguments:
   ```
   python3 tools/generate_manhole_sql.py [args] 2>manhole_update.log > manhole_update.sql
   ```

3. Show the contents of `manhole_update.log` (stderr: record count, progress, warnings)

4. Show the first 10 lines of `manhole_update.sql` as a sanity check

5. Report the file size of `manhole_update.sql`

6. Show the following instructions to the user:
   - Open `manhole_update.sql` in your editor
   - Go to Supabase Dashboard > SQL Editor
   - Paste and run the SQL

Notes:
- The script fetches the latest data from https://data.pokefuta.com/pokefuta.ndjson (internet connection required)
- `manhole_update.sql` and `manhole_update.log` are written to the project root; they are gitignored
- Use `--update-only` when you want to update existing rows only (e.g. titles/hashtags refresh) without inserting new records
- Use `--min-id` to process only newly added manholes (e.g. `--min-id 401` for manholes added after id 400)
