// 스테이지 정의. BOOKS는 지도 전체(10부), STAGES는 지금 풀 수 있는 것만.
// 반복 숙달이 목표라 부마다 세 종류가 섞인다:
//   개념 — 새 부품을 처음 만든다. 풀면 그 부품이 다음 스테이지부터 상자 하나로 나온다.
//   연습 — 같은 개념을 조건을 바꿔 다시(NAND만·적은 개수·표 보고 맞히기).
//   시험 — 매번 새로 뽑는 표(random)나 앞 스테이지 하나(pool)를 연달아 맞힌다. 다시 들어가면 다른 문제.
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
};

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
];
