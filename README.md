# 🚀 스튜디오 모멘텀 웹 플랫폼 저장소 (studiomomentum.github.io)

> **호스팅:** GitHub Pages (`https://studiomomentum.github.io/`)  
> **시스템 목적:** 의사·변호사·세무사·전문직 대상 유튜브 올인원 턴키 솔루션 세일즈 퍼널 및 관제 플랫폼  
> **상세 아키텍처 및 정책 명세서:** [07_운영기록/제작시스템/스튜디오모멘텀_웹플랫폼_아키텍처_명세서.md](../../../../../07_운영기록/제작시스템/스튜디오모멘텀_웹플랫폼_아키텍처_명세서.md)

---

## 📁 핵심 파일 구성

| 파일명 | 역할 | 상세 설명 |
|---|---|---|
| `index.html` | 메인 세일즈 랜딩페이지 | **인바운드(기본) / 아웃바운드(VIP `?vip`) 듀얼 모드** 동적 렌더링. PayApp 결제 모달 및 텔레메트리 트래커 내장 |
| `admin.html` | 관제탑 어드민 대시보드 | 실시간 활동 피드(열람/방문/스크롤/결제시도) 및 타깃 CRM 매트릭스 |
| `research-2026-retention.html` | 완주율 연구 리포트 | 권위 입증 및 검색엔진(GEO/SEO) 유입용 백링크 콘텐츠 |
| `email_templates_high_ctr.html`| 콜드메일 템플릿 프리뷰 | 10종 고전환율 반응형 이메일 템플릿 쇼케이스 |
| `generate_pseo.py` | pSEO 자동 생성기 | 주요 6대 거점 × 5대 직종 = 30개 랜딩페이지 자동 생성 스크립트 |
| `{지역}-{업종}.html` | 지역별 pSEO 랜딩페이지 | 예: `gangnam-hospital.html`, `pangyo-tax.html` 등 |
| `targets.json` | 타깃 데이터베이스 | 메일 발송 및 추적 대상 병의원/로펌/세무 채널 DB |
| `llms.txt`, `llms-full.txt` | GEO 지식 파일 | Perplexity, Claude, ChatGPT 등 생성형 AI 크롤러 최적화 데이터 |
| `sitemap.xml`, `robots.txt` | 검색엔진 최적화 에셋 | 네이버/구글 색인 최적화 |

---

## ⚠️ 다른 AI / 개발자를 위한 절대 주의사항

1. **인바운드 / 아웃바운드 가격 차등 구조 보존**:
   - **인바운드 (정상가)**: 파일럿 60만 / 정기 셀프 월 320만 / 현장 풀케어 월 400만
   - **아웃바운드 (`?vip`, 특별제휴)**: 파일럿 50만 (17% OFF) / 정기 셀프 월 280만 (13% OFF) / 현장 풀케어 월 360만 (10% OFF)
   - 전략 리포트 20만 원(첫 달 계약 시 100% 전액 차감)은 양쪽 동일.
2. **"건당 OO만 원" 표현 절대 금지**:
   - 통 패키지 금액과 매월 40만 원 할인 혜택을 강조하는 정책이므로 건당 단가 표기로 회귀하지 말 것.
3. **가격 카드 오와 열 (그리드 수평 정렬) 유지**:
   - 상단 박스(`price-tier-name`, `price-num`, `price-discount-tag`, `price-desc`) 높이가 고정되어 있어 `📁 폴더` 라인이 수평 일치하도록 세팅되어 있음.

## 관리자 통합 화면 (2026-09-26)

- `admin.html`은 인증·자동 갱신·집계를 유지하고, `assets/admin-workspace.js`와 `.css`가 타깃 관리 / 발굴 현황 / 유입 분석을 표시합니다.
- 타깃 목록은 발송 상태·고객 반응·추가 조건으로 필터링하며, 업체명을 누르면 연락처·영업 포인트·활동 이력을 확인합니다. 메일 열람과 사이트 방문은 별도로 집계합니다.
- 별도 알림 로그, 수동 새로고침 버튼, 테스트 기록 초기화 기능은 제거했습니다. 15초 자동 동기화, 테스트 방문 제외 및 백업 이상 배너는 유지합니다.
- 인바운드 바로가기는 `?admin=1&preview_mode=inbound`, 아웃바운드는 `?admin=1&preview_mode=outbound&vip`를 새 탭/창으로 엽니다. 기존 고객 방문 귀속을 읽거나 덮어쓰지 않고 관리자 방문을 통계에서 제외합니다. 새 탭과 별도 창 중 실제 표시 방식은 브라우저 설정을 따릅니다.
- 발굴 현황은 `_search_db_stats.schema_version=2`의 DISCOVERED / REVIEW / REJECTED / ERROR / DUPLICATE / REGISTERED를 분리합니다. 후보 누적은 조건 통과 수가 아니며, 등록 이력에는 발송 완료 대상도 포함됩니다. 현재 READY는 실제 타깃 목록 기준이며 목록이 없을 때 `ready_count`를 사용합니다. 구버전의 `verified_count`는 등록 이력으로 표시하고, 누락된 신규 분류는 미집계로 표시합니다. 후보 0건 비율은 `0.0%`입니다.
- 브라우저 회귀 검증: Playwright가 설치된 환경에서 `node tests/admin-workspace.cjs`. 별도 설치 경로는 `PLAYWRIGHT_MODULE`로 지정합니다. 외부 요청은 테스트에서 차단하며 실제 발송·텔레메트리 쓰기를 하지 않습니다.

