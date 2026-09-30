-- 0102: what Wynky and the student agreed in the AI chat (rules, named blocks,
-- lunch and dinner times, week shape, hours), kept between chats so the next
-- chat starts from the same plan. The app works without the column (it just
-- doesn't keep the settings), so this can be applied before or after the client.
alter table public.wynky_profiles add column if not exists chat_settings jsonb;
