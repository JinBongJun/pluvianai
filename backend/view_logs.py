
import json
import os
import sys

log_file = 'logs/errors.log'

def read_errors():
    if not os.path.exists(log_file):
        print("Log file not found.")
        return

    with open(log_file, 'r') as f:
        lines = f.readlines()
        
    print(f"Total error lines: {len(lines)}")
    print("=" * 60)
    
    # Show last 5 unique errors
    seen_messages = set()
    output_count = 0
    
    for line in reversed(lines):
        try:
            data = json.loads(line)
            msg = data.get('message')
            ts = data.get('timestamp')
            
            # Simple deduplication by message for current session
            if msg in seen_messages:
                continue
            seen_messages.add(msg)
            
            print(f"\n[{ts}] {msg}")
            print(f"Location: {data.get('module')}:{data.get('funcName')}:{data.get('line')}")
            
            exc = data.get('exc_info')
            if exc:
                print("-" * 30)
                print("TRACEBACK:")
                print(exc)
            else:
                print("(No traceback in log entry)")
            
            print("=" * 60)
            output_count += 1
            if output_count >= 5:
                break
        except Exception as e:
            # print(f"Error parsing line: {e}")
            pass

if __name__ == "__main__":
    read_errors()
