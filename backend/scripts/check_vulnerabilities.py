#!/usr/bin/env python3
"""
Dependency vulnerability checker script
Checks Python dependencies for known security vulnerabilities
"""

import sys
import subprocess
import json
from pathlib import Path

# Get backend directory
BACKEND_DIR = Path(__file__).parent.parent
REQUIREMENTS_FILE = BACKEND_DIR / "requirements.txt"


def check_with_pip_audit():
    """
    Check vulnerabilities using pip-audit
    Returns: (has_vulnerabilities: bool, output: str)
    """
    try:
        result = subprocess.run(
            ["pip-audit", "--requirement", str(REQUIREMENTS_FILE), "--format", "json"],
            capture_output=True,
            text=True,
            cwd=str(BACKEND_DIR)
        )
        
        if result.returncode != 0:
            # Try without json format (older versions)
            result = subprocess.run(
                ["pip-audit", "--requirement", str(REQUIREMENTS_FILE)],
                capture_output=True,
                text=True,
                cwd=str(BACKEND_DIR)
            )
            return result.returncode != 0, result.stdout + result.stderr
        
        # Parse JSON output
        try:
            data = json.loads(result.stdout)
            vulnerabilities = data.get("vulnerabilities", [])
            has_vulns = len(vulnerabilities) > 0
            
            if has_vulns:
                output = f"Found {len(vulnerabilities)} vulnerabilities:\n"
                for vuln in vulnerabilities:
                    output += f"  - {vuln.get('name', 'Unknown')}: {vuln.get('id', 'Unknown')}\n"
            else:
                output = "No vulnerabilities found.\n"
            
            return has_vulns, output
        except json.JSONDecodeError:
            # Fallback to text output
            return result.returncode != 0, result.stdout + result.stderr
            
    except FileNotFoundError:
        return None, "pip-audit not installed. Install with: pip install pip-audit"


def check_with_safety():
    """
    Check vulnerabilities using safety
    Returns: (has_vulnerabilities: bool, output: str)
    """
    try:
        result = subprocess.run(
            ["safety", "check", "--file", str(REQUIREMENTS_FILE), "--json"],
            capture_output=True,
            text=True,
            cwd=str(BACKEND_DIR)
        )
        
        if result.returncode != 0:
            # Try without json format
            result = subprocess.run(
                ["safety", "check", "--file", str(REQUIREMENTS_FILE)],
                capture_output=True,
                text=True,
                cwd=str(BACKEND_DIR)
            )
            return result.returncode != 0, result.stdout + result.stderr
        
        # Parse JSON output
        try:
            data = json.loads(result.stdout)
            vulnerabilities = data if isinstance(data, list) else data.get("vulnerabilities", [])
            has_vulns = len(vulnerabilities) > 0
            
            if has_vulns:
                output = f"Found {len(vulnerabilities)} vulnerabilities:\n"
                for vuln in vulnerabilities:
                    pkg = vuln.get("package", "Unknown")
                    vuln_id = vuln.get("vulnerability", "Unknown")
                    output += f"  - {pkg}: {vuln_id}\n"
            else:
                output = "No vulnerabilities found.\n"
            
            return has_vulns, output
        except (json.JSONDecodeError, TypeError):
            # Fallback to text output
            return result.returncode != 0, result.stdout + result.stderr
            
    except FileNotFoundError:
        return None, "safety not installed. Install with: pip install safety"


def main():
    """Main function"""
    print("🔍 Checking Python dependencies for vulnerabilities...")
    print(f"Requirements file: {REQUIREMENTS_FILE}")
    print()
    
    # Try pip-audit first (preferred)
    has_vulns, output = check_with_pip_audit()
    
    if has_vulns is None:
        # pip-audit not available, try safety
        print("⚠️  pip-audit not found, trying safety...")
        has_vulns, output = check_with_safety()
    
    if has_vulns is None:
        print("❌ Neither pip-audit nor safety is installed.")
        print("Install one of them:")
        print("  pip install pip-audit")
        print("  or")
        print("  pip install safety")
        sys.exit(1)
    
    print(output)
    
    if has_vulns:
        print("\n❌ Vulnerabilities found! Please update affected packages.")
        sys.exit(1)
    else:
        print("\n✅ No vulnerabilities found.")
        sys.exit(0)


if __name__ == "__main__":
    main()
