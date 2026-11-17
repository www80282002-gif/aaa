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

function addRow(tbody, name, spec, qty, cls, icon) {
  const tr = document.createElement('tr');
  if (cls) tr.className = cls;
  for (const [text, c] of [[name, 'name'], [spec], [String(qty), 'num']]) {
    const td = document.createElement('td');
    td.textContent = text;
    if (c) td.className = c;
    tr.appendChild(td);
  }
  if (icon && window.ScaffoldDrawings) {
    tr.firstChild.insertAdjacentHTML('afterbegin', window.ScaffoldDrawings.iconSvg(icon, 20));
  }
  tbody.appendChild(tr);
}

function parseWalls(text) {
  const parts = String(text).split(/[,，、\s]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((n) => !(n > 0))) return null;
  return parts;
}

function calculate() {
  const walls = parseWalls($('wall').value);
  const H = Number($('height').value);
  const span = Number($('span').value);
  const width = Number($('width').value);
  const step = Number($('step').value);
  const braceEvery = Number($('brace').value) || 1;
  const guard = $('guard').checked;
  const closed = $('layout').value === 'closed';
  const standards = parseList($('standards').value);

  const tbody = $('bom');
  const warnings = $('warnings');
  tbody.innerHTML = '';
  warnings.innerHTML = '';
  $('summary').innerHTML = '';
  $('unit').innerHTML = '';
  for (const id of ['unit-drawing', 'plan-drawing', 'elevation-drawing']) $(id).innerHTML = '';

  if (!walls || !(H > 0)) return showError('請輸入大於 0 的外牆長度（多面以逗號分隔）與搭設高度。');
  if (closed && walls.length < 2) return showError('四周環繞至少要有 2 面外牆。');
  if (!standards.length) return showError('請輸入至少一種主架長度。');
  if (!(span > 0) || !(width > 0)) return showError('請輸入至少一種橫桿長度。');
  if (standards.some((s) => toCm(s) % 50 !== 0)) return showError('主架長度須為 0.5 m 的倍數。');
  showError('');

  // 每一面外牆各自一段直線施工架；外轉角（陽角）以「架寬 × 架寬」的轉角單元連接。
  const runs = walls.map((w) => Math.ceil(w / span - 1e-9));
  const corners = closed ? walls.length : walls.length - 1;
  const bays = runs.reduce((a, b) => a + b, 0);
  const lines = runs.reduce((a, n) => a + n + 1, 0);
  const levels = Math.ceil(H / step - 1e-9);
  const actualH = levels * step;
  const tiers = levels + 1;        // 含底層掃地桿
  const runLength = bays * span;
  const totalL = walls.reduce((a, b) => a + b, 0);
  // 轉角處：相鄰兩段的內側端柱共用一支（-1 內側），轉角外角多一支外側立柱（+1 外側）。
  const outerCols = lines + corners;
  const innerCols = lines - corners;
  const columns = outerCols + innerCols;

  const unit = $('unit');
  for (const [label, v] of [['長（跨距）', span], ['寬（架寬）', width], ['高（步距）', step]]) {
    const d = document.createElement('div');
    d.innerHTML = `<span>${label}</span><strong>${fmt(v)} m</strong>`;
    unit.appendChild(d);
  }

  const summary = $('summary');
  const rows = [
    ['外牆', walls.length > 1 ? `${walls.length} 面，${corners} 個外轉角` : '1 面（直線）'],
    ['跨數 × 層數', `${bays} 跨${corners ? ` ＋ ${corners} 個轉角單元` : ''} × ${levels} 層`],
  ];
  if (walls.length > 1) rows.push(['各面跨數', runs.map((n, i) => `${fmt(walls[i])} m → ${n} 跨`).join('；')]);
  rows.push(
    ['實際搭設長度', `${fmt(runLength + corners * width)} m（直線段 ${fmt(runLength)} m${corners ? ` ＋ 轉角 ${corners} × ${fmt(width)} m` : ''}；外牆 ${fmt(totalL)} m）`],
    ['實際搭設高度', `${fmt(actualH)} m（需求 ${fmt(H)} m）`],
    ['立柱', `${columns} 支（外側 ${outerCols}、內側 ${innerCols}）`],
    ['立柱高度', guard ? `外側 ${fmt(actualH + 1)} m（含頂層護欄 1 m）、內側 ${fmt(actualH)} m` : `${fmt(actualH)} m`],
    ['工作面積（每層）', `${fmt((runLength + corners * width) * width)} m²`],
  );
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    summary.append(dt, dd);
  }

  // 護欄高度：離踏面 0.5 m、1.0 m；若與上一層橫桿同高就不重複計算（頂層除外）。
  const rails = (lv) => [0.5, 1.0].filter((h) => lv === levels || h < step - 1e-9);
  const railCount = guard ? Array.from({ length: levels }, (_, i) => rails(i + 1).length).reduce((a, b) => a + b, 0) : 0;

  // 外側立柱多立 1.0 m 給頂層護欄；內側立柱到搭設高度。
  const pieceQty = new Map();
  let rest = 0;
  for (const [h, count] of [[actualH + (guard ? 1.0 : 0), outerCols], [actualH, innerCols]]) {
    const c = composeColumn(h, standards);
    rest = Math.max(rest, c.rest);
    for (const [cm, n] of c.pieces) pieceQty.set(cm, (pieceQty.get(cm) || 0) + n * count);
  }
  let total = 0;
  for (const [cm, qty] of [...pieceQty.entries()].sort((a, b) => b[0] - a[0])) {
    total += qty;
    addRow(tbody, '主架', `${fmt(cm / 100)} m`, qty, '', 'standard');
  }

  const ledgerQty = new Map();
  const addLedger = (len, qty) => ledgerQty.set(len, (ledgerQty.get(len) || 0) + qty);
  addLedger(span, tiers * 2 * bays);          // 縱向橫桿：內外兩側、每層含底層
  addLedger(span, railCount * bays);          // 外側護欄（中欄杆、上欄杆）
  addLedger(width, tiers * lines);            // 橫向橫桿
  addLedger(width, corners * 2 * (tiers + railCount)); // 轉角單元外側兩邊的橫桿與護欄
  for (const [len, qty] of ledgerQty) {
    total += qty;
    const note = len === span && len === width ? '（縱、橫向，含轉角與護欄）'
      : len === span ? '（縱向，含護欄）'
      : corners ? '（橫向，含轉角）' : '（橫向）';
    addRow(tbody, '橫桿', `${fmt(len)} m${note}`, qty, '', 'ledger');
  }

  const braces = levels * runs.reduce((a, n) => a + Math.ceil(n / braceEvery), 0);
  total += braces;
  addRow(tbody, '斜桿', `${fmt(span)} × ${fmt(step)} m`, braces, '', 'brace');

  addRow(tbody, '調整座', '每支立柱 1 個', columns, '', 'jack');
  total += columns;
  addRow(tbody, '合計', '', total, 'total');

  if (window.ScaffoldDrawings) {
    const D = window.ScaffoldDrawings;
    D.drawUnit($('unit-drawing'), span, width, step);
    D.drawPlan($('plan-drawing'), { runs, span, width, closed });
    D.drawElevation($('elevation-drawing'), { runs, closed, levels, span, width, step, braceEvery, guard, rails });
  }

  const warn = (t) => { const li = document.createElement('li'); li.textContent = t; warnings.appendChild(li); };
  if (rest > 0) warn(`主架無法剛好湊出所需高度，差 ${fmt(rest / 100)} m，請補較短主架或以調整座補足。`);
  if (width < 0.45) warn('架寬小於 0.45 m，鋪踏板後工作台淨寬可能不足 40 cm。');
  if (actualH >= 5) warn('搭設高度達 5 m 以上，依規定須由專任工程人員事先設計並簽章。');
  if (step > 2.0) warn('步距超過 2.0 m，請確認設計。');
  if (closed && (walls.length !== 4 || Math.abs(runs[0] - runs[2]) > 0 || Math.abs(runs[1] - runs[3]) > 0)) {
    warn('四周環繞只計算外轉角，適用於矩形建物（4 面、對邊跨數相同）。有內轉角（陰角）的建物請分段計算。');
  }
  if (corners) warn('轉角單元依一般做法估算（外側兩邊加橫桿與護欄、不加斜桿），實際轉角做法請依設計圖。');
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

if (window.ScaffoldDrawings) {
  for (const el of document.querySelectorAll('.part-icon')) {
    el.innerHTML = window.ScaffoldDrawings.iconSvg(el.dataset.icon, 40);
  }
}

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
