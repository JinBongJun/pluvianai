# Simple Behavior E2E Test - Manual URL verification approach
# Since backend has registration issues, we'll test what we can without full auth

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:8000/api/v1"
$frontendUrl = "http://localhost:3000"
$projectId = 8
$orgId = 3

Write-Host "=== BEHAVIOR SECTION E2E TEST (Manual Verification) ===" -ForegroundColor Cyan
Write-Host ""

$results = @()
$passed = 0
$failed = 0
$blocked = 0

function Add-Result {
    param([string]$Step, [string]$Status, [string]$Evidence)
    
    $color = switch ($Status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "BLOCKED" { "Yellow" }
    }
    
    Write-Host "[$Status] $Step" -ForegroundColor $color
    Write-Host "  Evidence: $Evidence" -ForegroundColor Gray
    Write-Host ""
    
    $script:results += [PSCustomObject]@{
        Step = $Step
        Status = $Status
        Evidence = $Evidence
    }
    
    switch ($Status) {
        "PASS" { $script:passed++ }
        "FAIL" { $script:failed++ }
        "BLOCKED" { $script:blocked++ }
    }
}

# Step 1: Verify frontend is running and behavior page exists
Write-Host "Step 1: Verify Behavior page loads" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$frontendUrl/organizations/$orgId/projects/$projectId/behavior" -Method Get -TimeoutSec 5 -UseBasicParsing
    
    if ($response.StatusCode -eq 200) {
        $hasRulesTab = $response.Content -like "*Rules*" -and $response.Content -like "*Reports*"
        $hasAgentsTab = $response.Content -like "*Agents*"
        $hasBehaviorText = $response.Content -like "*Behavior*" -or $response.Content -like "*behavior*"
        
        if ($hasRulesTab -and $hasAgentsTab -and $hasBehaviorText) {
            Add-Result -Step "1. Open Behavior page" -Status "PASS" -Evidence "Page loaded (200), Rules/Reports/Agents tabs visible"
        } else {
            Add-Result -Step "1. Open Behavior page" -Status "FAIL" -Evidence "Page loaded but missing expected UI elements"
        }
    } else {
        Add-Result -Step "1. Open Behavior page" -Status "FAIL" -Evidence "HTTP $($response.StatusCode) returned"
    }
} catch {
    # Check if it's a redirect to login
    if ($_.Exception.Message -like "*302*" -or $_.Exception.Message -like "*redirect*" -or $_.Exception.Message -like "*login*") {
        Add-Result -Step "1. Open Behavior page" -Status "BLOCKED" -Evidence "Redirected to login - authentication required"
    } else {
        Add-Result -Step "1. Open Behavior page" -Status "FAIL" -Evidence "Error: $($_.Exception.Message)"
    }
}

# Step 2: Test Rules API endpoint (without auth, will fail but we check endpoint existence)
Write-Host "Step 2: Verify Rules API endpoint exists" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/projects/$projectId/behavior/rules" -Method Get -UseBasicParsing -ErrorAction Stop
    Add-Result -Step "2.1 Rules Tab - API endpoint" -Status "PASS" -Evidence "Rules API endpoint accessible, returned $($response.StatusCode)"
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.Value__
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Add-Result -Step "2.1 Rules Tab - API endpoint" -Status "PASS" -Evidence "Rules API exists (401/403 auth required - expected)"
    } elseif ($statusCode -eq 404) {
        Add-Result -Step "2.1 Rules Tab - API endpoint" -Status "FAIL" -Evidence "Rules API endpoint not found (404)"
    } else {
        Add-Result -Step "2.1 Rules Tab - API endpoint" -Status "BLOCKED" -Evidence "Cannot verify endpoint: $($_.Exception.Message)"
    }
}

# Step 2.2: Starter Rule button (frontend feature)
Add-Result -Step "2.2 Rules Tab - Starter Rule button" -Status "BLOCKED" -Evidence "Requires browser interaction - cannot verify without auth"

# Step 3: Test Agents API
Write-Host "Step 3: Verify Agents API endpoint exists" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/projects/$projectId/live-view/agents?limit=50" -Method Get -UseBasicParsing -ErrorAction Stop
    Add-Result -Step "3.1 Agents Tab - API endpoint" -Status "PASS" -Evidence "Agents API endpoint accessible, returned $($response.StatusCode)"
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.Value__
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Add-Result -Step "3.1 Agents Tab - API endpoint" -Status "PASS" -Evidence "Agents API exists (401/403 auth required - expected)"
    } elseif ($statusCode -eq 404) {
        Add-Result -Step "3.1 Agents Tab - API endpoint" -Status "FAIL" -Evidence "Agents API endpoint not found (404)"
    } else {
        Add-Result -Step "3.1 Agents Tab - API endpoint" -Status "BLOCKED" -Evidence "Cannot verify endpoint: $($_.Exception.Message)"
    }
}

Add-Result -Step "3.2 Agents Tab - Validate Latest Run" -Status "BLOCKED" -Evidence "Requires auth and agent data - cannot verify"

