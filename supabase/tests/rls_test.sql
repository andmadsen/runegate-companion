-- Test af adgangsreglerne. Stopper ved første fejl (ON_ERROR_STOP) og udskriver "RLS OK" til sidst.
\set ON_ERROR_STOP on
set client_min_messages = warning;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'gm@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'spiller@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'fremmed@example.com');

create function pg_temp.login(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false);
$$;
create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'FEJLET: %', what; end if; end $$;

set role authenticated;

-- GM opretter kampagne og bliver automatisk GM
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
insert into public.campaigns (id, name, rules_version) values ('10000000-0000-0000-0000-000000000001', 'Kampagnen', '2026-09-19');
select pg_temp.expect((select role from public.campaign_members where user_id = auth.uid()) = 'gm', 'opretter bliver GM');
insert into public.campaign_members (campaign_id, user_id, role)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'player');

-- Spilleren opretter en karakter i kampagnen og et item
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
insert into public.characters (id, campaign_id, name, rules_version, build)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Brokk', '2026-09-19', '{}');
insert into public.inventory_items (character_id, ref) values ('20000000-0000-0000-0000-000000000001', 'armor.chain-mail');
select pg_temp.expect((select count(*) from public.characters) = 1, 'spiller ser egen karakter');
update public.characters set play = '{"currentBP": 70}' where id = '20000000-0000-0000-0000-000000000001';
select pg_temp.expect((select play ->> 'currentBP' from public.characters) = '70', 'spiller kan rette egen karakter');
select pg_temp.expect((select count(*) from public.profiles) = 2, 'spiller ser profiler i egen kampagne (sig selv + GM)');

-- Spilleren kan ikke gøre sig selv til GM
do $$ begin
  update public.campaign_members set role = 'gm' where user_id = auth.uid();
  if exists (select 1 from public.campaign_members where user_id = auth.uid() and role = 'gm') then
    raise exception 'FEJLET: spiller gjorde sig selv til GM'; end if;
end $$;

-- GM kan læse, men ikke rette eller slette spillerens karakter og inventory
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.characters) = 1, 'GM ser karakter i kampagnen');
select pg_temp.expect((select count(*) from public.inventory_items) = 1, 'GM ser inventory');
update public.characters set name = 'Hacked' where id = '20000000-0000-0000-0000-000000000001';
delete from public.inventory_items;
select pg_temp.expect((select name from public.characters) = 'Brokk', 'GM kan ikke rette karakter');
select pg_temp.expect((select count(*) from public.inventory_items) = 1, 'GM kan ikke slette inventory');

-- En fremmed ser intet og kan ikke snige en karakter ind i kampagnen
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect((select count(*) from public.characters) = 0, 'fremmed ser ingen karakterer');
select pg_temp.expect((select count(*) from public.inventory_items) = 0, 'fremmed ser intet inventory');
select pg_temp.expect((select count(*) from public.campaigns) = 0, 'fremmed ser ingen kampagner');
select pg_temp.expect((select count(*) from public.profiles) = 1, 'fremmed ser kun sin egen profil');
do $$ begin
  begin
    insert into public.characters (campaign_id, name, rules_version, build)
      values ('10000000-0000-0000-0000-000000000001', 'Snig', '2026-09-19', '{}');
    raise exception 'FEJLET: fremmed kunne oprette karakter i kampagnen';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.inventory_items (character_id, ref) values ('20000000-0000-0000-0000-000000000001', 'weapon.dagger');
    raise exception 'FEJLET: fremmed kunne lægge items i andres karakter';
  exception when insufficient_privilege then null; end;
end $$;

-- Ikke logget ind (anon) ser intet
reset role;
set role anon;
select pg_temp.login('');
select pg_temp.expect((select count(*) from public.characters) = 0, 'anon ser intet');

reset role;
select 'RLS OK' as resultat;
