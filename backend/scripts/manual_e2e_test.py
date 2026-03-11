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
from typing import Optional, Dict, Any


# 설정
BASE_URL = os.getenv("AGENTGUARD_TEST_URL", "http://localhost:8000")
API_PREFIX = "/api/v1"


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
        """API 키로 API Call 전송"""
        assert self.api_key, "No API key"
        
        self._ensure_project()
        assert self.project_id, "No project"
        
        response = self.client.post(
            f"{API_PREFIX}/api-calls",
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
            headers={"Authorization": f"Bearer {self.api_key}"}
        )
        
        assert response.status_code == 201, f"Status {response.status_code}: {response.text}"
        return True
    
    def test_retrieve_api_calls(self) -> bool:
        """API Call 조회"""
        assert self.access_token and self.project_id
        
        time.sleep(1)  # 데이터 처리 대기
        
        response = self.client.get(
            f"{API_PREFIX}/api-calls",
            params={"project_id": self.project_id, "limit": 5},
            headers={"Authorization": f"Bearer {self.access_token}"}
        )
        
        assert response.status_code == 200
        return True
    
    # ================== Phase 5: 엣지 케이스 ==================
    
    def test_invalid_api_key(self) -> bool:
        """잘못된 API 키"""
        response = self.client.post(
            f"{API_PREFIX}/api-calls",
            json={
                "project_id": 1,
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
            f"{API_PREFIX}/api-calls",
            json={
                "project_id": 1,
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
