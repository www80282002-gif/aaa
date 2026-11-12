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
