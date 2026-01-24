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
        judge_model: str = "gpt-4o-mini"
    ) -> Dict[str, Any]:
        """
        Send both outputs to the Judge LLM and get a structured evaluation.
        """
        system_prompt = f"""
        You are an expert AI Response Evaluator. Your task is to compare an ORIGINAL response and a REPLAYED response from an AI agent.
        
        Evaluation Rubric: {rubric.name}
        Criteria: {rubric.criteria_prompt}
        
        You must output your evaluation in strictly valid JSON format with the following keys:
        - "original_score": (int from {rubric.min_score} to {rubric.max_score})
        - "replayed_score": (int from {rubric.min_score} to {rubric.max_score})
        - "reasoning": (string) Explaining the difference and the score.
        - "regression_detected": (boolean) True if replayed_score < original_score.
        """

        user_content = f"""
        [ORIGINAL RESPONSE]
        {original_output}

        [REPLAYED RESPONSE]
        {replayed_output}
        """

        payload = {
            "model": judge_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "response_format": {"type": "json_object"}
        }

        headers = {
            "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(self.api_url, headers=headers, json=payload)
                if response.status_code == 200:
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]
                    return json.loads(content)
                else:
                    logger.error(f"Judge API failed: {response.text}")
                    return {"error": "Judge evaluation failed"}
        except Exception as e:
            logger.error(f"Judge Service Error: {str(e)}")
            return {"error": str(e)}

# Global instance
judge_service = JudgeService()
