-- Communities can only be created through rpc_create_community (and turned
-- into / out of a community only by the server). Old pages used to insert
-- study_groups rows directly and decided client-side whether the row was a
-- community - which is how groups.html kept making plain groups after the
-- "anyone can create a community" change. With this, no page (old or new)
-- can get it wrong: a direct insert is always a plain study group.
--
-- rpc_create_community is SECURITY DEFINER, so inside it current_user is the
-- function owner, not 'authenticated', and this check doesn't apply there.

do $$
declare
  def text := pg_get_functiondef('public.protect_study_group_monetization()'::regprocedure);
  new_def text;
begin
  new_def := replace(def,
$old$  if tg_op = 'INSERT' then
    new.monetization_enabled := false;$old$,
$new$  if tg_op = 'INSERT' then
    new.is_revhead_group := false; -- communities: rpc_create_community only
    new.monetization_enabled := false;$new$);
  new_def := replace(new_def,
$old$  if coalesce(old.is_revhead_group, false) and new.owner_id is distinct from old.owner_id then$old$,
$new$  if coalesce(new.is_revhead_group, false) is distinct from coalesce(old.is_revhead_group, false) then
    raise exception 'permission denied: a group can''t be turned into or out of a community here' using errcode = '42501';
  end if;
  if coalesce(old.is_revhead_group, false) and new.owner_id is distinct from old.owner_id then$new$);
  if new_def = def or position('rpc_create_community only' in new_def) = 0 or position('turned into or out of' in new_def) = 0 then
    raise exception 'protect_study_group_monetization: expected text not found';
  end if;
  execute new_def;
end $$;
