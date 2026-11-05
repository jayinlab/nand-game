// 스테이지 정의. BOOKS는 지도 전체(10부), STAGES는 지금 풀 수 있는 것만.
// 반복 숙달이 목표라 부마다 세 종류가 섞인다:
//   개념 — 새 부품을 처음 만든다. 풀면 그 부품이 다음 스테이지부터 상자 하나로 나온다.
//   연습 — 같은 개념을 조건을 바꿔 다시(NAND만·적은 개수·표 보고 맞히기).
//   시험 — 매번 새로 뽑는 표(random)나 앞 스테이지 하나(pool)를 연달아 맞힌다. 다시 들어가면 다른 문제.
// 3부부터는 진리표 대신 시간 줄(steps, 입력만)과 모형(model)으로 판정한다. 모형이 null을 내면 그 칸은 안 본다.
// hints는 차례로 하나씩 열린다. 다 열면 「정답 가까이 놓기」 — sol(이름=부품(입력,…); @출력번호=이름)의
// 부품을 다 놓고, 출력 선과 마지막 부품으로 들어가는 선만 비워 둔다. 무작위 표는 app.js가 1인 줄 하나를 놓아 준다.

export const BOOKS = [
  { no: 1, name: '게이트', desc: 'NAND 하나로 NOT·AND·OR·XOR·선택기·분배기를 만들어요' },
  { no: 2, name: '산술', desc: '반가산기 → 가산기 → 뺄셈·비교 → ALU' },
  { no: 3, name: '기억', desc: '래치 → 플립플롭 → 레지스터·카운터·RAM' },
  { no: 4, name: 'CPU', desc: '명령어 해석·PC·점프 → 작은 컴퓨터' },
  { no: 5, name: '병렬', desc: 'ALU를 레인 여럿으로 · 스칼라/벡터 레지스터 · EXEC 마스크 · 웨이브' },
  { no: 6, name: '메모리', desc: '레인별 주소 · 모아 읽기 · 캐시 · 원자 연산 · LDS · 배리어' },
  { no: 7, name: 'CU·스케줄', desc: '웨이브로 지연 숨기기 · 워크그룹 나누기 · 커널 인자' },
  { no: 8, name: 'CP·PM4', desc: '링 버퍼 · doorbell · PM4 패킷을 dword로 짜서 dispatch 하기' },
  { no: 9, name: '드라이버', desc: '메모리 할당 · GPU 가상 주소 · ISA · 제출' },
  { no: 10, name: 'Vulkan', desc: 'Vulkan compute 호출 한 벌이 PM4로 내려가 도는 것까지' },
];

const b = (x) => (x ? 1 : 0);
const n2 = (h, l) => h * 2 + l;
const bitsN = (v, n) => Array.from({ length: n }, (_, i) => (v >> (n - 1 - i)) & 1);
// 1비트 ALU 칸: o1o0 = 00 AND · 01 OR · 10 덧셈 · 11 XOR. 올림은 늘 덧셈의 올림.
// 클록 모형: clk가 0→1로 바뀌면 바로 앞(clk=0) 줄의 입력으로 update — 래치 둘(앞은 clk=0, 뒤는 clk=1에 열림)과 같다
const clocked = (ci, update, read) => (st, ins) => {
  const c = ins[ci];
  if (c && st.pc === 0 && st.prev) update(st, st.prev);
  st.pc = c;
  if (!c) st.prev = ins;
  return read(st, ins);
};
// 클록 한 번 = 두 줄(clk 0, clk 1). 앞 글자들은 그 밖의 입력
// 4-6 CPU 시간 줄: 프로그램을 미리 돌려 박자마다 그 줄의 명령어를 넣는다(ROM 자리를 표가 대신)
const CPU_EXEC = (st, [o1, o0, i1, i0]) => {
  const op = n2(o1, o0), i = n2(i1, i0), pc = st.p | 0, a = st.a | 0; // st.pc는 clocked가 쓰니 PC는 st.p
  if (op === 0) st.a = i; else if (op === 1) st.a = (a + i) & 3;
  st.p = op === 2 || (op === 3 && a === 0) ? i : (pc + 1) & 3;
};
const cpuSteps = (prog, cycles) => {
  const st = {}, out = [];
  for (let k = 0; k < cycles; k++) {
    const [op, i] = prog[st.p | 0], x = [...bitsN(op, 2), ...bitsN(i, 2)].join('');
    out.push(x + '0', x + '1');
    CPU_EXEC(st, [...x].map(Number));
  }
  return out;
};
const cpuModel = () => clocked(4, CPU_EXEC, (st) => [...bitsN(st.p | 0, 2), ...bitsN(st.a | 0, 2)]);
const tick = (...xs) => xs.flatMap((x) => [x + '0', x + '1']);
const alu1 = (o1, o0, a, c, d) => [[a & c, a | c, a ^ c ^ d, a ^ c][o1 * 2 + o0], b(a + c + d >= 2)];

// 부품. cost = NAND 몇 개 몫인지(별 두 개 기준에 쓴다).
export const PARTS = {
  NAND: { ins: ['', ''], outs: [''], cost: 1, fn: ([a, c]) => [b(!(a && c))] },
  NOT: { ins: [''], outs: [''], cost: 1, fn: ([a]) => [b(!a)] },
  AND: { ins: ['', ''], outs: [''], cost: 2, fn: ([a, c]) => [b(a && c)] },
  OR: { ins: ['', ''], outs: [''], cost: 3, fn: ([a, c]) => [b(a || c)] },
  NOR: { ins: ['', ''], outs: [''], cost: 4, fn: ([a, c]) => [b(!(a || c))] },
  XOR: { ins: ['', ''], outs: [''], cost: 4, fn: ([a, c]) => [b(a !== c)] },
  XNOR: { ins: ['', ''], outs: [''], cost: 5, fn: ([a, c]) => [b(a === c)] },
  MUX: { ins: ['0', '1', 's'], outs: [''], cost: 4, fn: ([d0, d1, s]) => [s ? d1 : d0] },
  DEMUX: { ins: ['d', 's'], outs: ['0', '1'], cost: 5, fn: ([d, s]) => [b(d && !s), b(d && s)] },
  HA: { ins: ['', ''], outs: ['s', 'c'], cost: 5, fn: ([a, c]) => [a ^ c, a & c] },
  FA: { ins: ['', '', 'c'], outs: ['s', 'c'], cost: 9, fn: ([a, c, d]) => [a ^ c ^ d, b(a + c + d >= 2)] },
  ALU: { ins: ['o1', 'o0', 'a', 'b', 'c'], outs: ['r', 'c'], cost: 30, fn: ([o1, o0, a, c, d]) => alu1(o1, o0, a, c, d) },
  // 3부 기억 상자 — seq(속, 입력)는 속 상태를 가진다. 판은 값이 멈출 때까지 여러 번 부른다.
  LATCH: { ins: ['d', 'st'], outs: ['q'], cost: 4, seq: (m, [d, s]) => { if (s) m.q = d; return [m.q | 0]; } },
  DFF: { ins: ['d', 'clk'], outs: ['q'], cost: 9, seq: (m, [d, c]) => { if (!c) m.m = d; else m.q = m.m | 0; return [m.q | 0]; } },
  BIT: { ins: ['d', 'st', 'clk'], outs: ['q'], cost: 13, seq: (m, [d, s, c]) => { if (!c) m.m = s ? d : m.q | 0; else m.q = m.m | 0; return [m.q | 0]; } },
  // 4부 CPU 상자 — 명령어 두 자리(o1o0): 00 LDI · 01 ADD · 10 JMP · 11 JZ, 뒤 두 자리(i1i0)는 수
  CTRL: { ins: ['o1', 'o0', 'z'], outs: ['wa', 'add', 'j'], cost: 7, fn: ([o1, o0, z]) => [b(!o1), b(!o1 && o0), b(o1 && (!o0 || z))] },
  PC: {
    ins: ['j', 't1', 't0', 'clk'], outs: ['p1', 'p0'], cost: 31,
    seq: (m, [j, t1, t0, c]) => { const q = m.q || [0, 0]; if (!c) m.m = j ? [t1, t0] : bitsN((n2(...q) + 1) & 3, 2); else m.q = m.m || q; return m.q || [0, 0]; },
  },
  DATA: {
    ins: ['add', 'wa', 'i1', 'i0', 'clk'], outs: ['a1', 'a0', 'z'], cost: 51,
    seq: (m, [ad, wa, i1, i0, c]) => {
      const q = m.q || [0, 0];
      if (!c) m.m = wa ? bitsN(ad ? (n2(...q) + n2(i1, i0)) & 3 : n2(i1, i0), 2) : q; else m.q = m.m || q;
      const r = m.q || [0, 0];
      return [r[0], r[1], b(!r[0] && !r[1])];
    },
  },
};

