import os
from pathlib import Path
import sys
import subprocess
import csv
import random
import hashlib
import imaplib
import email
from email.header import decode_header
from datetime import datetime, timezone, timedelta
from mailer import send_email, build_cold_email, detect_category, SENDER_EMAIL, SENDER_PASSWORD
from system_guard import is_system_enabled

# 한국 시간대(KST) 설정
KST = timezone(timedelta(hours=9))

CSV_PATH = os.path.join(os.path.dirname(__file__), "targets_db.csv")


def get_now_kst():
    return datetime.now(KST)


def get_dynamic_daily_limit(date_str):
    """
    일일 발송 한도 난수 생성 (기존 25통 대비 15% 확대 및 매일 불규칙 난수 적용)
    - 날짜별 고유 시드(seed)를 활용하여 하루 동안 일관된 난수 한도 유지
    - 26 ~ 32통 사이 (평균 ~29통, 기존 대비 15% 확대된 난수)
    - 기계적인 고정 한도(25통 딱 끊김)를 방지하여 발송량 분산
    """
    seed_val = int(hashlib.md5(date_str.encode()).hexdigest(), 16) % 10000
    rng = random.Random(seed_val)
    return rng.randint(26, 32)


def classify_zone(region_str):
    """
    지역 텍스트를 기반으로 Zone A(오산 반경 20km)와 Zone B(서울, 판교/분당)를 자동 분류
    - Zone B (35% 목표): 서울 전역(강남, 서초, 송파, 마포 등), 판교, 분당, 성남
    - Zone A (65% 목표): 오산, 동탄, 수원, 평택, 화성, 용인 등 오산역 기준 반경 20km
    """
    region = (region_str or "").strip()
    zone_b_keywords = [
        "서울", "강남", "서초", "송파", "마포", "영등포", "성수", "종로", "용산", "중구", "동작", "관악",
        "강동", "광진", "성북", "노원", "은평", "서대문", "양천", "강서", "구로", "금천", "도봉", "강북",
        "중랑", "동대문", "판교", "분당", "성남"
    ]
    for kw in zone_b_keywords:
        if kw in region:
            return "ZONE_B"
    return "ZONE_A"


def save_csv(rows, fieldnames):
    """Persist only the authoritative DB. Publishing is an explicit separate step."""
    from storage import write_csv
    fields = list(dict.fromkeys(list(fieldnames) + ["토큰", "SendAttempt"]))
    write_csv(CSV_PATH, rows, fields)


def failed_recipients(message):
    """Only permanent DSN failures identify a bounced recipient; quoted bodies do not."""
    failed = set()
    for part in message.walk():
        if part.get_content_type() != 'message/delivery-status':
            continue
        for block in part.get_payload():
            if str(block.get('Action', '')).lower() != 'failed':
                continue
            if not str(block.get('Status', '')).startswith('5.'):
                continue
            recipient = block.get('Final-Recipient') or block.get('Original-Recipient') or ''
            if ';' in recipient:
                recipient = recipient.split(';', 1)[1].strip().lower()
                if '@' in recipient:
                    failed.add(recipient)
    return failed


def check_and_sync_bounces(rows, fieldnames):
    if not SENDER_PASSWORD:
        return rows, False
    updated, mail = False, None
    try:
        mail = imaplib.IMAP4_SSL('imap.gmail.com', timeout=30)
        mail.login(SENDER_EMAIL, SENDER_PASSWORD)
        mail.select('inbox', readonly=True)
        status, messages = mail.search(None, 'OR (FROM "mailer-daemon") (SUBJECT "Delivery Status Notification")')
        recipients = set()
        if status == 'OK' and messages[0]:
            for uid in messages[0].split()[-100:]:
                result, data = mail.fetch(uid, '(BODY.PEEK[])')
                if result == 'OK':
                    for item in data:
                        if isinstance(item, tuple) and isinstance(item[1], bytes):
                            recipients.update(failed_recipients(email.message_from_bytes(item[1])))
        for row in rows:
            if row.get('상태') == 'SENT' and row.get('이메일', '').strip().lower() in recipients:
                row['상태'] = 'BOUNCED'
                updated = True
    except Exception as exc:
        print(f'::warning::Bounce inspection failed: {type(exc).__name__}; delivery states preserved')
    finally:
        if mail:
            try:
                mail.logout()
            except Exception:
                pass
    if updated:
        save_csv(rows, fieldnames)
    return rows, updated


