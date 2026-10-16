# CONTROL 통합 운영실

## 현재 구현
- GitHub Pages `/ops.html`: 전체 관제, 솟 모멘텀, aight, BTC 터미널, 서버·백업 메뉴. 기존 `/admin.html` 영업 기능 유지.
- 기존 모멘텀 관리자 계정/세션 사용. 비밀번호는 기존 인증 서버에만 전송. Ubuntu는 관리자 세션의 유효성만 확인.
- 원격 상태 API: Ubuntu 127.0.0.1:8797 → outbound HTTPS 터널. 인증 없는 요청은 401, 허용하지 않은 Origin은 403. 고객 레코드·비밀번호·토큰·원본 로그를 반환하지 않음.
- `ops-config.json`에는 공개 API origin과 갱신 시각만 저장. GitHub에 운영 상태나 인증값을 저장하지 않음.
- 기존 Ubuntu server-monitor 어댑터로 service 상태, BTC 저장, 알트 결과, 영업 처리, 블로그·상담, BGM·백업을 15초마다 조회.
- 정상 인증 결과 캐시 30초. 인증 서버 장애 시 상태 정보 반환을 중단. UI는 수집 지연과 원본 갱신 시각을 별도로 표시.
- systemd 사용자 서비스: `control-center`(로컬 화면), `control-center-api`(인증 API), `control-center-tunnel`(외부 연결). 로그인 시 자동 시작.
- 터널이 재시작되어 origin이 바뀌면 자동으로 GitHub 설정을 갱신하며 화면은 설정을 30초마다 재조회. GitHub Pages 배포 전파 동안 잠시 연결 지연이 발생할 수 있음.
- 현재 연결은 계정 없이 제공되는 Cloudflare Quick Tunnel이며 서비스 보장(SLA)이 없음. 고정 도메인/운영 SLA가 필요하면 소유 도메인에 Named Tunnel로 전환해야 함. 화면은 계속 GitHub Pages를 사용.
- 로컬 운영 화면: http://127.0.0.1:8796/ops.html

## 프로젝트 범위 보완
### 솟 모멘텀
- 아웃바운드: 대상 서치 → 중복 제거 → 분류 → 검토 → 예약 발송 → 반송·수신 거부 → 회신·상담 전환.
- 인바운드: 키워드 → 콘텐츠 기획 → 생성 → 검수 → 네이버/Threads/티스토리 발행 → 검색 등록 → 유입·전환 분석.
- 검색: SEO/GEO 및 사용자 표기 IEO의 정확한 범위 확인 필요. 포털별 등록 상태, sitemap·색인 결과 확인을 별도 작업으로 기록.
- 조회/클릭/문의 이벤트 ID, 유입 출처, UTM, 수집 시각, 집계 기준 마련. 현재 상담 서비스 상태를 행동 추적 전체 완료로 간주하지 않음.
- 블로그 작업자 실행 상태가 각 채널 공개 발행 성공을 뜻하지 않음. 발행 URL과 플랫폼별 결과를 추가 연결해야 함.

### aight (설계)
기획·대본 버전 확정 → 장면 지문 → ComfyUI 배경/PNG 생성 → Mac 작업 접수 → 손 편집기 제작 → 렌더 검수 → 백업 해시 검증 → Ubuntu 업로드 → YouTube 영상 ID/공개 결과 확인.
- job_id, scene_id, script_version, input_hash, worker_id, attempt, progress, last_progress_at, artifact_hash, uploaded_video_id 기록.
- 큐는 접수/진행/검수 대기/완료/실패/재시도로 구분. Mac 심박과 실제 렌더 진행 시각 분리.
- ComfyUI 결과 크기·투명도·장면 대응 검사. 편집기의 정확한 제품·버전·자동화 API 확인 후 실행 어댑터 연결.
- 재시도는 실패한 단계만 수행. 백업 검증 전 업로드 금지, 중복 업로드 방지 키, YouTube 처리 실패 회수.
- 현재 화면은 설계이며 aight 실행기를 신규 구현하거나 작업을 실제 발행하지 않음.

### BTC 터미널
- Binance 가격: 기존 minute/intervals 서비스, 원본 봉 시각, Drive 읽기 검증 확인.
- CVD/OI: 가격 수집기와 독립. 공급원·작업자·DB 최신 시각이 아직 연결되지 않았으므로 미연결 상태.
- Drive DB: 기존 데이터 구조를 유지. 단일 작성자 잠금, 복구 파일, 저장 후 원본 재조회, 누락 기간 보충.
- 알트: 일일·주간 기준일, 최근 성공, 오류, 다음 예약, 보고서 저장 검증.
- 가격/CVD/OI의 봉 기준·시간대·결측을 별도로 검증. 보고서 최신성은 상태 화면 수집 시각과 분리.

## 설치 및 운영
서버 원본 코드는 `/home/pc/Documents/Server/projects/공통운영/01_서버코드/control-center/`에 보존.
`remote.py`는 조회 전용이며 작업 실행, 발송, DB 변경 명령을 받지 않음.
`tunnel.py`는 공식 cloudflared 바이너리로 외부 HTTPS 연결을 유지. GitHub 인증은 기존 gh 시스템 자격증명을 읽어 메모리에서만 사용. public origin만 GitHub에 반영.
GitHub Pages 통합 화면에서 상태 조회와 모멘텀 작업 관리를 함께 수행합니다. 별도 어드민 창이나 iframe을 사용하지 않습니다. 타깃/메일, 검색/분류, 콘텐츠/발행, 유입/행동 분석, 상담, 운영 설정으로 기능을 재배치했습니다. 기존 admin.html 진입은 통합 관리 메뉴로 이동합니다. 최대화 화면은 폭 제한 없이 사용하며 1600px 이상에서 전체 관제 프로젝트를 3열로 배치합니다.
aight 실행기·CVD/OI 연결은 아직 별도이며 미연결 상태를 실제 실행으로 표시하지 않음.
