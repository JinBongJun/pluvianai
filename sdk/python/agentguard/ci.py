"""
AgentGuard CI Integration SDK
Provides model validation in CI/CD pipelines with timeout and skip-on-failure options
"""

import os
import sys
import time
import httpx
import argparse
from typing import Optional, Dict, Any


class CIClient:
    """CI client for AgentGuard model validation"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        project_id: Optional[int] = None,
        api_url: Optional[str] = None,
        timeout: int = 60,
        skip_on_failure: bool = True
    ):
        """
        Initialize CI client
        
        Args:
            api_key: AgentGuard API key (defaults to AGENTGUARD_API_KEY env var)
            project_id: Project ID (defaults to AGENTGUARD_PROJECT_ID env var)
            api_url: AgentGuard API URL (defaults to AGENTGUARD_API_URL env var)
            timeout: Timeout in seconds (default: 60)
            skip_on_failure: Skip on failure (default: True) - if True, warnings only, don't block deployment
        """
        self.api_key = api_key or os.getenv("AGENTGUARD_API_KEY")
        self.project_id = project_id or int(os.getenv("AGENTGUARD_PROJECT_ID", "0"))
        self.api_url = api_url or os.getenv("AGENTGUARD_API_URL", "https://api.agentguard.ai")
        self.timeout = timeout
        self.skip_on_failure = skip_on_failure

        if not self.api_key:
            raise ValueError("AGENTGUARD_API_KEY environment variable is required")
        if not self.project_id:
            raise ValueError("AGENTGUARD_PROJECT_ID environment variable is required")

    def validate(
        self,
        new_model: str,
        provider: str = "openai",
        rubric_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Validate a model in CI/CD pipeline
        
        Args:
            new_model: Model name to validate
            provider: Provider name (default: openai)
            rubric_id: Optional rubric ID
        
        Returns:
            Validation result
        """
        start_time = time.time()

        try:
            # Prepare request
            payload = {
                "new_model": new_model,
                "provider": provider,
            }
            if rubric_id:
                payload["rubric_id"] = rubric_id

            # Make request with timeout
            with httpx.Client(timeout=self.timeout) as client:
                response = client.post(
                    f"{self.api_url}/api/v1/projects/{self.project_id}/validate-model",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                result = response.json()

            elapsed = time.time() - start_time

            # Check if validation passed
            validation_result = result.get("data", result)
            passed = validation_result.get("passed", False)
            score = validation_result.get("score", 0)

            if passed:
                print(f"✅ AgentGuard: Model validation passed (score: {score:.2f}, elapsed: {elapsed:.2f}s)")
                return {
                    "status": "passed",
                    "score": score,
                    "elapsed": elapsed,
                }
            else:
                message = f"❌ AgentGuard: Model validation failed (score: {score:.2f}, elapsed: {elapsed:.2f}s)"
                if self.skip_on_failure:
                    print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                    return {
                        "status": "warning",
                        "score": score,
                        "elapsed": elapsed,
                    }
                else:
                    print(message)
                    return {
                        "status": "failed",
                        "score": score,
                        "elapsed": elapsed,
                    }

        except httpx.TimeoutException:
            message = f"⏱️  AgentGuard: Validation timeout after {self.timeout}s"
            if self.skip_on_failure:
                print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                return {
                    "status": "timeout_warning",
                    "elapsed": self.timeout,
                }
            else:
                print(message)
                return {
                    "status": "timeout_error",
                    "elapsed": self.timeout,
                }

        except httpx.RequestError as e:
            message = f"🌐 AgentGuard: Network error: {str(e)}"
            if self.skip_on_failure:
                print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                return {
                    "status": "network_warning",
                    "error": str(e),
                }
            else:
                print(message)
                return {
                    "status": "network_error",
                    "error": str(e),
                }

        except Exception as e:
            message = f"❌ AgentGuard: Validation error: {str(e)}"
            if self.skip_on_failure:
                print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                return {
                    "status": "error_warning",
                    "error": str(e),
                }
            else:
                print(message)
                return {
                    "status": "error",
                    "error": str(e),
                }

    def run_ci_validation(
        self,
        project_id: int,
        timeout: Optional[int] = None,
        skip_on_failure: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        Run CI validation (golden case tests via replay service)
        
        Args:
            project_id: Project ID
            timeout: Timeout in seconds (uses instance timeout if not provided)
            skip_on_failure: Skip on failure (uses instance setting if not provided)
        
        Returns:
            Validation result
        """
        timeout = timeout or self.timeout
        skip_on_failure = skip_on_failure if skip_on_failure is not None else self.skip_on_failure
        start_time = time.time()

        try:
            # Prepare request
            payload = {
                "project_id": project_id,
                "timeout": timeout,
                "skip_on_failure": skip_on_failure,
            }

            # Make request with timeout
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{self.api_url}/api/v1/ci/validate",
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
                result = response.json()

            elapsed = time.time() - start_time

            # Check if validation passed
            validation_result = result.get("data", result)
            passed = validation_result.get("passed", False)
            score = validation_result.get("score", 0)

            if passed:
                print(f"✅ AgentGuard: CI validation passed (score: {score:.2f}, elapsed: {elapsed:.2f}s)")
                return {
                    "status": "passed",
                    "score": score,
                    "elapsed": elapsed,
                }
            else:
                message = f"❌ AgentGuard: CI validation failed (score: {score:.2f}, elapsed: {elapsed:.2f}s)"
                if skip_on_failure:
                    print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                    return {
                        "status": "warning",
                        "score": score,
                        "elapsed": elapsed,
                    }
                else:
                    print(message)
                    return {
                        "status": "failed",
                        "score": score,
                        "elapsed": elapsed,
                    }

        except httpx.TimeoutException:
            message = f"⏱️  AgentGuard: CI validation timeout after {timeout}s"
            if skip_on_failure:
                print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                return {
                    "status": "timeout_warning",
                    "elapsed": timeout,
                }
            else:
                print(message)
                return {
                    "status": "timeout_error",
                    "elapsed": timeout,
                }

        except httpx.RequestError as e:
            message = f"🌐 AgentGuard: Network error: {str(e)}"
            if skip_on_failure:
                print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                return {
                    "status": "network_warning",
                    "error": str(e),
                }
            else:
                print(message)
                return {
                    "status": "network_error",
                    "error": str(e),
                }

        except Exception as e:
            message = f"❌ AgentGuard: CI validation error: {str(e)}"
            if skip_on_failure:
                print(f"⚠️  {message} - Continuing deployment (skip_on_failure=true)")
                return {
                    "status": "error_warning",
                    "error": str(e),
                }
            else:
                print(message)
                return {
                    "status": "error",
                    "error": str(e),
                }


def run_validation(
    project_id: Optional[int] = None,
    api_key: Optional[str] = None,
    api_url: Optional[str] = None,
    new_model: Optional[str] = None,
    provider: str = "openai",
    rubric_id: Optional[int] = None,
    timeout: int = 60,
    skip_on_failure: bool = True
) -> Dict[str, Any]:
    """
    Run CI validation (can be called from CI/CD pipelines)
    
    Args:
        project_id: Project ID (or set AGENTGUARD_PROJECT_ID env var)
        api_key: API Key (or set AGENTGUARD_API_KEY env var)
        api_url: API URL (or set AGENTGUARD_API_URL env var)
        new_model: Model name to validate (optional, for model validation)
        provider: Provider name (default: openai)
        rubric_id: Optional rubric ID
        timeout: Timeout in seconds (default: 60)
        skip_on_failure: Skip on failure (default: True)
    
    Returns:
        Validation result dictionary
    """
    client = CIClient(
        api_key=api_key,
        project_id=project_id,
        api_url=api_url,
        timeout=timeout,
        skip_on_failure=skip_on_failure
    )
    
    if new_model:
        # Model validation
        return client.validate(
            new_model=new_model,
            provider=provider,
            rubric_id=rubric_id
        )
    else:
        # CI validation (golden case tests)
        return client.run_ci_validation(
            project_id=project_id or client.project_id,
            timeout=timeout,
            skip_on_failure=skip_on_failure
        )


def main():
    """CLI entry point"""
    parser = argparse.ArgumentParser(description="AgentGuard CI Model Validation")
    parser.add_argument("--project-id", type=int, help="Project ID (or set AGENTGUARD_PROJECT_ID)")
    parser.add_argument("--api-key", type=str, help="API Key (or set AGENTGUARD_API_KEY)")
    parser.add_argument("--api-url", type=str, help="API URL (or set AGENTGUARD_API_URL)")
    parser.add_argument("--timeout", type=int, default=60, help="Timeout in seconds (default: 60)")
    parser.add_argument("--skip-on-failure", action="store_true", default=True, help="Skip on failure (default: True)")
    parser.add_argument("--no-skip-on-failure", dest="skip_on_failure", action="store_false", help="Don't skip on failure")
    parser.add_argument("--model", type=str, help="Model name to validate (optional)")
    parser.add_argument("--provider", type=str, default="openai", help="Provider name (default: openai)")
    parser.add_argument("--rubric-id", type=int, help="Optional rubric ID")

    args = parser.parse_args()

    try:
        result = run_validation(
            project_id=args.project_id,
            api_key=args.api_key,
            api_url=args.api_url,
            new_model=args.model,
            provider=args.provider,
            rubric_id=args.rubric_id,
            timeout=args.timeout,
            skip_on_failure=args.skip_on_failure
        )

        # Exit with appropriate code
        if result["status"] in ["failed", "timeout_error", "network_error", "error"]:
            sys.exit(1)
        else:
            sys.exit(0)

    except Exception as e:
        print(f"❌ AgentGuard CI: Fatal error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
