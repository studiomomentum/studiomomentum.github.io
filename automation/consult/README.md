# 사이트 AI 제작 상담

공개 사이트 → Apps Script 비공개 상담 저장소 → Mac의 전용 실행기 → Codex app-server(stdio) → 방문자별 응답 조회.

## 운영

- `node automation/consult/install-service.mjs register`: 유효한 기존 블로그 관리자 세션으로 상담 작업자 전용 토큰을 발급한다. 기존 토큰은 교체되므로 실행기 1개만 사용한다.
- `node automation/consult/install-service.mjs`: `com.momentum.consult-worker` LaunchAgent를 등록한다. 블로그 실행기는 건드리지 않는다.
- 실행기는 6초 간격으로 작업을 확인한다. `~/Library/Application Support/MomentumConsult`에 토큰·중복 방지 영수증·격리된 Codex 홈을 보관한다. 비밀값/상담 원문을 로그에 쓰지 않는다.
- Codex 인증은 기존 ChatGPT 로그인만 복사하며 API 키를 사용하지 않는다. 별도 홈과 빈 작업 폴더, 셸·앱·플러그인·MCP·검색 기능 비활성화, 도구 요청 거부를 적용한다. app-server는 외부 포트로 노출하지 않는다.
- PC가 꺼지거나 로그인/구독 한도가 만료되면 상담을 보장할 수 없다. 90초 heartbeat 만료 시 오프라인으로 표시하며 카카오 연결은 유지한다.
- 상담은 최대 12회, 입력 1,000자, 신규 상담 분당 5개/일 100개, 전체 요청 일 300개로 제한한다. 익명 방문자는 우회할 수 있으므로 전역 한도로도 제한한다. AI 사용량 과금 정책은 사용자 요청으로 보류했다.
- 고객 세션 접근은 24시간 유효하다. 원문 기록은 비공개 Drive에 보존하며 자동 삭제하지 않는다. 공개 전 개인정보 안내와 실제 저장/PD 열람을 일치시킨다. 실명·연락처는 요구하지 않는다.

## 사업 정보와 답변 경계

`prompts/business.md`와 `prompts/rules.md`를 매 요청 새로 읽는다. AI는 답변 ID 최대 2개와 후속 질문 ID 1개를 선택한다. 서버가 검토된 문구만 출력한다. 모델이 임의 대본이나 지침을 생성해도 고객 응답으로 렌더링하지 않는다. 이 선택형 구조는 자유 대화보다 표현 다양성이 제한된다.

공개 가격(60/320/400)과 제휴 가격(50/280/360)은 페이지와 동일하다. 신규 상품·할인·일정을 지어내지 않는다. 내용 수정 후 `node --test automation/consult/policy.test.mjs`와 대표 실제 대화를 확인한다. 식별 가능한 고객 정보나 제작용 원본 스킬을 사업 문서에 넣지 않는다.

## 고객 연결과 측정

상담창은 페이지 안에서 열리며, 고객이 직접 쓴 말을 모아 전달 내용을 만든다. 고객이 편집·복사하고 카카오에서 직접 전송한다. 자동 메시지 발송은 없다. 어드민 하단 ‘AI 상담 기록’에서 비공개 원문과 고객이 수정한 전달 내용, 카카오 이동, 수동 문의 도착 확인을 조회한다.

공개 telemetry는 `consult_section_view`, `ai_chat_open`, `ai_chat_start`, `ai_reply`, `ai_summary_view`, `ai_summary_copy`, `ai_kakao_open` 이벤트만 기록하며 대화/토큰은 넣지 않는다. 기존 `kakao_click`과 실제 문의 도착을 혼동하지 않는다. 관리자 미리보기는 telemetry 제외, 상담 저장소에는 테스트로 표시한다. 계산기 로드 시 자동 이벤트는 제외한다.

## 검증

```
node tests/consult-store.cjs
node --test automation/consult/policy.test.mjs
node tests/consultation.cjs
node tests/admin-relay.cjs
```

UI 테스트는 설치된 Chrome과 기존 blog Playwright를 사용하며 외부 요청은 mock 처리한다. 실제 app-server 및 운영 서버 검증 결과는 `docs/consultation-journey.md`에 기록한다.

## 복구

상담 중단: `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.momentum.consult-worker.plist`. 90초 후 신규 AI 상담은 오프라인으로 안내된다. 기존 PD 링크는 계속 작동한다. Apps Script는 기존 배포 ID의 이전 버전으로 복구할 수 있다. 웹 롤백은 상담 버튼 변경 커밋만 되돌리며 다른 작업자의 변경은 보존한다. 비공개 대화 저장소는 유지한다.

공개 고객 상담에 개인 구독을 사용하는 방식의 지원 범위는 확인되지 않았다. 기술 연결과 공식 지원 여부를 동일시하지 않는다. 현재는 사용자가 이를 인지하고 요청한 소규모 기술 구현이다.
