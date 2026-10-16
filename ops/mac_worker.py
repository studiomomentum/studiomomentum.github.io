#!/usr/bin/env python3
"""Owner-run macOS agent: pair once, receive aight jobs, upload verified results."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import threading
import time
import urllib.parse
import urllib.request

CONFIG=Path.home()/'Library/Application Support/ControlAight/worker.json'
ROOT=Path.home()/'Documents/ControlAight'
CONFIG_URL='https://studiomomentum.github.io/ops-config.json'
stop=threading.Event();endpoint=None;endpoint_at=0;settings={}

def origin():
    global endpoint,endpoint_at
    if endpoint and time.time()-endpoint_at<30:return endpoint
    with urllib.request.urlopen(CONFIG_URL+'?v='+str(time.time_ns()),timeout=20) as r:value=json.load(r)
    url=urllib.parse.urlparse(value['apiBase'])
    if url.scheme!='https' or not url.hostname.endswith('.trycloudflare.com'):raise ValueError('UNTRUSTED_ENDPOINT')
    endpoint=url.scheme+'://'+url.netloc;endpoint_at=time.time();return endpoint

def request(action,p=None,pair=False):
    global endpoint_at
    body=dict(p or {})
    if not pair:body['workerToken']=settings['workerToken']
    req=urllib.request.Request(origin()+'/api/worker/'+action,data=json.dumps(body).encode(),headers={'Content-Type':'text/plain;charset=UTF-8'})
    try:
        with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
    except Exception:endpoint_at=0;raise

def caps():return {'son':Path('/Applications/손.app').exists() or (Path.home()/'Applications/손.app').exists(),'comfy':bool(settings.get('comfyUrl')),'workflow':bool(settings.get('workflowPath') and settings.get('promptNode'))}
def pulse():
    while not stop.is_set():
        try:request('heartbeat',{'capabilities':caps()})
        except Exception:pass
        stop.wait(25)
def progress(job,message):request('progress',{'jobId':job['id'],'message':message})
def upload(job,file,name):
    digest_object=hashlib.sha256()
    with file.open('rb') as stream:
        for block in iter(lambda:stream.read(1048576),b''):digest_object.update(block)
    digest=digest_object.hexdigest()
    size=file.stat().st_size;offset=0
    with file.open('rb') as stream:
        while offset<size:
            stream.seek(offset);chunk=stream.read(524288)
            value=request('upload',{'jobId':job['id'],'name':name,'sha256':digest,'size':size,'offset':offset,'data':base64.b64encode(chunk).decode()})
            offset=value['received']
    if value.get('verified') is not True:raise ValueError('BACKUP_NOT_VERIFIED')
    return {'name':name,'sha256':digest,'size':size}
def local_comfy(path,payload=None):
    base=settings.get('comfyUrl','http://127.0.0.1:8188').rstrip('/');parsed=urllib.parse.urlparse(base)
    if parsed.hostname not in ['127.0.0.1','localhost']:raise ValueError('COMFY_LOOPBACK_REQUIRED')
    data=json.dumps(payload).encode() if payload is not None else None
    req=urllib.request.Request(base+path,data=data,headers={'Content-Type':'application/json'})
    return urllib.request.urlopen(req,timeout=60)

def work(job):
    project=job['project'];pid=project['id'];jid=job['id']
    if not all(len(x)==32 and all(c in '0123456789abcdef' for c in x) for x in [pid,jid]):raise ValueError('INVALID_JOB_ID')
    folder=ROOT/pid/'jobs'/jid;folder.mkdir(parents=True,exist_ok=True);marker=folder/'started.json'
    if marker.exists():raise ValueError('PREVIOUS_RUN_NEEDS_REVIEW')
    marker.write_text(json.dumps({'jobId':jid,'startedAt':time.time()}));output=folder/'output';output.mkdir(exist_ok=True)
    manifest={'jobId':jid,'project':project,'editor':'손','assetDirectory':str(ROOT/pid/'assets'),'outputDirectory':str(output),'resultReceipt':str(output/'render_result.json'),'videoOutput':str(output/'final.mp4')}
    file=folder/'production.json';file.write_text(json.dumps(manifest,ensure_ascii=False,indent=2));(folder/'script.txt').write_text(project['script'])
    if job['action']=='aight.mac.prepare':
        receipt=upload(job,file,'production.json');return {'files':[receipt]},'제작 지시서와 대본을 맥북에 저장하고 서버 백업 확인'
    if job['action']=='aight.mac.images':
        if not caps()['workflow']:raise ValueError('COMFY_WORKFLOW_SETUP_REQUIRED')
        if not project['scenes']:raise ValueError('SCENE_PROMPTS_REQUIRED')
        workflow=json.loads(Path(settings['workflowPath']).expanduser().read_text());node=settings['promptNode'];saved=[]
        assets=ROOT/pid/'assets';assets.mkdir(exist_ok=True)
        if node not in workflow or 'text' not in workflow[node].get('inputs',{}):raise ValueError('COMFY_PROMPT_NODE_INVALID')
        for index,scene in enumerate(project['scenes']):
            workflow[node]['inputs']['text']=scene['prompt'];progress(job,f"장면 {index+1}/{len(project['scenes'])} ComfyUI 생성 중")
            with local_comfy('/prompt',{'prompt':workflow,'client_id':jid}) as r:prompt_id=json.load(r)['prompt_id']
            deadline=time.time()+1800;images=[]
            while time.time()<deadline:
                with local_comfy('/history/'+prompt_id) as r:history=json.load(r).get(prompt_id)
                if history:
                    if history.get('status',{}).get('status_str')=='error':raise ValueError('COMFY_GENERATION_FAILED')
                    images=[image for v in history.get('outputs',{}).values() for image in v.get('images',[])]
                    if images:break
                time.sleep(3)
            if not images:raise ValueError('COMFY_OUTPUT_TIMEOUT')
            image=images[0];name=f'scene_{index+1:03d}.png';target=assets/(jid+'_'+name)
            with local_comfy('/view?'+urllib.parse.urlencode({k:image[k] for k in ['filename','subfolder','type'] if k in image})) as r:target.write_bytes(r.read(30*1024*1024))
            png=target.read_bytes()[:26]
            if png[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('PNG_OUTPUT_REQUIRED')
            if scene.get('kind')=='png' and png[25] not in [4,6]:raise ValueError('TRANSPARENT_PNG_WORKFLOW_REQUIRED')
            saved.append(upload(job,target,name))
        return {'files':saved},'장면 이미지 생성 및 서버 백업 해시 검증 완료'
    if job['action']=='aight.mac.son':
        if not caps()['son']:raise ValueError('SON_APP_NOT_FOUND')
        progress(job,'손 편집기에 제작 지시서 전달 · 결과 영수증 대기')
        result=subprocess.run(['/usr/bin/open','-a','손',str(file)],capture_output=True,text=True,timeout=30)
        if result.returncode:raise ValueError('SON_OPEN_FAILED')
        deadline=time.time()+4*3600;receipt=output/'render_result.json';video=output/'final.mp4'
        while time.time()<deadline:
            if receipt.is_file() and video.is_file():
                value=json.loads(receipt.read_text())
                if value.get('jobId')!=jid:raise ValueError('RENDER_RECEIPT_JOB_MISMATCH')
                with video.open('rb') as stream:header=stream.read(32)
                if b'ftyp' not in header or video.stat().st_size<1024:raise ValueError('INVALID_RENDER_VIDEO')
                progress(job,'영상 제작 결과 수신 · 백업 서버 업로드 중');saved=upload(job,video,'final.mp4');return {'files':[saved]},'최종 영상 수신 및 서버 백업 해시 검증 완료'
            time.sleep(5)
        raise ValueError('SON_RESULT_RECEIPT_NOT_RECEIVED')
    raise ValueError('INVALID_WORKER_ACTION')

def main():
    global settings
    parser=argparse.ArgumentParser(description='aight macOS production worker');parser.add_argument('--pair-code');parser.add_argument('--pair-only',action='store_true');parser.add_argument('--comfy-url');parser.add_argument('--workflow');parser.add_argument('--prompt-node');args=parser.parse_args()
    if platform.system()!='Darwin':raise SystemExit('이 작업자는 맥북에서 실행해 주세요.')
    CONFIG.parent.mkdir(parents=True,exist_ok=True);ROOT.mkdir(parents=True,exist_ok=True)
    if CONFIG.exists():settings=json.loads(CONFIG.read_text())
    if args.pair_code:settings.update(request('pair',{'code':args.pair_code,'name':platform.node()},pair=True))
    if args.comfy_url:settings['comfyUrl']=args.comfy_url
    if args.workflow:settings['workflowPath']=str(Path(args.workflow).expanduser().resolve())
    if args.prompt_node:settings['promptNode']=args.prompt_node
    if not settings.get('workerToken'):raise SystemExit('통합 어드민에서 발급한 연결 코드로 --pair-code를 지정해 주세요.')
    CONFIG.write_text(json.dumps(settings,ensure_ascii=False,indent=2));CONFIG.chmod(0o600)
    if args.pair_only:return
    threading.Thread(target=pulse,daemon=True).start();print('aight 맥북 작업자 연결. 종료: Ctrl+C',flush=True)
    try:
        while True:
            try:
                job=request('claim').get('job')
                if job:
                    try:result,message=work(job);state='succeeded';error=''
                    except Exception as e:result={};message='맥북 제작 결과 확인 필요';state='blocked';error=type(e).__name__+': '+str(e)[:500]
                    request('complete',{'jobId':job['id'],'status':state,'message':message,'result':result,'error':error})
            except Exception as e:print('연결 또는 작업 결과를 확인 중:',type(e).__name__,flush=True)
            time.sleep(5)
    except KeyboardInterrupt:stop.set()
if __name__=='__main__':main()
