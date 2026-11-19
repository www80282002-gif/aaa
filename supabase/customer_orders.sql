-- =====================================================================
-- 客戶訂單：Supabase 資料表 customer_orders（真實資料，需登入）
--
-- 存取規則：
--   * anon（未登入）：什麼都不能做，看不到任何一筆。
--   * authenticated（已登入）：只有列在 allowed_users 的帳號可以讀取、新增、修改、刪除。
--     就算有人自行註冊成功，不在 allowed_users 裡也看不到資料。
--
-- 執行前請先在 Supabase 後台建立你的登入帳號（見 README「客戶訂單」一節），
-- 然後在 SQL Editor 執行本檔，最後執行檔案最後的「五、加入允許的帳號」。
-- 本檔可以重複執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 一、允許使用的帳號
-- ---------------------------------------------------------------------
create table if not exists public.allowed_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note    text
);
alter table public.allowed_users enable row level security;
revoke all on table public.allowed_users from anon, authenticated;
-- 不建立任何政策：前端讀不到這張表，只能透過下面的函式判斷。

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.allowed_users where user_id = auth.uid());
$$;
revoke execute on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;


-- ---------------------------------------------------------------------
-- 二、訂單明細
-- ---------------------------------------------------------------------
-- 歷史資料有缺漏（沒有售價、數量或訂購日期），所以這些欄位允許空白；
-- 網頁新增時會要求填寫。
create table if not exists public.customer_orders (
  id             uuid          primary key default gen_random_uuid(),
  created_at     timestamptz   not null    default now(),
  updated_at     timestamptz   not null    default now(),

  customer       text          not null,
  order_date     date,
  product        text          not null,
  unit_price     numeric(12,2),
  qty            numeric(12,2),
  total          numeric(16,2) generated always as (unit_price * qty) stored,
  expected_ship  date,
  ship_date      date,
  shipped_qty    numeric(12,2),
  status         text          not null    default '未出貨',
  note           text,
  payment_note   text,
  data_issue     text,
  source         text          unique,

  constraint customer_orders_customer_len check (char_length(btrim(customer)) between 1 and 50),
  constraint customer_orders_product_len  check (char_length(btrim(product)) between 1 and 200),
  constraint customer_orders_note_len     check (note is null or char_length(note) <= 500),
  constraint customer_orders_price_range  check (unit_price is null or unit_price >= 0),
  constraint customer_orders_qty_range    check (qty is null or qty >= 0),
  constraint customer_orders_shipped      check (shipped_qty is null or shipped_qty >= 0),
  constraint customer_orders_status_allowed check (status in ('未出貨', '部分出貨', '已出貨'))
);

comment on table  public.customer_orders              is '客戶訂單明細（真實資料，僅限 allowed_users）';
comment on column public.customer_orders.customer     is '客戶';
comment on column public.customer_orders.order_date   is '訂購日期';
comment on column public.customer_orders.product      is '品名';
comment on column public.customer_orders.unit_price   is '售價';
comment on column public.customer_orders.qty          is '數量';
comment on column public.customer_orders.total        is '總售價（售價×數量，系統計算）';
comment on column public.customer_orders.expected_ship is '預計出貨日';
comment on column public.customer_orders.ship_date    is '出貨日';
comment on column public.customer_orders.shipped_qty  is '出貨數量';
comment on column public.customer_orders.status       is '出貨狀態：未出貨、部分出貨、已出貨';
comment on column public.customer_orders.note         is '備註';
comment on column public.customer_orders.payment_note is '帳款資訊（從舊 Excel 帶入的帳款、帳款日期、款日期、票期）';
comment on column public.customer_orders.data_issue   is '匯入時發現的資料問題，確認後可清空';
comment on column public.customer_orders.source       is '來源（舊 Excel 的工作表!列號），避免重複匯入';

create index if not exists customer_orders_customer_idx on public.customer_orders (customer, order_date desc);
create index if not exists customer_orders_date_idx     on public.customer_orders (order_date desc);
create index if not exists customer_orders_status_idx   on public.customer_orders (status);

