# CONTROL 통합 운영실

## 현재 구현
- GitHub Pages `/ops.html`: 전체 관제, 솟 모멘텀, aight, BTC 터미널, 서버·백업 메뉴. 기존 `/admin.html` 진입은 통합 관리 메뉴로 이동.
- 기존 모멘텀 관리자 계정/세션 사용. 비밀번호는 기존 인증 서버에만 전송. Ubuntu는 관리자 세션의 유효성만 확인.
- 원격 상태 API: Ubuntu 127.0.0.1:8797 → outbound HTTPS 터널. 인증 없는 요청은 401, 허용하지 않은 Origin은 403. 세션 인증 후 허용된 작업·산출물·민감값을 지운 로그만 반환.
- `ops-config.json`에는 공개 API origin과 갱신 시각만 저장. GitHub에 운영 상태나 인증값을 저장하지 않음.
- 기존 Ubuntu server-monitor 어댑터로 service 상태, BTC 저장, 알트 결과, 영업 처리, 블로그·상담, BGM·백업을 15초마다 조회.
- 정상 인증 결과 캐시 30초. 인증 서버 장애 시 상태 정보 반환을 중단. UI는 수집 지연과 원본 갱신 시각을 별도로 표시.
- systemd 사용자 서비스: `control-center`(로컬 화면), `control-center-api`(인증 API), `control-center-tunnel`(외부 연결). 로그인 시 자동 시작.
- 터널이 재시작되어 origin이 바뀌면 자동으로 GitHub 설정을 갱신하며 화면은 설정을 30초마다 재조회. GitHub Pages 배포 전파 동안 잠시 연결 지연이 발생할 수 있음.
- 현재 연결은 계정 없이 제공되는 Cloudflare Quick Tunnel이며 서비스 보장(SLA)이 없음. 고정 도메인/운영 SLA가 필요하면 소유 도메인에 Named Tunnel로 전환해야 함. 화면은 계속 GitHub Pages를 사용.
- 로컬 운영 화면: http://127.0.0.1:8796/ops.html

## 프로젝트 범위 보완
### 솟 모멘텀
- 검색·분류 진행판: 관리자 인증 후 Ubuntu 원본 DB와 sweep 체크포인트를 15초마다 직접 조회. GitHub search-progress.json·Actions 링크·실행 한도 안내 제거. 서비스 대기와 실제 실행을 구분하며 예전 active 채널을 현재 작업으로 표시하지 않음.
- 검색·분류 요청: 기존 인증 릴레이의 cloud backend 사용을 확인. GitHub Actions로 전환된 응답은 연결 확인 필요로 표시. 기존 분류의 마지막 실패는 CHECKOUT_DIRTY_RECONCILE_REQUIRED. 새 실행기는 GitHub checkout 검사·pull·DB push를 제거하고 Ubuntu 공용 DB를 사용하도록 전환 완료. 사용자 승인 후 기존 자동발송 ON을 보존해 작업자 세 개를 재시작함.
- 아웃바운드: 대상 서치 → 중복 제거 → 분류 → 검토 → 예약 발송 → 반송·수신 거부 → 회신·상담 전환.
- 인바운드: 키워드 → 콘텐츠 기획 → 생성 → 검수 → 네이버/Threads/티스토리 발행 → 검색 등록 → 유입·전환 분석.
- 검색: SEO/GEO 및 사용자 표기 IEO의 정확한 범위 확인 필요. 포털별 등록 상태, sitemap·색인 결과 확인을 별도 작업으로 기록.
- 조회/클릭/문의 이벤트 ID, 유입 출처, UTM, 수집 시각, 집계 기준 마련. 현재 상담 서비스 상태를 행동 추적 전체 완료로 간주하지 않음.
- 블로그 작업자 실행 상태가 각 채널 공개 발행 성공을 뜻하지 않음. 발행 URL과 플랫폼별 결과를 추가 연결해야 함.

