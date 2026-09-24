#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd -- "$(dirname -- "$0")"
exec /opt/homebrew/bin/python3 backup_service.py >> backup_service.log 2>&1