-- 修改時自動更新 updated_at
create or replace function public.customer_orders_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists customer_orders_touch on public.customer_orders;
create trigger customer_orders_touch
  before update on public.customer_orders
  for each row execute function public.customer_orders_touch();


-- ---------------------------------------------------------------------
-- 三、權限：anon 全部收回；authenticated 交給 RLS 判斷是否在 allowed_users
-- ---------------------------------------------------------------------
revoke all on table public.customer_orders from anon, authenticated;
grant select, delete on table public.customer_orders to authenticated;
grant insert (customer, order_date, product, unit_price, qty, expected_ship, ship_date,
              shipped_qty, status, note, payment_note, data_issue, source)
  on table public.customer_orders to authenticated;
grant update (customer, order_date, product, unit_price, qty, expected_ship, ship_date,
              shipped_qty, status, note, payment_note, data_issue)
  on table public.customer_orders to authenticated;

alter table public.customer_orders enable row level security;

drop policy if exists "允許的帳號可讀取" on public.customer_orders;
drop policy if exists "允許的帳號可新增" on public.customer_orders;
drop policy if exists "允許的帳號可修改" on public.customer_orders;
drop policy if exists "允許的帳號可刪除" on public.customer_orders;

create policy "允許的帳號可讀取" on public.customer_orders
  for select to authenticated using (public.is_allowed_user());
create policy "允許的帳號可新增" on public.customer_orders
  for insert to authenticated with check (public.is_allowed_user());
create policy "允許的帳號可修改" on public.customer_orders
  for update to authenticated using (public.is_allowed_user()) with check (public.is_allowed_user());
create policy "允許的帳號可刪除" on public.customer_orders
  for delete to authenticated using (public.is_allowed_user());


-- ---------------------------------------------------------------------
-- 四、統計 view（security_invoker：沿用呼叫者的 RLS，未授權的人查到 0 筆）
-- ---------------------------------------------------------------------
create or replace view public.customer_order_summary
with (security_invoker = true) as
select
  customer,
  count(*)                                              as lines,
  min(order_date)                                       as first_order,
  max(order_date)                                       as last_order,
  coalesce(sum(total), 0)                               as total,
  count(*) filter (where status <> '已出貨')             as open_lines,
  count(*) filter (where data_issue is not null)        as issue_lines
from public.customer_orders
group by customer;

create or replace view public.customer_year_totals
with (security_invoker = true) as
select
  customer,
  extract(year from order_date)::int as year,
  count(*)                           as lines,
  coalesce(sum(total), 0)            as total
from public.customer_orders
where order_date is not null
group by customer, extract(year from order_date);

revoke all on public.customer_order_summary, public.customer_year_totals from anon, authenticated;
grant select on public.customer_order_summary, public.customer_year_totals to authenticated;


-- ---------------------------------------------------------------------
-- 先前的示範表 order_lines（任何人可讀）：收回 anon 權限，避免被誤用來放真實資料
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.order_lines') is not null then
    revoke all on table public.order_lines from anon, authenticated;
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 五、加入允許的帳號（把 Email 換成你在 Authentication 建立的帳號，再單獨執行）
-- ---------------------------------------------------------------------
-- insert into public.allowed_users (user_id, note)
--   select id, '老闆' from auth.users where email = '換成你的 Email'
--   on conflict (user_id) do nothing;
--
-- 確認：應回傳 1 列
-- select u.email from public.allowed_users a join auth.users u on u.id = a.user_id;


-- ---------------------------------------------------------------------
-- 六、驗證（未登入的瀏覽器不能讀寫）
-- ---------------------------------------------------------------------
-- begin;
--   set local role anon;
--   select count(*) from public.customer_orders;   -- 應失敗：permission denied
--   insert into public.customer_orders (customer, product) values ('測試', '測試');  -- 應失敗
-- rollback;
