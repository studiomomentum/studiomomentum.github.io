"""Durable, allowlisted controls for BTC and aight. No arbitrary shell commands."""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import sqlite3
import subprocess
import time
import uuid

BASE=Path('/home/pc/Documents/Server')
STATE=Path(os.environ.get('CONTROL_STATE',str(BASE/'runtime/control-center')))
DB=STATE/'controls.sqlite3'
BOT=BASE/'backends/botfactory'
BOTDATA=BASE/'databases/botfactory'
AIGHT=BASE/'databases/aight'
ARTIFACTS=AIGHT/'artifacts'
ACTIONS={
 'btc.verify':('btc','데이터 검증','btc'),
 'btc.minute.run':('btc','BTC 1분봉 즉시 수집','btc'),
 'btc.intervals.run':('btc','BTC 다른 시간봉 수집','btc'),
 'btc.daily.run':('btc','일일 알트 실행','btc'),
 'btc.weekly.run':('btc','주간 알트 실행','btc'),
 'btc.schedule.pause':('btc','자동 예약 중지','btc'),
 'btc.schedule.resume':('btc','자동 예약 재개','btc'),
 'aight.project.save':('aight','제작 프로젝트 저장','aight'),
 'aight.project.package':('aight','제작 지시서 생성','aight'),
 'aight.research.run':('aight','영상 리서치 실행','aight'),
 'aight.plan.run':('aight','콘텐츠 기획 실행','aight'),
 'aight.capture.run':('aight','근거 자료 수집','aight'),
 'aight.script.run':('aight','대본 제작 실행','aight'),
 'aight.mac.prepare':('aight','맥북에 제작 지시서 전달','mac'),
 'aight.mac.images':('aight','ComfyUI 이미지 제작','mac'),
 'aight.mac.son':('aight','손 편집기 제작 요청','mac'),
 'aight.worker.pair':('aight','맥북 연결 코드 발급','aight'),
 'aight.backup.verify':('aight','제작 산출물 백업 검증','aight'),
 'aight.youtube.upload':('aight','YouTube 비공개 업로드','aight'),
}
SERVICES={'btc.minute.run':'gravity-btc-minute','btc.intervals.run':'gravity-btc-intervals','btc.daily.run':'gravity-alt-daily','btc.weekly.run':'gravity-alt-weekly'}
TIMERS={'prices':['gravity-btc-minute','gravity-btc-intervals'],'alt':['gravity-alt-daily','gravity-alt-weekly']}
STAGES={'research':'youtube_research_bot','plan':'content_planner_bot','capture':'reference_capture_bot','script':'longform_script_bot'}

def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def clean(value):
    text=str(value)
    text=re.sub(r'(?i)(bearer\s+|(?:access_token|refresh_token|workerToken|password|secret)["\s:=]+)[\w.\-/+]{12,}',r'\1[redacted]',text)
    return re.sub(r'\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,})\b','[redacted]',text)
def connect():
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    db=sqlite3.connect(DB,timeout=10);db.row_factory=sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA busy_timeout=10000')
    db.executescript('''CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, project TEXT, action TEXT, resource TEXT, params TEXT, status TEXT, message TEXT, created_at TEXT, started_at TEXT, finished_at TEXT, result TEXT, error TEXT);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,title TEXT,brief TEXT,script TEXT,scenes TEXT,revision INTEGER,created_at TEXT,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS workers(id TEXT PRIMARY KEY,name TEXT,token_hash TEXT,last_seen TEXT,capabilities TEXT);
    CREATE TABLE IF NOT EXISTS pairing(hash TEXT PRIMARY KEY,expires REAL,used INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,job_id TEXT,worker_id TEXT,name TEXT,sha TEXT,size INTEGER,received INTEGER,complete INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS youtube(sha TEXT PRIMARY KEY,session_url TEXT,video_id TEXT,updated_at TEXT);''')
    DB.chmod(0o600);return db

def job_view(row):
    return {'id':row['id'],'requestId':row['request_id'],'project':row['project'],'action':row['action'],'label':ACTIONS[row['action']][1], 'status':row['status'],'message':row['message'],'createdAt':row['created_at'],'startedAt':row['started_at'],'finishedAt':row['finished_at'],'params':json.loads(row['params']),'result':json.loads(row['result']) if row['result'] else None,'error':row['error']}
