#!/bin/bash
cd /www/wwwroot/bem.it.sc.cn/backend
source venv/bin/activate
exec python -m uvicorn main:app --host 0.0.0.0 --port 8000