### 서버 인증 및 수동 분류·장전 (2026-09-26)

기존 Apps Script 웹앱의 telemetry URL, GET JSON 배열, POST 이벤트 계약을 유지합니다. `server/apps-script/Code.gs`는 `route: momentum_admin` 요청만 `AdminRelay.gs`로 분리합니다. 소유자 프로젝트의 Script Properties에 `ADMIN_SESSION_SECRET`, `ADMIN_PASSWORD_CHECK`, `MOMENTUM_GITHUB_TOKEN`을 보관합니다. 비밀값은 Git, 공개 페이지, 로그에 넣지 않습니다.

관리자 로그인은 기존 비밀번호 원문을 HTTPS POST 본문으로 받아 서버에서 SHA-256 후 비밀키 HMAC 검증합니다. 기존 공개 해시나 로컬 로그인 플래그는 인증으로 인정하지 않습니다. 로그인 성공 시 무작위 세션을 발급하고 서버에는 그 해시와 만료시각만 보관합니다. 기본 만료 8시간, 자동 로그인 선택 시 7일, 로그아웃 시 서버 세션 폐기, 로그인 실패 15분간 8회 제한을 적용합니다. 비밀번호와 GitHub 토큰을 브라우저에 저장하지 않습니다. 브라우저에는 로그인 선택에 따라 만료되는 관리자 세션만 저장합니다.

발송대기 버튼은 서버 세션으로 `classify.start`를 호출합니다. 서버는 `momentum-cold-mailer/auto_prospect.yml`만 `main`, `inputs.force=true`로 dispatch합니다. 전체 정지 설정이 명시적으로 `true`일 때만 실행합니다. `drip_sender.yml` 및 검색 워크플로는 호출하지 않습니다. 운영 스위치는 별도의 `settings.update`에서 두 개의 기존 boolean 설정만 허용합니다. 임의 저장소·경로·워크플로 입력은 받지 않습니다.

서버 lock과 requestId로 중복을 차단하고, 반환된 실행 ID의 실제 conclusion으로 완료/실패를 구분합니다. 접수 응답 유실 시 자동 재발송하지 않습니다. 요청 전 실행 목록·요청시각·요청자를 비교해 새 실행이 하나일 때만 연결하며 여러 개이면 확인 필요로 유지합니다. 완료는 워크플로 종료이며 READY 증가를 보장하지 않습니다. 웹 집계는 기존 자동 동기화를 따릅니다.

검증 명령: `node tests/admin-relay.cjs`, `node tests/admin-classification.cjs`, `node tests/admin-workspace.cjs`. 브라우저 검증은 Playwright 설치가 필요하며 별도 경로는 `PLAYWRIGHT_MODULE`로 지정합니다. 테스트는 외부 제어 요청을 mock 처리합니다.

배포: 기존 Apps Script 프로젝트 `14TWuyAHdQlLFussAPnjZspaWGD-hARToY6LFJTtnwGCCcpY2m0ZWQam4`를 먼저 clone/백업한 뒤 서버 파일을 push하고, 기존 웹앱 배포 ID의 버전만 갱신합니다. 기존 Drive 파일 ID/배포 URL/접근 계약을 변경하지 않습니다. 서버 health는 기존 URL에 `?admin_health=1`을 붙여 확인합니다. 정상 telemetry 응답은 배열이어야 합니다. 운영 웹은 서버 검증 후 배포합니다. 서버 롤백은 기존 배포 ID를 이전 버전으로 돌리며, 세션 중계 전 웹 코드를 함께 복구해야 합니다.
