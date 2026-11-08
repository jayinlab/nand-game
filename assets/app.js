import { BOOKS, PARTS, STAGES, ISA, parseProg, asmStep, asmInit, asmRun, VISA, LANES, VEC_NOTE, CU_NOTE, SCHED_NOTE, parseVec, vecInit, vecStep, vecRun, vecOk, cuInit, cuStep, cuRun, cuOk, MEMN, LDSN, PM4_OPS, SH_REGS, PM4_NOTE, KERNELS, parsePm4, dwordOf, pm4Run, hex8, regOff, DISA, SHLIST, DRV_NOTE, RA_NOTE, PAGES, drvInit, drvStep, drvRun, drvOk, parseDrv, vaRead, raSubst, raLive, VKISA, VKKERNELS, VK_NOTE, vkInit, vkStep, vkRun, vkOk, parseVk, bufRead } from './stages.js';

const app = document.getElementById('app');
const SAVE = 'nand-game:v1';
const ALLKEY = 'nand-game:all';
let ALL = new URLSearchParams(location.search).has('all'); // 확인용: 잠금 없이 전부
try { if (localStorage.getItem(ALLKEY) === '1') ALL = true; } catch (e) { /* 없어도 됨 */ }

// ---------- 저장 ----------
let save = {};
try { save = JSON.parse(localStorage.getItem(SAVE)) || {}; } catch (e) { save = {}; }
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) { /* 저장 못 해도 판은 돈다 */ } };
const rec = (id) => save[id] || (save[id] = { solved: false, best: null, count: 0, circ: null });

const idxOf = (id) => STAGES.findIndex((s) => s.id === id);
const unlocked = (i) => ALL || i === 0 || !!(save[STAGES[i - 1].id] || {}).solved;
const maxStars = (s) => (s.par ? 2 : 1);
const starsOf = (s) => {
  const v = save[s.id];
  if (!v || !v.solved) return 0;
  return s.par && v.best != null && v.best <= s.par ? 2 : 1;
};
const starStr = (s) => '★'.repeat(starsOf(s)) + '☆'.repeat(maxStars(s) - starsOf(s));

function partsFor(i) {
  const s = STAGES[i];
  if (s.only) return s.only;
  const set = ['NAND'];
  for (let j = 0; j < i; j++) if (STAGES[j].unlock) set.push(STAGES[j].unlock);
  return set;
}

// ---------- 회로 계산 ----------
// circ = { parts: [{id, type, slot}], wires: { 받는점: 보내는점 } }
// 받는 점 'p3:0'(부품 입력) · 'out:0'(회로 출력), 보내는 점 'in:1'(회로 입력) · 'p3:0'(부품 출력)
function evaluate(circ, inVals, nOut) {
  const byId = {};
  circ.parts.forEach((p) => { byId[p.id] = p; });
  const memo = {};
  const visiting = {};
  let cycle = false;
  function src(key) {
    if (key == null) return 0; // 안 이은 부품 입력은 0
    const [a, k] = key.split(':');
    if (a === 'in') return inVals[+k];
    const p = byId[a];
    if (!p) return 0;
    const o = partOut(p);
    return o == null ? null : o[+k];
  }
  function partOut(p) {
    if (p.id in memo) return memo[p.id];
    if (visiting[p.id]) { cycle = true; return null; }
    visiting[p.id] = true;
    const def = PARTS[p.type];
    const ins = def.ins.map((_, i) => src(circ.wires[p.id + ':' + i]));
    const r = ins.some((v) => v == null) ? null : (def.fn ? def.fn(ins) : def.seq({}, ins)).map((v) => (v ? 1 : 0));
    visiting[p.id] = false;
    memo[p.id] = r;
    return r;
  }
  const outs = [];
  for (let i = 0; i < nOut; i++) {
    const w = circ.wires['out:' + i];
    outs.push(w == null ? null : src(w)); // 안 이은 출력은 비어 있음
  }
  return { outs, src, get cycle() { return cycle; } };
}

// 3부부터: 고리가 있는 판. 부품마다 출력을 들고 있다가(mem) 값이 멈출 때까지 차례로 다시 계산한다.
// 기억 상자(seq)는 속 상태도 mem에 둔다. 64번 돌아도 안 멈추면 「흔들림」.
function simulate(circ, inVals, nOut, mem) {
  for (const p of circ.parts) if (!mem[p.id]) mem[p.id] = { st: {}, out: PARTS[p.type].outs.map(() => 0) };
  const val = (key) => {
    if (key == null) return 0;
    const [a, k] = key.split(':');
    if (a === 'in') return inVals[+k];
    return mem[a] ? mem[a].out[+k] : 0;
  };
  let stable = false;
  for (let pass = 0; pass < 64 && !stable; pass++) {
    stable = true;
    for (const p of circ.parts) {
      const def = PARTS[p.type], m = mem[p.id];
      const ins = def.ins.map((_, i) => val(circ.wires[p.id + ':' + i]));
      const o = (def.seq ? def.seq(m.st, ins) : def.fn(ins)).map((v) => (v ? 1 : 0));
      if (o.some((v, k) => v !== m.out[k])) { stable = false; m.out = o; }
    }
  }
  const outs = [];
  for (let i = 0; i < nOut; i++) { const w = circ.wires['out:' + i]; outs.push(w == null ? null : val(w)); }
  return { outs, src: val, cycle: false, osc: !stable };
}
const runSteps = (circ, spec, upto = spec.steps.length - 1, mem = {}) =>
  spec.steps.slice(0, upto + 1).map((x) => simulate(circ, x, spec.outs.length, mem));

const bitsOf = (r, n) => Array.from({ length: n }, (_, i) => (r >> (n - 1 - i)) & 1);
const costOf = (circ) => circ.parts.reduce((t, p) => t + PARTS[p.type].cost, 0);

// ---------- 무작위 표 ----------
function randomTable(n) {
  const rows = 1 << n;
  for (;;) {
    const t = Array.from({ length: rows }, () => (Math.random() < 0.5 ? 1 : 0));
    const ones = t.reduce((x, y) => x + y, 0);
    if (ones > 0 && ones < rows) return t;
  }
}

// ---------- 화면 상태 ----------
let cur = null;

function specOf() {
  const s = cur.s;
  if (s.random) {
    const n = s.random;
    return {
      ins: ['A', 'B', 'C', 'D'].slice(0, n), outs: ['출력'],
      expect: (vals) => [cur.table[vals.reduce((r, v) => r * 2 + v, 0)]],
    };
  }
  const t = cur.sub || s;
  if (t.asm) return { asm: true, ins: [], outs: [] };
  if (t.pm4) return { pm4: true, ins: [], outs: [] };
  if (t.ra) return { ra: true, ins: [], outs: [] };
  if (t.steps) {
    const steps = t.steps.map((x) => [...x].map(Number)), st = {};
    return { ins: t.ins, outs: t.outs, seq: true, steps, want: steps.map((x) => t.model(st, x).map((v) => (v == null ? null : v ? 1 : 0))) };
  }
  return { ins: t.ins, outs: t.outs, expect: (vals) => t.fn(vals).map((v) => (v ? 1 : 0)) };
}

// 매번 바뀌는 스테이지(무작위 표·앞 스테이지 뽑기)는 판을 저장하지 않는다
const temp = (s) => !!(s.random || s.pool);
// pool 시험: 앞 스테이지 하나를 뽑는다(바로 앞 문제와 다르게)
function pickPool(s, prev) {
  const ids = s.pool.filter((id) => !prev || id !== prev.id);
  return STAGES[idxOf(ids[Math.floor(Math.random() * ids.length)])];
}

// 스테이지(또는 이번에 뽑힌 문제)에 맞춰 입력·프로그램·기계를 준비한다
function setupTask() {
  const t = cur.sub || cur.s;
  if (t.ra) {
    const v = rec(cur.s.id);
    cur.prog = !temp(cur.s) && v.prog ? v.prog.slice() : t.ra.temps.map(() => null);
    cur.tsel = 0;
  }
  if (t.pm4) {
    const v = rec(cur.s.id);
    cur.prog = !temp(cur.s) && v.prog ? JSON.parse(JSON.stringify(v.prog)) : [];
    cur.db = !temp(cur.s) && v.db != null ? v.db : null;
    cur.asel = null; cur.tsel = 0;
  }
  if (t.asm) {
    const v = rec(cur.s.id);
    cur.prog = !temp(cur.s) && v.prog ? JSON.parse(JSON.stringify(v.prog)) : [];
    cur.asel = null; cur.tsel = 0;
    cur.m = machInit(t, 0);
  }
  cur.inVals = specOf().ins.map(() => 0);
}

function openStage(i) {
  const s = STAGES[i];
  const v = rec(s.id);
  cur = {
    i, s, sel: null, undo: [], msg: '', pass: false, round: 0, hintOpen: false, hintStep: 1, nearMsg: '',
    circ: !temp(s) && v.circ ? JSON.parse(JSON.stringify(v.circ)) : { parts: [], wires: {} },
    table: s.random ? randomTable(s.random) : null,
    sub: s.pool ? pickPool(s) : null,
    live: {}, stepAt: null,
  };
  setupTask();
  renderStage();
  window.scrollTo(0, 0);
}

function change(fn) {
  cur.undo.push(JSON.stringify(cur.circ));
  if (cur.undo.length > 60) cur.undo.shift();
  fn(cur.circ);
  cur.msg = '';
  cur.pass = false;
  if (!temp(cur.s)) { rec(cur.s.id).circ = cur.circ; persist(); }
}

// ---------- 판 그리기 ----------
const W = 360, ROWH = 92, COLX = [104, 181, 258], BW = 44, PS = 24;
const IN_PORT = 58, OUT_PORT = 302;

function geometry(spec) {
  const maxSlot = cur.circ.parts.reduce((m, p) => Math.max(m, p.slot), -1);
  const rows = Math.max(3, Math.floor(maxSlot / 3) + 2);
  const hOf = (t) => Math.max(PARTS[t].ins.length, PARTS[t].outs.length) * PS + 8;
  const rowH = Array(rows).fill(ROWH);
  cur.circ.parts.forEach((p) => { const r = Math.floor(p.slot / 3); rowH[r] = Math.max(rowH[r], hOf(p.type) + 20); });
  const rowY = rowH.map((_, r) => 8 + rowH.slice(0, r).reduce((t, x) => t + x, 0));
  const H = Math.max(rowY[rows - 1] + rowH[rows - 1], spec.ins.length * 56, spec.outs.length * 56) + 16;
  const pos = {};
  spec.ins.forEach((_, i) => { pos['in:' + i] = [IN_PORT, (H * (i + 1)) / (spec.ins.length + 1)]; });
  spec.outs.forEach((_, i) => { pos['out:' + i] = [OUT_PORT, (H * (i + 1)) / (spec.outs.length + 1)]; });
  const box = {};
  cur.circ.parts.forEach((p) => {
    const def = PARTS[p.type];
    const cx = COLX[p.slot % 3];
    const r = Math.floor(p.slot / 3), cy = rowY[r] + rowH[r] / 2;
    const h = hOf(p.type);
    box[p.id] = { cx, cy, h };
    def.ins.forEach((_, k) => { pos[p.id + ':' + k + ':i'] = [cx - BW / 2, cy - ((def.ins.length - 1) * PS) / 2 + k * PS]; });
    def.outs.forEach((_, k) => { pos[p.id + ':' + k + ':o'] = [cx + BW / 2, cy - ((def.outs.length - 1) * PS) / 2 + k * PS]; });
  });
  const srcPos = (key) => (key.startsWith('in:') ? pos[key] : pos[key + ':o']);
  const sinkPos = (key) => (key.startsWith('out:') ? pos[key] : pos[key + ':i']);
  return { rows, rowH, rowY, H, box, srcPos, sinkPos };
}

const cls = (v) => (v == null ? 'x' : v ? 'on' : 'off');

