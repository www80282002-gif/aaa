'use strict';

const DEFAULT_STANDARDS = '0.5, 1.0, 1.5, 2.0';
const DEFAULT_LEDGERS = '0.45, 0.61, 0.914, 1.219, 1.524, 1.829';
const STEPS = [1.0, 1.5, 2.0];
const STORAGE_KEY = 'scaffold-calc-v1';

const $ = (id) => document.getElementById(id);
const form = $('calc-form');

function parseList(text) {
  return [...new Set(
    String(text).split(/[,，、\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  )].sort((a, b) => a - b);
}

const fmt = (n) => (Math.round(n * 1000) / 1000).toString();
const toCm = (m) => Math.round(m * 100);

function fillSelect(select, values, preferred) {
  const current = Number(select.value) || preferred;
  select.innerHTML = '';
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = `${fmt(v)} m`;
    select.appendChild(opt);
  }
  const pick = values.includes(current)
    ? current
    : values.reduce((best, v) => (Math.abs(v - preferred) < Math.abs(best - preferred) ? v : best), values[0]);
  if (pick !== undefined) select.value = String(pick);
}

// Split one column height into standards, longest first. Works in cm to avoid float drift.
function composeColumn(heightM, standards) {
  let rest = toCm(heightM);
  const pieces = new Map();
  const sizes = standards.map(toCm).sort((a, b) => b - a);
  for (const s of sizes) {
    const n = Math.floor(rest / s);
    if (n > 0) { pieces.set(s, n); rest -= n * s; }
  }
  return { pieces, rest };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState() {
  try {
    const data = {};
    for (const el of form.elements) {
      if (!el.name) continue;
      data[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage unavailable: ignore */ }
}

function applyState(state) {
  if (!state) return;
  for (const [k, v] of Object.entries(state)) {
    const el = form.elements.namedItem(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = v;
  }
}

function refreshOptions() {
  const ledgers = parseList($('ledgers').value);
  fillSelect($('span'), ledgers, 1.829);
  fillSelect($('width'), ledgers, 0.914);
  fillSelect($('step'), STEPS, 2.0);
}

function showError(msg) {
  const el = $('form-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function addRow(tbody, name, spec, qty, cls) {
  const tr = document.createElement('tr');
  if (cls) tr.className = cls;
  for (const [text, c] of [[name], [spec], [String(qty), 'num']]) {
    const td = document.createElement('td');
    td.textContent = text;
    if (c) td.className = c;
    tr.appendChild(td);
  }
  tbody.appendChild(tr);
}

function calculate() {
  const L = Number($('wall').value);
  const H = Number($('height').value);
  const span = Number($('span').value);
  const width = Number($('width').value);
  const step = Number($('step').value);
  const braceEvery = Number($('brace').value) || 1;
  const guard = $('guard').checked;
  const standards = parseList($('standards').value);

  const tbody = $('bom');
  const warnings = $('warnings');
  tbody.innerHTML = '';
  warnings.innerHTML = '';
  $('summary').innerHTML = '';
  $('unit').innerHTML = '';

  if (!(L > 0) || !(H > 0)) return showError('請輸入大於 0 的外牆長度與搭設高度。');
  if (!standards.length) return showError('請輸入至少一種主架長度。');
  if (!(span > 0) || !(width > 0)) return showError('請輸入至少一種橫桿長度。');
  if (standards.some((s) => toCm(s) % 50 !== 0)) return showError('主架長度須為 0.5 m 的倍數。');
  showError('');

  const bays = Math.ceil(L / span - 1e-9);
  const levels = Math.ceil(H / step - 1e-9);
  const actualL = bays * span;
  const actualH = levels * step;
  const lines = bays + 1;          // 沿外牆方向的立柱排數
  const columns = lines * 2;       // 內、外兩側
  const tiers = levels + 1;        // 含底層掃地桿

  const unit = $('unit');
  for (const [label, v] of [['長（跨距）', span], ['寬（架寬）', width], ['高（步距）', step]]) {
    const d = document.createElement('div');
    d.innerHTML = `<span>${label}</span><strong>${fmt(v)} m</strong>`;
    unit.appendChild(d);
  }

  const summary = $('summary');
  for (const [k, v] of [
    ['跨數 × 層數', `${bays} 跨 × ${levels} 層`],
    ['實際搭設長度', `${fmt(actualL)} m（需求 ${fmt(L)} m）`],
    ['實際搭設高度', `${fmt(actualH)} m（需求 ${fmt(H)} m）`],
    ['立柱', `${columns} 支（${lines} 排 × 內外 2 側）`],
    ['工作面積（每層）', `${fmt(actualL * width)} m²`],
  ]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    summary.append(dt, dd);
  }

  const { pieces, rest } = composeColumn(actualH, standards);
  let total = 0;
  for (const [cm, n] of [...pieces.entries()].sort((a, b) => b[0] - a[0])) {
    const qty = n * columns;
    total += qty;
    addRow(tbody, '主架', `${fmt(cm / 100)} m`, qty);
  }

  const ledgerQty = new Map();
  const addLedger = (len, qty) => ledgerQty.set(len, (ledgerQty.get(len) || 0) + qty);
  addLedger(span, tiers * 2 * bays);          // 縱向橫桿：內外兩側、每層含底層
  addLedger(width, tiers * lines);            // 橫向橫桿
  if (guard) addLedger(span, levels * 2 * bays); // 外側中欄杆＋上欄杆
  for (const [len, qty] of ledgerQty) {
    total += qty;
    addRow(tbody, '橫桿', `${fmt(len)} m${len === span && len === width ? '（縱、橫向）' : len === span ? '（縱向）' : '（橫向）'}`, qty);
  }

  const braces = levels * Math.ceil(bays / braceEvery);
  total += braces;
  addRow(tbody, '斜桿', `${fmt(span)} × ${fmt(step)} m`, braces);

  addRow(tbody, '調整座', '每支立柱 1 個', columns);
  total += columns;
  addRow(tbody, '合計', '', total, 'total');

  const warn = (t) => { const li = document.createElement('li'); li.textContent = t; warnings.appendChild(li); };
  if (rest > 0) warn(`主架無法剛好湊出 ${fmt(actualH)} m，差 ${fmt(rest / 100)} m，請補較短主架或以調整座補足。`);
  if (width < 0.45) warn('架寬小於 0.45 m，鋪踏板後工作台淨寬可能不足 40 cm。');
  if (actualH >= 5) warn('搭設高度達 5 m 以上，依規定須由專任工程人員事先設計並簽章。');
  if (step > 2.0) warn('步距超過 2.0 m，請確認設計。');
}

function onChange(e) {
  if (e && e.target && e.target.id === 'ledgers') refreshOptions();
  calculate();
  saveState();
}

form.addEventListener('input', onChange);
form.addEventListener('change', onChange);
form.addEventListener('submit', (e) => e.preventDefault());

$('reset-specs').addEventListener('click', () => {
  $('standards').value = DEFAULT_STANDARDS;
  $('ledgers').value = DEFAULT_LEDGERS;
  refreshOptions();
  calculate();
  saveState();
});

// Init: rebuild selects from saved ledger list before restoring the selected values.
const saved = loadState();
if (saved && saved.ledgers) $('ledgers').value = saved.ledgers;
refreshOptions();
applyState(saved);
refreshOptions();
calculate();

function updateOnline() {
  $('offline-status').textContent = navigator.onLine ? '' : '目前離線，計算功能仍可使用。';
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