def text_field(p,key,maximum,required=False):
    value=p.get(key,'')
    if not isinstance(value,str) or len(value)>maximum or (required and not value.strip()) or '\x00' in value:raise ValueError('INVALID_'+key.upper())
    return value.strip()
def project(db,p):
    value=db.execute('SELECT * FROM projects WHERE id=?',(p.get('projectId'),)).fetchone()
    if not value:raise ValueError('PROJECT_NOT_FOUND')
    return dict(value)
def project_view(row):return {'id':row['id'],'title':row['title'],'brief':row['brief'],'script':row['script'],'scenes':json.loads(row['scenes']),'revision':row['revision'],'updatedAt':row['updated_at']}
def catalog():
    values=[]
    for kind,folder in STAGES.items():
        root=(BOTDATA/folder/'results').resolve()
        for p in sorted(root.glob('*.json'),key=lambda p:p.stat().st_mtime,reverse=True)[:60]:
            if p.is_symlink() or p.stat().st_size>8*1024*1024:continue
            ident=hashlib.sha256((kind+':'+p.name).encode()).hexdigest()[:32]
            values.append({'id':ident,'kind':kind,'name':p.name,'size':p.stat().st_size,'modifiedAt':dt.datetime.fromtimestamp(p.stat().st_mtime,dt.timezone.utc).isoformat()})
    if ARTIFACTS.exists():
        for p in sorted(ARTIFACTS.glob('*/*'),key=lambda p:p.stat().st_mtime,reverse=True)[:80]:
            if not p.is_file() or p.is_symlink() or p.name.endswith('.pending'):continue
            rel=p.relative_to(ARTIFACTS).as_posix();ident=hashlib.sha256(('production:'+rel).encode()).hexdigest()[:32]
            values.append({'id':ident,'kind':'production','name':p.name,'folder':p.parent.name,'size':p.stat().st_size,'modifiedAt':dt.datetime.fromtimestamp(p.stat().st_mtime,dt.timezone.utc).isoformat()})
    return values

def artifact(ident,kind=None):
    entry=next((a for a in catalog() if a['id']==ident and (not kind or a['kind']==kind)),None)
    if not entry:raise ValueError('ARTIFACT_NOT_FOUND')
    p=(ARTIFACTS/entry['folder']/entry['name']) if entry['kind']=='production' else BOTDATA/STAGES[entry['kind']]/'results'/entry['name']
    roots=[ARTIFACTS.resolve(),BOTDATA.resolve()]
    resolved=p.resolve()
    if p.is_symlink() or not any(resolved.is_relative_to(root) for root in roots):raise ValueError('INVALID_ARTIFACT')
    return p,entry

