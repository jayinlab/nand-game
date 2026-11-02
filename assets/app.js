import { BOOKS, PARTS, STAGES } from './stages.js';

const app = document.getElementById('app');
const SAVE = 'nand-game:v1';
const ALL = new URLSearchParams(location.search).has('all'); // 확인용: 잠금 없이 전부

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
    const r = ins.some((v) => v == null) ? null : def.fn(ins).map((v) => (v ? 1 : 0));
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
  return { ins: s.ins, outs: s.outs, expect: (vals) => s.fn(vals).map((v) => (v ? 1 : 0)) };
}

function openStage(i) {
  const s = STAGES[i];
  const v = rec(s.id);
  cur = {
    i, s, sel: null, undo: [], msg: '', pass: false, round: 0, hintOpen: false,
    circ: !s.random && v.circ ? JSON.parse(JSON.stringify(v.circ)) : { parts: [], wires: {} },
    table: s.random ? randomTable(s.random) : null,
  };
  cur.inVals = specOf().ins.map(() => 0);
  renderStage();
  window.scrollTo(0, 0);
}

function change(fn) {
  cur.undo.push(JSON.stringify(cur.circ));
  if (cur.undo.length > 60) cur.undo.shift();
  fn(cur.circ);
  cur.msg = '';
  cur.pass = false;
  if (!cur.s.random) { rec(cur.s.id).circ = cur.circ; persist(); }
}

// ---------- 판 그리기 ----------
const W = 360, ROWH = 92, COLX = [104, 181, 258], BW = 44, PS = 24;
const IN_PORT = 58, OUT_PORT = 302;

function geometry(spec) {
  const maxSlot = cur.circ.parts.reduce((m, p) => Math.max(m, p.slot), -1);
  const rows = Math.max(3, Math.floor(maxSlot / 3) + 2);
  const H = Math.max(rows * ROWH, spec.ins.length * 56, spec.outs.length * 56) + 16;
  const pos = {};
  spec.ins.forEach((_, i) => { pos['in:' + i] = [IN_PORT, (H * (i + 1)) / (spec.ins.length + 1)]; });
  spec.outs.forEach((_, i) => { pos['out:' + i] = [OUT_PORT, (H * (i + 1)) / (spec.outs.length + 1)]; });
  const box = {};
  cur.circ.parts.forEach((p) => {
    const def = PARTS[p.type];
    const cx = COLX[p.slot % 3];
    const cy = 8 + ROWH * Math.floor(p.slot / 3) + ROWH / 2;
    const h = Math.max(def.ins.length, def.outs.length) * PS + 8;
    box[p.id] = { cx, cy, h };
    def.ins.forEach((_, k) => { pos[p.id + ':' + k + ':i'] = [cx - BW / 2, cy - ((def.ins.length - 1) * PS) / 2 + k * PS]; });
    def.outs.forEach((_, k) => { pos[p.id + ':' + k + ':o'] = [cx + BW / 2, cy - ((def.outs.length - 1) * PS) / 2 + k * PS]; });
  });
  const srcPos = (key) => (key.startsWith('in:') ? pos[key] : pos[key + ':o']);
  const sinkPos = (key) => (key.startsWith('out:') ? pos[key] : pos[key + ':i']);
  return { rows, H, box, srcPos, sinkPos };
}

const cls = (v) => (v == null ? 'x' : v ? 'on' : 'off');

