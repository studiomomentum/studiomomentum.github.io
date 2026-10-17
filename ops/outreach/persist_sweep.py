"""Persist a verified Google Drive snapshot; never stage or publish database files."""
from drive_backup import snapshot
if __name__=='__main__':
    result=snapshot('momentum')
    print('DRIVE_CHECKPOINT_VERIFIED',result['files'],flush=True)
