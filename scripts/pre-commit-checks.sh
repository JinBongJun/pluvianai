#!/bin/bash
# Pre-commit checks script
# This script runs before each commit to catch syntax errors early

set -e

echo "🔍 Running pre-commit checks..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Function to check Python syntax
check_python_syntax() {
    echo -e "${YELLOW}Checking Python syntax...${NC}"
    
    # Find all Python files in backend
    find backend -name "*.py" -type f | while read file; do
        if ! python -m py_compile "$file" 2>/dev/null; then
            echo -e "${RED}❌ Syntax error in: $file${NC}"
            ERRORS=$((ERRORS + 1))
        fi
    done
}

# Function to check TypeScript syntax
check_typescript_syntax() {
    echo -e "${YELLOW}Checking TypeScript syntax...${NC}"
    
    if [ -d "frontend" ] && command -v npx &> /dev/null; then
        cd frontend
        if [ -f "package.json" ]; then
            # Run TypeScript compiler in check mode (no emit)
            if ! npx tsc --noEmit --skipLibCheck 2>/dev/null; then
                echo -e "${RED}❌ TypeScript compilation errors found${NC}"
                ERRORS=$((ERRORS + 1))
            fi
        fi
        cd ..
    fi
}

# Run checks
check_python_syntax
check_typescript_syntax

# Final result
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All syntax checks passed!${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS error(s). Please fix before committing.${NC}"
    exit 1
fi
