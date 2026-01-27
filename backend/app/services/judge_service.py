import json
import httpx
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging_config import logger
from app.models.evaluation_rubric import EvaluationRubric

class JudgeService:
    """Service that acts as an LLM-as-a-Judge to evaluate AI outputs"""

    def __init__(self):
        # We prefer using GPT-4o or Clause 3.5 Sonnet as the defaults for judging
        self.provider = "openai"
        self.model = "gpt-4o-mini" # Faster/cheaper for judging
        self.api_url = "https://api.openai.com/v1/chat/completions"

    async def evaluate_response(
        self, 
        original_output: str, 
        replayed_output: str, 
        rubric: EvaluationRubric,
        judge_model: str = "gpt-4o-mini",
        user_api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send both outputs to the Judge LLM and get a structured evaluation.
        Uses XML tagging for input isolation and Zero-Log API Key policy.
        
        Implements Sandboxed Judge Prompt pattern:
        - <system>: System instructions (isolated from user input)
        - <user_input>: User data (isolated to prevent Prompt Injection)
        - <instruction>: Evaluation instructions
        """
        # Sandboxed Judge Prompt with XML tagging for input isolation
        # System prompt is isolated from user input to prevent Prompt Injection
        system_prompt = f"""<system>
You are an expert AI Response Evaluator. Your task is to compare an ORIGINAL response and a REPLAYED response from an AI agent.

Evaluation Rubric: {rubric.name}
Criteria: {rubric.criteria_prompt}

You must output your evaluation in strictly valid JSON format with the following keys:
- "original_score": (float from {rubric.min_score} to {rubric.max_score})
- "replayed_score": (float from {rubric.min_score} to {rubric.max_score})
- "reasoning": (string) Explaining the difference and the score.
- "regression_detected": (boolean) True if replayed_score < original_score.
</system>"""

        # Isolate user input in XML tags to prevent Prompt Injection
        # User data is completely separated from system instructions
        sanitized_original = self._sanitize_for_judge(original_output)
        sanitized_replayed = self._sanitize_for_judge(replayed_output)
        
        user_content = f"""<user_input>
<original_response>
{sanitized_original}
</original_response>

<replayed_response>
{sanitized_replayed}
</replayed_response>
</user_input>

<instruction>
Evaluate the responses in user_input according to the criteria specified in the system prompt.
Compare the original_response and replayed_response, and provide scores and reasoning.
</instruction>"""

        payload = {
            "model": judge_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "response_format": {"type": "json_object"}
        }

        # Zero-Log API Key policy: Don't log API keys
        # Use user API key if provided, otherwise use default
        api_key = user_api_key or settings.OPENAI_API_KEY
        if not api_key:
            raise ValueError("No API key available. Set OPENAI_API_KEY or provide user_api_key.")
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Note: API key is never logged (Zero-Log policy)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(self.api_url, headers=headers, json=payload)
                if response.status_code == 200:
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]
                    return json.loads(content)
                else:
                    # Don't log API key in error messages (Zero-Log policy)
                    error_text = response.text.replace(api_key, "[REDACTED]") if api_key in response.text else response.text
                    logger.error(f"Judge API failed: {error_text}")
                    return {"error": "Judge evaluation failed"}
        except Exception as e:
            # Don't log API key in exception messages (Zero-Log policy)
            error_msg = str(e).replace(api_key, "[REDACTED]") if api_key in str(e) else str(e)
            logger.error(f"Judge Service Error: {error_msg}")
            return {"error": "Judge evaluation failed"}

    def _sanitize_for_judge(self, text: str) -> str:
        """
        Sanitize text for Judge input to prevent Prompt Injection
        Escapes XML-like tags that could break the XML structure
        
        This ensures user input cannot escape the <user_input> tag and contaminate
        the system prompt, preventing Prompt Injection attacks.
        """
        if not text:
            return ""
        
        # Escape potential XML injection attempts
        # Replace < and > that aren't part of our XML structure
        # This prevents users from injecting XML tags that could break our structure
        sanitized = text.replace("<", "&lt;").replace(">", "&gt;")
        
        # Additional safety: escape any remaining XML-like patterns
        # This is a defense-in-depth approach
        import re
        # Escape any remaining potential XML tags (defense in depth)
        sanitized = re.sub(r'&lt;([^&]+)&gt;', r'&lt;\1&gt;', sanitized)
        
        return sanitized

# Global instance
judge_service = JudgeService()