### aight 실행 관리
- 제작 프로젝트(제목·메모·대본·장면 지문)를 SQLite에 버전과 함께 저장하고 제작 지시서/대본 파일을 생성.
- 기존 Bot Factory의 리서치·기획·근거 수집·대본 제작기를 실제 실행. 저장된 입력 파일 선택, 작업 로그, 생성 파일 검증 및 다운로드 제공.
- 맥북 설치 파일 + 10분 일회용 연결 코드. 기기별 토큰은 서버에 해시로 저장. 심박·접수·진행·결과를 분리하며 응답이 끊기면 결과 미확인 표시.
- ComfyUI는 맥북의 API 형식 workflow와 positive prompt 노드를 연결해야 함. 장면별 PNG 업로드 후 CRC·알파 채널·파일 해시 확인.
- 손 편집기는 맥북 앱에 production.json을 전달하고 final.mp4 + 동일 jobId의 render_result.json을 기다리는 파일 어댑터. 손 프로그램의 네이티브 자동 편집 API는 확인되지 않았으며 앱을 여는 것만으로 완료 처리하지 않음.
- 영상 백업은 크기·SHA-256·ffprobe 영상 스트림을 검증. 기존 OAuth 설정이 있을 때만 Ubuntu에서 YouTube 비공개 업로드. 업로드 세션과 영상 ID를 영속 저장하여 재시도 중 중복 업로드 방지.
- 현재 맥북 작업자와 YouTube OAuth는 미연결. 화면에 연결 필요/접수 대기로 표시하며 설치·연결 전 완료로 표시하지 않음.

### BTC 터미널
- Binance 가격: 기존 minute/intervals 서비스 즉시 실행, 저장 영수증 검증, BTC/알트 그룹별 예약 중지·재개. systemctl 고정 허용 목록만 사용하고 종료 결과·새 실행 ID·타이머 설정을 다시 읽어 확인.
- CVD/OI: 가격 수집기와 독립. 공급원·작업자·DB 최신 시각이 아직 연결되지 않았으므로 미연결 상태.
- Drive DB: 기존 데이터 구조를 유지. 단일 작성자 잠금, 복구 파일, 저장 후 원본 재조회, 누락 기간 보충.
- 알트: 일일·주간 기준일, 최근 성공, 오류, 다음 예약, 보고서 저장 검증.
- 가격/CVD/OI의 봉 기준·시간대·결측을 별도로 검증. 보고서 최신성은 상태 화면 수집 시각과 분리.

## 설치 및 운영
서버 원본 코드는 `/home/pc/Documents/Server/projects/공통운영/01_서버코드/control-center/`에 보존.
`remote.py`는 관리자 인증 후 고정 작업 목록만 접수. 실행은 BTC와 aight의 별도 systemd 작업자가 담당. 요청 ID 중복 방지, 실행 전 취소, 명시적 재시도 및 재시작 시 결과 미확인 처리를 적용. 임의 명령·임의 파일 경로는 받지 않음.
`control-center-btc-worker`와 `control-center-aight-worker` 서비스가 SQLite 큐를 소비. Bot Factory 의존성은 runtime/control-center/bot-venv 및 browsers에 격리. 인증 API는 NoNewPrivileges 유지.
`tunnel.py`는 공식 cloudflared 바이너리로 외부 HTTPS 연결을 유지. GitHub 인증은 기존 gh 시스템 자격증명을 읽어 메모리에서만 사용. public origin만 GitHub에 반영.
GitHub Pages 통합 화면에서 상태 조회와 모멘텀 작업 관리를 함께 수행합니다. 별도 어드민 창이나 iframe을 사용하지 않습니다. 타깃/메일, 검색/분류, 콘텐츠/발행, 유입/행동 분석, 상담, 운영 설정으로 기능을 재배치했습니다. 기존 admin.html 진입은 통합 관리 메뉴로 이동합니다. 최대화 화면은 폭 제한 없이 사용하며 1600px 이상에서 전체 관제 프로젝트를 3열로 배치합니다.
CVD/OI 공급원 연결은 별도 미완료. aight 맥북·ComfyUI·손 결과 파일 연동 및 YouTube OAuth 연결은 설치 상태에 따라 구분해 표시.

