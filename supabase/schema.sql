-- =====================================================================
-- 報修登記系統：Supabase 資料表 repair_requests
-- 依《報修需求筆記.txt》的示範規則設計：
--   任何人可以新增、任何人可以讀取清單，但不能修改或刪除。
-- 安全分三層：CHECK（資料本身的限制）、GRANT（角色能碰哪些欄位與動作）、
--   RLS（每一列能不能被讀取或新增）。三層互相補位，任何一層出錯時另外兩層仍有保護。
-- 本檔只是設計，請在 Supabase 的 SQL Editor 檢查後再執行。
-- =====================================================================


-- ---------------------------------------------------------------------
-- 一、建立資料表，並用 CHECK 限制欄位值與文字長度
-- ---------------------------------------------------------------------
-- id：主鍵，由資料庫用 gen_random_uuid() 自動產生，前端不需要也不能指定。
-- created_at：建立時間，由資料庫用 now() 自動產生（含時區）。
-- reporter_name、location、description：必填，去掉前後空白後不能是空字串，並限制最大長度，
--   避免空白資料或超長文字塞爆資料表。長度上限是暫定值，需求筆記未規定（待確認）。
-- category、urgency、status：只能是需求筆記列出的值。
-- urgency 預設「中」；status 預設「待處理」。
create table if not exists public.repair_requests (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null    default now(),

  reporter_name text        not null,
  location      text        not null,
  category      text        not null,
  description   text        not null,
  urgency       text        not null    default '中',
  status        text        not null    default '待處理',

  -- 文字長度：去掉前後空白後至少 1 個字，並設上限
  constraint repair_requests_reporter_name_len
    check (char_length(btrim(reporter_name)) between 1 and 50),
  constraint repair_requests_location_len
    check (char_length(btrim(location)) between 1 and 100),
  constraint repair_requests_description_len
    check (char_length(btrim(description)) between 1 and 1000),

  -- 允許值：類別、緊急程度、處理狀態
  constraint repair_requests_category_allowed
    check (category in ('設備', '網路', '環境', '其他')),
  constraint repair_requests_urgency_allowed
    check (urgency in ('低', '中', '高')),
  constraint repair_requests_status_allowed
    check (status in ('待處理', '處理中', '已完成'))
);

comment on table  public.repair_requests               is '報修登記（示範用，資料皆為虛構）';
comment on column public.repair_requests.id            is '編號（系統自動產生）';
comment on column public.repair_requests.created_at    is '登記時間（系統自動產生）';
comment on column public.repair_requests.reporter_name is '報修人姓名';
comment on column public.repair_requests.location      is '地點或部門';
comment on column public.repair_requests.category      is '類別：設備、網路、環境、其他';
comment on column public.repair_requests.description   is '問題說明';
comment on column public.repair_requests.urgency       is '緊急程度：低、中、高（預設 中）';
comment on column public.repair_requests.status        is '處理狀態：待處理、處理中、已完成（預設 待處理）';


-- ---------------------------------------------------------------------
-- 二、GRANT：明確授權（本專案不會自動開放新資料表）
-- ---------------------------------------------------------------------
-- 先收回 anon（未登入的瀏覽器）與 authenticated（已登入使用者）的所有權限，
--   確保起點是「什麼都不能做」，不依賴專案的預設權限。
-- 本次示範不做登入，所以 authenticated 不給任何權限；之後若加入登入再另外設計。
revoke all on table public.repair_requests from anon, authenticated;

-- anon 需要能使用 public schema 才能存取其中的資料表（Supabase 通常已給，這裡寫明以免遺漏）。
grant usage on schema public to anon;

-- 讀取：anon 可以讀取整張清單。
grant select on table public.repair_requests to anon;

-- 新增：只開放表單需要填的欄位。
--   不開放 id、created_at：一律由資料庫自動產生，前端無法偽造時間或編號。
--   不開放 status：新增時一律使用預設值「待處理」，前端無法直接送出「已完成」。
grant insert (reporter_name, location, category, description, urgency)
  on table public.repair_requests to anon;

-- 修改、刪除：不給 anon 任何 UPDATE、DELETE、TRUNCATE 權限（上面的 revoke all 已全部收回）。


-- ---------------------------------------------------------------------
-- 三、RLS：啟用資料列安全，並逐條定義允許的動作
-- ---------------------------------------------------------------------
-- 啟用後，沒有政策（policy）允許的動作一律被拒絕。
alter table public.repair_requests enable row level security;

-- 重新執行本檔時先移除同名政策，避免重複建立而出錯。
drop policy if exists "anon 可讀取報修清單" on public.repair_requests;
drop policy if exists "anon 可新增待處理的報修" on public.repair_requests;

-- 讀取政策：任何人（anon）都可以讀取每一筆報修。
create policy "anon 可讀取報修清單"
  on public.repair_requests
  for select
  to anon
  using (true);

-- 新增政策：任何人（anon）都可以新增，但新資料的 status 必須是「待處理」。
--   GRANT 已經不讓 anon 指定 status，這條是第二道保險：
--   即使日後有人誤把 status 欄位的 INSERT 權限開給 anon，仍無法新增其他狀態。
create policy "anon 可新增待處理的報修"
  on public.repair_requests
  for insert
  to anon
  with check (status = '待處理');

-- 不建立 UPDATE、DELETE 政策：RLS 下沒有政策就等於拒絕，
--   與 GRANT 一起形成兩道防線，anon 無法修改或刪除任何資料。
