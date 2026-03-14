# MANUAL BROWSER VERIFICATION GUIDE
# Behavior Section E2E Test - Live Browser Steps
# URL: http://localhost:3000/organizations/3/projects/8/behavior

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  BEHAVIOR FEATURE - LIVE BROWSER VERIFICATION GUIDE" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "BROWSER AUTOMATION NOT AVAILABLE - MANUAL TESTING REQUIRED" -ForegroundColor Yellow
Write-Host ""
Write-Host "Since browser automation tools (Playwright/Puppeteer) are not" -ForegroundColor Yellow
Write-Host "configured in this environment, please execute the following" -ForegroundColor Yellow
Write-Host "steps MANUALLY in your browser and record the results." -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "STEP 1: NAVIGATE TO BEHAVIOR PAGE" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Action: Open browser and navigate to:" -ForegroundColor White
Write-Host "  http://localhost:3000/organizations/3/projects/8/behavior" -ForegroundColor Green
Write-Host ""
Write-Host "Expected:" -ForegroundColor White
Write-Host "  - Page loads without crash" -ForegroundColor Gray
Write-Host "  - Three tabs visible: Rules, Reports, Agents" -ForegroundColor Gray
Write-Host "  - Header shows 'Agent Behavior Validation'" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "STEP 2: AUTHENTICATION (IF REDIRECTED)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "If redirected to /login:" -ForegroundColor White
Write-Host ""
Write-Host "Option A - Try existing session:" -ForegroundColor White
Write-Host "  - Check if already logged in (look for user menu)" -ForegroundColor Gray
Write-Host ""
Write-Host "Option B - Login with existing account:" -ForegroundColor White
Write-Host "  - Use: bongjun0289@gmail.com (or bongjun0289@daum.net)" -ForegroundColor Gray
Write-Host "  - Password: [Ask developer]" -ForegroundColor Gray
Write-Host ""
Write-Host "Option C - Register new account:" -ForegroundColor White
Write-Host "  Email:    e2e_browser@local.dev" -ForegroundColor Green
Write-Host "  Password: Test1234!" -ForegroundColor Green
Write-Host "  Name:     E2E Browser Test" -ForegroundColor Green
Write-Host "  ✓ Accept liability agreement checkbox (if present)" -ForegroundColor Green
Write-Host ""
Write-Host "  ⚠️  NOTE: Backend has a bug with registration (Subscription schema)" -ForegroundColor Red
Write-Host "  If registration fails with 500 error, use existing account" -ForegroundColor Red
Write-Host ""
Write-Host "Verify: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "STEP 3: RULES TAB - CREATE STARTER RULE" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Action:" -ForegroundColor White
Write-Host "  1. Click 'Rules' tab (should be active by default)" -ForegroundColor Gray
Write-Host "  2. Count existing rule cards (if any)" -ForegroundColor Gray
Write-Host "  3. Click 'Starter Rule' button (green button, top right)" -ForegroundColor Gray
Write-Host "  4. Wait 2-3 seconds for API response" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected:" -ForegroundColor White
Write-Host "  - Button shows 'Creating...' briefly" -ForegroundColor Gray
Write-Host "  - New rule card appears with name 'No shell exec in prod'" -ForegroundColor Gray
Write-Host "  - Rule card shows: tool_forbidden · scope: project · enabled" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "STEP 4: AGENTS TAB - VALIDATE LATEST RUN" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Action:" -ForegroundColor White
Write-Host "  1. Click 'Agents' tab" -ForegroundColor Gray
Write-Host "  2. Check for agent list or empty state message" -ForegroundColor Gray
Write-Host ""
Write-Host "If agents exist:" -ForegroundColor White
Write-Host "  3. Click on first agent card (should highlight green)" -ForegroundColor Gray
Write-Host "  4. Look at right panel for selected agent details" -ForegroundColor Gray
Write-Host "  5. Click 'Validate Latest Run' button (blue button)" -ForegroundColor Gray
Write-Host "  6. Wait 2-3 seconds for API response" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected:" -ForegroundColor White
Write-Host "  - Status text changes from default to one of:" -ForegroundColor Gray
Write-Host "    'Run validation PASS · violations: N'" -ForegroundColor Gray
Write-Host "    'Run validation FAIL · violations: N'" -ForegroundColor Gray
Write-Host "    'No test run result found for this agent yet.'" -ForegroundColor Gray
Write-Host ""
Write-Host "If no agents:" -ForegroundColor White
Write-Host "  - Message: 'No agents found. Ingest snapshots first...'" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "STEP 5: REPORTS TAB - EXPORT FUNCTIONALITY" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Action:" -ForegroundColor White
Write-Host "  1. Click 'Reports' tab" -ForegroundColor Gray
Write-Host "  2. Check for report cards or empty state message" -ForegroundColor Gray
Write-Host ""
Write-Host "If reports exist:" -ForegroundColor White
Write-Host "  3. Find first report card" -ForegroundColor Gray
Write-Host "  4. Click 'Export JSON' button" -ForegroundColor Gray
Write-Host "  5. Check browser downloads or button state" -ForegroundColor Gray
Write-Host "  6. Wait 1 second" -ForegroundColor Gray
Write-Host "  7. Click 'Export CSV' button on same report" -ForegroundColor Gray
Write-Host "  8. Check browser downloads or button state" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected:" -ForegroundColor White
Write-Host "  - Button shows 'Exporting...' briefly" -ForegroundColor Gray
Write-Host "  - Browser download prompt appears OR file auto-downloads" -ForegroundColor Gray
Write-Host "  - Files: behavior_report_[ID].json and behavior_report_[ID].csv" -ForegroundColor Gray
Write-Host ""
Write-Host "If no reports:" -ForegroundColor White
Write-Host "  - Message: 'No reports for this filter yet...'" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify Export JSON: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""
Write-Host "Verify Export CSV: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "STEP 6: COMPARE & CI GATE - RIGHT PANEL" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "6A. COMPARE RUNS:" -ForegroundColor White
Write-Host "Action:" -ForegroundColor White
Write-Host "  1. Stay on Reports tab" -ForegroundColor Gray
Write-Host "  2. Look at right panel - 'Run vs Run' section" -ForegroundColor Gray
Write-Host "  3. Check if 'Baseline run' dropdown has options" -ForegroundColor Gray
Write-Host "  4. Check if 'Candidate run' dropdown has options" -ForegroundColor Gray
Write-Host ""
Write-Host "If run IDs available:" -ForegroundColor White
Write-Host "  5. Select any baseline run ID" -ForegroundColor Gray
Write-Host "  6. Select any candidate run ID (different from baseline)" -ForegroundColor Gray
Write-Host "  7. Click 'Run Compare' button (green)" -ForegroundColor Gray
Write-Host "  8. Wait 2-3 seconds for result" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected:" -ForegroundColor White
Write-Host "  - Button shows 'Comparing...' briefly" -ForegroundColor Gray
Write-Host "  - Result panel appears with:" -ForegroundColor Gray
Write-Host "    'delta violations: N'" -ForegroundColor Gray
Write-Host "    'critical delta: N'" -ForegroundColor Gray
Write-Host "    'regressed: yes/no'" -ForegroundColor Gray
Write-Host "  OR error message in red text" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "6B. CI GATE:" -ForegroundColor White
Write-Host "Action:" -ForegroundColor White
Write-Host "  1. Look at 'Threshold Gate' section (below Compare)" -ForegroundColor Gray
Write-Host "  2. Check if 'Candidate run' dropdown has options" -ForegroundColor Gray
Write-Host ""
Write-Host "If run ID available:" -ForegroundColor White
Write-Host "  3. Select any candidate run ID" -ForegroundColor Gray
Write-Host "  4. Leave thresholds at default (critical: 0, high: 2)" -ForegroundColor Gray
Write-Host "  5. Click 'Run CI Gate' button (blue)" -ForegroundColor Gray
Write-Host "  6. Wait 2-3 seconds for result" -ForegroundColor Gray
Write-Host ""
Write-Host "Expected:" -ForegroundColor White
Write-Host "  - Button shows 'Running Gate...' briefly" -ForegroundColor Gray
Write-Host "  - Result panel appears with:" -ForegroundColor Gray
Write-Host "    'pass: true/false'" -ForegroundColor Gray
Write-Host "    'exit code: N'" -ForegroundColor Gray
Write-Host "  OR error message in red text" -ForegroundColor Gray
Write-Host ""
Write-Host "Verify: [PASS / FAIL / BLOCKED]" -ForegroundColor Yellow
Write-Host "Evidence: ____________________________________________________" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "RESULTS SUMMARY TEMPLATE" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Copy and fill in your results:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Navigate to Behavior page: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "2. Authentication: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "3. Rules - Create Starter Rule: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "4. Agents - Validate Latest Run: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "5a. Reports - Export JSON: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "5b. Reports - Export CSV: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "6a. Compare Runs: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "6b. CI Gate: [PASS/FAIL/BLOCKED]"
Write-Host "   Evidence: _______________________________________________"
Write-Host ""
Write-Host "FINAL VERDICT:"
Write-Host "Is Behavior functionally working end-to-end? [YES/NO/PARTIAL]"
Write-Host "Explanation: _______________________________________________"
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "KNOWN ISSUES TO WATCH FOR" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Registration may fail with 500 error (Subscription schema bug)" -ForegroundColor Red
Write-Host "2. If no agents exist, ingest snapshots first from Live View" -ForegroundColor Yellow
Write-Host "3. If no reports exist, run Test Lab with behavior validation" -ForegroundColor Yellow
Write-Host "4. Compare/CI Gate need at least 1-2 test runs with reports" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================================" -ForegroundColor Green
Write-Host "TEST PREPARATION COMPLETE - BEGIN MANUAL TESTING" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Opening browser to localhost:3000..." -ForegroundColor Cyan

# Try to open the browser
Start-Process "http://localhost:3000/organizations/3/projects/8/behavior"

Write-Host ""
Write-Host "✓ Browser opened" -ForegroundColor Green
Write-Host "✓ Follow the steps above and record your results" -ForegroundColor Green
Write-Host ""
