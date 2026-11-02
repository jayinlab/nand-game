// 스테이지 정의. BOOKS는 지도 전체(10부), STAGES는 지금 풀 수 있는 것만.
// 반복 숙달이 목표라 부마다 세 종류가 섞인다:
//   개념 — 새 부품을 처음 만든다. 풀면 그 부품이 다음 스테이지부터 상자 하나로 나온다.
//   연습 — 같은 개념을 조건을 바꿔 다시(NAND만·적은 개수·표 보고 맞히기).
//   시험 — 매번 새로 뽑는 표를 연달아 맞힌다. 다시 들어가면 다른 문제.

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
};

const AB = ['A', 'B'];
const ABC = ['A', 'B', 'C'];
const OUT = ['출력'];

export const STAGES = [
  {
    id: '1-1', book: 1, kind: '개념', title: 'NAND 만나기',
    text: 'NAND는 두 입력이 <b>둘 다 1일 때만 0</b>을 내요. 점에서 점으로 끌면 선이 이어져요(차례로 눌러도 돼요) — A의 점 → NAND 왼쪽 점, B → 다른 왼쪽 점, NAND 오른쪽 점 → 출력.',
    hint: '아래 「NAND」 단추로 부품을 놓아요. 왼쪽 입력 단추를 누르면 0/1이 바뀌고, 표의 줄을 눌러도 돼요.',
    ins: AB, outs: OUT, par: 1, fn: ([a, c]) => [b(!(a && c))],
  },
  {
    id: '1-2', book: 1, kind: '개념', title: 'NOT', unlock: 'NOT',
    text: '입력을 뒤집어요. 0이면 1, 1이면 0.',
    hint: 'NAND의 두 왼쪽 점에 같은 신호를 넣으면?',
    ins: ['A'], outs: OUT, par: 1, fn: ([a]) => [b(!a)],
  },
  {
    id: '1-3', book: 1, kind: '개념', title: 'AND', unlock: 'AND',
    text: '둘 다 1일 때만 1.',
    hint: 'NAND는 「AND의 반대」예요. 한 번 더 뒤집으면.',
    ins: AB, outs: OUT, par: 2, fn: ([a, c]) => [b(a && c)],
  },
  {
    id: '1-4', book: 1, kind: '개념', title: 'OR', unlock: 'OR',
    text: '하나라도 1이면 1.',
    hint: '「하나라도 1」 = 「뒤집은 둘이 둘 다 1은 아니다」.',
    ins: AB, outs: OUT, par: 3, fn: ([a, c]) => [b(a || c)],
  },
  {
    id: '1-5', book: 1, kind: '연습', title: 'OR, NAND만으로', only: ['NAND'],
    text: '방금 만든 OR를 이번엔 NAND만으로 다시. 상자 없이 손으로 기억해 두는 연습이에요.',
    hint: 'NOT도 NAND 하나였어요.',
    ins: AB, outs: OUT, par: 3, fn: ([a, c]) => [b(a || c)],
  },
  {
    id: '1-6', book: 1, kind: '개념', title: 'NOR', unlock: 'NOR',
    text: '둘 다 0일 때만 1.',
    hint: 'OR를 뒤집기.',
    ins: AB, outs: OUT, par: 4, fn: ([a, c]) => [b(!(a || c))],
  },
  {
    id: '1-7', book: 1, kind: '연습', title: 'A이면서 B는 아님',
    text: 'A가 1이고 B가 0일 때만 1.',
    hint: 'B를 뒤집어서 AND. 별 두 개는 NAND 3개 몫 이하.',
    ins: AB, outs: OUT, par: 3, fn: ([a, c]) => [b(a && !c)],
  },
  {
    id: '1-8', book: 1, kind: '개념', title: 'XOR', unlock: 'XOR',
    text: '둘이 다를 때만 1. 2부에서 더하기의 심장이 돼요.',
    hint: '「하나라도 1」이면서 「둘 다 1은 아니다」.',
    ins: AB, outs: OUT, par: 4, fn: ([a, c]) => [b(a !== c)],
  },
  {
    id: '1-9', book: 1, kind: '연습', title: 'XOR, NAND 넷으로', only: ['NAND'],
    text: 'XOR를 NAND만으로. 별 두 개는 NAND 4개.',
    hint: '첫 NAND(A,B)를 세 곳에서 같이 써요.',
    ins: AB, outs: OUT, par: 4, fn: ([a, c]) => [b(a !== c)],
  },
  {
    id: '1-10', book: 1, kind: '개념', title: 'XNOR', unlock: 'XNOR',
    text: '둘이 같을 때 1. 「같은가?」를 묻는 게이트예요.',
    hint: 'XOR를 뒤집기.',
    ins: AB, outs: OUT, par: 5, fn: ([a, c]) => [b(a === c)],
  },
  {
    id: '1-11', book: 1, kind: '연습', title: '셋 다 1',
    text: 'A·B·C가 모두 1일 때만 1.',
    hint: '두 개씩 묶어도 돼요.',
    ins: ABC, outs: OUT, par: 4, fn: ([a, c, d]) => [b(a && c && d)],
  },
  {
    id: '1-12', book: 1, kind: '연습', title: '셋 중 하나라도',
    text: 'A·B·C 중 하나라도 1이면 1.',
    hint: 'OR 두 개.',
    ins: ABC, outs: OUT, par: 6, fn: ([a, c, d]) => [b(a || c || d)],
  },
  {
    id: '1-13', book: 1, kind: '연습', title: '다수결',
    text: '셋 중 둘 이상이 1이면 1. 2부의 올림수(carry)가 바로 이 모양이에요.',
    hint: '둘씩 짝지은 AND 셋 중 하나라도.',
    ins: ABC, outs: OUT, par: 6, fn: ([a, c, d]) => [b(a + c + d >= 2)],
  },
  {
    id: '1-14', book: 1, kind: '개념', title: '선택기 (MUX)', unlock: 'MUX',
    text: 's가 0이면 d0을, 1이면 d1을 내보내요. 나중에 「어느 레지스터를 읽을까」가 전부 이것.',
    hint: '(d0 AND NOT s) OR (d1 AND s).',
    ins: ['d0', 'd1', 's'], outs: OUT, par: 4, fn: ([d0, d1, s]) => [s ? d1 : d0],
  },
  {
    id: '1-15', book: 1, kind: '연습', title: '선택기, NAND만으로', only: ['NAND'],
    text: '선택기를 NAND만으로. 별 두 개는 NAND 4개.',
    hint: 'NOT s 하나, 나머지 셋은 NAND 그대로.',
    ins: ['d0', 'd1', 's'], outs: OUT, par: 4, fn: ([d0, d1, s]) => [s ? d1 : d0],
  },
  {
    id: '1-16', book: 1, kind: '개념', title: '분배기 (DEMUX)', unlock: 'DEMUX',
    text: 'd를 s가 0이면 c0으로, 1이면 c1로 보내요. 다른 쪽은 0.',
    hint: '선택기를 거꾸로. AND 두 개와 NOT 하나.',
    ins: ['d', 's'], outs: ['c0', 'c1'], par: 5, fn: ([d, s]) => [b(d && !s), b(d && s)],
  },
  {
    id: '1-17', book: 1, kind: '연습', title: '두 자리가 같나',
    text: '두 자리 수 A1A0과 B1B0이 같으면 1.',
    hint: '자리마다 「같은가?」, 그리고 둘 다.',
    ins: ['A1', 'A0', 'B1', 'B0'], outs: OUT, par: 12,
    fn: ([a1, a0, b1, b0]) => [b(a1 === b1 && a0 === b0)],
  },
  {
    id: '1-18', book: 1, kind: '연습', title: '표 맞히기 · 입력 둘', random: 2, rounds: 3,
    text: '매번 새로 뽑는 표를 회로로. 세 번 연달아. 다시 들어오면 다른 문제예요.',
    hint: '1이 나오는 줄만 보고 「이 줄일 때」를 AND로 만든 뒤 OR로 모으면 어떤 표든 돼요.',
  },
  {
    id: '1-19', book: 1, kind: '연습', title: '표 맞히기 · 입력 셋', random: 3, rounds: 3,
    text: '입력이 셋인 표를 세 번 연달아.',
    hint: '선택기로 C에 따라 둘로 나눠 풀어도 돼요.',
  },
  {
    id: '1-20', book: 1, kind: '시험', title: '1부 시험', random: 3, rounds: 5,
    text: '입력 셋짜리 표 다섯을 연달아. 이걸 넘기면 2부(산술)로 가요.',
    hint: '막히면 1-18의 방법: 1이 나오는 줄마다 AND, 전부 OR.',
  },
];