def validate(action,params):
    if action not in ACTIONS or not isinstance(params,dict):raise ValueError('INVALID_ACTION')
    if params.get('projectId') and not re.fullmatch('[a-f0-9]{32}',str(params['projectId'])):raise ValueError('INVALID_PROJECT_ID')
    if 'revision' in params and (not isinstance(params['revision'],int) or params['revision']<1):raise ValueError('INVALID_REVISION')
    if len(json.dumps(params))>300000:raise ValueError('PAYLOAD_TOO_LARGE')
    allowed={
     'btc.verify':set(),'btc.minute.run':set(),'btc.intervals.run':set(),'btc.daily.run':set(),'btc.weekly.run':set(),
     'btc.schedule.pause':{'group'},'btc.schedule.resume':{'group'},
     'aight.project.save':{'projectId','title','brief','script','scenes','revision'},
     'aight.project.package':{'projectId'},'aight.research.run':{'keyword','projectId'},
     'aight.plan.run':{'researchId','hint','projectId'},'aight.capture.run':{'planId','projectId'},
     'aight.script.run':{'planId','captureId','projectId'},
     'aight.mac.prepare':{'projectId'},'aight.mac.images':{'projectId'},'aight.mac.son':{'projectId'},
     'aight.worker.pair':set(),'aight.backup.verify':set(),'aight.youtube.upload':{'artifactId','title','description'},
    }[action]
    if set(params)-allowed:raise ValueError('INVALID_PARAMETER')
    if action.startswith('btc.schedule.') and params.get('group') not in TIMERS:raise ValueError('INVALID_GROUP')
    if action=='aight.project.save':
        text_field(params,'title',200,True);text_field(params,'brief',10000);text_field(params,'script',100000)
        scenes=params.get('scenes',[])
        if not isinstance(scenes,list) or len(scenes)>100:raise ValueError('INVALID_SCENES')
        for scene in scenes:
            if not isinstance(scene,dict) or set(scene)-{'name','prompt','kind'}:raise ValueError('INVALID_SCENE')
            text_field(scene,'name',120,True);text_field(scene,'prompt',4000,True)
            if scene.get('kind','background') not in ['background','png']:raise ValueError('INVALID_SCENE_KIND')
    if action=='aight.research.run':text_field(params,'keyword',200,True)
    if action=='aight.plan.run':artifact(params.get('researchId'),'research');text_field(params,'hint',1000)
    if action in ['aight.capture.run','aight.script.run']:artifact(params.get('planId'),'plan')
    if action=='aight.script.run':artifact(params.get('captureId'),'capture')
    if action=='aight.youtube.upload':
        p,_=artifact(params.get('artifactId'),'production')
        if p.suffix.lower()!='.mp4':raise ValueError('VIDEO_REQUIRED')
        text_field(params,'title',100,True);text_field(params,'description',5000)
        if not (BASE/'config/aight/youtube-oauth.json').is_file():raise ValueError('YOUTUBE_CONNECTION_REQUIRED')
    if action not in ['aight.project.save','aight.research.run','aight.plan.run','aight.capture.run','aight.script.run'] and 'projectId' in allowed:
        with connect() as db:project(db,params)

