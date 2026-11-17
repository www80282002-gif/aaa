'use strict';

// 圖示與示意圖。所有圖形以公尺計算後換算成 SVG 座標，顏色由 CSS 控制（支援深色模式）。
const SVG_NS = 'http://www.w3.org/2000/svg';
const r1 = (n) => Math.round(n * 10) / 10;
const fmtM = (n) => `${Math.round(n * 1000) / 1000} m`;

function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

function line(parent, a, b, cls) {
  return svgEl('line', { x1: r1(a[0]), y1: r1(a[1]), x2: r1(b[0]), y2: r1(b[1]), class: cls }, parent);
}

function text(parent, p, str, cls, anchor) {
  const t = svgEl('text', { x: r1(p[0]), y: r1(p[1]), class: cls || 'label', 'text-anchor': anchor || 'middle' }, parent);
  t.textContent = str;
  return t;
}

function newSvg(container, label) {
  container.innerHTML = '';
  const svg = svgEl('svg', { role: 'img', 'aria-label': label, class: 'drawing' }, container);
  svgEl('title', {}, svg).textContent = label;
  return svg;
}

function fitViewBox(svg, pad) {
  const box = svg.getBBox();
  svg.setAttribute('viewBox', [box.x - pad, box.y - pad, box.width + pad * 2, box.height + pad * 2].map(r1).join(' '));
}

// 構件小圖示（24×24），用於數量表與構件說明。
const ICONS = {
  standard: '<line x1="12" y1="2" x2="12" y2="22"/><ellipse cx="12" cy="7" rx="5" ry="1.6"/><ellipse cx="12" cy="12" rx="5" ry="1.6"/><ellipse cx="12" cy="17" rx="5" ry="1.6"/>',
  ledger: '<line x1="3" y1="12" x2="21" y2="12"/><path d="M2 9v6M22 9v6"/><path d="M4 9.5h2.5v5H4M20 9.5h-2.5v5H20"/>',
  brace: '<line x1="4" y1="20" x2="20" y2="4"/><path d="M2.5 18.5l3 3M18.5 2.5l3 3"/>',
  jack: '<line x1="12" y1="2" x2="12" y2="18"/><path d="M10 5h4M10 8h4M10 11h4M10 14h4"/><path d="M7 10h10"/><rect x="5" y="18" width="14" height="3" rx="0.5"/>',
};

