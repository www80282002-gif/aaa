# 報修登記系統
用於登記報修與問題，並集中查看報修清單。
雲端任務測試
欄位表與範例資料：[文件/報修欄位表.xlsx](文件/報修欄位表.xlsx)

## 網頁（報修登記）
- 檔案：`index.html`、`style.css`、`app.js`、`config.js`（純 HTML/CSS/JavaScript，用 CDN 載入 supabase-js v2）。
- 發佈：GitHub Pages，來源選 `main` 分支的根目錄（`/`），首頁是 `index.html`。
- Supabase 設定：先在 Supabase 的 SQL Editor 執行 `supabase/schema.sql`，再把專案網址和 publishable key 填進 `config.js`。不要放 secret 或 service_role 金鑰。
- 本機預覽：在儲存庫根目錄執行 `python3 -m http.server 8000`，開啟 http://localhost:8000/ 。
- 測試：送出一筆虛構報修，確認它出現在清單最上面，類別、緊急程度正確，狀態是「待處理」，時間是自動產生的。

## 系統鷹架計算（PWA）
- 檔案：`scaffold/`（`index.html`、`style.css`、`app.js`、`drawings.js`、`manifest.webmanifest`、`sw.js`、`icons/`），純前端，不連 Supabase。
- 轉角：外牆欄位可依序輸入各面長度（以逗號分隔，例如 `20, 12`），並選「兩端開口」或「四周環繞」。每個外轉角以「架寬 × 架寬」的轉角單元連接：多 1 支外側立柱、相鄰兩段共用 1 支內側立柱，外側兩邊每層加橫桿與護欄，不加斜桿。只計算外轉角（陽角），有內轉角的建物請分段計算。
- 圖片：單元立體示意圖、平面圖（標出轉角與立柱位置）、外側展開立面圖（依輸入即時重畫）、構件圖示，全部由 `drawings.js` 以 SVG 繪製，支援深色模式，不使用廠商照片。
- 用途：輸入外牆長度、搭設高度，選擇跨距、架寬、步距，估算單元長寬高與主架、橫桿、斜桿、調整座數量。預設規格：主架 0.5～2.0 m、橫桿 0.45～1.829 m，可在「構件規格」修改。
- 網址：GitHub Pages 發佈後為 `<網站>/scaffold/`。手機瀏覽器開啟後可「加入主畫面」安裝，離線也能使用。
- 本機預覽：在儲存庫根目錄執行 `python3 -m http.server 8000`，開啟 http://localhost:8000/scaffold/ 。
- 轉角測試：外牆輸入 `20, 12`、兩端開口，其餘同下，應得 1 個轉角、立柱 40 支（外側 21、內側 19）、合計 899 件。
- 測試：輸入外牆 20 m、高度 10 m、跨距 1.829 m、架寬 0.914 m、步距 2 m，應得 11 跨 × 5 層、立柱 24 支、2 m 主架 120 支與 1 m 主架 12 支（外側立柱多 1 m 給頂層護欄）；兩張示意圖會跟著輸入重畫；重新整理後輸入值保留；離線重新載入仍可計算。
- 單價：估算結果每一列可輸入單價，自動算出小計與總金額。單價只存在這台裝置的瀏覽器（localStorage），不寫進程式碼、不上傳。
- 單價測試：上述 20 m 條件下，主架 2 m 填 692、1 m 填 350、橫桿 1.829 m 填 391、0.914 m 填 280、斜桿 778、調整座 246，總金額應為 250,716；重新整理後單價保留。
- 僅供估算材料數量，不是結構計算。

## 客戶訂單（需登入）
- 檔案：`orders/`（`index.html`、`orders.css`、`app.js`），共用根目錄的 `style.css` 與 `config.js`。網址為 `<網站>/orders/`。
- 功能：
  - 新增訂單明細，送出後保留客戶與訂購日期，方便連續輸入。
  - 訂單查詢：依客戶、品名關鍵字、出貨狀態、資料問題、訂購日期篩選，每頁 50 筆。
  - 編輯出貨：出貨日、出貨數量；填出貨數量會自動帶入狀態，也有「全部出貨」按鈕。
  - 客戶統計：訂單總額、筆數、未完成筆數、各年度金額。
  - 匯入舊資料（CSV）。
- 資料表：`supabase/customer_orders.sql` 建立 `customer_orders`、`allowed_users` 與兩個統計 view。
  - anon（未登入）沒有任何權限。
  - 只有列在 `allowed_users` 的登入帳號可以讀取、新增、修改、刪除。
  - 總售價由資料庫計算。
- 程式碼與 GitHub 裡沒有任何客戶資料；資料只存在 Supabase。不要把匯入用的 CSV 或 Excel 放進這個公開儲存庫。

### 第一次設定
1. Supabase → **Authentication → Users → Add user**，輸入你的 Email 與密碼，勾選自動確認（Auto Confirm User）。
2. Supabase → **Authentication → Sign In / Providers**，關閉「Allow new users to sign up」，避免別人自行註冊。即使有人註冊，不在 `allowed_users` 也看不到資料。
3. Supabase → **SQL Editor**，執行 `supabase/customer_orders.sql` 全部內容。
4. 在 SQL Editor 執行檔案第五段，把 Email 換成第 1 步的帳號，加入 `allowed_users`。
5. 開啟 `<網站>/orders/` 登入 →「客戶統計」→「匯入舊資料（CSV）」，選擇 `customer_orders_import.csv` 後按「開始匯入」。重複匯入會略過已存在的「來源」編號。

### 測試
- **未登入：** 看不到任何資料；在 SQL Editor 以 `set local role anon` 查詢 `customer_orders` 應出現 permission denied（檔案第六段）。
- **匯入：** 匯入後「客戶統計」應顯示 210 個客戶、7,236 筆明細。
- **新增：** 新增一筆後，在「訂單查詢」找到它，狀態為「未出貨」、總售價正確。
- **出貨：** 編輯填入部分出貨數量，狀態變「部分出貨」；按「全部出貨」後變「已出貨」並帶入今天日期。

### 匯入資料的出貨狀態規則
- 有出貨數量的：依數量判斷「已出貨」「部分出貨」或「未出貨」。
- 有出貨日的：設為「已出貨」。
- 其餘 2026-10-01 以前的訂單：推定為「已出貨」。
- 之後的訂單：設為「未出貨」，請逐筆確認。
- 舊 Excel 的帳款、帳款日期、款日期、票期合併放在「帳款資訊」。
- 整理時發現的問題放在「資料問題」，確認後可在編輯視窗清除。
