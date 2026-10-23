-- OGUN STATE LIFESTYLE — Phase 3.4A: jobs (earning money) and shops (spending it).
--
-- Adds:
--   * public.jobs          job catalogue (pay and shift length are set HERE, never by a client).
--   * public.job_shifts    one row per shift a player works; at most one active shift per player.
--   * public.shop_items    shop catalogue (prices set HERE).
--   * public.start_job_shift(job_key)                   start a timed shift.
--   * public.claim_job_shift(idempotency_key)           after the shift ends: get paid, once.
--   * public.abandon_job_shift()                        give up the active shift (no pay).
--   * public.get_my_jobs()                              jobs, the active shift, today's count, server time.
--   * public.get_shop(shop_key)                         a shop's items and prices.
--   * public.buy_shop_item(item_key, quantity, idempotency_key)  buy into the inventory.
--
-- Extends the Phase 3.3A economy DELIBERATELY (every money movement still goes through it):
--   * economy_transactions.kind:  + 'job_payout', 'shop_purchase' (with job_shift_id / item_key / quantity)
--   * ledger_entries.account:     + 'game:wages' (the game paying wages), 'game:shop-sales'
--   * economic_requests.kind:     + 'job_payout', 'shop_purchase' (plot_id only required for land)
-- Existing rows already satisfy the widened rules; nothing existing is updated or deleted.
--
-- Money rules (same as land): the caller is auth.uid(); amounts come from the catalogues;
-- the caller's players row is locked first (serialising everything one player does); cash,
-- ownership/inventory, the transaction, its two balanced ledger lines and the stored request
-- id are written in ONE transaction; a retried request id returns the first answer.
-- Wages are new money entering the game: a 'game:wages' line of -pay balances the player's +pay,
-- so sum(players.cash) + sum(all game lines) stays equal to total pre-ledger cash.
--
-- Fail-safe: plain CREATE; applied inside begin; ... commit; it changes nothing if anything fails.
-- Undo (not a migration): supabase/rollback/20261023000000_phase3_4a_jobs_shops_down.sql

do $$
begin
  if to_regclass('public.economy_transactions') is null or to_regprocedure('public.buy_land_plot(text,uuid)') is null then
    raise exception 'Phase 3.3A (land) must be applied first';
  end if;
end;
$$;

-- ---------------------------------------------------------------- catalogues

create table public.jobs (
  job_key          text primary key check (job_key ~ '^[a-z][a-z0-9-]{1,30}$'),
  title            text not null check (char_length(title) between 1 and 60),
  description      text not null check (char_length(description) between 1 and 200),
  location_id      text not null check (location_id in ('kuto-street')),
  -- Whole Naira per completed shift, and the shift length. Set by migrations only.
  pay              bigint not null check (pay between 100 and 100000),
  duration_seconds integer not null check (duration_seconds between 10 and 3600),
  active           boolean not null default true
);

create table public.shop_items (
  item_key         text primary key check (item_key ~ '^[a-z][a-z0-9-]{1,30}$'),
  shop_key         text not null check (shop_key in ('buka', 'mama-t-stores')),
  name             text not null check (char_length(name) between 1 and 60),
  price            bigint not null check (price between 10 and 1000000),
  max_per_purchase integer not null default 10 check (max_per_purchase between 1 and 20),
  active           boolean not null default true
);

-- ---------------------------------------------------------------- shifts

create table public.job_shifts (
  id             uuid primary key default gen_random_uuid(),
  player_id      uuid not null references public.players (id) on delete restrict,
  job_key        text not null references public.jobs (job_key) on delete restrict,
  -- Pay is fixed when the shift starts (a later catalogue change does not alter it).
  pay            bigint not null check (pay between 100 and 100000),
  started_at     timestamptz not null default now(),
  ends_at        timestamptz not null,
  status         text not null default 'working' check (status in ('working', 'paid', 'abandoned')),
  finished_at    timestamptz,
  transaction_id uuid unique references public.economy_transactions (id) on delete restrict,
  check (ends_at > started_at),
  check ((status = 'paid') = (transaction_id is not null)),
  check ((status = 'working') = (finished_at is null))
);
-- At most one shift in progress per player (also stops double-click starts).
create unique index job_shifts_one_active_idx on public.job_shifts (player_id) where status = 'working';
create index job_shifts_player_started_idx on public.job_shifts (player_id, started_at desc);