function boardSvg(spec, ev) {
  const g = geometry(spec);
  const sel = cur.sel;
  let s = `<svg viewBox="0 0 ${W} ${g.H}" class="board-svg" role="img" aria-label="회로판">`;
  s += `<rect x="0" y="0" width="${W}" height="${g.H}" class="bg" data-k="bg"/>`;

  if (sel && sel.t === 'part') {
    const used = new Set(cur.circ.parts.map((p) => p.slot));
    for (let k = 0; k < g.rows * 3; k++) {
      if (used.has(k)) continue;
      const cx = COLX[k % 3], cy = 8 + ROWH * Math.floor(k / 3) + ROWH / 2;
      s += `<rect x="${cx - 34}" y="${cy - 38}" width="68" height="76" rx="8" class="slot" data-k="slot" data-slot="${k}"/>`;
    }
  }

  for (const [sink, src] of Object.entries(cur.circ.wires)) {
    const a = g.srcPos(src), z = g.sinkPos(sink);
    if (!a || !z) continue;
    const dx = Math.max(24, Math.abs(z[0] - a[0]) / 2);
    s += `<path d="M${a[0]} ${a[1]} C${a[0] + dx} ${a[1]} ${z[0] - dx} ${z[1]} ${z[0]} ${z[1]}" class="wire ${cls(ev.src(src))}"/>`;
  }

  for (const p of cur.circ.parts) {
    const def = PARTS[p.type], b = g.box[p.id];
    const on = sel && sel.t === 'part' && sel.id === p.id;
    s += `<g data-k="part" data-id="${p.id}"><rect x="${b.cx - BW / 2}" y="${b.cy - b.h / 2}" width="${BW}" height="${b.h}" rx="6" class="part${on ? ' sel' : ''}"/>`;
    s += `<text x="${b.cx}" y="${b.cy + 4}" class="plabel">${p.type}</text>`;
    def.ins.forEach((l, k) => { if (l) { const q = g.sinkPos(p.id + ':' + k); s += `<text x="${q[0] + 5}" y="${q[1] + 3}" class="pin">${l}</text>`; } });
    def.outs.forEach((l, k) => { if (l) { const q = g.srcPos(p.id + ':' + k); s += `<text x="${q[0] - 5}" y="${q[1] + 3}" class="pin r">${l}</text>`; } });
    s += `</g>`;
  }

  spec.ins.forEach((name, i) => {
    const [x, y] = g.srcPos('in:' + i), v = cur.inVals[i];
    s += `<g data-k="inbtn" data-i="${i}"><rect x="4" y="${y - 18}" width="46" height="36" rx="8" class="io ${v ? 'on' : 'off'}"/>`;
    s += `<text x="17" y="${y + 5}" class="ioname">${name}</text><text x="40" y="${y + 5}" class="ioval">${v}</text></g>`;
  });
  spec.outs.forEach((name, i) => {
    const [x, y] = g.sinkPos('out:' + i), v = ev.outs[i];
    s += `<rect x="310" y="${y - 18}" width="46" height="36" rx="8" class="io lamp ${cls(v)}"/>`;
    s += `<text x="333" y="${y - 3}" class="ioname sm">${name}</text><text x="333" y="${y + 12}" class="ioval c">${v == null ? '–' : v}</text>`;
  });

  // 점은 맨 위에 — 손가락이 닿는 넓은 투명 원 + 보이는 작은 원
  const port = (k, key, [x, y], val) => {
    const on = sel && sel.t === k && sel.key === key;
    return `<g data-k="${k}" data-key="${key}"><circle cx="${x}" cy="${y}" r="13" class="hit"/><circle cx="${x}" cy="${y}" r="${on ? 8 : 6}" class="port ${cls(val)}${on ? ' sel' : ''}"/></g>`;
  };
  spec.ins.forEach((_, i) => { s += port('src', 'in:' + i, g.srcPos('in:' + i), cur.inVals[i]); });
  spec.outs.forEach((_, i) => { s += port('sink', 'out:' + i, g.sinkPos('out:' + i), ev.outs[i]); });
  for (const p of cur.circ.parts) {
    const def = PARTS[p.type];
    def.ins.forEach((_, k) => { const key = p.id + ':' + k; s += port('sink', key, g.sinkPos(key), cur.circ.wires[key] ? ev.src(cur.circ.wires[key]) : 0); });
    def.outs.forEach((_, k) => { const key = p.id + ':' + k; s += port('src', key, g.srcPos(key), ev.src(key)); });
  }
  return s + '</svg>';
}

