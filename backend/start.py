#!/usr/bin/env python3
"""
Railway startup script
Railway provides PORT environment variable
"""
import os
import sys

# Get PORT from environment variable, default to 8000
port = os.environ.get("PORT", "8000")

print(f"🚀 Starting AgentGuard backend on port {port}")
print(f"📡 PORT environment variable: {port}")

# Start uvicorn (Railway runs this from backend directory)
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

print(f"🔧 Executing: {' '.join(cmd)}")

# Use execvp to replace current process
os.execvp(cmd[0], cmd)
