import asyncio
import httpx
import json
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.snapshot import Snapshot
from app.models.evaluation_rubric import EvaluationRubric
from app.api.v1.endpoints.proxy import PROVIDER_URLS
from app.core.logging_config import logger
from app.core.config import settings

class ReplayService:
    """Service for re-executing historical AI requests for testing"""

    def __init__(self, max_concurrency: int = 50):
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self.timeout = httpx.Timeout(60.0)

    async def replay_snapshot(
        self, 
        snapshot: Snapshot, 
        new_model: Optional[str] = None, 
        new_system_prompt: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute a single replay with optional overrides.
        """
        async with self.semaphore:
            # 1. Prepare Payload
            payload = snapshot.payload.copy()
            if new_model:
                payload["model"] = new_model
            
            if new_system_prompt:
                # Find system message and replace
                messages = payload.get("messages", [])
                for msg in messages:
                    if msg.get("role") == "system":
                        msg["content"] = new_system_prompt
                        break
                else:
                    # If no system prompt found, prepend it
                    messages.insert(0, {"role": "system", "content": new_system_prompt})
                payload["messages"] = messages

            # 2. Build URL
            provider = snapshot.provider
            base_url = PROVIDER_URLS.get(provider)
            # Assumption: Replay is mostly for Chat Completions
            endpoint = "/chat/completions" if provider != "google" else f"/models/{payload['model']}:generateContent"
            target_url = f"{base_url}{endpoint}"

            # 3. Headers
            # Use provided API key or fallback to environment
            final_key = api_key or getattr(settings, f"{provider.upper()}_API_KEY", None)
            headers = {"Content-Type": "application/json"}
            if provider == "openai":
                headers["Authorization"] = f"Bearer {final_key}"
            elif provider == "anthropic":
                headers["x-api-key"] = final_key
                headers["anthropic-version"] = "2023-06-01"
            elif provider == "google":
                headers["x-goog-api-key"] = final_key

            # 4. Execute
            start_time = asyncio.get_event_loop().time()
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(target_url, headers=headers, json=payload)
                    duration_ms = (asyncio.get_event_loop().time() - start_time) * 1000
                    
                    return {
                        "snapshot_id": snapshot.id,
                        "original_model": snapshot.model,
                        "replay_model": payload.get("model"),
                        "status_code": response.status_code,
                        "response_data": response.json() if response.status_code == 200 else response.text,
                        "latency_ms": duration_ms,
                        "success": response.status_code == 200
                    }
            except Exception as e:
                logger.error(f"Replay failed for snapshot {snapshot.id}: {str(e)}")
                return {
                    "snapshot_id": snapshot.id,
                    "success": False,
                    "error": str(e)
                }

    async def run_batch_replay(
        self, 
        snapshots: List[Snapshot], 
        new_model: Optional[str] = None,
        new_system_prompt: Optional[str] = None,
        rubric: Optional[EvaluationRubric] = None
    ) -> List[Dict[str, Any]]:
        """Run multiple replays in parallel and evaluate if rubric is provided"""
        results = await asyncio.gather(*[
            self.replay_snapshot(s, new_model, new_system_prompt) 
            for s in snapshots
        ])

        if rubric:
            from app.services.judge_service import judge_service
            from app.services.data_normalizer import DataNormalizer
            normalizer = DataNormalizer()
            
            for res in results:
                if res["success"]:
                    # 1. Extract texts
                    snapshot = next(s for s in snapshots if s.id == res["snapshot_id"])
                    
                    # We need the original response text. 
                    # For MVP, we extract it from the snapshot metadata or associated APICall.
                    # Since Snapshot doesn't store response_text directly, we normalize the replayed response.
                    replayed_text = normalizer._extract_response_text(res["response_data"])
                    
                    # Original text extraction (from associated APICall)
                    from app.core.database import SessionLocal
                    with SessionLocal() as db:
                        from app.models.api_call import APICall
                        api_call = db.query(APICall).filter(APICall.chain_id == snapshot.trace_id).first()
                        original_text = api_call.response_text if api_call else "Original not found"

                    # 2. Judge
                    if original_text and replayed_text:
                        evaluation = await judge_service.evaluate_response(
                            original_output=original_text,
                            replayed_output=replayed_text,
                            rubric=rubric
                        )
                        res["evaluation"] = evaluation

        return results

# Global instance
replay_service = ReplayService()
