-- Adds a flag that forces every new user through the first-upload flow
alter table public.app_user
  add column if not exists has_uploaded_image boolean not null default false;

-- Backfill existing users who already uploaded at least one visit photo
update public.app_user au
set has_uploaded_image = true
where has_uploaded_image = false
  and exists (
    select 1
    from public.visit v
    where v.user_id = au.auth_uid
      and exists (
        select 1
        from public.photo p
        where p.visit_id = v.id
      )
  );
