#!/usr/bin/env python3
"""Run against a disposable/local Supabase DB only; every case rolls back.
Usage: python3 tools/check-three-kochi-transfer.py -- ssh k11 docker exec -i supabase_db_pokefuta psql -U postgres -d postgres
No production credentials or data are used.
"""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
migration = (root / 'supabase/migrations/20261110110000_link_three_kochi_design_posts.sql').read_text()
# Find the catalog migration by its version, independent of its descriptive filename.
catalog = next((root / 'supabase/migrations').glob('20261110090000_*.sql')).read_text()
rows = re.findall(r"\('([0-9a-f-]+)'::uuid, '([0-9a-f-]+)'::uuid, (\d+), '([^']+)'::timestamptz, '([^']+)'\)", migration)
assert len(rows) == 3
uid = 'f3333333-3333-4333-8333-333333333333'  # synthetic auth UID, never a real user
setup = catalog + f"\nINSERT INTO auth.users(id) VALUES ('{uid}');\n"
setup += f"INSERT INTO public.app_user(id,auth_uid) VALUES ('{rows[0][1]}','{uid}') ON CONFLICT(auth_uid) DO UPDATE SET id=excluded.id;\n"
for did, _, mid, shot, key in rows:
    setup += f"""
INSERT INTO public.design_manhole(id,created_by,kind,status,latitude,longitude,storage_key,content_type,exif,description,created_at)
SELECT '{did}','{uid}','pokefuta','published',extensions.st_y(location::extensions.geometry),extensions.st_x(location::extensions.geometry),
'{key}','image/jpeg',jsonb_build_object('DateTimeOriginal','{shot}'),' test comment ','2026-11-08 08:00:00+00'
FROM public.manhole WHERE id={mid};
"""
# INSERT trigger deliberately sends nearby submissions to review; fixtures represent
# already published submissions, matching the production records inspected for this PR.
setup += f"UPDATE public.design_manhole SET status='published' WHERE created_by='{uid}';\n"
assertions = f"""
DO $test$ BEGIN
 IF (SELECT count(*) FROM public.visit WHERE user_id='{uid}') <> 3
 OR (SELECT count(*) FROM public.photo p JOIN public.visit v ON v.id=p.visit_id WHERE v.user_id='{uid}') <> 3
 OR (SELECT count(*) FROM public.design_manhole WHERE created_by='{uid}' AND status='hidden') <> 3
 THEN RAISE EXCEPTION 'wrong transfer counts'; END IF;
 IF EXISTS (SELECT 1 FROM public.visit v JOIN public.photo p ON p.visit_id=v.id
 JOIN public.design_manhole d ON d.storage_key=p.storage_key WHERE v.user_id='{uid}'
 AND (v.shot_at IS DISTINCT FROM (d.exif->>'DateTimeOriginal')::timestamptz
 OR v.created_at IS DISTINCT FROM d.created_at OR p.created_at IS DISTINCT FROM d.created_at
 OR v.comment IS DISTINCT FROM 'test comment' OR v.location_source IS DISTINCT FROM 'gps'
 OR NOT extensions.st_equals(v.shot_location::extensions.geometry,extensions.st_setsrid(extensions.st_makepoint(d.longitude,d.latitude),4326))
 OR p.exif IS DISTINCT FROM d.exif)) THEN RAISE EXCEPTION 'lost metadata'; END IF;
END $test$;
"""
# Run expected failures inside a subtransaction; assert earlier iterations were undone.
def failure_case(change, expected):
    quoted = migration.replace('$transfer$', '$unused$')
    return setup + change + f"""
DO $test$ BEGIN
 BEGIN
 EXECUTE $transfer${quoted}$transfer$;
 RAISE EXCEPTION 'expected migration rejection';
 EXCEPTION WHEN OTHERS THEN
 IF position('{expected}' in SQLERRM)=0 THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.photo p JOIN public.visit v ON v.id=p.visit_id WHERE v.user_id='{uid}')
 OR EXISTS(SELECT 1 FROM public.design_manhole WHERE created_by='{uid}' AND status='hidden')
 THEN RAISE EXCEPTION 'partial transfer survived failure'; END IF;
END $test$;
"""
last = rows[-1][0]
cases = {
 'empty database': migration,
 'transfer and repeat preserve metadata': setup + migration + assertions + migration + assertions,
 'partial source rolls back earlier rows': failure_case(f"DELETE FROM public.design_manhole WHERE id='{last}';", 'が無い'),
 'existing visit rejects and rolls back': failure_case(f"INSERT INTO public.visit(user_id,manhole_id,shot_at) VALUES('{uid}',494,now());", 'visit をすでに持っている'),
 'changed image rejects and rolls back': failure_case(f"UPDATE public.design_manhole SET storage_key='photos/design/original/test.jpg' WHERE id='{last}';", '期待と違う'),
 'far GPS rejects and rolls back': failure_case(f"UPDATE public.design_manhole SET latitude=35 WHERE id='{last}';", '50m以内でない'),
}
command = sys.argv[1:]
if command[:1] == ['--']: command = command[1:]
if not command: raise SystemExit(__doc__)
for name, sql in cases.items():
    result = subprocess.run(command + ['-X', '-v', 'ON_ERROR_STOP=1'], input='BEGIN;\n'+sql+'\nROLLBACK;\n', text=True, capture_output=True)
    if result.returncode:
        print(result.stdout, result.stderr)
        raise SystemExit('FAIL: '+name)
    print('PASS: '+name)