function statusText() {
  const sel = cur.sel;
  if (!sel) return cur.circ.parts.length ? '점 두 개를 차례로 누르면 선이 이어져요. 부품을 누르면 옮기거나 지울 수 있어요.' : '아래 단추로 부품을 놓아요.';
  if (sel.t === 'src') return '이 신호를 보낼 곳 — 부품 왼쪽 점이나 출력 점을 누르세요.';
  if (sel.t === 'sink') return cur.circ.wires[sel.key] ? '다른 신호를 누르면 바꿔 이어요. 「선 끊기」로 끊어요.' : '이 점에 넣을 신호 — 입력이나 부품 오른쪽 점을 누르세요.';
  return '점선 빈 칸을 누르면 그리로 옮겨요.';
}

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
  for (let r = 0; r < rows; r++) {
    const vals = bitsOf(r, n);
    const want = spec.expect(vals);
    const got = evaluate(cur.circ, vals, spec.outs.length).outs;
    h += `<tr data-row="${r}" class="${r === curRow ? 'cur' : ''}">`;
    h += vals.map((v) => `<td>${v}</td>`).join('');
    h += want.map((v, k) => `<td class="want${k === 0 ? ' gap' : ''}">${v}</td>`).join('');
    h += got.map((v, k) => `<td class="${k === 0 ? 'gap ' : ''}${v == null ? 'none' : v === want[k] ? 'ok' : 'bad'}">${v == null ? '–' : v}</td>`).join('');
    h += '</tr>';
  }
  return h + '</tbody></table>';
}

function renderStage() {
  const { s, i } = cur;
  const spec = specOf();
  const ev = evaluate(cur.circ, cur.inVals, spec.outs.length);
  const cost = costOf(cur.circ);
  const v = rec(s.id);
  const avail = partsFor(i);
  const sel = cur.sel;
  const next = STAGES[i + 1];
  const roundTxt = s.rounds ? `<span class="round">${cur.round + (cur.pass ? 0 : 1)} / ${s.rounds}</span>` : '';

  let tools = `<button data-a="undo" ${cur.undo.length ? '' : 'disabled'}>되돌리기</button>`;
  if (sel && sel.t === 'part') tools += `<button data-a="del" class="warn">부품 지우기</button>`;
  if (sel && sel.t === 'sink' && cur.circ.wires[sel.key]) tools += `<button data-a="cut" class="warn">선 끊기</button>`;
  tools += `<button data-a="reset" ${cur.circ.parts.length ? '' : 'disabled'}>처음부터</button>`;

  let after = '';
  if (cur.pass && s.rounds && cur.round < s.rounds) after = `<button data-a="round" class="primary">다음 표 →</button>`;
  else if (cur.pass && next) after = `<a class="btn primary" href="#s/${next.id}">다음: ${next.id} ${next.title} →</a>`;
  else if (cur.pass) after = `<a class="btn primary" href="#">목록으로</a>`;

  app.innerHTML = `
  <header class="bar"><a href="#" class="back">← 목록</a><span class="sid">${s.id}</span><span class="stars">${starStr(s)}</span>${v.count ? `<span class="count">${v.count}번 풂</span>` : ''}</header>
  <section class="task">
    <h1>${s.title} <span class="kind k-${s.kind}">${s.kind}</span>${roundTxt}</h1>
    <p>${s.text}</p>
    ${s.only ? `<p class="rule">쓸 수 있는 부품: ${s.only.join(', ')}만</p>` : ''}
    ${s.hint ? `<details ${cur.hintOpen ? 'open' : ''}><summary>힌트</summary><p>${s.hint}</p></details>` : ''}
  </section>
  <div class="board">${boardSvg(spec, ev)}</div>
  <p class="status">${ev.cycle ? '<b>고리가 있어요</b> — 신호가 제자리로 돌아와서 값이 안 정해져요. 3부(기억)에서 이 고리를 일부러 써요. ' : ''}${statusText()}</p>
  <div class="tools">${tools}</div>
  <div class="palette">${avail.map((t) => `<button data-add="${t}">${t}<small>${PARTS[t].cost}</small></button>`).join('')}</div>
  <p class="cost">NAND ${cost}개 몫${s.par ? ` · 별 두 개는 ${s.par}개 이하` : ''}${v.best != null ? ` · 최고 ${v.best}` : ''}</p>
  ${truthTable(spec)}
  <div class="check">
    ${cur.pass ? '' : `<button data-a="check" class="primary">확인</button>`}
    ${cur.msg ? `<p class="msg ${cur.pass ? 'good' : 'badmsg'}">${cur.msg}</p>` : ''}
    ${after}
  </div>`;

  const d = app.querySelector('details');
  if (d) d.addEventListener('toggle', () => { cur.hintOpen = d.open; });
}

