
import os
import sys

# Add local SDK path for testing without installation
sys.path.append(os.path.join(os.getcwd(), 'sdk', 'python'))

import agentguard

def verify_sdk():
    print("AgentGuard SDK Verification Tool")
    print("--------------------------------")
    
    # 1. Get configuration from user
    api_key = input("Enter your AgentGuard API Key (from Dashboard > Settings > API Keys): ").strip()
    if not api_key:
        print("API Key is required!")
        return

    project_id = input("Enter your Project ID (from URL /organizations/.../projects/[ID]): ").strip()
    if not project_id:
        print("Project ID is required!")
        return

    api_url = input("Enter AgentGuard API URL (default: http://localhost:8000): ").strip()
    if not api_url:
        api_url = "http://localhost:8000"

    print(f"\nInitializing AgentGuard with Project ID: {project_id}...")
    
    # 2. Initialize SDK
    try:
        agentguard.init(
            api_key=api_key,
            project_id=int(project_id),
            api_url=api_url
        )
    except Exception as e:
        print(f"Initialization failed: {e}")
        return

    print("Sending a test log entry (Self-Verification)...")

    # 3. Manually track a fake call
    try:
        agentguard.track_call(
            request_data={
                "model": "gpt-4-test",
                "messages": [{"role": "user", "content": "Hello AgentGuard!"}]
            },
            response_data={
                "choices": [{"message": {"content": "Hello! I confirm the SDK is working."}}],
                "usage": {"total_tokens": 50}
            },
            latency_ms=123.45,
            status_code=200,
            agent_name="verification-script"
        )
        print("\n✅ Success! Data sent.")
        print("Go to your Dashboard > Project > API Calls.")
        print("You should see a new entry with model 'gpt-4-test' immediately.")
        
    except Exception as e:
        print(f"\n❌ Failed to send data: {e}")

if __name__ == "__main__":
    verify_sdk()
