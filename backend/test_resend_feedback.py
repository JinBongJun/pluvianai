import httpx
import os

API_KEY = os.environ.get("RESEND_API_KEY") or "re_MmKohiDw_D2kgEzBiJwY31q7LSoHLUmJe"  # 여기 re_... 자리에 지금 쓰는 키 그대로 넣어도 됨

FROM = "PluvianAI <onboarding@resend.dev>"
TO = ["delivered@resend.dev"]

resp = httpx.post(
    "https://api.resend.com/emails",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    },
    json={
        "from": FROM,
        "to": TO,
        "subject": "[PluvianAI] Test feedback",
        "text": "This is a test from test_resend_feedback.py",
    },
    timeout=10.0,
)

print("STATUS", resp.status_code)
print("BODY", resp.text)