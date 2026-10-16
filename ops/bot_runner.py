"""Launch the installed Bot Factory CLI and verify actual output artifacts."""
import json
import os
from pathlib import Path
import queue
import subprocess
import threading
import time
from controls import BOT,BOTDATA,STATE,STAGES,bot_command,catalog,clean

def run_bot(ident,action,params):
    command=bot_command(action,params);started=time.time();env=os.environ.copy();env['PATH']='/home/pc/.local/bin:'+env.get('PATH','/usr/local/bin:/usr/bin:/bin');env['PLAYWRIGHT_BROWSERS_PATH']=str(STATE/'browsers')
    logdir=STATE/'logs';logdir.mkdir(parents=True,exist_ok=True,mode=0o700);log=logdir/(ident+'.log');lines=queue.Queue()
    process=subprocess.Popen(command,cwd=BOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=False)
    def reader():
        try:
            for line in process.stdout:lines.put(line)
        finally:lines.put(None)
    threading.Thread(target=reader,daemon=True).start();last_json=None;size=0;done=False
    with log.open('w') as stream:
        log.chmod(0o600)
        while not done:
            if time.time()-started>3600:
                process.terminate()
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill()
                raise RuntimeError('BOT_TIMEOUT')
            try:line=lines.get(timeout=1)
            except queue.Empty:continue
            if line is None:done=True;continue
            try:
                value=json.loads(line)
                if isinstance(value,dict):last_json=value
            except ValueError:pass
            value=clean(line)[:16000]
            if size<2*1024*1024:stream.write(value);stream.flush();size+=len(value)
        code=process.wait(timeout=30)
    if code or not last_json or last_json.get('status') in ['error','failed'] or last_json.get('ok') is False:
        message=clean(str((last_json or {}).get('error') or '실행기 로그에서 실패 원인을 확인해 주세요.'))
        raise RuntimeError('BOT_FAILED: '+message[:500])
    kind=action.split('.')[1];created=[a for a in catalog() if a['kind']==kind and __import__('datetime').datetime.fromisoformat(a['modifiedAt']).timestamp()>=started-2]
    if not created:raise RuntimeError('NO_OUTPUT_ARTIFACT_VERIFIED')
    return {'artifacts':created,'engine':STAGES[kind]}