## Google Drive DB 전환
- 프론트: GitHub Pages. 운영 대상·설정·백업·서치 진행은 인증된 Ubuntu API에서 조회. 고객 홈페이지의 점검 상태도 Ubuntu 공개 설정 API에서 읽음.
- Ubuntu 공용 DB: databases/outreach/live. 기존 후보·근거·발송 이력은 원본을 보존한 채 합쳤고 SENT/BOUNCED/SENDING/UNKNOWN 이력을 보호함.
- Google Drive 통합운영_DB: momentum(후보·근거·발송), aight(제작 데이터), btc(로컬 시장 데이터), control(일관된 SQLite 백업). 기존 BTC 가격 원본은 기존 Drive 저장을 유지.
- 파일은 내용 해시로 이름을 정한 ZIP 스냅샷으로 저장. 실제 업로드 파일과 latest.json을 재조회해 크기·SHA-256이 같아야 저장 완료로 표시. 인증값·SMTP 비밀번호·rclone 설정은 백업에 포함하지 않음.
- 검증 영수증은 runtime/control-center/drive-backup-status.json. 후보·근거 외에 기존 Drive의 콘텐츠·상담·행동 통계 원본 DB도 매번 최신본을 읽어 momentum 백업에 포함함. 원본 저장소 ID와 기존 서비스 연결은 유지.
- 전환 코드: ops/outreach. 공유 파일 잠금·로컬 운영 설정·SMTP 전 Drive 발송 의도 백업·주기 백업 작업자. 실행 중 작업이 있으면 전환하지 않음.
- 작업자 세 개의 실제 프로세스 환경에서 공용 DB 경로와 MOMENTUM_DRIVE_DB=1을 확인. 기존 자동발송 ON 유지. 전체 DB는 시간마다 자동 백업하고 어드민의 수동 백업 요청도 처리함. SMTP 전에 발송 의도는 별도 Drive 백업으로 보존. 검증용 메일은 발송하지 않음.

- GitHub에는 프론트와 소스 코드만 배포. targets.json, search-progress.json, backup_status.json, system_config.json 운영 데이터 파일은 현재 배포에서 제거하며 과거 Git 이력은 변경하지 않음.
- 모니터·관찰 서비스도 메일 설정을 Ubuntu DB에서 읽음. GitHub 운영 설정 조회 제거.
- Drive 요청량 제한은 대기 후 재시도. 업로드 세션·완료한 프로젝트를 비공개 상태 파일에 보존하며 동일 스냅샷은 중단 지점부터 전송. ZIP 메타데이터를 고정해 변경 없는 DB의 재시도 해시를 유지. 요청이 남아 있어도 5분 재시도 간격을 지키며 검증된 기존 백업을 보존.

## 우분투 백엔드 점검
- 2026-10-17: 시스템·사용자 서비스 11개 실행, 영업 작업자 3개의 실제 환경에서 Ubuntu 공용 DB 사용 확인. 관리자 API 인증·Origin 제한과 공개 점검 설정의 최소 필드 확인.
- 서치 440/440, 후보 30,418개. 이전 분류 체크포인트는 대기 상태이며 실행 중 채널을 잘못 표시하지 않음. 검증 목적으로 대량 검색·분류·메일을 실행하지 않음.
- BTC 4개 예약 활성화, 저장 영수증 조회와 통합 큐의 읽기 검증 작업 성공. aight 산출물 46개, 실제 AI 실행기 응답 및 캡처 런타임 확인.
- 블로그 작업자 심박과 콘텐츠·상담 실제 API 조회 성공. 콘텐츠 18개, 완료 생성 작업 15개, 기존 발행 실패 3개는 과거 이력. 상담 online 확인. 저장 계층·추천 근거·상담 정책 검증 통과.
- 실제 공개 발행·메일·영상 업로드 검증은 수행하지 않음. 맥북 작업자, 손·ComfyUI 실행, YouTube OAuth, CVD/OI 연결은 미완료로 표시. 인증·작업 접수 릴레이와 기존 콘텐츠·상담 Drive 저장 접근에는 Apps Script를 계속 사용하며 실제 제작·검색·메일 실행은 Ubuntu 작업자가 담당.
