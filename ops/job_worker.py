#!/usr/bin/env python3
import argparse
import fcntl
import signal
import time
from controls import STATE,recover,run_next

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--resource',choices=['btc','aight'],required=True);args=parser.parse_args()
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (STATE/(args.resource+'-worker.lock')).open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);recover(args.resource)
        running=True
        def stop(*_):
            nonlocal running;running=False
        signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
        while running:
            if not run_next(args.resource):time.sleep(1)
if __name__=='__main__':main()
