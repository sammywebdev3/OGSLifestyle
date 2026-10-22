-- OGUN STATE LIFESTYLE — Phase 3.3A: land registry, transaction ledger, plot purchases.
--
-- Adds (nothing existing is changed: players, inventories, their policies and
-- create_character stay exactly as they are):
--   * public.land_plots          the land registry: 12 seeded Kuto Street plots, one owner each.
--   * public.economy_transactions one row per completed economic action (here: a plot purchase).
--   * public.ledger_entries       append-only double-entry lines; each transaction's lines sum to 0.
--   * public.economic_requests    idempotency keys: a retried purchase is answered, never charged twice.
--   * public.buy_land_plot(plot_key, idempotency_key)  the ONLY way to buy land.
--   * public.get_land_plots()     public plot information (no player ids, no cash).
--   * public.get_my_land()        the caller's own plots and what they paid.
--
-- Security model (same as Phase 1)
--   * RLS is ON for every new table and there are NO policies: clients cannot read
--     or write these tables at all. anon and authenticated hold no privileges on them.
--   * All reads and writes go through SECURITY DEFINER functions owned by postgres
--     with an empty search_path and schema-qualified names. The caller is always
--     auth.uid(); the functions take no price, balance, owner or player id.
--   * Ledger, transaction and request rows cannot be updated or deleted (trigger),
--     and a deferred constraint trigger refuses any transaction whose lines do not
--     sum to zero.
--
-- The ledger and existing cash
--   * The ledger starts with this migration. Cash that already exists (including the
--     ₦50,000 starting cash create_character gives every new player, which is
--     unchanged and still not ledgered) is PRE-LEDGER money: it has no ledger entry.
--   * Every cash change made from now on writes a 'player' line with the signed
--     amount and the player's cash right after it (balance_after). So for each player:
--       players.cash = pre-ledger cash + sum(their ledger lines)
--     where pre-ledger cash = balance_after - amount of their first line. The game's
--     side of each purchase is the 'game:land-sales' account, so money a player
--     spends on land leaves circulation and is recorded, not destroyed silently:
--       sum(players.cash) + sum(game lines) = total pre-ledger cash (constant).
--
-- Fail-safe: plain CREATE (no "or replace", no drops), so if any object already
-- exists the whole migration fails and, applied inside begin; ... commit;, changes
-- nothing. Undo script (not a migration):
-- supabase/rollback/20261020000000_phase3_3a_land_down.sql

do $$
begin
  if to_regclass('public.players') is null then
    raise exception 'public.players does not exist: apply the Phase 1 migration first';
  end if;
end;
$$;

-- ---------------------------------------------------------------- tables

create table public.land_plots (
  id              uuid primary key default gen_random_uuid(),
  plot_key        text not null unique check (plot_key ~ '^[a-z]{1,12}-[0-9]{2}$'),
  location_id     text not null check (location_id in ('kuto-street')),
  tier            text not null check (tier in ('basic', 'standard', 'premium')),
  -- Whole Naira, set by this migration. Never taken from a client.
  price           bigint not null check (price between 1000 and 10000000),
  -- Footprint in map tiles (must match src/features/land/plots.ts; checked by tests).
  tile_x          smallint not null check (tile_x between 0 and 255),
  tile_y          smallint not null check (tile_y between 0 and 255),
  width           smallint not null check (width between 1 and 8),
  depth           smallint not null check (depth between 1 and 8),
  -- The one authoritative owner (null = still owned by the game, for sale).
  -- RESTRICT: a player who owns land cannot be deleted silently.
  owner_player_id uuid references public.players (id) on delete restrict,
  acquired_at     timestamptz,
  created_at      timestamptz not null default now(),
  check ((owner_player_id is null) = (acquired_at is null))
);
create index land_plots_owner_idx on public.land_plots (owner_player_id);

create table public.economy_transactions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('land_purchase')),
  -- The player who made the request (from auth.uid(), never from the client).
  player_id  uuid not null references public.players (id) on delete restrict,
  plot_id    uuid references public.land_plots (id) on delete restrict,
  amount     bigint not null check (amount between 1 and 10000000),
  created_at timestamptz not null default now(),
  check (kind <> 'land_purchase' or plot_id is not null)
);
create index economy_transactions_player_idx on public.economy_transactions (player_id);

create table public.ledger_entries (
  id             bigint generated always as identity primary key,
  transaction_id uuid not null references public.economy_transactions (id) on delete restrict,
  -- 'player' = a player's cash (players.cash); 'game:land-sales' = the game as seller of land.
  account        text not null check (account in ('player', 'game:land-sales')),
  player_id      uuid references public.players (id) on delete restrict,
  -- Signed whole Naira: negative leaves the account, positive enters it.
  amount         bigint not null check (amount <> 0 and amount between -10000000 and 10000000),
  -- Player lines only: players.cash right after this line.
  balance_after  bigint check (balance_after >= 0),
  created_at     timestamptz not null default now(),
  check ((account = 'player') = (player_id is not null)),
  check ((account = 'player') = (balance_after is not null))
);
create index ledger_entries_transaction_idx on public.ledger_entries (transaction_id);
create index ledger_entries_player_idx on public.ledger_entries (player_id);