// 게이트는 회로도 기호로, 나머지 부품은 칩으로 그린다. 점 자리는 geometry()와 같다(입력 왼쪽 cx-22, 출력 오른쪽 cx+22).
const GATES = new Set(['NAND', 'NOT', 'AND', 'OR', 'NOR', 'XOR', 'XNOR']);
function gatePath(type, cx, cy) {
  const one = type === 'NOT', hy = one ? 11 : 18, y0 = cy - hy, y1 = cy + hy;
  const bub = type === 'NAND' || type === 'NOR' || type === 'XNOR' || one;
  const xe = bub ? cx + 12 : cx + 18, L = cx - BW / 2, R = cx + BW / 2;
  const ins = one ? [cy] : [cy - PS / 2, cy + PS / 2];
  let stub = ins.map((y) => `M${L} ${y}H${cx - 8}`).join('') + `M${bub ? xe + 7 : xe} ${cy}H${R}`, body, back = '';
  if (one) body = `M${cx - 14} ${y0}L${xe} ${cy}L${cx - 14} ${y1}Z`;
  else if (type === 'NAND' || type === 'AND') body = `M${cx - 16} ${y0}H${xe - hy}A${hy} ${hy} 0 0 1 ${xe - hy} ${y1}H${cx - 16}Z`;
  else {
    const x0 = type === 'OR' || type === 'NOR' ? cx - 17 : cx - 13;
    body = `M${x0} ${y0}Q${x0 + 9} ${cy} ${x0} ${y1}Q${xe - 14} ${y1} ${xe} ${cy}Q${xe - 14} ${y0} ${x0} ${y0}Z`;
    if (type[0] === 'X') back = `M${x0 - 5} ${y0}Q${x0 + 4} ${cy} ${x0 - 5} ${y1}`;
  }
  return { stub, body, back, bubble: bub ? [xe + 3.5, cy] : null, hy };
}
function partShape(type, cx, cy, h, sel, out, m = { c: '', st: '' }) {
  const def = PARTS[type];
  if (GATES.has(type)) {
    const g = gatePath(type, cx, cy);
    let s = `<path d="${g.stub}" class="stub"/>`;
    if (g.back) s += `<path d="${g.back}" class="gback${sel ? ' sel' : ''}"/>`;
    s += `<path d="${g.body}" class="part gate${out ? ' lit' : ''}${sel ? ' sel' : ''}${m.c}"${m.st}/>`;
    if (g.bubble) s += `<circle cx="${g.bubble[0]}" cy="${g.bubble[1]}" r="3.5" class="part bubble${sel ? ' sel' : ''}"/>`;
    return s + `<text x="${cx}" y="${cy + g.hy + 10}" class="glabel">${type}</text>`;
  }
  const mid = (ls) => ls.length % 2 === 1 && ls[(ls.length - 1) / 2], top = mid(def.ins) || mid(def.outs) ? 9 : 0; // 가운데 줄에 핀 이름이 있으면 이름을 머리 칸으로
  const x = cx - BW / 2, y = cy - h / 2 - top, w = BW;
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h + top}" rx="5" class="part chip${sel ? ' sel' : ''}"/>`;
  s += `<path d="M${cx - 5} ${y}A5 5 0 0 0 ${cx + 5} ${y}" class="notch"/>`;
  s += `<text x="${cx}" y="${top ? y + 15 : cy + 3.5}" class="plabel"${type.length > 4 ? ' textLength="30" lengthAdjust="spacingAndGlyphs"' : ''}>${type}</text>`;
  def.ins.forEach((l, k) => { if (l) s += `<text x="${x + 8}" y="${cy - ((def.ins.length - 1) * PS) / 2 + k * PS + 3}" class="pin">${l}</text>`; });
  def.outs.forEach((l, k) => { if (l) s += `<text x="${x + w - 8}" y="${cy - ((def.outs.length - 1) * PS) / 2 + k * PS + 3}" class="pin r">${l}</text>`; });
  return s;
}
// 단추에 붙는 작은 기호
function gateIcon(type) {
  if (!GATES.has(type)) return '';
  const g = gatePath(type, 22, 20);
  return `<svg class="gicon" viewBox="0 0 44 40" aria-hidden="true"><path d="${g.stub}"/>${g.back ? `<path d="${g.back}"/>` : ''}<path d="${g.body}" class="b"/>${g.bubble ? `<circle cx="${g.bubble[0]}" cy="${g.bubble[1]}" r="3.5" class="b"/>` : ''}</svg>`;
}

