// 客戶訂單：登入後才能使用。資料表 customer_orders 只開放給 allowed_users 裡的帳號
// （見 supabase/customer_orders.sql）。網頁本身沒有任何訂單資料，全部從 Supabase 讀取。

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const TABLE = "customer_orders";
  const PAGE_SIZE = 50;
  const COLS = "id, created_at, updated_at, customer, order_date, product, unit_price, qty, total, " +
    "expected_ship, ship_date, shipped_qty, status, note, payment_note, data_issue, source";

  const money = (n) => (n === null || n === undefined || n === "" ? "—"
    : Number(n).toLocaleString("zh-TW", { maximumFractionDigits: 2 }));

  function show(el, text, kind) {
    el.textContent = text;
    el.className = "message " + kind;
    el.hidden = false;
  }
  function hide(el) { el.hidden = true; el.textContent = ""; }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function tag(text, extra) { return el("span", "tag" + (extra ? " " + extra : ""), text); }

  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(new Date());
  }

  function formatTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false });
  }

  const cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) {
    show($("global-message"), "無法連線：Supabase 程式庫或 config.js 設定沒有載入。", "err");
    return;
  }
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "customer-orders-auth" },
  });

  function explainError(error) {
    const msg = (error && error.message) || "";
    const code = (error && error.code) || "";
    if (/Invalid login credentials/i.test(msg)) return "Email 或密碼不正確。";
    if (/Email not confirmed/i.test(msg)) return "這個帳號還沒確認 Email。請在 Supabase 後台把帳號設為已確認。";
    if (code === "42501" || /permission denied|row-level security/i.test(msg)) {
      return "沒有權限。請確認已執行 supabase/customer_orders.sql，並把你的帳號加入 allowed_users。";
    }
    if (code === "23505") return "這筆資料已經存在（來源重複）。";
    if (code === "23514") return "資料不符合規則，請檢查各欄位內容。";
    if (code === "42P01" || /does not exist|schema cache/i.test(msg)) {
      return "找不到資料表 customer_orders。請先在 Supabase 執行 supabase/customer_orders.sql。";
    }
    if (/JWT|session/i.test(msg)) return "登入已過期，請重新登入。";
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "網路連線失敗，請稍後再試。";
    return "發生錯誤：" + (msg || "未知錯誤");
  }

  // ---------------------------------------------------------------- 登入
  const loginView = $("login-view");
  const appView = $("app-view");
  let started = false;

  function setSignedIn(session) {
    const signedIn = Boolean(session);
    loginView.hidden = signedIn;
    appView.hidden = !signedIn;
    $("logout-btn").hidden = !signedIn;
    $("who").textContent = signedIn ? "已登入：" + (session.user && session.user.email || "") : "請先登入。";
    if (signedIn && !started) {
      started = true;
      loadCustomers();
    }
    if (!signedIn) started = false;
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("login-message");
    hide(msg);
    const email = $("email").value.trim();
    const password = $("password").value;
    if (!email || !password) { show(msg, "請輸入 Email 與密碼。", "err"); return; }
    $("login-btn").disabled = true;
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    $("login-btn").disabled = false;
    if (error) { show(msg, "登入失敗。" + explainError(error), "err"); return; }
    $("password").value = "";
    setSignedIn(data.session);
  });

  $("logout-btn").addEventListener("click", async () => {
    await db.auth.signOut();
    // 清掉畫面上的資料
    $("order-list").replaceChildren();
    $("stats-body").replaceChildren();
    $("customer-list").replaceChildren();
    $("customer-panel").hidden = true;
    setSignedIn(null);
  });

  db.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") setSignedIn(null);
  });

  // ---------------------------------------------------------------- 分頁標籤
  const tabs = ["new", "list", "stats"];
  function selectTab(name) {
    for (const t of tabs) {
      $("tab-" + t).setAttribute("aria-selected", String(t === name));
      $("panel-" + t).hidden = t !== name;
    }
    if (name === "list" && !listLoaded) loadList();
    if (name === "stats" && !statsLoaded) loadStats();
  }
  for (const t of tabs) $("tab-" + t).addEventListener("click", () => selectTab(t));

  // ---------------------------------------------------------------- 客戶清單（datalist）
  let summaryCache = null;
  async function fetchSummary() {
    const { data, error } = await db.from("customer_order_summary")
      .select("customer, lines, first_order, last_order, total, open_lines, issue_lines")
      .order("total", { ascending: false })
      .limit(5000);
    if (error) throw error;
    summaryCache = data || [];
    return summaryCache;
  }

  async function loadCustomers() {
    try {
      const rows = await fetchSummary();
      const dl = $("customer-list");
      dl.replaceChildren();
      for (const r of [...rows].sort((a, b) => a.customer.localeCompare(b.customer, "zh-Hant"))) {
        const o = document.createElement("option");
        o.value = r.customer;
        dl.append(o);
      }
    } catch (err) {
      show($("global-message"), "讀取客戶清單失敗。" + explainError(err), "err");
    }
  }

  // ---------------------------------------------------------------- 新增
  const newForm = $("new-form");
  $("n-order_date").value = today();

  function bindTotal(priceId, qtyId, outId) {
    const update = () => {
      const p = $(priceId).value, q = $(qtyId).value;
      $(outId).textContent = p !== "" && q !== "" && Number(p) >= 0 && Number(q) >= 0 ? money(Number(p) * Number(q)) : "—";
    };
    $(priceId).addEventListener("input", update);
    $(qtyId).addEventListener("input", update);
    return update;
  }
  const updateNewTotal = bindTotal("n-unit_price", "n-qty", "n-total");
  const updateEditTotal = bindTotal("e-unit_price", "e-qty", "e-total");

  const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const textOrNull = (v) => { const s = String(v || "").trim(); return s ? s : null; };

  newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("new-message");
    hide(msg);
    const f = Object.fromEntries(new FormData(newForm));
    const row = {
      customer: String(f.customer || "").trim(),
      order_date: f.order_date || null,
      product: String(f.product || "").trim(),
      unit_price: numOrNull(f.unit_price),
      qty: numOrNull(f.qty),
      expected_ship: f.expected_ship || null,
      note: textOrNull(f.note),
    };
    let bad = null;
    if (!row.customer) bad = ["customer", "請填寫客戶。"];
    else if (!row.order_date) bad = ["order_date", "請選擇訂購日期。"];
    else if (!row.product) bad = ["product", "請填寫品名。"];
    else if (row.unit_price === null || !(row.unit_price >= 0)) bad = ["unit_price", "請填寫售價。"];
    else if (row.qty === null || !(row.qty > 0)) bad = ["qty", "請填寫數量（大於 0）。"];
    else if (row.expected_ship && row.expected_ship < row.order_date) bad = ["expected_ship", "預計出貨日不能早於訂購日期。"];
    if (bad) {
      show(msg, bad[1], "err");
      newForm.elements[bad[0]].focus();
      return;
    }
    $("new-btn").disabled = true;
    const { error } = await db.from(TABLE).insert(row);
    $("new-btn").disabled = false;
    if (error) { show(msg, "送出失敗。" + explainError(error), "err"); return; }
    show(msg, `已登記：${row.customer}｜${row.product}｜${money(row.unit_price)} × ${money(row.qty)} ＝ ${money(row.unit_price * row.qty)}`, "ok");
    for (const name of ["product", "unit_price", "qty", "note"]) newForm.elements[name].value = "";
    updateNewTotal();
    $("n-product").focus();
    listLoaded = false;
    statsLoaded = false;
    if (summaryCache && !summaryCache.some((r) => r.customer === row.customer)) loadCustomers();
  });

  // ---------------------------------------------------------------- 查詢
  let page = 0;
  let listLoaded = false;
  let lastRows = [];
  const filterForm = $("filter-form");

  function readFilters() {
    const f = Object.fromEntries(new FormData(filterForm));
    return {
      customer: String(f.customer || "").trim(),
      product: String(f.product || "").trim(),
      status: f.status || "",
      issue: f.issue || "",
      from: f.from || "",
      to: f.to || "",
    };
  }

  // ilike 的 % 與 _ 是萬用字元，使用者輸入的要跳脫
  const likeEscape = (s) => s.replace(/[\\%_]/g, (m) => "\\" + m);

  async function loadList() {
    const msg = $("list-message");
    show(msg, "載入中…", "info");
    const f = readFilters();
    let q = db.from(TABLE).select(COLS, { count: "exact" });
    if (f.customer) q = q.eq("customer", f.customer);
    if (f.product) {
      for (const word of f.product.split(/\s+/).filter(Boolean)) q = q.ilike("product", "%" + likeEscape(word) + "%");
    }
    if (f.status === "open") q = q.neq("status", "已出貨");
    else if (f.status) q = q.eq("status", f.status);
    if (f.issue === "yes") q = q.not("data_issue", "is", null);
    if (f.from) q = q.gte("order_date", f.from);
    if (f.to) q = q.lte("order_date", f.to);
    q = q.order("order_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, error, count } = await q;
    if (error) {
      $("order-list").replaceChildren();
      show(msg, "查詢失敗。" + explainError(error), "err");
      return;
    }
    listLoaded = true;
    lastRows = data || [];
    renderList(lastRows, count || 0);
    renderCustomerPanel(f.customer);
  }

  function renderList(rows, count) {
    const list = $("order-list");
    list.replaceChildren();
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
    $("list-count").textContent = count ? `共 ${count.toLocaleString("zh-TW")} 筆` : "";
    $("page-info").textContent = `${page + 1} / ${pages}`;
    $("prev-btn").disabled = page === 0;
    $("next-btn").disabled = page + 1 >= pages;
    if (!rows.length) { show($("list-message"), "沒有符合條件的訂單。", "info"); return; }
    hide($("list-message"));
    for (const r of rows) {
      const li = el("li", "request order");
      const meta = el("div", "meta");
      meta.append(tag(r.customer), tag(r.order_date ? "訂購 " + r.order_date : "無訂購日期"), tag(r.status, "status-" + r.status));
      if (r.ship_date) meta.append(tag("出貨 " + r.ship_date));
      else if (r.expected_ship && r.status !== "已出貨") meta.append(tag("預計 " + r.expected_ship));
      if (r.data_issue) meta.append(tag("⚠ 待確認", "issue"));

      const line = el("p", "line");
      line.append(el("span", "product", r.product),
        el("span", "amount", `${money(r.unit_price)} × ${money(r.qty)} ＝ ${money(r.total)}`));

      li.append(meta, line);
      if (r.shipped_qty !== null && r.status !== "已出貨") {
        const rest = r.qty !== null ? Number(r.qty) - Number(r.shipped_qty) : null;
        li.append(el("p", "sub", `已出 ${money(r.shipped_qty)}${rest !== null ? `，未出 ${money(rest)}` : ""}`));
      }
      if (r.note) li.append(el("p", "sub", "備註：" + r.note));
      if (r.data_issue) li.append(el("p", "sub issue-text", "⚠ " + r.data_issue));

      const btn = el("button", "secondary edit-btn", "編輯");
      btn.type = "button";
      btn.addEventListener("click", () => openEdit(r));
      li.append(btn);
      list.append(li);
    }
  }

  async function renderCustomerPanel(customer) {
    const panel = $("customer-panel");
    if (!customer) { panel.hidden = true; return; }
    const { data, error } = await db.from("customer_year_totals")
      .select("year, lines, total").eq("customer", customer).order("year", { ascending: false });
    if (error) { panel.hidden = true; return; }
    const sum = (summaryCache || []).find((r) => r.customer === customer);
    panel.replaceChildren();
    panel.append(el("h3", null, customer));
    if (sum) {
      panel.append(el("p", "big", "訂單總額 " + money(sum.total)));
      panel.append(el("p", "sub", `${sum.lines} 筆明細｜未完成 ${sum.open_lines} 筆｜${sum.first_order || "?"} ～ ${sum.last_order || "?"}`));
    }
    if (data && data.length) {
      const ul = el("ul", "years");
      for (const y of data) {
        const li = el("li");
        li.append(el("span", null, String(y.year)), el("span", "num", money(y.total)), el("span", "num muted", y.lines + " 筆"));
        ul.append(li);
      }
      panel.append(ul);
    }
    panel.hidden = false;
  }

  filterForm.addEventListener("submit", (e) => { e.preventDefault(); page = 0; loadList(); });
  $("filter-clear").addEventListener("click", () => { filterForm.reset(); page = 0; loadList(); });
  $("prev-btn").addEventListener("click", () => { if (page > 0) { page--; loadList(); window.scrollTo(0, $("panel-list").offsetTop); } });
  $("next-btn").addEventListener("click", () => { page++; loadList(); window.scrollTo(0, $("panel-list").offsetTop); });

  // ---------------------------------------------------------------- 編輯
  const dialog = $("edit-dialog");
  const editForm = $("edit-form");
  let editing = null;

  function openEdit(r) {
    editing = r;
    hide($("edit-message"));
    for (const k of ["customer", "order_date", "product", "unit_price", "qty", "expected_ship", "ship_date",
      "shipped_qty", "status", "note", "payment_note"]) {
      editForm.elements[k].value = r[k] === null || r[k] === undefined ? "" : r[k];
    }
    $("e-clear-issue").checked = false;
    $("e-clear-issue").parentElement.hidden = !r.data_issue;
    if (r.data_issue) show($("edit-issue"), "⚠ " + r.data_issue, "warn"); else hide($("edit-issue"));
    $("edit-meta").textContent = `登記 ${formatTime(r.created_at)}｜最後修改 ${formatTime(r.updated_at)}` +
      (r.source ? `｜來源 ${r.source}` : "");
    updateEditTotal();
    dialog.showModal();
  }

  // 出貨數量 → 自動帶入狀態
  $("e-shipped_qty").addEventListener("input", () => {
    const s = numOrNull($("e-shipped_qty").value);
    const q = numOrNull($("e-qty").value);
    if (s === null || s === 0) $("e-status").value = "未出貨";
    else if (q !== null && s >= q) $("e-status").value = "已出貨";
    else $("e-status").value = "部分出貨";
  });

  $("ship-all").addEventListener("click", () => {
    if ($("e-qty").value !== "") $("e-shipped_qty").value = $("e-qty").value;
    if (!$("e-ship_date").value) $("e-ship_date").value = today();
    $("e-status").value = "已出貨";
  });

  $("edit-cancel").addEventListener("click", () => dialog.close());

  $("edit-save").addEventListener("click", async () => {
    const msg = $("edit-message");
    hide(msg);
    const f = Object.fromEntries(new FormData(editForm));
    const patch = {
      customer: String(f.customer || "").trim(),
      order_date: f.order_date || null,
      product: String(f.product || "").trim(),
      unit_price: numOrNull(f.unit_price),
      qty: numOrNull(f.qty),
      expected_ship: f.expected_ship || null,
      ship_date: f.ship_date || null,
      shipped_qty: numOrNull(f.shipped_qty),
      status: f.status,
      note: textOrNull(f.note),
      payment_note: textOrNull(f.payment_note),
    };
    if ($("e-clear-issue").checked) patch.data_issue = null;
    if (!patch.customer || !patch.product) { show(msg, "客戶與品名不能空白。", "err"); return; }
    for (const k of ["unit_price", "qty", "shipped_qty"]) {
      if (patch[k] !== null && !(patch[k] >= 0)) { show(msg, "售價、數量、出貨數量不能是負數。", "err"); return; }
    }
    $("edit-save").disabled = true;
    const { data, error } = await db.from(TABLE).update(patch).eq("id", editing.id).select("id");
    $("edit-save").disabled = false;
    if (error) { show(msg, "儲存失敗。" + explainError(error), "err"); return; }
    if (!data || !data.length) { show(msg, "沒有更新任何資料，可能沒有權限或資料已被刪除。", "err"); return; }
    dialog.close();
    statsLoaded = false;
    if (patch.customer !== editing.customer) loadCustomers();
    loadList();
  });

  $("edit-delete").addEventListener("click", async () => {
    if (!editing) return;
    const ok = window.confirm(`確定刪除這筆？\n${editing.customer}｜${editing.product}｜數量 ${money(editing.qty)}\n刪除後無法復原。`);
    if (!ok) return;
    const { data, error } = await db.from(TABLE).delete().eq("id", editing.id).select("id");
    if (error) { show($("edit-message"), "刪除失敗。" + explainError(error), "err"); return; }
    if (!data || !data.length) { show($("edit-message"), "沒有刪除任何資料，可能沒有權限。", "err"); return; }
    dialog.close();
    statsLoaded = false;
    loadList();
  });

  // ---------------------------------------------------------------- 客戶統計
  let statsLoaded = false;

  async function loadStats() {
    const msg = $("stats-message");
    show(msg, "載入中…", "info");
    try {
      await fetchSummary();
    } catch (err) {
      show(msg, "讀取失敗。" + explainError(err), "err");
      return;
    }
    statsLoaded = true;
    hide(msg);
    renderStats();
  }

  function renderStats() {
    const rows = summaryCache || [];
    const kw = $("s-search").value.trim();
    const shown = kw ? rows.filter((r) => r.customer.includes(kw)) : rows;
    const grand = rows.reduce((a, r) => a + Number(r.total || 0), 0);
    const lines = rows.reduce((a, r) => a + Number(r.lines || 0), 0);
    $("stats-total").textContent = `全部 ${rows.length} 個客戶、${lines.toLocaleString("zh-TW")} 筆明細，訂單總額 ${money(Math.round(grand))}`;
    const body = $("stats-body");
    body.replaceChildren();
    if (!shown.length) {
      show($("stats-message"), rows.length ? "找不到符合的客戶。" : "目前沒有資料。", "info");
      return;
    }
    for (const r of shown) {
      const tr = document.createElement("tr");
      const name = el("button", "link-btn", r.customer);
      name.type = "button";
      name.addEventListener("click", () => {
        filterForm.reset();
        $("f-customer").value = r.customer;
        page = 0;
        selectTab("list");
        loadList();
      });
      const c0 = el("td"); c0.append(name);
      const amount = el("td", "num", money(Math.round(Number(r.total))));
      if (grand) amount.append(el("small", "pct", (Number(r.total) / grand * 100).toFixed(1) + "%"));
      tr.append(c0, amount, el("td", "num", String(r.lines)),
        el("td", "num", String(r.open_lines)), el("td", null, r.last_order || "—"));
      body.append(tr);
    }
  }

  $("s-search").addEventListener("input", () => { hide($("stats-message")); renderStats(); });
  $("stats-refresh").addEventListener("click", loadStats);

  // ---------------------------------------------------------------- 匯入 CSV
  // 簡單的 CSV 解析（支援雙引號與欄位內換行）
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", i = 0, quoted = false;
    if (text.charCodeAt(0) === 0xfeff) i = 1;
    for (; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v !== ""));
  }

  const IMPORT_COLS = ["source", "customer", "order_date", "product", "unit_price", "qty", "expected_ship",
    "ship_date", "shipped_qty", "status", "note", "payment_note", "data_issue"];
  const NUM_COLS = new Set(["unit_price", "qty", "shipped_qty"]);
  let importRows = null;

  $("import-file").addEventListener("change", async () => {
    const msg = $("import-message");
    hide(msg);
    importRows = null;
    $("import-btn").disabled = true;
    const file = $("import-file").files[0];
    if (!file) return;
    const table = parseCsv(await file.text());
    const header = table.shift() || [];
    const missing = IMPORT_COLS.filter((c) => !header.includes(c));
    if (missing.length) { show(msg, "CSV 欄位不符，缺少：" + missing.join("、"), "err"); return; }
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const bad = [];
    importRows = table.map((r, n) => {
      const o = {};
      for (const c of IMPORT_COLS) {
        const v = (r[idx[c]] || "").trim();
        o[c] = v === "" ? null : NUM_COLS.has(c) ? Number(v) : v;
        if (NUM_COLS.has(c) && o[c] !== null && !Number.isFinite(o[c])) bad.push(n + 2);
      }
      if (!o.status) o.status = "未出貨";
      if (!o.customer || !o.product) bad.push(n + 2);
      return o;
    });
    if (bad.length) {
      importRows = null;
      show(msg, `第 ${[...new Set(bad)].slice(0, 5).join("、")} 列格式有誤，請檢查 CSV。`, "err");
      return;
    }
    show(msg, `讀到 ${importRows.length.toLocaleString("zh-TW")} 筆，按「開始匯入」。`, "info");
    $("import-btn").disabled = false;
  });

  $("import-btn").addEventListener("click", async () => {
    if (!importRows || !importRows.length) return;
    const msg = $("import-message");
    const bar = $("import-progress");
    const BATCH = 500;
    $("import-btn").disabled = true;
    $("import-file").disabled = true;
    bar.max = importRows.length;
    bar.value = 0;
    bar.hidden = false;
    for (let i = 0; i < importRows.length; i += BATCH) {
      const chunk = importRows.slice(i, i + BATCH);
      const { error } = await db.from(TABLE)
        .upsert(chunk, { onConflict: "source", ignoreDuplicates: true });
      if (error) {
        show(msg, `匯入到第 ${i + 1} 筆時失敗。` + explainError(error) + " 已完成的部分會保留，修正後可再匯入一次。", "err");
        $("import-btn").disabled = false;
        $("import-file").disabled = false;
        return;
      }
      bar.value = Math.min(i + BATCH, importRows.length);
      show(msg, `匯入中… ${bar.value.toLocaleString("zh-TW")} / ${importRows.length.toLocaleString("zh-TW")}`, "info");
    }
    show(msg, `完成，共處理 ${importRows.length.toLocaleString("zh-TW")} 筆（已存在的來源編號會略過）。`, "ok");
    $("import-file").disabled = false;
    $("import-file").value = "";
    importRows = null;
    listLoaded = false;
    await loadCustomers();
    loadStats();
  });

  // ---------------------------------------------------------------- 啟動
  (async () => {
    const { data } = await db.auth.getSession();
    setSignedIn(data && data.session);
  })();
})();
