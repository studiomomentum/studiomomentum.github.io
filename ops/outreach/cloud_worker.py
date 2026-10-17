#!/usr/bin/env python3
"""Fixed-purpose VM worker. No GitHub Actions runner or remote arbitrary command execution."""
import shutil
import argparse, datetime, fcntl, json, os, pathlib, re, signal, subprocess, sys, threading, time, urllib.request, uuid

STOP=threading.Event()
FAULT=threading.Event()
SOURCE=pathlib.Path(__file__).resolve().parent
ROOT=pathlib.Path(os.environ['MOMENTUM_OUTREACH_CHECKOUT'])

def atomic(path,value):
    temp=path.with_suffix('.pending')
    with open(temp,'w',encoding='utf-8') as f:json.dump(value,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
    os.chmod(temp,0o600);os.replace(temp,path)

def read(path,default=None):
    try:return json.loads(path.read_text())
    except FileNotFoundError:return default

def due_jobs(group,schedule,now=None):
    now=now or datetime.datetime.now(datetime.timezone.utc)
    result=[]
    # Keep the production cron minutes. No catch-up send after a missed window.
    for item in schedule:
        if item['group']!=group:continue
        minute,hour,dom,month,weekday=item['cron'].split()
        if dom!='*' or month!='*':raise ValueError('SCHEDULE_INVALID')
        if (hour=='*' or int(hour)==now.hour) and (weekday=='*' or int(weekday)==(now.weekday()+1)%7) and 0<=now.minute-int(minute)<5:
            result.append({'kind':item['kind'],'requestId':'timer-'+item['kind']+'-'+now.strftime('%Y%m%d')+'-'+str(now.hour).zfill(2)+minute.zfill(2)})
    return result

class Worker:
    def __init__(self,group,state):
        self.group=group;self.state=pathlib.Path(state);self.state.mkdir(parents=True,exist_ok=True,mode=0o700)
        self.cfg=read(self.state/'worker.json')
        if not self.cfg or not re.fullmatch(r'https://script\.google\.com/macros/s/[\w-]+/exec',self.cfg.get('url','')):raise RuntimeError('WORKER_CONFIG_REQUIRED')
        self.receipt_path=self.state/(group+'-receipt.json')
        self.log_path=self.state/(group+'-execution.log')
        self.schedule=read(SOURCE/'cloud_schedule.json',[])
        self.child=None
    def rpc(self,action,**payload):
        data={'route':'momentum_automation_worker','workerToken':self.cfg['workerToken'],'workerId':self.cfg['workerId']+'-'+self.group,'action':action,**payload}
        req=urllib.request.Request(self.cfg['url'],data=json.dumps(data).encode(),headers={'Content-Type':'text/plain;charset=UTF-8'})
        with urllib.request.urlopen(req,timeout=35) as response:value=json.load(response)
        if not value.get('ok'):raise RuntimeError(value.get('error','RELAY_FAILED'))
        return value['result']
    def run(self,args,env=None,timeout=21000):
        # Logs remain private on the VM; callers never receive recipients or credentials.
        with open(self.log_path,'ab',buffering=0) as log:
            os.chmod(self.log_path,0o600)
            self.child=subprocess.Popen(args,cwd=ROOT,env=env or os.environ.copy(),stdout=log,stderr=log,start_new_session=True)
            try:
                end=time.monotonic()+timeout
                while self.child.poll() is None:
                    if STOP.wait(1) or time.monotonic()>end:
                        os.killpg(self.child.pid,signal.SIGTERM)
                        try:self.child.wait(15)
                        except subprocess.TimeoutExpired:os.killpg(self.child.pid,signal.SIGKILL);self.child.wait()
                        raise RuntimeError('EXECUTION_INTERRUPTED')
                if self.child.returncode:raise RuntimeError('COMMAND_FAILED')
            finally:self.child=None
    def heartbeat(self,receipt,done):
        while not done.wait(20):
            try:self.rpc('heartbeat',runId=receipt['job']['runId'],claim=receipt['job']['claim'])
            except Exception:
                # Stop further work after losing ownership/relay, never continue sending blind.
                FAULT.set();STOP.set();return
    def execute(self,job):
        # Ubuntu owns operational data; no checkout pulls or GitHub data exports.
        if not (ROOT/'targets_db.csv').is_file():raise RuntimeError('LOCAL_DATABASE_REQUIRED')
        env={**os.environ,'MOMENTUM_SERVER_WORKER':'1','MOMENTUM_DRIVE_DB':'1'}
        for key in ['SYNC_PAT','GITHUB_TOKEN','GITHUB_ACTIONS']:env.pop(key,None)
        kind=job['kind'];failed=None
        try:
            if kind=='mail':self.run([sys.executable,'run_cycle.py'],env,1200)
            elif kind=='archive':self.run([sys.executable,'telemetry_archive.py'],env,300)
            elif kind in ('search','classify','both'):
                output=self.state/(self.group+'-output.txt');output.write_text('');os.chmod(output,0o600)
                env.update(PIPELINE_MODE=kind,GITHUB_OUTPUT=str(output),GITHUB_EVENT_NAME='schedule' if job['requestId'].startswith('timer-') else 'workflow_dispatch',GITHUB_RUN_ID=str(job['runId']))
                self.run([sys.executable,'sweep_lifecycle.py'],env,90)
                values=dict(line.split('=',1) for line in output.read_text().splitlines() if '=' in line)
                sweep=values.get('sweep_id','')
                if not re.fullmatch(r'[\w-]+',sweep):raise RuntimeError('SWEEP_ID_INVALID')
                while not STOP.is_set():
                    output.write_text('')
                    self.run([sys.executable,'prospect_pipeline.py','--sweep-id',sweep,'--mode',kind],env)
                    values=dict(line.split('=',1) for line in output.read_text().splitlines() if '=' in line)
                    if values.get('resume_needed')!='true':break
                if STOP.is_set():raise RuntimeError('EXECUTION_INTERRUPTED')
            else:raise RuntimeError('JOB_KIND_INVALID')
        except Exception as e:failed=e
        # Local atomic checkpoints survive errors; Drive readback verifies preservation.
        try:self.run([sys.executable,'persist_sweep.py'],env,1800)
        except Exception as e:failed=e
        if failed:raise failed
    def tick(self):
        receipt=read(self.receipt_path)
        if not self.rpc('status').get('enabled'):return
        if not receipt:
            for due in due_jobs(self.group,self.schedule):self.rpc('schedule',**due)
            receipt={'requestId':str(uuid.uuid4())};atomic(self.receipt_path,receipt)
        if 'job' not in receipt:
            result=self.rpc('claim',group=self.group,requestId=receipt['requestId'])
            if not result.get('job'):self.receipt_path.unlink();return
            receipt['job']=result['job'];atomic(self.receipt_path,receipt)
        if receipt.get('started') and not receipt.get('phase'):
            # Operator reconciliation, rather than replaying an uncertain email or command.
            receipt.update(phase='failed',error='INTERRUPTED_RECONCILE_REQUIRED');atomic(self.receipt_path,receipt)
        if not receipt.get('phase'):
            receipt['started']=True;atomic(self.receipt_path,receipt)
            done=threading.Event();thread=threading.Thread(target=self.heartbeat,args=(receipt,done),daemon=True);thread.start()
            try:self.execute(receipt['job']);receipt['phase']='success'
            except Exception as e:
                code=str(e);receipt.update(phase='failed',error=code if re.fullmatch(r'[A-Z_0-9]{1,80}',code) else 'EXECUTION_FAILED')
            finally:done.set();thread.join(timeout=40)
            atomic(self.receipt_path,receipt)
        self.rpc('complete',runId=receipt['job']['runId'],claim=receipt['job']['claim'],phase=receipt['phase'],error=receipt.get('error'))
        self.receipt_path.unlink()

def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser();parser.add_argument('--group',choices=['mail','prospect','archive'],required=True);parser.add_argument('--state',required=True);parser.add_argument('--once',action='store_true');args=parser.parse_args()
    worker=Worker(args.group,args.state)
    with open(worker.state/(args.group+'.lock'),'w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        for sig in (signal.SIGTERM,signal.SIGINT):signal.signal(sig,lambda *_:STOP.set())
        while not STOP.is_set():
            try:worker.tick()
            except Exception as e:print(datetime.datetime.now(datetime.timezone.utc).isoformat(),str(e) if re.fullmatch(r'[A-Z_0-9]{1,80}',str(e)) else 'WORKER_ERROR',flush=True)
            if args.once:break
            STOP.wait(60)
    if FAULT.is_set():raise SystemExit(75)

if __name__=='__main__':main()
