"""
Data compression utilities for optimizing storage
"""
import json
import gzip
import base64
from typing import Any, Dict, Optional


def compress_json(data: Dict[str, Any]) -> str:
    """
    Compress JSON data using gzip and base64 encoding
    Reduces storage by ~50-70% for large JSON objects
    """
    if not data:
        return ""
    
    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    compressed = gzip.compress(json_str.encode('utf-8'), compresslevel=6)
    return base64.b64encode(compressed).decode('utf-8')


def decompress_json(compressed_data: str) -> Optional[Dict[str, Any]]:
    """
    Decompress JSON data
    """
    if not compressed_data:
        return None
    
    try:
        compressed_bytes = base64.b64decode(compressed_data.encode('utf-8'))
        decompressed = gzip.decompress(compressed_bytes)
        return json.loads(decompressed.decode('utf-8'))
    except Exception:
        return None


def optimize_api_call_data(
    request_data: Dict[str, Any],
    response_data: Dict[str, Any],
    max_size: int = 50000  # 50KB limit
) -> Dict[str, Any]:
    """
    Optimize API call data by:
    1. Removing unnecessary fields
    2. Truncating large text fields
    3. Keeping only essential data
    """
    optimized = {
        "request": {},
        "response": {}
    }
    
    # Optimize request data
    if request_data:
        # Keep only essential fields
        essential_request_fields = ["model", "messages", "temperature", "max_tokens"]
        optimized["request"] = {
            k: v for k, v in request_data.items() 
            if k in essential_request_fields
        }
        
        # Truncate messages if too large
        if "messages" in optimized["request"]:
            messages = optimized["request"]["messages"]
            if isinstance(messages, list):
                # Keep only last 10 messages to save space
                optimized["request"]["messages"] = messages[-10:]
    
    # Optimize response data
    if response_data:
        # Keep only essential fields
        essential_response_fields = ["id", "model", "choices", "usage", "created"]
        optimized["response"] = {
            k: v for k, v in response_data.items() 
            if k in essential_response_fields
        }
        
        # Truncate choice content if too large
        if "choices" in optimized["response"]:
            choices = optimized["response"]["choices"]
            if isinstance(choices, list) and len(choices) > 0:
                for choice in choices:
                    if "message" in choice and "content" in choice["message"]:
                        content = choice["message"]["content"]
                        if len(content) > 10000:  # 10KB limit per choice
                            choice["message"]["content"] = content[:10000] + "...[truncated]"
    
    return optimized