create table public.economic_requests (
  player_id       uuid not null references public.players (id) on delete restrict,
  idempotency_key uuid not null,
  kind            text not null check (kind in ('land_purchase')),
  plot_id         uuid not null references public.land_plots (id) on delete restrict,
  transaction_id  uuid not null unique references public.economy_transactions (id) on delete restrict,
  created_at      timestamptz not null default now(),
  primary key (player_id, idempotency_key)
);

alter table public.land_plots enable row level security;
alter table public.economy_transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.economic_requests enable row level security;

-- No policies and no privileges for client roles: only the functions below touch these tables.
revoke all on public.land_plots, public.economy_transactions, public.ledger_entries, public.economic_requests from public, anon, authenticated;
revoke all on sequence public.ledger_entries_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------- integrity triggers

-- Financial history is append-only: no UPDATE or DELETE, whoever runs it.
create function public.economy_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows cannot be changed or deleted', tg_table_name using errcode = '42501';
end;
$$;
revoke all on function public.economy_append_only() from public, anon, authenticated;

create trigger economy_transactions_append_only before update or delete on public.economy_transactions
  for each row execute function public.economy_append_only();
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function public.economy_append_only();
create trigger economic_requests_append_only before update or delete on public.economic_requests
  for each row execute function public.economy_append_only();

-- At commit, every transaction that gained ledger lines must have at least two lines summing to 0.
-- SECURITY DEFINER because a deferred trigger fires at COMMIT, after buy_land_plot has
-- returned, as the client role, which may not read ledger_entries.
create function public.ledger_check_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum   numeric;
  v_lines bigint;
begin
  select coalesce(sum(amount), 0), count(*) into v_sum, v_lines
    from public.ledger_entries where transaction_id = new.transaction_id;
  if v_lines < 2 or v_sum <> 0 then
    raise exception 'Ledger transaction % does not balance (lines %, sum %)', new.transaction_id, v_lines, v_sum
      using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function public.ledger_check_balanced() from public, anon, authenticated;

create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.ledger_check_balanced();

-- ---------------------------------------------------------------- seed: 12 Kuto Street plots
-- Coordinates checked against src/game/world/starterArea.ts by src/features/land/placement.test.ts.

insert into public.land_plots (plot_key, location_id, tier, price, tile_x, tile_y, width, depth) values
  ('kuto-01', 'kuto-street', 'standard',  50000, 12,  0, 2, 2),
  ('kuto-02', 'kuto-street', 'standard',  50000, 15,  0, 2, 2),
  ('kuto-03', 'kuto-street', 'basic',     25000, 18,  0, 2, 2),
  ('kuto-04', 'kuto-street', 'premium',  100000, 16,  3, 2, 2),
  ('kuto-05', 'kuto-street', 'premium',  100000,  0,  5, 2, 2),
  ('kuto-06', 'kuto-street', 'premium',  100000, 18, 12, 2, 2),
  ('kuto-07', 'kuto-street', 'basic',     25000,  0, 15, 2, 2),
  ('kuto-08', 'kuto-street', 'basic',     25000,  3, 15, 2, 2),
  ('kuto-09', 'kuto-street', 'basic',     25000, 18, 15, 2, 2),
  ('kuto-10', 'kuto-street', 'standard',  50000,  9, 16, 2, 2),
  ('kuto-11', 'kuto-street', 'standard',  50000, 12, 16, 2, 2),
  ('kuto-12', 'kuto-street', 'standard',  50000, 15, 16, 2, 2);

-- ---------------------------------------------------------------- functions

