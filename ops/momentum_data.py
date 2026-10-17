"""Authenticated operations on the shared Ubuntu database, backed up to Drive."""
import csv,datetime as dt,fcntl,json,os,re
from pathlib import Path
from drive_backup import LIVE,request_backup,public_status

CONFIG=LIVE/'system_config.json'
def read_config():
    value=json.loads(CONFIG.read_text())
    if type(value.get('email_system_enabled')) is not bool:raise ValueError('CONFIG_UNAVAILABLE')
    return value
def atomic(path,value):
    temp=path.with_suffix('.pending');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2));temp.chmod(0o600);os.replace(temp,path)
def rows():
    with (LIVE/'targets_db.csv').open(encoding='utf-8-sig',newline='') as f:
        reader=csv.DictReader(f);return reader.fieldnames,list(reader)
def targets():
    _,values=rows();mapping={'no':'순번','company':'회사채널명','rep':'대표자','email':'이메일','channel_url':'채널URL','region':'지역','category':'카테고리','status':'상태','sent_at':'발송일시','views':'현재조회수','point':'영업포인트','prospect_score':'ProspectScore','prospect_grade':'ProspectGrade','score_version':'ScoreVersion','score_snapshot':'ScoreSnapshot'}
    result={}
    for row in values:
        token=row.get('토큰','').strip()
        if not token:continue
        if token in result:raise ValueError('DUPLICATE_TARGET_TOKEN')
        item={key:row.get(field,'') for key,field in mapping.items()};item.update(token=token,is_priority=any(k in item['point']+item['views'] for k in ['구인','채용','공고']));result[token]=item
    return result
def site_config():
    config=read_config();return {'client_access_blocked':config.get('client_access_blocked') is True,'blocked_message':str(config.get('blocked_message','서비스 점검 중입니다.'))[:1000]}
def call(action,payload):
    if action=='settings.status':
        value=read_config();return {**site_config(),'email_system_enabled':value['email_system_enabled'],'source':'ubuntu','updated_at':value.get('updated_at')}
    if action=='targets.exclusions':return {'entries':read_config().get('excluded_targets',{}),'source':'ubuntu'}
    if action not in ['settings.update','targets.exclude']:raise ValueError('INVALID_ACTION')
    with (LIVE/'.database.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX);config=read_config()
        if action=='settings.update':
            setting=payload.get('setting');value=payload.get('value')
            if setting not in ['email_system_enabled','client_access_blocked'] or type(value) is not bool:raise ValueError('INVALID_SETTING')
            config[setting]=value
        else:
            token=payload.get('token')
            if not isinstance(token,str) or not re.fullmatch('[A-Za-z0-9_-]{4,128}',token):raise ValueError('INVALID_TARGET_TOKEN')
            fields,values=rows();row=next((v for v in values if v.get('토큰')==token),None)
            if not row:raise ValueError('TARGET_NOT_FOUND')
            if row.get('상태') not in ['READY','REVIEW','EXCLUDED']:raise ValueError('TARGET_NOT_EXCLUDABLE')
            entries=config.setdefault('excluded_targets',{});entries[token]={'channel_url':row.get('채널URL','').rstrip('/'),'email':row.get('이메일','').strip().lower(),'excluded_at':dt.datetime.now(dt.timezone.utc).isoformat()}
            row['상태']='EXCLUDED';temp=LIVE/'targets_db.pending'
            with temp.open('w',encoding='utf-8-sig',newline='') as f:
                writer=csv.DictWriter(f,fieldnames=fields);writer.writeheader();writer.writerows(values);f.flush();os.fsync(f.fileno())
            temp.chmod(0o600);os.replace(temp,LIVE/'targets_db.csv')
        config['updated_at']=dt.datetime.now(dt.timezone.utc).isoformat();atomic(CONFIG,config)
    request_backup()
    return {'saved':True,'source':'ubuntu','entries':config.get('excluded_targets',{}),'backupPending':True}
