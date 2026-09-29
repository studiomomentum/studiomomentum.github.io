# 공개발행 실행기 복구 — 2026-09-30

## 확인한 원인

- 모바일 공개발행 요청은 서버에 접수됐다.
- 자동화 전용 Chrome 프로필을 기존 프로세스가 점유하여 발행 시작 전 실패했다.
- 서버는 완료 결과만 멱등 처리하고 실패/불명 결과 재전송은 CONTENT_CONFLICT로 거부하여, 로컬 receipt가 남은 실행기가 반복 중단됐다.

## 수정과 검증

- 같은 job/claim/state 및 결과를 재전송하면 정상 수락한다. 다른 상태·오류·공개 URL은 충돌로 거부한다.
- Chrome ProcessSingleton/SingletonLock 충돌은 BROWSER_PROFILE_IN_USE로 분류하고 관리자에 전용 창 종료 안내를 표시한다.
- content-delivery, content-platform-generation, admin-content(데스크톱/모바일) 테스트 통과.
- 기존 운영 Apps Script 전체를 별도 백업하고 ContentStore의 delivery.finish만 패치하여 배포 v16 반영.
- 실제 남아 있던 실패 receipt 재전송이 completed:true를 반환했다. receipt는 비공개 delivery-history에 보존했다.
- 로컬 runtime/browser.mjs도 갱신했다. 사용자 데이터·로그인 프로필·기존 게시글은 변경하지 않았다.

## 현재 운영 제한

사용자가 직접 모바일에서 발행을 테스트하겠다고 하여 실행기를 중지했다. 이전 티스토리 대기 요청 1건이 있어 그대로 재시작하면 새 클릭 없이 실행될 수 있다. 대기 요청 처리에 대한 사용자 답변 전에는 실행기를 재시작하지 않는다. 기존 자동화 Chrome 프로필 점유도 아직 해소하지 않았다. 이번 수정 후 실제 발행 성공은 검증하지 않았다.