def submit(request_id,action,params):
    if not isinstance(request_id,str) or not re.fullmatch(r'[a-zA-Z0-9-]{16,80}',request_id):raise ValueError('INVALID_REQUEST_ID')
    validate(action,params);serialized=json.dumps(params,sort_keys=True,ensure_ascii=False)
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        old=db.execute('SELECT * FROM jobs WHERE request_id=?',(request_id,)).fetchone()
        if old:
            if old['action']!=action or old['params']!=serialized:raise ValueError('REQUEST_ID_CONFLICT')
            return job_view(old)
        proj,label,resource=ACTIONS[action]
        if db.execute("SELECT COUNT(*) FROM jobs WHERE status IN ('queued','running','waiting')").fetchone()[0]>=30:raise ValueError('QUEUE_FULL')
        ident=uuid.uuid4().hex;state='waiting' if resource=='mac' else 'queued'
        db.execute('INSERT INTO jobs(id,request_id,project,action,resource,params,status,message,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(ident,request_id,proj,action,resource,serialized,state,'맥북 작업자 접수 대기' if state=='waiting' else '실행 대기',now()))
        return job_view(db.execute('SELECT * FROM jobs WHERE id=?',(ident,)).fetchone())

def finish(ident,status,message,result=None,error=None):
    with connect() as db:db.execute('UPDATE jobs SET status=?,message=?,result=?,error=?,finished_at=? WHERE id=?',(status,clean(message),json.dumps(result,ensure_ascii=False) if result is not None else None,clean(error)[:1000] if error else None,now(),ident))
def cancel(ident):
    with connect() as db:
        row=db.execute('SELECT * FROM jobs WHERE id=?',(ident,)).fetchone()
        if not row:raise ValueError('JOB_NOT_FOUND')
        if row['status'] not in ['queued','waiting']:raise ValueError('ONLY_QUEUED_JOB_CAN_CANCEL')
        db.execute("UPDATE jobs SET status='cancelled',message='운영자가 실행 전 취소',finished_at=? WHERE id=?",(now(),ident))
        return job_view(db.execute('SELECT * FROM jobs WHERE id=?',(ident,)).fetchone())

def system(args,timeout=10):
    result=subprocess.run(['/usr/bin/systemctl',*args],capture_output=True,text=True,timeout=timeout,check=False)
    return result

def units_state():
    values=[]
    for group,units in TIMERS.items():
        for unit in units:
            r=system(['show',unit+'.timer','--property=ActiveState,NextElapseUSecRealtime,UnitFileState']);d=dict(line.split('=',1) for line in r.stdout.splitlines() if '=' in line)
            values.append({'group':group,'unit':unit,'enabled':d.get('ActiveState')=='active','persistent':d.get('UnitFileState')=='enabled','next':d.get('NextElapseUSecRealtime') or None,'readable':r.returncode==0})
    return values

def state(project_name):
    if project_name not in ['btc','aight']:raise ValueError('INVALID_PROJECT')
    with connect() as db:
        jobs=[job_view(r) for r in db.execute('SELECT * FROM jobs WHERE project=? ORDER BY created_at DESC LIMIT 40',(project_name,))]
        projects=[project_view(r) for r in db.execute('SELECT * FROM projects ORDER BY updated_at DESC LIMIT 60')]
        workers=[{'id':r['id'],'name':r['name'],'lastSeen':r['last_seen'],'online':time.time()-dt.datetime.fromisoformat(r['last_seen']).timestamp()<90,'capabilities':json.loads(r['capabilities'])} for r in db.execute('SELECT * FROM workers')]
    online={w['id'] for w in workers if w['online']}
    for job in jobs:
        if job['action'].startswith('aight.mac.') and job['status']=='running':
            job['workerOnline']=(job['result'] or {}).get('workerId') in online
    return {'project':project_name,'checkedAt':now(),'jobs':jobs,'projects':projects if project_name=='aight' else [],'workers':workers if project_name=='aight' else [],'artifacts':catalog() if project_name=='aight' else [],'timers':units_state() if project_name=='btc' else [],'actions':[{'id':key,'label':label} for key,(proj,label,_) in ACTIONS.items() if proj==project_name],'youtubeConnected':(BASE/'config/aight/youtube-oauth.json').is_file(),'editor':'손'}

def bot_command(action,params):
    kind=action.split('.')[1];bot=STAGES[kind]
    command=[str(STATE/'bot-venv/bin/python'),str(BOT/'main_orchestrator.py'),bot,'--json-result']
    if kind=='research':command+=['--keyword',params['keyword'],'--top_n','5','--download_subtitles','true']
    if kind=='plan':command+=['--result_json_path',str(artifact(params['researchId'],'research')[0]),'--new_topic_hint',params.get('hint',''),'--output_count','1']
    if kind in ['capture','script']:command+=['--content_plan_path',str(artifact(params['planId'],'plan')[0]),'--plan_index','1']
    if kind=='script':command+=['--capture_result_path',str(artifact(params['captureId'],'capture')[0])]
    return command

def execute(row):
    ident=row['id'];action=row['action'];params=json.loads(row['params']);validate(action,params)
    if action in SERVICES:
        unit=SERVICES[action];before=system(['show',unit+'.service','--property=ActiveState,InvocationID,ConditionResult'])
        props=dict(line.split('=',1) for line in before.stdout.splitlines() if '=' in line)
        if props.get('ActiveState') in ['active','activating']:raise ValueError('SERVICE_ALREADY_RUNNING')
        with connect() as db:db.execute('UPDATE jobs SET message=? WHERE id=?',('기존 서버 작업 실행 중 · 완료 및 결과 확인',ident))
        r=subprocess.run(['/usr/bin/sudo','-n','/usr/bin/systemctl','start',unit+'.service'],capture_output=True,text=True,timeout=3700)
        if r.returncode:raise RuntimeError('SERVICE_FAILED: '+clean(r.stderr)[-700:])
        after=system(['show',unit+'.service','--property=Result,ExecMainStatus,InvocationID,ConditionResult'])
        p=dict(line.split('=',1) for line in after.stdout.splitlines() if '=' in line)
        if p.get('ConditionResult')!='yes':raise RuntimeError('SERVICE_GUARD_DISABLED')
        if p.get('Result')!='success' or p.get('ExecMainStatus')!='0' or p.get('InvocationID')==props.get('InvocationID'):raise RuntimeError('SERVICE_RESULT_NOT_VERIFIED')
        return {'unit':unit,'result':'success','invocationId':p.get('InvocationID')},'서버 작업 정상 종료 · 수집 기록에서 원본 갱신 시각 확인'
    if action.startswith('btc.schedule.'):
        units=TIMERS[params['group']];resume=action.endswith('resume');verb='enable' if resume else 'disable'
        for unit in units:
            r=subprocess.run(['/usr/bin/sudo','-n','/usr/bin/systemctl',verb,'--now',unit+'.timer'],capture_output=True,text=True,timeout=15)
            if r.returncode:raise RuntimeError('TIMER_CONTROL_FAILED')
        verified=[v for v in units_state() if v['group']==params['group']]
        if not all(v['readable'] and v['enabled']==resume and v['persistent']==resume for v in verified):raise RuntimeError('TIMER_READBACK_FAILED')
        return {'timers':verified},'예약 재개 확인' if resume else '신규 예약 중지 확인 · 진행 중인 작업은 유지'
    if action=='btc.verify':
        path=BASE/'databases/gravity/btc-collector';results=[]
        for group in ['minute','intervals']:
            file=path/('status-'+group+'.json');value=json.loads(file.read_text());items=value.get('results',[])
            if not isinstance(items,list) or not items:raise ValueError('BTC_RECEIPT_MISSING')
            results.append({'group':group,'time':value.get('time'),'frames':len(items),'saved':sum(i.get('status') in ['saved','current'] for i in items),'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
        return {'receipts':results,'timers':units_state()},'저장 영수증·시간봉 목록·예약 상태 검증 완료'
    if action=='aight.project.save':
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');pid=params.get('projectId') or uuid.uuid4().hex
            previous=db.execute('SELECT * FROM projects WHERE id=?',(pid,)).fetchone()
            if previous and params.get('revision')!=previous['revision']:raise ValueError('PROJECT_VERSION_CONFLICT')
            revision=(previous['revision'] if previous else 0)+1
            db.execute('INSERT OR REPLACE INTO projects VALUES(?,?,?,?,?,?,?,?)',(pid,params['title'],params.get('brief',''),params.get('script',''),json.dumps(params.get('scenes',[]),ensure_ascii=False),revision,previous['created_at'] if previous else now(),now()))
        return {'projectId':pid,'revision':revision},'제작 프로젝트 저장 완료'
    if action=='aight.project.package':
        with connect() as db:p=project(db,params)
        folder=ARTIFACTS/ident;folder.mkdir(parents=True,exist_ok=True,mode=0o700)
        manifest={'schemaVersion':1,'project':project_view(p),'editor':'손','createdAt':now(),'jobId':ident,'outputContract':{'result':'render_result.json','video':'final.mp4','backupRequires':'sha256 readback'}}
        (folder/'production.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(folder/'script.txt').write_text(p['script'])
        return {'projectId':p['id'],'files':['production.json','script.txt'],'manifestSha256':hashlib.sha256((folder/'production.json').read_bytes()).hexdigest()},'맥북 제작 지시서와 대본 파일 생성 완료'
    if action=='aight.worker.pair':
        code=secrets.token_hex(6)
        with connect() as db:db.execute('INSERT INTO pairing VALUES(?,?,0)',(hashlib.sha256(code.encode()).hexdigest(),time.time()+600))
        return {'pairCode':code,'expiresAt':dt.datetime.fromtimestamp(time.time()+600,dt.timezone.utc).isoformat()},'맥북 연결 코드 발급 · 10분 동안 유효'
    if action=='aight.backup.verify':
        with connect() as db:rows=db.execute('SELECT * FROM uploads WHERE complete=1').fetchall()
        verified=[]
        for r in rows:
            p=ARTIFACTS/r['job_id']/r['name']
            with p.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
            if digest!=r['sha'] or p.stat().st_size!=r['size']:raise ValueError('BACKUP_HASH_MISMATCH')
            verified.append({'name':r['name'],'size':r['size'],'sha256':digest})
        if not verified:raise ValueError('NO_RECEIVED_BACKUP_ARTIFACTS')
        return {'verified':verified},'맥북에서 수신한 산출물의 크기와 SHA-256 검증 완료'
    if action=='aight.youtube.upload':
        from youtube_upload import upload
        return upload(ident,params),'YouTube 비공개 업로드 완료'
    if action.endswith('.run') and action.startswith('aight.'):
        from bot_runner import run_bot
        return run_bot(ident,action,params),'실행기 결과 및 생성 파일 확인 완료'
    raise ValueError('INVALID_ACTION')

def run_next(resource):
    with connect() as db:
        db.execute('BEGIN IMMEDIATE');row=db.execute("SELECT * FROM jobs WHERE resource=? AND status='queued' ORDER BY created_at LIMIT 1",(resource,)).fetchone()
        if not row:return False
        db.execute("UPDATE jobs SET status='running',message='작업 실행 중',started_at=? WHERE id=?",(now(),row['id']))
        row=dict(row)
    try:result,message=execute(row);finish(row['id'],'succeeded',message,result)
    except Exception as e:finish(row['id'],'blocked' if isinstance(e,ValueError) else 'failed','작업 완료를 확인하지 못했습니다.',error=str(e))
    return True

def recover(resource):
    with connect() as db:db.execute("UPDATE jobs SET status='interrupted',message='실행기 재시작 · 실제 결과를 확인한 뒤 재시도',finished_at=? WHERE resource=? AND status='running'",(now(),resource))

def worker_auth(token):
    if not isinstance(token,str) or not re.fullmatch('[a-f0-9]{64}',token):raise ValueError('WORKER_UNAUTHORIZED')
    with connect() as db:row=db.execute('SELECT * FROM workers WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    if not row:raise ValueError('WORKER_UNAUTHORIZED')
    return dict(row)

def pair(code,name):
    if not isinstance(code,str) or not re.fullmatch('[a-f0-9]{12}',code):raise ValueError('PAIR_CODE_INVALID')
    if not isinstance(name,str) or not 1<=len(name)<=80:raise ValueError('INVALID_WORKER_NAME')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE');row=db.execute('SELECT * FROM pairing WHERE hash=?',(hashlib.sha256(code.encode()).hexdigest(),)).fetchone()
        if not row or row['used'] or row['expires']<time.time():raise ValueError('PAIR_CODE_INVALID')
        db.execute('UPDATE pairing SET used=1 WHERE hash=?',(row['hash'],));ident=uuid.uuid4().hex;token=secrets.token_hex(32)
        db.execute('INSERT INTO workers VALUES(?,?,?,?,?)',(ident,name,hashlib.sha256(token.encode()).hexdigest(),now(),'{}'))
    return {'workerId':ident,'workerToken':token}

def worker_call(action,token,p):
    worker=worker_auth(token)
    if action=='heartbeat':
        caps={k:bool(p.get('capabilities',{}).get(k)) for k in ['son','comfy','workflow']}
        with connect() as db:db.execute('UPDATE workers SET last_seen=?,capabilities=? WHERE id=?',(now(),json.dumps(caps),worker['id']))
        return {'ok':True}
    if action=='claim':
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');row=db.execute("SELECT * FROM jobs WHERE resource='mac' AND status='running' AND json_extract(result,'$.workerId')=? ORDER BY created_at LIMIT 1",(worker['id'],)).fetchone()
            if not row:row=db.execute("SELECT * FROM jobs WHERE resource='mac' AND status='waiting' ORDER BY created_at LIMIT 1").fetchone()
            if not row:return {'job':None}
            pjt=project(db,json.loads(row['params']));result=json.loads(row['result']) if row['status']=='running' else {'workerId':worker['id'],'projectRevision':pjt['revision'],'sceneKinds':[s.get('kind','background') for s in json.loads(pjt['scenes'])]}
            db.execute("UPDATE jobs SET status='running',started_at=?,message='맥북 작업자 접수 완료',result=? WHERE id=?",(now(),json.dumps(result),row['id']))
            return {'job':{'id':row['id'],'action':row['action'],'project':project_view(pjt)}}
    with connect() as db:row=db.execute('SELECT * FROM jobs WHERE id=?',(p.get('jobId'),)).fetchone()
    if not row or row['resource']!='mac' or json.loads(row['result'] or '{}').get('workerId')!=worker['id']:raise ValueError('INVALID_WORKER_JOB')
    if action=='complete' and row['status'] in ['succeeded','failed','blocked']:return {'ok':True}
    if row['status']!='running':raise ValueError('INVALID_WORKER_JOB')
    if action=='progress':
        message=text_field(p,'message',500,True)
        with connect() as db:db.execute('UPDATE jobs SET message=? WHERE id=?',(clean(message),row['id']))
        return {'ok':True}
    if action=='complete':
        status=p.get('status');result=p.get('result',{})
        if status not in ['succeeded','failed','blocked'] or len(json.dumps(result))>12000:raise ValueError('INVALID_WORKER_RESULT')
        # A production success requires a verified uploaded receipt, not merely app launch.
        if row['action']=='aight.mac.images' and status=='succeeded':
            with connect() as db:images=db.execute("SELECT * FROM uploads WHERE job_id=? AND complete=1 AND name LIKE '%.png'",(row['id'],)).fetchall()
            kinds=json.loads(row['result']).get('sceneKinds',[])
            if not kinds or {i['name'] for i in images}!={f'scene_{n+1:03d}.png' for n in range(len(kinds))}:raise ValueError('VERIFIED_IMAGE_REQUIRED')
            for index,kind in enumerate(kinds):verify_png(ARTIFACTS/row['id']/f'scene_{index+1:03d}.png',kind=='png')
        if row['action']=='aight.mac.son' and status=='succeeded':
            with connect() as db:video=db.execute("SELECT * FROM uploads WHERE job_id=? AND complete=1 AND name LIKE '%.mp4'",(row['id'],)).fetchone()
            if not video:raise ValueError('VERIFIED_VIDEO_REQUIRED')
            verify_video(ARTIFACTS/row['id']/video['name'])
        finish(row['id'],status,text_field(p,'message',500,True),{**json.loads(row['result']),**result,'workerId':worker['id']},text_field(p,'error',1000) or None);return {'ok':True}
    if action=='upload':return receive_upload(worker,row,p)
    raise ValueError('INVALID_WORKER_ACTION')

def receive_upload(worker,job,p):
    name=p.get('name');sha=p.get('sha256');size=p.get('size');offset=p.get('offset');raw=p.get('data')
    if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}\.(?:mp4|png|jpg|json|txt|fcpxml)',name):raise ValueError('INVALID_FILENAME')
    if not isinstance(sha,str) or not re.fullmatch('[a-f0-9]{64}',sha) or not isinstance(size,int) or not 0<size<=20*1024**3:raise ValueError('INVALID_UPLOAD')
    if not isinstance(offset,int) or offset<0 or not isinstance(raw,str) or len(raw)>750000:raise ValueError('INVALID_CHUNK')
    chunk=base64.b64decode(raw,validate=True)
    if len(chunk)>524288 or offset+len(chunk)>size:raise ValueError('INVALID_CHUNK')
    uid=hashlib.sha256((job['id']+':'+name).encode()).hexdigest();folder=ARTIFACTS/job['id'];folder.mkdir(parents=True,exist_ok=True,mode=0o700);file=folder/(name+'.pending')
    with connect() as db:
        db.execute('BEGIN IMMEDIATE');old=db.execute('SELECT * FROM uploads WHERE id=?',(uid,)).fetchone()
        if old and (old['sha']!=sha or old['size']!=size):raise ValueError('UPLOAD_CONFLICT')
        if old and old['complete']:return {'received':size,'verified':True}
        actual=file.stat().st_size if file.exists() else 0
        if offset<actual:return {'received':actual,'verified':False}
        if offset!=actual:raise ValueError('UPLOAD_OFFSET_MISMATCH')
        with file.open('ab') as stream:stream.write(chunk);stream.flush();os.fsync(stream.fileno())
        total=actual+len(chunk);verified=False
        if total==size:
            with file.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
            if digest!=sha:raise ValueError('UPLOAD_HASH_MISMATCH')
            os.replace(file,folder/name);verified=True
        db.execute('INSERT OR REPLACE INTO uploads VALUES(?,?,?,?,?,?,?,?)',(uid,job['id'],worker['id'],name,sha,size,total,int(verified)))
    return {'received':total,'verified':verified}

def summary_cards():
    with connect() as db:
        recent=db.execute("SELECT action,status,message FROM jobs WHERE project='aight' ORDER BY created_at DESC LIMIT 20").fetchall()
        workers=db.execute('SELECT * FROM workers').fetchall()
    live=[r for r in workers if time.time()-dt.datetime.fromisoformat(r['last_seen']).timestamp()<90]
    def latest(prefix,fallback):
        row=next((r for r in recent if r['action'].startswith(prefix)),None)
        if row and row['status'] in ['running','waiting','queued']:return {'running':'실행 중','waiting':'맥북 접수 대기','queued':'실행 대기'}[row['status']]
        if row and row['status'] in ['failed','blocked','interrupted']:return '최근 작업 확인 필요'
        return fallback
    caps=[json.loads(r['capabilities']) for r in live]
    return {
     'aight-plan':{'label':'기획 · 대본','state':latest('aight.plan.','실행 가능'),'summary':'기존 Bot Factory 리서치·기획·근거 수집·대본 실행기','details':['aight 실행 메뉴에서 저장된 자료를 선택해 작업을 접수합니다.']},
     'aight-assets':{'label':'ComfyUI 이미지','state':latest('aight.mac.images','실행 가능' if any(c.get('comfy') and c.get('workflow') for c in caps) else '맥북 이미지 연결 필요'),'summary':'장면별 이미지 생성 및 서버 수신 검증','details':['맥북 연결과 ComfyUI workflow·프롬프트 노드 설정이 필요합니다.']},
     'aight-edit':{'label':'손 · 백업','state':latest('aight.mac.son','실행 가능' if any(c.get('son') for c in caps) else '맥북 손 연결 필요'),'summary':'제작 지시서 전달 → 손 결과 영수증 → 영상 백업 해시 검증','details':['앱 실행만으로 제작 완료를 표시하지 않습니다.']},
     'aight-publish':{'label':'YouTube 업로드','state':latest('aight.youtube.','비공개 업로드 가능' if (BASE/'config/aight/youtube-oauth.json').is_file() else 'YouTube 연결 필요'),'summary':'검증된 백업 MP4만 비공개로 업로드','details':['OAuth 연결 설정이 없는 상태에서는 업로드를 실행하지 않습니다.']},
    }


def verify_png(file,alpha=False):
    import struct,zlib
    with file.open('rb') as stream:
        if stream.read(8)!=b'\x89PNG\r\n\x1a\n':raise ValueError('INVALID_PNG_BACKUP')
        seen=set()
        while True:
            header=stream.read(8)
            if len(header)!=8:raise ValueError('INVALID_PNG_BACKUP')
            length,kind=struct.unpack('>I4s',header)
            if length>30*1024*1024:raise ValueError('INVALID_PNG_BACKUP')
            data=stream.read(length);crc=stream.read(4)
            if len(data)!=length or len(crc)!=4 or zlib.crc32(kind+data)&0xffffffff!=int.from_bytes(crc,'big'):raise ValueError('INVALID_PNG_BACKUP')
            seen.add(kind)
            if kind==b'IHDR':
                if len(data)!=13:raise ValueError('INVALID_PNG_BACKUP')
                width,height=struct.unpack('>II',data[:8])
                if not 0<width<=16384 or not 0<height<=16384:raise ValueError('INVALID_PNG_BACKUP')
                if alpha and data[9] not in [4,6]:raise ValueError('TRANSPARENT_PNG_REQUIRED')
            if kind==b'IEND':break
        if not {b'IHDR',b'IDAT',b'IEND'}.issubset(seen):raise ValueError('INVALID_PNG_BACKUP')

def verify_video(file):
    probe=shutil.which('ffprobe')
    if not probe:raise ValueError('VIDEO_PROBE_REQUIRED')
    result=subprocess.run([probe,'-v','error','-show_streams','-show_format','-of','json',str(file)],capture_output=True,text=True,timeout=60)
    try:value=json.loads(result.stdout)
    except ValueError:raise ValueError('INVALID_VIDEO_BACKUP')
    if result.returncode or not any(s.get('codec_type')=='video' for s in value.get('streams',[])):raise ValueError('INVALID_VIDEO_BACKUP')