// ---------- 4부 어셈블리: 작은 컴퓨터(8비트) ----------
// 4-6의 회로 CPU를 8비트로 넓히고 기억(16칸)과 명령어를 몇 개 더한 것(단순화). 명령어 기억은 따로(줄 0~15).
// 한 줄 = 8비트 기계어: 앞 네 자리 = 명령, 뒤 네 자리 = 수(0~15).
export const ISA = {
  HLT: { code: 0, arg: null, desc: '멈춰요' },
  LDI: { code: 1, arg: 'n', desc: 'A ← 수 n' },
  LD: { code: 2, arg: 'm', desc: 'A ← 기억[m]' },
  ST: { code: 3, arg: 'm', desc: '기억[m] ← A' },
  ADD: { code: 4, arg: 'm', desc: 'A ← A + 기억[m]' },
  SUB: { code: 5, arg: 'm', desc: 'A ← A − 기억[m]' },
  JMP: { code: 6, arg: 'k', desc: 'k번 줄로 가요' },
  JZ: { code: 7, arg: 'k', desc: 'A가 0이면 k번 줄로' },
  JN: { code: 8, arg: 'k', desc: 'A가 음수(맨 윗자리 1)면 k번 줄로' },
  OUT: { code: 9, arg: null, desc: 'A를 내보내요' },
};
export const parseProg = (t) => t.split(';').map((x) => x.trim()).filter(Boolean).map((x) => { const [op, n] = x.split(/\s+/); return { op, n: n == null ? 0 : +n }; });
// 한 줄씩 돌린다. m = { pc, a, ram, out, halted, steps, err }
export function asmStep(prog, m) {
  if (m.halted) return m;
  if (m.pc >= prog.length) { m.halted = true; return m; } // 끝줄을 지나면 멈춤
  const { op, n } = prog[m.pc];
  let next = m.pc + 1;
  if (op === 'HLT') { m.halted = true; return m; }
  if (op === 'LDI') m.a = n;
  else if (op === 'LD') m.a = m.ram[n];
  else if (op === 'ST') m.ram[n] = m.a;
  else if (op === 'ADD') m.a = (m.a + m.ram[n]) & 255;
  else if (op === 'SUB') m.a = (m.a - m.ram[n]) & 255;
  else if (op === 'JMP') next = n;
  else if (op === 'JZ') { if (m.a === 0) next = n; }
  else if (op === 'JN') { if (m.a & 128) next = n; }
  else if (op === 'OUT') m.out.push(m.a);
  m.pc = next;
  m.steps++;
  return m;
}
export const asmInit = (ram) => ({ pc: 0, a: 0, ram: Array.from({ length: 16 }, (_, i) => (ram && ram[i]) || 0), out: [], halted: false, steps: 0 });
export function asmRun(prog, ram, limit = 2000) {
  const m = asmInit(ram);
  while (!m.halted && m.steps < limit) asmStep(prog, m);
  if (!m.halted) m.err = 'loop';
  return m;
}

const AB = ['A', 'B'];
const ABC = ['A', 'B', 'C'];
const OUT = ['출력'];

