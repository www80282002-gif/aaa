// Supabase 連線設定。
// publishable key 是公開金鑰，本來就會出現在瀏覽器裡，可以上傳到 GitHub；
// 資料安全靠資料表的 GRANT 與 RLS（見 supabase/schema.sql）。
// 絕對不要把 secret 金鑰或 service_role 金鑰放在這裡。
window.APP_CONFIG = {
  SUPABASE_URL: "https://fkmwkiyvuldzykjvcrjq.supabase.co",
  SUPABASE_KEY: "sb_publishable_QGnWpa7cIn4B_IveOPztWA_PepKLK2j",
};
