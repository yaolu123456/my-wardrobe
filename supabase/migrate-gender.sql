-- ============================================================
-- 迁移：男装/女装 + 首饰/帽子/围巾
--
-- 什么时候跑：接入真实 Supabase 账号之前，在 Supabase Dashboard
-- 的 SQL Editor 里整段粘进去执行一次。可以重复执行，不会报错。
--
-- 已经跑过 `supabase/schema.sql` 全量的项目不需要再跑这个文件，
-- 因为 schema.sql 里已经包含同样的语句。
-- ============================================================

-- 1. 新的单品类别 --------------------------------------------------
-- Postgres 的 ALTER TYPE ... ADD VALUE 不能在事务块里跑，
-- 所以这里逐条执行，Supabase SQL Editor 默认自动提交，没问题。
alter type category_t add value if not exists 'jewelry';
alter type category_t add value if not exists 'hat';
alter type category_t add value if not exists 'scarf';

-- 2. 性别维度 ------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'gender_t') then
    create type gender_t as enum ('men', 'women', 'unisex');
  end if;
end $$;

alter table public.items
  add column if not exists gender gender_t not null default 'unisex';

create index if not exists items_user_gender_idx
  on public.items (user_id, gender);

-- 3. 自检 ----------------------------------------------------------
-- 跑完这段应该看到：gender 列存在、三个新枚举值都在。
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'items' and column_name = 'gender') as gender_column,
  (select count(*) from pg_enum e
     join pg_type t on t.oid = e.enumtypid
    where t.typname = 'category_t'
      and e.enumlabel in ('jewelry', 'hat', 'scarf')) as new_categories;