function check() {
  const spec = specOf(), n = spec.ins.length;
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
  const s = cur.s, cost = costOf(cur.circ);
  cur.pass = true;
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
  if (s.par) m += cost <= s.par ? ` NAND ${cost}개 몫 — 별 두 개.` : ` NAND ${cost}개 몫. ${s.par}개 이하면 별 하나 더.`;
  if (first && s.unlock) m += ` 이제부터 <b>${s.unlock}</b>를 상자 하나로 써요.`;
  cur.msg = m;
}

function tap(e) {
  const t = e.target.closest('[data-k],[data-a],[data-add],[data-row]');
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
  if (t.dataset.row != null) {
    cur.inVals = bitsOf(+t.dataset.row, cur.inVals.length);
    return renderStage();
  }
  const a = t.dataset.a;
  if (a) {
    if (a === 'undo' && cur.undo.length) {
      cur.circ = JSON.parse(cur.undo.pop());
      if (!cur.s.random) { rec(cur.s.id).circ = cur.circ; persist(); }
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
    } else if (a === 'check') {
      check();
    } else if (a === 'round') {
      cur.table = randomTable(cur.s.random);
      cur.circ = { parts: [], wires: {} };
      cur.undo = []; cur.pass = false; cur.msg = '';
      cur.inVals = cur.inVals.map(() => 0);
      window.scrollTo(0, 0);
    }
    return renderStage();
  }
  const k = t.dataset.k, sel = cur.sel;
  if (k === 'bg') cur.sel = null;
  else if (k === 'inbtn') { const i = +t.dataset.i; cur.inVals[i] ^= 1; }
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
  let h = `<header class="hero"><h1>NAND 게임</h1><p>NAND 게이트 하나에서 시작해 GPU까지. 만든 부품은 다음 단계에서 상자 하나가 되고, 같은 개념을 여러 번 다르게 풀며 손에 익혀요.</p>
  <p class="prog">${solved} / ${STAGES.length} 풂 · 지금 열린 건 1부${firstOpen >= 0 ? ` · <a href="#s/${STAGES[firstOpen].id}">이어서 ${STAGES[firstOpen].id} →</a>` : ''}</p></header>`;
  for (const bk of BOOKS) {
    const list = STAGES.filter((s) => s.book === bk.no);
    h += `<section class="book${list.length ? '' : ' soon'}"><h2><span class="bno">${bk.no}부</span> ${bk.name}</h2><p class="bdesc">${bk.desc}</p>`;
    if (!list.length) { h += '<p class="soonp">준비 중</p></section>'; continue; }
    h += '<ol class="stages">';
    for (const s of list) {
      const i = idxOf(s.id), open = unlocked(i), v = save[s.id] || {};
      const inner = `<span class="snum">${s.id}</span><span class="stitle">${s.title}</span><span class="kind k-${s.kind}">${s.kind}</span><span class="sstar">${open ? starStr(s) : '🔒'}</span>${v.count ? `<span class="count">${v.count}</span>` : ''}`;
      h += `<li class="${i === firstOpen ? 'nextup' : ''}">${open ? `<a href="#s/${s.id}">${inner}</a>` : `<span class="locked">${inner}</span>`}</li>`;
    }
    h += '</ol></section>';
  }
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

app.addEventListener('click', (e) => { if (cur) tap(e); });
window.addEventListener('hashchange', route);
route();