-- Finished shifts are history: they cannot change. A working shift may only move to paid or
-- abandoned, and its player, job, pay and times can never be edited. No shift is ever deleted.
create function public.job_shifts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'job_shifts rows cannot be deleted' using errcode = '42501';
  end if;
  if old.status <> 'working' then
    raise exception 'a finished shift cannot be changed' using errcode = '42501';
  end if;
  if new.player_id <> old.player_id or new.job_key <> old.job_key or new.pay <> old.pay
     or new.started_at <> old.started_at or new.ends_at <> old.ends_at or new.status = 'working' then
    raise exception 'only the status of a working shift can change' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.job_shifts_guard() from public, anon, authenticated;
create trigger job_shifts_guard before update or delete on public.job_shifts
  for each row execute function public.job_shifts_guard();

-- ---------------------------------------------------------------- widen the economy (deliberately)

alter table public.economy_transactions
  drop constraint economy_transactions_kind_check,
  add constraint economy_transactions_kind_check check (kind in ('land_purchase', 'job_payout', 'shop_purchase')),
  add column job_shift_id uuid references public.job_shifts (id) on delete restrict,
  add column item_key     text references public.shop_items (item_key) on delete restrict,
  add column quantity     integer,
  -- Each kind carries exactly its own details. (Every test is written to be TRUE or FALSE, never NULL:
  -- a CHECK whose expression is NULL passes.)
  add constraint economy_transactions_details_check check (
       (kind = 'land_purchase' and plot_id is not null and job_shift_id is null and item_key is null and quantity is null)
    or (kind = 'job_payout'    and plot_id is null and job_shift_id is not null and item_key is null and quantity is null)
    or (kind = 'shop_purchase' and plot_id is null and job_shift_id is null and item_key is not null and quantity is not null and quantity between 1 and 20));
create unique index economy_transactions_job_shift_idx on public.economy_transactions (job_shift_id) where job_shift_id is not null;

alter table public.ledger_entries
  drop constraint ledger_entries_account_check,
  add constraint ledger_entries_account_check check (account in ('player', 'game:land-sales', 'game:wages', 'game:shop-sales'));

alter table public.economic_requests
  drop constraint economic_requests_kind_check,
  add constraint economic_requests_kind_check check (kind in ('land_purchase', 'job_payout', 'shop_purchase')),
  alter column plot_id drop not null,
  add constraint economic_requests_plot_check check (kind <> 'land_purchase' or plot_id is not null);

-- ---------------------------------------------------------------- access

alter table public.jobs enable row level security;
alter table public.job_shifts enable row level security;
alter table public.shop_items enable row level security;
revoke all on public.jobs, public.job_shifts, public.shop_items from public, anon, authenticated;

-- ---------------------------------------------------------------- seed

insert into public.jobs (job_key, title, description, location_id, pay, duration_seconds) values
  ('buka-helper',   'Help at Iya Basira Buka', 'Wash plates and serve amala during the lunch rush.',   'kuto-street', 1500, 120),
  ('pos-attendant', 'Mind the Blessed POS',    'Handle transfers and recharge cards at the POS stand.', 'kuto-street', 4000, 300),
  ('okada-rider',   'Ride an okada',           'Carry passengers around Kuto on a borrowed okada.',     'kuto-street', 9000, 600);

