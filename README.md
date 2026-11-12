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
- 檔案：`scaffold/`（`index.html`、`style.css`、`app.js`、`manifest.webmanifest`、`sw.js`、`icons/`），純前端，不連 Supabase。
- 用途：輸入外牆長度、搭設高度，選擇跨距、架寬、步距，估算單元長寬高與主架、橫桿、斜桿、調整座數量。預設規格：主架 0.5～2.0 m、橫桿 0.45～1.829 m，可在「構件規格」修改。
- 網址：GitHub Pages 發佈後為 `<網站>/scaffold/`。手機瀏覽器開啟後可「加入主畫面」安裝，離線也能使用。
- 本機預覽：在儲存庫根目錄執行 `python3 -m http.server 8000`，開啟 http://localhost:8000/scaffold/ 。
- 測試：輸入外牆 20 m、高度 10 m、跨距 1.829 m、架寬 0.914 m、步距 2 m，應得 11 跨 × 5 層、立柱 24 支、2 m 主架 120 支；重新整理後輸入值保留；離線重新載入仍可計算。
- 僅供估算材料數量，不是結構計算。
