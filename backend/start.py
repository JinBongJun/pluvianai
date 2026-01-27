#!/usr/bin/env python3
"""
Railway startup script
Railway provides PORT environment variable
"""
import os
import sys
import subprocess

# Get PORT from environment variable, default to 8000
port = os.environ.get("PORT", "8000")

# Start uvicorn
cmd = [
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    str(port),
]

os.execvp(cmd[0], cmd)
