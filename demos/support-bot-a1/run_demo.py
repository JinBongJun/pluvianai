"""
Support bot regression demo — uses PluvianAI SDK (same as docs).
Run: pip install -r requirements.txt, set .env, then python run_demo.py
"""
import json
import os
from pathlib import Path

from dotenv import load_dotenv


def load_env() -> None:
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)


def load_questions() -> list[dict]:
    path = Path(__file__).parent / "questions.json"
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    load_env()

    api_key = os.getenv("PLUVIANAI_API_KEY") or os.getenv("PLUVIAN_API_KEY")
    project_id = os.getenv("PLUVIANAI_PROJECT_ID") or os.getenv("PLUVIAN_PROJECT_ID")
    api_url = (os.getenv("PLUVIANAI_API_URL") or os.getenv("PLUVIAN_BASE_URL") or "http://localhost:8000").rstrip("/")
    agent_name = os.getenv("AGENT_NAME", "support-bot")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not api_key or not project_id:
        raise SystemExit(
            "Set PLUVIANAI_API_KEY (or PLUVIAN_API_KEY) and PLUVIANAI_PROJECT_ID (or PLUVIAN_PROJECT_ID) in .env. "
            "Get them from Project Settings → API Keys and the project URL."
        )
    if not openai_key:
        raise SystemExit("Set OPENAI_API_KEY in .env for OpenAI API calls.")

    # 1. Init PluvianAI (doc-style: same as in product docs)
    import pluvianai

    pluvianai.init(
        api_key=api_key,
        project_id=int(project_id),
        api_url=api_url,
        agent_name=agent_name,
    )

    # 2. Use OpenAI client; SDK will capture each call and send to PluvianAI
    from openai import OpenAI

    client = OpenAI(api_key=openai_key)
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    system_prompt = (
        "You are an English-speaking customer support bot for a SaaS product. "
        "Handle billing, refunds, account, and security questions clearly and politely. "
        "Never ask users to paste sensitive secrets such as full card numbers or passwords."
    )

    questions = load_questions()
    print(f"Sending {len(questions)} questions (captured by PluvianAI SDK)")

    for q in questions:
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": q["text"]},
                ],
            )
            content = (resp.choices[0].message.content or "") if resp.choices else ""
            print(f"[{q['id']}][{q.get('category')}] status=200, preview={content[:80]!r}")
        except Exception as e:
            print(f"[{q['id']}][{q.get('category')}] error: {e}")


if __name__ == "__main__":
    main()
