-- =====================================================================
-- 訂單登記（示範）：Supabase 資料表 order_lines
-- 依出貨表的欄位設計：一列是一筆訂單明細（客戶、訂購日期、品名、售價、數量…）。
-- 示範規則與報修登記相同：任何人可以新增、任何人可以讀取清單，但不能修改或刪除。
--
-- 重要：anon（未登入的瀏覽器）可以讀取整張表，網址公開的人都看得到。
--   示範期間只能填虛構的客戶與價格，不要匯入真實的出貨資料。
--   要放真實資料前，必須先加入登入，並把 select 政策改成只限已登入的員工。
--
-- 本檔只是設計，請在 Supabase 的 SQL Editor 檢查後再執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 一、資料表與 CHECK
-- ---------------------------------------------------------------------
-- id、created_at：資料庫自動產生。
-- order_date：訂購日期，預設今天（台北時間），可由表單指定。
-- total：總售價＝售價×數量，由資料庫計算（generated column），前端無法偽造。
-- status：出貨狀態，新增時一律「未出貨」；修改狀態屬於待決事項（需要登入）。
create table if not exists public.order_lines (
  id            uuid          primary key default gen_random_uuid(),
  created_at    timestamptz   not null    default now(),

  customer      text          not null,
  order_date    date          not null    default (now() at time zone 'Asia/Taipei')::date,
  product       text          not null,
  unit_price    numeric(12,2) not null,
  qty           integer       not null,
  total         numeric(14,2) generated always as (unit_price * qty) stored,
  expected_ship date,
  note          text,
  status        text          not null    default '未出貨',

  constraint order_lines_customer_len check (char_length(btrim(customer)) between 1 and 50),
  constraint order_lines_product_len  check (char_length(btrim(product)) between 1 and 100),
  constraint order_lines_note_len     check (note is null or char_length(note) <= 200),
  constraint order_lines_price_range  check (unit_price >= 0 and unit_price <= 10000000),
  constraint order_lines_qty_range    check (qty between 1 and 1000000),
  constraint order_lines_dates        check (expected_ship is null or expected_ship >= order_date),
  constraint order_lines_order_date   check (order_date between date '2000-01-01' and date '2100-12-31'),
  constraint order_lines_status_allowed check (status in ('未出貨', '部分出貨', '已出貨'))
);

comment on table  public.order_lines               is '訂單登記（示範用，資料皆為虛構）';
comment on column public.order_lines.id            is '編號（系統自動產生）';
comment on column public.order_lines.created_at    is '登記時間（系統自動產生）';
comment on column public.order_lines.customer      is '客戶';
comment on column public.order_lines.order_date    is '訂購日期（預設今天）';
comment on column public.order_lines.product       is '品名';
comment on column public.order_lines.unit_price    is '售價（每單位）';
comment on column public.order_lines.qty           is '數量';
comment on column public.order_lines.total         is '總售價（售價×數量，系統計算）';
comment on column public.order_lines.expected_ship is '預計出貨日';
comment on column public.order_lines.note          is '備註';
comment on column public.order_lines.status        is '出貨狀態：未出貨、部分出貨、已出貨（預設 未出貨）';

create index if not exists order_lines_created_at_idx on public.order_lines (created_at desc);


-- ---------------------------------------------------------------------
-- 二、GRANT：只開放讀取與新增表單欄位
-- ---------------------------------------------------------------------
revoke all on table public.order_lines from anon, authenticated;
grant usage on schema public to anon;
grant select on table public.order_lines to anon;
grant insert (customer, order_date, product, unit_price, qty, expected_ship, note)
  on table public.order_lines to anon;
-- 不給 UPDATE、DELETE、TRUNCATE；不開放 id、created_at、total、status 的寫入。


-- ---------------------------------------------------------------------
-- 三、RLS
-- ---------------------------------------------------------------------
alter table public.order_lines enable row level security;

drop policy if exists "anon 可讀取訂單清單" on public.order_lines;
drop policy if exists "anon 可新增未出貨的訂單" on public.order_lines;

create policy "anon 可讀取訂單清單"
  on public.order_lines
  for select
  to anon
  using (true);

-- 第二道保險：即使 status 的 INSERT 權限被誤開，新資料也只能是「未出貨」。
create policy "anon 可新增未出貨的訂單"
  on public.order_lines
  for insert
  to anon
  with check (status = '未出貨');

-- 沒有 UPDATE、DELETE 政策：anon 無法修改或刪除。


-- ---------------------------------------------------------------------
-- 四、驗證（在 SQL Editor 以 anon 身分模擬瀏覽器）
-- ---------------------------------------------------------------------
-- begin;
--   set local role anon;
--   insert into public.order_lines (customer, product, unit_price, qty)
--     values ('虛構營造', '主架48.6mm T:2.5mm 2.0m 熱浸', 650, 10);      -- 應成功
--   select customer, order_date, total, status from public.order_lines;  -- 應看到 total = 6500、狀態「未出貨」
--   update public.order_lines set qty = 1;                               -- 應失敗：permission denied
--   delete from public.order_lines;                                      -- 應失敗：permission denied
-- rollback;
