#!/bin/bash
set -euo pipefail
AIGHT_INSTALL_DIR="$HOME/Library/Application Support/ControlAight"
AIGHT_AGENT_DIR="$HOME/Library/LaunchAgents"
AIGHT_PYTHON_BIN="$(command -v python3)"
mkdir -p "$AIGHT_INSTALL_DIR" "$AIGHT_AGENT_DIR"
curl -fsSL 'https://raw.githubusercontent.com/studiomomentum/studiomomentum.github.io/main/ops/mac_worker.py' -o "$AIGHT_INSTALL_DIR/mac_worker.py"
read -r -p '통합 어드민에서 발급한 맥북 연결 코드를 입력하세요: ' AIGHT_PAIR_CODE
"$AIGHT_PYTHON_BIN" "$AIGHT_INSTALL_DIR/mac_worker.py" --pair-code "$AIGHT_PAIR_CODE" --pair-only
"$AIGHT_PYTHON_BIN" - "$AIGHT_INSTALL_DIR" "$AIGHT_AGENT_DIR" "$AIGHT_PYTHON_BIN" <<'PY'
import os,plistlib,sys
from pathlib import Path
folder=Path(sys.argv[1]);agent=Path(sys.argv[2])/'com.control.aight.plist'
value={'Label':'com.control.aight','ProgramArguments':[sys.argv[3],str(folder/'mac_worker.py')],'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'StandardOutPath':str(folder/'worker.log'),'StandardErrorPath':str(folder/'worker-error.log')}
agent.write_bytes(plistlib.dumps(value));agent.chmod(0o600)
PY
launchctl bootout "gui/$(id -u)/com.control.aight" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AIGHT_AGENT_DIR/com.control.aight.plist"
printf '\n맥북 작업자가 연결되었습니다. 통합 어드민에서 연결 상태를 확인하세요.\n'
