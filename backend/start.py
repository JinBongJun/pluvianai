#!/usr/bin/env python3
"""
Railway startup script
Railway provides PORT environment variable
"""
import os
import sys

# Get PORT from environment variable, default to 8000
port = os.environ.get("PORT", "8000")

# Log to stderr so Railway captures it
print(f"🚀 Starting AgentGuard backend on port {port}", file=sys.stderr)
print(f"📡 PORT environment variable: {port}", file=sys.stderr)
print(f"📡 All environment variables with PORT: {[k for k in os.environ.keys() if 'PORT' in k]}", file=sys.stderr)

# Start uvicorn (Railway runs this from backend directory)
# Enable access log to see ALL incoming requests
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
]

print(f"🔧 Executing: {' '.join(cmd)}", file=sys.stderr)

# Use execvp to replace current process
os.execvp(cmd[0], cmd)
