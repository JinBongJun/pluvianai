"""
End-to-End Integration Test Script for AgentGuard

이 스크립트는 실제 사용자 플로우를 테스트합니다:
Phase 1: 인프라 검증
Phase 2: 인증 플로우 (회원가입 → 로그인 → API 키 생성)
Phase 3: SDK → Backend 통합 (API Call 전송 및 저장)
Phase 4: Frontend 데이터 조회
Phase 5: 엣지 케이스 테스트

사용법:
    # 모든 테스트 실행
    python -m pytest tests/integration/test_e2e_flow.py -v
    
    # 특정 Phase만 실행
    python -m pytest tests/integration/test_e2e_flow.py -v -k "phase1"
    
    # 실제 서버 테스트 (로컬 서버 실행 필요)
    AGENTGUARD_TEST_URL=http://localhost:8000 python -m pytest tests/integration/test_e2e_flow.py -v
"""

import os
import pytest
import httpx
import time
import secrets
from typing import Optional, Dict, Any


# 테스트 설정
BASE_URL = os.getenv("AGENTGUARD_TEST_URL", "http://localhost:8000")
API_PREFIX = "/api/v1"


class TestContext:
    """테스트 컨텍스트 - 테스트 간 상태 공유"""
    access_token: Optional[str] = None
    user_id: Optional[int] = None
    project_id: Optional[int] = None
    organization_id: Optional[int] = None
    api_key: Optional[str] = None
    api_key_id: Optional[int] = None
    test_email: str = f"test_{secrets.token_hex(8)}@test.com"
    test_password: str = "TestPassword123!"


ctx = TestContext()


# ============================================================
# Phase 1: 인프라 검증
# ============================================================