insert into public.shop_items (item_key, shop_key, name, price, max_per_purchase) values
  ('puff-puff',    'buka',          'Puff-puff (5 pieces)',  300, 10),
  ('amala-plate',  'buka',          'Amala, ewedu & gbegiri', 1500, 5),
  ('zobo',         'buka',          'Cold zobo',              400, 10),
  ('water-sachet', 'mama-t-stores', 'Pure water sachet',      50, 20),
  ('bread',        'mama-t-stores', 'Agege bread',            800, 10),
  ('adire-scarf',  'mama-t-stores', 'Adire scarf',            6500, 2);

-- ---------------------------------------------------------------- functions

-- Rolling 24-hour cap on shifts started (working, paid or abandoned) per player.
-- Errors (SQLSTATE): 28000 not signed in, OG403 no character, 22023 bad input,
-- OG404 no such job / no active shift / no such item, OG409 already working / bag full,
-- OG425 shift not finished yet, OG429 daily shift limit reached, OG402 not enough cash,
-- OG422 request id already used for something else.

create function public.start_job_shift(p_job_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_player public.players;
  v_job    public.jobs;
  v_shift  public.job_shifts;
  v_today  integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in to work' using errcode = '28000';
  end if;
  if p_job_key is null or p_job_key !~ '^[a-z][a-z0-9-]{1,30}$' then
    raise exception 'Invalid job' using errcode = '22023';
  end if;
  select * into v_player from public.players where user_id = v_uid for update;
  if not found then
    raise exception 'Create a character before working' using errcode = 'OG403';
  end if;
  select * into v_job from public.jobs where job_key = p_job_key and active;
  if not found then
    raise exception 'No such job' using errcode = 'OG404';
  end if;
  if exists (select 1 from public.job_shifts where player_id = v_player.id and status = 'working') then
    raise exception 'You are already working a shift' using errcode = 'OG409';
  end if;
  select count(*) into v_today from public.job_shifts
   where player_id = v_player.id and started_at > now() - interval '24 hours';
  if v_today >= 20 then
    raise exception 'You have worked enough shifts for today. Rest and come back later.' using errcode = 'OG429';
  end if;
  insert into public.job_shifts (player_id, job_key, pay, ends_at)
    values (v_player.id, v_job.job_key, v_job.pay, now() + make_interval(secs => v_job.duration_seconds))
    returning * into v_shift;
  return jsonb_build_object(
    'shift_id', v_shift.id, 'job_key', v_shift.job_key, 'pay', v_shift.pay,
    'started_at', v_shift.started_at, 'ends_at', v_shift.ends_at, 'server_now', now());
end;
$$;

create function public.claim_job_shift(p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_player public.players;
  v_req    public.economic_requests;
  v_shift  public.job_shifts;
  v_tx     uuid;
  v_cash   bigint;
begin
  if v_uid is null then
    raise exception 'You must be signed in to get paid' using errcode = '28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing request id' using errcode = '22023';
  end if;
  select * into v_player from public.players where user_id = v_uid for update;
  if not found then
    raise exception 'Create a character before working' using errcode = 'OG403';
  end if;

  -- A retry of a claim that already paid: answer again, pay nothing.
  select * into v_req from public.economic_requests where player_id = v_player.id and idempotency_key = p_idempotency_key;
  if found then
    if v_req.kind <> 'job_payout' then
      raise exception 'This request id was already used for something else' using errcode = 'OG422';
    end if;
    select s.* into v_shift from public.job_shifts s where s.transaction_id = v_req.transaction_id;
    return jsonb_build_object('transaction_id', v_req.transaction_id, 'shift_id', v_shift.id, 'job_key', v_shift.job_key,
                              'pay', v_shift.pay, 'cash', v_player.cash, 'replayed', true);
  end if;

  select * into v_shift from public.job_shifts where player_id = v_player.id and status = 'working' for update;
  if not found then
    raise exception 'You have no shift to claim' using errcode = 'OG404';
  end if;
  if now() < v_shift.ends_at then
    raise exception 'Your shift is not finished yet' using errcode = 'OG425';
  end if;
  if v_shift.pay < 100 or v_shift.pay > 100000 then
    raise exception 'Shift pay out of range' using errcode = '22003';
  end if;

  update public.players set cash = cash + v_shift.pay where id = v_player.id returning cash into v_cash;
  insert into public.economy_transactions (kind, player_id, job_shift_id, amount)
    values ('job_payout', v_player.id, v_shift.id, v_shift.pay) returning id into v_tx;
  insert into public.ledger_entries (transaction_id, account, player_id, amount, balance_after) values
    (v_tx, 'player', v_player.id, v_shift.pay, v_cash),
    (v_tx, 'game:wages', null, -v_shift.pay, null);
  update public.job_shifts set status = 'paid', finished_at = now(), transaction_id = v_tx where id = v_shift.id;
  insert into public.economic_requests (player_id, idempotency_key, kind, transaction_id)
    values (v_player.id, p_idempotency_key, 'job_payout', v_tx);

  return jsonb_build_object('transaction_id', v_tx, 'shift_id', v_shift.id, 'job_key', v_shift.job_key,
                            'pay', v_shift.pay, 'cash', v_cash, 'replayed', false);
end;
$$;

create function public.abandon_job_shift()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_player public.players;
  v_rows   integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in' using errcode = '28000';
  end if;
  select * into v_player from public.players where user_id = v_uid for update;
  if not found then
    raise exception 'Create a character first' using errcode = 'OG403';
  end if;
  update public.job_shifts set status = 'abandoned', finished_at = now()
   where player_id = v_player.id and status = 'working';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'You have no shift to stop' using errcode = 'OG404';
  end if;
  return jsonb_build_object('abandoned', true);
end;
$$;

create function public.get_my_jobs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
begin
  select p.id into v_me from public.players p where p.user_id = (select auth.uid());
  if v_me is null then
    raise exception 'You need a character to see jobs' using errcode = '28000';
  end if;
  return jsonb_build_object(
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job_key', j.job_key, 'title', j.title, 'description', j.description,
                       'location_id', j.location_id, 'pay', j.pay, 'duration_seconds', j.duration_seconds) order by j.pay)
                     from public.jobs j where j.active), '[]'::jsonb),
    'active', (select jsonb_build_object('shift_id', s.id, 'job_key', s.job_key, 'pay', s.pay, 'started_at', s.started_at, 'ends_at', s.ends_at)
                 from public.job_shifts s where s.player_id = v_me and s.status = 'working'),
    'shifts_today', (select count(*) from public.job_shifts s where s.player_id = v_me and s.started_at > now() - interval '24 hours'),
    'daily_limit', 20,
    'server_now', now());