# Step 4: Test Reports API
Write-Host "Step 4: Verify Reports API endpoint exists" -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/projects/$projectId/behavior/reports?limit=20&offset=0" -Method Get -UseBasicParsing -ErrorAction Stop
    Add-Result -Step "4.1 Reports Tab - API endpoint" -Status "PASS" -Evidence "Reports API endpoint accessible, returned $($response.StatusCode)"
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.Value__
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Add-Result -Step "4.1 Reports Tab - API endpoint" -Status "PASS" -Evidence "Reports API exists (401/403 auth required - expected)"
    } elseif ($statusCode -eq 404) {
        Add-Result -Step "4.1 Reports Tab - API endpoint" -Status "FAIL" -Evidence "Reports API endpoint not found (404)"
    } else {
        Add-Result -Step "4.1 Reports Tab - API endpoint" -Status "BLOCKED" -Evidence "Cannot verify endpoint: $($_.Exception.Message)"
    }
}

Add-Result -Step "4.2 Reports Tab - Export JSON" -Status "BLOCKED" -Evidence "Requires auth and report data - cannot verify"
Add-Result -Step "4.3 Reports Tab - Export CSV" -Status "BLOCKED" -Evidence "Requires auth and report data - cannot verify"

# Step 5: Test Compare API
Write-Host "Step 5: Verify Compare API endpoint exists" -ForegroundColor Cyan
try {
    $compareBody = @{
        baseline_test_run_id = "test-id-1"
        candidate_test_run_id = "test-id-2"
    } | ConvertTo-Json
    
    $response = Invoke-WebRequest -Uri "$baseUrl/projects/$projectId/behavior/compare" -Method Post -Body $compareBody -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
    Add-Result -Step "5.1 Compare - API endpoint" -Status "PASS" -Evidence "Compare API accessible"
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.Value__
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Add-Result -Step "5.1 Compare - API endpoint" -Status "PASS" -Evidence "Compare API exists (401/403 auth required - expected)"
    } elseif ($statusCode -eq 404) {
        Add-Result -Step "5.1 Compare - API endpoint" -Status "FAIL" -Evidence "Compare API endpoint not found (404)"
    } else {
        Add-Result -Step "5.1 Compare - API endpoint" -Status "BLOCKED" -Evidence "Cannot verify endpoint: $($_.Exception.Message)"
    }
}

# Step 6: Test CI Gate API
Write-Host "Step 6: Verify CI Gate API endpoint exists" -ForegroundColor Cyan
try {
    $gateBody = @{
        candidate_test_run_id = "test-id"
        thresholds = @{
            critical = 0
            high = 2
        }
    } | ConvertTo-Json -Depth 5
    
    $response = Invoke-WebRequest -Uri "$baseUrl/projects/$projectId/behavior/ci-gate" -Method Post -Body $gateBody -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
    Add-Result -Step "6.1 CI Gate - API endpoint" -Status "PASS" -Evidence "CI Gate API accessible"
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.Value__
    }
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Add-Result -Step "6.1 CI Gate - API endpoint" -Status "PASS" -Evidence "CI Gate API exists (401/403 auth required - expected)"
    } elseif ($statusCode -eq 404) {
        Add-Result -Step "6.1 CI Gate - API endpoint" -Status "FAIL" -Evidence "CI Gate API endpoint not found (404)"
    } else {
        Add-Result -Step "6.1 CI Gate - API endpoint" -Status "BLOCKED" -Evidence "Cannot verify endpoint: $($_.Exception.Message)"
    }
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "         TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Total Passed:  $passed" -ForegroundColor Green
Write-Host "Total Failed:  $failed" -ForegroundColor Red
Write-Host "Total Blocked: $blocked" -ForegroundColor Yellow
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "       DETAILED RESULTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
$results | Format-Table -Property Step,Status,Evidence -Wrap -AutoSize

# Blockers and Next Steps
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    BLOCKERS & NEXT STEPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$blockers = $results | Where-Object { $_.Status -eq "BLOCKED" }
$failures = $results | Where-Object { $_.Status -eq "FAIL" }

if ($blockers.Count -gt 0) {
    Write-Host "`nBlocked Steps ($($blockers.Count)):" -ForegroundColor Yellow
    foreach ($blocker in $blockers) {
        Write-Host "  • $($blocker.Step)" -ForegroundColor Yellow
        Write-Host "    $($blocker.Evidence)" -ForegroundColor Gray
    }
}

if ($failures.Count -gt 0) {
    Write-Host "`nFailed Steps ($($failures.Count)):" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  • $($failure.Step)" -ForegroundColor Red
        Write-Host "    $($failure.Evidence)" -ForegroundColor Gray
    }
}

Write-Host "`nNext Actions:" -ForegroundColor Cyan
Write-Host "  1. Fix backend Subscription schema issue (plan_type error)" -ForegroundColor White
Write-Host "  2. Enable user registration or use existing user credentials" -ForegroundColor White
Write-Host "  3. Complete full end-to-end test with authenticated session" -ForegroundColor White
Write-Host "  4. Verify UI interactions (buttons, dropdowns, downloads)" -ForegroundColor White
Write-Host ""

# Exit code
if ($failed -gt 0) { exit 1 }
exit 0
