# Repository guidance

- Treat `app_user` profile data as public only through narrowly scoped `SECURITY DEFINER` functions. Do not grant anonymous table access.
- Keep `src/types/database.ts` in sync when a database migration adds or changes profile fields.
- A user may edit only the profile associated with `auth.uid()`; enforce this in the database as well as in the UI.
