# 첫 번째 콘텐츠용 간이 서비스 계획 — Support GPT (A1)

**목적**: 포스트 1(Support GPT Regression Gate)용 데모를 위해, “사용자가 운영하는 고객지원 봇”을 **한 폴더 안에서만** 구현하고, 메인 앱 코드는 건드리지 않는다.  
**관련 문서**: [content-and-demo-execution-plan.md](./content-and-demo-execution-plan.md)

---

## 1. 이 서비스가 하는 일

- **역할**: “사용자(우리)가 운영하는 고객지원 봇” 하나.
- **동작**: 질문 목록(Worst + 정상)을 입력으로 **Pluvian 프록시**로 OpenAI Chat Completions 요청을 보냄 → 트래픽이 캡처되어 **스냅샷**이 쌓임 → 이후 Release Gate에서 같은 스냅샷으로 재생·비교.
- **목표**: “프롬프트/모델만 바꿨는데 어디서 깨졌는지”를 재현 가능하게 만드는 것. 별도 로그인·DB 없이 **스크립트 + 질문 파일**만으로 동작.

---

## 2. 기술 요구사항 (프록시 기준)

코드베이스 `backend/app/api/v1/endpoints/proxy.py` 기준.

- **엔드포인트**: `POST {PLUVIAN_BASE_URL}/api/v1/proxy/openai/v1/chat/completions`
- **필수 헤더**
  - `Authorization: Bearer {OPENAI_API_KEY}` — 클라이언트가 키를 넘기거나, 백엔드가 기본 키를 쓰면 생략 가능.
  - `Content-Type: application/json`
  - `X-Project-ID: {PROJECT_ID}` — 스냅샷이 붙을 프로젝트 ID (Pluvian UI에서 프로젝트 생성 후 확인).
- **선택 헤더**
  - `X-Agent-Name: support-bot` — 에이전트 이름 (Live View에서 구분용).
  - `X-Chain-ID: {trace_id}` — 같은 대화/플로우 묶음용 (없으면 백엔드가 UUID 생성).
- **Body**: OpenAI Chat Completions 형식.  
  예: `{"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "당신은 고객지원 봇입니다. ..."}, {"role": "user", "content": "환불 어떻게 해요?"}]}`

---

## 3. 폴더/파일 구조 제안

- **위치**: 레포 루트 `demos/` (또는 `demos/support-bot-a1/`).
- **구성**:

| 파일 | 용도 |
|------|------|
| **README.md** | 목적, 사전 조건(백엔드 실행, 프로젝트 생성), 환경변수, 실행 순서, 스크린샷 찍을 단계. |
| **.env.example** | `PLUVIAN_BASE_URL`, `PLUVIAN_PROJECT_ID`, `OPENAI_API_KEY` (또는 “서버 기본 키 사용” 안내). |
| **questions.json** | Worst 10~20개 + 정상 10~20개 질문. 예: `[{"id":"w1","text":"환불 처리 부탁해요","category":"worst"}, ...]`. |
| **run_demo.py** | `questions.json`을 읽어서 각 질문마다 위 프록시 URL로 POST 한 번씩 보냄. 시스템 프롬프트는 고정(예: “고객지원 봇” 한 줄). |
| **(선택) requirements.txt** | `httpx` 등만 명시. |

---

## 4. 실행 흐름 (계획)

1. **사전**
   - Pluvian 백엔드 실행.
   - Pluvian UI에서 로그인 → 프로젝트 생성 → **Project ID** 확인.
   - (선택) 에이전트 이름 하나 지정해 두기 (예: support-bot).
2. **데모 스크립트**
   - `demos/` 에서 `.env` 설정 후 `python run_demo.py` 실행.
   - 20~40개 질문이 순차적으로 프록시로 전송됨.
3. **스냅샷 확인**
   - Live View에서 해당 프로젝트·에이전트 선택 → 트레이스/스냅샷 생성 여부 확인.
4. **회귀 시나리오**
   - 시스템 프롬프트를 일부러 “깨지기 쉬운” 문장으로 바꾸거나, 모델을 한 단계 바꿔서 같은 스냅샷으로 Release Gate 재생 → PASS/FAIL·Behavior Diff 확인.
5. **콘텐츠용 산출물**
   - 스크린샷 3장: (1) “문제가 된” 질문/답 비교, (2) Release Gate 실행 화면, (3) 결과(FAIL + Diff).

---

## 5. 질문 목록 설계 (questions.json)

- **Worst**: 환불/취소, 불만, 애매한 표현, 긴 글, 도메인 특수 용어 등 10~20개.
- **정상**: 인사, 단순 문의, FAQ 성격 10~20개.
- **포맷**: `[{"id":"...","text":"...","category":"worst"|"normal"}]` 등으로 통일하면 스크립트에서 순서/라벨 제어하기 쉬움.

---

## 6. “간이 서비스” 범위

- **포함**: 프록시 호출만 하는 클라이언트(스크립트) + 질문 데이터 + 실행/스크린샷 가이드. **별도 웹 서버·DB·인증 없음.**
- **제외**: 실제 사용자 로그인, 대시보드, n8n 연동 등. 나중에 A2·n8n 데모는 `demos/` 아래 다른 폴더로 확장.

---

## 7. 다음 단계

1. `demos/` (또는 `demos/support-bot-a1/`) 생성.
2. 위 구조대로 `README.md`, `.env.example`, `questions.json`, `run_demo.py` 초안 작성.
3. 로컬에서 한 번 돌려서 스냅샷 쌓임 확인.
4. [content-and-demo-execution-plan.md](./content-and-demo-execution-plan.md)의 A1 체크리스트에 “demos/support-bot-a1 실행 및 스냅샷 20~40개 수집” 항목 반영.

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-03