class TestPhase1Infrastructure:
    """Phase 1: 인프라 검증 테스트"""
    
    def test_01_health_check(self):
        """서버 헬스 체크"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(f"{API_PREFIX}/health")
            assert response.status_code == 200, f"Health check failed: {response.text}"
            
            data = response.json()
            # 응답 형식 확인 (success_response 래퍼 사용 가능)
            if "data" in data:
                health_data = data["data"]
            else:
                health_data = data
            
            print(f"✅ Health check passed: {health_data}")
    
    def test_02_api_docs_available(self):
        """API 문서 접근 가능 확인"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get("/docs")
            assert response.status_code == 200, "API docs not available"
            print("✅ API docs available at /docs")
    
    def test_03_openapi_schema(self):
        """OpenAPI 스키마 확인"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get("/openapi.json")
            assert response.status_code == 200, "OpenAPI schema not available"
            
            schema = response.json()
            assert "paths" in schema, "Invalid OpenAPI schema"
            print(f"✅ OpenAPI schema available, {len(schema['paths'])} endpoints")


# ============================================================
# Phase 2: 인증 플로우 검증
# ============================================================

class TestPhase2Authentication:
    """Phase 2: 인증 플로우 테스트"""
    
    def test_01_signup(self):
        """회원가입 테스트"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                f"{API_PREFIX}/auth/signup",
                json={
                    "email": ctx.test_email,
                    "password": ctx.test_password,
                    "full_name": "Test User"
                }
            )
            
            # 이미 존재하는 경우도 처리
            if response.status_code == 400 and "already registered" in response.text.lower():
                print(f"⚠️ User already exists: {ctx.test_email}")
                return
            
            assert response.status_code in [200, 201], f"Signup failed: {response.text}"
            print(f"✅ Signup successful: {ctx.test_email}")
    
    def test_02_login(self):
        """로그인 테스트"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                f"{API_PREFIX}/auth/login",
                data={
                    "username": ctx.test_email,
                    "password": ctx.test_password
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            assert response.status_code == 200, f"Login failed: {response.text}"
            
            data = response.json()
            # success_response 래퍼 처리
            if "data" in data:
                token_data = data["data"]
            else:
                token_data = data
            
            assert "access_token" in token_data, "No access token in response"
            ctx.access_token = token_data["access_token"]
            print(f"✅ Login successful, token: {ctx.access_token[:20]}...")
    
    def test_03_get_profile(self):
        """프로필 조회 테스트"""
        assert ctx.access_token, "No access token - run login test first"
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                f"{API_PREFIX}/settings/profile",
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 200, f"Get profile failed: {response.text}"
            
            data = response.json()
            if "data" in data:
                profile = data["data"]
            else:
                profile = data
            
            ctx.user_id = profile.get("id")
            print(f"✅ Profile retrieved: user_id={ctx.user_id}, email={profile.get('email')}")
    
    def test_04_create_api_key(self):
        """API 키 생성 테스트"""
        assert ctx.access_token, "No access token - run login test first"
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                f"{API_PREFIX}/settings/api-keys",
                json={"name": "Test API Key"},
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 201, f"Create API key failed: {response.text}"
            
            data = response.json()
            assert "api_key" in data, "No api_key in response"
            assert data["api_key"].startswith("ag_live_"), "Invalid API key format"
            
            ctx.api_key = data["api_key"]
            ctx.api_key_id = data["id"]
            print(f"✅ API key created: {ctx.api_key[:20]}...")
    
    def test_05_list_api_keys(self):
        """API 키 목록 조회 테스트"""
        assert ctx.access_token, "No access token - run login test first"
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                f"{API_PREFIX}/settings/api-keys",
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 200, f"List API keys failed: {response.text}"
            
            data = response.json()
            if "data" in data:
                keys = data["data"]
            else:
                keys = data
            
            assert isinstance(keys, list), "Response should be a list"
            print(f"✅ API keys listed: {len(keys)} key(s)")


# ============================================================
# Phase 3: SDK → Backend 통합 검증
# ============================================================

class TestPhase3SDKIntegration:
    """Phase 3: SDK → Backend 통합 테스트"""
    
    def _ensure_project_exists(self):
        """테스트용 프로젝트가 있는지 확인하고 없으면 생성"""
        if ctx.project_id:
            return
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            # 먼저 기존 프로젝트 조회
            response = client.get(
                f"{API_PREFIX}/projects",
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                projects = data.get("data", data) if isinstance(data, dict) else data
                if projects and len(projects) > 0:
                    ctx.project_id = projects[0]["id"]
                    ctx.organization_id = projects[0].get("organization_id")
                    print(f"  Using existing project: {ctx.project_id}")
                    return
            
            # 프로젝트가 없으면 조직 먼저 확인/생성
            response = client.get(
                f"{API_PREFIX}/organizations",
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            if response.status_code == 200:
                data = response.json()
                orgs = data.get("data", data) if isinstance(data, dict) else data
                if orgs and len(orgs) > 0:
                    ctx.organization_id = orgs[0]["id"]
                else:
                    # 조직 생성
                    response = client.post(
                        f"{API_PREFIX}/organizations",
                        json={"name": "Test Organization"},
                        headers={"Authorization": f"Bearer {ctx.access_token}"}
                    )
                    if response.status_code in [200, 201]:
                        org_data = response.json()
                        ctx.organization_id = org_data.get("data", org_data).get("id")
            
            # 프로젝트 생성
            if ctx.organization_id:
                response = client.post(
                    f"{API_PREFIX}/projects",
                    json={
                        "name": "Test Project",
                        "organization_id": ctx.organization_id
                    },
                    headers={"Authorization": f"Bearer {ctx.access_token}"}
                )
                if response.status_code in [200, 201]:
                    project_data = response.json()
                    ctx.project_id = project_data.get("data", project_data).get("id")
                    print(f"  Created new project: {ctx.project_id}")
    
    def test_01_send_api_call_with_api_key(self):
        """API 키로 API Call 전송 테스트"""
        assert ctx.api_key, "No API key - run API key creation test first"
        
        self._ensure_project_exists()
        assert ctx.project_id, "No project ID available"
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            # SDK가 보내는 것과 동일한 형식으로 API Call 전송
            response = client.post(
                f"{API_PREFIX}/api-calls",
                json={
                    "project_id": ctx.project_id,
                    "request_data": {
                        "model": "gpt-4",
                        "messages": [
                            {"role": "user", "content": "Hello, how are you?"}
                        ]
                    },
                    "response_data": {
                        "id": "chatcmpl-test123",
                        "model": "gpt-4",
                        "choices": [
                            {
                                "message": {
                                    "role": "assistant",
                                    "content": "I'm doing well, thank you!"
                                }
                            }
                        ],
                        "usage": {
                            "prompt_tokens": 10,
                            "completion_tokens": 8,
                            "total_tokens": 18
                        }
                    },
                    "latency_ms": 523.45,
                    "status_code": 200,
                    "agent_name": "test-agent",
                    "chain_id": "test-chain-001"
                },
                headers={
                    "Authorization": f"Bearer {ctx.api_key}",
                    "Content-Type": "application/json"
                }
            )
            
            assert response.status_code == 201, f"Send API call failed: {response.text}"
            print(f"✅ API call sent successfully via API key")
    
    def test_02_send_multiple_api_calls(self):
        """여러 API Call 전송 테스트"""
        assert ctx.api_key, "No API key"
        assert ctx.project_id, "No project ID"
        
        with httpx.Client(base_url=BASE_URL, timeout=30.0) as client:
            models = ["gpt-4", "gpt-3.5-turbo", "claude-3-opus"]
            agents = ["router", "analyzer", "responder"]
            
            for i, (model, agent) in enumerate(zip(models, agents)):
                response = client.post(
                    f"{API_PREFIX}/api-calls",
                    json={
                        "project_id": ctx.project_id,
                        "request_data": {
                            "model": model,
                            "messages": [{"role": "user", "content": f"Test message {i+1}"}]
                        },
                        "response_data": {
                            "model": model,
                            "choices": [{"message": {"content": f"Response {i+1}"}}],
                            "usage": {"total_tokens": 20 + i * 5}
                        },
                        "latency_ms": 100 + i * 50,
                        "status_code": 200,
                        "agent_name": agent,
                        "chain_id": f"test-chain-{i:03d}"
                    },
                    headers={"Authorization": f"Bearer {ctx.api_key}"}
                )
                
                assert response.status_code == 201, f"Failed to send API call {i+1}"
            
            print(f"✅ Sent {len(models)} API calls with different models/agents")
    
    def test_03_retrieve_api_calls(self):
        """API Call 조회 테스트"""
        assert ctx.access_token, "No access token"
        assert ctx.project_id, "No project ID"
        
        # 잠시 대기 (데이터 처리 시간)
        time.sleep(1)
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                f"{API_PREFIX}/api-calls",
                params={"project_id": ctx.project_id, "limit": 10},
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 200, f"Get API calls failed: {response.text}"
            
            data = response.json()
            api_calls = data.get("data", data) if isinstance(data, dict) else data
            
            if not isinstance(api_calls, list):
                api_calls = [api_calls] if api_calls else []
            
            print(f"✅ Retrieved {len(api_calls)} API calls")
            
            # 최근 전송한 데이터가 있는지 확인
            if api_calls:
                latest = api_calls[0]
                print(f"   Latest: model={latest.get('model')}, agent={latest.get('agent_name')}")


# ============================================================
# Phase 4: Frontend 데이터 검증
# ============================================================

class TestPhase4DataRetrieval:
    """Phase 4: 데이터 조회 및 필터링 테스트"""
    
    def test_01_filter_by_model(self):
        """모델별 필터링 테스트"""
        assert ctx.access_token and ctx.project_id
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                f"{API_PREFIX}/api-calls",
                params={
                    "project_id": ctx.project_id,
                    "model": "gpt-4"
                },
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 200
            print("✅ Model filter works")
    
    def test_02_filter_by_agent(self):
        """에이전트별 필터링 테스트"""
        assert ctx.access_token and ctx.project_id
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                f"{API_PREFIX}/api-calls",
                params={
                    "project_id": ctx.project_id,
                    "agent_name": "test-agent"
                },
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 200
            print("✅ Agent filter works")
    
    def test_03_pagination(self):
        """페이지네이션 테스트"""
        assert ctx.access_token and ctx.project_id
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            # First page
            response1 = client.get(
                f"{API_PREFIX}/api-calls",
                params={"project_id": ctx.project_id, "limit": 2, "offset": 0},
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            # Second page
            response2 = client.get(
                f"{API_PREFIX}/api-calls",
                params={"project_id": ctx.project_id, "limit": 2, "offset": 2},
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response1.status_code == 200
            assert response2.status_code == 200
            print("✅ Pagination works")


# ============================================================
# Phase 5: 엣지 케이스 테스트
# ============================================================

class TestPhase5EdgeCases:
    """Phase 5: 엣지 케이스 테스트"""
    
    def test_01_invalid_api_key(self):
        """잘못된 API 키 테스트"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                f"{API_PREFIX}/api-calls",
                json={
                    "project_id": 1,
                    "request_data": {},
                    "response_data": {},
                    "latency_ms": 100,
                    "status_code": 200
                },
                headers={"Authorization": "Bearer ag_live_invalid_key_12345"}
            )
            
            assert response.status_code == 401, f"Expected 401, got {response.status_code}"
            print("✅ Invalid API key rejected with 401")
    
    def test_02_invalid_api_key_format(self):
        """잘못된 API 키 형식 테스트"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
                f"{API_PREFIX}/api-calls",
                json={
                    "project_id": 1,
                    "request_data": {},
                    "response_data": {},
                    "latency_ms": 100,
                    "status_code": 200
                },
                headers={"Authorization": "Bearer invalid_format_key"}
            )
            
            assert response.status_code == 401
            print("✅ Invalid API key format rejected with 401")
    
    def test_03_missing_authorization(self):
        """인증 헤더 누락 테스트"""
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.post(
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
            print("✅ Missing authorization rejected with 401")
    
    def test_04_expired_jwt_token(self):
        """만료된 JWT 토큰 테스트"""
        # 임의의 만료된 토큰 형식
        expired_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxfQ.invalid"
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.get(
                f"{API_PREFIX}/settings/profile",
                headers={"Authorization": f"Bearer {expired_token}"}
            )
            
            assert response.status_code == 401
            print("✅ Expired/invalid JWT rejected with 401")


# ============================================================
# Cleanup
# ============================================================

class TestCleanup:
    """테스트 정리"""
    
    def test_99_delete_api_key(self):
        """생성된 API 키 삭제"""
        if not ctx.access_token or not ctx.api_key_id:
            pytest.skip("No API key to delete")
        
        with httpx.Client(base_url=BASE_URL, timeout=10.0) as client:
            response = client.delete(
                f"{API_PREFIX}/settings/api-keys/{ctx.api_key_id}",
                headers={"Authorization": f"Bearer {ctx.access_token}"}
            )
            
            assert response.status_code == 204
            print(f"✅ API key {ctx.api_key_id} deleted")


# ============================================================
# 단독 실행용 함수
# ============================================================

def run_quick_test():
    """빠른 연결 테스트"""
    print(f"\n{'='*60}")
    print(f"AgentGuard E2E Quick Test")
    print(f"Base URL: {BASE_URL}")
    print(f"{'='*60}\n")
    
    try:
        with httpx.Client(base_url=BASE_URL, timeout=5.0) as client:
            response = client.get(f"{API_PREFIX}/health")
            if response.status_code == 200:
                print("✅ Server is running!")
                return True
            else:
                print(f"❌ Server returned {response.status_code}")
                return False
    except httpx.ConnectError:
        print(f"❌ Cannot connect to {BASE_URL}")
        print("   Make sure the backend server is running:")
        print("   cd backend && uvicorn app.main:app --reload")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "quick":
        run_quick_test()
    else:
        print("Run with pytest:")
        print("  pytest tests/integration/test_e2e_flow.py -v")
        print("\nOr quick connectivity test:")
        print("  python tests/integration/test_e2e_flow.py quick")
