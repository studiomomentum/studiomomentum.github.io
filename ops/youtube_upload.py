"""Resumable private upload using owner-provided OAuth credentials; no trading or public publishing."""
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from controls import BASE,artifact,connect,now

def upload(job_id,p):
    video,_=artifact(p['artifactId'],'production');size=video.stat().st_size
    with video.open('rb') as stream:sha=hashlib.file_digest(stream,'sha256').hexdigest()
    with connect() as db:
        receipt=db.execute('SELECT * FROM uploads WHERE sha=? AND complete=1',(sha,)).fetchone()
        previous=db.execute('SELECT * FROM youtube WHERE sha=?',(sha,)).fetchone()
    if not receipt:raise ValueError('VERIFIED_BACKUP_REQUIRED')
    if previous and previous['video_id']:return {'videoId':previous['video_id'],'privacy':'private','alreadyUploaded':True}
    credentials=json.loads((BASE/'config/aight/youtube-oauth.json').read_text())
    body=urllib.parse.urlencode({k:credentials[k] for k in ['client_id','client_secret','refresh_token']}|{'grant_type':'refresh_token'}).encode()
    with urllib.request.urlopen(urllib.request.Request('https://oauth2.googleapis.com/token',data=body),timeout=30) as r:token=json.load(r)['access_token']
    headers={'Authorization':'Bearer '+token}
    if previous:
        url=previous['session_url']
        try:
            with urllib.request.urlopen(urllib.request.Request(url,data=b'',method='PUT',headers={**headers,'Content-Length':'0','Content-Range':f'bytes */{size}'}),timeout=60) as r:
                result=json.load(r)
                if result.get('id'):
                    with connect() as db:db.execute('UPDATE youtube SET video_id=?,updated_at=? WHERE sha=?',(result['id'],now(),sha))
                    return {'videoId':result['id'],'privacy':'private'}
        except urllib.error.HTTPError as r:
            if r.code!=308:raise RuntimeError('UPLOAD_SESSION_CHECK_REQUIRED')
            actual=r.headers.get('Range');offset=int(actual.rsplit('-',1)[-1])+1 if actual else 0
    else:
        data=json.dumps({'snippet':{'title':p['title'],'description':p.get('description','')},'status':{'privacyStatus':'private','selfDeclaredMadeForKids':False}}).encode()
        req=urllib.request.Request('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',data=data,method='POST',headers={**headers,'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':str(size)})
        with urllib.request.urlopen(req,timeout=60) as r:url=r.headers['Location']
        if urllib.parse.urlparse(url).hostname not in ['www.googleapis.com','youtube.googleapis.com']:raise RuntimeError('INVALID_UPLOAD_SESSION')
        with connect() as db:db.execute('INSERT INTO youtube VALUES(?,?,NULL,?)',(sha,url,now()))
        offset=0
    with video.open('rb') as stream:
        stream.seek(offset)
        while offset<size:
            block=stream.read(8*1024*1024);end=offset+len(block)-1
            req=urllib.request.Request(url,data=block,method='PUT',headers={**headers,'Content-Type':'video/mp4','Content-Range':f'bytes {offset}-{end}/{size}'})
            try:
                with urllib.request.urlopen(req,timeout=180) as r:result=json.load(r)
                ident=result.get('id')
                if not ident:raise RuntimeError('UPLOAD_RESULT_MISSING')
                with connect() as db:db.execute('UPDATE youtube SET video_id=?,updated_at=? WHERE sha=?',(ident,now(),sha))
                return {'videoId':ident,'privacy':'private','sha256':sha}
            except urllib.error.HTTPError as r:
                if r.code!=308:raise RuntimeError('UPLOAD_PENDING_RESUME_REQUIRED')
                actual=r.headers.get('Range');new=int(actual.rsplit('-',1)[1])+1 if actual else 0
                if new<=offset:raise RuntimeError('UPLOAD_OFFSET_NOT_ADVANCING')
                offset=new;stream.seek(offset)
    raise RuntimeError('UPLOAD_RESULT_CHECK_REQUIRED')
