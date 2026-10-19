-- OGUN STATE LIFESTYLE — Phase 1: players and inventories.
--
-- Security model
--   * Row Level Security is ON for every table.
--   * Signed-in players may only SELECT their own rows.
--   * There are NO insert/update/delete policies, and client roles hold only
--     SELECT on these tables (Supabase grants ALL by default, which would
--     include TRUNCATE — that bypasses RLS — so we revoke everything first).
--     The browser can never write game data directly.
--   * A character is created only through public.create_character(), which runs
--     as SECURITY DEFINER, validates input, and sets starting cash/items itself.
--   * Future economic actions (pay, buy, sell) must follow the same pattern:
--     validated server-side functions in a single transaction.

create table public.players (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references auth.users (id) on delete cascade,
  character_name text not null check (char_length(character_name) between 3 and 20),
  avatar         jsonb not null,
  cash           bigint not null default 0 check (cash >= 0),
  location       text not null default 'kuto-starter-apartment',
  created_at     timestamptz not null default now()
);

create table public.inventories (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null unique references public.players (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.inventory_items (
  inventory_id uuid not null references public.inventories (id) on delete cascade,
  item_key     text not null,
  quantity     integer not null check (quantity > 0),
  primary key (inventory_id, item_key)
);

alter table public.players enable row level security;
alter table public.inventories enable row level security;
alter table public.inventory_items enable row level security;

create policy "players: read own" on public.players
  for select to authenticated using (user_id = (select auth.uid()));

create policy "inventories: read own" on public.inventories
  for select to authenticated using (
    exists (select 1 from public.players p where p.id = player_id and p.user_id = (select auth.uid()))
  );

create policy "inventory items: read own" on public.inventory_items
  for select to authenticated using (
    exists (
      select 1 from public.inventories i join public.players p on p.id = i.player_id
      where i.id = inventory_id and p.user_id = (select auth.uid())
    )
  );

-- Client roles may only read (and RLS limits what they read). No writes, no TRUNCATE.
revoke all on public.players, public.inventories, public.inventory_items from anon, authenticated;
grant select on public.players, public.inventories, public.inventory_items to authenticated;

-- Create the caller's character. Starting cash and items are decided HERE, never by the client.
create or replace function public.create_character(p_name text, p_avatar jsonb)
returns public.players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_name   text := btrim(regexp_replace(normalize(coalesce(p_name, ''), nfc), '\s+', ' ', 'g'));
  v_player public.players;
  v_inv    uuid;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a character' using errcode = '28000';
  end if;

  -- Allow-list by Unicode code point (independent of the database locale), matching
  -- NAME_PATTERN in src/lib/validation/character.ts exactly:
  --   letters: A-Z a-z, Latin-1 letters (no × ÷), Latin Extended-A/B, IPA (Hausa ɓ ɗ),
  --            Latin Extended Additional (Yoruba/Igbo Ọ ẹ ṣ ị ụ ṅ)
  --   after the first letter also: combining tone marks, space, apostrophe, dot, hyphen.
  if char_length(v_name) < 3 or char_length(v_name) > 20
     or v_name !~ '^[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02AF\u1E00-\u1EFF][A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02AF\u1E00-\u1EFF\u0300-\u036F'' .-]*$' then
    raise exception 'Invalid character name' using errcode = '22023';
  end if;

  if p_avatar is null
     or coalesce(p_avatar ->> 'body', '') not in ('masc', 'femme')
     or coalesce(p_avatar ->> 'skin', '') not in ('deep', 'brown', 'warm', 'light')
     or coalesce(p_avatar ->> 'headwear', '') not in ('none', 'fila', 'gele', 'cap', 'braids')
     or coalesce(p_avatar ->> 'outfit', '') not in ('ogun', 'adire', 'laterite', 'palm', 'cream', 'ink') then
    raise exception 'Invalid avatar' using errcode = '22023';
  end if;

  if exists (select 1 from public.players where user_id = v_uid) then
    raise exception 'You already have a character' using errcode = '23505';
  end if;

  insert into public.players (user_id, character_name, avatar, cash, location)
  values (
    v_uid,
    v_name,
    jsonb_build_object(
      'body', p_avatar ->> 'body', 'skin', p_avatar ->> 'skin',
      'headwear', p_avatar ->> 'headwear', 'outfit', p_avatar ->> 'outfit'
    ),
    50000,                       -- starting cash (keep in sync with STARTING_CASH in src/config/game.ts)
    'kuto-starter-apartment'
  )
  returning * into v_player;

  insert into public.inventories (player_id) values (v_player.id) returning id into v_inv;
  insert into public.inventory_items (inventory_id, item_key, quantity) values
    (v_inv, 'phone-basic', 1),
    (v_inv, 'apartment-key', 1),
    (v_inv, 'water-sachet', 3);

  return v_player;
end;
$$;

revoke all on function public.create_character(text, jsonb) from public, anon;
grant execute on function public.create_character(text, jsonb) to authenticated;
