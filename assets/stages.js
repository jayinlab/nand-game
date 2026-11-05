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
// ---------- 5부 벡터: 작은 웨이브 ----------
// 단순화: 레인 4개(AMD 실제는 wave32/wave64), 레지스터 8비트(실제 32비트), v0~v3·s0~s3만.
// EXEC·VCC는 레인마다 한 자리(실제 64레인이면 s 두 개, s[0:1]에 담아요). 이름 옆 real = AMD RDNA ISA의 실제 명령.
// 인자 종류: v = v0~v3, s = s0~s3, vs = v0~v3 또는 s0~s3(0~3 = v, 4~7 = s), n = 수 0~15, k = 줄 번호
export const LANES = 4;
// 5부 화면에 늘 붙는 단순화 설명(OCL 사실 검토 11-05 반영)
export const VEC_NOTE = '이 게임은 AMD RDNA를 단순화했어요. 레인은 4개, 데이터 레지스터는 8비트(실제 데이터 연산은 32비트라, 여기선 하위 8비트만 남아요)이고 v0~v3·s0~s3만 써요. EXEC·VCC는 레인마다 한 자리인 마스크로, wave64 마스크를 보통 s 레지스터에 담을 땐 32비트 둘(s[2:3])을 써요. 실제로는 여기 나온 S_SAVEEXEC·S_XOREXEC·S_OREXEC의 대응 명령과 s_add_u32도 SCC를 바꾸지만, 게임에선 S_CMP_EQ만 SCC를 바꿔요. 두 번째 원본에 s를 쓰는 줄은 실제로는 VOP3 형식(예: v_sub_nc_u32_e64 v1, v1, s0)으로 인코딩해요. 분기는 0부터 센 줄 번호로 가요 — 실제 어셈블리는 레이블을 쓰고, 기계어엔 다음 명령 기준의 부호 있는 오프셋이 들어가요.';
export const VISA = {
  V_MOV: { args: ['v', 'vs'], real: 'v_mov_b32', desc: 'vD ← 원본 (켜진 레인만)' },
  V_MOVI: { args: ['v', 'n'], real: 'v_mov_b32 (상수)', desc: 'vD ← 수 n (켜진 레인만)' },
  V_ADD: { args: ['v', 'vs', 'vs'], real: 'v_add_nc_u32', desc: 'vD ← a + b (켜진 레인만)' },
  V_SUB: { args: ['v', 'vs', 'vs'], real: 'v_sub_nc_u32', desc: 'vD ← a − b (켜진 레인만)' },
  V_CMP_GT: { args: ['vs', 'vs'], real: 'v_cmp_gt_u32', desc: 'VCC ← 레인마다 a > b (꺼진 레인은 0)' },
  V_CMP_EQ: { args: ['vs', 'vs'], real: 'v_cmp_eq_u32', desc: 'VCC ← 레인마다 a = b (꺼진 레인은 0)' },
  V_CNDMASK: { args: ['v', 'vs', 'vs'], real: 'v_cndmask_b32', desc: 'vD ← 켜진 레인에서 VCC가 1이면 b, 0이면 a' },
  V_READFIRSTLANE: { args: ['s', 'v'], real: 'v_readfirstlane_b32', desc: 'sD ← 첫 번째 켜진 레인의 v' },
  S_MOVI: { args: ['s', 'n'], real: 's_mov_b32', desc: 'sD ← 수 n' },
  S_ADDI: { args: ['s', 'n'], real: 's_add_u32', desc: 'sD ← sD + n (실제로는 SCC에 올림도 써요 — 게임은 생략)' },
  S_CMP_EQ: { args: ['s', 's'], real: 's_cmp_eq_u32', desc: '같으면 SCC = 1, 다르면 0' },
  S_GETEXEC: { args: ['s'], real: 's_mov_b64 s[2:3], exec', desc: 'sD ← EXEC' },
  S_SAVEEXEC: { args: ['s'], real: 's_and_saveexec_b64 s[2:3], vcc', desc: 'sD ← EXEC, 그리고 EXEC ← EXEC AND VCC' },
  S_XOREXEC: { args: ['s'], real: 's_xor_b64 exec, exec, s[2:3]', desc: 'EXEC ← EXEC XOR sD' },
  S_OREXEC: { args: ['s'], real: 's_or_b64 exec, exec, s[2:3]', desc: 'EXEC ← EXEC OR sD' },
  S_BRANCH: { args: ['k'], real: 's_branch', desc: 'k번 줄로' },
  S_CBRANCH_SCC1: { args: ['k'], real: 's_cbranch_scc1', desc: 'SCC가 1이면 k번 줄로' },
  S_CBRANCH_EXECZ: { args: ['k'], real: 's_cbranch_execz', desc: 'EXEC가 0(켜진 레인 없음)이면 k번 줄로' },
  S_ENDPGM: { args: [], real: 's_endpgm', desc: '끝' },
  // 6부 메모리
  G_LOAD: { args: ['v', 'v'], real: 'global_load_dword', desc: 'vD ← 기억[vA] — 늦게 와요, S_WAITCNT로 기다려요' },
  G_STORE: { args: ['v', 'v'], real: 'global_store_dword', desc: '기억[vA] ← vS' },
  G_ATOMIC_ADD: { args: ['v', 'v'], real: 'global_atomic_add', desc: '기억[vA] += vS — 같은 칸이어도 하나도 안 잃어요' },
  S_LOAD: { args: ['s', 'n'], real: 's_load_dword', desc: 'sD ← 기억[n] — 웨이브에 한 번, 늦게 와요' },
  DS_WRITE: { args: ['v', 'v'], real: 'ds_write_b32', desc: 'LDS[vA] ← vS' },
  DS_READ: { args: ['v', 'v'], real: 'ds_read_b32', desc: 'vD ← LDS[vA] — 조금 늦게 와요' },
  DS_ADD: { args: ['v', 'v'], real: 'ds_add_u32', desc: 'LDS[vA] += vS — 같은 칸이어도 안 잃어요' },
  S_WAITCNT: { args: [], real: 's_waitcnt vmcnt(0) lgkmcnt(0)', desc: '오는 중인 읽기가 다 올 때까지 기다려요' },
  S_BARRIER: { args: [], real: 's_barrier', desc: '워크그룹의 웨이브가 모두 여기 올 때까지 기다려요' },
};
// 'V_ADD v1, s0, v1' → { op, a: [1, 4, 1] }
export const parseVec = (t) => t.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
  const [op, ...rest] = x.split(/[\s,]+/).filter(Boolean);
  return { op, a: VISA[op].args.map((k, i) => { const r = rest[i]; if (k === 'n' || k === 'k') return +r; const j = +r.slice(1); return k === 'vs' && r[0] === 's' ? 4 + j : j; }) };
});
// ---------- 6부: 작은 CU — 웨이브 1~2개, 기억 32칸, LDS 16칸, 사이클 ----------
export const MEMN = 32, LDSN = 16, LINE = 4, CACHE_LINES = 4;
export const CU_NOTE = '이 게임은 메모리를 많이 단순화했어요. 실제 dword·b32·u32 명령은 32비트 데이터 하나를 다루지만, 게임에선 8비트 한 칸으로 줄였어요(덧셈은 원자 덧셈까지 하위 8비트만 남아요). 기억은 32칸이고 주소는 칸 번호예요 — 실제 32비트 배열의 i번째 원소는 보통 「기준 바이트 주소 + 4×i」인데, 게임은 기준 주소와 ×4를 생략해요. LDS(16칸)도 같아요. 게임에선 같은 메모리 명령에서 같은 네 칸 줄을 읽는 레인들의 요청을 하나로 묶어요. 실제 coalescing도 여러 레인의 요청을 필요한 메모리 트랜잭션으로 모으지만, 캐시 줄 하나가 언제나 전송 한 번과 같지는 않아요. 캐시는 최근 네 줄만 기억하고, 먼저 요청한 줄은 뒤 읽기가 다시 써요(줄이 아직 오는 중이면 도착을 기다려요). 사이클 수(읽기 지연 10, 줄마다 8, 캐시면 4, LDS 읽기 2, 스칼라 읽기 6)는 지어낸 수예요 — 실제 캐시 계층과 지연은 훨씬 복잡해요. 게임의 S_WAITCNT는 모든 읽기를 한꺼번에 기다려요. 실제 RDNA2에선 전역 읽기는 vmcnt, 스칼라 읽기와 LDS 읽기·쓰기·원자 연산은 lgkmcnt로 기다리고, 전역 쓰기와 반환값 없는 전역 원자 연산은 따로 s_waitcnt_vscnt null, 0으로 기다려요. 게임에선 쓰기(G_STORE·DS_WRITE)와 원자 연산이 바로 끝나요. 레인 여럿이 G_STORE로 같은 칸에 쓰면 어느 레인 값이 남을지 정해져 있지 않은데, 게임에선 뒤 레인이 남아요. 게임에선 한 번에 한 웨이브의 명령을 사이클마다 하나씩 실행하고, 기다리거나 끝나면 다른 웨이브로 넘어가요 — 실제 RDNA는 여러 웨이브의 명령 발행을 섞을 수 있어요. v0에도 게임이 작업 번호(웨이브 × 4 + 레인)를 미리 넣어 줘요. 둘 다 실제 스케줄·초기 레지스터 상태를 단순화한 규칙이에요.';
const MEMOPS = new Set(['G_LOAD', 'G_STORE', 'G_ATOMIC_ADD', 'S_LOAD', 'DS_WRITE', 'DS_READ', 'DS_ADD', 'S_WAITCNT', 'S_BARRIER']);
export function cuInit(asm, x) {
  const W = asm.waves || 1;
  const waves = Array.from({ length: W }, (_, w) => {
    const m = vecInit({ ...asm, v: null }, { ...x, v: null });
    m.v[0] = m.v[0].map((_, l) => w * LANES + l); // v0 = 작업 번호(단순화)
    return Object.assign(m, { w, wait: null, pend: 0 });
  });
  const mem = Array.from({ length: MEMN }, (_, i) => (x.mem && x.mem[i]) || 0);
  return { t: 0, waves, cur: 0, mem, lds: Array(LDSN).fill(0), cache: [], memFree: 0, pending: [], halted: false, steps: 0 };
}
function cuLoadLatency(m, addrs) {
  // 캐시 = 최근 네 줄과 그 줄이 도착하는 사이클. 먼저 요청한 줄을 뒤 읽기가 다시 쓰되, 줄이 도착하기 전엔 못 끝나요
  const lines = [...new Set(addrs.map((a) => Math.floor(a / LINE)))];
  const missed = [];
  let ready = m.t + 4;
  for (const ln of lines) {
    const i = m.cache.findIndex((c) => c.ln === ln);
    if (i >= 0) { ready = Math.max(ready, m.cache[i].ready); m.cache.push(m.cache.splice(i, 1)[0]); } else missed.push(ln);
  }
  if (missed.length) {
    const start = Math.max(m.t + 10, m.memFree);
    missed.forEach((ln, k) => { m.cache.push({ ln, ready: start + 8 * (k + 1) }); }); // 기억 길은 한 줄씩 차례로
    m.memFree = start + 8 * missed.length;
    ready = Math.max(ready, m.memFree);
  }
  while (m.cache.length > CACHE_LINES) m.cache.shift();
  return ready;
}
function cuExec(prog, m, w) {
  const { op, a } = prog[w.pc];
  if (!MEMOPS.has(op)) { vecStep(prog, w); return; }
  const act = []; for (let l = 0; l < LANES; l++) if ((w.exec >> l) & 1) act.push(l);
  const addr = (l) => w.v[a[op === 'G_LOAD' || op === 'DS_READ' ? 1 : 0]][l];
  if (op === 'G_LOAD') {
    const ad = act.map((l) => addr(l) % MEMN);
    const vals = act.map((l, i) => m.mem[ad[i]]);
    m.pending.push({ w: w.w, reg: a[0], lanes: act, vals, ready: act.length ? cuLoadLatency(m, ad) : m.t + 1 }); w.pend++;
  } else if (op === 'G_STORE') for (const l of act) m.mem[addr(l) % MEMN] = w.v[a[1]][l]; // 같은 칸이면 뒤 레인이 남음(단순화)
  else if (op === 'G_ATOMIC_ADD') for (const l of act) { const i = addr(l) % MEMN; m.mem[i] = (m.mem[i] + w.v[a[1]][l]) & 255; }
  else if (op === 'S_LOAD') { m.pending.push({ w: w.w, sreg: a[0], val: m.mem[a[1] % MEMN], ready: m.t + 6 }); w.pend++; }
  else if (op === 'DS_WRITE') for (const l of act) m.lds[addr(l) % LDSN] = w.v[a[1]][l];
  else if (op === 'DS_ADD') for (const l of act) { const i = addr(l) % LDSN; m.lds[i] = (m.lds[i] + w.v[a[1]][l]) & 255; }
  else if (op === 'DS_READ') { m.pending.push({ w: w.w, reg: a[0], lanes: act, vals: act.map((l) => m.lds[addr(l) % LDSN]), ready: m.t + 2 }); w.pend++; }
  else if (op === 'S_WAITCNT') { if (w.pend) w.wait = 'cnt'; }
  else if (op === 'S_BARRIER') w.wait = 'bar';
  w.pc++; w.steps++;
}
// 한 사이클: 도착한 읽기를 넣고, 돌 수 있는 웨이브 하나가 한 줄
export function cuStep(prog, m) {
  if (m.halted) return m;
  for (const p of m.pending.filter((p) => p.ready <= m.t)) {
    const w = m.waves[p.w];
    if (p.sreg != null) w.s[p.sreg] = p.val; else p.lanes.forEach((l, i) => { w.v[p.reg][l] = p.vals[i]; });
    w.pend--;
  }
  m.pending = m.pending.filter((p) => p.ready > m.t);
  for (const w of m.waves) if (w.wait === 'cnt' && !w.pend) w.wait = null;
  const live = m.waves.filter((w) => !w.halted);
  if (live.length && live.every((w) => w.wait === 'bar')) live.forEach((w) => { w.wait = null; });
  if (!live.length && !m.pending.length) { m.halted = true; return m; }
  const W = m.waves.length;
  for (let k = 0; k < W; k++) {
    const w = m.waves[(m.cur + k) % W];
    if (w.halted || w.wait) continue;
    m.cur = w.w; // 멈출 때까지 같은 웨이브
    if (w.pc >= prog.length) w.halted = true; else cuExec(prog, m, w);
    break;
  }
  m.t++; m.steps++;
  return m;
}
export function cuRun(prog, asm, x, limit = 3000) {
  const m = cuInit(asm, x);
  while (!m.halted && m.t < limit) cuStep(prog, m);
  if (!m.halted) m.err = 'loop';
  return m;
}
export function cuOk(x, m) {
  if (m.err) return false;
  const w = x.want || {};
  for (const [i, val] of Object.entries(w.mem || {})) if (m.mem[i] !== val) return false;
  if (x.maxCycles != null && m.t > x.maxCycles) return false;
  return true;
}