end;
$$;

create function public.get_shop(p_shop_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.players p where p.user_id = (select auth.uid())) then
    raise exception 'You need a character to shop' using errcode = '28000';
  end if;
  if p_shop_key is null or p_shop_key not in ('buka', 'mama-t-stores') then
    raise exception 'No such shop' using errcode = 'OG404';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('item_key', i.item_key, 'name', i.name, 'price', i.price,
                     'max_per_purchase', i.max_per_purchase) order by i.price)
                   from public.shop_items i where i.shop_key = p_shop_key and i.active), '[]'::jsonb);
end;
$$;

create function public.buy_shop_item(p_item_key text, p_quantity integer, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_player public.players;
  v_req    public.economic_requests;
  v_item   public.shop_items;
  v_inv    uuid;
  v_have   integer;
  v_total  bigint;
  v_cash   bigint;
  v_tx     uuid;
  v_prev   public.economy_transactions;
begin
  if v_uid is null then
    raise exception 'You must be signed in to shop' using errcode = '28000';
  end if;
  if p_item_key is null or p_item_key !~ '^[a-z][a-z0-9-]{1,30}$' or p_quantity is null or p_quantity < 1 or p_quantity > 20 then
    raise exception 'Invalid item or quantity' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Missing request id' using errcode = '22023';
  end if;
  select * into v_player from public.players where user_id = v_uid for update;
  if not found then
    raise exception 'Create a character before shopping' using errcode = 'OG403';
  end if;
  select id into v_inv from public.inventories where player_id = v_player.id;
  if v_inv is null then
    raise exception 'Your inventory is missing' using errcode = 'OG404';
  end if;

  -- A retry of a purchase that already went through: answer again, charge nothing.
  select * into v_req from public.economic_requests where player_id = v_player.id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_prev from public.economy_transactions where id = v_req.transaction_id;
    if v_req.kind <> 'shop_purchase' or v_prev.item_key <> p_item_key or v_prev.quantity <> p_quantity then
      raise exception 'This request id was already used for something else' using errcode = 'OG422';
    end if;
    select coalesce((select quantity from public.inventory_items where inventory_id = v_inv and item_key = p_item_key), 0) into v_have;
    return jsonb_build_object('transaction_id', v_prev.id, 'item_key', p_item_key, 'quantity', p_quantity, 'total', v_prev.amount,
                              'cash', v_player.cash, 'owned', v_have, 'replayed', true);
  end if;

  select * into v_item from public.shop_items where item_key = p_item_key and active;
  if not found then
    raise exception 'No such item for sale' using errcode = 'OG404';
  end if;
  if p_quantity > v_item.max_per_purchase then
    raise exception 'You can buy at most % at a time', v_item.max_per_purchase using errcode = '22023';
  end if;
  v_total := v_item.price * p_quantity;
  if v_total < 10 or v_total > 10000000 then
    raise exception 'Purchase total out of range' using errcode = '22003';
  end if;
  if v_player.cash < v_total then
    raise exception 'Not enough cash' using errcode = 'OG402';
  end if;
  select quantity into v_have from public.inventory_items where inventory_id = v_inv and item_key = p_item_key for update;
  if coalesce(v_have, 0) + p_quantity > 999 then
    raise exception 'Your bag cannot hold more of that' using errcode = 'OG409';
  end if;

  update public.players set cash = cash - v_total where id = v_player.id and cash >= v_total returning cash into v_cash;
  if not found then
    raise exception 'Not enough cash' using errcode = 'OG402';
  end if;
  insert into public.inventory_items (inventory_id, item_key, quantity) values (v_inv, p_item_key, p_quantity)
    on conflict (inventory_id, item_key) do update set quantity = public.inventory_items.quantity + excluded.quantity
    returning quantity into v_have;
  insert into public.economy_transactions (kind, player_id, item_key, quantity, amount)
    values ('shop_purchase', v_player.id, p_item_key, p_quantity, v_total) returning id into v_tx;
  insert into public.ledger_entries (transaction_id, account, player_id, amount, balance_after) values
    (v_tx, 'player', v_player.id, -v_total, v_cash),
    (v_tx, 'game:shop-sales', null, v_total, null);
  insert into public.economic_requests (player_id, idempotency_key, kind, transaction_id)
    values (v_player.id, p_idempotency_key, 'shop_purchase', v_tx);

  return jsonb_build_object('transaction_id', v_tx, 'item_key', p_item_key, 'quantity', p_quantity, 'total', v_total,
                            'cash', v_cash, 'owned', v_have, 'replayed', false);
end;
$$;

revoke all on function public.start_job_shift(text) from public, anon;
revoke all on function public.claim_job_shift(uuid) from public, anon;
revoke all on function public.abandon_job_shift() from public, anon;
revoke all on function public.get_my_jobs() from public, anon;
revoke all on function public.get_shop(text) from public, anon;
revoke all on function public.buy_shop_item(text, integer, uuid) from public, anon;
grant execute on function public.start_job_shift(text) to authenticated;
grant execute on function public.claim_job_shift(uuid) to authenticated;
grant execute on function public.abandon_job_shift() to authenticated;
grant execute on function public.get_my_jobs() to authenticated;
grant execute on function public.get_shop(text) to authenticated;
grant execute on function public.buy_shop_item(text, integer, uuid) to authenticated;