function iconSvg(name, size) {
  const s = size || 24;
  return `<svg class="icon" viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// 單元立體示意圖：斜投影，正面為外側（縱向橫桿那一面）。
function drawUnit(container, span, width, step) {
  const svg = newSvg(container, `單元示意圖：長 ${fmtM(span)}、寬 ${fmtM(width)}、高 ${fmtM(step)}`);
  const f = 150 / Math.max(span, step, 1.2);
  const dx = Math.cos(Math.PI / 5) * 0.6;
  const dy = Math.sin(Math.PI / 5) * 0.6;
  const P = (x, y, z) => [(x + y * dx) * f, (-z - y * dy) * f];
  const rail = 1.0;
  const top = step + rail;

  const back = svgEl('g', { class: 'back' }, svg);
  const mid = svgEl('g', {}, svg);
  const front = svgEl('g', {}, svg);

  // 立柱（內側到步距高度，外側多 1 m 給護欄）＋圓盤
  for (const [x, y, g, h] of [[0, width, back, step], [span, width, back, step], [0, 0, front, top], [span, 0, front, top]]) {
    line(g, P(x, y, -0.25), P(x, y, h), 'steel');
    for (let z = 0.5; z <= h + 1e-9; z += 0.5) {
      const c = P(x, y, z);
      svgEl('ellipse', { cx: r1(c[0]), cy: r1(c[1]), rx: r1(0.09 * f), ry: r1(0.035 * f), class: 'rosette' }, g);
    }
    const b = P(x, y, -0.25);
    svgEl('rect', { x: r1(b[0] - 0.12 * f), y: r1(b[1]), width: r1(0.24 * f), height: r1(0.05 * f), class: 'plate' }, g);
  }

  // 踏板
  const deck = [P(0, 0, step), P(span, 0, step), P(span, width, step), P(0, width, step)];
  svgEl('polygon', { points: deck.map((p) => p.map(r1).join(',')).join(' '), class: 'deck' }, mid);

  // 橫桿：底層與步距高度，四邊
  for (const z of [0, step]) {
    line(back, P(0, width, z), P(span, width, z), 'steel');
    line(mid, P(0, 0, z), P(0, width, z), 'steel');
    line(mid, P(span, 0, z), P(span, width, z), 'steel');
    line(front, P(0, 0, z), P(span, 0, z), 'steel');
  }
  // 護欄
  for (const z of [step + 0.5, step + rail]) line(front, P(0, 0, z), P(span, 0, z), 'steel rail');
  // 斜桿
  line(front, P(0, 0, 0), P(span, 0, step), 'brace');

  // 尺寸標註
  const dims = svgEl('g', { class: 'dims' }, svg);
  const yb = -0.55;
  line(dims, P(0, 0, yb), P(span, 0, yb), 'dim');
  text(dims, [P(span / 2, 0, yb)[0], P(0, 0, yb)[1] + 18], `長 ${fmtM(span)}`);
  line(dims, P(span, 0, yb), P(span, width, yb), 'dim');
  const wp = P(span, width / 2, yb);
  text(dims, [wp[0] + 10, wp[1] + 14], `寬 ${fmtM(width)}`, 'label', 'start');
  const xl = -0.35;
  line(dims, P(xl, 0, 0), P(xl, 0, step), 'dim');
  const hp = P(xl, 0, step / 2);
  text(dims, [hp[0] - 8, hp[1] + 5], `高 ${fmtM(step)}`, 'label', 'end');

  // 構件引線標示
  const tag = (p, dxp, dyp, str) => {
    const q = [p[0] + dxp, p[1] + dyp];
    line(dims, p, q, 'leader');
    text(dims, [q[0] + (dxp > 0 ? 4 : -4), q[1] + 4], str, 'tag', dxp > 0 ? 'start' : 'end');
  };
  tag(P(span, 0, top - 0.2), 26, -6, '主架');
  tag(P(span * 0.5, 0, step + rail), 0.0001, -22, '護欄');
  tag(P(span * 0.7, 0, step * 0.7), 40, 0, '斜桿');
  tag(P(0, 0, -0.25), -22, 14, '調整座');

  fitViewBox(svg, 12);
}

// 依序排出各段：直線段（n 跨）與轉角單元（外側攤開為兩邊各一個架寬）。
function segmentsOf(runs, closed) {
  const segs = [];
  runs.forEach((n, i) => {
    segs.push({ type: 'run', n, index: i });
    if (i < runs.length - 1 || closed) segs.push({ type: 'corner' });
  });
  return segs;
}

// 外側展開立面圖：依跨數、層數、斜桿配置與護欄畫出整面施工架，轉角單元攤開顯示。
function drawElevation(container, o) {
  const { runs, closed, levels, span, width, step, braceEvery, guard, rails } = o;
  const segs = segmentsOf(runs, closed);
  const L = segs.reduce((a, sg) => a + (sg.type === 'run' ? sg.n * span : width * 2), 0);
  const H = levels * step;
  const top = H + (guard ? 1.0 : 0);
  const bays = runs.reduce((a, b) => a + b, 0);
  const corners = segs.length - runs.length;
  const svg = newSvg(container, `外側展開立面圖：${bays} 跨${corners ? `、${corners} 個轉角` : ''} × ${levels} 層，展開長 ${fmtM(L)}、高 ${fmtM(H)}`);
  const f = Math.min(290 / (L + 1.6), 260 / (top + 0.6));
  const P = (x, z) => [x * f, -z * f];
  const bg = svgEl('g', {}, svg);
  const g = svgEl('g', {}, svg);

  line(g, P(-1.6, -0.3), P(L + 0.4, -0.3), 'ground');

  const posts = [0];
  let x = 0;
  for (const sg of segs) {
    if (sg.type === 'run') {
      for (let lv = 0; lv < levels; lv++) {
        for (let i = 0; i < sg.n; i += braceEvery) {
          const x0 = x + i * span;
          const a = lv % 2 ? [x0, (lv + 1) * step] : [x0, lv * step];
          const b = lv % 2 ? [x0 + span, lv * step] : [x0 + span, (lv + 1) * step];
          line(g, P(...a), P(...b), 'brace');
        }
      }
      for (let i = 1; i <= sg.n; i++) posts.push(x + i * span);
      x += sg.n * span;
    } else {
      const p0 = P(x, top);
      svgEl('rect', { x: r1(p0[0]), y: r1(p0[1]), width: r1(width * 2 * f), height: r1(top * f), class: 'corner-bg' }, bg);
      posts.push(x + width, x + width * 2);
      x += width * 2;
    }
  }
  for (const px of posts) line(g, P(px, -0.3), P(px, top), 'steel');
  for (let t = 0; t <= levels; t++) {
    line(g, P(0, t * step), P(L, t * step), 'steel');
    if (t > 0) svgEl('rect', { x: 0, y: r1(-t * step * f - 0.08 * f), width: r1(L * f), height: r1(Math.max(0.08 * f, 1.5)), class: 'deck' }, g);
  }
  if (guard) {
    for (let lv = 1; lv <= levels; lv++) {
      for (const h of rails(lv)) line(g, P(0, lv * step + h), P(L, lv * step + h), 'steel rail');
    }
  }

  // 1.7 m 人形比例尺
  const px = -0.8;
  const head = P(px, 1.55);
  const person = svgEl('g', { class: 'person' }, g);
  svgEl('circle', { cx: r1(head[0]), cy: r1(head[1]), r: r1(0.12 * f) }, person);
  line(person, P(px, 1.42), P(px, 0.8), '');
  line(person, P(px, 0.8), P(px - 0.18, -0.3), '');
  line(person, P(px, 0.8), P(px + 0.18, -0.3), '');
  line(person, P(px - 0.3, 1.0), P(px, 1.3), '');
  line(person, P(px + 0.3, 1.0), P(px, 1.3), '');

  const dims = svgEl('g', { class: 'dims' }, svg);
  const base = P(0, -0.3)[1] + 22;
  line(dims, [0, base - 8], [L * f, base - 8], 'dim');
  text(dims, [L * f / 2, base + 8], corners ? `外側展開長 ${fmtM(L)}（${bays} 跨 ＋ ${corners} 轉角）` : `總長 ${fmtM(L)}（${bays} 跨 × ${fmtM(span)}）`);
  const xr = L * f + 14;
  line(dims, [xr, 0], [xr, -H * f], 'dim');
  text(dims, [xr + 6, -H * f / 2 + 5], `${fmtM(H)}`, 'label', 'start');
  text(dims, [xr + 6, -H * f / 2 + 21], `${levels} 層 × ${fmtM(step)}`, 'tag', 'start');
  text(dims, [P(px, 0)[0], base + 8], '人 1.7 m', 'tag');

  fitViewBox(svg, 10);
}

// 平面圖：沿建物外牆順時針排列，每個外轉角向右轉 90°。
function drawPlan(container, o) {
  const { runs, span, width, closed } = o;
  const corners = closed ? runs.length : runs.length - 1;
  const svg = newSvg(container, `平面圖：${runs.length} 面外牆、${corners} 個外轉角`);
  const total = runs.reduce((a, n) => a + n * span, 0);
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  // 依最長的兩個方向估比例，讓圖寬約 300。
  let minX = 0, maxX = 0, minY = 0, maxY = 0, cx = 0, cy = 0;
  runs.forEach((n, i) => {
    const d = dirs[i % 4];
    cx += d[0] * n * span; cy += d[1] * n * span;
    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
  });
  const extent = Math.max(maxX - minX, maxY - minY, total > 0 ? 1 : 1) + width * 2;
  const f = 300 / extent;
  const P = (pt) => [pt[0] * f, pt[1] * f];
  const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k];

  const bld = svgEl('g', {}, svg);
  const band = svgEl('g', {}, svg);
  const cols = svgEl('g', {}, svg);
  const dims = svgEl('g', { class: 'dims' }, svg);

  let cur = [0, 0];
  const wallPts = [cur];
  const colPts = [];
  runs.forEach((n, i) => {
    const d = dirs[i % 4];
    const nrm = [d[1], -d[0]]; // 外側法向
    const len = n * span;
    const end = add(cur, d, len);
    const quad = [cur, end, add(end, nrm, width), add(cur, nrm, width)].map(P);
    svgEl('polygon', { points: quad.map((p) => p.map(r1).join(',')).join(' '), class: 'plan-band' }, band);
    for (let k = 0; k <= n; k++) {
      const a = add(cur, d, k * span);
      colPts.push(a, add(a, nrm, width));
    }
    // 牆長標註（外側）
    const mid = add(add(cur, d, len / 2), nrm, width + 0.25 * extent / 10 + 0.3);
    const m = P(mid);
    const anchor = nrm[0] > 0 ? 'start' : nrm[0] < 0 ? 'end' : 'middle';
    text(dims, [m[0], m[1] + (nrm[1] > 0 ? 12 : nrm[1] < 0 ? -2 : 4)], `${i + 1}. ${fmtM(len)}`, 'tag', anchor);

    if (i < runs.length - 1 || closed) {
      const sq = [end, add(end, d, width), add(add(end, d, width), nrm, width), add(end, nrm, width)].map(P);
      svgEl('polygon', { points: sq.map((p) => p.map(r1).join(',')).join(' '), class: 'plan-corner' }, band);
      colPts.push(add(add(end, d, width), nrm, width));
    }
    cur = end;
    wallPts.push(cur);
  });

  const pts = wallPts.map((p) => P(p).map(r1).join(',')).join(' ');
  if (closed) svgEl('polygon', { points: pts, class: 'plan-building' }, bld);
  svgEl('polyline', { points: pts, class: 'plan-wall' }, bld);

  const seen = new Set();
  for (const c of colPts) {
    const p = P(c);
    const key = `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    svgEl('circle', { cx: r1(p[0]), cy: r1(p[1]), r: 2.2, class: 'plan-col' }, cols);
  }
  if (closed) {
    const c = P([(minX + maxX) / 2, (minY + maxY) / 2]);
    text(dims, [c[0], c[1] + 4], '建物', 'tag');
  }
  fitViewBox(svg, 14);
}

window.ScaffoldDrawings = { drawUnit, drawPlan, drawElevation, iconSvg };
