#!/usr/bin/env python3
"""
Railway startup script
Railway provides PORT environment variable
"""
import os
import sys

# CRITICAL: Log immediately to both stdout and stderr
# Railway may capture either or both
print("=" * 80, file=sys.stderr)
print("🚀🚀🚀 START.PY EXECUTING 🚀🚀🚀", file=sys.stderr)
print("=" * 80, file=sys.stderr)
print("=" * 80)
print("🚀🚀🚀 START.PY EXECUTING 🚀🚀🚀")
print("=" * 80)

# Get PORT from environment variable, default to 8000
port = os.environ.get("PORT", "8000")

# Log to both stdout and stderr so Railway captures it
for output in [sys.stdout, sys.stderr]:
    print(f"🚀 Starting AgentGuard backend on port {port}", file=output)
    print(f"📡 PORT environment variable: {port}", file=output)
    print(f"📡 All environment variables with PORT: {[k for k in os.environ.keys() if 'PORT' in k]}", file=output)
    print(f"📡 RAILWAY_ENVIRONMENT: {os.environ.get('RAILWAY_ENVIRONMENT', 'NOT SET')}", file=output)
    print(f"📡 RAILWAY_SERVICE_NAME: {os.environ.get('RAILWAY_SERVICE_NAME', 'NOT SET')}", file=output)
    print(f"📡 Current working directory: {os.getcwd()}", file=output)
    print(f"📡 Python executable: {sys.executable}", file=output)

# Start uvicorn (Railway runs this from backend directory)
# Enable access log to see ALL incoming requests
# CRITICAL: Use --log-config or ensure all logs are captured
cmd = [
    sys.executable,
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    "0.0.0.0",
    "--port",
    str(port),
    "--log-level",
    "info",
    "--access-log",  # Enable access logging
    "--no-use-colors",  # Disable colors for Railway logs
]

print(f"🔧 Executing: {' '.join(cmd)}", file=sys.stderr)
print(f"🔧 Starting uvicorn on 0.0.0.0:{port}", file=sys.stderr)

# Use execvp to replace current process
# This will block until uvicorn exits
os.execvp(cmd[0], cmd)
