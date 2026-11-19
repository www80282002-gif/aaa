// 訂單登記：新增訂單明細與最近 30 筆清單。
// 寫入欄位只有 customer、order_date、product、unit_price、qty、expected_ship、note；
// id、created_at、total、status 由資料庫產生（見 supabase/orders.sql）。

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const form = $("order-form");
  const submitBtn = $("submit-btn");
  const formMsg = $("form-message");
  const listEl = $("order-list");
  const listMsg = $("list-message");
  const refreshBtn = $("refresh-btn");
  const totalEl = $("total");

  const LIMITS = { customer: 50, product: 100, note: 200 };
  const money = (n) => Number(n).toLocaleString("zh-TW", { maximumFractionDigits: 2 });

  function showMessage(el, text, kind) {
    el.textContent = text;
    el.className = "message " + kind;
    el.hidden = false;
  }

  function hideMessage(el) {
    el.hidden = true;
    el.textContent = "";
  }

  // 台北時間的今天（YYYY-MM-DD）
  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  }

  function resetDate() {
    $("order_date").value = today();
  }

  function updateTotal() {
    const p = Number($("unit_price").value);
    const q = Number($("qty").value);
    const ok = $("unit_price").value !== "" && $("qty").value !== "" && p >= 0 && q > 0;
    totalEl.textContent = ok ? money(p * q) : "—";
  }

  resetDate();

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

  function explainError(error) {
    const msg = (error && error.message) || "";
    const code = (error && error.code) || "";
    if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
      return "沒有權限。請確認 Supabase 已執行 supabase/orders.sql。";
    }
    if (code === "23514") return "資料不符合規則，請檢查各欄位內容。";
    if (code === "42P01" || /does not exist|schema cache/i.test(msg)) {
      return "找不到資料表 order_lines。請先在 Supabase 執行 supabase/orders.sql。";
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

  function el(tagName, className, text) {
    const e = document.createElement(tagName);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // 一律用 textContent 放入使用者輸入的文字，避免 HTML 注入
  function renderList(rows) {
    listEl.replaceChildren();
    if (!rows.length) {
      showMessage(listMsg, "目前還沒有訂單。", "info");
      return;
    }
    hideMessage(listMsg);
    for (const r of rows) {
      const li = el("li", "request order");

      const meta = el("div", "meta");
      meta.append(tag(r.customer), tag("訂購 " + r.order_date), tag(r.status, "status-" + r.status));
      if (r.expected_ship) meta.append(tag("預計出貨 " + r.expected_ship));

      const line = el("p", "line");
      line.append(
        el("span", "product", r.product),
        el("span", "amount", money(r.unit_price) + " × " + money(r.qty) + " ＝ " + money(r.total))
      );

      li.append(meta, line);
      if (r.note) li.append(el("p", "sub", "備註：" + r.note));
      li.append(el("p", "sub", "登記時間 " + formatTime(r.created_at)));
      listEl.append(li);
    }
  }

  async function loadList() {
    refreshBtn.disabled = true;
    showMessage(listMsg, "載入中…", "info");
    const { data, error } = await db
      .from("order_lines")
      .select("id, created_at, customer, order_date, product, unit_price, qty, total, expected_ship, note, status")
      .order("created_at", { ascending: false })
      .limit(30);
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
      customer: v("customer"),
      order_date: v("order_date"),
      product: v("product"),
      unit_price: v("unit_price"),
      qty: v("qty"),
      expected_ship: v("expected_ship"),
      note: v("note"),
    };
  }

  function validate(f) {
    if (!f.customer) return { field: "customer", text: "請填寫客戶。" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.order_date)) return { field: "order_date", text: "請選擇訂購日期。" };
    if (!f.product) return { field: "product", text: "請填寫品名。" };
    const price = Number(f.unit_price);
    if (f.unit_price === "" || !(price >= 0)) return { field: "unit_price", text: "請填寫售價（0 以上的數字）。" };
    const qty = Number(f.qty);
    if (!Number.isInteger(qty) || qty < 1) return { field: "qty", text: "數量須為 1 以上的整數。" };
    if (f.expected_ship && f.expected_ship < f.order_date) {
      return { field: "expected_ship", text: "預計出貨日不能早於訂購日期。" };
    }
    for (const k of Object.keys(LIMITS)) {
      if (f[k].length > LIMITS[k]) return { field: k, text: "內容太長，最多 " + LIMITS[k] + " 字。" };
    }
    return null;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideMessage(formMsg);
    const f = readForm();
    const problem = validate(f);
    if (problem) {
      showMessage(formMsg, problem.text, "err");
      const input = form.querySelector('[name="' + problem.field + '"]');
      if (input) input.focus();
      return;
    }

    const row = {
      customer: f.customer,
      order_date: f.order_date,
      product: f.product,
      unit_price: Number(f.unit_price),
      qty: Number(f.qty),
      expected_ship: f.expected_ship || null,
      note: f.note || null,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "送出中…";
    // 不送 status、total：由資料庫產生
    const { error } = await db.from("order_lines").insert(row);
    submitBtn.disabled = false;
    submitBtn.textContent = "送出";

    if (error) {
      showMessage(formMsg, "送出失敗。" + explainError(error), "err");
      return;
    }
    showMessage(formMsg, "已登記。", "ok");
    // 保留客戶與訂購日期，方便同一張訂單連續輸入多個品項
    for (const name of ["product", "unit_price", "qty", "note"]) form.elements[name].value = "";
    updateTotal();
    $("product").focus();
    loadList();
  });

  $("unit_price").addEventListener("input", updateTotal);
  $("qty").addEventListener("input", updateTotal);
  refreshBtn.addEventListener("click", loadList);
  loadList();
})();
