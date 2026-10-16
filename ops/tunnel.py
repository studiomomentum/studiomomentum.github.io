#!/usr/bin/env python3
"""Maintain an outbound HTTPS tunnel; publish only its public origin to GitHub."""
import base64
import datetime as dt
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import threading
import time
import urllib.request

BINARY='/home/pc/Documents/Server/apps/control-center/cloudflared'
API='https://api.github.com/repos/studiomomentum/studiomomentum.github.io/contents/ops-config.json'
STATE=Path('/home/pc/Documents/Server/runtime/control-center/tunnel.json')
stop=threading.Event();process=None

def receipt(**values):
    STATE.parent.mkdir(parents=True,exist_ok=True)
    temporary=STATE.with_suffix('.pending');temporary.write_text(json.dumps({'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),**values}));temporary.chmod(0o600);os.replace(temporary,STATE)

def github_request(token,method='GET',value=None):
    data=json.dumps(value).encode() if value is not None else None
    req=urllib.request.Request(API,data=data,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','User-Agent':'CONTROL-Ubuntu','Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)

def publish(origin):
    while not stop.is_set():
        try:
            with urllib.request.urlopen(origin+'/health',timeout=15) as response:
                if json.load(response).get('ok') is not True:raise RuntimeError()
            auth=subprocess.run(['/usr/bin/gh','auth','token','--hostname','github.com'],capture_output=True,text=True,timeout=15,check=True).stdout.strip()
            if not auth:raise RuntimeError()
            try:current=github_request(auth)
            except urllib.error.HTTPError as error:
                if error.code!=404:raise
                current={}
            if current.get('content'):
                old=json.loads(base64.b64decode(current['content']))
            else:old={}
            if old.get('apiBase')!=origin:
                config={'apiBase':origin,'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'auth':'momentum-admin-session'}
                payload={'message':'Reconnect authenticated Ubuntu operations API','content':base64.b64encode((json.dumps(config,indent=2)+'\n').encode()).decode(),'branch':'main'}
                if current.get('sha'):payload['sha']=current['sha']
                github_request(auth,'PUT',payload)
            auth='';receipt(apiBase=origin,githubSynced=True,error=None);return
        except Exception as error:
            receipt(apiBase=origin,githubSynced=False,error=type(error).__name__)
            if stop.wait(20):return

def shutdown(*_):
    stop.set()
    if process and process.poll() is None:process.terminate()

def main():
    global process
    for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,shutdown)
    process=subprocess.Popen([BINARY,'tunnel','--url','http://127.0.0.1:8797','--no-autoupdate'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    known=None
    for line in process.stdout:
        found=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',line)
        if found and found.group()!=known:
            known=found.group();receipt(apiBase=known,githubSynced=False,error=None)
            threading.Thread(target=publish,args=(known,),daemon=True).start()
        if stop.is_set():break
    code=process.wait(timeout=15)
    if not stop.is_set():raise SystemExit(code or 1)
if __name__=='__main__':main()
