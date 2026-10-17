import time
from drive_backup import REQUEST,STATUS,read,snapshot,atomic,STATE
if __name__=='__main__':
    seen=None;last=time.monotonic() if len(read(STATUS).get('projects',{}))==4 else 0
    while True:
        request=read(REQUEST).get('requestedAt')
        if time.monotonic()-last>=3600 or request and request!=seen:
            try:
                for project in ['momentum','aight','btc','control']:snapshot(project)
                seen=request;last=time.monotonic();atomic(STATE/'drive-backup-worker.json',{'lastRequest':seen})
            except Exception:last=time.monotonic()-3300
        time.sleep(5)
