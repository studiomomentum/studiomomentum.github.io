#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Studio Momentum - 1시간 주기 텔레메트리 백업 및 무결성 검증 서비스
==============================================================
- 1시간마다 ntfy.sh 원격 이벤트 스트림을 수집
- 매번 새 파일을 찍어내는 대신 단일 영구 마스터 파일(telemetry_master.jsonl)에 신규 증분만 갱신
- 갱신 전 3단계 무결성 검증(수치 역전 여부, JSON 파싱 규격, 통신 정상 여부) 수행
- 이상 감지 시 backup_status.json에 ERROR 기록 -> admin.html 상단에 즉시 경고 배너 표출
- 정상일 때는 배너를 숨김 (backup_status.json: status="OK")
"""

import os
import sys
import json
import tempfile
import fcntl
import urllib.request
import urllib.error
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MASTER_JSONL_PATH = os.path.join(BASE_DIR, "telemetry_master.jsonl")
STATUS_FILE_PATH = os.path.join(BASE_DIR, "backup_status.json")
TARGETS_FILE_PATH = os.path.join(BASE_DIR, "targets.json")

TRACK_TOPIC = "sm_events_2026_x89a"
NTFY_URL = f"https://ntfy.sh/{TRACK_TOPIC}/json?poll=1&since=all"
GAS_DB_URL = "https://script.google.com/macros/s/AKfycbyGHgW1OYt8Xv4fivHmM5CGcVmgUzJtGFCfGWlBtD0Aob_FIZlILsvWvFZx-8zpu_7EUQ/exec"

# 테스트용 제외 토큰
TEST_REFS = {'vip', 'test', 'preview', 'admin', 'dev', 'o3eltr25', 'sample', 'direct'}

def load_status():
    if os.path.exists(STATUS_FILE_PATH):
        try:
            with open(STATUS_FILE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {"status": "OK", "last_backup_time": None, "last_error": None, "error_details": None}

def atomic_json(path, data):
    fd, name = tempfile.mkstemp(dir=BASE_DIR, prefix='.backup-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.flush(); os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def event_key(ev):
    return ev.get('event_id') or ev.get('_msg_id') or ev.get('id') or ev.get('_id') or f"{ev.get('time') or ev.get('timestamp')}_{ev.get('ref')}_{ev.get('event')}"

def save_status(status_obj):
    atomic_json(STATUS_FILE_PATH, status_obj)

def load_existing_master():
    """기존 마스터 백업 파일 로드 및 고유 키 셋 구성"""
    existing_events = []
    seen_keys = set()
    
    if os.path.exists(MASTER_JSONL_PATH):
        with open(MASTER_JSONL_PATH, 'r', encoding='utf-8') as f:
            for line_no, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                    existing_events.append(ev)
                    # 고유 식별 키 생성 (id가 있으면 id, 없으면 time+ref+event 조합)
                    seen_keys.add(event_key(ev))
                except Exception as exc:
                    raise ValueError(f'Master JSONL corrupted at line {line_no}; preserving original') from exc
    return existing_events, seen_keys

def fetch_ntfy_telemetry():
    """ntfy 원격 서버에서 텔레메트리 스트림 수신"""
    req = urllib.request.Request(NTFY_URL, headers={'User-Agent': 'Momentum-Backup-Service/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw_text = resp.read().decode('utf-8')
            return raw_text
    except urllib.error.URLError as e:
        raise RuntimeError(f"ntfy 서버 통신 실패 (네트워크/서버 오류): {str(e)}")
    except Exception as e:
        raise RuntimeError(f"ntfy 데이터 수신 중 오류: {str(e)}")

def parse_and_validate(raw_text, existing_events, seen_keys):
    """3단계 무결성 검증 및 신규 증분 추출"""
    lines = raw_text.strip().split('\n')
    new_events = []
    
    # 1. JSON 규격 및 파싱 검증
    for idx, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            msg_obj = json.loads(line)
        except Exception as e:
            raise ValueError(f"ntfy 수신 데이터 중 라인 #{idx}의 JSON 파싱 실패: {str(e)}")
        
        if msg_obj.get('event') != 'message' or not msg_obj.get('message'):
            continue
        
        msg_str = msg_obj.get('message')
        try:
            payload = json.loads(msg_str)
        except Exception:
            # 문자열 형태의 일반 메시지 등은 건너뜀
            continue
            
        # 텔레메트리 최소 필드 검증
        if not isinstance(payload, dict) or 'event' not in payload:
            continue
            
        ev_id = payload.get('event_id') or msg_obj.get('id')
        if not ev_id:
            ev_id = f"{payload.get('time') or payload.get('timestamp')}_{payload.get('ref')}_{payload.get('event')}"
            
        if ev_id not in seen_keys:
            seen_keys.add(ev_id)
            # 원본 메시지 메타데이터 보존
            payload['_msg_id'] = ev_id
            payload['_backup_collected_at'] = datetime.now().isoformat()
            new_events.append(payload)

    # 2. targets.json 기준 수치 역전 검증 (감소 감지)
    if os.path.exists(TARGETS_FILE_PATH):
        try:
            with open(TARGETS_FILE_PATH, 'r', encoding='utf-8') as f:
                targets_data = json.load(f)
            
            # targets.json에 기록된 최소 기준값
            base_opens = sum(1 for v in targets_data.values() if isinstance(v,dict) and v.get('opened'))
            base_visits = sum(1 for v in targets_data.values() if isinstance(v,dict) and v.get('visited'))
            
            # 합산 검증: 기존 백업 + 신규 백업 결합 후 유효 토큰 수
            all_events = existing_events + new_events
            collected_opens = set()
            collected_visits = set()
            
            for ev in all_events:
                ref = (ev.get('ref') or '').strip().lower()
                if not ref or ref in TEST_REFS or ev.get('is_admin'):
                    continue
                if ev.get('event') in ('email_open', 'open'):
                    collected_opens.add(ref)
                elif ev.get('event') in ('visit', 'scroll_50', 'scroll_90', 'duration_10s', 'duration_30s', 'leave', 'cta_click'):
                    collected_visits.add(ref)
            
            # 치명적 수치 역전 발생 여부 확인
            # (수집된 토큰 수가 기준치보다 현저히 모자라거나 데이터가 파손된 경우)
            if base_opens > 0 and len(collected_opens) < (base_opens - 5): # 5개 이상 비정상 누락 시 비상
                raise ValueError(f"열람 수치 이상 감지: DB 기준({base_opens}건) 대비 수집 집합({len(collected_opens)}건)이 비정상적으로 적습니다.")
                
        except json.JSONDecodeError:
            raise ValueError("targets.json 파일이 손상되어 무결성 검증을 완료할 수 없습니다.")
        except Exception as e:
            if isinstance(e, ValueError):
                raise
            # 파일 읽기 오류 등
            pass

    return new_events

def _run_backup():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    status = load_status()
    
    try:
        # 1. 기존 마스터 로드
        existing_events, seen_keys = load_existing_master()
        
        # 2. ntfy 원격 데이터 수신
        raw_text = fetch_ntfy_telemetry()
        
        # 3. 데이터 무결성 검증 및 증분 추출
        new_events = parse_and_validate(raw_text, existing_events, seen_keys)
        
        pending_path = os.path.join(BASE_DIR, 'telemetry_pending.json')
        pending = []
        if os.path.exists(pending_path):
            with open(pending_path, encoding='utf-8') as stream:
                pending = json.load(stream)
            if not isinstance(pending, list): raise ValueError('Invalid telemetry outbox')
        queued = {event_key(ev): ev for ev in pending + new_events}
        pending = list(queued.values())
        # Save outbox before master append: a crash cannot lose the remote retry.
        atomic_json(pending_path, pending)
        master_keys = {event_key(ev) for ev in existing_events}
        recoverable = [ev for ev in pending if event_key(ev) not in master_keys]
        if recoverable:
            with open(MASTER_JSONL_PATH, 'a', encoding='utf-8') as f:
                for ev in recoverable:
                    f.write(json.dumps(ev, ensure_ascii=False) + '\n')
                f.flush(); os.fsync(f.fileno())
        if GAS_DB_URL:
            while pending:
                batch = pending[:100]
                payload_bytes = json.dumps(batch, ensure_ascii=False).encode('utf-8')
                req = urllib.request.Request(GAS_DB_URL, data=payload_bytes, headers={'Content-Type':'text/plain;charset=UTF-8'})
                with urllib.request.urlopen(req, timeout=20) as response:
                    result = json.load(response)
                if not isinstance(result, dict) or result.get('status') not in ('SUCCESS','OK'):
                    raise ValueError('Drive did not acknowledge persistence; outbox preserved')
                pending = pending[len(batch):]
                atomic_json(pending_path, pending)
        if new_events:
            updated_msg = f"신규 {len(new_events)}건 검증 통과 및 갱신 완료 (총 {len(existing_events) + len(new_events)}건 보존)"
        else:
            updated_msg = f"검증 완료: 신규 추가 이벤트 없음 (기존 {len(existing_events)}건 정상 유지)"

        # 5. 정상 상태 기록 (admin 배너 안 띄움)
        status["status"] = "OK"
        status["last_backup_time"] = now_str
        status["last_message"] = updated_msg
        status["last_error"] = None
        status["error_details"] = None
        save_status(status)
        print(f"[{now_str}] SUCCESS: {updated_msg}")
        return True

    except Exception as e:
        error_msg = str(e)
        status["status"] = "ERROR"
        status["last_failed_time"] = now_str
        status["last_error"] = error_msg
        status["error_details"] = f"검증 실패 시각: {now_str}\n원인: {error_msg}"
        save_status(status)
        print(f"[{now_str}] CRITICAL BACKUP VALIDATION FAILED: {error_msg}", file=sys.stderr)
        return False

def run_backup():
    with open(os.path.join(BASE_DIR, '.backup.lock'), 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return _run_backup()


if __name__ == "__main__":
    success = run_backup()
    sys.exit(0 if success else 1)
