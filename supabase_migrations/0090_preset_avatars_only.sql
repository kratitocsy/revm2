-- Profile pictures are only the 6 built-in avatars (Settings > Profile,
-- stored as user_profiles.preferences.avatar_preset). No uploaded photos
-- and no Google profile pictures.
--
--   * user_profiles.avatar_url is kept empty: a trigger blanks it on every
--     insert/update, which also covers handle_new_user copying the Google
--     photo in at sign-up.
--   * New uploads to the `avatars` storage bucket are refused (upload and
--     overwrite policies dropped). Files already there are left untouched.

update public.user_profiles set avatar_url = null where avatar_url is not null;

create or replace function public.user_profiles_no_custom_avatar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.avatar_url := null;
  return new;
end;
$$;
revoke execute on function public.user_profiles_no_custom_avatar() from public, anon, authenticated;

drop trigger if exists user_profiles_no_custom_avatar on public.user_profiles;
create trigger user_profiles_no_custom_avatar
  before insert or update of avatar_url on public.user_profiles
  for each row execute function public.user_profiles_no_custom_avatar();

drop policy if exists "avatar owner upload" on storage.objects;
drop policy if exists "avatar owner update" on storage.objects;
