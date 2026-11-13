-- RuneGate Companion – første databaseskema
--
-- Kun spillernes egne data ligger her (D1). Regeldata ligger i repoet.
-- Adgang styres med Row Level Security:
--   * en spiller kan se og rette sine egne karakterer
--   * en GM kan SE alle karakterer i sine kampagner (ikke rette – D7)
--   * kampagnens medlemmer kan se hinandens navne og roller

-- ---------------------------------------------------------------------------------------------
-- Profiler (én pr. login)
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default '',
  created_at    timestamptz not null default now()
);

-- Opret automatisk en profil, når en bruger logger ind første gang
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Kampagner og medlemmer
-- ---------------------------------------------------------------------------------------------
create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  rules_version  text not null,
  created_by     uuid not null default auth.uid() references public.profiles (id),
  created_at     timestamptz not null default now()
);

create table public.campaign_members (
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('player', 'gm')),
  joined_at    timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

-- Den, der opretter en kampagne, bliver automatisk GM
create function public.handle_new_campaign() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role) values (new.id, new.created_by, 'gm');
  return new;
end $$;

create trigger on_campaign_created
  after insert on public.campaigns
  for each row execute function public.handle_new_campaign();

-- ---------------------------------------------------------------------------------------------
-- Karakterer
-- build: spillerens valg (CharacterBuild i src/character/types.ts) – aldrig beregnede tal
-- play:  tilstand under spil (PlayState): aktuelle BP/MP, wounds, conditions, penge …
-- ---------------------------------------------------------------------------------------------
create table public.characters (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  campaign_id    uuid references public.campaigns (id) on delete set null,
  name           text not null,
  rules_version  text not null,
  build          jsonb not null,
  play           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index characters_owner_idx on public.characters (owner_id);
create index characters_campaign_idx on public.characters (campaign_id);

-- Inventory: én række pr. genstand (InventoryItem). Egen tabel, så GM-uddeling af loot
-- senere kan bygges uden at ændre karakterens build.
create table public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters (id) on delete cascade,
  ref           text,                -- katalog-ID fra regeldata, fx 'armor.chain-mail'
  custom        jsonb,               -- spillerens egne items (navn, ENC, modifiers, attunement)
  quantity      integer not null default 1 check (quantity >= 0),
  equipped      boolean not null default false,
  attuned       boolean not null default false,
  notes         text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ref is not null or custom is not null)
);
create index inventory_character_idx on public.inventory_items (character_id);

-- updated_at holdes ved lige automatisk
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger characters_touch before update on public.characters
  for each row execute function public.touch_updated_at();
create trigger inventory_touch before update on public.inventory_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Hjælpefunktioner til adgangsreglerne (security definer, så de ikke selv rammes af RLS)
-- ---------------------------------------------------------------------------------------------
create function public.is_campaign_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m where m.campaign_id = c and m.user_id = auth.uid())
$$;

create function public.is_campaign_gm(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.campaign_members m
                 where m.campaign_id = c and m.user_id = auth.uid() and m.role = 'gm')
$$;

create function public.can_read_character(ch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters c
                 where c.id = ch and (c.owner_id = auth.uid()
                   or (c.campaign_id is not null and public.is_campaign_gm(c.campaign_id))))
$$;

create function public.owns_character(ch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.characters c where c.id = ch and c.owner_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.campaigns         enable row level security;
alter table public.campaign_members  enable row level security;
alter table public.characters        enable row level security;
alter table public.inventory_items   enable row level security;

-- Profiler: se sin egen og dem, man deler kampagne med; rette kun sin egen
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.campaign_members a join public.campaign_members b using (campaign_id)
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Kampagner: medlemmer kan se; alle kan oprette (og bliver GM); kun GM kan rette/slette
create policy campaigns_select on public.campaigns for select to authenticated
  using (public.is_campaign_member(id) or created_by = auth.uid());
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (created_by = auth.uid());
create policy campaigns_update on public.campaigns for update to authenticated
  using (public.is_campaign_gm(id)) with check (public.is_campaign_gm(id));
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (public.is_campaign_gm(id));

-- Medlemskaber: medlemmer kan se listen; kun GM kan tilføje/fjerne; man kan selv forlade
create policy members_select on public.campaign_members for select to authenticated
  using (public.is_campaign_member(campaign_id));
create policy members_insert on public.campaign_members for insert to authenticated
  with check (public.is_campaign_gm(campaign_id));
create policy members_update on public.campaign_members for update to authenticated
  using (public.is_campaign_gm(campaign_id)) with check (public.is_campaign_gm(campaign_id));
create policy members_delete on public.campaign_members for delete to authenticated
  using (public.is_campaign_gm(campaign_id) or user_id = auth.uid());

-- Karakterer: ejer har fuld adgang; GM kan læse karakterer i sine kampagner.
-- En karakter kan kun knyttes til en kampagne, man selv er medlem af.
create policy characters_select on public.characters for select to authenticated
  using (owner_id = auth.uid() or (campaign_id is not null and public.is_campaign_gm(campaign_id)));
create policy characters_insert on public.characters for insert to authenticated
  with check (owner_id = auth.uid() and (campaign_id is null or public.is_campaign_member(campaign_id)));
create policy characters_update on public.characters for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (campaign_id is null or public.is_campaign_member(campaign_id)));
create policy characters_delete on public.characters for delete to authenticated
  using (owner_id = auth.uid());

-- Inventory følger karakteren
create policy inventory_select on public.inventory_items for select to authenticated
  using (public.can_read_character(character_id));
create policy inventory_write on public.inventory_items for all to authenticated
  using (public.owns_character(character_id)) with check (public.owns_character(character_id));

-- Anonyme brugere har ingen adgang til noget (RLS uden policies for 'anon')
