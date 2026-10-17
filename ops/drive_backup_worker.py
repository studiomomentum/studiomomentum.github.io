import time
from drive_backup import REQUEST,STATUS,read,snapshot,atomic,STATE,safe_error,now

PROJECTS=['momentum','aight','btc','control']

def run_pending(state,persist):
    pending=state['pending']
    for project in PROJECTS:
        if project in pending['completedProjects']:continue
        result=snapshot(project)
        pending['completedProjects'].append(project);persist(state)
        print(now(),project,'VERIFIED',result['files'],flush=True)
    state.update(lastRequest=pending['request'],completedAt=now(),pending=None,nextAttemptAt=0)
    persist(state)

def main():
    path=STATE/'drive-backup-worker.json';state=read(path)
    last=time.monotonic() if len(read(STATUS).get('projects',{}))==4 else 0
    while True:
        request=read(REQUEST).get('requestedAt')
        if not state.get('pending') and (time.monotonic()-last>=3600 or request and request!=state.get('lastRequest')):
            state.update(pending={'request':request,'startedAt':now(),'completedProjects':[]},nextAttemptAt=0);atomic(path,state)
        if state.get('pending') and time.time()>=state.get('nextAttemptAt',0):
            try:
                run_pending(state,lambda value:atomic(path,value));last=time.monotonic()
            except Exception as error:
                state['nextAttemptAt']=time.time()+300;atomic(path,state)
                print(now(),'RETRY_WAIT',safe_error(error),flush=True)
        time.sleep(5)

if __name__=='__main__':main()
