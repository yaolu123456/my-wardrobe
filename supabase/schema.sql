-- ============================================================
-- My Wardrobe · Supabase schema
-- 在 Supabase Dashboard → SQL Editor 里整段粘贴执行。
-- ============================================================

-- ---------- 枚举 ----------
-- 配饰拆细了：首饰/帽子/围巾各自成类，推荐时它们是可选槽位。
-- 注意：ALTER TYPE ... ADD VALUE 不能回滚，重复执行靠 exception 兜住。
do $$ begin
  create type category_t as enum ('upper','lower','outer','dress','shoes','bag','accessory');
exception when duplicate_object then null; end $$;

do $$ begin
  alter type category_t add value if not exists 'jewelry';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type category_t add value if not exists 'hat';
exception when duplicate_object then null; end $$;
do $$ begin
  alter type category_t add value if not exists 'scarf';
exception when duplicate_object then null; end $$;

-- 单品适用性别，默认 unisex 让老数据不影响任何人
do $$ begin
  create type gender_t as enum ('men','women','unisex');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pattern_t as enum ('solid','stripe','check','floral','graphic','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type fit_t as enum ('slim','regular','loose');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_t as enum ('active','stored','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type season_t as enum ('spring','summer','autumn','winter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type occasion_t as enum ('work','casual','date','sport','formal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type signal_t as enum ('like','dislike');
exception when duplicate_object then null; end $$;

-- ---------- 单品 ----------
create table if not exists public.items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text,
  category         category_t not null,
  gender           gender_t not null default 'unisex',
  subcategory      text,
  color_name       text,
  color_hex        char(7) not null default '#888888',
  secondary_colors char(7)[] not null default '{}',
  pattern          pattern_t not null default 'solid',
  material         text,
  style_tags       text[] not null default '{}',
  season           season_t[] not null default '{}',
  formality        smallint not null default 3 check (formality between 1 and 5),
  warmth           smallint not null default 3 check (warmth between 1 and 5),
  fit              fit_t not null default 'regular',
  image_url        text,
  cutout_url       text,
  brand            text,
  status           status_t not null default 'active',
  times_worn       integer not null default 0,
  last_worn        date,
  favorite         boolean not null default false,
  notes            text,
  created_at       timestamptz not null default now()
);

create index if not exists items_user_status_idx on public.items (user_id, status);
create index if not exists items_user_category_idx on public.items (user_id, category);

-- ---------- 穿着记录 ----------
create table if not exists public.wear_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  worn_date     date not null default current_date,
  item_ids      uuid[] not null default '{}',
  outfit_title  text,
  occasion      occasion_t,
  temp          numeric(4,1),
  rating        smallint check (rating between 1 and 5),
  note          text,
  created_at    timestamptz not null default now(),
  unique (user_id, worn_date, outfit_title)
);

create index if not exists wear_logs_user_date_idx on public.wear_logs (user_id, worn_date desc);

-- ---------- 显式反馈 ----------
create table if not exists public.feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     uuid references public.items (id) on delete cascade,
  outfit_key  text,
  signal      signal_t not null,
  occasion    occasion_t,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);

-- ---------- RLS：只有本人能读写自己的数据 ----------
alter table public.items     enable row level security;
alter table public.wear_logs enable row level security;
alter table public.feedback  enable row level security;

drop policy if exists items_all on public.items;
create policy items_all on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists wear_logs_all on public.wear_logs;
create policy wear_logs_all on public.wear_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists feedback_all on public.feedback;
create policy feedback_all on public.feedback
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- 穿一次就顺手更新统计 ----------
create or replace function public.bump_item_wear()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.items i
     set times_worn = i.times_worn + 1,
         last_worn  = greatest(coalesce(i.last_worn, new.worn_date), new.worn_date)
   where i.user_id = new.user_id
     and i.id = any (new.item_ids);
  return new;
end $$;

drop trigger if exists wear_logs_bump on public.wear_logs;
create trigger wear_logs_bump
  after insert on public.wear_logs
  for each row execute function public.bump_item_wear();

-- ---------- 图片存储桶 ----------
insert into storage.buckets (id, name, public)
values ('wardrobe', 'wardrobe', true)
on conflict (id) do nothing;

drop policy if exists wardrobe_read on storage.objects;
create policy wardrobe_read on storage.objects
  for select using (bucket_id = 'wardrobe');

drop policy if exists wardrobe_write on storage.objects;
create policy wardrobe_write on storage.objects
  for insert with check (bucket_id = 'wardrobe' and auth.uid() is not null);

drop policy if exists wardrobe_delete on storage.objects;
create policy wardrobe_delete on storage.objects
  for delete using (bucket_id = 'wardrobe' and auth.uid() is not null);

-- ---------- 迁移：已有项目补 gender 列 ----------
-- 上面的 create table 只在建表时生效；已经建过的项目跑这一段。
alter table public.items
  add column if not exists gender gender_t not null default 'unisex';

create index if not exists items_user_gender_idx on public.items (user_id, gender);
