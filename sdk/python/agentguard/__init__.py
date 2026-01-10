"""
AgentGuard Python SDK - Zero-config monitoring for LLM APIs
"""
import os
import json
import time
import httpx
import threading
from typing import Optional, Dict, Any, Callable
from functools import wraps
from contextlib import contextmanager


class AgentGuard:
    """AgentGuard SDK for automatic LLM API monitoring"""
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        project_id: Optional[int] = None,
        api_url: Optional[str] = None,
        agent_name: Optional[str] = None,
        enabled: bool = True
    ):
        """
        Initialize AgentGuard SDK
        
        Args:
            api_key: AgentGuard API key (defaults to AGENTGUARD_API_KEY env var)
            project_id: Project ID (defaults to AGENTGUARD_PROJECT_ID env var)
            api_url: AgentGuard API URL (defaults to AGENTGUARD_API_URL env var)
            agent_name: Agent name for tracking (defaults to AGENTGUARD_AGENT_NAME env var)
            enabled: Whether monitoring is enabled (defaults to True)
        """
        self.api_key = api_key or os.getenv("AGENTGUARD_API_KEY")
        self.project_id = project_id or os.getenv("AGENTGUARD_PROJECT_ID")
        self.api_url = api_url or os.getenv("AGENTGUARD_API_URL", "https://api.agentguard.dev")
        self.agent_name = agent_name or os.getenv("AGENTGUARD_AGENT_NAME")
        self.enabled = enabled and self.api_key and self.project_id
        
        self._patched = False
        self._original_functions = {}
        
        # Thread-local storage for chain_id and agent_name context
        self._local = threading.local()
    
    def init(self):
        """
        Initialize and patch OpenAI SDK automatically
        
        This method automatically patches the OpenAI Python SDK to capture
        all API calls without requiring code changes.
        
        Example:
            import agentguard
            agentguard.init()
            
            # Now all OpenAI calls are automatically monitored
            from openai import OpenAI
            client = OpenAI()
            response = client.chat.completions.create(...)
        """
        if not self.enabled:
            print("AgentGuard: Monitoring disabled (missing API key or project ID)")
            return
        
        if self._patched:
            print("AgentGuard: Already initialized")
            return
        
        try:
            self._patch_openai()
            self._patched = True
            print(f"AgentGuard: Successfully initialized for project {self.project_id}")
        except Exception as e:
            print(f"AgentGuard: Failed to initialize: {e}")
    
    def _patch_openai(self):
        """Patch OpenAI SDK to capture API calls"""
        try:
            import openai
        except ImportError:
            print("AgentGuard: OpenAI SDK not found. Install with: pip install openai")
            return
        
        # Patch ChatCompletion.create
        if hasattr(openai, "ChatCompletion") and hasattr(openai.ChatCompletion, "create"):
            original_create = openai.ChatCompletion.create
            
            @wraps(original_create)
            def patched_create(*args, **kwargs):
                return self._capture_call(original_create, *args, **kwargs)
            
            openai.ChatCompletion.create = patched_create
            self._original_functions["ChatCompletion.create"] = original_create
        
        # Patch OpenAI client (v1.0+)
        if hasattr(openai, "OpenAI"):
            original_init = openai.OpenAI.__init__
            
            def patched_init(self_instance, *args, **kwargs):
                original_init(self_instance, *args, **kwargs)
                # Patch the chat.completions.create method
                if hasattr(self_instance, "chat") and hasattr(self_instance.chat, "completions"):
                    original_chat_create = self_instance.chat.completions.create
                    
                    @wraps(original_chat_create)
                    def patched_chat_create(*args, **kwargs):
                        return self._capture_call(original_chat_create, *args, **kwargs)
                    
                    self_instance.chat.completions.create = patched_chat_create
                    self._original_functions[f"{id(self_instance)}.chat.completions.create"] = original_chat_create
            
            openai.OpenAI.__init__ = patched_init
            self._original_functions["OpenAI.__init__"] = original_init
    
    def _capture_call(self, original_func: Callable, *args, **kwargs):
        """Capture and log an API call"""
        start_time = time.time()
        request_data = {
            "args": str(args),
            "kwargs": kwargs,
        }
        
        try:
            # Call original function
            response = original_func(*args, **kwargs)
            
            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000
            
            # Extract response data
            response_data = {}
            if hasattr(response, "model_dump"):
                response_data = response.model_dump()
            elif hasattr(response, "dict"):
                response_data = response.dict()
            elif hasattr(response, "__dict__"):
                response_data = response.__dict__
            
            # Send to AgentGuard API (async, non-blocking)
            self._send_to_api(request_data, response_data, latency_ms, 200)
            
            return response
            
        except Exception as e:
            # Calculate latency even on error
            latency_ms = (time.time() - start_time) * 1000
            
            # Send error to AgentGuard API
            error_data = {
                "error": str(e),
                "error_type": type(e).__name__,
            }
            self._send_to_api(request_data, error_data, latency_ms, 500)
            
            # Re-raise the exception
            raise
    
    def _get_chain_id(self) -> Optional[str]:
        """Get chain_id from thread-local storage"""
        return getattr(self._local, 'chain_id', None)
    
    def _get_agent_name(self) -> Optional[str]:
        """Get agent_name from thread-local storage or instance default"""
        return getattr(self._local, 'agent_name', self.agent_name)
    
    @contextmanager
    def chain(self, chain_id: str, agent_name: Optional[str] = None):
        """
        Context manager to set chain_id and agent_name for a chain of API calls
        
        Example:
            with agentguard.chain("user-query-123", agent_name="data-collector"):
                response1 = openai.chat.completions.create(...)
                response2 = openai.chat.completions.create(...)
            # Both calls will have chain_id="user-query-123"
        """
        old_chain_id = getattr(self._local, 'chain_id', None)
        old_agent_name = getattr(self._local, 'agent_name', None)
        
        self._local.chain_id = chain_id
        if agent_name:
            self._local.agent_name = agent_name
        
        try:
            yield
        finally:
            if old_chain_id is not None:
                self._local.chain_id = old_chain_id
            else:
                delattr(self._local, 'chain_id')
            
            if old_agent_name is not None:
                self._local.agent_name = old_agent_name
            elif hasattr(self._local, 'agent_name'):
                delattr(self._local, 'agent_name')
    
    def _send_to_api(self, request_data: Dict[str, Any], response_data: Dict[str, Any], latency_ms: float, status_code: int):
        """Send API call data to AgentGuard (non-blocking)"""
        if not self.enabled:
            return
        
        try:
            # Get chain_id and agent_name from context
            chain_id = self._get_chain_id()
            agent_name = self._get_agent_name()
            
            # Prepare payload
            payload = {
                "project_id": int(self.project_id),
                "request_data": request_data,
                "response_data": response_data,
                "latency_ms": latency_ms,
                "status_code": status_code,
                "agent_name": agent_name,
            }
            
            # Add chain_id if available
            if chain_id:
                payload["chain_id"] = chain_id
            
            # Send asynchronously (fire and forget)
            # In production, use a background thread or queue
            try:
                with httpx.Client(timeout=2.0) as client:
                    client.post(
                        f"{self.api_url}/api/v1/api-calls",
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                    )
            except Exception:
                # Silently fail - don't block the application
                pass
                
        except Exception:
            # Silently fail - don't block the application
            pass
    
    def track_call(
        self,
        request_data: Dict[str, Any],
        response_data: Dict[str, Any],
        latency_ms: float,
        status_code: int = 200,
        agent_name: Optional[str] = None,
        chain_id: Optional[str] = None
    ):
        """
        Manually track an API call
        
        Use this if you want to manually track calls instead of using auto-patching.
        
        Args:
            request_data: Request payload
            response_data: Response payload
            latency_ms: Latency in milliseconds
            status_code: HTTP status code
            agent_name: Optional agent name
            chain_id: Optional chain ID to group related calls
        """
        if not self.enabled:
            return
        
        # Store chain_id and agent_name temporarily
        old_chain_id = getattr(self._local, 'chain_id', None)
        old_agent_name = getattr(self._local, 'agent_name', None)
        
        if chain_id:
            self._local.chain_id = chain_id
        if agent_name:
            self._local.agent_name = agent_name
        
        try:
            self._send_to_api(
                request_data,
                response_data,
                latency_ms,
                status_code
            )
        finally:
            # Restore old values
            if old_chain_id is not None:
                self._local.chain_id = old_chain_id
            elif hasattr(self._local, 'chain_id') and not chain_id:
                delattr(self._local, 'chain_id')
            
            if old_agent_name is not None:
                self._local.agent_name = old_agent_name
            elif hasattr(self._local, 'agent_name') and not agent_name:
                delattr(self._local, 'agent_name')


