"""Verified Drive snapshots. Runtime databases stay local; archives stay in owner Drive."""
import contextlib,datetime as dt,fcntl,hashlib,json,os,time
from pathlib import Path
import sqlite3,subprocess,tempfile,zipfile,sys,urllib.request,urllib.error,urllib.parse

BASE=Path('/home/pc/Documents/Server')
STATE=BASE/'runtime/control-center'
CONFIG=BASE/'config/control-center/drive-backup.json'
STATUS=STATE/'drive-backup-status.json'
REQUEST=STATE/'drive-backup-request.json'
LIVE=BASE/'databases/outreach/live'

def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700);temp=path.with_suffix('.pending');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2));temp.chmod(0o600);os.replace(temp,path)
def read(path):
    try:return json.loads(path.read_text())
    except FileNotFoundError:return {}
def digest(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def upload_verified(local,relative):
    config=read(CONFIG)
    sys.path.insert(0,str(BASE/'backends/btc-collector'))
    from drive_transport import Drive
    drive=Drive();parent=config['rootId'];parts=relative.split('/')
    for name in parts[:-1]:
        found=drive.list(parent,name)
        if len(found)>1:raise RuntimeError('DRIVE_DUPLICATE_FOLDER')
        folder=found[0] if found else json.loads(drive.request('drive/v3/files?fields=id,name,mimeType','POST',json.dumps({'name':name,'parents':[parent],'mimeType':'application/vnd.google-apps.folder'}).encode(),'application/json'))
        if folder['mimeType']!='application/vnd.google-apps.folder':raise RuntimeError('DRIVE_INVALID_FOLDER')
        parent=folder['id']
    found=drive.list(parent,parts[-1])
    if len(found)>1:raise RuntimeError('DRIVE_DUPLICATE_BACKUP')
    file_id=found[0]['id'] if found else None;size=local.stat().st_size
    mime='application/zip' if local.suffix=='.zip' else 'application/json'
    same=False
    if file_id:
        meta=json.loads(drive.request('drive/v3/files/'+file_id+'?fields=size,md5Checksum'))
        with local.open('rb') as stream:md5=hashlib.file_digest(stream,'md5').hexdigest()
        same=meta.get('md5Checksum')==md5 and int(meta.get('size',-1))==size
    if not same:
        metadata={'name':parts[-1]}
        if not file_id:metadata['parents']=[parent]
        url='https://www.googleapis.com/upload/drive/v3/files'+('/'+file_id if file_id else '')+'?uploadType=resumable&fields=id'
        req=urllib.request.Request(url,data=json.dumps(metadata).encode(),method='PATCH' if file_id else 'POST',headers={'Authorization':'Bearer '+drive.token(),'Content-Type':'application/json','X-Upload-Content-Type':mime,'X-Upload-Content-Length':str(size)})
        with urllib.request.urlopen(req,timeout=60) as response:session=response.headers['Location']
        if urllib.parse.urlparse(session).hostname not in ['www.googleapis.com','content.googleapis.com']:raise RuntimeError('INVALID_DRIVE_SESSION')
        offset=0
        with local.open('rb') as stream:
            while offset<size:
                stream.seek(offset);block=stream.read(32*1024*1024);end=offset+len(block)-1
                req=urllib.request.Request(session,data=block,method='PUT',headers={'Authorization':'Bearer '+drive.token(),'Content-Type':mime,'Content-Range':f'bytes {offset}-{end}/{size}'})
                for attempt in range(6):
                    try:
                        with urllib.request.urlopen(req,timeout=180) as response:file_id=json.load(response)['id']
                        offset=size;break
                    except urllib.error.HTTPError as e:
                        if e.code==308:
                            actual=e.headers.get('Range');new=int(actual.rsplit('-',1)[-1])+1 if actual else 0
                            if new<=offset:raise RuntimeError('DRIVE_UPLOAD_NOT_ADVANCING')
                            offset=new;break
                        try:reasons=[q.get('reason','') for q in json.loads(e.read()).get('error',{}).get('errors',[])]
                        except ValueError:reasons=[]
                        reason=next((v for v in reasons if v.isalpha()),'unknown')
                        # A rejected quota-limited chunk has not advanced the upload.
                        if attempt<5 and (e.code==429 or reason in ['rateLimitExceeded','userRateLimitExceeded']):
                            time.sleep(min(10*2**attempt,45));continue
                        raise RuntimeError('DRIVE_UPLOAD_HTTP_'+str(e.code)+'_'+reason) from None
    if not file_id:raise RuntimeError('DRIVE_BACKUP_FILE_MISSING')
    request=urllib.request.Request('https://www.googleapis.com/drive/v3/files/'+file_id+'?alt=media',headers={'Authorization':'Bearer '+drive.token()})
    h=hashlib.sha256();size=0
    with urllib.request.urlopen(request,timeout=90) as response:
        for block in iter(lambda:response.read(1048576),b''):h.update(block);size+=len(block)
    if size!=local.stat().st_size:raise RuntimeError('DRIVE_READBACK_SIZE_MISMATCH')
    if h.hexdigest()!=digest(local):raise RuntimeError('DRIVE_READBACK_HASH_MISMATCH')
    return {'path':relative,'sha256':h.hexdigest(),'size':size}

def files(project,core=False):
    values=[]
    def add(root,prefix,recursive=True):
        root=root.resolve()
        if not root.exists():return
        for p in root.rglob('*') if recursive else root.iterdir():
            if not p.is_file() or p.is_symlink() or any(v in p.relative_to(root).parts for v in ['.git','node_modules','codex-home','logs','__pycache__']):continue
            if p.name.endswith(('.pending','-wal','-shm','.lock')) or p.name in ['worker.json','auth.json','admin-session.json'] or p.suffix in ['.py','.pyc','.env']:continue
            values.append((p,prefix+'/'+p.relative_to(root).as_posix()))
    if project=='momentum':
        for p in LIVE.iterdir():
            if p.is_file() and p.suffix in ['.csv','.json','.sqlite','.db']:values.append((p,'outreach/'+p.name))
        if not core:
            add(LIVE/'prospect_evidence','outreach/prospect_evidence');add(LIVE/'sweep_runs','outreach/sweep_runs')
        for child in (BASE/'databases/momentum').iterdir():add(child,'momentum/'+child.name)
    elif project=='aight':
        add(BASE/'databases/botfactory','botfactory');add(BASE/'databases/aight','aight')
    elif project=='btc':add(BASE/'databases/gravity','gravity')
    elif project=='control':
        p=STATE/'controls.sqlite3'
        if p.exists():values.append((p,'control/controls.sqlite3'))
    else:raise ValueError('INVALID_BACKUP_PROJECT')
    return sorted(values,key=lambda v:v[1])

def snapshot(project,core=False,already_locked=False):
    # Always acquire the data lock before the backup lock, including SMTP claims.
    if project=='momentum' and not already_locked:
        with (LIVE/'.database.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            return _snapshot(project,core,True)
    return _snapshot(project,core,already_locked)

def _snapshot(project,core=False,already_locked=False):
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (STATE/'drive-backup.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        status=read(STATUS);old=status.get('projects',{}).get(project,{})
        atomic(STATUS,{**status,'running':True,'activeProject':project,'startedAt':now(),'error':None})
        try:
            with tempfile.TemporaryDirectory(dir=STATE,prefix='drive-snapshot-') as temp:
                temp=Path(temp);archive=temp/'snapshot.zip'
                @contextlib.contextmanager
                def db_lock():
                    if project!='momentum' or already_locked:yield;return
                    with (LIVE/'.database.lock').open('a') as f:fcntl.flock(f,fcntl.LOCK_EX);yield
                with db_lock():
                    entries=files(project,core)
                    if not entries:raise ValueError('NO_BACKUP_FILES')
                    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
                        for p,name in entries:
                            if p.suffix in ['.sqlite','.sqlite3','.db']:
                                copy=temp/('db-'+hashlib.sha256(name.encode()).hexdigest()+'.sqlite')
                                with contextlib.closing(sqlite3.connect(p)) as source,contextlib.closing(sqlite3.connect(copy)) as target:source.backup(target)
                                z.write(copy,name)
                            else:z.write(p,name)
                sha=digest(archive);relative=project+('/delivery/' if core else '/snapshots/')+sha+'.zip'
                receipt=upload_verified(archive,relative)
                manifest={'project':project,'source':'ubuntu','verifiedAt':now(),'files':len(entries),'archive':receipt,'scope':'core' if core else 'full'}
                if project=='btc':manifest['originalPriceFolderId']='1C3aRHiutPxKtwZz4y5wefUVIM4ed9cy3'
                latest=temp/'latest.json';latest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));upload_verified(latest,project+('/delivery-latest.json' if core else '/latest.json'))
                status=read(STATUS);projects=status.get('projects',{})
                if not core:projects[project]=manifest
                atomic(STATUS,{**status,'projects':projects,'running':False,'activeProject':None,'lastSuccessAt':now(),'error':None,'rootId':read(CONFIG)['rootId']})
                return manifest
        except Exception as e:
            status=read(STATUS);atomic(STATUS,{**status,'running':False,'activeProject':None,'error':str(e) if str(e).isupper() else 'DRIVE_BACKUP_FAILED','failedAt':now()});raise

def backup_delivery_claim(root):return snapshot('momentum',core=True,already_locked=True)
def request_backup():atomic(REQUEST,{'requestedAt':now()});return {'accepted':True}
def public_status():
    status=read(STATUS);return {k:status.get(k) for k in ['running','activeProject','startedAt','lastSuccessAt','failedAt','error','projects','rootId']}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--project',choices=['momentum','aight','btc','control']);p.add_argument('--core',action='store_true');args=p.parse_args()
    for name in [args.project] if args.project else ['momentum','aight','btc','control']:
        result=snapshot(name,args.core);print(name,result['files'],'files',result['archive']['size'],'bytes verified',flush=True)
