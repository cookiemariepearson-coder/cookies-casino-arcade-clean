create extension if not exists pgcrypto;

create table if not exists public.arcade_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null
    check (char_length(display_name) between 1 and 40),
  avatar_key text not null default 'cookie',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arcade_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins integer not null default 10000 check (coins >= 0),
  lifetime_purchased integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.arcade_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  type text not null,
  reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, reference)
);

create index if not exists
  arcade_wallet_transactions_user_created_idx
on public.arcade_wallet_transactions(user_id, created_at desc);

create table if not exists public.arcade_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0 check (xp between 0 and 99),
  vip integer not null default 1 check (vip >= 1),
  settings jsonb not null default
    '{"sound":true,"music":true,"voice":true}'::jsonb,
  game_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.arcade_profiles enable row level security;
alter table public.arcade_wallets enable row level security;
alter table public.arcade_wallet_transactions enable row level security;
alter table public.arcade_progress enable row level security;

drop policy if exists "profiles_select_own"
on public.arcade_profiles;

create policy "profiles_select_own"
on public.arcade_profiles
for select
using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own"
on public.arcade_profiles;

create policy "profiles_update_own"
on public.arcade_profiles
for update
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "wallet_select_own"
on public.arcade_wallets;

create policy "wallet_select_own"
on public.arcade_wallets
for select
using ((select auth.uid()) = user_id);

drop policy if exists "transactions_select_own"
on public.arcade_wallet_transactions;

create policy "transactions_select_own"
on public.arcade_wallet_transactions
for select
using ((select auth.uid()) = user_id);

drop policy if exists "progress_select_own"
on public.arcade_progress;

create policy "progress_select_own"
on public.arcade_progress
for select
using ((select auth.uid()) = user_id);

drop policy if exists "progress_update_own"
on public.arcade_progress;

create policy "progress_update_own"
on public.arcade_progress
for update
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_arcade_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
begin
  base_username := lower(
    regexp_replace(
      coalesce(
        new.raw_user_meta_data->>'username',
        split_part(new.email, '@', 1),
        'player'
      ),
      '[^a-zA-Z0-9_]',
      '',
      'g'
    )
  );

  if char_length(base_username) < 3 then
    base_username := 'player';
  end if;

  base_username := left(base_username, 18);
  final_username :=
    base_username || '_' ||
    substr(replace(new.id::text, '-', ''), 1, 5);

  insert into public.arcade_profiles(
    id,
    username,
    display_name
  )
  values(
    new.id,
    final_username,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'username',
      'Cookie Player'
    )
  )
  on conflict (id) do nothing;

  insert into public.arcade_wallets(user_id, coins)
  values(new.id, 10000)
  on conflict (user_id) do nothing;

  insert into public.arcade_progress(user_id)
  values(new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_arcade_user_created
on auth.users;

create trigger on_arcade_user_created
after insert on auth.users
for each row
execute function public.handle_new_arcade_user();

create or replace function
public.apply_arcade_wallet_transaction(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_reference text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_coins integer;
  next_coins integer;
  tx public.arcade_wallet_transactions;
begin
  select coins
  into current_coins
  from public.arcade_wallets
  where user_id = p_user_id
  for update;

  if current_coins is null then
    insert into public.arcade_wallets(user_id, coins)
    values(p_user_id, 10000)
    returning coins into current_coins;
  end if;

  select *
  into tx
  from public.arcade_wallet_transactions
  where user_id = p_user_id
    and reference = p_reference;

  if tx.id is not null then
    return jsonb_build_object(
      'wallet',
      jsonb_build_object('coins', current_coins),
      'transaction',
      to_jsonb(tx),
      'duplicate',
      true
    );
  end if;

  next_coins := current_coins + p_amount;

  if next_coins < 0 then
    raise exception 'Insufficient coin balance';
  end if;

  update public.arcade_wallets
  set
    coins = next_coins,
    lifetime_purchased =
      lifetime_purchased +
      case
        when p_type = 'coin_purchase'
          and p_amount > 0
        then p_amount
        else 0
      end,
    lifetime_spent =
      lifetime_spent +
      case
        when p_amount < 0
        then abs(p_amount)
        else 0
      end,
    updated_at = now()
  where user_id = p_user_id;

  insert into public.arcade_wallet_transactions(
    user_id,
    amount,
    type,
    reference,
    metadata
  )
  values(
    p_user_id,
    p_amount,
    p_type,
    p_reference,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into tx;

  return jsonb_build_object(
    'wallet',
    jsonb_build_object('coins', next_coins),
    'transaction',
    to_jsonb(tx),
    'duplicate',
    false
  );
end;
$$;

revoke all
on function
public.apply_arcade_wallet_transaction(
  uuid,
  integer,
  text,
  text,
  jsonb
)
from public;

revoke all
on function
public.apply_arcade_wallet_transaction(
  uuid,
  integer,
  text,
  text,
  jsonb
)
from anon;

revoke all
on function
public.apply_arcade_wallet_transaction(
  uuid,
  integer,
  text,
  text,
  jsonb
)
from authenticated;

grant execute
on function
public.apply_arcade_wallet_transaction(
  uuid,
  integer,
  text,
  text,
  jsonb
)
to service_role;


-- Give 10,000 starter coins to existing accounts that have never had a wallet transaction.
update public.arcade_wallets w
set coins = 10000,
    updated_at = now()
where w.coins = 0
  and not exists (
    select 1
    from public.arcade_wallet_transactions t
    where t.user_id = w.user_id
  );

insert into public.arcade_wallet_transactions(
  user_id,
  amount,
  type,
  reference,
  metadata
)
select
  w.user_id,
  10000,
  'starter_bonus',
  'starter_bonus_v1',
  '{"description":"New player starter coins"}'::jsonb
from public.arcade_wallets w
where w.coins = 10000
  and not exists (
    select 1
    from public.arcade_wallet_transactions t
    where t.user_id = w.user_id
      and t.reference = 'starter_bonus_v1'
  );
