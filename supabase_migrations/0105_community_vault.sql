-- Community Vault + announcement attachments.
--
-- A WynkoHead (community admin) can attach files to an announcement: PDF,
-- DOCX, images, video or any other file. For each attachment they choose:
--   * "Save to Vault"  -> in_vault = true : stays in the community's Vault
--                         (a per-community library every member can open).
--   * "Just send"      -> in_vault = false: only attached to that announcement.
--
-- This reuses group_materials (migration 0051) instead of a new table, so the
-- Kindle-style page reader keeps working unchanged:
--   * pdf / image  -> rasterised to compressed JPEG pages, stored through the
--                     existing materials Cloudflare Worker (group_material_pages).
--   * docx / video / other files -> stored as-is in the private
--                     'community-files' Storage bucket (storage_path), opened
--                     through short-lived signed URLs.
--
-- Safe to re-run.

-- 1. group_materials: new source types + attachment columns --------------------
alter table public.group_materials drop constraint if exists group_materials_source_type_check;
alter table public.group_materials add constraint group_materials_source_type_check
  check (source_type in ('pdf', 'image', 'doc', 'video', 'file'));

alter table public.group_materials
  add column if not exists mime_type       text,
  add column if not exists file_name       text,
  add column if not exists storage_path    text,     -- object path in the 'community-files' bucket (raw files only)
  add column if not exists in_vault        boolean not null default true,
  add column if not exists announcement_id uuid references public.community_announcements(id) on delete set null;

create index if not exists idx_group_materials_announcement
  on public.group_materials (announcement_id) where announcement_id is not null;
create index if not exists idx_group_materials_vault
  on public.group_materials (group_id, created_at desc) where in_vault;

-- A "just send" attachment has no life outside its announcement, so deleting
-- the announcement deletes it. Vault-saved attachments survive (announcement_id
-- goes null through the FK above).
create or replace function public.trg_announcement_drop_unsaved_attachments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.group_materials where announcement_id = old.id and in_vault = false;
  return old;
end $$;

drop trigger if exists announcement_drop_unsaved_attachments on public.community_announcements;
create trigger announcement_drop_unsaved_attachments
  before delete on public.community_announcements
  for each row execute function public.trg_announcement_drop_unsaved_attachments();

-- 2. Private bucket for raw files (docx / video / other) -------------------------
-- Object path convention: <group_id>/<material_id>/<file name>
insert into storage.buckets (id, name, public, file_size_limit)
values ('community-files', 'community-files', false, 52428800)  -- 50 MB (Supabase free-plan ceiling)
on conflict (id) do nothing;

drop policy if exists "community_files: members read" on storage.objects;
create policy "community_files: members read" on storage.objects for select to authenticated
  using (bucket_id = 'community-files'
         and public.is_group_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "community_files: admins upload" on storage.objects;
create policy "community_files: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-files'
              and public.is_group_admin(((storage.foldername(name))[1])::uuid));

drop policy if exists "community_files: admins delete" on storage.objects;
create policy "community_files: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'community-files'
         and public.is_group_admin(((storage.foldername(name))[1])::uuid));

-- 3. Realtime so the Vault / announcement chips refresh when the head posts ----
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_materials') then
    alter publication supabase_realtime add table public.group_materials;
  end if;
end $$;
