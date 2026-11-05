# NAND 게임

NAND 게이트 하나에서 시작해 부품을 직접 조립하며 GPU까지 올라가는 폰용 웹 게임. https://jayinlab.github.io/nand-game/

- 10부 145 스테이지: 게이트 · 산술 · 기억 · CPU(어셈블리) · 병렬(웨이브·EXEC) · 메모리(캐시·LDS·배리어) · CU·스케줄 · CP·PM4(dword 패킷) · 드라이버(BO·가상 주소·레지스터 배정·제출) · Vulkan(호출이 드라이버·PM4로 내려가는 것)
- 빌드 도구 없음 — HTML·CSS·JS 모듈 그대로
- 진행은 브라우저 localStorage에만 저장
- 5부(GPU)부터는 공개 자료(AMD ISA 문서·Mesa radv·amdgpu·Khronos 사양)로 확인한 것만 사실로 쓰고, 단순화는 화면의 「단순화한 것」에 적는다. 각 부는 공개 전에 사실 검토를 거쳤다
- AI(Claude)가 만들었다
