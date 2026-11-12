// 報修登記：新增表單與最近 20 筆清單。
// 寫入欄位只有 reporter_name、location、category、description、urgency；
// id、created_at、status 由資料庫自動產生（見 supabase/schema.sql）。

(function () {
  "use strict";

  const form = document.getElementById("repair-form");
  const submitBtn = document.getElementById("submit-btn");
  const formMsg = document.getElementById("form-message");
  const listEl = document.getElementById("request-list");
  const listMsg = document.getElementById("list-message");
  const refreshBtn = document.getElementById("refresh-btn");
  const desc = document.getElementById("description");
  const descCount = document.getElementById("desc-count");

  const CATEGORIES = ["設備", "網路", "環境", "其他"];
  const URGENCIES = ["低", "中", "高"];
  const LIMITS = { reporter_name: 50, location: 100, description: 1000 };

  function showMessage(el, text, kind) {
    el.textContent = text;
    el.className = "message " + kind;
    el.hidden = false;
  }

  function hideMessage(el) {
    el.hidden = true;
    el.textContent = "";
  }

  const cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) {
    const text = "無法連線：Supabase 程式庫或 config.js 設定沒有載入。";
    showMessage(formMsg, text, "err");
    showMessage(listMsg, text, "err");
    submitBtn.disabled = true;
    refreshBtn.disabled = true;
    return;
  }

  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 把資料庫錯誤轉成看得懂的中文
  function explainError(error) {
    const msg = (error && error.message) || "";
    const code = (error && error.code) || "";
    if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
      return "沒有權限。請確認 Supabase 已執行 supabase/schema.sql。";
    }
    if (code === "23514") return "資料不符合規則，請檢查各欄位內容。";
    if (code === "42P01" || /does not exist|schema cache/i.test(msg)) {
      return "找不到資料表 repair_requests。請先在 Supabase 執行 supabase/schema.sql。";
    }
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      return "網路連線失敗，請稍後再試。";
    }
    return "發生錯誤：" + (msg || "未知錯誤");
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("zh-TW", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
  }

  function tag(text, extraClass) {
    const span = document.createElement("span");
    span.className = "tag" + (extraClass ? " " + extraClass : "");
    span.textContent = text;
    return span;
  }

  // 一律用 textContent 放入使用者輸入的文字，避免 HTML 注入
  function renderList(rows) {
    listEl.replaceChildren();
    if (!rows.length) {
      showMessage(listMsg, "目前還沒有報修。", "info");
      return;
    }
    hideMessage(listMsg);
    for (const r of rows) {
      const li = document.createElement("li");
      li.className = "request";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.append(
        tag(r.category),
        tag("緊急：" + r.urgency, "urgency-" + r.urgency),
        tag(r.status)
      );

      const p = document.createElement("p");
      p.className = "desc";
      p.textContent = r.description;

      const who = document.createElement("p");
      who.className = "who";
      who.textContent = r.reporter_name + "｜" + r.location + "｜" + formatTime(r.created_at);

      li.append(meta, p, who);
      listEl.append(li);
    }
  }

  async function loadList() {
    refreshBtn.disabled = true;
    showMessage(listMsg, "載入中…", "info");
    const { data, error } = await db
      .from("repair_requests")
      .select("id, created_at, reporter_name, location, category, description, urgency, status")
      .order("created_at", { ascending: false })
      .limit(20);
    refreshBtn.disabled = false;
    if (error) {
      listEl.replaceChildren();
      showMessage(listMsg, "清單載入失敗。" + explainError(error), "err");
      return;
    }
    renderList(data || []);
  }

  function readForm() {
    const fd = new FormData(form);
    const v = (name) => String(fd.get(name) || "").trim();
    return {
      reporter_name: v("reporter_name"),
      location: v("location"),
      category: v("category"),
      description: v("description"),
      urgency: v("urgency"),
    };
  }

  function validate(row) {
    if (!row.reporter_name) return { field: "reporter_name", text: "請填寫報修人。" };
    if (!row.location) return { field: "location", text: "請填寫地點或部門。" };
    if (!CATEGORIES.includes(row.category)) return { field: "category", text: "請選擇類別。" };
    if (!row.description) return { field: "description", text: "請填寫問題說明。" };
    if (!URGENCIES.includes(row.urgency)) return { field: "urgency", text: "請選擇緊急程度。" };
    for (const k of Object.keys(LIMITS)) {
      if (row[k].length > LIMITS[k]) return { field: k, text: "內容太長，最多 " + LIMITS[k] + " 字。" };
    }
    return null;
  }

  function focusField(name) {
    const el = form.querySelector('[name="' + name + '"]');
    if (el) el.focus();
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage(formMsg);
    const row = readForm();
    const problem = validate(row);
    if (problem) {
      showMessage(formMsg, problem.text, "err");
      focusField(problem.field);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    // 不送 status：由資料庫預設為「待處理」
    const { error } = await db.from("repair_requests").insert(row);
    submitBtn.disabled = false;
    submitBtn.textContent = "送出報修";

    if (error) {
      showMessage(formMsg, "送出失敗。" + explainError(error), "err");
      return;
    }
    showMessage(formMsg, "已送出報修，謝謝！", "ok");
    form.reset();
    descCount.textContent = "0";
    loadList();
  });

  desc.addEventListener("input", () => {
    descCount.textContent = String(desc.value.length);
  });

  refreshBtn.addEventListener("click", loadList);
  loadList();
})();
