#!/usr/bin/env python3
"""
PluvianAI 수동 E2E 테스트 스크립트

pytest 없이 직접 실행 가능한 테스트 스크립트입니다.
백엔드 서버가 실행 중이어야 합니다.

사용법:
    # 백엔드 서버 시작 (별도 터미널)
    cd backend
    uvicorn app.main:app --reload
    
    # 테스트 실행
    cd backend
    python scripts/manual_e2e_test.py
    
    # 또는 특정 서버 URL로 테스트
    AGENTGUARD_TEST_URL=http://localhost:8000 python scripts/manual_e2e_test.py
"""

import os
import sys
import httpx
import secrets
import time
from datetime import datetime
from typing import Optional, Dict, Any, List


# 설정
BASE_URL = os.getenv("AGENTGUARD_TEST_URL", "http://localhost:8000")
API_PREFIX = "/api/v1"
ONBOARDING_POLL_SECONDS = int(os.getenv("AGENTGUARD_ONBOARDING_POLL_SECONDS", "20"))
ONBOARDING_POLL_INTERVAL_SECONDS = float(os.getenv("AGENTGUARD_ONBOARDING_POLL_INTERVAL_SECONDS", "1.0"))


class Colors:
    """터미널 색상"""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(title: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{title}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")


def print_success(msg: str):
    print(f"{Colors.GREEN}[OK] {msg}{Colors.RESET}")


def print_error(msg: str):
    print(f"{Colors.RED}[FAIL] {msg}{Colors.RESET}")


def print_warning(msg: str):
    print(f"{Colors.YELLOW}[WARN] {msg}{Colors.RESET}")


def print_info(msg: str):
    print(f"{Colors.BLUE}[INFO] {msg}{Colors.RESET}")


class TestRunner:
    """테스트 실행기"""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.Client(base_url=base_url, timeout=30.0)
        
        # 테스트 상태
        self.access_token: Optional[str] = None
        self.api_key: Optional[str] = None
        self.api_key_id: Optional[int] = None
        self.project_id: Optional[int] = None
        self.user_id: Optional[int] = None
        self.agent_id: Optional[str] = None
        
        # 테스트 계정
        self.test_email = f"test_{secrets.token_hex(6)}@gmail.com"
        self.test_password = "TestPassword123!"
        
        # 결과 추적
        self.passed = 0
        self.failed = 0
        self.skipped = 0
    
    def close(self):
        self.client.close()
    
    def run_test(self, name: str, func) -> bool:
        """테스트 실행 및 결과 기록"""
        try:
            print(f"  Testing: {name}...", end=" ")
            result = func()
            if result is None or result:
                print_success("PASSED")
                self.passed += 1
                return True
            else:
                print_error("FAILED")
                self.failed += 1
                return False
        except AssertionError as e:
            print_error(f"FAILED - {e}")
            self.failed += 1
            return False
        except Exception as e:
            print_error(f"ERROR - {e}")
            self.failed += 1
            return False
    
    # ================== Phase 1: 인프라 ==================
    
    def test_health_check(self) -> bool:
        """헬스 체크"""
        response = self.client.get(f"{API_PREFIX}/health")
        assert response.status_code == 200, f"Status {response.status_code}"
        return True
    
    def test_api_docs(self) -> bool:
        """API 문서 확인"""
        response = self.client.get("/docs")
        assert response.status_code == 200, f"Status {response.status_code}"
        return True
    
    # ================== Phase 2: 인증 ==================
    
    def test_signup(self) -> bool:
        """회원가입"""
        response = self.client.post(
            f"{API_PREFIX}/auth/register",
            json={
                "email": self.test_email,
                "password": self.test_password,
                "full_name": "E2E Test User",
                "liability_agreement_accepted": True
            }
        )
        
        if response.status_code == 400 and "already" in response.text.lower():
            print_warning(f"User exists, continuing...")
            return True
        
        assert response.status_code in [200, 201], f"Status {response.status_code}: {response.text}"
        return True
    
    def test_login(self) -> bool:
        """로그인"""
        response = self.client.post(
            f"{API_PREFIX}/auth/login",
            data={
                "username": self.test_email,
                "password": self.test_password
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"}
        )
        
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        
        data = response.json()
        token_data = data.get("data", data)
        self.access_token = token_data["access_token"]
        
        assert self.access_token, "No access token"
        return True
    
    def test_get_profile(self) -> bool:
        """프로필 조회"""
        assert self.access_token, "No token"
        
        response = self.client.get(
            f"{API_PREFIX}/settings/profile",
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 200, f"Status {response.status_code}"
        
        data = response.json()
        profile = data.get("data", data)
        self.user_id = profile.get("id")
        
        return True
    
    def test_create_api_key(self) -> bool:
        """API 키 생성"""
        assert self.access_token, "No token"
        
        response = self.client.post(
            f"{API_PREFIX}/settings/api-keys",
            json={"name": "E2E Test Key"},
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 201, f"Status {response.status_code}: {response.text}"
        
        data = response.json()
        self.api_key = data.get("api_key")
        self.api_key_id = data.get("id")
        
        assert self.api_key and self.api_key.startswith("ag_live_"), f"Invalid key format: {self.api_key}"
        return True
    
    def test_list_api_keys(self) -> bool:
        """API 키 목록"""
        assert self.access_token, "No token"
        
        response = self.client.get(
            f"{API_PREFIX}/settings/api-keys",
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 200
        
        data = response.json()
        keys = data.get("data", data)
        assert isinstance(keys, list), "Expected list"
        
        return True
    
    # ================== Phase 3: SDK 통합 ==================
    
    def _ensure_project(self):
        """프로젝트 확인/생성"""
        if self.project_id:
            return
        
        # 기존 프로젝트 조회
        response = self.client.get(
            f"{API_PREFIX}/projects",
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        if response.status_code == 200:
            data = response.json()
            projects = data.get("data", data) if isinstance(data, dict) else data
            if isinstance(projects, list) and projects:
                self.project_id = projects[0]["id"]
                return
        
        # 조직 확인/생성
        response = self.client.get(
            f"{API_PREFIX}/organizations",
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        org_id = None
        if response.status_code == 200:
            data = response.json()
            orgs = data.get("data", data) if isinstance(data, dict) else data
            if isinstance(orgs, list) and orgs:
                org_id = orgs[0]["id"]
        
        if not org_id:
            response = self.client.post(
                f"{API_PREFIX}/organizations",
                json={"name": "E2E Test Org"},
                headers={"Authorization": f"Bearer {self.access_token}"}
            )
            if response.status_code in [200, 201]:
                data = response.json()
                org_id = data.get("data", data).get("id")
        
        # 프로젝트 생성
        if org_id:
            response = self.client.post(
                f"{API_PREFIX}/projects",
                json={"name": "E2E Test Project", "organization_id": org_id},
                headers={"Authorization": f"Bearer {self.access_token}"}
            )
            if response.status_code in [200, 201]:
                data = response.json()
                self.project_id = data.get("data", data).get("id")
    
    def test_send_api_call(self) -> bool:
        """인증 토큰으로 API Call 전송"""
        assert self.access_token, "No access token"
        
        self._ensure_project()
        assert self.project_id, "No project"
        
        response = self.client.post(
            f"{API_PREFIX}/projects/{self.project_id}/api-calls",
            json={
                "project_id": self.project_id,
                "request_data": {
                    "model": "gpt-4",
                    "messages": [{"role": "user", "content": "E2E test message"}]
                },
                "response_data": {
                    "model": "gpt-4",
                    "choices": [{"message": {"content": "E2E test response"}}],
                    "usage": {"total_tokens": 25}
                },
                "latency_ms": 234.56,
                "status_code": 200,
                "agent_name": "e2e-test-agent",
                "chain_id": f"e2e-{secrets.token_hex(4)}"
            },
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 202, f"Status {response.status_code}: {response.text}"
        return True

    @staticmethod
    def _extract_agents_list(payload: Any) -> List[Dict[str, Any]]:
        """Live View/Release Gate agents 응답의 shape 차이를 흡수."""
        if isinstance(payload, list):
            return [x for x in payload if isinstance(x, dict)]
        if not isinstance(payload, dict):
            return []

        direct_agents = payload.get("agents")
        if isinstance(direct_agents, list):
            return [x for x in direct_agents if isinstance(x, dict)]

        direct_items = payload.get("items")
        if isinstance(direct_items, list):
            return [x for x in direct_items if isinstance(x, dict)]

        nested = payload.get("data")
        if isinstance(nested, list):
            return [x for x in nested if isinstance(x, dict)]
        if isinstance(nested, dict):
            nested_agents = nested.get("agents")
            if isinstance(nested_agents, list):
                return [x for x in nested_agents if isinstance(x, dict)]

        return []

    def test_live_view_agents_visible(self) -> bool:
        """
        온보딩 해피패스 핵심:
        첫 API call 이후 Live View agents endpoint에서 노드가 노출되는지 확인.
        """
        assert self.access_token and self.project_id
        headers = {"Authorization": f"Bearer {self.access_token}"}
        endpoint = f"{API_PREFIX}/projects/{self.project_id}/live-view/agents"

        deadline = time.time() + ONBOARDING_POLL_SECONDS
        last_body_preview = ""
        while time.time() < deadline:
            response = self.client.get(endpoint, headers=headers)
            assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
            payload = response.json()
            agents = self._extract_agents_list(payload)
            if agents:
                first = agents[0]
                agent_id = first.get("agent_id") or first.get("id")
                if agent_id:
                    self.agent_id = str(agent_id)
                return True

            # 디버깅 가독성을 위해 body preview를 짧게 유지
            last_body_preview = str(payload)[:280]
            time.sleep(ONBOARDING_POLL_INTERVAL_SECONDS)

        raise AssertionError(
            f"No agents visible in Live View within {ONBOARDING_POLL_SECONDS}s. Last payload: {last_body_preview}"
        )

    def test_release_gate_agents_visible(self) -> bool:
        """
        온보딩 해피패스 마지막 연결:
        동일 프로젝트가 Release Gate agents endpoint에서도 조회 가능한지 확인.
        """
        assert self.access_token and self.project_id
        headers = {"Authorization": f"Bearer {self.access_token}"}
        endpoint = f"{API_PREFIX}/projects/{self.project_id}/release-gate/agents"

        deadline = time.time() + ONBOARDING_POLL_SECONDS
        last_body_preview = ""
        while time.time() < deadline:
            response = self.client.get(endpoint, headers=headers)
            assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
            payload = response.json()
            agents = self._extract_agents_list(payload)
            if agents:
                return True

            last_body_preview = str(payload)[:280]
            time.sleep(ONBOARDING_POLL_INTERVAL_SECONDS)

        raise AssertionError(
            f"No agents visible in Release Gate within {ONBOARDING_POLL_SECONDS}s. Last payload: {last_body_preview}"
        )

    def test_release_gate_quick_run(self) -> bool:
        """
        Release Gate 해피패스:
        Live View에서 감지된 agent_id에 대해 최근 스냅샷 기반 Replay Test를 1회 실행해
        end-to-end 경로가 동작하는지 확인한다.
        """
        assert self.access_token and self.project_id, "Missing token/project for Release Gate"
        assert self.agent_id, "agent_id not set from Live View; run live-view agents test first"

        headers = {"Authorization": f"Bearer {self.access_token}"}
        payload = {
            "agent_id": self.agent_id,
            "use_recent_snapshots": True,
            "recent_snapshot_limit": 10,
            "model_source": "detected",
            "evaluation_mode": "replay_test",
            "repeat_runs": 1,
            "max_snapshots": 10,
            # INT-6 관점에서는 “1회 실행” 여부만 중요하므로
            # 게이트 통과/실패와 무관하게 호출/응답 경로만 검증한다.
            "fail_rate_max": 1.0,
            "flaky_rate_max": 1.0,
        }

        response = self.client.post(
            f"{API_PREFIX}/projects/{self.project_id}/release-gate/validate",
            json=payload,
            headers=headers,
        )
        assert response.status_code == 200, f"Status {response.status_code}: {response.text}"
        data = response.json()
        # 최소한의 shape 검증만 수행 (pass 여부는 강제하지 않는다).
        assert isinstance(data, dict), "Release Gate response must be a JSON object"
        assert "pass" in data, "Release Gate response missing 'pass' field"
        assert "case_results" in data, "Release Gate response missing 'case_results' field"
        return True
    
    def test_retrieve_api_calls(self) -> bool:
        """API Call 조회"""
        assert self.access_token and self.project_id
        
        time.sleep(1)  # 데이터 처리 대기
        
        response = self.client.get(
            f"{API_PREFIX}/projects/{self.project_id}/api-calls",
            params={"limit": 5},
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 200
        return True

    # ================== Phase 4: Reliability (Ops Alerting) ==================

    def test_ops_alert_dry_run_endpoint(self) -> bool:
        """
        우선순위 2 최소 검증:
        admin dry-run endpoint가 동작하고 accepted 응답을 반환하는지 확인.

        NOTE:
        - 일반 테스트 계정은 admin 권한이 없어 호출 불가.
        - AGENTGUARD_ADMIN_TOKEN 환경변수를 주면 해당 토큰으로 검증한다.
        """
        admin_token = os.getenv("AGENTGUARD_ADMIN_TOKEN")
        if not admin_token:
            self.skipped += 1
            print_warning("Skipped (set AGENTGUARD_ADMIN_TOKEN to verify /admin/ops-alerts/test)")
            return True

        response = self.client.post(
            f"{API_PREFIX}/admin/ops-alerts/test",
            json={
                "event_type": "custom",
                "project_id": self.project_id or 1,
                "repeats": 1,
                "custom_severity": "warning",
                "custom_title": "E2E dry-run",
                "custom_summary": "manual_e2e_test.py reliability smoke test",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert response.status_code == 202, f"Status {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("accepted") is True, f"Unexpected response: {data}"
        return True
    
    # ================== Phase 5: 엣지 케이스 ==================
    
    def test_invalid_api_key(self) -> bool:
        """잘못된 API 키"""
        response = self.client.post(
            f"{API_PREFIX}/projects/1/api-calls",
            json={
                "request_data": {},
                "response_data": {},
                "latency_ms": 100,
                "status_code": 200
            },
            headers={"Authorization": "Bearer ag_live_invalid_key_xxxxx"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        return True
    
    def test_missing_auth(self) -> bool:
        """인증 누락"""
        response = self.client.post(
            f"{API_PREFIX}/projects/1/api-calls",
            json={
                "request_data": {},
                "response_data": {},
                "latency_ms": 100,
                "status_code": 200
            }
        )
        
        assert response.status_code == 401
        return True
    
    # ================== Cleanup ==================
    
    def test_delete_api_key(self) -> bool:
        """API 키 삭제"""
        if not self.access_token or not self.api_key_id:
            self.skipped += 1
            return True
        
        response = self.client.delete(
            f"{API_PREFIX}/settings/api-keys/{self.api_key_id}",
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 204
        return True
    
    # ================== 메인 실행 ==================
    
    def run_all(self):
        """모든 테스트 실행"""
        print_header(f"PluvianAI E2E Test - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print_info(f"Target: {self.base_url}")
        print_info(f"Test account: {self.test_email}")
        
        # Phase 1
        print_header("Phase 1: Infrastructure")
        self.run_test("Health check", self.test_health_check)
        self.run_test("API docs", self.test_api_docs)
        
        # Phase 2
        print_header("Phase 2: Authentication")
        self.run_test("Signup", self.test_signup)
        if not self.run_test("Login", self.test_login):
            print_error("Login failed, cannot continue")
            return
        self.run_test("Get profile", self.test_get_profile)
        self.run_test("Create API key", self.test_create_api_key)
        self.run_test("List API keys", self.test_list_api_keys)
        
        # Phase 3
        print_header("Phase 3: SDK Integration")
        self.run_test("Send API call with API key", self.test_send_api_call)
        self.run_test("Retrieve API calls", self.test_retrieve_api_calls)
        self.run_test("Live View agents visible", self.test_live_view_agents_visible)
        self.run_test("Release Gate agents visible", self.test_release_gate_agents_visible)
        self.run_test("Release Gate quick run (recent snapshots)", self.test_release_gate_quick_run)

        # Phase 4
        print_header("Phase 4: Reliability")
        self.run_test("Ops alert dry-run endpoint", self.test_ops_alert_dry_run_endpoint)
        
        # Phase 5
        print_header("Phase 5: Edge Cases")
        self.run_test("Invalid API key", self.test_invalid_api_key)
        self.run_test("Missing auth", self.test_missing_auth)
        
        # Cleanup
        print_header("Cleanup")
        self.run_test("Delete API key", self.test_delete_api_key)
        
        # 결과 요약
        print_header("Results")
        total = self.passed + self.failed + self.skipped
        print(f"  Total:   {total}")
        print_success(f"Passed:  {self.passed}")
        if self.failed > 0:
            print_error(f"Failed:  {self.failed}")
        else:
            print(f"  Failed:  {self.failed}")
        if self.skipped > 0:
            print_warning(f"Skipped: {self.skipped}")
        
        print()
        if self.failed == 0:
            print_success("All tests passed!")
            return True
        else:
            print_error(f"{self.failed} test(s) failed")
            return False


def main():
    print(f"\n{Colors.BOLD}PluvianAI E2E Test Suite{Colors.RESET}")
    print(f"{'='*40}\n")
    
    # 서버 연결 확인
    print_info(f"Connecting to {BASE_URL}...")
    
    try:
        with httpx.Client(base_url=BASE_URL, timeout=5.0) as client:
            response = client.get(f"{API_PREFIX}/health")
            if response.status_code != 200:
                print_error(f"Server returned {response.status_code}")
                return 1
    except httpx.ConnectError:
        print_error(f"Cannot connect to {BASE_URL}")
        print()
        print("Make sure the backend server is running:")
        print(f"  cd backend")
        print(f"  uvicorn app.main:app --reload")
        return 1
    except Exception as e:
        print_error(f"Connection error: {e}")
        return 1
    
    print_success("Server is running")
    
    # 테스트 실행
    runner = TestRunner(BASE_URL)
    try:
        success = runner.run_all()
        return 0 if success else 1
    finally:
        runner.close()


if __name__ == "__main__":
    sys.exit(main())
