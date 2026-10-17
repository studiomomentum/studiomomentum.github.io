"""Reconcile observer and display adapters with the activated local database."""
from pathlib import Path
base=Path('/home/pc/Documents/Server/backends/server-monitor')
p=base/'monitor.py';s=p.read_text().replace("enabled=remote.get('mail_enabled',config.get('email_system_enabled')) is True","enabled=config.get('email_system_enabled') is True").replace('GitHub 저장소는 코드·발송 이력을 계속 보관합니다.','운영 DB·발송 이력은 우분투에서 처리하고 Google Drive에 보존합니다.');p.write_text(s)
p=base/'observer.py';s=p.read_text();a=s.index('  env={}');b=s.index(' try:\n  cfg=json.loads((BASE/\'config/momentum/admin-session.json\')',a)
s=s[:a]+'''  cfg=json.loads((BASE/'databases/outreach/live/system_config.json').read_text());result['mail_enabled']=cfg['email_system_enabled'] is True
  result['database_backend']='ubuntu-drive'
 except Exception as e:errors.append('LOCAL_DB_'+type(e).__name__)
'''+s[b:];p.write_text(s)
