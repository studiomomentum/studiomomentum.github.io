import json
from pathlib import Path
import sys,tempfile,unittest
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import momentum_progress as m

class ProgressTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.root=self.base/'checkout';self.source=self.base/'source';self.root.mkdir();self.source.mkdir()
  self.patchers=[patch.object(m,'BASE',self.base),patch.object(m,'ROOT',self.root),patch.object(m,'SOURCE',self.source),patch.object(m.subprocess,'run',return_value=SimpleNamespace(returncode=0))]
  for p in self.patchers:p.start()
  (self.source/'live_prospecting.py').write_text("REGIONS=['수원']\nPROFESSIONS={'세무사':'tax','변호사':'legal'}")
  self.write(self.source/'cloud_schedule.json',[{'group':'prospect','cron':'0 14 * * 0'}])
  self.write(self.root/'sweep_control.json',{'sweep_id':'test-sweep'})
  self.checkpoint={'queries':{'수원 세무사':{'status':'completed','channels':['a']}},'decisions':{'a':'ELIGIBLE'},'observed':{},'search_stage':{'status':'running'},'classify_stage':{'status':'running','active':[{'channel_id':'b','name':'test','query':'수원 변호사'}]}}
  self.write(self.root/'sweep_runs/test-sweep/state.json',self.checkpoint)
  self.write(self.root/'prospect_candidates.json',{'a':{'status':'REGISTERED'},'b':{'status':'DISCOVERED'}})
  (self.root/'targets_db.csv').write_text('상태,토큰\nREADY,private-token\nSENT,other-token\n')
 def tearDown(self):
  for p in reversed(self.patchers):p.stop()
  self.tmp.cleanup()
 def write(self,path,value):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value))
 def test_inactive_checkpoint_does_not_claim_live_processing(self):
  result=m.progress();self.assertFalse(result['execution']['running']);self.assertEqual(result['classification']['active'],[]);self.assertEqual(result['classification']['status'],'incomplete');self.assertEqual(result['queries_completed'],1);self.assertEqual(result['queries_total'],2)
 def test_running_job_and_stats_use_local_sources(self):
  self.write(self.base/'runtime/outreach/prospect/state/prospect-receipt.json',{'started':True,'job':{'kind':'classify','runId':123,'claim':'secret-claim'}})
  result=m.progress();self.assertTrue(result['execution']['running']);self.assertEqual(result['classification']['processing'],1);self.assertEqual(result['stats']['ready_count'],1);self.assertEqual(result['stats']['total_candidates'],2)
  output=json.dumps(result);self.assertNotIn('secret-claim',output);self.assertNotIn('private-token',output);self.assertIsNotNone(result['next_search_at'])
 def test_invalid_checkpoint_id_cannot_read_other_paths(self):
  self.write(self.root/'sweep_control.json',{'sweep_id':'../../escape'})
  with self.assertRaisesRegex(ValueError,'CHECKPOINT_UNAVAILABLE'):m.progress()
if __name__=='__main__':unittest.main()
