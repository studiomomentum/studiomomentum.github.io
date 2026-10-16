import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import controls as c

class ControlTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.old={k:getattr(c,k) for k in ['STATE','DB','BASE','BOTDATA','AIGHT','ARTIFACTS']}
  c.STATE=self.root/'runtime';c.DB=c.STATE/'test.sqlite3';c.BASE=self.root;c.BOTDATA=self.root/'botdata';c.AIGHT=self.root/'aight';c.ARTIFACTS=c.AIGHT/'artifacts'
 def tearDown(self):
  for k,v in self.old.items():setattr(c,k,v)
  self.temp.cleanup()
 def test_request_is_idempotent(self):
  a=c.submit('request-id-00000001','btc.verify',{});b=c.submit('request-id-00000001','btc.verify',{});self.assertEqual(a['id'],b['id'])
  with c.connect() as db:self.assertEqual(db.execute('SELECT COUNT(*) FROM jobs').fetchone()[0],1)
 def test_request_id_conflict(self):
  c.submit('request-id-00000001','btc.verify',{})
  with self.assertRaisesRegex(ValueError,'CONFLICT'):c.submit('request-id-00000001','btc.minute.run',{})
 def test_commands_cannot_be_injected(self):
  for action,p in [('shell.run',{}),('btc.minute.run',{'command':'rm -rf /'}),('btc.schedule.pause',{'group':'prices; touch /tmp/a'})]:
   with self.assertRaises(ValueError):c.submit('request-id-00000001',action,p)
 def test_project_version_prevents_overwrite(self):
  first=c.submit('request-id-00000001','aight.project.save',{'title':'제작 테스트','script':'대본','scenes':[]});c.run_next('aight')
  with c.connect() as db:r=json.loads(db.execute('SELECT result FROM jobs WHERE id=?',(first['id'],)).fetchone()[0])
  self.assertEqual(r['revision'],1)
  second=c.submit('request-id-00000002','aight.project.save',{'projectId':r['projectId'],'title':'다른 변경','revision':2});c.run_next('aight')
  with c.connect() as db:row=db.execute('SELECT * FROM jobs WHERE id=?',(second['id'],)).fetchone();self.assertEqual(row['status'],'blocked');self.assertIn('VERSION_CONFLICT',row['error'])
 def test_file_paths_are_not_user_input(self):
  with self.assertRaisesRegex(ValueError,'INVALID_PROJECT_ID'):c.submit('request-id-00000001','aight.project.save',{'title':'x','projectId':'../../escape'})
  with self.assertRaises(ValueError):c.artifact('../../etc/passwd')
 def test_interrupted_jobs_never_auto_replay(self):
  job=c.submit('request-id-00000001','btc.minute.run',{})
  with c.connect() as db:db.execute("UPDATE jobs SET status='running' WHERE id=?",(job['id'],))
  c.recover('btc');self.assertFalse(c.run_next('btc'))
  with c.connect() as db:self.assertEqual(db.execute('SELECT status FROM jobs').fetchone()[0],'interrupted')
 def test_only_queued_jobs_cancel(self):
  job=c.submit('request-id-00000001','btc.verify',{});self.assertEqual(c.cancel(job['id'])['status'],'cancelled')
  with self.assertRaises(ValueError):c.cancel(job['id'])
 def make_worker_job(self):
  with c.connect() as db:
   pid='a'*32;db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',(pid,'test','','',json.dumps([{'name':'scene','kind':'png','prompt':'test'}]),1,c.now(),c.now()))
  pairjob=c.submit('request-id-00000001','aight.worker.pair',{});c.run_next('aight')
  with c.connect() as db:code=json.loads(db.execute('SELECT result FROM jobs WHERE id=?',(pairjob['id'],)).fetchone()[0])['pairCode']
  worker=c.pair(code,'Mac Test');job=c.submit('request-id-00000002','aight.mac.images',{'projectId':pid});claimed=c.worker_call('claim',worker['workerToken'],{})['job'];self.assertEqual(claimed['id'],job['id'])
  return worker,job,code
 def test_pair_code_is_one_time(self):
  worker,job,code=self.make_worker_job()
  with self.assertRaises(ValueError):c.pair(code,'second')
  with self.assertRaises(ValueError):c.worker_auth('0'*64)
 def test_upload_verified_before_success(self):
  worker,job,_=self.make_worker_job();token=worker['workerToken']
  with self.assertRaisesRegex(ValueError,'VERIFIED_IMAGE'):c.worker_call('complete',token,{'jobId':job['id'],'status':'succeeded','message':'complete'})
  import base64,struct,zlib
  def chunk(k,d):return struct.pack('>I',len(d))+k+d+struct.pack('>I',zlib.crc32(k+d)&0xffffffff)
  content=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\x00\xff\x00\x00\xff'))+chunk(b'IEND',b'');sha=hashlib.sha256(content).hexdigest()
  import base64
  payload={'jobId':job['id'],'name':'scene_001.png','sha256':sha,'size':len(content),'offset':0,'data':base64.b64encode(content).decode()}
  result=c.worker_call('upload',token,payload);self.assertTrue(result['verified'])
  self.assertTrue(c.worker_call('upload',token,payload)['verified'])
  self.assertTrue(c.worker_call('complete',token,{'jobId':job['id'],'status':'succeeded','message':'verified'})['ok'])
  self.assertTrue(c.worker_call('complete',token,{'jobId':job['id'],'status':'succeeded','message':'verified'})['ok'])
 def test_wrong_upload_hash_cannot_complete(self):
  worker,job,_=self.make_worker_job();import base64
  with self.assertRaisesRegex(ValueError,'HASH_MISMATCH'):c.worker_call('upload',worker['workerToken'],{'jobId':job['id'],'name':'scene.png','sha256':'0'*64,'size':3,'offset':0,'data':base64.b64encode(b'abc').decode()})
 def test_unverified_upload_cannot_change_other_project(self):
  worker,job,_=self.make_worker_job()
  with self.assertRaisesRegex(ValueError,'INVALID_WORKER_JOB'):c.worker_call('complete',worker['workerToken'],{'jobId':'f'*32,'status':'succeeded','message':'x'})
 def test_production_manifest_is_real_file(self):
  with c.connect() as db:db.execute('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)',('a'*32,'영상','','대본','[]',1,c.now(),c.now()))
  job=c.submit('request-id-00000001','aight.project.package',{'projectId':'a'*32});c.run_next('aight')
  file=c.ARTIFACTS/job['id']/'production.json';self.assertTrue(file.is_file());self.assertEqual(json.loads(file.read_text())['editor'],'손')
if __name__=='__main__':unittest.main()
