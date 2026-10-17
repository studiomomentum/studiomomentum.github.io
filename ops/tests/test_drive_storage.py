import csv,json
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import drive_backup as d
import momentum_data as m
class StorageTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.live=self.root/'live';self.live.mkdir()
  self.patches=[patch.object(d,'BASE',self.root),patch.object(d,'LIVE',self.live),patch.object(d,'STATE',self.root/'state'),patch.object(d,'STATUS',self.root/'status.json'),patch.object(m,'LIVE',self.live),patch.object(m,'CONFIG',self.live/'system_config.json'),patch.object(m,'request_backup',return_value={'accepted':True})]
  for p in self.patches:p.start()
  (self.root/'databases/momentum').mkdir(parents=True)
  (self.live/'system_config.json').write_text(json.dumps({'email_system_enabled':False,'excluded_targets':{}}))
  (self.live/'targets_db.csv').write_text('토큰,상태,회사채널명,이메일,채널URL\ntest-token,READY,test,business@example.org,https://youtube.com/channel/test\n')
 def tearDown(self):
  for p in reversed(self.patches):p.stop()
  self.tmp.cleanup()
 def test_local_targets_and_settings_do_not_use_github(self):
  self.assertEqual(m.targets()['test-token']['status'],'READY');self.assertFalse(m.call('settings.status',{})['email_system_enabled'])
  m.call('settings.update',{'setting':'email_system_enabled','value':True});self.assertTrue(m.read_config()['email_system_enabled'])
 def test_exclusion_changes_canonical_csv_and_registry(self):
  m.call('targets.exclude',{'token':'test-token'});self.assertEqual(m.targets()['test-token']['status'],'EXCLUDED');self.assertIn('test-token',m.read_config()['excluded_targets'])
 def test_arbitrary_settings_are_rejected(self):
  with self.assertRaisesRegex(ValueError,'INVALID_SETTING'):m.call('settings.update',{'setting':'command','value':True})
 def test_failed_backup_preserves_previous_verified_receipt(self):
  d.atomic(d.STATUS,{'projects':{'momentum':{'verifiedAt':'previous-success'}}})
  with patch.object(d,'upload_verified',side_effect=RuntimeError('DRIVE_TRANSFER_FAILED')):
   with self.assertRaises(RuntimeError):d.snapshot('momentum')
  value=d.read(d.STATUS);self.assertEqual(value['projects']['momentum']['verifiedAt'],'previous-success');self.assertEqual(value['error'],'DRIVE_TRANSFER_FAILED')
if __name__=='__main__':unittest.main()
