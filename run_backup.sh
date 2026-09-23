#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd /Users/pc/Desktop/PD/06_개발도구/자체제작프로그램/studiomomentum.github.io
/opt/homebrew/bin/python3 backup_service.py >> backup_service.log 2>&1
