#!/usr/bin/env python3
"""Authenticated read-only status API for the existing GitHub admin."""
import collections
import hashlib
import json
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from server import snapshot

ADMIN_URL='https://script.google.com/macros/s/AKfycbyGHgW1OYt8Xv4fivHmM5CGcVmgUzJtGFCfGWlBtD0Aob_FIZlILsvWvFZx-8zpu_7EUQ/exec'
ORIGINS={'https://studiomomentum.github.io','http://127.0.0.1:8796'}
CACHE={};LOCK=threading.Lock();LIMIT=collections.deque();STATUS=None;STATUS_AT=0

def authorize(token):
    if not isinstance(token,str) or not re.fullmatch('[a-f0-9]{128}',token):return False
    key=hashlib.sha256(token.encode()).hexdigest();now=time.monotonic()
    with LOCK:
        if CACHE.get(key,0)>now:return True
        while LIMIT and now-LIMIT[0]>60:LIMIT.popleft()
        if len(LIMIT)>=60:raise RuntimeError('RATE_LIMIT')
        LIMIT.append(now)
    body=json.dumps({'route':'momentum_admin','action':'session','session':token}).encode()
    req=urllib.request.Request(ADMIN_URL,data=body,headers={'Content-Type':'text/plain;charset=UTF-8'})
    try:
        with urllib.request.urlopen(req,timeout=20) as response:value=json.load(response)
    except (urllib.error.URLError,ValueError,TimeoutError):raise RuntimeError('AUTH_UNAVAILABLE')
    if value.get('ok') is not True:
        if value.get('error')=='UNAUTHORIZED':return False
        raise RuntimeError('AUTH_UNAVAILABLE')
    with LOCK:
        for k in list(CACHE):
            if CACHE[k]<=now:CACHE.pop(k,None)
        if len(CACHE)>=128:CACHE.clear()
        CACHE[key]=now+30
    return True

def status_value():
    global STATUS,STATUS_AT
    with LOCK:
        if STATUS is not None and time.monotonic()-STATUS_AT<2:return STATUS
    value=snapshot()
    with LOCK:STATUS=value;STATUS_AT=time.monotonic()
    return value

class Handler(BaseHTTPRequestHandler):
    def send(self,status,value):
        data=json.dumps(value,ensure_ascii=False).encode()
        self.send_response(status)
        origin=self.headers.get('Origin')
        if origin in ORIGINS:self.send_header('Access-Control-Allow-Origin',origin)
        self.send_header('Vary','Origin');self.send_header('Cache-Control','private, no-store')
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ORIGINS:return self.send(403,{'error':'ORIGIN_DENIED'})
        self.send_response(204);self.send_header('Access-Control-Allow-Origin',self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods','POST, OPTIONS');self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Max-Age','600');self.send_header('Vary','Origin');self.end_headers()
    def do_GET(self):
        if self.path=='/health':return self.send(200,{'ok':True})
        self.send(401 if self.path=='/api/ops' else 404,{'error':'UNAUTHORIZED' if self.path=='/api/ops' else 'NOT_FOUND'})
    def do_POST(self):
        if self.path!='/api/ops':return self.send(404,{'error':'NOT_FOUND'})
        if self.headers.get('Origin') and self.headers['Origin'] not in ORIGINS:return self.send(403,{'error':'ORIGIN_DENIED'})
        try:length=int(self.headers.get('Content-Length','0'))
        except ValueError:return self.send(400,{'error':'INVALID_REQUEST'})
        if not 0<length<=2048:return self.send(413,{'error':'INVALID_SIZE'})
        self.connection.settimeout(25)
        try:
            value=json.loads(self.rfile.read(length))
            if not isinstance(value,dict) or set(value)!={'session'}:return self.send(400,{'error':'INVALID_REQUEST'})
            if not authorize(value['session']):return self.send(401,{'error':'UNAUTHORIZED'})
            result=status_value()
            if result.get('error'):return self.send(503,{'error':'STATUS_UNAVAILABLE'})
            self.send(200,result)
        except RuntimeError as error:self.send(429 if str(error)=='RATE_LIMIT' else 503,{'error':str(error)})
        except (ValueError,TimeoutError):self.send(400,{'error':'INVALID_REQUEST'})
        except Exception:self.send(503,{'error':'STATUS_UNAVAILABLE'})
    def log_message(self,*args):pass

if __name__=='__main__':
    ThreadingHTTPServer(('127.0.0.1',8797),Handler).serve_forever()