-- Buy a plot from the game. The caller, the price and the balance all come from the database.
--
-- Errors (SQLSTATE):
--   28000  not signed in            OG403  no character
--   22023  malformed plot key / idempotency key
--   OG404  no such plot             OG409  plot already owned (by anyone, including the caller)
--   OG402  not enough cash          OG422  idempotency key already used for a different request
--
-- Locking: the caller's players row first, then the plot row (always in that order, so
-- two purchases can never deadlock). Two players racing for one plot both reach the plot
-- lock; the second waits, then sees the new owner and gets OG409. Two requests from one
-- player are serialised by the player lock, so a retried idempotency key always sees the
-- first request's result.
create function public.buy_land_plot(p_plot_key text, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_player public.players;
  v_plot   public.land_plots;
  v_req    public.economic_requests;
  v_tx     uuid;
  v_price  bigint;
  v_cash   bigint;
  v_rows   integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to buy land' using errcode = '28000';
  end if;
  if p_plot_key is null or char_length(p_plot_key) > 15 or p_plot_key !~ '^[a-z]{1,12}-[0-9]{2}$' then
    raise exception 'Invalid plot' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing request id' using errcode = '22023';
  end if;

  -- 1. Lock the caller's own player row (serialises everything this player does).
  select * into v_player from public.players where user_id = v_uid for update;
  if not found then
    raise exception 'Create a character before buying land' using errcode = 'OG403';
  end if;

  -- 2. A retry of a request that already succeeded: answer it again, charge nothing.
  select * into v_req from public.economic_requests
    where player_id = v_player.id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_plot from public.land_plots where id = v_req.plot_id;
    if v_req.kind <> 'land_purchase' or v_plot.plot_key <> p_plot_key then
      raise exception 'This request id was already used for something else' using errcode = 'OG422';
    end if;
    return jsonb_build_object(
      'transaction_id', v_req.transaction_id,
      'plot_key', v_plot.plot_key,
      'price', (select t.amount from public.economy_transactions t where t.id = v_req.transaction_id),
      'cash', v_player.cash,
      'owned_by_me', v_plot.owner_player_id = v_player.id,
      'replayed', true);
  end if;

  -- 3. Lock the plot and check it is still for sale.
  select * into v_plot from public.land_plots where plot_key = p_plot_key for update;
  if not found then
    raise exception 'No such plot' using errcode = 'OG404';
  end if;
  if v_plot.owner_player_id is not null then
    raise exception 'This plot has already been sold' using errcode = 'OG409';
  end if;

  -- 4. Price from the registry, within bounds (defence in depth: the column has the same check).
  v_price := v_plot.price;
  if v_price is null or v_price < 1000 or v_price > 10000000 then
    raise exception 'Plot price out of range' using errcode = '22003';
  end if;
  if v_player.cash < v_price then
    raise exception 'Not enough cash' using errcode = 'OG402';
  end if;

  -- 5. Move the money and the land, and record it, all in this one transaction.
  update public.players set cash = cash - v_price
    where id = v_player.id and cash >= v_price
    returning cash into v_cash;
  if not found then
    raise exception 'Not enough cash' using errcode = 'OG402';
  end if;

  update public.land_plots set owner_player_id = v_player.id, acquired_at = now()
    where id = v_plot.id and owner_player_id is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'This plot has already been sold' using errcode = 'OG409';
  end if;

  insert into public.economy_transactions (kind, player_id, plot_id, amount)
    values ('land_purchase', v_player.id, v_plot.id, v_price)
    returning id into v_tx;
  insert into public.ledger_entries (transaction_id, account, player_id, amount, balance_after) values
    (v_tx, 'player', v_player.id, -v_price, v_cash),
    (v_tx, 'game:land-sales', null, v_price, null);
  insert into public.economic_requests (player_id, idempotency_key, kind, plot_id, transaction_id)
    values (v_player.id, p_idempotency_key, 'land_purchase', v_plot.id, v_tx);

  return jsonb_build_object(
    'transaction_id', v_tx,
    'plot_key', v_plot.plot_key,
    'price', v_price,
    'cash', v_cash,
    'owned_by_me', true,
    'replayed', false);
end;
$$;

revoke all on function public.buy_land_plot(text, uuid) from public, anon;
grant execute on function public.buy_land_plot(text, uuid) to authenticated;

-- Every plot, for any player with a character: where it is, its price, and the owner's
-- character name. No player ids, user ids, cash or purchase history.
create function public.get_land_plots()
returns table (
  plot_key text, location_id text, tier text, price bigint,
  tile_x smallint, tile_y smallint, width smallint, depth smallint,
  owner_name text, owned_by_me boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid;
begin
  select p.id into v_me from public.players p where p.user_id = (select auth.uid());
  if v_me is null then
    raise exception 'You need a character to see land' using errcode = '28000';
  end if;
  return query
    select l.plot_key, l.location_id, l.tier, l.price, l.tile_x, l.tile_y, l.width, l.depth,
           o.character_name, coalesce(l.owner_player_id = v_me, false)
      from public.land_plots l
      left join public.players o on o.id = l.owner_player_id
     order by l.plot_key;
end;
$$;

revoke all on function public.get_land_plots() from public, anon;
grant execute on function public.get_land_plots() to authenticated;

-- The caller's own plots, with what they paid and when. Nobody else's.
create function public.get_my_land()
returns table (plot_key text, tier text, price_paid bigint, acquired_at timestamptz, transaction_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid;
begin
  select p.id into v_me from public.players p where p.user_id = (select auth.uid());
  if v_me is null then
    raise exception 'You need a character to see your land' using errcode = '28000';
  end if;
  return query
    select l.plot_key, l.tier, t.amount, l.acquired_at, t.id
      from public.land_plots l
      join lateral (
        select x.id, x.amount from public.economy_transactions x
         where x.plot_id = l.id and x.player_id = v_me and x.kind = 'land_purchase'
         order by x.created_at desc limit 1
      ) t on true
     where l.owner_player_id = v_me
     order by l.plot_key;
end;
$$;

revoke all on function public.get_my_land() from public, anon;
grant execute on function public.get_my_land() to authenticated;
