"""Read authoritative Ubuntu prospect checkpoints; never fetch GitHub telemetry."""
import ast
from collections import Counter
import csv
import datetime as dt
import json
from pathlib import Path
import re
import subprocess

BASE=Path('/home/pc/Documents/Server')
ROOT=BASE/'runtime/outreach/prospect/checkout'
SOURCE=BASE/'backends/outreach'

def read(path,default=None):
    try:return json.loads(path.read_text())
    except FileNotFoundError:return default if default is not None else {}

def timestamp(path):return dt.datetime.fromtimestamp(path.stat().st_mtime,dt.timezone.utc).isoformat()

def dimensions():
    values={}
    for node in ast.parse((SOURCE/'live_prospecting.py').read_text()).body:
        if isinstance(node,ast.Assign):
            for target in node.targets:
                if isinstance(target,ast.Name) and target.id in ['REGIONS','PROFESSIONS']:values[target.id]=ast.literal_eval(node.value)
    return values['REGIONS'],list(values['PROFESSIONS'])

def schedule():
    items=[v for v in read(SOURCE/'cloud_schedule.json',[]) if v.get('group')=='prospect']
    candidates=[];now=dt.datetime.now(dt.timezone.utc)
    for item in items:
        minute,hour,day,month,weekday=item['cron'].split()
        if not(minute.isdigit() and hour.isdigit() and weekday.isdigit() and day==month=='*'):continue
        for delta in range(8):
            candidate=(now+dt.timedelta(days=delta)).replace(hour=int(hour),minute=int(minute),second=0,microsecond=0)
            if (candidate.weekday()+1)%7==int(weekday) and candidate>now:candidates.append(candidate);break
    return min(candidates).isoformat() if candidates else None

def progress():
    control=read(ROOT/'sweep_control.json');sid=control.get('sweep_id','')
    if not isinstance(sid,str) or not re.fullmatch(r'[\w-]{1,120}',sid):raise ValueError('SEARCH_CHECKPOINT_UNAVAILABLE')
    path=ROOT/'sweep_runs'/sid/'state.json'
    if not path.is_file():raise ValueError('SEARCH_CHECKPOINT_UNAVAILABLE')
    state=read(path);queries=state.get('queries',{});observed=state.get('observed',{});decisions=state.get('decisions',{})
    ledger_path=ROOT/'prospect_candidates.json';ledger=read(ledger_path)
    with (ROOT/'targets_db.csv').open(encoding='utf-8-sig',newline='') as stream:ready=sum(row.get('상태')=='READY' for row in csv.DictReader(stream))
    receipt=read(BASE/'runtime/outreach/prospect/state/prospect-receipt.json');job=receipt.get('job',{})
    unit=subprocess.run(['/usr/bin/systemctl','is-active','momentum-outreach-prospect.service'],capture_output=True,text=True,timeout=5)
    service_active=unit.returncode==0;running=service_active and bool(receipt.get('started') and not receipt.get('phase'))
    kind=job.get('kind') if running else None
    active=state.get('classify_stage',{}).get('active',[]) if running and kind in ['classify','both'] else []
    active=[{'channel_id':v.get('channel_id',''),'name':v.get('name',''),'query':v.get('query') or ledger.get(v.get('channel_id'),{}).get('query','')} for v in active]
    counts=Counter(decisions.get(cid,'PENDING') for cid in ledger);processed=sum(counts[k] for k in ['ELIGIBLE','REVIEW','REJECTED','ERROR','EXCLUDED'])
    pending=max(0,len(ledger)-processed-len(active))
    classification={'total':len(ledger),'processed':processed,'pending':pending,'processing':len(active),'eligible':counts['ELIGIBLE'],'review':counts['REVIEW'],'rejected':counts['REJECTED'],'errors':counts['ERROR'],'ready':ready,'active':active}
    classification['status']=state.get('classify_stage',{}).get('status','not_running') if running and kind in ['classify','both'] else 'incomplete' if pending else 'complete'
    regions,professions=dimensions();expected=[r+' '+p for r in regions for p in professions]
    completed=sum(queries.get(q,{}).get('status')=='completed' for q in expected)
    search_stage=dict(state.get('search_stage',{}))
    if not running and search_stage.get('status')!='complete':search_stage['status']='incomplete'
    recent=sorted([(cid,v) for cid,v in observed.items() if v.get('at') and not v.get('excluded')],key=lambda item:item[1]['at'],reverse=True)[:2]
    last=[{'channel_id':cid,'name':ledger.get(cid,{}).get('channel',cid),'query':ledger.get(cid,{}).get('query',''),'at':v['at']} for cid,v in recent]
    value={'source':'ubuntu','sweep_id':sid,'phase':'complete' if completed==len(expected) and not pending and not running else state.get('phase'),
      'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'updated_at':timestamp(path),'region':search_stage.get('region',''),
      'execution':{'backend':'ubuntu','serviceActive':service_active,'running':running,'kind':kind,'runId':job.get('runId') if running else None,'phase':receipt.get('phase')},
      'queries_completed':completed,'queries_total':len(expected),'channels_discovered':len({cid for q in queries.values() for cid in q.get('channels',[])}),
      'query_errors':{q:'수집 오류' for q,v in queries.items() if v.get('status')=='error'},'search_stage':search_stage,'classification':classification,'recent':last,'next_search_at':schedule(),'regions':[]}
    for region in regions:
        records={p:queries.get(region+' '+p,{}) for p in professions};ids={cid for r in records.values() for cid in r.get('channels',[])}
        value['regions'].append({'name':region,'queries_completed':sum(r.get('status')=='completed' for r in records.values()),'queries_total':len(professions),'channels':len(ids),
          'classified':sum(cid in decisions for cid in ids),'classification_errors':sum(decisions.get(cid)=='ERROR' for cid in ids),'classified_at':state.get('regions',{}).get(region,{}).get('classified_at'),
          'jobs':[{'name':p,'status':'running' if running and kind in ['search','both'] and region+' '+p in state.get('active_queries',[]) and r.get('status') not in ['completed','error'] else r.get('status','pending'),'channels':len(r.get('channels',[])),'results_read':r.get('results_read',0)} for p,r in records.items()]})
    statuses=Counter(c.get('status','UNKNOWN') for c in ledger.values())
    value['stats']={'source':'ubuntu','schema_version':2,'total_candidates':len(ledger),'discovered_count':statuses['DISCOVERED']+statuses['VERIFIED'],'review_count':statuses['REVIEW'],'rejected_count':statuses['REJECTED'],'error_count':statuses['ERROR'],'duplicate_count':statuses['DUPLICATE'],'registered_count':statuses['REGISTERED'],'ready_count':ready,'status_counts':dict(statuses),'updated_at':timestamp(ledger_path),
      'sweep':{'sweep_id':sid,'queries_completed':completed,'queries_total':len(expected),'channels_discovered':value['channels_discovered'],'channels_observed':sum(v.get('status')=='completed' for v in observed.values()),'status':state.get('status')}}
    return value