export function vecInit(asm, x) {
  const v = Array.from({ length: 4 }, (_, r) => Array.from({ length: LANES }, (_, l) => (r === 0 ? l : 0))); // v0 = 레인 번호
  for (const src of [asm.v, x.v]) if (src) for (const [r, arr] of Object.entries(src)) v[r] = arr.slice();
  const sr = [0, 0, 0, 0];
  for (const src of [asm.s, x.s]) if (src) for (const [r, val] of Object.entries(src)) sr[r] = val;
  return { pc: 0, exec: x.exec ?? asm.exec ?? 15, vcc: 0, scc: 0, v, s: sr, halted: false, steps: 0 };
}
export function vecStep(prog, m) {
  if (m.halted) return m;
  if (m.pc >= prog.length) { m.halted = true; return m; }
  const { op, a } = prog[m.pc];
  const on = (l) => (m.exec >> l) & 1;
  const src = (x, l) => (x < 4 ? m.v[x][l] : m.s[x - 4]);
  const each = (fn) => { for (let l = 0; l < LANES; l++) if (on(l)) m.v[a[0]][l] = fn(l) & 255; };
  let next = m.pc + 1;
  if (op === 'S_ENDPGM') { m.halted = true; return m; }
  if (op === 'V_MOV') each((l) => src(a[1], l));
  else if (op === 'V_MOVI') each(() => a[1]);
  else if (op === 'V_ADD') each((l) => src(a[1], l) + src(a[2], l));
  else if (op === 'V_SUB') each((l) => src(a[1], l) - src(a[2], l));
  else if (op === 'V_CMP_GT' || op === 'V_CMP_EQ') {
    m.vcc = 0;
    for (let l = 0; l < LANES; l++) if (on(l) && (op === 'V_CMP_GT' ? src(a[0], l) > src(a[1], l) : src(a[0], l) === src(a[1], l))) m.vcc |= 1 << l;
  } else if (op === 'V_CNDMASK') each((l) => ((m.vcc >> l) & 1 ? src(a[2], l) : src(a[1], l)));
  else if (op === 'V_READFIRSTLANE') { let l = 0; while (l < LANES && !on(l)) l++; m.s[a[0]] = m.v[a[1]][l < LANES ? l : 0]; }
  else if (op === 'S_MOVI') m.s[a[0]] = a[1];
  else if (op === 'S_ADDI') m.s[a[0]] = (m.s[a[0]] + a[1]) & 255;
  else if (op === 'S_CMP_EQ') m.scc = m.s[a[0]] === m.s[a[1]] ? 1 : 0;
  else if (op === 'S_GETEXEC') m.s[a[0]] = m.exec;
  else if (op === 'S_SAVEEXEC') { m.s[a[0]] = m.exec; m.exec &= m.vcc; }
  else if (op === 'S_XOREXEC') m.exec = (m.exec ^ m.s[a[0]]) & 15;
  else if (op === 'S_OREXEC') m.exec = (m.exec | m.s[a[0]]) & 15;
  else if (op === 'S_BRANCH') next = a[0];
  else if (op === 'S_CBRANCH_SCC1') { if (m.scc) next = a[0]; }
  else if (op === 'S_CBRANCH_EXECZ') { if (!m.exec) next = a[0]; }
  m.pc = next;
  m.steps++;
  return m;
}
export function vecRun(prog, asm, x, limit = 2000) {
  const m = vecInit(asm, x);
  while (!m.halted && m.steps < limit) vecStep(prog, m);
  if (!m.halted) m.err = 'loop';
  return m;
}
export function vecOk(x, m) {
  if (m.err) return false;
  const w = x.want || {};
  for (const [r, arr] of Object.entries(w.v || {})) if (arr.some((val, l) => val != null && m.v[r][l] !== val)) return false;
  for (const [r, val] of Object.entries(w.s || {})) if (m.s[r] !== val) return false;
  if (x.maxSteps != null && m.steps > x.maxSteps) return false;
  return true;
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
  // ---------- 5부 병렬 ----------
  // 사실 근거: AMD RDNA ISA 문서(공개), LLVM AMDGPU 문서. 단순화는 스테이지 글에 「단순화」로 적는다.
  {
    id: '5-1', book: 5, kind: '개념', title: '두 레인',
    text: '명령 하나(op)를 레인 둘이 동시에 따라 해요 — op는 같이 쓰고 데이터는 레인마다 달라요. op가 0이면 AND, 1이면 XOR. AMD GPU는 벡터 명령 하나를 wave32나 wave64의 켜진 레인 모두에 적용해요 — 모두 한 사이클에 끝난다는 뜻은 아니에요. 여기선 둘로 단순화했어요.',
    hints: ['2-16 「연산 고르기」를 레인마다 하나씩.', '레인마다 MUX(AND(Ai,Bi), XOR(Ai,Bi), op). op 선은 두 MUX에 같이.'],
    sol: 'x=AND(A0,B0); y=XOR(A0,B0); r=MUX(x,y,op); u=AND(A1,B1); w=XOR(A1,B1); t=MUX(u,w,op); @0=r; @1=t',
    ins: ['op', 'A0', 'B0', 'A1', 'B1'], outs: ['R0', 'R1'], par: 20,
    fn: ([op, a0, b0, a1, b1]) => [op ? a0 ^ b0 : a0 & b0, op ? a1 ^ b1 : a1 & b1],
  },
  {
    id: '5-2', book: 5, kind: '개념', title: 'EXEC 마스크',
    text: 'EXEC는 레인마다 한 자리. 보통의 벡터 연산은 EXEC가 1인 레인만 결과(VGPR)를 바꾸고, 0인 레인은 원래 값이 그대로예요. 여기선 이걸 「쓰기 신호를 막는 회로」로 단순화해요 — wa에 레인의 EXEC 자리를 AND. (스칼라 명령과 뒤에 나올 V_READFIRSTLANE은 따로 규칙이 있어요.)',
    hints: ['레인마다 BIT 하나. 「이번에 쓸까」 = wa AND e(레인).', 'R0 = BIT(d0, AND(wa, e0), clk), R1 = BIT(d1, AND(wa, e1), clk).'],
    sol: 'a=AND(wa,e0); c=AND(wa,e1); r=BIT(d0,a,clk); t=BIT(d1,c,clk); @0=r; @1=t',
    ins: ['wa', 'e0', 'e1', 'd0', 'd1', 'clk'], outs: ['R0', 'R1'], par: 30,
    steps: tick('11111', '11000', '00111', '10110', '11111'),
    model: clocked(5, (st, [wa, e0, e1, d0, d1]) => { st.r = st.r || [0, 0]; if (wa && e0) st.r[0] = d0; if (wa && e1) st.r[1] = d1; }, (st) => (st.r ? st.r.slice() : [0, 0])),
  },
  {
    id: '5-3', book: 5, kind: '개념', title: '비교는 마스크로',
    text: '비교(v_cmp)는 레인마다 답 한 자리를 내서 VCC 마스크로 모아요. 여기선 레인마다 「A > B」(한 자리라 A=1, B=0일 때). 꺼진 레인(E=0)은 0을 써요.',
    hints: ['1-7 「A이면서 B는 아님」을 레인마다, 그리고 E로 한 번 더 걸러요.', 'VCCi = AND(AND(Ai, NOT Bi), Ei).'],
    sol: 'n=NOT(B0); x=AND(A0,n); v=AND(x,E0); m=NOT(B1); y=AND(A1,m); w=AND(y,E1); @0=v; @1=w',
    ins: ['E0', 'E1', 'A0', 'B0', 'A1', 'B1'], outs: ['VCC0', 'VCC1'], par: 10,
    fn: ([e0, e1, a0, b0, a1, b1]) => [b(e0 && a0 && !b0), b(e1 && a1 && !b1)],
  },
  {
    id: '5-4', book: 5, kind: '연습', title: '레인마다 고르기',
    text: 'v_cndmask는 EXEC가 켜진 레인에서 VCC를 보고 둘 중 하나를 써요 — VCC=1이면 B, 0이면 A(꺼진 레인은 원래 값 그대로). 분기 없이 「if」를 하는 방법이에요. 이 회로는 고르는 부분만이고, 레지스터 쓰기는 5-2처럼 EXEC가 따로 막아요.',
    hints: ['레인마다 선택기 하나.', 'Ri = MUX(Ai, Bi, VCCi).'],
    sol: 'x=MUX(A0,B0,VCC0); y=MUX(A1,B1,VCC1); @0=x; @1=y',
    ins: ['VCC0', 'VCC1', 'A0', 'B0', 'A1', 'B1'], outs: ['R0', 'R1'], par: 8,
    fn: ([v0, v1, a0, b0, a1, b1]) => [v0 ? b0 : a0, v1 ? b1 : a1],
  },
  {
    id: '5-5', book: 5, kind: '연습', title: '켜진 레인이 없나',
    text: '레인 넷의 EXEC가 모두 0이면 1. s_cbranch_execz가 이 깃발을 보고 「아무도 할 일이 없으면 건너뛰기」를 해요. 2-13과 같은 모양.',
    hints: ['「하나라도 1」의 반대.', 'OR 둘, 그리고 NOR.'],
    sol: 'x=OR(E3,E2); z=OR(E1,E0); y=NOR(x,z); @0=y',
    ins: ['E3', 'E2', 'E1', 'E0'], outs: ['EXECZ'], par: 10, fn: (v) => [b(v.every((x) => !x))],
  },
  // 여기부터 벡터 어셈블리 — 웨이브 하나(레인 4개)가 줄을 같이 지나가요
  {
    id: '5-6', book: 5, kind: '개념', title: '레인마다 더하기',
    text: '이제 벡터 명령. v 레지스터는 레인마다 따로(VGPR), s 레지스터는 웨이브에 하나(SGPR). v1과 v2를 레인마다 더해 v1에. 줄 하나가 레인 넷에서 동시에 돌아요.',
    hints: ['V_ADD 한 줄이면 레인 넷이 다 더해요.', 'V_ADD v1, v1, v2 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'S_ENDPGM'], tests: [{ v: { 1: [1, 2, 3, 4], 2: [10, 20, 30, 40] }, want: { v: { 1: [11, 22, 33, 44] } } }, { v: { 1: [5, 0, 9, 200], 2: [5, 7, 0, 100] }, want: { v: { 1: [10, 7, 9, 44] } } }] },
    sol: 'V_ADD v1, v1, v2; S_ENDPGM', par: 2,
  },
  {
    id: '5-7', book: 5, kind: '개념', title: '스칼라를 모든 레인에',
    text: 's0은 웨이브에 하나뿐인 값(예: 커널 인자 — 7부에서 와요). 모든 레인의 v1에 s0을 더해요. 실제 ISA도 벡터 명령의 첫 원본에 s를 쓸 수 있어요.',
    hints: ['V_ADD의 원본 하나를 s0으로.', 'V_ADD v1, s0, v1 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'S_ENDPGM'], tests: [{ v: { 1: [1, 2, 3, 4] }, s: { 0: 10 }, want: { v: { 1: [11, 12, 13, 14] } } }, { v: { 1: [0, 5, 250, 9] }, s: { 0: 7 }, want: { v: { 1: [7, 12, 1, 16] } } }] },
    sol: 'V_ADD v1, s0, v1; S_ENDPGM', par: 2,
  },
  {
    id: '5-8', book: 5, kind: '연습', title: '레인 번호 쓰기',
    text: '게임에선 시작할 때 v0에 레인 번호 0·1·2·3을 넣어 줘요(단순화 — 실제 컴퓨트 셰이더도 작업의 로컬 좌표를 첫 VGPR로 받을 수 있지만, 그 값이 늘 레인 번호와 같지는 않아요). v1 = s0 + 레인 번호 × 2 를 만들어요 — 「내 칸의 주소」를 셈하는 모양이에요.',
    hints: ['곱하기는 없어요 — 자기 자신을 더하면 두 배.', 'V_ADD v2, v0, v0 · V_ADD v1, s0, v2 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'S_ENDPGM'], tests: [{ s: { 0: 100 }, want: { v: { 1: [100, 102, 104, 106] } } }, { s: { 0: 0 }, want: { v: { 1: [0, 2, 4, 6] } } }] },
    sol: 'V_ADD v2, v0, v0; V_ADD v1, s0, v2; S_ENDPGM', par: 3,
  },
  {
    id: '5-9', book: 5, kind: '개념', title: '꺼진 레인',
    text: '이번엔 게임이 EXEC를 레인 0·2만 켜진 채로 시작해요 — 실제로도 분기를 지나면 이런 마스크가 생겨요. (워크그룹 크기가 웨이브 크기의 배수가 아니면 마지막 웨이브가 일부만 켜지기도 하는데, 그땐 보통 앞쪽 레인이 이어서 켜져요.) 켜진 레인의 v1에 1을 더해요 — 꺼진 레인은 그대로 남는지 보세요.',
    hints: ['상수 1은 V_MOVI로 v 레지스터에 먼저.', 'V_MOVI v2, 1 · V_ADD v1, v1, v2 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'S_ENDPGM'], exec: 0b0101, tests: [{ v: { 1: [10, 20, 30, 40] }, want: { v: { 1: [11, 20, 31, 40] } } }, { v: { 1: [0, 0, 255, 7] }, want: { v: { 1: [1, 0, 0, 7] } } }] },
    sol: 'V_MOVI v2, 1; V_ADD v1, v1, v2; S_ENDPGM', par: 3,
  },
  {
    id: '5-10', book: 5, kind: '개념', title: '갈림 없이 고르기',
    text: '레인마다 v1과 v2 중 큰 쪽을 v1에. 비교(V_CMP_GT)는 VCC에 레인마다 답을 쓰고, V_CNDMASK가 그 답으로 골라요 — 레인이 갈라지지 않아요.',
    hints: ['「v2가 더 큰 레인」을 VCC에, 그 레인만 v2를 골라요.', 'V_CMP_GT v2, v1 · V_CNDMASK v1, v1, v2 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'S_ENDPGM'], tests: [{ v: { 1: [3, 9, 5, 0], 2: [7, 2, 5, 1] }, want: { v: { 1: [7, 9, 5, 1] } } }, { v: { 1: [100, 0, 50, 8], 2: [99, 1, 51, 8] }, want: { v: { 1: [100, 1, 51, 8] } } }] },
    sol: 'V_CMP_GT v2, v1; V_CNDMASK v1, v1, v2; S_ENDPGM', par: 3,
  },
  {
    id: '5-11', book: 5, kind: '연습', title: '차이의 크기',
    text: '레인마다 |v1 − v2|를 v1에. 두 쪽으로 다 빼 놓고 고르면 돼요.',
    hints: ['a − b와 b − a를 둘 다 만들고, 「a > b」 VCC로 골라요.', 'V_CMP_GT v1, v2 · V_SUB v3, v1, v2 · V_SUB v2, v2, v1 · V_CNDMASK v1, v2, v3 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'S_ENDPGM'], tests: [{ v: { 1: [9, 2, 5, 0], 2: [4, 7, 5, 3] }, want: { v: { 1: [5, 5, 0, 3] } } }, { v: { 1: [200, 1, 30, 31], 2: [100, 101, 31, 30] }, want: { v: { 1: [100, 100, 1, 1] } } }] },
    sol: 'V_CMP_GT v1, v2; V_SUB v3, v1, v2; V_SUB v2, v2, v1; V_CNDMASK v1, v2, v3; S_ENDPGM', par: 5,
  },
  {
    id: '5-12', book: 5, kind: '개념', title: '갈림 (if)',
    text: 'v1 > s0인 레인만 v1 = v1 − s0. 「if」는 EXEC로 해요: 비교해서 VCC를 만들고, S_SAVEEXEC로 지금 EXEC를 s1에 담으며 EXEC를 VCC와 AND — 조건이 거짓인 레인이 꺼져요. 몸통을 지나고 S_OREXEC s1로 되켜요.',
    hints: ['비교 → EXEC 좁히기 → 몸통 → EXEC 되돌리기.', 'V_CMP_GT v1, s0 · S_SAVEEXEC s1 · V_SUB v1, v1, s0 · S_OREXEC s1 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'S_SAVEEXEC', 'S_XOREXEC', 'S_OREXEC', 'S_ENDPGM'], tests: [{ v: { 1: [3, 9, 5, 12] }, s: { 0: 5 }, want: { v: { 1: [3, 4, 5, 7] } } }, { v: { 1: [1, 2, 3, 4] }, s: { 0: 1 }, want: { v: { 1: [1, 1, 2, 3] } } }, { v: { 1: [1, 2, 3, 4] }, s: { 0: 9 }, want: { v: { 1: [1, 2, 3, 4] } } }] },
    sol: 'V_CMP_GT v1, s0; S_SAVEEXEC s1; V_SUB v1, v1, s0; S_OREXEC s1; S_ENDPGM', par: 5,
  },
  {
    id: '5-13', book: 5, kind: '개념', title: '갈림 (if / else)',
    text: 'v1 > s0이면 v1 − s0, 아니면 v1 + s0. else는 EXEC를 뒤집어서 해요: 담아 둔 s1과 XOR하면 「처음엔 켜져 있었는데 지금 꺼진」 레인만 켜져요. 레인이 갈리면 웨이브는 then과 else를 둘 다 지나가요 — 갈림의 값이에요.',
    hints: ['5-12 몸통 뒤에 EXEC 뒤집기, 그리고 else 몸통, 마지막에 되돌리기.', 'V_CMP_GT v1, s0 · S_SAVEEXEC s1 · V_SUB v1, v1, s0 · S_XOREXEC s1 · V_ADD v1, v1, s0 · S_OREXEC s1 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'S_SAVEEXEC', 'S_XOREXEC', 'S_OREXEC', 'S_ENDPGM'], tests: [{ v: { 1: [3, 9, 5, 12] }, s: { 0: 5 }, want: { v: { 1: [8, 4, 10, 7] } } }, { v: { 1: [10, 20, 30, 40] }, s: { 0: 1 }, want: { v: { 1: [9, 19, 29, 39] } } }, { v: { 1: [0, 1, 2, 3] }, s: { 0: 7 }, want: { v: { 1: [7, 8, 9, 10] } } }] },
    sol: 'V_CMP_GT v1, s0; S_SAVEEXEC s1; V_SUB v1, v1, s0; S_XOREXEC s1; V_ADD v1, v1, s0; S_OREXEC s1; S_ENDPGM', par: 7,
  },
  {
    id: '5-14', book: 5, kind: '연습', title: '아무도 없으면 건너뛰기',
    text: 'v1 > s0인 레인만 v1을 세 배로. 그런데 조건이 참인 레인이 하나도 없으면 몸통을 통째로 건너뛰어요 — S_CBRANCH_EXECZ. 세 번째 입력(아무도 안 들어감)은 끝 줄(S_ENDPGM)을 빼고 4걸음 안에 끝나야 해요.',
    hints: ['S_SAVEEXEC 바로 뒤에 「EXEC가 0이면 S_OREXEC 줄로」.', 'V_CMP_GT v1, s0 · S_SAVEEXEC s1 · S_CBRANCH_EXECZ 5 · V_ADD v2, v1, v1 · V_ADD v1, v2, v1 · S_OREXEC s1 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'S_SAVEEXEC', 'S_XOREXEC', 'S_OREXEC', 'S_CBRANCH_EXECZ', 'S_ENDPGM'], tests: [{ v: { 1: [3, 9, 5, 12] }, s: { 0: 5 }, want: { v: { 1: [3, 27, 5, 36] } } }, { v: { 1: [1, 2, 3, 4] }, s: { 0: 0 }, want: { v: { 1: [3, 6, 9, 12] } } }, { v: { 1: [1, 2, 3, 4] }, s: { 0: 9 }, want: { v: { 1: [1, 2, 3, 4] } }, maxSteps: 4 }] },
    sol: 'V_CMP_GT v1, s0; S_SAVEEXEC s1; S_CBRANCH_EXECZ 5; V_ADD v2, v1, v1; V_ADD v1, v2, v1; S_OREXEC s1; S_ENDPGM', par: 7,
  },
  {
    id: '5-15', book: 5, kind: '개념', title: '스칼라 되풀이',
    text: '모든 레인의 v1을 s0배로. 되풀이 횟수가 레인마다 같으니 세는 건 스칼라(s1)로 — 레인은 갈라지지 않아요. S_CMP_EQ가 두 값이 같으면 SCC를 1, 다르면 0으로 만들고, S_CBRANCH_SCC1이 1일 때 빠져나와요. 처음엔 s1·v2가 0이에요.',
    hints: ['「s1 = s0이면 끝, 아니면 v2 += v1, s1 += 1, 다시」, 끝나면 v1 ← v2.', 'S_CMP_EQ s1, s0 · S_CBRANCH_SCC1 5 · V_ADD v2, v2, v1 · S_ADDI s1, 1 · S_BRANCH 0 · V_MOV v1, v2 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'S_SAVEEXEC', 'S_XOREXEC', 'S_OREXEC', 'S_CBRANCH_EXECZ', 'S_MOVI', 'S_ADDI', 'S_CMP_EQ', 'S_BRANCH', 'S_CBRANCH_SCC1', 'S_ENDPGM'], tests: [{ v: { 1: [1, 2, 3, 4] }, s: { 0: 3 }, want: { v: { 1: [3, 6, 9, 12] } } }, { v: { 1: [7, 0, 9, 5] }, s: { 0: 0 }, want: { v: { 1: [0, 0, 0, 0] } } }, { v: { 1: [10, 20, 1, 2] }, s: { 0: 5 }, want: { v: { 1: [50, 100, 5, 10] } } }] },
    sol: 'S_CMP_EQ s1, s0; S_CBRANCH_SCC1 5; V_ADD v2, v2, v1; S_ADDI s1, 1; S_BRANCH 0; V_MOV v1, v2; S_ENDPGM', par: 7,
  },
  {
    id: '5-16', book: 5, kind: '개념', title: '레인마다 다른 되풀이',
    text: '레인마다 v2 = 1 + 2 + … + v1. 이번엔 레인마다 도는 횟수가 달라요. 끝난 레인은 EXEC에서 빠지고, 모두 끝나야 웨이브가 빠져나와요 — 이 되풀이의 횟수는 처음 켜져 있던 레인 중 가장 많이 도는 레인이 정해요. 처음엔 v2·v3이 0이에요(합이 255를 넘으면 하위 8비트만 남아요 — 입력은 작게 뒀어요).',
    hints: ['되풀이 전에 EXEC를 s2에 담아 두고, 머리에서 「v1 > 0」으로 EXEC를 좁혀요. 아무도 안 남으면 빠져나와 s2로 되켜요.', 'S_MOVI s1, 1 · S_GETEXEC s2 · V_CMP_GT v1, v3 · S_SAVEEXEC s3 · S_CBRANCH_EXECZ 8 · V_ADD v2, v2, v1 · V_SUB v1, v1, s1 · S_BRANCH 2 · S_OREXEC s2 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'V_READFIRSTLANE', 'S_GETEXEC', 'S_SAVEEXEC', 'S_XOREXEC', 'S_OREXEC', 'S_CBRANCH_EXECZ', 'S_MOVI', 'S_ADDI', 'S_CMP_EQ', 'S_BRANCH', 'S_CBRANCH_SCC1', 'S_ENDPGM'], tests: [{ v: { 1: [1, 2, 3, 4] }, want: { v: { 2: [1, 3, 6, 10] } } }, { v: { 1: [0, 5, 0, 10] }, want: { v: { 2: [0, 15, 0, 55] } } }] },
    sol: 'S_MOVI s1, 1; S_GETEXEC s2; V_CMP_GT v1, v3; S_SAVEEXEC s3; S_CBRANCH_EXECZ 8; V_ADD v2, v2, v1; V_SUB v1, v1, s1; S_BRANCH 2; S_OREXEC s2; S_ENDPGM', par: 10,
  },
  {
    id: '5-17', book: 5, kind: '연습', title: '레인 하나를 스칼라로',
    text: 'V_READFIRSTLANE은 첫 번째 켜진 레인의 값을 s 레지스터로 옮겨요. 그 값을 켜진 레인 모두의 v1에 더해요. EXEC가 일부만 켜진 입력도 있어요.',
    hints: ['읽어서 s1에, 그리고 V_ADD.', 'V_READFIRSTLANE s1, v1 · V_ADD v1, v1, s1 · S_ENDPGM.'],
    asm: { vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'V_CMP_GT', 'V_CMP_EQ', 'V_CNDMASK', 'V_READFIRSTLANE', 'S_GETEXEC', 'S_SAVEEXEC', 'S_XOREXEC', 'S_OREXEC', 'S_CBRANCH_EXECZ', 'S_MOVI', 'S_ADDI', 'S_CMP_EQ', 'S_BRANCH', 'S_CBRANCH_SCC1', 'S_ENDPGM'], tests: [{ v: { 1: [5, 1, 2, 3] }, want: { v: { 1: [10, 6, 7, 8] } } }, { exec: 0b0110, v: { 1: [5, 1, 2, 3] }, want: { v: { 1: [5, 2, 3, 3] } } }, { exec: 0b1000, v: { 1: [1, 1, 1, 9] }, want: { v: { 1: [1, 1, 1, 18] } } }] },
    sol: 'V_READFIRSTLANE s1, v1; V_ADD v1, v1, s1; S_ENDPGM', par: 3,
  },
  {
    id: '5-18', book: 5, kind: '시험', title: '5부 시험', pool: ['5-10', '5-12', '5-13', '5-15'], rounds: 3,
    text: '5부의 벡터 프로그램 중 하나를 매번 뽑아요. 세 번 연달아. 넘기면 6부(메모리)로 가요.',
  },
  // ---------- 6부 메모리 ----------
  {
    id: '6-1', book: 6, kind: '개념', title: '같은 줄인가',
    text: '게임에선 기억이 한 칸씩이 아니라 네 칸이 한 줄로 오가요(단순화). 여기서는 주소 0~15만 써요 — 네 자리 중 윗 두 자리가 줄 번호. 두 레인의 주소가 같은 줄이면 1 — 게임에선 같은 줄을 읽는 레인들의 요청을 하나로 묶어요(실제 coalescing도 요청을 모으지만, 캐시 줄 하나가 늘 전송 한 번과 같지는 않아요).',
    hints: ['아래 두 자리는 안 봐도 돼요. 1-17 「두 자리가 같나」를 윗 두 자리로.', 'AND(XNOR(A3,B3), XNOR(A2,B2)).'],
    sol: 'x=XNOR(A3,B3); z=XNOR(A2,B2); y=AND(x,z); @0=y',
    ins: ['A3', 'A2', 'A1', 'A0', 'B3', 'B2', 'B1', 'B0'], outs: ['같은 줄'], par: 12,
    fn: ([a3, a2, , , b3, b2]) => [b(a3 === b3 && a2 === b2)],
  },
  // 여기부터 작은 CU — 기억에서 읽고 쓰기. 걸음 대신 사이클을 세요
  {
    id: '6-2', book: 6, kind: '개념', title: '늦게 오는 읽기',
    text: '레인마다 기억[레인]을 읽어 기억[레인 + 4]에 옮겨요. G_LOAD는 바로 오지 않아요 — 줄은 다음으로 넘어가고, 값은 몇 사이클 뒤에 레지스터에 들어와요. 그 사이 다른 일을 하다가, 쓰기 전에 S_WAITCNT로 기다려요. 게임에선 값이 오기 전에 읽으면 옛값을 써서, 기다리지 않으면 초기값 0을 저장해요 — 실제로는 필요한 waitcnt를 빼먹은 결과는 아예 믿으면 안 돼요.',
    hints: ['읽기를 먼저 걸고, 기다리는 동안 「레인 + 4」 주소를 셈해요. s0엔 4가 들어 있어요.', 'G_LOAD v1, v0 · V_ADD v2, s0, v0 · S_WAITCNT · G_STORE v2, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 4 }, tests: [{ mem: { 0: 7, 1: 8, 2: 9, 3: 10 }, want: { mem: { 4: 7, 5: 8, 6: 9, 7: 10 } } }, { mem: { 0: 0, 1: 200, 2: 5, 3: 1 }, want: { mem: { 4: 0, 5: 200, 6: 5, 7: 1 } } }] },
    sol: 'G_LOAD v1, v0; V_ADD v2, s0, v0; S_WAITCNT; G_STORE v2, v1; S_ENDPGM', par: 5,
  },
  {
    id: '6-3', book: 6, kind: '연습', title: '두 배열 더하기',
    text: 'c[레인] = a[레인] + b[레인]. a는 기억[0~3], b는 기억[4~7], c는 기억[8~11]. 시작 주소(b는 4, c는 8)는 s0·s1에 들어 있어요 — 커널 인자처럼.',
    hints: ['읽기 둘을 먼저 다 걸고, 한 번만 기다려요.', 'V_ADD v2, s0, v0 · V_ADD v3, s1, v0 · G_LOAD v1, v0 · G_LOAD v2, v2 · S_WAITCNT · V_ADD v1, v1, v2 · G_STORE v3, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 4, 1: 8 }, tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 10, 5: 20, 6: 30, 7: 40 }, want: { mem: { 8: 11, 9: 22, 10: 33, 11: 44 } } }, { mem: { 0: 9, 1: 0, 2: 100, 3: 7, 4: 1, 5: 0, 6: 200, 7: 7 }, want: { mem: { 8: 10, 9: 0, 10: 44, 11: 14 } } }] },
    sol: 'V_ADD v2, s0, v0; V_ADD v3, s1, v0; G_LOAD v1, v0; G_LOAD v2, v2; S_WAITCNT; V_ADD v1, v1, v2; G_STORE v3, v1; S_ENDPGM', par: 8,
  },
  {
    id: '6-4', book: 6, kind: '개념', title: '스칼라 읽기',
    text: '레인마다 기억[레인] + 기억[15]를 기억[레인 + 4]에. 기억[15]는 모든 레인이 같은 값 — 레인마다 읽지 말고 S_LOAD로 웨이브에 한 번만 s 레지스터로 읽어요(스칼라 쪽 캐시로 가요). s0엔 4.',
    hints: ['S_LOAD s1, 15로 한 번, G_LOAD로 레인마다, 그리고 한 번 기다리기.', 'S_LOAD s1, 15 · G_LOAD v1, v0 · V_ADD v2, s0, v0 · S_WAITCNT · V_ADD v1, v1, s1 · G_STORE v2, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 4 }, tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4, 15: 100 }, want: { mem: { 4: 101, 5: 102, 6: 103, 7: 104 } } }, { mem: { 0: 50, 1: 0, 2: 9, 3: 255, 15: 1 }, want: { mem: { 4: 51, 5: 1, 6: 10, 7: 0 } } }] },
    sol: 'S_LOAD s1, 15; G_LOAD v1, v0; V_ADD v2, s0, v0; S_WAITCNT; V_ADD v1, v1, s1; G_STORE v2, v1; S_ENDPGM', par: 7,
  },
  {
    id: '6-5', book: 6, kind: '개념', title: '흩어진 읽기',
    text: '레인 l이 기억[4l]과 기억[4l + 1]을 더해 기억[16 + l]에. 그런데 레인 넷의 주소(0·4·8·12)가 서로 다른 줄이라 첫 읽기에 줄 넷을 가져와요. 두 번째 읽기(1·5·9·13)는 같은 줄이라 게임에선 먼저 요청한 줄을 다시 써요(실제로도 줄이 이미 왔으면 캐시에 적중하고, 아직 오는 중이면 요청을 묶거나 도착을 기다려요). 다 끝난 사이클 수를 봐 두세요 — 다음 스테이지와 견줘요. s0 = 16, s1 = 1.',
    hints: ['주소 4l = l을 두 번 두 배로(V_ADD 둘).', 'V_ADD v2, v0, v0 · V_ADD v2, v2, v2 · G_LOAD v1, v2 · V_ADD v2, v2, s1 · G_LOAD v3, v2 · V_ADD v2, s0, v0 · S_WAITCNT · V_ADD v1, v1, v3 · G_STORE v2, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 16, 1: 1 }, tests: [{ mem: { 0: 1, 1: 2, 4: 3, 5: 4, 8: 5, 9: 6, 12: 7, 13: 8 }, want: { mem: { 16: 3, 17: 7, 18: 11, 19: 15 } } }, { mem: { 0: 10, 1: 0, 4: 0, 5: 9, 8: 100, 9: 100, 12: 1, 13: 1 }, want: { mem: { 16: 10, 17: 9, 18: 200, 19: 2 } } }] },
    sol: 'V_ADD v2, v0, v0; V_ADD v2, v2, v2; G_LOAD v1, v2; V_ADD v2, v2, s1; G_LOAD v3, v2; V_ADD v2, s0, v0; S_WAITCNT; V_ADD v1, v1, v3; G_STORE v2, v1; S_ENDPGM', par: 10,
  },
  {
    id: '6-6', book: 6, kind: '연습', title: '모아 읽기',
    text: '같은 일인데 수를 놓는 모양을 바꿨어요: 레인 l의 두 수가 기억[l]과 기억[l + 4]에. 이제 한 번 읽을 때 레인 넷이 한 줄에 모여요(coalescing). 32사이클 안에 끝내 보세요 — 6-5보다 얼마나 빨라졌나요? s0 = 16, s1 = 4.',
    hints: ['주소 셈이 필요 없어요 — v0이 곧 첫 주소, 두 번째는 v0 + s1.', 'G_LOAD v1, v0 · V_ADD v2, v0, s1 · G_LOAD v3, v2 · V_ADD v2, s0, v0 · S_WAITCNT · V_ADD v1, v1, v3 · G_STORE v2, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 16, 1: 4 }, tests: [{ mem: { 0: 1, 4: 2, 1: 3, 5: 4, 2: 5, 6: 6, 3: 7, 7: 8 }, want: { mem: { 16: 3, 17: 7, 18: 11, 19: 15 } }, maxCycles: 32 }, { mem: { 0: 10, 4: 0, 1: 0, 5: 9, 2: 100, 6: 100, 3: 1, 7: 1 }, want: { mem: { 16: 10, 17: 9, 18: 200, 19: 2 } }, maxCycles: 32 }] },
    sol: 'G_LOAD v1, v0; V_ADD v2, v0, s1; G_LOAD v3, v2; V_ADD v2, s0, v0; S_WAITCNT; V_ADD v1, v1, v3; G_STORE v2, v1; S_ENDPGM', par: 8,
  },
  {
    id: '6-7', book: 6, kind: '연습', title: '이웃 더하기',
    text: '레인 l: 기억[l] + 기억[l + 1]을 기억[8 + l]에(기억[0~4]에 수 다섯). 두 번째 읽기(1~4)는 거의 첫 읽기와 같은 줄이라 다시 써요 — 레인 3의 기억[4]만 새 줄. s0 = 8, s1 = 1.',
    hints: ['읽기 둘을 걸고 한 번 기다려요.', 'G_LOAD v1, v0 · V_ADD v2, v0, s1 · G_LOAD v3, v2 · V_ADD v2, v0, s0 · S_WAITCNT · V_ADD v1, v1, v3 · G_STORE v2, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 8, 1: 1 }, tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5 }, want: { mem: { 8: 3, 9: 5, 10: 7, 11: 9 } } }, { mem: { 0: 0, 1: 10, 2: 0, 3: 10, 4: 0 }, want: { mem: { 8: 10, 9: 10, 10: 10, 11: 10 } } }] },
    sol: 'G_LOAD v1, v0; V_ADD v2, v0, s1; G_LOAD v3, v2; V_ADD v2, v0, s0; S_WAITCNT; V_ADD v1, v1, v3; G_STORE v2, v1; S_ENDPGM', par: 8,
  },
  {
    id: '6-8', book: 6, kind: '개념', title: '원자 덧셈',
    text: '기억[0~3]의 합을 기억[8]에. 레인 넷이 같은 칸에 G_STORE로 쓰면 하나만 남아요(어느 레인 값이 남을지는 정해져 있지 않아요). G_ATOMIC_ADD는 레인마다의 덧셈을 하나도 안 잃어요. 기억[8]은 처음에 0이에요.',
    hints: ['주소 8을 모든 레인에 두고, 읽은 값을 원자 덧셈으로.', 'G_LOAD v1, v0 · V_MOVI v2, 8 · S_WAITCNT · G_ATOMIC_ADD v2, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'G_ATOMIC_ADD', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4 }, want: { mem: { 8: 10 } } }, { mem: { 0: 100, 1: 0, 2: 50, 3: 5 }, want: { mem: { 8: 155 } } }] },
    sol: 'G_LOAD v1, v0; V_MOVI v2, 8; S_WAITCNT; G_ATOMIC_ADD v2, v1; S_ENDPGM', par: 5,
  },
  {
    id: '6-9', book: 6, kind: '연습', title: '세기',
    text: '기억[0~3]엔 0~3 사이의 수가 있어요. 수마다 몇 번 나왔는지를 기억[8 + 그 수]에 세요(히스토그램). 같은 수가 여러 레인에 나오니 원자 덧셈이 필요해요. 원자 덧셈은 있던 값에 더하니까, 기억[8~11]은 게임이 처음에 0으로 준비해 둬요. s0 = 8.',
    hints: ['주소 = 8 + 읽은 수, 더할 값 = 1.', 'G_LOAD v1, v0 · S_WAITCNT · V_ADD v2, v1, s0 · V_MOVI v3, 1 · G_ATOMIC_ADD v2, v3 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'G_ATOMIC_ADD', 'S_LOAD', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 8 }, tests: [{ mem: { 0: 2, 1: 0, 2: 2, 3: 3 }, want: { mem: { 8: 1, 9: 0, 10: 2, 11: 1 } } }, { mem: { 0: 1, 1: 1, 2: 1, 3: 1 }, want: { mem: { 8: 0, 9: 4, 10: 0, 11: 0 } } }] },
    sol: 'G_LOAD v1, v0; S_WAITCNT; V_ADD v2, v1, s0; V_MOVI v3, 1; G_ATOMIC_ADD v2, v3; S_ENDPGM', par: 6,
  },
  {
    id: '6-10', book: 6, kind: '개념', title: 'LDS',
    text: 'LDS는 같은 워크그룹의 레인들이 같이 쓰는 작고 빠른 기억이에요. 여기서는 다른 레인의 값을 LDS에 쓰고 읽어서 주고받아요(같은 웨이브 안에선 레인끼리 값을 바꾸는 명령도 따로 있어요). 기억[0~3]을 거꾸로 기억[8~11]에: 레인 l이 LDS[l]에 쓰고 LDS[3 − l]을 읽어요. DS_READ도 조금 늦게 와요. s0 = 8.',
    hints: ['읽어서 LDS에 쓰고, 3 − l 주소로 LDS를 읽고, 기다렸다가 기억에.', 'G_LOAD v1, v0 · S_WAITCNT · DS_WRITE v0, v1 · V_MOVI v2, 3 · V_SUB v2, v2, v0 · DS_READ v1, v2 · V_ADD v3, v0, s0 · S_WAITCNT · G_STORE v3, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'G_ATOMIC_ADD', 'S_LOAD', 'DS_WRITE', 'DS_READ', 'S_WAITCNT', 'S_ENDPGM'], s: { 0: 8 }, tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4 }, want: { mem: { 8: 4, 9: 3, 10: 2, 11: 1 } } }, { mem: { 0: 9, 1: 0, 2: 0, 3: 7 }, want: { mem: { 8: 7, 9: 0, 10: 0, 11: 9 } } }] },
    sol: 'G_LOAD v1, v0; S_WAITCNT; DS_WRITE v0, v1; V_MOVI v2, 3; V_SUB v2, v2, v0; DS_READ v1, v2; V_ADD v3, v0, s0; S_WAITCNT; G_STORE v3, v1; S_ENDPGM', par: 10,
  },
  {
    id: '6-11', book: 6, kind: '개념', title: '배리어',
    text: '이번엔 워크그룹에 웨이브가 둘(작업 0~7). 기억[0~7]을 거꾸로 기억[8~15]에. 그런데 웨이브 0이 LDS[7 − id]를 읽을 때 웨이브 1은 아직 안 썼을 수 있어요. S_BARRIER는 워크그룹 웨이브들의 도착을 맞추는 명령이고, 앞선 LDS 쓰기가 끝나는 건 S_WAITCNT로 따로 기다려요(배리어가 전역 기억의 캐시까지 맞춰 주지는 않아요). s0 = 8.',
    hints: ['6-10에서 「쓰기 → (기다리기·배리어) → 읽기」. 거꾸로 주소는 7 − id.', 'G_LOAD v1, v0 · S_WAITCNT · DS_WRITE v0, v1 · S_WAITCNT · S_BARRIER · V_MOVI v2, 7 · V_SUB v2, v2, v0 · DS_READ v1, v2 · V_ADD v3, v0, s0 · S_WAITCNT · G_STORE v3, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, waves: 2, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'G_ATOMIC_ADD', 'S_LOAD', 'DS_WRITE', 'DS_READ', 'DS_ADD', 'S_WAITCNT', 'S_BARRIER', 'V_CMP_EQ', 'S_SAVEEXEC', 'S_ENDPGM'], s: { 0: 8 }, tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 }, want: { mem: { 8: 8, 9: 7, 10: 6, 11: 5, 12: 4, 13: 3, 14: 2, 15: 1 } } }, { mem: { 0: 10, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 20 }, want: { mem: { 8: 20, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 10 } } }] },
    sol: 'G_LOAD v1, v0; S_WAITCNT; DS_WRITE v0, v1; S_WAITCNT; S_BARRIER; V_MOVI v2, 7; V_SUB v2, v2, v0; DS_READ v1, v2; V_ADD v3, v0, s0; S_WAITCNT; G_STORE v3, v1; S_ENDPGM', par: 12,
  },
  {
    id: '6-12', book: 6, kind: '연습', title: '워크그룹 합',
    text: '기억[0~7](웨이브 둘)의 합을 기억[8]에 — 전역 기억엔 한 번만 쓰고 싶어요. 레인마다 LDS[0]에 DS_ADD로 모으고, 배리어로 다 모이길 기다린 뒤, 작업 0번 레인만(EXEC로) 기억[8]에 써요. LDS[0]은 게임이 처음에 0으로 준비해 둬요 — 실제 LDS는 저절로 0이 되지 않아서, 작업 하나가 0을 쓰고 완료 대기와 배리어를 거친 뒤 더하기를 시작해야 해요.',
    hints: ['모으기: DS_ADD(주소 0). 배리어. 그다음 LDS[0]을 읽고, V_CMP_EQ v0, (0)으로 작업 0만 남겨 쓰기.', 'G_LOAD v1, v0 · V_MOVI v2, 0 · S_WAITCNT · DS_ADD v2, v1 · S_WAITCNT · S_BARRIER · DS_READ v1, v2 · V_CMP_EQ v0, v2 · S_SAVEEXEC s1 · V_MOVI v3, 8 · S_WAITCNT · G_STORE v3, v1 · S_ENDPGM.'],
    asm: { cu: true, vec: true, waves: 2, ops: ['V_MOV', 'V_MOVI', 'V_ADD', 'V_SUB', 'G_LOAD', 'G_STORE', 'G_ATOMIC_ADD', 'S_LOAD', 'DS_WRITE', 'DS_READ', 'DS_ADD', 'S_WAITCNT', 'S_BARRIER', 'V_CMP_EQ', 'S_SAVEEXEC', 'S_ENDPGM'], tests: [{ mem: { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 }, want: { mem: { 8: 36 } } }, { mem: { 0: 100, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 55 }, want: { mem: { 8: 155 } } }] },
    sol: 'G_LOAD v1, v0; V_MOVI v2, 0; S_WAITCNT; DS_ADD v2, v1; S_WAITCNT; S_BARRIER; DS_READ v1, v2; V_CMP_EQ v0, v2; S_SAVEEXEC s1; V_MOVI v3, 8; S_WAITCNT; G_STORE v3, v1; S_ENDPGM', par: 13,
  },
  {
    id: '6-13', book: 6, kind: '시험', title: '6부 시험', pool: ['6-3', '6-8', '6-10', '6-11'], rounds: 3,
    text: '6부의 메모리 프로그램 중 하나를 매번 뽑아요. 세 번 연달아. 넘기면 7부(CU·스케줄)로 가요.',
  },
];
