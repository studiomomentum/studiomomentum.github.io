import hashlib,io,json,os,sys,tempfile,types,unittest,urllib.error,urllib.request,zipfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import drive_backup as d
import drive_backup_worker as w

def response(value,headers=None):
    result=io.BytesIO(value);result.headers=headers or {};return result
def http_error(code,reason='',headers=None):
    return urllib.error.HTTPError('https://www.googleapis.com/upload',code,'error',headers or {},io.BytesIO(json.dumps({'error':{'errors':[{'reason':reason}]}}).encode()))

class ResumeTests(unittest.TestCase):
    def test_quota_retry_sends_same_chunk(self):
        request=urllib.request.Request('https://www.googleapis.com/upload',data=b'abc',method='PUT')
        with patch.object(d.urllib.request,'urlopen',side_effect=[http_error(403,'rateLimitExceeded'),response(b'{"id":"done"}')]) as send,patch.object(d.time,'sleep') as sleep:
            self.assertEqual(d.send_chunk(request,0,3),(3,'done'));sleep.assert_called_once_with(10)
            self.assertIs(send.call_args_list[0].args[0],send.call_args_list[1].args[0])
    def test_partial_chunk_uses_server_offset(self):
        with patch.object(d.urllib.request,'urlopen',side_effect=http_error(308,headers={'Range':'bytes=0-6'})):
            self.assertEqual(d.send_chunk(None,3,10),(7,None))
    def test_stalled_chunk_fails(self):
        with patch.object(d.urllib.request,'urlopen',side_effect=http_error(308,headers={'Range':'bytes=0-2'})):
            with self.assertRaisesRegex(RuntimeError,'NOT_ADVANCING'):d.send_chunk(None,3,10)
    def test_session_status_partial_completed_and_expired(self):
        with patch.object(d.urllib.request,'urlopen',side_effect=[http_error(308,headers={'Range':'bytes=0-6'}),response(b'{"id":"done"}'),http_error(410)]):
            self.assertEqual(d.session_status('https://www.googleapis.com/upload',10,'private'),(7,None))
            self.assertEqual(d.session_status('https://www.googleapis.com/upload',10,'private'),(10,'done'))
            self.assertEqual(d.session_status('https://www.googleapis.com/upload',10,'private'),(None,None))
    def test_resume_upload_uses_only_remaining_bytes_and_verifies_readback(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);local=root/'snapshot.zip';local.write_bytes(b'abcdef');sessions=root/'sessions.json'
            relative='aight/snapshot.zip';key=hashlib.sha256((relative+':'+d.digest(local)).encode()).hexdigest()
            d.atomic(sessions,{key:{'url':'https://www.googleapis.com/upload/resume'}})
            drive=types.SimpleNamespace(list=lambda parent,name:[{'id':'folder','mimeType':'application/vnd.google-apps.folder'}] if name=='aight' else [],token=lambda:'private')
            with patch.dict(sys.modules,{'drive_transport':types.SimpleNamespace(Drive=lambda:drive)}),patch.object(d,'SESSIONS',sessions),patch.object(d,'CONFIG',root/'config.json'),patch.object(d.urllib.request,'urlopen',side_effect=[http_error(308,headers={'Range':'bytes=0-2'}),response(b'{"id":"done"}'),response(b'abcdef')]) as send:
                d.atomic(d.CONFIG,{'rootId':'root'});receipt=d.upload_verified(local,relative)
                self.assertEqual(send.call_args_list[1].args[0].data,b'def');self.assertEqual(receipt['sha256'],d.digest(local));self.assertEqual(d.read(sessions),{})
    def test_unchanged_content_has_identical_archive_after_mtime_change(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);data=root/'db';data.write_bytes(b'unchanged')
            for number in [1,2]:
                os.utime(data,(100000*number,100000*number))
                with zipfile.ZipFile(root/str(number),'w') as archive:d.archive_entry(archive,data,'db.sqlite3')
            self.assertEqual(d.digest(root/'1'),d.digest(root/'2'))
    def test_worker_resume_skips_completed_projects(self):
        state={'pending':{'request':'request1','completedProjects':['momentum']}}
        with patch.object(w,'snapshot',return_value={'files':1}) as snapshot:
            w.run_pending(state,lambda value:None)
        self.assertEqual([call.args[0] for call in snapshot.call_args_list],['aight','btc','control']);self.assertEqual(state['lastRequest'],'request1');self.assertIsNone(state['pending'])
    def test_worker_failure_preserves_completed_projects(self):
        state={'pending':{'request':'request1','completedProjects':[]}}
        with patch.object(w,'snapshot',side_effect=[{'files':1},RuntimeError('QUOTA')]):
            with self.assertRaises(RuntimeError):w.run_pending(state,lambda value:None)
        self.assertEqual(state['pending']['completedProjects'],['momentum'])
    def test_safe_error_keeps_quota_code_but_redacts_urls(self):
        self.assertEqual(d.safe_error(RuntimeError('DRIVE_UPLOAD_HTTP_403_rateLimitExceeded')),'DRIVE_UPLOAD_HTTP_403_rateLimitExceeded')
        self.assertEqual(d.safe_error(RuntimeError('https://private.example/?token=secret')),'DRIVE_BACKUP_FAILED')
    def test_pending_request_respects_backoff(self):
        def read(path):
            if path==w.REQUEST:return {'requestedAt':'request1'}
            if path==w.STATUS:return {'projects':dict.fromkeys(w.PROJECTS,{})}
            return {}
        with patch.object(w,'read',side_effect=read),patch.object(w,'atomic'),patch.object(w,'snapshot',side_effect=RuntimeError('QUOTA')) as snapshot,patch.object(w.time,'monotonic',return_value=1000),patch.object(w.time,'time',return_value=1000),patch.object(w.time,'sleep',side_effect=[None,None,KeyboardInterrupt]):
            with self.assertRaises(KeyboardInterrupt):w.main()
        self.assertEqual(snapshot.call_count,1)
    def test_existing_drive_databases_are_cached_with_latest_content_revision(self):
        documents={
            'telemetry':[], 'consultations':{'version':1,'sessions':[]},
            'old':{'schema':1,'revision':2,'articles':{}}, 'new':{'schema':1,'revision':3,'articles':{}},
        }
        names={'telemetry':'momentum_telemetry_db.json','consultations':'momentum_private_consultations.json','old':'momentum-content-private-v1-r2-100.json','new':'momentum-content-private-v1-r3-101.json'}
        def request(path):
            if '?' in path and path.startswith('drive/v3/files?'):return json.dumps({'files':[{'id':key,'name':name,'mimeType':'application/json'} for key,name in names.items()]}).encode()
            return json.dumps(documents[path.split('/')[-1].split('?')[0]]).encode()
        drive=types.SimpleNamespace(request=request)
        with tempfile.TemporaryDirectory() as temp,patch.object(d,'BASE',Path(temp)),patch.dict(sys.modules,{'drive_transport':types.SimpleNamespace(Drive=lambda:drive)}):
            d.refresh_drive_databases();cache=Path(temp)/'databases/momentum/drive-originals'
            self.assertEqual(d.read(cache/'content.json')['revision'],3);self.assertEqual(len(list(cache.iterdir())),3)

if __name__=='__main__':unittest.main()
