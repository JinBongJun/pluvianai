"""
Script to upgrade user subscription via admin endpoint
Usage: python backend/scripts/upgrade_subscription.py
"""
import requests
import sys
import os

# Add parent directory to path to import config
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Try to get API URL from environment or use default Railway pattern
API_URL = os.getenv("RAILWAY_API_URL") or os.getenv("PLUVIANAI_API_URL") or "https://api.pluvianai.com"

def upgrade_subscription(email: str, plan_type: str = "pro"):
    """Upgrade user subscription"""
    url = f"{API_URL}/api/v1/admin/upgrade-user-subscription"
    params = {
        "email": email,
        "plan_type": plan_type
    }
    
    print(f"[*] Upgrading subscription for {email} to {plan_type}...")
    print(f"[*] API URL: {url}")
    
    try:
        response = requests.post(url, params=params, timeout=10)
        response.raise_for_status()
        
        result = response.json()
        print("[+] Success!")
        print(f"   User: {result.get('user_email')}")
        print(f"   Plan: {result.get('plan_type')}")
        print(f"   Status: {result.get('status')}")
        print(f"   Price: ${result.get('price_per_month')}/month")
        return result
    except requests.exceptions.RequestException as e:
        print(f"[-] Error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"   Status: {e.response.status_code}")
            print(f"   Response: {e.response.text}")
        sys.exit(1)

if __name__ == "__main__":
    email = "bongjun0289@daum.net"
    plan_type = "pro"
    
    # Allow override via command line args
    if len(sys.argv) > 1:
        email = sys.argv[1]
    if len(sys.argv) > 2:
        plan_type = sys.argv[2]
    
    upgrade_subscription(email, plan_type)
