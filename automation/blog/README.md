# 블로그 로컬 Chrome 실행기

현재 범위는 계정 준비 및 브라우저 실행 검증이다. 어드민 연결·글 생성·편집·발행은 아직 구현하지 않았다.

```sh
cd automation/blog
npm ci
npm run doctor
node cli.mjs setup naver
node cli.mjs setup tistory
node cli.mjs setup threads
node cli.mjs probe naver
npm test
```

- `setup`: 사용자가 보는 실제 Chrome. 계정 개설·로그인·블로그 설정을 직접 진행하고 전용 창을 닫는다. 실행기가 가입 양식이나 공개 발행 버튼을 대신 누르지 않는다.
- `probe`: 같은 매체의 전용 프로필을 헤드리스 Chrome으로 열어 홈페이지 접근 및 인증 방해 상태만 확인한다. 로그인 계정·편집 권한·게시 성공을 증명하지 않는다. 보이는 창으로 자동 전환하지 않는다.
- `doctor`: 임시 프로필로 실제 헤드리스 Chrome 렌더링 및 Codex CLI ChatGPT 로그인 여부를 검사한다. 모델 호출·요금제 한도·글 생성 성공은 검사하지 않는다.

프로필은 저장소 밖 `~/Library/Application Support/MomentumBlog/profiles/{매체}`에 보관한다. 개인 Chrome 프로필을 복사하거나 사용하지 않는다. 프로필에는 로그인 정보가 있으므로 공유하거나 Git에 추가하지 않는다. 동일 매체의 설정 창을 닫은 뒤 운영 모드를 실행한다. 충돌 시 잠금 파일 삭제나 개인 Chrome 강제 종료를 하지 않는다.

추가 인증이 필요하면 작업을 중단하고 `setup`으로 인증한다. CAPTCHA 우회는 구현하지 않는다. 매체별 계정 주소와 편집기를 확인한 후에만 발행 어댑터를 구현한다. 홈페이지 HTTP 200은 계정·발행 검증 완료가 아니다.

테스트는 임시 프로필과 로컬 페이지를 사용한다. 실제 Chrome의 보이는 모드 → 종료 → 헤드리스 재실행에서 쿠키·localStorage 유지, 인증 입력·CAPTCHA 분류, 잘못된 플랫폼 차단을 확인한다. 테스트가 여는 보이는 창은 자동 종료한다.

## 주제·글 제작 실행기 (2단계)

기존 어드민의 콘텐츠 관리 메뉴가 `MomentumAdmin.call('content.*')`을 사용한다. 서버는 세션 검사 후 `ContentStore.gs`에서 비공개 Drive 파일 하나를 만들고 파일 ID를 Script Properties의 `MOMENTUM_CONTENT_FILE_ID`에 보관한다. 기존 telemetry 파일/GET 응답에는 초안을 넣지 않는다. 웹 저장소에는 글·계정 세션을 저장하지 않는다.

서버를 사용할 때는 기존 Apps Script 프로젝트를 먼저 백업하고 `ContentStore.gs`와 수정한 `AdminRelay.gs`를 함께 배포해야 한다. 새 파일에서 Drive 접근이 가능한지, 다른 계정에 공유되지 않았는지 확인한 후 웹을 배포한다. 현재는 로컬 구현/테스트만 완료했으며 이 배포를 수행하지 않았다.

```sh
cd automation/blog
node worker.mjs login
node worker.mjs once
# 계속 대기하면서 사용자가 요청한 생성 작업만 처리
node worker.mjs run
```

`login`은 기존 관리자 아이디 admin/비밀번호로 서버 세션을 발급받는다. 비밀번호는 화면에 표시하거나 파일에 저장하지 않는다. 세션만 `~/Library/Application Support/MomentumBlog/worker-session.json`에 0600 권한으로 저장한다. 서버 세션 만료 시 다시 로그인한다. URL은 기존 `https://script.google.com/macros/s/.../exec`만 받는다. 세션 파일·수신 초안·브라우저 프로필은 공유하지 않는다.

글 생성은 로컬 `codex exec`와 기존 ChatGPT 로그인으로 수행한다. 유료 API 키를 추가하지 않는다. 별도 임시 작업 폴더, 읽기 전용 모드, 사용자 config 미적용, 구조화 JSON 출력을 사용한다. CLI 로그인 상태는 확인했지만 실제 모델 요청·구독 잔량·생성 품질은 이번 단계에서 검증하지 않았다. 사용자가 실제 주제를 선택한 뒤 첫 생성으로 검증한다.

작업 흐름:

1. 기획서 기반 추천 가설 3개 중 선택하거나 근거와 함께 주제를 직접 등록한다. 추천 가설은 검색 검증된 주제가 아니다. 주기적 주제 보충은 아직 구현하지 않았다.
2. 주제를 선택하고 세 매체 초안 생성을 누른다. 실행기가 없으면 요청은 대기열에 남는다.
3. 실행기가 하나씩 생성하고 결과를 서버에 저장한다. 어드민의 결과 불러오기로 확인한다.
4. 네이버·티스토리는 블로그 영역, 쓰레드는 별도 영역에서 편집·저장·검수한다.
5. 새 버전 생성은 이전 버전을 보존한다. 생성 중 사용자 편집이 발생하면 결과 저장을 충돌로 거부한다. 검수된 글을 수정하면 새 버전의 검수를 해제한다.

생성 결과에 서비스 링크가 없거나 VIP/ref/admin 링크가 있으면 실행기가 저장하지 않는다. 사실·고객 식별정보·공개 금지 정보의 최종 검수는 사람이 수행한다. 검수 완료는 게시를 의미하지 않는다.

생성 요청 접수/완료 응답이 끊기면 로컬 `generation-receipt.json`의 요청 ID와 결과로 재확인한다. 다시 실행할 때 완료 결과가 있으면 재생성 없이 저장만 재시도한다. 실행 중 프로세스가 종료돼 결과가 없으면 실패로 표시한다. UI의 생성 재시도로 다시 요청할 수 있다. 완료 저장 충돌이 발생하면 로컬 결과를 보존하고 중단한다. 해당 결과와 사용자 편집본을 대조한 뒤 복구해야 하며 receipt를 임의로 지우면 안 된다.

검증: `node tests/content-store.cjs`, `node tests/admin-content.cjs`, `node tests/admin-relay.cjs`를 저장소 루트에서 실행. `npm test --prefix automation/blog`는 Chrome 세션 및 출력 검사를 실행한다. UI 검사는 외부 요청을 차단하고 테스트 초안만 사용한다. 플랫폼 실제 발행은 구현하지 않았다.
