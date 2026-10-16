#!/usr/bin/env python3
"""Loopback-only, read-only operations bridge. Never serves the filesystem."""
import datetime as dt
import importlib.util
import json
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
MONITOR = Path('/home/pc/Documents/Server/projects/공통운영/01_서버코드/server-monitor/monitor.py')
LABELS = {'btc':'BTC 가격 수집','alt':'일일·주간 알트','consult':'AI 상담','blog':'블로그 제작·발행','outreach':'검색·분류·콜드메일','bgm':'BGM 제작','production':'영상 제작 환경','backup':'백업'}

def snapshot():
    result = {'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(), 'mode':'local-live', 'cards':{}, 'error':None}
    if not MONITOR.is_file():
        result['error']='서버 모니터 연결 경로를 확인해 주세요.'
        return result
    spec=importlib.util.spec_from_file_location('operations_monitor',MONITOR)
    monitor=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(monitor)
    states,timers=monitor.system_state()
    for key,(state,summary,details) in monitor.cards(states,timers).items():
        result['cards'][key]={'label':LABELS.get(key,key),'state':state,'summary':summary,'details':details}
    for key in ('outreach','blog','consult'):
        if result['cards'][key]['state']=='실행 중':
            result['cards'][key]['state']='작업자 실행 · 결과 별도 확인'
    for group,label in [('prospect','대상 검색·분류'),('mail','콜드메일')]:
        receipt=monitor.receipt('outreach/'+group+'/state',group+'-receipt.json')
        active=bool(receipt.get('started') and not receipt.get('phase'))
        state='처리 중 · 진행 기록 확인' if active else '요청 대기'
        if receipt.get('phase')=='failed': state='최근 처리 실패'
        if group=='mail' and '메일 OFF' in result['cards']['outreach']['summary']: state='발송 OFF'
        result['cards'][group]={'label':label,'state':state,'summary':result['cards']['outreach']['summary'],'details':result['cards']['outreach']['details']}
    # Separate freshness from a service being active; these are actual producer timestamps.
    sources={'btc':monitor.BASE/'databases/gravity/btc-collector/status-minute.json',
             'alt':monitor.BASE/'runtime/gravity/alt/daily-sync-state.json'}
    for key,path in sources.items():
        data=monitor.read(path)
        result['cards'][key]['evidenceAt']=data.get('time') if key=='btc' else data.get('completedAt')
    result['cards']['btc']['maxAgeSeconds']=180
    result['cards']['alt']['maxAgeSeconds']=93600
    result['cards']['cvd']={'label':'CVD · OI 수집','state':'연결 확인 필요','summary':'BTC 가격 수집기는 CVD·OI를 쓰지 않습니다. 별도 수집 작업자와 DB 갱신 시각 연결이 필요합니다.','details':['Coinglass(사용자 표기: 코인레이지) 공급원·수집 권한 확인','가격·CVD·OI의 시간축과 데이터 누락을 각각 검사']}
    return result

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path=self.path.split('?',1)[0]
        if path=='/api/ops':
            try: data=json.dumps(snapshot(),ensure_ascii=False).encode(); status=200
            except Exception: data=b'{"error":"Status collection failed","cards":{}}'; status=503
            self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8')
        else:
            routes={'/':'ops.html','/ops.html':'ops.html','/assets/ops.css':'assets/ops.css','/assets/ops.js':'assets/ops.js','/assets/ops-auth.js':'assets/ops-auth.js'}
            if path not in routes: self.send_error(404); return
            file=ROOT/routes[path]
            if not file.is_file(): self.send_error(404); return
            data=file.read_bytes(); self.send_response(200)
            self.send_header('Content-Type','text/css' if path.endswith('.css') else 'text/javascript' if path.endswith('.js') else 'text/html; charset=utf-8')
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def log_message(self,*args): pass

if __name__=='__main__':
    print('Operations: http://127.0.0.1:8796/ops.html',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8796),Handler).serve_forever()