export const STAGES = [
  {
    id: '1-1', book: 1, kind: '개념', title: 'NAND 만나기',
    text: 'NAND는 두 입력이 <b>둘 다 1일 때만 0</b>을 내요. 점에서 점으로 끌면 선이 이어져요(차례로 눌러도 돼요) — A의 점 → NAND 왼쪽 점, B → 다른 왼쪽 점, NAND 오른쪽 점 → 출력.',
    hints: ['아래 「NAND」 단추로 부품을 놓아요. 왼쪽 입력 단추를 누르면 0/1이 바뀌고, 표의 줄을 눌러도 돼요.', 'NAND 오른쪽 점 하나를 출력 점까지 끌면 끝이에요.'],
    sol: 'n=NAND(A,B); @0=n',
    ins: AB, outs: OUT, par: 1, fn: ([a, c]) => [b(!(a && c))],
  },
  {
    id: '1-2', book: 1, kind: '개념', title: 'NOT', unlock: 'NOT',
    text: '입력을 뒤집어요. 0이면 1, 1이면 0.',
    hints: ['NAND의 두 왼쪽 점에 같은 신호를 넣으면?', 'NAND 하나. A를 두 왼쪽 점에 다 이어요.'],
    sol: 'n=NAND(A,A); @0=n',
    ins: ['A'], outs: OUT, par: 1, fn: ([a]) => [b(!a)],
  },
  {
    id: '1-3', book: 1, kind: '개념', title: 'AND', unlock: 'AND',
    text: '둘 다 1일 때만 1.',
    hints: ['NAND는 「AND의 반대」예요. 한 번 더 뒤집으면.', 'NAND 하나 뒤에 NOT 하나.'],
    sol: 'x=NAND(A,B); y=NOT(x); @0=y',
    ins: AB, outs: OUT, par: 2, fn: ([a, c]) => [b(a && c)],
  },
  {
    id: '1-4', book: 1, kind: '개념', title: 'OR', unlock: 'OR',
    text: '하나라도 1이면 1.',
    hints: ['「하나라도 1」 = 「뒤집은 둘이 둘 다 1은 아니다」.', 'A와 B를 각각 NOT으로 뒤집고, 그 둘을 NAND에.'],
    sol: 'a=NOT(A); c=NOT(B); y=NAND(a,c); @0=y',
    ins: AB, outs: OUT, par: 3, fn: ([a, c]) => [b(a || c)],
  },
  {
    id: '1-5', book: 1, kind: '연습', title: 'OR, NAND만으로', only: ['NAND'],
    text: '방금 만든 OR를 이번엔 NAND만으로 다시. 상자 없이 손으로 기억해 두는 연습이에요.',
    hints: ['NOT도 NAND 하나였어요.', 'NAND(A,A)와 NAND(B,B)를 만들고, 그 둘을 다시 NAND에.'],
    sol: 'a=NAND(A,A); c=NAND(B,B); y=NAND(a,c); @0=y',
    ins: AB, outs: OUT, par: 3, fn: ([a, c]) => [b(a || c)],
  },
  {
    id: '1-6', book: 1, kind: '개념', title: 'NOR', unlock: 'NOR',
    text: '둘 다 0일 때만 1.',
    hints: ['OR를 뒤집기.', 'OR 하나 뒤에 NOT 하나.'],
    sol: 'o=OR(A,B); y=NOT(o); @0=y',
    ins: AB, outs: OUT, par: 4, fn: ([a, c]) => [b(!(a || c))],
  },
  {
    id: '1-7', book: 1, kind: '연습', title: 'A이면서 B는 아님',
    text: 'A가 1이고 B가 0일 때만 1.',
    hints: ['B를 뒤집어서 AND. 별 두 개는 NAND 3개 몫 이하.', 'NOT(B) 하나, 그리고 AND(A, NOT B).'],
    sol: 'n=NOT(B); y=AND(A,n); @0=y',
    ins: AB, outs: OUT, par: 3, fn: ([a, c]) => [b(a && !c)],
  },
  {
    id: '1-8', book: 1, kind: '개념', title: 'XOR', unlock: 'XOR',
    text: '둘이 다를 때만 1. 2부에서 더하기의 심장이 돼요.',
    hints: ['「하나라도 1」이면서 「둘 다 1은 아니다」.', 'OR(A,B)와 NAND(A,B)를 따로 만들어 AND로 묶어요. 별 두 개 모양은 다음 스테이지에서.'],
    sol: 'o=OR(A,B); n=NAND(A,B); y=AND(o,n); @0=y',
    ins: AB, outs: OUT, par: 4, fn: ([a, c]) => [b(a !== c)],
  },
  {
    id: '1-9', book: 1, kind: '연습', title: 'XOR, NAND 넷으로', only: ['NAND'],
    text: 'XOR를 NAND만으로. 별 두 개는 NAND 4개.',
    hints: ['첫 NAND(A,B)를 세 곳에서 같이 써요.', 'n = NAND(A,B). 그다음 NAND(A,n)과 NAND(B,n), 마지막에 그 둘을 NAND.'],
    sol: 'n=NAND(A,B); x=NAND(A,n); z=NAND(B,n); y=NAND(x,z); @0=y',
    ins: AB, outs: OUT, par: 4, fn: ([a, c]) => [b(a !== c)],
  },
  {
    id: '1-10', book: 1, kind: '개념', title: 'XNOR', unlock: 'XNOR',
    text: '둘이 같을 때 1. 「같은가?」를 묻는 게이트예요.',
    hints: ['XOR를 뒤집기.', 'XOR 하나 뒤에 NOT.'],
    sol: 'x=XOR(A,B); y=NOT(x); @0=y',
    ins: AB, outs: OUT, par: 5, fn: ([a, c]) => [b(a === c)],
  },
  {
    id: '1-11', book: 1, kind: '연습', title: '셋 다 1',
    text: 'A·B·C가 모두 1일 때만 1.',
    hints: ['두 개씩 묶어도 돼요.', 'AND(A,B)를 만들고, 그걸 C와 다시 AND.'],
    sol: 'x=AND(A,B); y=AND(x,C); @0=y',
    ins: ABC, outs: OUT, par: 4, fn: ([a, c, d]) => [b(a && c && d)],
  },
  {
    id: '1-12', book: 1, kind: '연습', title: '셋 중 하나라도',
    text: 'A·B·C 중 하나라도 1이면 1.',
    hints: ['OR 두 개.', 'OR(A,B)를 만들고, 그걸 C와 다시 OR.'],
    sol: 'x=OR(A,B); y=OR(x,C); @0=y',
    ins: ABC, outs: OUT, par: 6, fn: ([a, c, d]) => [b(a || c || d)],
  },
  {
    id: '1-13', book: 1, kind: '연습', title: '다수결',
    text: '셋 중 둘 이상이 1이면 1. 2부의 올림수(carry)가 바로 이 모양이에요.',
    hints: ['둘씩 짝지은 AND 셋 중 하나라도.', 'AND 셋·OR 둘로도 되지만, 별 두 개는 NAND 여섯 — NAND(A,B)·NAND(A,C)·NAND(B,C)가 바탕이고 「AND 뒤 OR」 = 「NAND 뒤 NAND」예요.'],
    sol: 'p=NAND(A,B); q=NAND(A,C); r=NAND(B,C); t=NAND(p,q); u=NOT(t); y=NAND(u,r); @0=y',
    ins: ABC, outs: OUT, par: 6, fn: ([a, c, d]) => [b(a + c + d >= 2)],
  },
  {
    id: '1-14', book: 1, kind: '개념', title: '선택기 (MUX)', unlock: 'MUX',
    text: 's가 0이면 d0을, 1이면 d1을 내보내요. 나중에 「어느 레지스터를 읽을까」가 전부 이것.',
    hints: ['(d0 AND NOT s) OR (d1 AND s).', 'AND·OR로 바로 짜도 되고, 별 두 개는 NOT s 하나 + NAND 셋: NAND(d0, NOT s) · NAND(d1, s) · 그 둘을 NAND.'],
    sol: 'n=NOT(s); x=NAND(d0,n); z=NAND(d1,s); y=NAND(x,z); @0=y',
    ins: ['d0', 'd1', 's'], outs: OUT, par: 4, fn: ([d0, d1, s]) => [s ? d1 : d0],
  },
  {
    id: '1-15', book: 1, kind: '연습', title: '선택기, NAND만으로', only: ['NAND'],
    text: '선택기를 NAND만으로. 별 두 개는 NAND 4개.',
    hints: ['NOT s 하나, 나머지 셋은 NAND 그대로.', 'NOT s = NAND(s,s). 그다음 NAND(d0, NOT s) · NAND(d1, s) · 그 둘을 NAND.'],
    sol: 'n=NAND(s,s); x=NAND(d0,n); z=NAND(d1,s); y=NAND(x,z); @0=y',
    ins: ['d0', 'd1', 's'], outs: OUT, par: 4, fn: ([d0, d1, s]) => [s ? d1 : d0],
  },
  {
    id: '1-16', book: 1, kind: '개념', title: '분배기 (DEMUX)', unlock: 'DEMUX',
    text: 'd를 s가 0이면 c0으로, 1이면 c1로 보내요. 다른 쪽은 0.',
    hints: ['선택기를 거꾸로. AND 두 개와 NOT 하나.', 'NOT s 하나. c0 = AND(d, NOT s), c1 = AND(d, s).'],
    sol: 'n=NOT(s); x=AND(d,n); z=AND(d,s); @0=x; @1=z',
    ins: ['d', 's'], outs: ['c0', 'c1'], par: 5, fn: ([d, s]) => [b(d && !s), b(d && s)],
  },
  {
    id: '1-17', book: 1, kind: '연습', title: '두 자리가 같나',
    text: '두 자리 수 A1A0과 B1B0이 같으면 1.',
    hints: ['자리마다 「같은가?」, 그리고 둘 다.', 'XNOR(A1,B1)과 XNOR(A0,B0)을 AND로.'],
    sol: 'x=XNOR(A1,B1); z=XNOR(A0,B0); y=AND(x,z); @0=y',
    ins: ['A1', 'A0', 'B1', 'B0'], outs: OUT, par: 12,
    fn: ([a1, a0, b1, b0]) => [b(a1 === b1 && a0 === b0)],
  },
  {
    id: '1-18', book: 1, kind: '연습', title: '표 맞히기 · 입력 둘', random: 2, rounds: 3,
    text: '매번 새로 뽑는 표를 회로로. 세 번 연달아. 다시 들어오면 다른 문제예요.',
    hints: ['1이 나오는 줄만 보고 「이 줄일 때」를 AND로 만든 뒤 OR로 모으면 어떤 표든 돼요.', '예: 1이 「A=1, B=0」 줄에 있으면 AND(A, NOT B). 그런 AND를 1인 줄마다 만들어 OR로 모아요.'],
  },
  {
    id: '1-19', book: 1, kind: '연습', title: '표 맞히기 · 입력 셋', random: 3, rounds: 3,
    text: '입력이 셋인 표를 세 번 연달아.',
    hints: ['선택기로 C에 따라 둘로 나눠 풀어도 돼요.', '1인 줄마다 AND 두 개(셋을 묶으려고)와 0인 자리의 NOT. 1인 줄이 많으면 「0인 줄」로 만들고 마지막에 뒤집는 게 짧아요.'],
  },
  {
    id: '1-20', book: 1, kind: '시험', title: '1부 시험', random: 3, rounds: 5,
    text: '입력 셋짜리 표 다섯을 연달아. 이걸 넘기면 2부(산술)로 가요.',
    hints: ['막히면 1-18의 방법: 1이 나오는 줄마다 AND, 전부 OR.', '1인 줄마다 「이 줄일 때만 1」을 AND로, 전부 OR로.'],
  },
  // ---------- 2부 산술 ----------
  {
    id: '2-1', book: 2, kind: '개념', title: '반가산기', unlock: 'HA',
    text: '한 자리 이진수 둘을 더해요. 1+1=10 — 합 0, 올림 1. 상자로 쓰면 s가 합, c가 올림이에요.',
    hints: ['합은 「둘이 다를 때 1」, 올림은 「둘 다 1」.', '별 두 개는 NAND 다섯 — 1-9의 XOR(NAND 넷) 안에 이미 NAND(A,B)가 있으니 그걸 NOT 하면 올림.'],
    sol: 'n=NAND(A,B); x=NAND(A,n); z=NAND(B,n); s=NAND(x,z); c=NOT(n); @0=s; @1=c',
    ins: AB, outs: ['합', '올림'], par: 5, fn: ([a, c]) => [a ^ c, a & c],
  },
  {
    id: '2-2', book: 2, kind: '연습', title: '반가산기, NAND만으로', only: ['NAND'],
    text: '반가산기를 NAND 다섯으로. 2부의 모든 덧셈이 이 다섯 개에서 나와요.',
    hints: ['XOR는 NAND 넷(1-9). 그 첫 NAND를 하나 더 쓰면 올림.', '올림 = NAND(n, n) — n은 맨 처음 NAND(A,B).'],
    sol: 'n=NAND(A,B); x=NAND(A,n); z=NAND(B,n); s=NAND(x,z); c=NAND(n,n); @0=s; @1=c',
    ins: AB, outs: ['합', '올림'], par: 5, fn: ([a, c]) => [a ^ c, a & c],
  },
  {
    id: '2-3', book: 2, kind: '개념', title: '전가산기', unlock: 'FA',
    text: '세 자리(A·B·아랫자리에서 올라온 올림 Cin)를 더해요. 여러 자리 덧셈의 한 칸이에요. 상자로 쓰면 c 점이 Cin이에요.',
    hints: ['반가산기 둘: 먼저 A+B, 그 합에 Cin을 더해요.', '두 반가산기의 올림 중 하나라도 1이면 올림 — OR. (둘이 같이 1이 되는 일은 없어요.)'],
    sol: 'h=HA(A,B); k=HA(h,Cin); c=OR(h.1,k.1); @0=k; @1=c',
    ins: ['A', 'B', 'Cin'], outs: ['합', '올림'], par: 13, fn: ([a, c, d]) => [a ^ c ^ d, b(a + c + d >= 2)],
  },
  {
    id: '2-4', book: 2, kind: '연습', title: '셋의 홀짝',
    text: '1이 홀수 개면 1. 전가산기의 「합」 칸만 떼어 본 거예요.',
    hints: ['XOR는 「1이 홀수 개」를 묻는 게이트예요.', 'XOR(A,B)를 C와 다시 XOR.'],
    sol: 'x=XOR(A,B); y=XOR(x,C); @0=y',
    ins: ABC, outs: OUT, par: 8, fn: ([a, c, d]) => [a ^ c ^ d],
  },
  {
    id: '2-5', book: 2, kind: '연습', title: '전가산기, NAND 아홉', only: ['NAND'],
    text: '전가산기를 NAND만으로. 별 두 개는 NAND 9개.',
    hints: ['A XOR B를 NAND 넷으로(1-9), 그 결과와 Cin을 또 NAND 넷으로 XOR.', '두 XOR의 첫 NAND — NAND(A,B)와 NAND(x,Cin) — 를 다시 NAND하면 올림. 모두 아홉.'],
    sol: 'n=NAND(A,B); p=NAND(A,n); q=NAND(B,n); x=NAND(p,q); m=NAND(x,Cin); u=NAND(x,m); v=NAND(Cin,m); s=NAND(u,v); c=NAND(n,m); @0=s; @1=c',
    ins: ['A', 'B', 'Cin'], outs: ['합', '올림'], par: 9, fn: ([a, c, d]) => [a ^ c ^ d, b(a + c + d >= 2)],
  },
  {
    id: '2-6', book: 2, kind: '연습', title: '하나 더하기',
    text: '두 자리 수 A1A0에 1을 더해요(S2S1S0). 3부의 카운터가 바로 이거예요.',
    hints: ['반가산기에 B 대신 1을 넣은 셈 — 맨 아래 자리는 뒤집기, 그 올림은 A0.', 'S0 = NOT A0, S1 = A1 XOR A0, S2 = A1 AND A0.'],
    sol: 'n=NOT(A0); x=XOR(A1,A0); c=AND(A1,A0); @0=c; @1=x; @2=n',
    ins: ['A1', 'A0'], outs: ['S2', 'S1', 'S0'], par: 7, fn: ([a1, a0]) => bitsN(n2(a1, a0) + 1, 3),
  },
  {
    id: '2-7', book: 2, kind: '개념', title: '두 자리 덧셈',
    text: 'A1A0 + B1B0 = S2S1S0. 자리마다 한 칸씩, 올림은 윗자리로.',
    hints: ['맨 아래 자리는 올림이 안 들어오니 반가산기, 윗자리는 전가산기.', '반가산기 올림(c) → 전가산기의 c 점. 전가산기의 올림이 S2.'],
    sol: 'h=HA(A0,B0); f=FA(A1,B1,h.1); @0=f.1; @1=f; @2=h',
    ins: ['A1', 'A0', 'B1', 'B0'], outs: ['S2', 'S1', 'S0'], par: 14,
    fn: ([a1, a0, b1, b0]) => bitsN(n2(a1, a0) + n2(b1, b0), 3),
  },
  {
    id: '2-8', book: 2, kind: '연습', title: '올림 받는 두 자리',
    text: '맨 아래 자리에도 올림(Cin)이 들어와요. 이 칸을 줄줄이 이으면 4비트·16비트 가산기예요(폰 화면엔 두세 자리까지만).',
    hints: ['이번엔 맨 아래도 셋을 더하니 전가산기 둘.', '아래 전가산기의 c 점 ← Cin, 그 올림 → 윗 전가산기 c 점.'],
    sol: 'f=FA(A0,B0,Cin); g=FA(A1,B1,f.1); @0=g.1; @1=g; @2=f',
    ins: ['A1', 'A0', 'B1', 'B0', 'Cin'], outs: ['S2', 'S1', 'S0'], par: 18,
    fn: ([a1, a0, b1, b0, c]) => bitsN(n2(a1, a0) + n2(b1, b0) + c, 3),
  },
  {
    id: '2-9', book: 2, kind: '연습', title: '세 자리 덧셈',
    text: 'A2A1A0 + B2B1B0 = S3S2S1S0. 칸 하나를 더 이어요.',
    hints: ['2-7에 전가산기 하나를 더 — 올림을 다음 칸으로 넘겨요.', '반가산기 → 전가산기 → 전가산기, 올림 점끼리 이어요. 마지막 올림이 S3.'],
    sol: 'h=HA(A0,B0); f=FA(A1,B1,h.1); g=FA(A2,B2,f.1); @0=g.1; @1=g; @2=f; @3=h',
    ins: ['A2', 'A1', 'A0', 'B2', 'B1', 'B0'], outs: ['S3', 'S2', 'S1', 'S0'], par: 23,
    fn: ([a2, a1, a0, b2, b1, b0]) => bitsN(a2 * 4 + n2(a1, a0) + b2 * 4 + n2(b1, b0), 4),
  },
  {
    id: '2-10', book: 2, kind: '개념', title: '음수 (2의 보수)',
    text: '컴퓨터는 음수를 「뒤집고 1 더하기」로 나타내요(2의 보수). 두 자리라면 1(01)의 음수는 11 — 3이 아니라 −1로 읽어요. A1A0의 음수 −A를 만들어요(넘친 자리는 버려요).',
    hints: ['표를 보면 N0은 A0 그대로예요.', 'N1은 A1과 A0이 다를 때 1 — XOR. N0은 A0에서 출력으로 바로 이어도 돼요.'],
    sol: 'x=XOR(A1,A0); @0=x; @1=A0',
    ins: ['A1', 'A0'], outs: ['N1', 'N0'], par: 4, fn: ([a1, a0]) => bitsN((4 - n2(a1, a0)) % 4, 2),
  },
  {
    id: '2-11', book: 2, kind: '개념', title: '뒤집기 스위치',
    text: '「빼기」가 1이면 B를 뒤집고, 0이면 그대로 보내요. 다음 스테이지에서 더하기를 빼기로 바꾸는 손잡이가 돼요.',
    hints: ['표를 보면 익숙한 게이트예요.', 'XOR(B, 빼기).'],
    sol: 'x=XOR(B,빼기); @0=x',
    ins: ['B', '빼기'], outs: OUT, par: 4, fn: ([c, s]) => [c ^ s],
  },
  {
    id: '2-12', book: 2, kind: '개념', title: '더하기·빼기',
    text: 'A − B = A + (뒤집은 B) + 1. 뒤집기는 2-11 스위치, 「+1」은 맨 아래 전가산기 c 점에 「빼기」를 넣으면 돼요. 결과는 두 자리(넘친 자리는 버려요).',
    hints: ['B1·B0을 각각 XOR(Bi, 빼기)로 통과시킨 뒤 2-8처럼 전가산기 둘.', '맨 아래 전가산기의 c 점 ← 「빼기」. 그 올림 → 윗 전가산기 c 점.'],
    sol: 'x=XOR(B0,빼기); y=XOR(B1,빼기); f=FA(A0,x,빼기); g=FA(A1,y,f.1); @0=g; @1=f',
    ins: ['빼기', 'A1', 'A0', 'B1', 'B0'], outs: ['S1', 'S0'], par: 26,
    fn: ([s, a1, a0, b1, b0]) => bitsN((s ? n2(a1, a0) - n2(b1, b0) + 4 : n2(a1, a0) + n2(b1, b0)) & 3, 2),
  },
  {
    id: '2-13', book: 2, kind: '개념', title: '0인가',
    text: '네 자리가 모두 0이면 1. CPU가 「결과가 0이면 점프」할 때 보는 깃발(flag)이에요.',
    hints: ['「하나라도 1」의 반대.', 'OR 둘로 둘씩 모은 뒤 NOR.'],
    sol: 'x=OR(A3,A2); z=OR(A1,A0); y=NOR(x,z); @0=y',
    ins: ['A3', 'A2', 'A1', 'A0'], outs: OUT, par: 10, fn: (v) => [b(v.every((x) => !x))],
  },
  {
    id: '2-14', book: 2, kind: '개념', title: 'A가 B보다 작나',
    text: 'A1A0 < B1B0이면 1. 윗자리부터 견줘도 되고, A − B를 해서 「빌려 왔나」(맨 위 올림이 0인가)를 봐도 돼요. CPU는 뒤쪽을 써요.',
    hints: ['A − B = A + NOT B + 1에서 맨 위 올림이 0이면 A < B.', '아래 자리 올림 = A0 OR NOT B0 = NAND(NOT A0, B0). 윗자리는 FA(A1, NOT B1, 그 올림), 올림을 뒤집으면 끝.'],
    sol: 'na=NOT(A0); c=NAND(na,B0); nb=NOT(B1); f=FA(A1,nb,c); y=NOT(f.1); @0=y',
    ins: ['A1', 'A0', 'B1', 'B0'], outs: OUT, par: 13, fn: ([a1, a0, b1, b0]) => [b(n2(a1, a0) < n2(b1, b0))],
  },
  {
    id: '2-15', book: 2, kind: '연습', title: 'A가 B 이상인가',
    text: 'A1A0 ≥ B1B0이면 1. 방금 것의 반대예요.',
    hints: ['2-14의 반대.', '2-14에서 마지막 NOT만 빼요 — 맨 위 올림이 그대로 답.'],
    sol: 'na=NOT(A0); c=NAND(na,B0); nb=NOT(B1); f=FA(A1,nb,c); @0=f.1',
    ins: ['A1', 'A0', 'B1', 'B0'], outs: OUT, par: 12, fn: ([a1, a0, b1, b0]) => [b(n2(a1, a0) >= n2(b1, b0))],
  },
  {
    id: '2-16', book: 2, kind: '개념', title: '연산 고르기',
    text: 'op가 0이면 A AND B, 1이면 A OR B. ALU는 「다 계산해 두고 고르기」예요.',
    hints: ['둘 다 만들어 두고 선택기로.', 'MUX의 0 점 ← AND, 1 점 ← OR, s 점 ← op.'],
    sol: 'x=AND(A,B); o=OR(A,B); m=MUX(x,o,op); @0=m',
    ins: ['op', 'A', 'B'], outs: OUT, par: 9, fn: ([op, a, c]) => [op ? a | c : a & c],
  },
  {
    id: '2-17', book: 2, kind: '개념', title: '1비트 ALU 칸', unlock: 'ALU',
    text: 'o1·o0으로 연산을 골라요: 00 AND · 01 OR · 10 덧셈 · 11 XOR. 올림은 늘 덧셈의 올림을 내보내요. 이 칸을 자리마다 늘어놓으면 ALU예요.',
    hints: ['넷을 다 만들고 선택기 셋으로 하나를 골라요 — o0로 둘씩, o1로 마지막.', 'MUX(AND, OR, o0) · MUX(덧셈 합, XOR, o0) · 그 둘을 MUX(…, o1). 올림은 전가산기의 c.'],
    sol: 'f=FA(A,B,Cin); x=AND(A,B); o=OR(A,B); e=XOR(A,B); m=MUX(x,o,o0); n=MUX(f,e,o0); r=MUX(m,n,o1); @0=r; @1=f.1',
    ins: ['o1', 'o0', 'A', 'B', 'Cin'], outs: ['결과', '올림'], par: 30,
    fn: ([o1, o0, a, c, d]) => alu1(o1, o0, a, c, d),
  },
  {
    id: '2-18', book: 2, kind: '개념', title: '두 자리 ALU',
    text: 'ALU 칸 둘을 이어 두 자리 ALU를. 연산 선(o1·o0)은 두 칸에 똑같이, 올림은 아래 칸에서 윗칸으로. 맨 아래 c 점은 비워 두면 0이에요.',
    hints: ['o1·o0을 두 칸 모두에. 아래 칸 A0·B0, 윗칸 A1·B1.', '아래 칸 올림(c) → 윗칸 c 점. 윗칸 올림이 C.'],
    sol: 'u=ALU(o1,o0,A0,B0); v=ALU(o1,o0,A1,B1,u.1); @0=v.1; @1=v; @2=u',
    ins: ['o1', 'o0', 'A1', 'A0', 'B1', 'B0'], outs: ['C', 'R1', 'R0'], par: 60,
    fn: ([o1, o0, a1, a0, b1, b0]) => { const [r0, c0] = alu1(o1, o0, a0, b0, 0); const [r1, c1] = alu1(o1, o0, a1, b1, c0); return [c1, r1, r0]; },
  },
  {
    id: '2-19', book: 2, kind: '연습', title: 'ALU에 0 깃발',
    text: '두 자리 ALU에 「결과가 0인가」 깃발을 달아요. 4부 CPU가 점프할지 정할 때 이 깃발을 봐요.',
    hints: ['2-18 그대로에 2-13의 생각을 한 번 더.', 'NOR(R1, R0)이 0 깃발.'],
    sol: 'u=ALU(o1,o0,A0,B0); v=ALU(o1,o0,A1,B1,u.1); z=NOR(v,u); @0=v; @1=u; @2=z',
    ins: ['o1', 'o0', 'A1', 'A0', 'B1', 'B0'], outs: ['R1', 'R0', '0인가'], par: 64,
    fn: ([o1, o0, a1, a0, b1, b0]) => { const [r0, c0] = alu1(o1, o0, a0, b0, 0); const [r1] = alu1(o1, o0, a1, b1, c0); return [r1, r0, b(!r1 && !r0)]; },
  },
  {
    id: '2-20', book: 2, kind: '시험', title: '2부 시험', pool: ['2-6', '2-7', '2-10', '2-12', '2-14', '2-16'], rounds: 4,
    text: '2부에서 만든 회로 중 하나를 매번 뽑아요. 네 번 연달아. 넘기면 3부(기억)로 가요.',
  },
  // ---------- 3부 기억 ----------
  {
    id: '3-1', book: 3, kind: '개념', title: 'SR 래치',
    text: '출력을 앞으로 되돌려 이으면(고리) 회로가 기억해요. S를 잠깐 1로 하면 Q=1, S를 0으로 돌려도 Q는 1로 남아요. R은 0으로 되돌려요(S와 R을 같이 1로 하진 않아요). 아래 표는 시간 순서예요 — 줄을 누르면 그 순간까지 돌려 봐요.',
    hints: ['NOR 둘을 서로의 입력으로 엇갈려 이어요.', 'Q = NOR(R, P), P = NOR(S, Q) — P는 Q의 반대 쪽이라 출력엔 안 이어도 돼요.'],
    sol: 'q=NOR(R,p); p=NOR(S,q); @0=q',
    ins: ['S', 'R'], outs: ['Q'], par: 8,
    steps: ['00', '10', '00', '01', '00', '10', '00'],
    model: (st, [S, R]) => { if (S) st.q = 1; if (R) st.q = 0; return [st.q]; },
  },
  {
    id: '3-2', book: 3, kind: '연습', title: 'SR 래치, NAND만으로', only: ['NAND'],
    text: '같은 래치를 NAND로. NAND 고리는 「0을 넣으면 켜지는」 거꾸로라 입력을 한 번씩 뒤집어요.',
    hints: ['NOT은 NAND(x,x). S·R을 먼저 뒤집어요.', 'Q = NAND(NOT S, P), P = NAND(NOT R, Q).'],
    sol: 'a=NAND(S,S); b=NAND(R,R); q=NAND(a,p); p=NAND(b,q); @0=q',
    ins: ['S', 'R'], outs: ['Q'], par: 4,
    steps: ['00', '10', '00', '01', '00', '10', '00'],
    model: (st, [S, R]) => { if (S) st.q = 1; if (R) st.q = 0; return [st.q]; },
  },
  {
    id: '3-3', book: 3, kind: '개념', title: 'D 래치', unlock: 'LATCH',
    text: 'st(저장)가 1인 동안 Q는 d를 따라가고, st가 0이 되면 마지막 d를 붙들어요. 상자로 쓰면 LATCH예요.',
    hints: ['SR 래치의 S = d AND st, R = NOT d AND st 로도 되고…', '더 짧게: 선택기 출력을 그 0 점으로 되돌려 이으면, st=0일 때 자기 값을 계속 골라요 — MUX 하나.'],
    sol: 'q=MUX(q,d,st); @0=q',
    ins: ['d', 'st'], outs: ['Q'], par: 4,
    steps: ['11', '10', '00', '01', '10', '11', '00'],
    model: (st, [d, s]) => { if (s) st.q = d; return [st.q]; },
  },
  {
    id: '3-4', book: 3, kind: '연습', title: 'D 래치, NAND 넷', only: ['NAND'],
    text: 'D 래치를 NAND 넷으로. 진짜 칩 속 래치에 가까운 모양이에요.',
    hints: ['NAND 래치(3-2) 두 입력을 「d와 st로 거른 것」으로 바꿔요.', 'n = NAND(d, st), m = NAND(n, st). 그다음 Q = NAND(n, P), P = NAND(m, Q).'],
    sol: 'n=NAND(d,st); m=NAND(n,st); q=NAND(n,p); p=NAND(m,q); @0=q',
    ins: ['d', 'st'], outs: ['Q'], par: 4,
    steps: ['11', '10', '00', '01', '10', '11', '00'],
    model: (st, [d, s]) => { if (s) st.q = d; return [st.q]; },
  },
  {
    id: '3-5', book: 3, kind: '개념', title: 'D 플립플롭', unlock: 'DFF',
    text: 'clk가 0→1로 바뀌는 순간의 d만 기억해요. 그 사이 d가 흔들려도 Q는 안 바뀌어요 — 컴퓨터 전체가 이 박자(클록)에 맞춰 움직여요. 상자로 쓰면 DFF예요.',
    hints: ['래치 둘을 줄줄이: 앞 래치는 clk=0일 때 열리고, 뒤 래치는 clk=1일 때 열려요.', '앞 = LATCH(d, NOT clk), 뒤 = LATCH(앞, clk).'],
    sol: 'n=NOT(clk); m=LATCH(d,n); q=LATCH(m,clk); @0=q',
    ins: ['d', 'clk'], outs: ['Q'], par: 9,
    steps: ['10', '11', '01', '00', '01', '10', '00', '01', '10', '11'],
    model: clocked(1, (st, [d]) => { st.q = d; }, (st) => [st.q]),
  },
  {
    id: '3-6', book: 3, kind: '연습', title: '플립플롭, NAND 아홉', only: ['NAND'],
    text: 'D 플립플롭을 NAND만으로. 3-4 래치 둘과 NOT 하나 — 아홉 개예요.',
    hints: ['NOT clk = NAND(clk, clk). 앞 래치는 st 자리에 NOT clk, 뒤 래치는 clk.', '앞: a=NAND(d, NOT clk), b=NAND(a, NOT clk), m=NAND(a, m2), m2=NAND(b, m). 뒤도 같은 모양으로 m과 clk.'],
    sol: 'n=NAND(clk,clk); a=NAND(d,n); b=NAND(a,n); m=NAND(a,mb); mb=NAND(b,m); c=NAND(m,clk); e=NAND(c,clk); q=NAND(c,qb); qb=NAND(e,q); @0=q',
    ins: ['d', 'clk'], outs: ['Q'], par: 9,
    steps: ['10', '11', '01', '00', '01', '10', '00', '01', '10', '11'],
    model: clocked(1, (st, [d]) => { st.q = d; }, (st) => [st.q]),
  },
  {
    id: '3-7', book: 3, kind: '개념', title: '1비트 레지스터', unlock: 'BIT',
    text: 'st가 1인 박자에만 d를 받아 넣고, st가 0이면 그대로 지켜요. 레지스터 한 칸이에요. 상자로 쓰면 BIT예요.',
    hints: ['박자마다 DFF가 무언가를 받아요 — st=0이면 「지금 내 값」을 다시 받게 하면 돼요.', 'DFF(MUX(Q, d, st), clk). MUX의 0 점에 Q를 되돌려 이어요.'],
    sol: 'm=MUX(q,d,st); q=DFF(m,clk); @0=q',
    ins: ['d', 'st', 'clk'], outs: ['Q'], par: 13,
    steps: tick('11', '00', '01', '10', '11'),
    model: clocked(2, (st, [d, s]) => { if (s) st.q = d; }, (st) => [st.q]),
  },
  {
    id: '3-8', book: 3, kind: '개념', title: '뒤집개',
    text: '박자마다 Q가 0, 1, 0, 1… 로 뒤집혀요. 전원을 켜면 상자 속은 모두 0에서 시작해요.',
    hints: ['DFF에 「내 값의 반대」를 넣어요.', 'DFF(NOT Q, clk).'],
    sol: 'n=NOT(q); q=DFF(n,clk); @0=q',
    ins: ['clk'], outs: ['Q'], par: 10,
    steps: ['0', '1', '0', '1', '0', '1', '0', '1'],
    model: clocked(0, (st) => { st.q = 1 - (st.q | 0); }, (st) => [st.q | 0]),
  },
  {
    id: '3-9', book: 3, kind: '개념', title: '두 자리 카운터',
    text: '박자마다 Q1Q0이 0, 1, 2, 3, 0… 으로 세요. 2-6 「하나 더하기」를 레지스터에 되먹이는 거예요. 4부 CPU의 「다음 명령어 번호(PC)」가 이것.',
    hints: ['아래 자리는 3-8 뒤집개. 윗자리는 「아래 자리가 1일 때 뒤집기」.', 'Q0 = DFF(NOT Q0), Q1 = DFF(Q1 XOR Q0).'],
    sol: 'n=NOT(a); a=DFF(n,clk); x=XOR(b,a); b=DFF(x,clk); @0=b; @1=a',
    ins: ['clk'], outs: ['Q1', 'Q0'], par: 23,
    steps: ['0', '1', '0', '1', '0', '1', '0', '1', '0', '1'],
    model: clocked(0, (st) => { st.v = ((st.v | 0) + 1) & 3; }, (st) => bitsN(st.v | 0, 2)),
  },
  {
    id: '3-10', book: 3, kind: '연습', title: '카운터 멈춤',
    text: 'en이 1인 박자에만 세요. 0이면 그 자리에 멈춰요.',
    hints: ['DFF 대신 BIT를 쓰면 st 점이 「이번 박자에 받을까」예요.', 'Q0 = BIT(NOT Q0, en, clk), Q1 = BIT(Q1 XOR Q0, en, clk).'],
    sol: 'n=NOT(a); a=BIT(n,en,clk); x=XOR(b,a); b=BIT(x,en,clk); @0=b; @1=a',
    ins: ['en', 'clk'], outs: ['Q1', 'Q0'], par: 31,
    steps: tick('1', '1', '0', '0', '1', '1'),
    model: clocked(1, (st, [en]) => { if (en) st.v = ((st.v | 0) + 1) & 3; }, (st) => bitsN(st.v | 0, 2)),
  },
  {
    id: '3-11', book: 3, kind: '연습', title: '카운터 리셋',
    text: 'rst가 1인 박자엔 0으로 돌아가고, 아니면 하나씩 세요.',
    hints: ['다음 값 = rst이면 0, 아니면 하나 더한 값 — 「AND NOT rst」로 거르면 돼요.', 'Q0 ← NOR(Q0, rst), Q1 ← AND(Q1 XOR Q0, NOT rst).'],
    sol: 'z=NOR(a,rst); a=DFF(z,clk); x=XOR(b,a); r=NOT(rst); y=AND(x,r); b=DFF(y,clk); @0=b; @1=a',
    ins: ['rst', 'clk'], outs: ['Q1', 'Q0'], par: 29,
    steps: tick('0', '0', '1', '0', '0', '0', '0'),
    model: clocked(1, (st, [r]) => { st.v = r ? 0 : ((st.v | 0) + 1) & 3; }, (st) => bitsN(st.v | 0, 2)),
  },
  {
    id: '3-12', book: 3, kind: '개념', title: '두 자리 레지스터',
    text: 'st=1인 박자에 D1D0 두 자리를 한꺼번에 받아 넣어요. 16비트 레지스터는 이 칸이 16개.',
    hints: ['BIT 둘. st와 clk는 둘에 똑같이.', 'Q1 = BIT(D1, st, clk), Q0 = BIT(D0, st, clk).'],
    sol: 'a=BIT(D1,st,clk); b=BIT(D0,st,clk); @0=a; @1=b',
    ins: ['D1', 'D0', 'st', 'clk'], outs: ['Q1', 'Q0'], par: 26,
    steps: tick('101', '010', '011', '110', '000'),
    model: clocked(3, (st, [d1, d0, s]) => { if (s) st.q = [d1, d0]; }, (st) => st.q || [null, null]),
  },
  {
    id: '3-13', book: 3, kind: '개념', title: '기억 두 칸',
    text: '주소 a로 칸을 골라요. st=1인 박자엔 고른 칸에 d를 쓰고, 출력은 늘 고른 칸을 읽어요. RAM의 가장 작은 모양이에요.',
    hints: ['BIT 두 칸. 「쓰기」 신호 st를 주소에 따라 한 칸으로만 보내요(분배기), 읽기는 선택기.', 'DEMUX(st, a) → 두 BIT의 st 점. MUX(칸0, 칸1, a) → 출력.'],
    sol: 'w=DEMUX(st,a); c=BIT(d,w,clk); e=BIT(d,w.1,clk); o=MUX(c,e,a); @0=o',
    ins: ['a', 'd', 'st', 'clk'], outs: ['출력'], par: 35,
    steps: [...tick('011', '101'), '0000', '1000', ...tick('111'), '0000', ...tick('001'), '1000', '0000'],
    model: clocked(3, (st, [a, d, s]) => { st.m = st.m || [null, null]; if (s) st.m[a] = d; }, (st, [a]) => [(st.m || [null, null])[a]]),
  },
  {
    id: '3-14', book: 3, kind: '연습', title: '기억 네 칸',
    text: '주소 두 자리(a1a0)로 네 칸. 쓰고 나서 차례로 읽어 봐요.',
    hints: ['분배기·선택기를 두 층으로. 먼저 a1로 반을 고르고, 그 안에서 a0.', '쓰기: DEMUX(st,a1) → 두 DEMUX(…,a0) → BIT 넷. 읽기: MUX(칸0,칸1,a0)·MUX(칸2,칸3,a0) → MUX(…,a1).'],
    sol: 'w=DEMUX(st,a1); x=DEMUX(w,a0); y=DEMUX(w.1,a0); c0=BIT(d,x,clk); c1=BIT(d,x.1,clk); c2=BIT(d,y,clk); c3=BIT(d,y.1,clk); m=MUX(c0,c1,a0); n=MUX(c2,c3,a0); o=MUX(m,n,a1); @0=o',
    ins: ['a1', 'a0', 'd', 'st', 'clk'], outs: ['출력'], par: 79,
    steps: [...tick('1011', '0111', '1101', '0001'), '00000', '01000', '10000', '11000', ...tick('0011'), '01000', '00000'],
    model: clocked(4, (st, [a1, a0, d, s]) => { st.m = st.m || [null, null, null, null]; if (s) st.m[n2(a1, a0)] = d; }, (st, [a1, a0]) => [(st.m || [null, null, null, null])[n2(a1, a0)]]),
  },
  {
    id: '3-15', book: 3, kind: '개념', title: '누산기',
    text: 'st=1인 박자마다 D1D0을 쌓아 더해요(두 자리라 넘치면 돌아요). 2부 덧셈 + 3부 레지스터 — 4부 CPU의 심장이에요.',
    hints: ['레지스터 값과 D를 더해서 다시 레지스터로.', '합0 = HA(Q0, D0), 합1 = Q1 XOR D1 XOR (HA 올림). 둘을 BIT(…, st, clk)로, BIT 출력을 덧셈 입력으로 되돌려요.'],
    sol: 'h=HA(r,D0); x=XOR(t,D1); y=XOR(x,h.1); r=BIT(h,st,clk); t=BIT(y,st,clk); @0=t; @1=r',
    ins: ['D1', 'D0', 'st', 'clk'], outs: ['Q1', 'Q0'], par: 39,
    steps: tick('011', '101', '110', '111', '011'),
    model: clocked(3, (st, [d1, d0, s]) => { if (s) st.v = ((st.v | 0) + n2(d1, d0)) & 3; }, (st) => bitsN(st.v | 0, 2)),
  },
  {
    id: '3-16', book: 3, kind: '시험', title: '3부 시험', pool: ['3-3', '3-5', '3-7', '3-9', '3-11', '3-13'], rounds: 4,
    text: '3부에서 만든 기억 회로 중 하나를 매번 뽑아요. 네 번 연달아. 넘기면 4부(CPU)로 가요.',
  },
  // ---------- 4부 CPU ----------
  {
    id: '4-1', book: 4, kind: '개념', title: '명령어 가르기',
    text: '이 CPU의 명령어는 네 자리예요. 앞 두 자리(op1op0)가 무엇을 할지 — 00 LDI(A에 수 넣기) · 01 ADD(A에 수 더하기) · 10 JMP(그 줄로 가기) · 11 JZ(A가 0이면 그 줄로). 넷 중 지금 명령어 하나에만 불을 켜요.',
    hints: ['줄마다 「op1이 이렇고 op0이 이렇다」를 AND로.', 'NOT op1·NOT op0 둘을 만들고 AND 넷: LDI = AND(NOT op1, NOT op0), ADD = AND(NOT op1, op0), JMP = AND(op1, NOT op0), JZ = AND(op1,op0).'],
    sol: 'a=NOT(op1); c=NOT(op0); w=AND(a,c); x=AND(a,op0); y=AND(op1,c); z=AND(op1,op0); @0=w; @1=x; @2=y; @3=z',
    ins: ['op1', 'op0'], outs: ['LDI', 'ADD', 'JMP', 'JZ'], par: 10,
    fn: ([o1, o0]) => [b(!o1 && !o0), b(!o1 && o0), b(o1 && !o0), b(o1 && o0)],
  },
  {
    id: '4-2', book: 4, kind: '개념', title: '제어 신호', unlock: 'CTRL',
    text: '명령어를 「회로가 할 일」로 바꿔요. wa = A에 쓸까(LDI·ADD), add = 더할까(ADD), j = 점프할까(JMP는 늘, JZ는 Z=1일 때). Z는 「A가 0인가」 깃발(2-13)이에요. 상자로 쓰면 CTRL.',
    hints: ['wa는 op1만 보면 돼요. add는 「ADD 줄」 하나. j는 op1이 1이고 (JMP이거나 Z).', 'wa = NOT op1, add = AND(NOT op1, op0), j = AND(op1, NAND(op0, NOT Z)).'],
    sol: 'n=NOT(op1); d=AND(n,op0); nz=NOT(Z); k=NAND(op0,nz); j=AND(op1,k); @0=n; @1=d; @2=j',
    ins: ['op1', 'op0', 'Z'], outs: ['wa', 'add', 'j'], par: 7,
    fn: ([o1, o0, z]) => [b(!o1), b(!o1 && o0), b(o1 && (!o0 || z))],
  },
  {
    id: '4-3', book: 4, kind: '개념', title: '프로그램 카운터', unlock: 'PC',
    text: 'PC는 「지금 몇 번 줄인가」. 박자마다 하나씩 늘고(3-9 카운터), J=1인 박자엔 T1T0 줄로 뛰어요. 상자로 쓰면 PC.',
    hints: ['다음 값을 둘 중에서 골라요 — 하나 더한 값, 아니면 T. 고르는 건 J.', '자리마다 MUX(하나 더한 자리, T 자리, J) → DFF. 하나 더하기는 NOT P0 · XOR(P1, P0).'],
    sol: 'n=NOT(a); x=XOR(c,a); m=MUX(n,T0,J); k=MUX(x,T1,J); a=DFF(m,clk); c=DFF(k,clk); @0=c; @1=a',
    ins: ['J', 'T1', 'T0', 'clk'], outs: ['P1', 'P0'], par: 31,
    steps: tick('000', '000', '111', '000', '010', '110', '000'),
    model: clocked(3, (st, [j, t1, t0]) => { st.v = j ? n2(t1, t0) : ((st.v | 0) + 1) & 3; }, (st) => bitsN(st.v | 0, 2)),
  },
  {
    id: '4-4', book: 4, kind: '연습', title: 'PC 리셋',
    text: 'rst=1인 박자엔 0번 줄로 돌아가요(J보다 먼저). 전원 단추가 하는 일이에요.',
    hints: ['4-3의 다음 값을 「AND NOT rst」로 한 번 더 걸러요(3-11처럼).', '자리마다 AND(MUX(…, J), NOT rst) → DFF.'],
    sol: 'n=NOT(a); x=XOR(c,a); m=MUX(n,T0,J); k=MUX(x,T1,J); r=NOT(rst); y=AND(m,r); z=AND(k,r); a=DFF(y,clk); c=DFF(z,clk); @0=c; @1=a',
    ins: ['rst', 'J', 'T1', 'T0', 'clk'], outs: ['P1', 'P0'], par: 36,
    steps: tick('0000', '0000', '1000', '0000', '0111', '1111', '0000'),
    model: clocked(4, (st, [r, j, t1, t0]) => { st.v = r ? 0 : j ? n2(t1, t0) : ((st.v | 0) + 1) & 3; }, (st) => bitsN(st.v | 0, 2)),
  },
  {
    id: '4-5', book: 4, kind: '개념', title: '데이터 길', unlock: 'DATA',
    text: 'A 레지스터와 덧셈기. wa=1인 박자에 A가 바뀌어요 — add=0이면 I(수) 그대로, add=1이면 A+I. Z는 「A가 0인가」. 3-15 누산기에 선택기 하나를 더한 거예요. 상자로 쓰면 DATA.',
    hints: ['3-15처럼 A+I를 만들고, I 그대로와 둘 중 하나를 add로 골라 BIT(…, wa, clk)에.', '자리마다 MUX(I, A+I, add) → BIT. Z = NOR(A1, A0).'],
    sol: 'h=HA(r,I0); x=XOR(t,I1); y=XOR(x,h.1); m=MUX(I0,h,add); k=MUX(I1,y,add); r=BIT(m,wa,clk); t=BIT(k,wa,clk); z=NOR(t,r); @0=t; @1=r; @2=z',
    ins: ['add', 'wa', 'I1', 'I0', 'clk'], outs: ['A1', 'A0', 'Z'], par: 51,
    steps: tick('0110', '1101', '1010', '1101', '0111', '0100'),
    model: clocked(4, (st, [ad, wa, i1, i0]) => { if (wa) st.v = ad ? ((st.v | 0) + n2(i1, i0)) & 3 : n2(i1, i0); }, (st) => [...bitsN(st.v | 0, 2), b(!(st.v | 0))]),
  },
  {
    id: '4-6', book: 4, kind: '개념', title: '작은 컴퓨터',
    text: '상자 셋(CTRL·DATA·PC)을 이어 CPU를 완성해요. 명령어 네 자리는 표가 박자마다 넣어 줘요(PC가 가리키는 줄 — 원래는 ROM 자리). 프로그램: 0 ADD 1 · 1 JZ 3 · 2 JMP 0 · 3 LDI 1. 출력은 PC와 A.',
    hints: ['CTRL은 명령어 앞 두 자리와 Z를 받아 wa·add·j를 내요. DATA는 add·wa와 수 I를, PC는 j와 수 I(점프할 줄)를 받아요.', 'CTRL(op1, op0, DATA의 z) · DATA(add, wa, I1, I0, clk) · PC(j, I1, I0, clk). 출력은 PC의 p1·p0, DATA의 a1·a0.'],
    sol: 'c=CTRL(op1,op0,d.2); d=DATA(c.1,c,I1,I0,clk); p=PC(c.2,I1,I0,clk); @0=p; @1=p.1; @2=d; @3=d.1',
    ins: ['op1', 'op0', 'I1', 'I0', 'clk'], outs: ['P1', 'P0', 'A1', 'A0'], par: 89,
    steps: cpuSteps([[1, 1], [3, 3], [2, 0], [0, 1]], 14),
    model: cpuModel(),
  },
  {
    id: '4-7', book: 4, kind: '연습', title: '다른 프로그램',
    text: '같은 CPU에 다른 프로그램: 0 LDI 3 · 1 ADD 3 · 2 JZ 0 · 3 JMP 1. 회로는 그대로 — 프로그램만 바꾸면 하는 일이 바뀌어요. 이게 「컴퓨터」예요.',
    hints: ['4-6과 같은 판이에요.', 'CTRL · DATA · PC 셋, 4-6과 같은 선.'],
    sol: 'c=CTRL(op1,op0,d.2); d=DATA(c.1,c,I1,I0,clk); p=PC(c.2,I1,I0,clk); @0=p; @1=p.1; @2=d; @3=d.1',
    ins: ['op1', 'op0', 'I1', 'I0', 'clk'], outs: ['P1', 'P0', 'A1', 'A0'], par: 89,
    steps: cpuSteps([[0, 3], [1, 3], [3, 0], [2, 1]], 12),
    model: cpuModel(),
  },
  // 여기부터 어셈블리 — 줄을 탭으로 쌓는다. 별 두 개 = 줄 수(par) 이하
  {
    id: '4-8', book: 4, kind: '개념', title: '첫 프로그램',
    text: '이제 회로 대신 프로그램을 짜요. 4-6 CPU를 8비트로 넓히고 기억(16칸)과 명령어를 더한 작은 컴퓨터예요(단순화). 줄마다 오른쪽 숫자가 기계어 — 앞 자리가 명령, 뒤 자리가 수. 5를 내보내 봐요.',
    hints: ['A에 5를 넣고 내보내고 멈춰요.', 'LDI 5 · OUT · HLT.'],
    asm: { ops: ['LDI', 'OUT', 'HLT'], tests: [{ out: [5] }] },
    sol: 'LDI 5; OUT; HLT', par: 3,
  },
  {
    id: '4-9', book: 4, kind: '개념', title: '기억에서 읽기',
    text: '기억[0]과 기억[1]에 수가 들어 있어요. 둘을 더해 내보내요. 8비트라 255를 넘으면 0부터 다시 돌아요.',
    hints: ['A로 하나를 읽고(LD), 다른 하나를 더해요(ADD).', 'LD 0 · ADD 1 · OUT · HLT.'],
    asm: { ops: ['LDI', 'LD', 'ADD', 'OUT', 'HLT'], tests: [{ ram: { 0: 3, 1: 4 }, out: [7] }, { ram: { 0: 10, 1: 20 }, out: [30] }, { ram: { 0: 200, 1: 100 }, out: [44] }] },
    sol: 'LD 0; ADD 1; OUT; HLT', par: 4,
  },
  {
    id: '4-10', book: 4, kind: '연습', title: '세 수 더하기',
    text: '기억[0]·[1]·[2]를 모두 더해 내보내요.',
    hints: ['ADD를 한 번 더.', 'LD 0 · ADD 1 · ADD 2 · OUT · HLT.'],
    asm: { ops: ['LDI', 'LD', 'ADD', 'OUT', 'HLT'], tests: [{ ram: { 0: 1, 1: 2, 2: 3 }, out: [6] }, { ram: { 0: 50, 1: 0, 2: 9 }, out: [59] }] },
    sol: 'LD 0; ADD 1; ADD 2; OUT; HLT', par: 5,
  },
  {
    id: '4-11', book: 4, kind: '개념', title: '기억에 쓰기',
    text: '기억[0] + 기억[1]을 내보내지 말고 기억[3]에 써 두세요. 계산 결과를 다음에 쓰려고 담아 두는 거예요.',
    hints: ['OUT 대신 ST.', 'LD 0 · ADD 1 · ST 3 · HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'OUT', 'HLT'], tests: [{ ram: { 0: 3, 1: 4 }, mem: { 3: 7 } }, { ram: { 0: 9, 1: 9 }, mem: { 3: 18 } }] },
    sol: 'LD 0; ADD 1; ST 3; HLT', par: 4,
  },
  {
    id: '4-12', book: 4, kind: '개념', title: '빼기',
    text: '기억[0] − 기억[1]을 내보내요. 작은 수에서 큰 수를 빼면 2-10의 2의 보수로 돌아요(4 − 9 = 251, 8비트의 −5).',
    hints: ['ADD 자리에 SUB.', 'LD 0 · SUB 1 · OUT · HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'OUT', 'HLT'], tests: [{ ram: { 0: 9, 1: 4 }, out: [5] }, { ram: { 0: 4, 1: 9 }, out: [251] }] },
    sol: 'LD 0; SUB 1; OUT; HLT', par: 4,
  },
  {
    id: '4-13', book: 4, kind: '연습', title: '두 배',
    text: '기억[0]의 두 배를 내보내요. 곱하기 명령은 없어요.',
    hints: ['자기 자신을 더하면.', 'LD 0 · ADD 0 · OUT · HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'OUT', 'HLT'], tests: [{ ram: { 0: 6 }, out: [12] }, { ram: { 0: 100 }, out: [200] }] },
    sol: 'LD 0; ADD 0; OUT; HLT', par: 4,
  },
  {
    id: '4-14', book: 4, kind: '개념', title: '되풀이',
    text: '기억[0]의 n부터 1까지 하나씩 내보내요(n=3이면 3, 2, 1). 기억[15]엔 늘 1이 들어 있어요. JMP로 위로 돌아가고, JZ로 빠져나와요.',
    hints: ['「0이면 끝, 아니면 내보내고 1 빼고 다시」. 뺀 값은 기억[0]에 다시 써 둬요.', '0 LD 0 · 1 JZ 6 · 2 OUT · 3 SUB 15 · 4 ST 0 · 5 JMP 1 · 6 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'OUT', 'HLT'], ram: { 15: 1 }, tests: [{ ram: { 0: 3 }, out: [3, 2, 1] }, { ram: { 0: 1 }, out: [1] }, { ram: { 0: 0 }, out: [] }, { ram: { 0: 5 }, out: [5, 4, 3, 2, 1] }] },
    sol: 'LD 0; JZ 6; OUT; SUB 15; ST 0; JMP 1; HLT', par: 7,
  },
  {
    id: '4-15', book: 4, kind: '연습', title: '1부터 n까지 합',
    text: '1 + 2 + … + n을 내보내요(n은 기억[0], 기억[15]=1). 합은 빈 칸(예: 기억[1])에 쌓아요 — 빈 칸은 처음에 0이에요.',
    hints: ['4-14 되풀이 안에서 「합 = 합 + n」을 한 번씩.', '0 LD 0 · 1 JZ 8 · 2 ADD 1 · 3 ST 1 · 4 LD 0 · 5 SUB 15 · 6 ST 0 · 7 JMP 1 · 8 LD 1 · 9 OUT · 10 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'OUT', 'HLT'], ram: { 15: 1 }, tests: [{ ram: { 0: 4 }, out: [10] }, { ram: { 0: 1 }, out: [1] }, { ram: { 0: 0 }, out: [0] }, { ram: { 0: 10 }, out: [55] }] },
    sol: 'LD 0; JZ 8; ADD 1; ST 1; LD 0; SUB 15; ST 0; JMP 1; LD 1; OUT; HLT', par: 11,
  },
  {
    id: '4-16', book: 4, kind: '개념', title: '곱하기',
    text: '기억[0] × 기억[1]을 내보내요. 곱하기는 「여러 번 더하기」 — 기억[1]을 세는 칸으로 써요(기억[15]=1).',
    hints: ['기억[1]이 0이 될 때까지: 합(기억[2])에 기억[0]을 더하고, 기억[1]에서 1을 빼요.', '0 LD 1 · 1 JZ 8 · 2 SUB 15 · 3 ST 1 · 4 LD 2 · 5 ADD 0 · 6 ST 2 · 7 JMP 0 · 8 LD 2 · 9 OUT · 10 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'OUT', 'HLT'], ram: { 15: 1 }, tests: [{ ram: { 0: 3, 1: 4 }, out: [12] }, { ram: { 0: 5, 1: 0 }, out: [0] }, { ram: { 0: 0, 1: 7 }, out: [0] }, { ram: { 0: 7, 1: 9 }, out: [63] }] },
    sol: 'LD 1; JZ 8; SUB 15; ST 1; LD 2; ADD 0; ST 2; JMP 0; LD 2; OUT; HLT', par: 11,
  },
  {
    id: '4-17', book: 4, kind: '연습', title: '같은가',
    text: '기억[0]과 기억[1]이 같으면 1, 다르면 0을 내보내요.',
    hints: ['빼서 0이면 같아요.', '0 LD 0 · 1 SUB 1 · 2 JZ 5 · 3 LDI 0 · 4 JMP 6 · 5 LDI 1 · 6 OUT · 7 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'OUT', 'HLT'], tests: [{ ram: { 0: 3, 1: 3 }, out: [1] }, { ram: { 0: 3, 1: 4 }, out: [0] }, { ram: { 0: 0, 1: 0 }, out: [1] }, { ram: { 0: 200, 1: 100 }, out: [0] }] },
    sol: 'LD 0; SUB 1; JZ 5; LDI 0; JMP 6; LDI 1; OUT; HLT', par: 8,
  },
  {
    id: '4-18', book: 4, kind: '개념', title: '음수면 점프',
    text: 'JN은 A의 맨 윗자리가 1(2의 보수로 음수)이면 뛰어요. 기억[0]과 기억[1] 중 큰 쪽을 내보내요(둘 다 128보다 작아요).',
    hints: ['기억[0] − 기억[1]이 음수면 기억[1]이 커요.', '0 LD 0 · 1 SUB 1 · 2 JN 5 · 3 LD 0 · 4 JMP 6 · 5 LD 1 · 6 OUT · 7 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'JN', 'OUT', 'HLT'], tests: [{ ram: { 0: 3, 1: 7 }, out: [7] }, { ram: { 0: 9, 1: 2 }, out: [9] }, { ram: { 0: 5, 1: 5 }, out: [5] }, { ram: { 0: 100, 1: 27 }, out: [100] }] },
    sol: 'LD 0; SUB 1; JN 5; LD 0; JMP 6; LD 1; OUT; HLT', par: 8,
  },
  {
    id: '4-19', book: 4, kind: '연습', title: '나누기',
    text: '기억[0] ÷ 기억[1]의 몫을 내보내요(기억[1]은 0이 아니고, 둘 다 128보다 작아요, 기억[15]=1). 나누기는 「몇 번 뺄 수 있나」.',
    hints: ['빼서 음수가 되기 전까지 빼고, 뺄 때마다 몫(기억[2])에 1을 더해요.', '0 LD 0 · 1 SUB 1 · 2 JN 8 · 3 ST 0 · 4 LD 2 · 5 ADD 15 · 6 ST 2 · 7 JMP 0 · 8 LD 2 · 9 OUT · 10 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'JN', 'OUT', 'HLT'], ram: { 15: 1 }, tests: [{ ram: { 0: 7, 1: 2 }, out: [3] }, { ram: { 0: 6, 1: 3 }, out: [2] }, { ram: { 0: 1, 1: 5 }, out: [0] }, { ram: { 0: 100, 1: 7 }, out: [14] }] },
    sol: 'LD 0; SUB 1; JN 8; ST 0; LD 2; ADD 15; ST 2; JMP 0; LD 2; OUT; HLT', par: 11,
  },
  {
    id: '4-20', book: 4, kind: '연습', title: '피보나치',
    text: '1, 1, 2, 3, 5, 8… 을 n개(기억[0]) 내보내요. 기억[1]=0과 기억[2]=1에서 시작하고, 기억[15]=1. 칸 하나를 잠깐 담아 두는 데 써요.',
    hints: ['되풀이마다: 기억[2]를 내보내고, 다음 수 = 기억[1] + 기억[2]를 기억[3]에 담은 뒤 한 칸씩 밀어요.', '0 LD 0 · 1 JZ 13 · 2 SUB 15 · 3 ST 0 · 4 LD 2 · 5 OUT · 6 ADD 1 · 7 ST 3 · 8 LD 2 · 9 ST 1 · 10 LD 3 · 11 ST 2 · 12 JMP 0 · 13 HLT.'],
    asm: { ops: ['LDI', 'LD', 'ST', 'ADD', 'SUB', 'JMP', 'JZ', 'JN', 'OUT', 'HLT'], ram: { 2: 1, 15: 1 }, tests: [{ ram: { 0: 5 }, out: [1, 1, 2, 3, 5] }, { ram: { 0: 1 }, out: [1] }, { ram: { 0: 8 }, out: [1, 1, 2, 3, 5, 8, 13, 21] }] },
    sol: 'LD 0; JZ 13; SUB 15; ST 0; LD 2; OUT; ADD 1; ST 3; LD 2; ST 1; LD 3; ST 2; JMP 0; HLT', par: 14,
  },
  {
    id: '4-21', book: 4, kind: '시험', title: '4부 시험', pool: ['4-12', '4-14', '4-16', '4-17', '4-18'], rounds: 3,
    text: '4부의 프로그램 중 하나를 매번 뽑아요. 세 번 연달아. 넘기면 5부(병렬 — GPU 쪽)로 가요.',
  },
];