# Global instance
_global_instance: Optional[AgentGuard] = None


def init(
    api_key: Optional[str] = None,
    project_id: Optional[int] = None,
    api_url: Optional[str] = None,
    agent_name: Optional[str] = None
):
    """
    Initialize AgentGuard with zero-config setup
    
    This function automatically patches the OpenAI SDK to capture all API calls.
    
    Example:
        import agentguard
        agentguard.init()
        
        # Now all OpenAI calls are automatically monitored
        from openai import OpenAI
        client = OpenAI()
        response = client.chat.completions.create(...)
    
    Args:
        api_key: AgentGuard API key (defaults to AGENTGUARD_API_KEY env var)
        project_id: Project ID (defaults to AGENTGUARD_PROJECT_ID env var)
        api_url: AgentGuard API URL (defaults to AGENTGUARD_API_URL env var)
        agent_name: Agent name for tracking (defaults to AGENTGUARD_AGENT_NAME env var)
    """
    global _global_instance
    _global_instance = AgentGuard(
        api_key=api_key,
        project_id=project_id,
        api_url=api_url,
        agent_name=agent_name
    )
    _global_instance.init()


def chain(chain_id: str, agent_name: Optional[str] = None):
    """
    Context manager to set chain_id and agent_name for a chain of API calls
    
    Example:
        import agentguard
        agentguard.init()
        
        with agentguard.chain("user-query-123", agent_name="data-collector"):
            response1 = openai.chat.completions.create(...)
            response2 = openai.chat.completions.create(...)
        # Both calls will have chain_id="user-query-123"
    """
    global _global_instance
    if not _global_instance:
        raise RuntimeError("AgentGuard not initialized. Call agentguard.init() first.")
    return _global_instance.chain(chain_id, agent_name)


def track_call(
    request_data: Dict[str, Any],
    response_data: Dict[str, Any],
    latency_ms: float,
    status_code: int = 200,
    agent_name: Optional[str] = None,
    chain_id: Optional[str] = None
):
    """
    Manually track an API call
    
    Use this if you want to manually track calls instead of using auto-patching.
    
    Args:
        request_data: Request payload
        response_data: Response payload
        latency_ms: Latency in milliseconds
        status_code: HTTP status code
        agent_name: Optional agent name
        chain_id: Optional chain ID to group related calls
    """
    global _global_instance
    if _global_instance:
        _global_instance.track_call(
            request_data,
            response_data,
            latency_ms,
            status_code,
            agent_name,
            chain_id
        )
    else:
        # Create a temporary instance
        instance = AgentGuard()
        instance.track_call(
            request_data,
            response_data,
            latency_ms,
            status_code,
            agent_name,
            chain_id
        )
