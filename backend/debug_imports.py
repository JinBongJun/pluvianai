import sys
import traceback

try:
    from app.models.firewall_rule import FirewallRule
    print("Direct import of FirewallRule success")
except Exception:
    print("Direct import of FirewallRule failed:")
    traceback.print_exc()

try:
    import app.models
    print("Import of app.models success")
    print(f"FirewallRule in app.models: {hasattr(app.models, 'FirewallRule')}")
except Exception:
    print("Import of app.models failed:")
    traceback.print_exc()