function boardSvg(spec, ev) {
  const g = geometry(spec);
  const sel = cur.sel;
  let s = `<svg viewBox="0 0 ${W} ${g.H}" class="board-svg" role="img" aria-label="회로판">`;
  s += `<defs><pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r="1" class="dot"/></pattern>`;
  s += `<filter id="glow" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${W + 40}" height="${g.H + 40}"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  s += `<rect x="0" y="0" width="${W}" height="${g.H}" class="bg" fill="url(#dots)" data-k="bg"/>`;

  // 신호 번짐 — 지난번 그림과 값이 달라진 곳만, 입력에서 몇 부품 건너인지(깊이)만큼 늦게 바뀌어 보이게 한다.
  // 고리(래치)는 처음 만난 곳에서 끊어 깊이를 센다. 판정과는 상관없는 그림일 뿐.
  const depth = {}, walking = new Set();
  const dep = (key) => {
    if (!key || key.startsWith('in:')) return 0;
    const id = key.split(':')[0];
    if (depth[id] != null) return depth[id];
    if (walking.has(id)) return 0;
    walking.add(id);
    const p = cur.circ.parts.find((x) => x.id === id);
    let d = 0;
    if (p) PARTS[p.type].ins.forEach((_, k) => { d = Math.max(d, dep(cur.circ.wires[id + ':' + k])); });
    walking.delete(id);
    return (depth[id] = d + 1);
  };
  const maxDep = cur.circ.parts.reduce((m, p) => Math.max(m, dep(p.id + ':0')), 1);
  const step = Math.min(120, 900 / maxDep), prev = cur.sig, sig = (cur.sig = {});
  const anim = (key, val) => {
    sig[key] = val;
    if (!prev || !(key in prev) || prev[key] === val) return { c: '', st: '' };
    return { c: ' chg', st: ` style="--d:${Math.round(dep(key) * step)}ms"` };
  };
  cur.inVals.forEach((v, i) => anim('in:' + i, v));
  for (const p of cur.circ.parts) PARTS[p.type].outs.forEach((_, k) => anim(p.id + ':' + k, ev.src(p.id + ':' + k)));

  if (sel && sel.t === 'part') {
    const used = new Set(cur.circ.parts.map((p) => p.slot));
    for (let k = 0; k < g.rows * 3; k++) {
      if (used.has(k)) continue;
      const cx = COLX[k % 3], r = Math.floor(k / 3);
      s += `<rect x="${cx - 34}" y="${g.rowY[r] + 8}" width="68" height="${g.rowH[r] - 16}" rx="8" class="slot" data-k="slot" data-slot="${k}"/>`;
    }
  }

  for (const [sink, src] of Object.entries(cur.circ.wires)) {
    const a = g.srcPos(src), z = g.sinkPos(sink);
    if (!a || !z) continue;
    const dx = Math.max(24, Math.abs(z[0] - a[0]) / 2);
    const d = `M${a[0]} ${a[1]} C${a[0] + dx} ${a[1]} ${z[0] - dx} ${z[1]} ${z[0]} ${z[1]}`, c = cls(ev.src(src)), m = anim(src, ev.src(src));
    s += `<path d="${d}" class="wire ${c}${m.c}"${m.st}${c === 'on' ? ' filter="url(#glow)"' : ''}/>`;
    if (c === 'on') s += `<path d="${d}" class="flow${m.c}"${m.st}/>`;
  }

  for (const p of cur.circ.parts) {
    const def = PARTS[p.type], b = g.box[p.id];
    const on = sel && sel.t === 'part' && sel.id === p.id;
    s += `<g data-k="part" data-id="${p.id}"><rect x="${b.cx - BW / 2}" y="${b.cy - b.h / 2}" width="${BW}" height="${b.h}" class="phit"/>`;
    s += partShape(p.type, b.cx, b.cy, b.h, on, ev.src(p.id + ':0'), anim(p.id + ':0', ev.src(p.id + ':0')));
    s += `</g>`;
  }

  spec.ins.forEach((name, i) => {
    const [x, y] = g.srcPos('in:' + i), v = cur.inVals[i];
    s += `<g data-k="inbtn" data-i="${i}" class="sw ${v ? 'on' : 'off'}"><rect x="4" y="${y - 18}" width="46" height="36" rx="10" class="io ${v ? 'on' : 'off'}"${v ? ' filter="url(#glow)"' : ''}/>`;
    s += `<text x="17" y="${y + 5}" class="ioname">${name}</text><rect x="31" y="${y - 9}" width="15" height="18" rx="5" class="knob"/><text x="38.5" y="${y + 4.5}" class="ioval">${v}</text></g>`;
  });
  spec.outs.forEach((name, i) => {
    const [x, y] = g.sinkPos('out:' + i), v = ev.outs[i], w = cur.circ.wires['out:' + i];
    const m = w ? anim(w, ev.src(w)) : { c: '', st: '' };
    s += `<rect x="310" y="${y - 18}" width="46" height="36" rx="10" class="io lamp ${cls(v)}${m.c}"${m.st}${v ? ' filter="url(#glow)"' : ''}/>`;
    s += `<text x="333" y="${y - 3}" class="ioname sm">${name}</text><text x="333" y="${y + 12}" class="ioval c${m.c}"${m.st}>${v == null ? '–' : v}</text>`;
  });

  // 점은 맨 위에 — 손가락이 닿는 넓은 투명 원 + 보이는 작은 원
  cur.ports = [];
  cur.rows = g.rows; cur.rowY = g.rowY; cur.rowH = g.rowH;
  const port = (k, key, [x, y], val, from) => {
    const m = from ? anim(from, val) : { c: '', st: '' };
    const on = sel && sel.t === k && sel.key === key;
    cur.ports.push({ t: k, key, x, y });
    const owner = key.startsWith('in:') || key.startsWith('out:') ? '' : ` data-owner="${key.split(':')[0]}"`;
    return `<g data-k="${k}" data-key="${key}"${owner}><circle cx="${x}" cy="${y}" r="13" class="hit"/><circle cx="${x}" cy="${y}" r="${on ? 8 : 6}" class="port ${cls(val)}${on ? ' sel' : ''}${m.c}"${m.st}/></g>`;
  };
  spec.ins.forEach((_, i) => { s += port('src', 'in:' + i, g.srcPos('in:' + i), cur.inVals[i]); });
  spec.outs.forEach((_, i) => { s += port('sink', 'out:' + i, g.sinkPos('out:' + i), ev.outs[i], cur.circ.wires['out:' + i]); });
  for (const p of cur.circ.parts) {
    const def = PARTS[p.type];
    def.ins.forEach((_, k) => { const key = p.id + ':' + k; s += port('sink', key, g.sinkPos(key), cur.circ.wires[key] ? ev.src(cur.circ.wires[key]) : 0, cur.circ.wires[key]); });
    def.outs.forEach((_, k) => { const key = p.id + ':' + k; s += port('src', key, g.srcPos(key), ev.src(key), key); });
  }
  return s + '</svg>';
}

function statusText() {
  const sel = cur.sel;
  if (!sel) return cur.circ.parts.length ? '점에서 다른 점으로 끌면(또는 차례로 누르면) 선이 이어져요. 부품은 끌어서 옮기고, 누르면 지울 수 있어요.' : '아래 단추로 부품을 놓아요.';
  if (sel.t === 'src') return '이 신호를 보낼 곳 — 부품 왼쪽 점이나 출력 점을 누르세요.';
  if (sel.t === 'sink') return cur.circ.wires[sel.key] ? '다른 신호를 누르면 바꿔 이어요. 「선 끊기」로 끊어요.' : '이 점에 넣을 신호 — 입력이나 부품 오른쪽 점을 누르세요.';
  return '점선 빈 칸을 누르면 그리로 옮겨요.';
}

// 3부부터: 시간 줄 표. 전원을 켠 뒤 위에서 아래로 차례로 넣는다. 원함이 「·」이면 그 칸은 안 본다.
function timeline(spec) {
  const got = runSteps(cur.circ, spec).map((e) => e.outs);
  const no = spec.outs.length;
  let h = '<table class="tt tl"><thead><tr><th>#</th>';
  h += spec.ins.map((x) => `<th>${x}</th>`).join('');
  h += spec.outs.map((x, k) => `<th class="want${k === 0 ? ' gap' : ''}">${no > 1 ? x : '원함'}</th>`).join('');
  h += spec.outs.map((x, k) => `<th class="${k === 0 ? 'gap' : ''}">${no > 1 ? x : '지금'}</th>`).join('');
  h += '</tr>';
  if (no > 1) h += `<tr class="sub"><th colspan="${spec.ins.length + 1}"></th><th colspan="${no}" class="gap">원함</th><th colspan="${no}" class="gap">지금</th></tr>`;
  h += '</thead><tbody>';
  spec.steps.forEach((vals, r) => {
    const want = spec.want[r];
    const ci = spec.ins.indexOf('clk');
    const edge = ci >= 0 && vals[ci] === 1 && r > 0 && spec.steps[r - 1][ci] === 0;
    h += `<tr data-step="${r}" class="${r === cur.stepAt ? 'cur' : ''}${edge ? ' edge' : ''}"><td class="sn">${r + 1}${edge ? '↑' : ''}</td>`;
    h += vals.map((v) => `<td>${v}</td>`).join('');
    h += want.map((v, k) => `<td class="want${k === 0 ? ' gap' : ''}">${v == null ? '·' : v}</td>`).join('');
    h += got[r].map((v, k) => `<td class="${k === 0 ? 'gap ' : ''}${v == null ? 'none' : want[k] == null ? '' : v === want[k] ? 'ok' : 'bad'}">${v == null ? '–' : v}</td>`).join('');
    h += '</tr>';
  });
  h += '</tbody></table>';
  h += `<p class="ttnote">위에서부터 차례로 넣어요${spec.ins.includes('clk') ? ' · ↑ = clk가 0→1로 바뀐 줄' : ''} · 「·」은 안 봐요 · 줄을 누르면 그 순간까지 돌린 판</p>`;
  return h;
}

const TT_MAX = 16;
function truthTable(spec) {
  const n = spec.ins.length, rows = 1 << n;
  const curRow = cur.inVals.reduce((r, v) => r * 2 + v, 0);
  let h = '<table class="tt"><thead><tr>';
  h += spec.ins.map((x) => `<th>${x}</th>`).join('');
  h += spec.outs.map((x, k) => `<th class="want${k === 0 ? ' gap' : ''}">${spec.outs.length > 1 ? x : '원함'}</th>`).join('');
  h += spec.outs.map((x, k) => `<th class="${k === 0 ? 'gap' : ''}">${spec.outs.length > 1 ? x : '지금'}</th>`).join('');
  h += '</tr>';
  if (spec.outs.length > 1) h += `<tr class="sub"><th colspan="${n}"></th><th colspan="${spec.outs.length}" class="gap">원함</th><th colspan="${spec.outs.length}" class="gap">지금</th></tr>`;
  h += '</thead><tbody>';
  const all = [];
  for (let r = 0; r < rows; r++) {
    const vals = bitsOf(r, n), want = spec.expect(vals);
    const got = evaluate(cur.circ, vals, spec.outs.length).outs;
    all.push({ r, vals, want, got, bad: got.some((v, k) => v !== want[k]) });
  }
  // 줄이 많으면(입력 다섯 이상) 16줄만 — 지금 줄, 틀린 줄을 먼저 채우고 나머지는 고르게
  let show = all;
  if (rows > TT_MAX && !cur.ttAll) {
    const pick = new Set([curRow]);
    for (const x of all) if (x.bad && x.got.some((v) => v != null) && pick.size < TT_MAX / 2) pick.add(x.r);
    const step = rows / TT_MAX;
    for (let off = 0; off < step && pick.size < TT_MAX; off++) for (let k = 0; k < TT_MAX && pick.size < TT_MAX; k++) pick.add(k * step + off);
    show = all.filter((x) => pick.has(x.r));
  }
  for (const { r, vals, want, got } of show) {
    h += `<tr data-row="${r}" class="${r === curRow ? 'cur' : ''}">`;
    h += vals.map((v) => `<td>${v}</td>`).join('');
    h += want.map((v, k) => `<td class="want${k === 0 ? ' gap' : ''}">${v}</td>`).join('');
    h += got.map((v, k) => `<td class="${k === 0 ? 'gap ' : ''}${v == null ? 'none' : v === want[k] ? 'ok' : 'bad'}">${v == null ? '–' : v}</td>`).join('');
    h += '</tr>';
  }
  h += '</tbody></table>';
  if (rows > TT_MAX) h += `<p class="ttnote">${cur.ttAll ? `${rows}줄 전부예요.` : `${rows}줄 중 ${TT_MAX}줄 — 틀린 줄을 먼저 보여요. 「확인」은 전부 봐요.`} <button data-a="ttall">${cur.ttAll ? '줄여 보기' : '전부 보기'}</button></p>`;
  return h;
}

function renderStage() {
  if ((cur.sub || cur.s).ra) return renderRa();
  if ((cur.sub || cur.s).pm4) return renderPm4();
  if ((cur.sub || cur.s).asm) return renderAsm();
  const { s, i } = cur;
  const spec = specOf();
  if (spec.seq && cur.stepAt != null) { cur.live = {}; runSteps(cur.circ, spec, cur.stepAt - 1, cur.live); }
  const ev = spec.seq ? simulate(cur.circ, cur.inVals, spec.outs.length, cur.live) : evaluate(cur.circ, cur.inVals, spec.outs.length);
  const cost = costOf(cur.circ);
  const v = rec(s.id);
  const avail = partsFor(i);
  const sel = cur.sel;

  let tools = `<button data-a="undo" ${cur.undo.length ? '' : 'disabled'}>되돌리기</button>`;
  if (sel && sel.t === 'part') tools += `<button data-a="del" class="warn">부품 지우기</button>`;
  if (sel && sel.t === 'sink' && cur.circ.wires[sel.key]) tools += `<button data-a="cut" class="warn">선 끊기</button>`;
  tools += `<button data-a="reset" ${cur.circ.parts.length ? '' : 'disabled'}>처음부터</button>`;
  if (spec.seq) tools += `<button data-a="power">전원 다시</button>`;

  app.innerHTML = `
  ${headHtml()}
  <div class="board">${boardSvg(spec, ev)}</div>
  <p class="status">${ev.osc ? '<b>값이 멈추지 않아요</b> — 고리가 계속 뒤집혀요(예: NOT이 자기 자신으로). ' : ''}${ev.cycle ? '<b>고리가 있어요</b> — 신호가 제자리로 돌아와서 값이 안 정해져요. 3부(기억)에서 이 고리를 일부러 써요. ' : ''}${statusText()}</p>
  <div class="tools">${tools}</div>
  <div class="palette">${avail.map((t) => `<button data-add="${t}">${gateIcon(t)}${t}<small>${PARTS[t].cost}</small></button>`).join('')}</div>
  <p class="cost">NAND ${cost}개 몫${s.par ? ` · 별 두 개는 ${s.par}개 이하` : ''}${v.best != null ? ` · 최고 ${v.best}` : ''}</p>
  ${spec.seq ? timeline(spec) : truthTable(spec)}
  ${checkHtml()}`;
  hookHints();
}

function headHtml() {
  const s = cur.s, v = rec(s.id);
  const roundTxt = s.rounds ? `<span class="round">${cur.round + (cur.pass ? 0 : 1)} / ${s.rounds}</span>` : '';
  return `<header class="bar"><a href="#" class="back">← 목록</a><span class="sid">${s.id}</span><span class="stars">${starStr(s)}</span>${v.count ? `<span class="count">${v.count}번 풂</span>` : ''}</header>
  <section class="task">
    <h1>${s.title} <span class="kind k-${s.kind}">${s.kind}</span>${roundTxt}</h1>
    <p>${s.text}</p>
    ${s.only ? `<p class="rule">쓸 수 있는 부품: ${s.only.join(', ')}만</p>` : ''}
    ${cur.sub ? `<p class="subq">이번 문제 · <b>${cur.sub.id} ${cur.sub.title}</b> — ${cur.sub.text}</p>` : ''}
    ${hintBox(cur.sub || s)}
  </section>`;
}

function checkHtml() {
  const s = cur.s, next = STAGES[cur.i + 1];
  let after = '';
  if (cur.pass && s.rounds && cur.round < s.rounds) after = `<button data-a="round" class="primary">${s.pool ? '다음 문제' : '다음 표'} →</button>`;
  else if (cur.pass && next) after = `<a class="btn primary" href="#s/${next.id}">다음: ${next.id} ${next.title} →</a>`;
  else if (cur.pass) after = `<a class="btn primary" href="#">목록으로</a>`;
  return `<div class="check">
    ${cur.pass ? '' : `<button data-a="check" class="primary">확인</button>`}
    ${cur.msg ? `<p class="msg ${cur.pass ? 'good' : 'badmsg'}">${cur.msg}</p>` : ''}
    ${after}
    ${cur.pass && cur.share ? `<button data-a="share">기록 남기기</button>` : ''}
  </div>`;
}

function hookHints() {
  const d = app.querySelector('details.hints');
  if (d) d.addEventListener('toggle', () => { cur.hintOpen = d.open; });
}

// ---------- 4부 어셈블리 ----------
// 기계 둘: 4부 작은 컴퓨터(cpu) · 5부 작은 웨이브(vec). 편집기·시험 표는 같이 쓴다
// 6부 작은 CU(cu)는 벡터 편집기를 같이 쓰고 기계만 다르다
const isVec = (t) => !!t.asm.vec;
const isCu = (t) => !!t.asm.cu;
const isDrv = (t) => !!t.asm.drv;
const isVk = (t) => !!t.asm.vk;
const isaOf = (t) => (t && t.asm && t.asm.vk ? VKISA : t && t.asm && t.asm.drv ? DISA : VISA);
const machInit = (t, k) => (isVk(t) ? vkInit(t.asm.v, t.asm.tests[k] || {}) : isDrv(t) ? drvInit(t.asm.d, t.asm.tests[k] || {}) : isCu(t) ? cuInit(t.asm, t.asm.tests[k] || {}, cur.prog || []) : isVec(t) ? vecInit(t.asm, t.asm.tests[k] || {}) : asmInit(ramOf(t, k)));
const machStep = (t, prog, m) => (isVk(t) ? vkStep(t.asm.v, prog, m) : isDrv(t) ? drvStep(t.asm.d, prog, m) : isCu(t) ? cuStep(prog, m) : isVec(t) ? vecStep(prog, m) : asmStep(prog, m));
const machRun = (t, prog, k) => (isVk(t) ? vkRun(t.asm.v, prog, t.asm.tests[k]) : isDrv(t) ? drvRun(t.asm.d, prog, t.asm.tests[k]) : isCu(t) ? cuRun(prog, t.asm, t.asm.tests[k]) : isVec(t) ? vecRun(prog, t.asm, t.asm.tests[k]) : asmRun(prog, ramOf(t, k)));
const machOk = (t, x, m) => (isVk(t) ? vkOk(x, m) : isDrv(t) ? drvOk(x, m) : isCu(t) ? cuOk(x, m) : isVec(t) ? vecOk(x, m) : testOk(x, m));
const memTxt = (o) => Object.entries(o || {}).map(([k, v]) => `[${k}]=${v}`).join(' ');
const parseSol = (t) => (isVk(t) ? parseVk(t.sol) : isDrv(t) ? parseDrv(t.sol) : isVec(t) ? parseVec(t.sol) : parseProg(t.sol));
const VRANGE = { v: 4, s: 4, vs: 8, n: 16, k: 16, r: 4, g: 3, N: 256, b: 4, m: 4, d: 2, p: 2, K: 2 };
const vArg = (kind, x) => ('bmdp'.includes(kind) && kind.length === 1 ? `${kind}${x}` : kind === 'K' ? VKKERNELS[x].name : kind === 'r' ? `r${x}` : kind === 'g' ? SHLIST[x] : kind === 'N' ? `${x}` : kind === 'v' ? `v${x}` : kind === 's' ? `s${x}` : kind === 'vs' ? (x < 4 ? `v${x}` : `s${x - 4}`) : kind === 'k' ? `→ ${x}` : `${x}`);
const vLine = (l, I = VISA) => I[l.op].args.map((k, i) => vArg(k, l.a[i])).join(', ');
const lanesOf = (mask) => { const on = []; for (let l = 0; l < LANES; l++) if ((mask >> l) & 1) on.push(l); return on.length === LANES ? '전부' : on.length ? on.join('·') : '없음'; };
const vRegsTxt = (o) => [
  ...Object.entries(o.v || {}).map(([r, arr]) => `v${r}=[${arr.map((x) => (x == null ? '·' : x)).join(',')}]`),
  ...Object.entries(o.s || {}).map(([r, x]) => `s${r}=${x}`),
  ...(o.exec != null ? [`EXEC 레인 ${lanesOf(o.exec)}`] : []),
].join(' ') || '–';

const ramOf = (t, k) => ({ ...(t.asm.ram || {}), ...((t.asm.tests[k] || {}).ram || {}) });
const argTxt = (l) => { const a = ISA[l.op].arg; return a === 'n' ? `${l.n}` : a === 'm' ? `[${l.n}]` : a === 'k' ? `→ ${l.n}` : ''; };
const codeOf = (l) => ((ISA[l.op].code << 4) | (ISA[l.op].arg ? l.n : 0)).toString(16).toUpperCase().padStart(2, '0');
const ramTxt = (r) => Object.entries(r).map(([k, v]) => `[${k}]=${v}`).join(' ') || '없음';
const wantTxt = (x) => [x.out ? (x.out.length ? x.out.join(', ') : '(없음)') : '', x.mem ? ramTxt(x.mem) : ''].filter(Boolean).join(' · ');
function testOk(x, m) {
  if (m.err) return false;
  if (x.out && JSON.stringify(m.out) !== JSON.stringify(x.out)) return false;
  if (x.mem && !Object.entries(x.mem).every(([k, v]) => m.ram[k] === v)) return false;
  return true;
}

function changeProg(fn) {
  cur.undo.push(JSON.stringify(cur.prog));
  if (cur.undo.length > 60) cur.undo.shift();
  fn();
  cur.msg = ''; cur.pass = false;
  if (!(cur.sub || cur.s).pm4 && !(cur.sub || cur.s).ra) cur.m = machInit(cur.sub || cur.s, cur.tsel);
  if (!temp(cur.s)) { rec(cur.s.id).prog = cur.prog; rec(cur.s.id).db = cur.db; persist(); }
}

function renderAsm() {
  const s = cur.s, t = cur.sub || s, v = rec(s.id), prog = cur.prog, m = cur.m, a = cur.asel;
  const vec = isVec(t), VI = isaOf(t);
  const init = vec ? null : asmInit(ramOf(t, cur.tsel)).ram;
  let h = headHtml();
  h += `<div class="asm"><ol class="prog${vec ? ' vec' : ''}">`;
  prog.forEach((l, k) => {
    const pcs = isCu(t) ? m.waves.filter((w) => !w.halted).map((w) => w.pc) : [m.pc];
    const cls = `${k === a ? 'sel' : ''}${pcs.includes(k) && !m.halted && m.steps ? ' pc' : ''}`;
    h += vec
      ? `<li data-a="asel" data-line="${k}" class="${cls}"><span class="ln">${k}</span><span class="vl"><b class="op">${l.op}</b> ${vLine(l, VI)}</span></li>`
      : `<li data-a="asel" data-line="${k}" class="${cls}"><span class="ln">${k}</span><span class="op">${l.op}</span><span class="arg">${argTxt(l)}</span><span class="code">${codeOf(l)}</span></li>`;
  });
  h += '</ol>';
  if (!prog.length) h += '<p class="empty">아래 명령 단추로 줄을 쌓아요. 줄을 누르면 수를 바꾸거나 옮길 수 있어요.</p>';
  if (a != null && prog[a]) {
    const l = prog[a];
    h += `<div class="lineedit"><span>${a}번 줄</span>`;
    if (vec) VI[l.op].args.forEach((kd, i) => { h += kd === 'N' ? `<span class="argbox"><button data-a="adec" data-i="${i}">−</button><input data-a="vnin" data-i="${i}" inputmode="numeric" value="${l.a[i]}" size="4"><button data-a="ainc" data-i="${i}">+</button></span>` : `<span class="argbox"><button data-a="adec" data-i="${i}">−</button><b>${vArg(kd, l.a[i])}</b><button data-a="ainc" data-i="${i}">+</button></span>`; });
    else if (ISA[l.op].arg) h += `<button data-a="adec">−</button><b>${l.n}</b><button data-a="ainc">+</button>`;
    h += `<button data-a="aup" ${a ? '' : 'disabled'}>↑</button><button data-a="adown" ${a < prog.length - 1 ? '' : 'disabled'}>↓</button><button data-a="adel" class="warn">지우기</button></div>`;
  }
  h += `<div class="tools"><button data-a="undo" ${cur.undo.length ? '' : 'disabled'}>되돌리기</button><button data-a="reset" ${prog.length ? '' : 'disabled'}>처음부터</button></div>`;
  h += `<div class="palette${vec ? ' vpal' : ''}">${t.asm.ops.map((o) => `<button data-a="aop" data-op="${o}" ${prog.length >= 16 ? 'disabled' : ''}>${o}</button>`).join('')}</div>`;
  h += isVk(t)
    ? `<details class="isa"><summary>Vulkan 호출</summary><dl>${t.asm.ops.map((o) => `<dt>${o} ${VKISA[o].args.join(', ')}</dt><dd>${VKISA[o].desc}</dd>`).join('')}</dl><p class="ttnote">b = 버퍼 b0~b3 · m = 메모리 m0~m3 · d = 디스크립터 세트 d0·d1 · p = 파이프라인 p0·p1 · K = 셰이더 · n = 수 0~15 · N = 수 0~255</p></details><details class="isa"><summary>단순화한 것</summary><p class="ttnote">${VK_NOTE}</p><p class="ttnote">${DRV_NOTE}</p><p class="ttnote">${PM4_NOTE}</p></details>`
    : isDrv(t)
    ? `<details class="isa"><summary>드라이버 함수</summary><dl>${t.asm.ops.map((o) => `<dt>${o} ${DISA[o].args.join(', ')}</dt><dd>${DISA[o].desc}${DISA[o].real ? ` <small>실제: ${DISA[o].real}</small>` : ''}</dd>`).join('')}</dl><p class="ttnote">r = 드라이버 변수 r0~r3(버퍼 손잡이) · n = 수 0~15 · N = 수 0~255(칸을 눌러 직접 넣어도 돼요) · g = 레지스터 이름</p></details><details class="isa"><summary>단순화한 것</summary><p class="ttnote">${DRV_NOTE}</p><p class="ttnote">${PM4_NOTE}</p></details>`
    : vec
    ? `<details class="isa"><summary>명령어 설명</summary><dl>${t.asm.ops.map((o) => `<dt>${o} ${VISA[o].args.join(', ')}</dt><dd>${VISA[o].desc} <small>실제: ${VISA[o].real}</small></dd>`).join('')}</dl><p class="ttnote">v = v0~v3(레인마다) · s = s0~s3(웨이브에 하나) · vs = 둘 중 아무거나 · n = 수 · k = 줄 번호</p></details><details class="isa"><summary>단순화한 것</summary><p class="ttnote">${VEC_NOTE}${isCu(t) ? `</p><p class="ttnote">${CU_NOTE}` : ''}${t.asm.sched ? `</p><p class="ttnote">${SCHED_NOTE}` : ''}</p></details>`
    : `<details class="isa"><summary>명령어 설명</summary><dl>${t.asm.ops.map((o) => `<dt>${o}${ISA[o].arg ? ' ' + ISA[o].arg : ''}</dt><dd>${ISA[o].desc} <small>기계어 ${ISA[o].code.toString(16).toUpperCase()}_</small></dd>`).join('')}</dl></details>`;
  h += `<p class="cost">${prog.length}줄${s.par ? ` · 별 두 개는 ${s.par}줄 이하` : ''}${v.best != null ? ` · 최고 ${v.best}` : ''} · 최대 16줄</p></div>`;

  // 기계
  h += '<div class="mach">';
  if (t.asm.tests.length > 1) h += `<div class="chips">${t.asm.tests.map((_, k) => `<button data-a="atest" data-t="${k}" class="chip${k === cur.tsel ? ' on' : ''}">입력 ${k + 1}</button>`).join('')}</div>`;
  const state = m.halted ? `멈춤 · ${m.steps}걸음` : m.steps >= 2000 ? '안 멈춰요' : m.steps ? `${m.steps}걸음` : '처음';
  if (isVk(t)) {
    const dv = m.drv;
    h += `<div class="regs"><span>${m.halted ? (m.err ? '멈춤(잘못)' : '끝') : m.steps ? `${m.pc}번 줄` : '처음'}</span><span>녹화 <b>${m.rec === 'rec' ? '중' : m.rec === 'done' ? '끝' : '–'}</b></span><span>제출 <b>${dv.submitted}</b></span><span>펜스 <b>${dv.fence}</b></span></div>`;
    const objs = [
      ...Object.entries(m.bufs).map(([i, b]) => `b${i}: ${b.n}칸${b.mem != null ? ` · m${b.mem}+${b.off} · 가상 ${b.va}` : ' · (기억 없음)'}${b.va != null ? ` · [${Array.from({ length: b.n }, (_, k) => bufRead(m, i, k)).join(',')}]` : ''}`),
      ...Object.entries(m.mems).map(([i, mm]) => `m${i}: ${mm.n}칸 · 드라이버 r${mm.r} · 가상 ${mm.va}~${mm.va + mm.n - 1}`),
      ...Object.entries(m.dsets).map(([i, d]) => `d${i}: 가상 ${d.va} · [${[0, 1, 2, 3].map((k) => vaRead(dv, d.va + k)).join(',')}]`),
      ...Object.entries(m.pipes).map(([i, pp]) => `p${i}: ${VKKERNELS[pp.k].name} · 0x${pp.addr.toString(16)}`),
    ];
    h += `<p class="wavehd">물체</p><ul class="vkobj">${objs.map((o) => `<li>${o}</li>`).join('') || '<li class="none">(아직 없음)</li>'}</ul>`;
    h += `<p class="wavehd">아래로 내려간 것</p><ol class="cplog low">${m.low.map((x) => `<li><b>${x.op}</b> → ${x.low.join(' · ') || '–'}</li>`).join('')}${m.err ? `<li class="bad">${m.err}</li>` : ''}${!m.low.length && !m.err ? '<li class="none">「한 줄」을 눌러 보세요</li>' : ''}</ol>`;
    if (dv.ib.length) h += `<p class="wavehd">IB(녹화 중)</p><p class="ttnote mono">${dv.ib.map(hex8).join(' ')}</p>`;
    if (dv.log.some((l) => /DISPATCH|EVENT|ACQUIRE|펜스/.test(l))) h += `<p class="wavehd">GPU(CP)가 한 것</p><ol class="cplog">${dv.log.filter((l) => /DISPATCH|EVENT|ACQUIRE|SET_SH|INDIRECT|펜스/.test(l)).map((l) => `<li>${l}</li>`).join('')}</ol>`;
  } else if (isDrv(t)) {
    h += `<div class="regs"><span>${m.halted ? (m.err ? '멈춤(잘못)' : '끝') : m.steps ? `${m.pc}번 줄` : '처음'}</span><span>제출 <b>${m.submitted}</b></span><span>펜스 <b>${m.fence}</b></span><span>IB <b>${m.ib.length}</b> dword</span></div>`;
    h += `<p class="wavehd">드라이버 변수 · ${m.r.map((hd, k) => `r${k}=${hd ? `버퍼 ${hd}` : '–'}`).join(' ')}</p>`;
    h += '<p class="wavehd">물리 기억(쪽 4칸씩)</p><div class="pages">' + Array.from({ length: PAGES }, (_, p) => {
      const o = m.owner[p], who = o === 'X' ? '다른 앱' : o ? `버퍼 ${o}` : '빈 쪽';
      return `<div class="page${o === 'X' ? ' other' : o ? ' mine' : ''}"><small>쪽 ${p} · ${who}</small><span>${m.mem.slice(p * 4, p * 4 + 4).join(' ')}</span></div>`;
    }).join('') + '</div>';
    const maps = Object.entries(m.pt).sort((x, y) => x[0] - y[0]).map(([vp, pp]) => `가상 ${vp * 4}~${vp * 4 + 3} → 쪽 ${pp}`);
    h += `<p class="wavehd">페이지 표</p><p class="ttnote">${maps.length ? maps.join(' · ') : '(비어 있음)'}</p>`;
    if (m.ib.length) h += `<p class="wavehd">IB(아직 안 낸 것)</p><p class="ttnote mono">${m.ib.map(hex8).join(' ')}</p>`;
    if (m.log.length || m.err) h += `<ol class="cplog">${m.log.map((l) => `<li>${l}</li>`).join('')}${m.err ? `<li class="bad">${m.err}</li>` : ''}</ol>`;
  } else if (isCu(t)) {
    const cst = m.halted ? `끝 · ${m.t}사이클` : m.steps >= 2000 ? "안 멈춰요" : m.t ? `${m.t}사이클` : '처음';
    const A = t.asm, many = m.waves.length > 2, multi = (A.wgs || 1) > 1 || (A.cus || 1) > 1;
    h += `<div class="regs"><span>${cst}</span><span>오는 중 <b>${m.pending.length}</b></span>${A.waves > 1 || multi ? `<span>CU가 논 사이클 <b>${m.idle}</b></span>` : ''}</div>`;
    if (A.vgprs) h += `<p class="wavehd">웨이브당 VGPR <b>${m.used}</b>개 → CU마다 동시에 <b>${m.cap}</b>웨이브 (레인당 ${A.vgprs}칸)</p>`;
    for (const w of m.waves) {
      const st = w.halted ? '끝' : !w.live ? '아직 못 올라옴' : w.wait === 'cnt' ? '읽기 기다림' : w.wait === 'bar' ? '배리어' : m.cur[w.cu] === w.id ? '도는 중' : '쉬는 중';
      const name = multi ? `WG ${w.wg}${A.waves > 1 ? `·웨이브 ${w.w}` : ''} · CU ${w.cu} · ` : m.waves.length > 1 ? `웨이브 ${w.w} · ` : '';
      h += `<p class="wavehd">${name}PC ${w.pc} · ${st} · ${w.s.map((x, k) => `s${k}=${x}`).join(' ')}</p>`;
      if (many) continue; // 웨이브가 많으면 한 줄씩만
      h += '<table class="lanes"><thead><tr><th>id</th><th>EXEC</th><th>VCC</th><th>v1</th><th>v2</th><th>v3</th></tr></thead><tbody>';
      for (let l = 0; l < LANES; l++) {
        const on = (w.exec >> l) & 1;
        h += `<tr class="${on ? '' : 'off'}"><td>${w.v[0][l]}</td><td class="bit${on ? ' on' : ''}">${on}</td><td class="bit${(w.vcc >> l) & 1 ? ' on' : ''}">${(w.vcc >> l) & 1}</td>${w.v.slice(1).map((r) => `<td>${r[l]}</td>`).join('')}</tr>`;
      }
      h += '</tbody></table>';
    }
    const x0 = t.asm.tests[cur.tsel] || {}, init = Array.from({ length: MEMN }, (_, i) => (x0.mem && x0.mem[i]) || 0), wantM = (x0.want || {}).mem || {};
    h += '<p class="wavehd">기억</p><div class="ram">' + m.mem.map((x, k) => `<div class="cell${x !== init[k] ? ' chg' : ''}${init[k] ? ' given' : ''}${k in wantM ? ' goal' : ''}"><small>[${k}]</small>${x}</div>`).join('') + '</div>';
    if (t.asm.ops.some((o) => o.startsWith('DS_'))) h += '<p class="wavehd">LDS</p><div class="ram">' + m.lds[0].map((x, k) => `<div class="cell${x ? ' chg' : ''}"><small>${k}</small>${x}</div>`).join('') + '</div>';
  } else if (vec) {
    h += `<div class="regs"><span>PC <b>${m.pc}</b></span><span>SCC <b>${m.scc}</b></span><span>${state}</span></div>`;
    h += '<table class="lanes"><thead><tr><th>레인</th><th>EXEC</th><th>VCC</th><th>v0</th><th>v1</th><th>v2</th><th>v3</th></tr></thead><tbody>';
    for (let l = 0; l < LANES; l++) {
      const on = (m.exec >> l) & 1;
      h += `<tr class="${on ? '' : 'off'}"><td>${l}</td><td class="bit${on ? ' on' : ''}">${on}</td><td class="bit${(m.vcc >> l) & 1 ? ' on' : ''}">${(m.vcc >> l) & 1}</td>${m.v.map((r) => `<td>${r[l]}</td>`).join('')}</tr>`;
    }
    h += `</tbody></table><div class="sregs">${m.s.map((x, k) => `<span>s${k} <b>${x}</b></span>`).join('')}</div>`;
  } else {
    h += `<div class="regs"><span>PC <b>${m.pc}</b></span><span>A <b>${m.a}</b> <small>${m.a.toString(2).padStart(8, '0')}</small></span><span>${state}</span></div>`;
    h += '<div class="ram">' + m.ram.map((x, k) => `<div class="cell${x !== init[k] ? ' chg' : ''}${init[k] ? ' given' : ''}"><small>[${k}]</small>${x}</div>`).join('') + '</div>';
    h += `<p class="outs">내보낸 것: <b>${m.out.length ? m.out.join(', ') : '–'}</b></p>`;
  }
  h += `<div class="tools"><button data-a="astep" ${m.halted || !prog.length ? 'disabled' : ''}>한 줄</button><button data-a="arun" ${m.halted || !prog.length ? 'disabled' : ''}>끝까지</button><button data-a="areset">처음으로</button></div>`;
  h += '</div>';

  // 시험 표
  h += '<table class="tt asmt"><thead><tr><th>#</th><th>입력</th><th class="want gap">원함</th><th class="gap">지금</th></tr></thead><tbody>';
  t.asm.tests.forEach((x, k) => {
    const r = machRun(t, prog, k), ok = prog.length && machOk(t, x, r);
    let inTxt, wTxt, got;
    if (isVk(t)) {
      const w = x.want || {};
      inTxt = x.data ? Object.entries(x.data).map(([bi, arr]) => `b${bi}=[${arr.join(',')}]`).join(' ') : '기본';
      wTxt = [Object.entries(w.buf || {}).map(([bi, arr]) => `b${bi}=[${arr.join(',')}]`).join(' '), Object.entries(w.desc || {}).map(([di, sl]) => `d${di}=[${sl.map((b) => 'b' + b).join(',')}의 주소]`).join(' '), w.fence != null ? `펜스 ${w.fence}` : ''].filter(Boolean).join(' · ');
      got = r.err ? r.err.slice(0, 40) : [Object.entries(w.buf || {}).map(([bi, arr]) => `b${bi}=[${arr.map((_, k) => bufRead(r, bi, k) ?? '–').join(',')}]`).join(' '), Object.keys(w.desc || {}).map((di) => { const d = r.dsets[di]; return `d${di}=[${d ? [0, 1, 2].map((k) => vaRead(r.drv, d.va + k)).join(',') : '없음'}]`; }).join(' '), w.fence != null ? `펜스 ${r.drv.fence}` : ''].filter(Boolean).join(' · ');
    } else if (isDrv(t)) {
      const w = x.want || {};
      inTxt = x.data ? Object.entries(x.data).map(([ri, arr]) => `r${ri}=[${arr.join(',')}]`).join(' ') : '기본';
      wTxt = [Object.entries(w.va || {}).map(([va, val]) => `가상[${va}]=${val}`).join(' '), Object.entries(w.bo || {}).map(([ri, arr]) => `r${ri}=[${arr.join(',')}]`).join(' '), w.fence != null ? `펜스 ${w.fence}` : ''].filter(Boolean).join(' · ');
      got = r.err ? r.err.slice(0, 40) : [Object.keys(w.va || {}).map((va) => `가상[${va}]=${vaRead(r, +va) ?? '없음'}`).join(' '), Object.entries(w.bo || {}).map(([ri, arr]) => { const b = r.bos[r.r[ri]]; return `r${ri}=[${b ? arr.map((_, i) => r.mem[b.pages[i >> 2] * 4 + (i & 3)]).join(',') : '없음'}]`; }).join(' '), w.fence != null ? `펜스 ${r.fence}` : ''].filter(Boolean).join(' · ');
    } else if (isCu(t)) {
      const w = x.want || {};
      inTxt = [memTxt(x.mem), memTxt(Object.fromEntries(Object.entries(t.asm.s || {}).map(([k, v]) => [`s${k}`, v]))).replace(/\[(s\d)\]/g, '$1')].filter(Boolean).join(' · ') || '–';
      wTxt = memTxt(w.mem) + (x.maxCycles != null ? ` · ${x.maxCycles}사이클 안` : '');
      got = r.err ? '안 멈춰요' : `${memTxt(Object.fromEntries(Object.keys(w.mem || {}).map((j) => [j, r.mem[j]])))} · ${r.t}사이클`;
    } else if (vec) {
      const w = x.want || {};
      inTxt = vRegsTxt({ v: x.v, s: x.s, exec: x.exec });
      wTxt = vRegsTxt(w) + (x.maxSteps != null ? ` · ${x.maxSteps}걸음 이하` : '');
      got = r.err ? '안 멈춰요' : vRegsTxt({ v: Object.fromEntries(Object.keys(w.v || {}).map((j) => [j, r.v[j]])), s: Object.fromEntries(Object.keys(w.s || {}).map((j) => [j, r.s[j]])) }) + (x.maxSteps != null ? ` · ${r.steps}걸음` : '');
    } else {
      inTxt = ramTxt(x.ram || {});
      wTxt = wantTxt(x);
      got = r.err ? '안 멈춰요' : wantTxt({ out: x.out ? r.out : null, mem: x.mem ? Object.fromEntries(Object.keys(x.mem).map((j) => [j, r.ram[j]])) : null });
    }
    h += `<tr data-a="atest" data-t="${k}" class="${k === cur.tsel ? 'cur' : ''}"><td>${k + 1}</td><td>${inTxt}</td><td class="want gap">${wTxt}</td><td class="gap ${prog.length ? (ok ? 'ok' : 'bad') : 'none'}">${prog.length ? got : '–'}</td></tr>`;
  });
  h += '</tbody></table>';
  if (!vec && t.asm.ram) h += `<p class="ttnote">늘 들어 있는 칸: ${ramTxt(t.asm.ram)} · 나머지 빈 칸은 0</p>`;
  if (isVk(t)) h += `<p class="ttnote">한 줄 = Vulkan 호출 하나 · 「한 줄」로 하나씩 내려가는 걸 볼 수 있어요 · 결과는 vkWaitForFences 뒤에만 보여요</p>`;
  else if (isDrv(t)) h += `<p class="ttnote">한 줄 = 드라이버 함수 하나 · GPU 일은 SUBMIT 뒤 WAIT_FENCE(또는 끝)에서 돌아요</p>`;
  else if (isCu(t)) h += `<p class="ttnote">처음엔 v0 = ${(t.asm.wgs || 1) > 1 ? '워크그룹 안 작업 번호' : '작업 번호'}${(t.asm.waves || 1) > 1 ? `(웨이브 ${t.asm.waves}: 0~${t.asm.waves * 4 - 1})` : ''}${t.asm.wgReg != null ? ` · s${t.asm.wgReg} = 워크그룹 번호` : ''}, 적지 않은 칸·레지스터는 0 · 한 줄 = 한 사이클 · 굵은 테두리 칸이 답을 볼 칸</p>`;
  else if (vec) h += `<p class="ttnote">처음엔 v0 = 레인 번호(단순화), 적지 않은 레지스터는 0 · 걸음 수는 끝 줄을 빼고 세요${t.asm.exec != null ? ` · EXEC 레인 ${lanesOf(t.asm.exec)}만 켜짐` : ''}</p>`;
  h += checkHtml();
  app.innerHTML = h;
  hookHints();
}

// ---------- 8부 PM4 ----------
const OPLIST = (t) => t.pm4.ops, REGLIST = (t) => t.pm4.regs;
const NAMEOF = Object.fromEntries(Object.entries(SH_REGS).map(([k, v]) => [v, k]));
function pm4Ok(x, r) {
  if (r.err) return false;
  const w = x.want || {};
  for (const [k, v] of Object.entries(w.mem || {})) if (r.mem[k] !== v) return false;
  for (const [k, v] of Object.entries(w.sh || {})) if (r.sh[SH_REGS[k]] !== v) return false;
  if (w.rptr != null && r.rptr !== w.rptr) return false;
  return true;
}
const runPm4 = (t, k) => pm4Run(t.pm4, cur.prog.map(dwordOf), cur.db, t.pm4.tests[k]);
// 편집기에서 각 dword가 무엇인지(쓴 사람 쪽 뜻)
function dwMeaning(prog) {
  const out = []; let left = 0, op = null, idx = 0;
  for (const d of prog) {
    if (d.k === 'h') { out.push(`헤더 · ${d.op} · 본문 ${d.count + 1}`); left = d.count + 1; op = d.op; idx = 0; continue; }
    const tag = left > 0 ? `${op} ${++idx}` : '본문 밖?';
    left--;
    out.push(d.k === 'r' ? `${tag} · ${d.reg.replace("COMPUTE_", "")}` : `${tag} · ${d.n}`);
  }
  return out;
}
function renderPm4() {
  const s = cur.s, t = cur.sub || s, v = rec(s.id), prog = cur.prog, a = cur.asel, P = t.pm4, N = P.ring || 16, r0 = P.rptr || 0;
  const mean = dwMeaning(prog);
  let h = headHtml();
  h += `<div class="asm"><p class="ttnote">링 ${N} dword · rptr = ${r0}${P.doorbell ? ` · wptr = ${r0}(도어벨 전)` : ''} — 내가 쓰는 dword는 ${r0}번 칸부터 놓여요</p><ol class="prog pm4">`;
  prog.forEach((d, k) => {
    h += `<li data-a="psel" data-line="${k}" class="${k === a ? 'sel' : ''}"><span class="ln">${(r0 + k) % N}</span><span class="hex">${hex8(dwordOf(d))}</span><span class="mean">${mean[k]}</span></li>`;
  });
  h += '</ol>';
  if (!prog.length) h += '<p class="empty">아래 단추로 dword를 쌓아요 — 헤더 · 레지스터 · 값.</p>';
  if (a != null && prog[a]) {
    const d = prog[a];
    h += `<div class="lineedit"><span>${(r0 + a) % N}번 칸</span>`;
    if (d.k === 'h') h += `<span class="argbox"><button data-a="popd">◀</button><b>${d.op}</b><button data-a="popu">▶</button></span><span class="argbox"><button data-a="pcd">−</button><b>count ${d.count}</b><button data-a="pcu">+</button></span>`;
    else if (d.k === 'r') h += `<span class="argbox"><button data-a="pregd">◀</button><b>${d.reg}</b><button data-a="pregu">▶</button></span>`;
    else h += `<span class="argbox"><button data-a="pvd">−</button><input data-a="pvalin" inputmode="text" value="${d.n >= 16 ? '0x' + d.n.toString(16) : d.n}" size="7"><button data-a="pvu">+</button></span>`;
    h += `<button data-a="pup" ${a ? '' : 'disabled'}>↑</button><button data-a="pdown" ${a < prog.length - 1 ? '' : 'disabled'}>↓</button><button data-a="pdel" class="warn">지우기</button></div>`;
  }
  h += `<div class="tools"><button data-a="undo" ${cur.undo.length ? '' : 'disabled'}>되돌리기</button><button data-a="reset" ${prog.length ? '' : 'disabled'}>처음부터</button></div>`;
  const full = prog.length >= N;
  h += `<div class="palette"><button data-a="paddh" ${full ? 'disabled' : ''}>헤더 +</button><button data-a="paddr" ${full ? 'disabled' : ''}>레지스터 +</button><button data-a="paddv" ${full ? 'disabled' : ''}>값 +</button></div>`;
  if (P.doorbell) h += `<div class="lineedit doorbell"><span>도어벨(새 wptr)</span><span class="argbox"><button data-a="pdbd">−</button><b>${cur.db == null ? '–' : cur.db}</b><button data-a="pdbu">+</button></span></div>`;
  h += `<details class="isa"><summary>명령 표</summary><dl>${OPLIST(t).map((o) => `<dt>${o} <small>0x${PM4_OPS[o].code.toString(16).toUpperCase()}</small></dt><dd>${PM4_OPS[o].desc}<br><small>본문: ${PM4_OPS[o].body}</small></dd>`).join('')}</dl></details>`;
  h += `<details class="isa"><summary>레지스터 표</summary><dl>${REGLIST(t).map((r) => `<dt>${r}</dt><dd>주소 0x${SH_REGS[r].toString(16).toUpperCase()} · 자리 0x${regOff(r).toString(16).toUpperCase()}</dd>`).join('')}</dl><p class="ttnote">커널 창고: ${Object.entries(KERNELS).map(([ad, K]) => `0x${(+ad).toString(16).toUpperCase()} ${K.name} — ${K.args}`).join(' · ')}</p></details>`;
  h += `<details class="isa"><summary>단순화한 것</summary><p class="ttnote">${PM4_NOTE}</p></details>`;
  h += `<p class="cost">${prog.length} dword${s.par ? ` · 별 두 개는 ${s.par} dword 이하` : ''}${v.best != null ? ` · 최고 ${v.best}` : ''}</p></div>`;
  // CP가 읽은 것
  h += '<div class="mach">';
  if (P.tests.length > 1) h += `<div class="chips">${P.tests.map((_, k) => `<button data-a="ptest" data-t="${k}" class="chip${k === cur.tsel ? ' on' : ''}">입력 ${k + 1}</button>`).join('')}</div>`;
  const x = P.tests[cur.tsel], r = runPm4(t, cur.tsel);
  h += `<p class="wavehd">CP가 읽은 것 · rptr ${r0} → ${r.err ? '멈춤' : r.rptr}</p><ol class="cplog">${r.log.map((l) => `<li>${l}</li>`).join('')}${r.err ? `<li class="bad">${r.err}</li>` : ''}${!r.log.length && !r.err ? '<li class="none">(읽은 패킷 없음)</li>' : ''}</ol>`;
  const shs = Object.entries(r.sh).filter(([ad]) => NAMEOF[ad]).map(([ad, val]) => `<span>${NAMEOF[ad].replace('COMPUTE_', '')} <b>${val >= 16 ? '0x' + val.toString(16) : val}</b></span>`);
  if (shs.length) h += `<div class="sregs">${shs.join('')}</div>`;
  const wantM = (x.want || {}).mem || {}, init = Array.from({ length: MEMN }, (_, i) => (x.mem && x.mem[i]) || 0);
  if (Object.keys(wantM).length || x.mem) h += '<p class="wavehd">기억</p><div class="ram">' + r.mem.map((y, k) => `<div class="cell${y !== init[k] ? ' chg' : ''}${init[k] ? ' given' : ''}${k in wantM ? ' goal' : ''}"><small>[${k}]</small>${y}</div>`).join('') + '</div>';
  h += '</div>';
  // 시험 표
  h += '<table class="tt asmt"><thead><tr><th>#</th><th>입력</th><th class="want gap">원함</th><th class="gap">지금</th></tr></thead><tbody>';
  P.tests.forEach((y, k) => {
    const rr = runPm4(t, k), ok = prog.length && pm4Ok(y, rr), w = y.want || {};
    const inTxt = [memTxt(y.mem), y.stale ? `캐시 옛값 ${memTxt(y.stale)}` : '', (y.env || []).map((e) => `${e.tick}틱 뒤 CPU가 ${memTxt(e.mem)}`).join(' ')].filter(Boolean).join(' · ') || '–';
    const wTxt = [memTxt(w.mem), Object.entries(w.sh || {}).map(([n, val]) => `${n.replace('COMPUTE_', '')}=${val}`).join(' '), w.rptr != null ? `rptr=${w.rptr}` : ''].filter(Boolean).join(' · ');
    const got = rr.err ? '멈춤' : [memTxt(Object.fromEntries(Object.keys(w.mem || {}).map((j) => [j, rr.mem[j]]))), Object.keys(w.sh || {}).map((n) => `${n.replace('COMPUTE_', '')}=${rr.sh[SH_REGS[n]] ?? '–'}`).join(' '), w.rptr != null ? `rptr=${rr.rptr}` : ''].filter(Boolean).join(' · ');
    h += `<tr data-a="ptest" data-t="${k}" class="${k === cur.tsel ? 'cur' : ''}"><td>${k + 1}</td><td>${inTxt}</td><td class="want gap">${wTxt}</td><td class="gap ${prog.length ? (ok ? 'ok' : 'bad') : 'none'}">${prog.length ? got : '–'}</td></tr>`;
  });
  h += '</tbody></table>';
  h += checkHtml();
  app.innerHTML = h;
  hookHints();
}
// ---------- 9부 레지스터 배정 ----------
const raRun = (t, k) => cuRun(parseVec(raSubst(t.ra.prog, t.ra.temps, cur.prog)), t.ra.asm, t.ra.tests[k]);
function renderRa() {
  const s = cur.s, t = cur.sub || s, R = t.ra, asg = cur.prog;
  const { lines, live } = raLive(R.prog, R.temps);
  const subst = raSubst(R.prog, R.temps, asg).split(';').map((x) => x.trim()).filter(Boolean);
  let h = headHtml();
  h += '<div class="asm"><table class="tt ra"><thead><tr><th>#</th><th>줄</th>' + R.temps.map((x, i) => `<th>${x}<br><small>${asg[i] == null ? '?' : 'v' + asg[i]}</small></th>`).join('') + '</tr></thead><tbody>';
  lines.forEach((l, k) => {
    const shown = l.replace(/\bt(\d+)\b/g, (m0, n) => { const i = R.temps.indexOf('t' + n); return `<b>t${n}</b><small>${asg[i] == null ? '' : '=v' + asg[i]}</small>`; });
    h += `<tr><td class="sn">${k}</td><td class="code">${shown}</td>${R.temps.map((x) => `<td>${live[k].includes(x) ? '●' : ''}</td>`).join('')}</tr>`;
  });
  h += '</tbody></table>';
  h += '<div class="raedit">' + R.temps.map((x, i) => `<div class="rarow"><span>${x} →</span>${R.regs.map((r) => `<button data-a="rasel" data-t="${i}" data-v="${r}" class="chip${asg[i] === r ? ' on' : ''}">v${r}</button>`).join('')}</div>`).join('') + '</div>';
  h += `<div class="tools"><button data-a="undo" ${cur.undo.length ? '' : 'disabled'}>되돌리기</button><button data-a="reset">처음부터</button></div>`;
  h += `<details class="isa"><summary>단순화한 것</summary><p class="ttnote">${RA_NOTE}</p></details></div>`;
  const ready = asg.every((x) => x != null);
  h += '<div class="mach">';
  if (R.tests.length > 1) h += `<div class="chips">${R.tests.map((_, k) => `<button data-a="rtest" data-t="${k}" class="chip${k === cur.tsel ? ' on' : ''}">입력 ${k + 1}</button>`).join('')}</div>`;
  if (ready) {
    const m = raRun(t, cur.tsel), x = R.tests[cur.tsel], wantM = (x.want || {}).mem || {}, init = Array.from({ length: MEMN }, (_, i) => (x.mem && x.mem[i]) || 0);
    h += `<div class="regs"><span>${m.err ? '멈춤' : `끝 · ${m.t}사이클`}</span>${R.asm.vgprs ? `<span>웨이브당 VGPR <b>${m.used}</b>개 → 동시에 <b>${m.cap}</b>웨이브</span>` : ''}</div>`;
    h += '<p class="wavehd">기억</p><div class="ram">' + m.mem.map((y, k) => `<div class="cell${y !== init[k] ? ' chg' : ''}${init[k] ? ' given' : ''}${k in wantM ? ' goal' : ''}"><small>[${k}]</small>${y}</div>`).join('') + '</div>';
  } else h += '<p class="ttnote">t를 다 앉히면 돌려 봐요.</p>';
  h += '</div>';
  h += '<table class="tt asmt"><thead><tr><th>#</th><th>입력</th><th class="want gap">원함</th><th class="gap">지금</th></tr></thead><tbody>';
  R.tests.forEach((x, k) => {
    const w = x.want || {}, r = ready ? raRun(t, k) : null, ok = r && cuOk(x, r);
    const got = !r ? '–' : r.err ? '멈춤' : `${memTxt(Object.fromEntries(Object.keys(w.mem || {}).map((j) => [j, r.mem[j]])))} · ${r.t}사이클`;
    h += `<tr data-a="rtest" data-t="${k}" class="${k === cur.tsel ? 'cur' : ''}"><td>${k + 1}</td><td>${memTxt(x.mem) || '–'}</td><td class="want gap">${memTxt(w.mem)}${x.maxCycles != null ? ` · ${x.maxCycles}사이클 안` : ''}</td><td class="gap ${r ? (ok ? 'ok' : 'bad') : 'none'}">${got}</td></tr>`;
  });
  h += '</tbody></table>';
  h += checkHtml();
  app.innerHTML = h;
  hookHints();
}
function checkRa() {
  const t = cur.sub || cur.s;
  if (cur.prog.some((x) => x == null)) { cur.msg = '아직 안 앉힌 t가 있어요.'; return false; }
  let bad = 0;
  t.ra.tests.forEach((x, k) => { if (!cuOk(x, raRun(t, k))) bad++; });
  if (bad) { cur.msg = `입력 ${t.ra.tests.length}개 중 ${bad}개가 달라요 — 살아 있는 값을 덮어쓴 자리가 있나 봐요.`; return false; }
  return true;
}

function checkPm4() {
  const t = cur.sub || cur.s;
  if (!cur.prog.length) { cur.msg = '아직 dword가 없어요.'; return false; }
  let bad = 0, err = '';
  t.pm4.tests.forEach((x, k) => { const r = runPm4(t, k); if (r.err) err = r.err; if (!pm4Ok(x, r)) bad++; });
  if (bad) { cur.msg = `입력 ${t.pm4.tests.length}개 중 ${bad}개가 달라요.${err ? ' ' + err : ''}`; return false; }
  return true;
}
function pm4Action(a, t) {
  const T = cur.sub || cur.s, prog = cur.prog, k = cur.asel, ops = OPLIST(T), regs = REGLIST(T);
  const cyc = (list, x, d) => list[(list.indexOf(x) + d + list.length) % list.length];
  const add = (d) => { const at = k == null ? prog.length : k + 1; changeProg(() => prog.splice(at, 0, d)); cur.asel = at; };
  if (a === 'paddh') add({ k: 'h', op: ops[0], count: 0 });
  else if (a === 'paddr') add({ k: 'r', reg: regs[0] });
  else if (a === 'paddv') add({ k: 'v', n: 0 });
  else if (a === 'psel') { const j = +t.dataset.line; cur.asel = cur.asel === j ? null : j; }
  else if (a === 'popu' || a === 'popd') changeProg(() => { prog[k].op = cyc(ops, prog[k].op, a === 'popu' ? 1 : -1); });
  else if (a === 'pcu' || a === 'pcd') changeProg(() => { prog[k].count = Math.max(0, Math.min(15, prog[k].count + (a === 'pcu' ? 1 : -1))); });
  else if (a === 'pregu' || a === 'pregd') changeProg(() => { prog[k].reg = cyc(regs, prog[k].reg, a === 'pregu' ? 1 : -1); });
  else if (a === 'pvu' || a === 'pvd') changeProg(() => { prog[k].n = Math.max(0, prog[k].n + (a === 'pvu' ? 1 : -1)); });
  else if (a === 'pup' || a === 'pdown') { const j = a === 'pup' ? k - 1 : k + 1; changeProg(() => { [prog[k], prog[j]] = [prog[j], prog[k]]; }); cur.asel = j; }
  else if (a === 'pdel') { changeProg(() => prog.splice(k, 1)); cur.asel = prog.length ? Math.min(k, prog.length - 1) : null; }
  else if (a === 'pdbu' || a === 'pdbd') { const N = T.pm4.ring || 16; cur.db = ((cur.db ?? (T.pm4.rptr || 0)) + (a === 'pdbu' ? 1 : -1) + N) % N; cur.msg = ''; cur.pass = false; if (!temp(cur.s)) { rec(cur.s.id).db = cur.db; persist(); } }
  else if (a === 'ptest') cur.tsel = +t.dataset.t;
}

function checkAsm() {
  const t = cur.sub || cur.s;
  let bad = 0, loop = false;
  t.asm.tests.forEach((x, k) => { const r = machRun(t, cur.prog, k); if (r.err) loop = true; if (!machOk(t, x, r)) bad++; });
  if (!cur.prog.length) { cur.msg = '아직 줄이 없어요.'; return false; }
  if (bad) { cur.msg = `입력 ${t.asm.tests.length}개 중 ${bad}개가 달라요.${loop ? ' HLT까지 못 가고 계속 도는 것도 있어요.' : ''}`; return false; }
  return true;
}

function asmAction(a, t) {
  const prog = cur.prog, k = cur.asel;
  if (a === 'aop') {
    const at = k == null ? prog.length : k + 1;
    const vec = isVec(cur.sub || cur.s);
    changeProg(() => prog.splice(at, 0, vec ? { op: t.dataset.op, a: isaOf(cur.sub || cur.s)[t.dataset.op].args.map(() => 0) } : { op: t.dataset.op, n: 0 }));
    cur.asel = at;
  } else if (a === 'asel') {
    const j = +t.dataset.line;
    cur.asel = cur.asel === j ? null : j;
  } else if (a === 'ainc' || a === 'adec') {
    if (isVec(cur.sub || cur.s)) {
      const i = +t.dataset.i, R = VRANGE[isaOf(cur.sub || cur.s)[prog[k].op].args[i]];
      changeProg(() => { prog[k].a[i] = (prog[k].a[i] + (a === 'ainc' ? 1 : R - 1)) % R; });
    } else changeProg(() => { prog[k].n = (prog[k].n + (a === 'ainc' ? 1 : 15)) % 16; });
  } else if (a === 'aup' || a === 'adown') {
    const j = a === 'aup' ? k - 1 : k + 1;
    changeProg(() => { [prog[k], prog[j]] = [prog[j], prog[k]]; });
    cur.asel = j;
  } else if (a === 'adel') {
    changeProg(() => prog.splice(k, 1));
    cur.asel = prog.length ? Math.min(k, prog.length - 1) : null;
  } else if (a === 'atest') {
    cur.tsel = +t.dataset.t;
    cur.m = machInit(cur.sub || cur.s, cur.tsel);
  } else if (a === 'astep') {
    machStep(cur.sub || cur.s, prog, cur.m);
  } else if (a === 'arun') {
    while (!cur.m.halted && cur.m.steps < 2000) machStep(cur.sub || cur.s, prog, cur.m);
  } else if (a === 'areset') {
    cur.m = machInit(cur.sub || cur.s, cur.tsel);
  }
}

// ---------- 힌트 ----------
// 한 단계씩 연다. 글 힌트를 다 열면 「정답 가까이 놓기」.
function hintBox(s) {
  const hs = s.hints || [];
  if (!hs.length) return '';
  const shown = hs.slice(0, cur.hintStep);
  let h = `<details class="hints" ${cur.hintOpen ? 'open' : ''}><summary>힌트 ${cur.nearMsg ? hs.length + 1 : cur.hintStep} / ${hs.length + 1}</summary>`;
  h += shown.map((t, k) => `<p><span class="hn">${k + 1}</span>${t}</p>`).join('');
  if (cur.hintStep < hs.length) h += `<button data-a="hintnext">다음 힌트</button>`;
  else if (cur.nearMsg) h += `<p class="nearmsg">${cur.nearMsg}</p><button data-a="near">다시 놓기</button>`;
  else h += `<button data-a="near">${hs.length + 1}. 정답 가까이 놓기</button><small class="nearnote">지금 판을 바꿔요 — 되돌리기로 돌아올 수 있어요</small>`;
  return h + '</details>';
}

// sol 글('x=NAND(A,B); @0=x', 'h.1' = h의 둘째 출력)을 판으로. 부품은 깊이(입력에서 몇 번째)대로 왼쪽→오른쪽 열에 놓는다.
// 출력 선은 늘 비우고, keepLast가 false면 마지막 부품으로 들어가는 선도 비워 둔다.
function solCircuit(sol, insNames, keepLast) {
  const ids = {}, depth = {}, parts = [], wires = {}, outs = [];
  insNames.forEach((n, i) => { ids[n] = 'in:' + i; });
  const sts = sol.split(';').map((x) => x.trim()).filter(Boolean);
  let np = 0; // 고리(뒤에 나오는 이름 쓰기)를 위해 이름 → 부품 번호를 먼저 정한다
  for (const st of sts) { const m = st.match(/^([^=@]+)=[A-Z]+\(/); if (m) ids[m[1]] = 'p' + ++np; }
  for (const st of sts) {
    let m = st.match(/^@(\d+)=(.+)$/);
    if (m) { outs.push(['out:' + m[1], m[2]]); continue; }
    m = st.match(/^([^=]+)=([A-Z]+)\(([^)]*)\)$/);
    const [, name, type, args] = m;
    const id = ids[name];
    const srcs = args.split(',').map((a) => a.trim().split('.')); // 'h.1' = h의 둘째 출력
    depth[name] = Math.max(0, ...srcs.map(([a]) => (a in depth ? depth[a] + 1 : 0)));
    srcs.forEach(([a, k = '0'], j) => { wires[id + ':' + j] = ids[a].startsWith('in:') ? ids[a] : ids[a] + ':' + k; });
    parts.push({ id, type, d: depth[name] });
  }
  // 깊이 0·1·2는 세 열, 더 깊으면 아래 띠로 내려가 다시 왼쪽부터(긴 판이 오른쪽 한 열에 쌓이지 않게)
  const used = new Set();
  let band = -1, top = 0;
  for (const p of [...parts].sort((x, y) => Math.floor(x.d / 3) - Math.floor(y.d / 3))) {
    if (Math.floor(p.d / 3) !== band) { band = Math.floor(p.d / 3); top = used.size ? Math.max(...[...used].map((k) => Math.floor(k / 3))) + 1 : 0; }
    let col = p.d % 3, row = top;
    while (used.has(row * 3 + col)) row++;
    p.slot = row * 3 + col;
    used.add(p.slot);
  }
  parts.forEach((p) => delete p.d);
  let cut = outs.length; // 출력 선은 늘 비운다
  if (!keepLast) {
    const last = parts[parts.length - 1].id;
    for (const k of Object.keys(wires)) if (k.startsWith(last + ':')) { delete wires[k]; cut++; }
  }
  return { circ: { parts, wires }, cut };
}

// 무작위 표: 1인 줄 하나의 「이 줄일 때만 1」 회로(0인 자리는 NOT, 전부 AND)를 놓아 준다.
function nearRandom(spec) {
  const n = spec.ins.length, r = cur.table.indexOf(1), bits = bitsOf(r, n);
  const st = [], lits = [];
  spec.ins.forEach((x, i) => { if (bits[i]) lits.push(x); else { st.push(`n${i}=NOT(${x})`); lits.push('n' + i); } });
  let acc = lits[0];
  for (let k = 1; k < lits.length; k++) { st.push(`a${k}=AND(${acc},${lits[k]})`); acc = 'a' + k; }
  st.push('@0=' + acc);
  const row = spec.ins.map((x, i) => `${x}=${bits[i]}`).join(', ');
  return { ...solCircuit(st.join('; '), spec.ins, true), row };
}

function near() {
  const s = cur.s, spec = specOf(), t = cur.sub || s;
  if (t.ra) {
    const sol = t.sol.split(' ').map((x) => +x.slice(1)), keep = Math.max(1, sol.length - Math.ceil(sol.length / 3));
    changeProg(() => { sol.forEach((r, i) => { cur.prog[i] = i < keep ? r : null; }); });
    cur.nearMsg = `앞 t ${keep}개를 앉혔어요 — 나머지 ${sol.length - keep}개를 골라요.`;
    return;
  }
  if (t.pm4) {
    const sol = parsePm4(t.sol).dw, keep = Math.max(1, sol.length - Math.ceil(sol.length / 3));
    changeProg(() => { cur.prog.splice(0, cur.prog.length, ...sol.slice(0, keep)); });
    cur.asel = null;
    cur.nearMsg = `앞 ${keep} dword를 놓았어요 — 나머지 ${sol.length - keep} dword를 이어 써요${t.pm4.doorbell ? '(도어벨도)' : ''}.`;
    return;
  }
  if (t.asm) {
    const sol = parseSol(t), keep = Math.max(1, sol.length - Math.ceil(sol.length / 3));
    changeProg(() => { cur.prog.splice(0, cur.prog.length, ...sol.slice(0, keep)); });
    cur.asel = null;
    cur.nearMsg = `앞 ${keep}줄을 놓았어요 — 나머지 ${sol.length - keep}줄을 이어 써요.`;
    return;
  }
  if (s.random) {
    const { circ, row } = nearRandom(spec);
    change((c) => { c.parts = circ.parts; c.wires = circ.wires; });
    cur.nearMsg = `「${row}」 줄 하나를 놓았어요 — 출력에 이으면 그 줄만 맞아요. 1인 다른 줄도 같은 모양으로 만들어 OR로 모아요.`;
  } else {
    const { circ, cut } = solCircuit((cur.sub || s).sol, spec.ins, false);
    change((c) => { c.parts = circ.parts; c.wires = circ.wires; });
    cur.nearMsg = `부품을 다 놓았어요 — 남은 선 ${cut}개만 이으면 돼요.`;
  }
  cur.sel = null;
}

function checkSeq(spec) {
  const evs = runSteps(cur.circ, spec);
  let bad = 0;
  evs.forEach((e, r) => { if (spec.want[r].some((v, k) => v != null && e.outs[k] !== v)) bad++; });
  if (bad) {
    const osc = evs.some((e) => e.osc);
    cur.msg = cur.circ.wires['out:0'] == null ? '출력에 선이 아직 없어요.' : `${evs.length}줄 중 ${bad}줄이 달라요.${osc ? ' 값이 멈추지 않는 줄도 있어요.' : ''}`;
    return false;
  }
  return true;
}

function check() {
  const spec = specOf(), n = spec.ins.length;
  if (spec.ra) { if (!checkRa()) return; return passed(); }
  if (spec.pm4) { if (!checkPm4()) return; return passed(); }
  if (spec.asm) { if (!checkAsm()) return; return passed(); }
  if (spec.seq) { if (!checkSeq(spec)) return; return passed(); }
  let bad = 0, cyc = false;
  for (let r = 0; r < 1 << n; r++) {
    const vals = bitsOf(r, n);
    const ev = evaluate(cur.circ, vals, spec.outs.length);
    const want = spec.expect(vals);
    if (ev.outs.some((x, k) => x !== want[k])) bad++;
    if (ev.cycle) cyc = true;
  }
  if (bad) {
    cur.msg = cur.circ.wires['out:0'] == null ? '출력에 선이 아직 없어요.' : `${1 << n}줄 중 ${bad}줄이 표와 달라요.${cyc ? ' 고리도 있어요.' : ''}`;
    return;
  }
  passed();
}

function passed() {
  const s = cur.s, T = cur.sub || s, asm = !!(T.asm || T.pm4), cost = asm ? cur.prog.length : costOf(cur.circ);
  cur.pass = true;
  cur.share = null;
  cur.sel = null;
  if (s.rounds) {
    cur.round++;
    if (cur.round < s.rounds) { cur.msg = `맞았어요 · ${cur.round} / ${s.rounds}`; return; }
  }
  const v = rec(s.id);
  const first = !v.solved;
  v.solved = true;
  v.count++;
  if (s.par && (v.best == null || cost < v.best)) v.best = cost;
  persist();
  let m = s.rounds ? `${s.rounds}번 연달아 맞았어요!` : '맞았어요!';
  const pm = !!(cur.sub || s).pm4, unit = pm ? ' dword' : asm ? '줄' : '개', what = pm ? `${cost} dword` : asm ? `${cost}줄` : `NAND ${cost}개 몫`;
  if (s.par) m += cost <= s.par ? ` ${what} — 별 두 개.` : ` ${what}. ${s.par}${unit} 이하면 별 하나 더.`;
  if (first && s.unlock) m += ` 이제부터 <b>${s.unlock}</b>를 상자 하나로 써요.`;
  cur.msg = m;
  cur.share = shareText(s, v);
}

// 기록 남기기 — 폰 공유창을 열어 문장만 채운다. 보내는 곳(메모 봇)은 누르는 사람이 고른다.
function shareText(s, v) {
  const book = STAGES.filter((x) => x.book === s.book);
  const done = book.filter((x) => (save[x.id] || {}).solved).length;
  const got = book.reduce((t, x) => t + starsOf(x), 0), all = book.reduce((t, x) => t + maxStars(x), 0);
  const bk = BOOKS.find((x) => x.no === s.book);
  if (done === book.length && s === book[book.length - 1]) return `NAND 게임 ${s.book}부(${bk.name}) 클리어! 별 ${got}/${all}`;
  return `NAND 게임 ${s.id} ${s.title} ${starStr(s)}${v.count > 1 ? ` (${v.count}번째)` : ''} · ${s.book}부 ${done}/${book.length}`;
}

async function share(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = location.origin + location.pathname;
  window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function tap(e) { tapTarget(e.target.closest('[data-k],[data-a],[data-add],[data-row],[data-step]')); }

function tapTarget(t) {
  if (!t) return;
  if (t.dataset.add) {
    const used = new Set(cur.circ.parts.map((p) => p.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const num = cur.circ.parts.reduce((m, p) => Math.max(m, +p.id.slice(1)), 0) + 1;
    change((c) => c.parts.push({ id: 'p' + num, type: t.dataset.add, slot }));
    cur.sel = null;
    return renderStage();
  }
  if (t.dataset.step != null) {
    const r = +t.dataset.step;
    cur.inVals = specOf().steps[r].slice();
    cur.stepAt = r;
    return renderStage();
  }
  if (t.dataset.row != null) {
    cur.inVals = bitsOf(+t.dataset.row, cur.inVals.length);
    return renderStage();
  }
  const a = t.dataset.a;
  if (a) {
    if (['aop', 'asel', 'ainc', 'adec', 'aup', 'adown', 'adel', 'atest', 'astep', 'arun', 'areset'].includes(a)) {
      asmAction(a, t);
    } else if (a.startsWith('p') && a !== 'power' && (cur.sub || cur.s).pm4) {
      pm4Action(a, t);
    } else if (a === 'rasel' || a === 'rtest') {
      if (a === 'rtest') cur.tsel = +t.dataset.t;
      else { const i = +t.dataset.t, r = +t.dataset.v; changeProg(() => { cur.prog[i] = cur.prog[i] === r ? null : r; }); }
    } else if (a === 'undo' && cur.undo.length && cur.prog && ((cur.sub || cur.s).asm || (cur.sub || cur.s).pm4 || (cur.sub || cur.s).ra)) {
      cur.prog = JSON.parse(cur.undo.pop());
      if (!temp(cur.s)) { rec(cur.s.id).prog = cur.prog; persist(); }
      cur.asel = null; cur.msg = ''; cur.pass = false;
      if (!(cur.sub || cur.s).pm4 && !(cur.sub || cur.s).ra) cur.m = machInit(cur.sub || cur.s, cur.tsel);
    } else if (a === 'reset' && (cur.sub || cur.s).ra) {
      changeProg(() => { cur.prog.fill(null); });
    } else if (a === 'reset' && ((cur.sub || cur.s).asm || (cur.sub || cur.s).pm4)) {
      changeProg(() => cur.prog.splice(0));
      cur.asel = null;
    } else if (a === 'undo' && cur.undo.length) {
      cur.circ = JSON.parse(cur.undo.pop());
      if (!temp(cur.s)) { rec(cur.s.id).circ = cur.circ; persist(); }
      cur.sel = null; cur.msg = ''; cur.pass = false;
    } else if (a === 'del' && cur.sel && cur.sel.t === 'part') {
      const id = cur.sel.id;
      change((c) => {
        c.parts = c.parts.filter((p) => p.id !== id);
        for (const k of Object.keys(c.wires)) if (k.startsWith(id + ':') || c.wires[k].startsWith(id + ':')) delete c.wires[k];
      });
      cur.sel = null;
    } else if (a === 'cut' && cur.sel) {
      const key = cur.sel.key;
      change((c) => { delete c.wires[key]; });
      cur.sel = null;
    } else if (a === 'reset') {
      change((c) => { c.parts = []; c.wires = {}; });
      cur.sel = null;
    } else if (a === 'share') {
      share(cur.share);
      return;
    } else if (a === 'power') {
      cur.live = {}; cur.stepAt = null;
      cur.inVals = cur.inVals.map(() => 0);
    } else if (a === 'ttall') {
      cur.ttAll = !cur.ttAll;
    } else if (a === 'hintnext') {
      cur.hintStep++; cur.hintOpen = true;
    } else if (a === 'near') {
      near();
    } else if (a === 'check') {
      check();
    } else if (a === 'round') {
      if (cur.s.random) cur.table = randomTable(cur.s.random);
      if (cur.s.pool) { cur.sub = pickPool(cur.s, cur.sub); cur.hintStep = 1; cur.ttAll = false; }
      cur.live = {}; cur.stepAt = null;
      cur.circ = { parts: [], wires: {} };
      cur.undo = []; cur.pass = false; cur.msg = ''; cur.nearMsg = '';
      setupTask();
      window.scrollTo(0, 0);
    }
    return renderStage();
  }
  const k = t.dataset.k, sel = cur.sel;
  if (k === 'bg') cur.sel = null;
  else if (k === 'inbtn') { const i = +t.dataset.i; cur.inVals[i] ^= 1; cur.stepAt = null; }
  else if (k === 'src' || k === 'sink') {
    const key = t.dataset.key;
    const other = k === 'src' ? 'sink' : 'src';
    if (sel && sel.t === other) {
      const sink = k === 'sink' ? key : sel.key, src = k === 'src' ? key : sel.key;
      change((c) => { c.wires[sink] = src; });
      cur.sel = null;
    } else if (sel && sel.t === k && sel.key === key) cur.sel = null;
    else cur.sel = { t: k, key };
  } else if (k === 'part') {
    const id = t.dataset.id;
    cur.sel = sel && sel.t === 'part' && sel.id === id ? null : { t: 'part', id };
  } else if (k === 'slot' && sel && sel.t === 'part') {
    const slot = +t.dataset.slot, id = sel.id;
    change((c) => { c.parts.find((p) => p.id === id).slot = slot; });
    cur.sel = null;
  }
  renderStage();
}

// ---------- 목록 ----------
function renderList() {
  const firstOpen = STAGES.findIndex((s, i) => unlocked(i) && !(save[s.id] || {}).solved);
  const solved = STAGES.filter((s) => (save[s.id] || {}).solved).length;
  const pct = Math.round((solved / STAGES.length) * 100);
  const emblem = `<svg class="emblem" viewBox="0 0 120 64" aria-hidden="true"><path d="M4 20H34M4 44H34M92 32H116" class="ew"/><path d="M30 8H58A24 24 0 0 1 58 56H30Z" class="eb"/><circle cx="88" cy="32" r="5" class="eb"/><circle cx="4" cy="20" r="3.5" class="ep"/><circle cx="4" cy="44" r="3.5" class="ep"/><circle cx="116" cy="32" r="3.5" class="ep"/></svg>`;
  let h = `<header class="hero">${emblem}<h1>NAND 게임</h1><p>NAND 게이트 하나에서 시작해 GPU까지. 만든 부품은 다음 단계에서 상자 하나가 되고, 같은 개념을 여러 번 다르게 풀며 손에 익혀요.</p>
  <div class="meter"><div class="mrow"><b>${solved}</b><span>/ ${STAGES.length} 풂</span><span class="mpct">${pct}%</span></div><div class="mbar"><i style="width:${pct}%"></i></div>
  ${firstOpen >= 0 ? `<a class="btn primary go" href="#s/${STAGES[firstOpen].id}">이어서 ${STAGES[firstOpen].id} ${STAGES[firstOpen].title} →</a>` : ''}</div></header>`;
  for (const bk of BOOKS) {
    const list = STAGES.filter((s) => s.book === bk.no);
    const done = list.filter((s) => (save[s.id] || {}).solved).length;
    const full = list.length && done === list.length;
    h += `<section class="book${list.length ? '' : ' soon'}${full ? ' full' : ''}"><div class="bhead"><span class="bno">${bk.no}</span><div class="btxt"><h2>${bk.name}</h2><p class="bdesc">${bk.desc}</p></div>${list.length ? `<span class="bcount">${done}/${list.length}</span>` : ''}</div>`;
    if (list.length) h += `<div class="bbar"><i style="width:${(done / list.length) * 100}%"></i></div>`;
    if (!list.length) { h += '<p class="soonp">준비 중</p></section>'; continue; }
    h += '<ol class="stages">';
    for (const s of list) {
      const i = idxOf(s.id), open = unlocked(i), v = save[s.id] || {};
      const inner = `<span class="snum">${s.id}</span><span class="stitle">${s.title}</span><span class="kind k-${s.kind}">${s.kind}</span><span class="sstar">${open ? starStr(s) : '🔒'}</span>${v.count ? `<span class="count">${v.count}</span>` : ''}`;
      h += `<li class="${i === firstOpen ? 'nextup' : ''}${v.solved ? ' done' : ''}">${open ? `<a href="#s/${s.id}">${inner}</a>` : `<span class="locked">${inner}</span>`}</li>`;
    }
    h += '</ol></section>';
  }
  h += `<p class="unlock"><button data-a="unlock">${ALL ? '차례대로 열기로 돌아가기' : '모든 스테이지 열기(시험용)'}</button></p>`;
  h += `<footer class="foot">진행은 이 기기 브라우저에만 저장돼요. 5부(GPU)부터는 공개 자료(AMD ISA 문서·Mesa radv·amdgpu·Khronos 사양)로 확인한 것만 사실로 쓰고, 단순화는 그렇다고 적어요. AI(Claude)가 만들었어요.</footer>`;
  app.innerHTML = h;
}

// ---------- 길 ----------
function route() {
  const m = location.hash.match(/^#s\/(.+)$/);
  if (m) {
    const i = idxOf(decodeURIComponent(m[1]));
    if (i >= 0 && unlocked(i)) return openStage(i);
  }
  cur = null;
  renderList();
  window.scrollTo(0, 0);
}

// ---------- 끌기 ----------
// 판 위(점·부품·빈 곳)는 포인터로 처리한다. 거의 안 움직이고 떼면 탭, 움직이면 끌기.
// 점에서 끌면 선이 따라오고, 놓은 곳 가까운 반대편 점에 붙는다. 선이 있는 받는 점을 끌어 빈 곳에 놓으면 끊긴다.
// 부품을 끌면 그 칸으로 옮기고, 다른 부품이 있으면 자리를 바꾼다.
let drag = null;
const NS = 'http://www.w3.org/2000/svg';
const toSvg = (svg, e) => { const m = svg.getScreenCTM().inverse(); return [e.clientX * m.a + e.clientY * m.c + m.e, e.clientX * m.b + e.clientY * m.d + m.f]; };
function nearestPort(t, x, y, max) {
  let best = null, bd = max * max;
  for (const p of cur.ports) {
    if (p.t !== t) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const slotAt = (x, y) => {
  let col = 0;
  COLX.forEach((cx, i) => { if (Math.abs(cx - x) < Math.abs(COLX[col] - x)) col = i; });
  if (y < 8) return null;
  let row = cur.rowY.findIndex((ry, r) => y < ry + cur.rowH[r]);
  if (row < 0) row = cur.rows; // 맨 아래 줄 밑 = 새 줄
  return row * 3 + col;
};

app.addEventListener('pointerdown', (e) => {
  if (!cur || drag) return;
  const svg = e.target.closest('svg.board-svg');
  if (!svg) return;
  const t = e.target.closest('[data-k]');
  if (!t) return;
  drag = { t, svg, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
  const k = t.dataset.k;
  if (k === 'src' || k === 'sink') {
    drag.port = cur.ports.find((p) => p.t === k && p.key === t.dataset.key);
  } else if (k === 'part') {
    drag.part = t.dataset.id;
    drag.els = [t, ...svg.querySelectorAll(`[data-owner="${t.dataset.id}"]`)];
  }
});

app.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
  if (!drag.port && !drag.part) return; // 빈 곳·입력 단추는 끌지 않는다(화면 넘기기)
  drag.moved = true;
  const [x, y] = toSvg(drag.svg, e);
  if (drag.port) {
    if (!drag.line) {
      drag.line = document.createElementNS(NS, 'path');
      drag.line.setAttribute('class', 'wire dragline');
      drag.svg.appendChild(drag.line);
      drag.mark = document.createElementNS(NS, 'circle');
      drag.mark.setAttribute('r', '12');
      drag.mark.setAttribute('class', 'dragmark');
      drag.svg.appendChild(drag.mark);
    }
    const want = drag.port.t === 'src' ? 'sink' : 'src';
    const hit = nearestPort(want, x, y, 30);
    const [ex, ey] = hit ? [hit.x, hit.y] : [x, y];
    const [a, z] = drag.port.t === 'src' ? [[drag.port.x, drag.port.y], [ex, ey]] : [[ex, ey], [drag.port.x, drag.port.y]];
    const dx = Math.max(24, Math.abs(z[0] - a[0]) / 2);
    drag.line.setAttribute('d', `M${a[0]} ${a[1]} C${a[0] + dx} ${a[1]} ${z[0] - dx} ${z[1]} ${z[0]} ${z[1]}`);
    drag.mark.setAttribute('cx', ex); drag.mark.setAttribute('cy', ey);
    drag.mark.style.display = hit ? '' : 'none';
    drag.hit = hit;
  } else {
    const [x0, y0] = toSvg(drag.svg, { clientX: drag.x0, clientY: drag.y0 });
    for (const el of drag.els) el.setAttribute('transform', `translate(${x - x0} ${y - y0})`);
    drag.slot = slotAt(x, y);
  }
});

function endDrag(e, cancel) {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (cancel) return renderStage();
  if (!d.moved) { tapTarget(d.t); return; }
  if (d.port) {
    if (d.hit) {
      const sink = d.port.t === 'sink' ? d.port.key : d.hit.key, src = d.port.t === 'src' ? d.port.key : d.hit.key;
      change((c) => { c.wires[sink] = src; });
    } else if (d.port.t === 'sink' && cur.circ.wires[d.port.key]) {
      const key = d.port.key;
      change((c) => { delete c.wires[key]; });
    }
  } else if (d.part && d.slot != null) {
    const me = cur.circ.parts.find((p) => p.id === d.part);
    if (me.slot !== d.slot) {
      change((c) => {
        const a = c.parts.find((p) => p.id === d.part), other = c.parts.find((p) => p.slot === d.slot);
        if (other) other.slot = a.slot;
        a.slot = d.slot;
      });
    }
  }
  cur.sel = null;
  renderStage();
}
app.addEventListener('pointerup', (e) => endDrag(e, false));
app.addEventListener('pointercancel', (e) => endDrag(e, true));
// iOS는 SVG 안 touch-action을 안 따를 때가 있어, 점·부품을 끄는 동안만 화면 넘김을 막는다
app.addEventListener('touchmove', (e) => { if (drag && (drag.port || drag.part)) e.preventDefault(); }, { passive: false });

app.addEventListener('click', (e) => {
  const u = e.target.closest('[data-a="unlock"]');
  if (u && !cur) { ALL = !ALL; try { localStorage.setItem(ALLKEY, ALL ? '1' : '0'); } catch (er) { /* 없어도 됨 */ } return renderList(); }
  if (e.target.tagName === 'INPUT') return; // 직접 넣기 칸은 change에서
  if (cur && !e.target.closest('svg.board-svg')) tap(e);
});
// 8부 값 dword 직접 넣기
app.addEventListener('change', (e) => {
  const t = e.target;
  if (cur && t.dataset.a === 'vnin' && cur.asel != null) {
    const v = Math.max(0, Math.min(255, parseInt(t.value, 10) || 0)), i = +t.dataset.i;
    changeProg(() => { cur.prog[cur.asel].a[i] = v; });
    return renderStage();
  }
  if (!cur || t.dataset.a !== 'pvalin') return;
  const v = /^0x[0-9a-f]+$/i.test(t.value.trim()) ? parseInt(t.value.trim(), 16) : parseInt(t.value.trim(), 10);
  if (Number.isNaN(v) || cur.asel == null) return renderStage();
  changeProg(() => { cur.prog[cur.asel].n = v >>> 0; });
  renderStage();
});
window.addEventListener('hashchange', route);
route();
