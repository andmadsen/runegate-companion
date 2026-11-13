-- Opstramning efter Supabase-advisor (2026-11-14)
-- 1. Hjælpefunktioner flyttes til et ikke-eksponeret skema "private", så de ikke kan kaldes via API'et.
-- 2. Trigger-funktioner kan ikke kaldes direkte af nogen.
-- 3. auth.uid() pakkes ind i (select …), så den kun evalueres én gang pr. forespørgsel.
-- 4. Manglende indekser og én SELECT-policy pr. tabel.

create schema if not exists private;
grant usage on schema private to authenticated;

-- 1. Hjælpefunktioner i private ------------------------------------------------------------------
create function private.is_campaign_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m where m.campaign_id = c and m.user_id = (select auth.uid()))
$$;

create function private.is_campaign_gm(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m
                 where m.campaign_id = c and m.user_id = (select auth.uid()) and m.role = 'gm')
$$;

create function private.can_read_character(ch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters c
                 where c.id = ch and (c.owner_id = (select auth.uid())
                   or (c.campaign_id is not null and private.is_campaign_gm(c.campaign_id))))
$$;

create function private.owns_character(ch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters c where c.id = ch and c.owner_id = (select auth.uid()))
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Policies genskabes med de nye funktioner og (select auth.uid())
drop policy profiles_select on public.profiles;
drop policy profiles_update on public.profiles;
drop policy campaigns_select on public.campaigns;
drop policy campaigns_insert on public.campaigns;
drop policy campaigns_update on public.campaigns;
drop policy campaigns_delete on public.campaigns;
drop policy members_select on public.campaign_members;
drop policy members_insert on public.campaign_members;
drop policy members_update on public.campaign_members;
drop policy members_delete on public.campaign_members;
drop policy characters_select on public.characters;
drop policy characters_insert on public.characters;
drop policy characters_update on public.characters;
drop policy characters_delete on public.characters;
drop policy inventory_select on public.inventory_items;
drop policy inventory_write on public.inventory_items;

drop function public.is_campaign_member(uuid);
drop function public.is_campaign_gm(uuid);
drop function public.can_read_character(uuid);
drop function public.owns_character(uuid);

create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.campaign_members a join public.campaign_members b using (campaign_id)
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy campaigns_select on public.campaigns for select to authenticated
  using (private.is_campaign_member(id) or created_by = (select auth.uid()));
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy campaigns_update on public.campaigns for update to authenticated
  using (private.is_campaign_gm(id)) with check (private.is_campaign_gm(id));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (private.is_campaign_gm(id));

create policy members_select on public.campaign_members for select to authenticated
  using (private.is_campaign_member(campaign_id));
create policy members_insert on public.campaign_members for insert to authenticated
  with check (private.is_campaign_gm(campaign_id));
create policy members_update on public.campaign_members for update to authenticated
  using (private.is_campaign_gm(campaign_id)) with check (private.is_campaign_gm(campaign_id));
create policy members_delete on public.campaign_members for delete to authenticated
  using (private.is_campaign_gm(campaign_id) or user_id = (select auth.uid()));

create policy characters_select on public.characters for select to authenticated
  using (owner_id = (select auth.uid()) or (campaign_id is not null and private.is_campaign_gm(campaign_id)));
create policy characters_insert on public.characters for insert to authenticated
  with check (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)));
create policy characters_update on public.characters for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (campaign_id is null or private.is_campaign_member(campaign_id)));
create policy characters_delete on public.characters for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Inventory: én policy pr. handling (ingen overlappende SELECT-policies)
create policy inventory_select on public.inventory_items for select to authenticated
  using (private.can_read_character(character_id));
create policy inventory_insert on public.inventory_items for insert to authenticated
  with check (private.owns_character(character_id));
create policy inventory_update on public.inventory_items for update to authenticated
  using (private.owns_character(character_id)) with check (private.owns_character(character_id));
create policy inventory_delete on public.inventory_items for delete to authenticated
  using (private.owns_character(character_id));

-- 2. Trigger-funktioner kan ikke kaldes direkte ---------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_new_campaign() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- 4. Indekser på fremmednøgler ------------------------------------------------------------------
create index campaign_members_user_idx on public.campaign_members (user_id);
create index campaigns_created_by_idx on public.campaigns (created_by);