def get_last_sent_time(rows):
    """가장 최근에 성공(SENT) 발송된 시각 확인"""
    last_dt = None
    for r in rows:
        if r.get("상태") in ("SENT", "BOUNCED", "SENDING", "UNKNOWN") and r.get("발송일시"):
            try:
                raw = r.get("발송일시").split()[0] + " " + r.get("발송일시").split()[1]
                dt = datetime.strptime(raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
                if last_dt is None or dt > last_dt:
                    last_dt = dt
            except Exception:
                pass
    return last_dt


def delivery_count(rows, prefix, include_failed=False):
    states = {'SENT', 'BOUNCED', 'SENDING', 'UNKNOWN'}
    if include_failed:
        states.add('FAILED')
    return sum(r.get('상태') in states and r.get('발송일시', '').startswith(prefix) for r in rows)


def _run_drip(force=False):
    # 0. 어드민 원터치 스위치 실시간 검사 (OFF 상태면 즉시 차단)
    if not is_system_enabled():
        return

    now = get_now_kst()
    today_str = now.strftime("%Y-%m-%d")
    current_hour = now.hour
    current_minute = now.minute

    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S KST')}] Drip Agent 가동 시작")

    # 1. 안전 발송 시간 검사 (한국 시간 08:00 ~ 20:00) - force=True인 경우 건너뜀
    # 주말(토/일) 관계없이 매일 가동, 20:00 정각 이후 및 야간/새벽은 스팸 차단 대기
    if not force:
        if current_hour < 8 or current_hour >= 20:
            print(f">> [야간/새벽 안전 대기] 현재 시각({current_hour:02d}:{current_minute:02d} KST)은 안전 발송 시간(08:00~20:00) 외입니다.")
            print(">> 스팸 필터 보호를 위해 야간/새벽에는 발송하지 않으며, 오전 08:00에 자동 재개됩니다.")
            return

    # Discovery runs independently in prospecting.yml and never sends mail.

    # 3. CSV 파일 로드
    if not os.path.exists(CSV_PATH):
        print(f"오류: DB 파일이 존재하지 않습니다: {CSV_PATH}")
        sys.exit(1)

    rows = []
    with open(CSV_PATH, mode="r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for r in reader:
            rows.append(r)

    # 4. 동적 일일 발송 한도 계산 (15% 확대 + 날짜별 난수 적용)
    daily_limit = get_dynamic_daily_limit(today_str)

    # 오늘 이미 발송된 성공 건수 및 권역별(65:35) 카운트
    today_sent_count = 0
    today_sent_a = 0
    today_sent_b = 0

    for r in rows:
        if r.get("상태") in ("SENT", "BOUNCED", "SENDING", "UNKNOWN") and r.get("발송일시", "").startswith(today_str):
            today_sent_count += 1
            z = classify_zone(r.get("지역", ""))
            if z == "ZONE_B":
                today_sent_b += 1
            else:
                today_sent_a += 1

    pct_a = (today_sent_a / today_sent_count * 100) if today_sent_count > 0 else 0
    pct_b = (today_sent_b / today_sent_count * 100) if today_sent_count > 0 else 0
    print(f">> 오늘({today_str}) 동적 난수 한도: {daily_limit}통 (누적 발송: {today_sent_count}통 | 경기 남부권: {today_sent_a}통({pct_a:.0f}%), 서울/판교분당: {today_sent_b}통({pct_b:.0f}%))")

    if today_sent_count >= daily_limit:
        print(f">> [일일 동적 한도 도달] 오늘 목표량({daily_limit}통)을 완료했습니다. 내일 새로운 난수 한도로 자동 재개됩니다.")
        return

    # One invocation sends at most three individual messages. Persisted timestamps
    # also cap repeated/delayed/manual invocations in the same KST hour.
    hour_prefix = now.strftime('%Y-%m-%d %H:')
    if delivery_count(rows, hour_prefix, include_failed=True) >= 3:
        print('현재 시간대 3곳 처리 한도 도달')
        return
    rows, _ = check_and_sync_bounces(rows, fieldnames)
    sent_count = 0
    attempt_count = 0

    while attempt_count < 3:
        current = get_now_kst()
        if (not force and not 8 <= current.hour < 20) or not is_system_enabled():
            break
        if delivery_count(rows, current.strftime('%Y-%m-%d')) >= get_dynamic_daily_limit(current.strftime('%Y-%m-%d')):
            break
        if delivery_count(rows, current.strftime('%Y-%m-%d %H:'), include_failed=True) >= 3:
            break
        from prospect_scoring import row_priority, sendable_snapshot
        protected=[r for r in rows if r.get('상태') in ('SENT','BOUNCED','SENDING','UNKNOWN','FAILED','EXCLUDED')]
        protected_emails={r.get('이메일','').strip().lower() for r in protected if r.get('이메일')}
        protected_channels={r.get('채널URL','').rstrip('/') for r in protected if r.get('채널URL')}
        candidates=[(i,r) for i,r in enumerate(rows) if r.get('상태')=='READY' and sendable_snapshot(r)
                    and r.get('이메일','').strip().lower() not in protected_emails
                    and (not r.get('채널URL') or r['채널URL'].rstrip('/') not in protected_channels)]
        candidates.sort(key=lambda item:row_priority(item[1]))
        if not candidates:
            print('발송 적격 후보 없음')
            break
        target_idx,target_row=candidates[0]
        selected_zone='점수 우선'

        no = target_row.get("순번") or target_row.get("\ufeff순번", "")
        comp = target_row.get("회사채널명", "")
        rep = target_row.get("대표자", "")
        email_addr = target_row.get("이메일", "").strip()
        point = target_row.get("영업포인트", "")
        region = target_row.get("지역", "미지정")

        print(f"\n==========================================")
        print(f"🎯 [발송 대상 선택] #{no} {comp} ({rep})")
        print(f"📧 수신 이메일: {email_addr}")
        print(f"💡 영업 포인트: {point}")
        print(f"==========================================")

        target_token = target_row.get("토큰", "").strip()
        if not target_token:
            from mailer import generate_target_token
            target_token = generate_target_token(email_addr)
            target_row["토큰"] = target_token

        # Re-check stop/time before each claim; force never overrides the stop switch.
        if not is_system_enabled() or (not force and not 8 <= get_now_kst().hour < 20):
            return
        import exclusions
        if exclusions.matches(exclusions.load(Path(CSV_PATH).parent), target_row.get('토큰'), target_row.get('채널URL'), target_row.get('이메일')):
            target_row['상태']='EXCLUDED';save_csv(rows,fieldnames);continue
        from mailer import MailTransportError
        import uuid
        attempt_id=uuid.uuid4().hex
        target_row["SendAttempt"]=attempt_id
        target_row["상태"] = "SENDING"
        target_row["발송일시"] = get_now_kst().strftime("%Y-%m-%d %H:%M:%S")
        save_csv(rows, fieldnames)
        if os.getenv('MOMENTUM_DRIVE_DB')=='1':
            from drive_backup import backup_delivery_claim
            backup_delivery_claim(Path(CSV_PATH).parent)
        # Persist intent before SMTP. Interrupted/ambiguous sends require reconciliation.
        attempt_count += 1
        try:
            success = send_email(
                to_email=email_addr,
                receiver_name=rep,
                company_name=comp,
                sales_point=point,
                token=target_token
            )
        except MailTransportError:
            target_row["상태"] = "UNKNOWN"
            save_csv(rows, fieldnames)
            raise

        curr_now = get_now_kst()
        timestamp_str = curr_now.strftime("%Y-%m-%d %H:%M:%S")

        if success:
            target_row["상태"] = "SENT"
            target_row["발송일시"] = timestamp_str
            rows[target_idx] = target_row
            save_csv(rows, fieldnames)
            print(f"✅ DB 업데이트 완료: #{no} {comp} -> SENT ({timestamp_str})")
            sent_count += 1
        else:
            # 이메일 주소 오류, 반송 등으로 발송 실패한 경우:
            print(f"⚠️ [발송 실패/반송 감지] #{no} {comp} ({email_addr}) - 유효하지 않은 주소이거나 발송 거부됨.")
            print(f"➡️ DB 상태를 FAILED로 기록하고, 멈추지 않고 즉시 다음 대기자(READY)로 이동합니다...\n")
            target_row["상태"] = "FAILED"
            target_row["발송일시"] = f"{timestamp_str} (발송실패)"
            rows[target_idx] = target_row
            save_csv(rows, fieldnames)
            # 루프를 계속 돌아 즉시 다음 READY 타깃을 찾아 발송 시도함!

    print(f'배치 완료: 개별 발송 시도 {attempt_count}곳 / SMTP 성공 {sent_count}곳 (최대 3곳)')


def run_drip(force=False):
    from pathlib import Path
    from storage import db_lock
    with db_lock(Path(CSV_PATH).parent):
        return _run_drip(force)


if __name__ == "__main__":
    force_run = "--force" in sys.argv
    run_drip(force=force_run)
