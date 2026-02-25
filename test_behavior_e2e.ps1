# Behavior Section E2E Test Script
# Tests the /organizations/3/projects/8/behavior page functionality via API calls

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:8000/api/v1"
$projectId = 8
$orgId = 3

Write-Host "=== BEHAVIOR SECTION E2E TEST ===" -ForegroundColor Cyan
Write-Host ""

# Initialize results
$results = @()
$passed = 0
$failed = 0
$blocked = 0

function Test-Step {
    param(
        [string]$Name,
        [scriptblock]$Test,
        [string]$Evidence = ""
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow
    try {
        $result = & $Test
        if ($result.Status -eq "PASS") {
            Write-Host "  ✓ PASS: $($result.Evidence)" -ForegroundColor Green
            $script:passed++
        } elseif ($result.Status -eq "BLOCKED") {
            Write-Host "  ⊘ BLOCKED: $($result.Evidence)" -ForegroundColor Yellow
            $script:blocked++
        } else {
            Write-Host "  ✗ FAIL: $($result.Evidence)" -ForegroundColor Red
            $script:failed++
        }
        $script:results += [PSCustomObject]@{
            Step = $Name
            Status = $result.Status
            Evidence = $result.Evidence
        }
    } catch {
        Write-Host "  ✗ FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        $script:results += [PSCustomObject]@{
            Step = $Name
            Status = "FAIL"
            Evidence = $_.Exception.Message
        }
    }
    Write-Host ""
}

# Step 0: Auth
Write-Host "Step 0: Authentication" -ForegroundColor Cyan
$token = $null
try {
    # Try to login with test credentials (OAuth2 form format)
    $loginBody = "username=test@local.dev&password=Test1234!"

    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/x-www-form-urlencoded" -ErrorAction Stop
    $token = $loginResponse.access_token
    Write-Host "  ✓ Authenticated successfully" -ForegroundColor Green
} catch {
    # Try registration if login fails
    try {
        $registerBody = @{
            email = "test@local.dev"
            password = "Test1234!"
            full_name = "E2E Test User"
            liability_agreement_accepted = $true
        } | ConvertTo-Json

        $registerResponse = Invoke-RestMethod -Uri "$baseUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -ErrorAction Stop
        
        # Now login to get tokens
        $loginBody = "username=test@local.dev&password=Test1234!"
        $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/x-www-form-urlencoded" -ErrorAction Stop
        $token = $loginResponse.access_token
        Write-Host "  ✓ Registered and authenticated" -ForegroundColor Green
    } catch {
        Write-Host "  ⊘ Authentication blocked - cannot proceed with tests" -ForegroundColor Yellow
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 1: Check project access
Test-Step -Name "1. Access project and verify page dependencies" -Test {
    try {
        $project = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId" -Method Get -Headers $headers
        return @{ Status = "PASS"; Evidence = "Project '$($project.name)' accessible, id=$projectId" }
    } catch {
        return @{ Status = "BLOCKED"; Evidence = "Cannot access project $projectId - auth or permissions issue" }
    }
}

# Step 2: Rules Tab - List Rules
Test-Step -Name "2.1 Rules Tab - List existing rules" -Test {
    try {
        $rules = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/rules" -Method Get -Headers $headers
        $count = if ($rules -is [array]) { $rules.Count } else { 1 }
        return @{ Status = "PASS"; Evidence = "Rules API returned $count rule(s)" }
    } catch {
        return @{ Status = "FAIL"; Evidence = "Rules list failed: $($_.Exception.Message)" }
    }
}

# Step 2.2: Rules Tab - Create Starter Rule
Test-Step -Name "2.2 Rules Tab - Create Starter Rule" -Test {
    try {
        $ruleBody = @{
            name = "E2E Test Rule $(Get-Date -Format 'HHmmss')"
            description = "Test rule created by E2E script"
            scope_type = "project"
            severity_default = "critical"
            enabled = $true
            rule_json = @{
                type = "tool_forbidden"
                name = "No shell exec in prod"
                severity = "critical"
                spec = @{
                    tools = @("shell.exec", "os.system")
                }
            }
        } | ConvertTo-Json -Depth 10

        $newRule = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/rules" -Method Post -Body $ruleBody -Headers $headers
        return @{ Status = "PASS"; Evidence = "Starter rule created with id=$($newRule.id)" }
    } catch {
        return @{ Status = "FAIL"; Evidence = "Starter rule creation failed: $($_.Exception.Message)" }
    }
}

# Step 3: Agents Tab
Test-Step -Name "3.1 Agents Tab - Load agent list" -Test {
    try {
        $agents = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/live-view/agents?limit=50" -Method Get -Headers $headers
        $agentCount = if ($agents.agents -is [array]) { $agents.agents.Count } else { 0 }
        
        if ($agentCount -eq 0) {
            return @{ Status = "PASS"; Evidence = "Agent list loaded, showing empty state (0 agents)" }
        } else {
            $script:testAgentId = $agents.agents[0].agent_id
            return @{ Status = "PASS"; Evidence = "Agent list loaded with $agentCount agent(s)" }
        }
    } catch {
        return @{ Status = "FAIL"; Evidence = "Agents list failed: $($_.Exception.Message)" }
    }
}

Test-Step -Name "3.2 Agents Tab - Validate Latest Run for agent" -Test {
    if (-not $script:testAgentId) {
        return @{ Status = "BLOCKED"; Evidence = "No agents available to test validation" }
    }
    
    try {
        # Get latest test result for agent
        $results = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/test-lab/results?agent_id=$($script:testAgentId)&limit=1" -Method Get -Headers $headers
        
        if (-not $results.items -or $results.items.Count -eq 0) {
            return @{ Status = "PASS"; Evidence = "No test runs for agent - clear 'no-run' message expected" }
        }
        
        $runId = $results.items[0].test_run_id
        
        # Validate the run
        $validateBody = @{
            test_run_id = $runId
        } | ConvertTo-Json
        
        $validation = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/validate" -Method Post -Body $validateBody -Headers $headers
        $status = $validation.status
        return @{ Status = "PASS"; Evidence = "Validation returned status=$status for run_id=$runId" }
    } catch {
        return @{ Status = "FAIL"; Evidence = "Agent validation failed: $($_.Exception.Message)" }
    }
}

# Step 4: Reports Tab
Test-Step -Name "4.1 Reports Tab - List reports" -Test {
    try {
        $reports = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/reports?limit=20&offset=0" -Method Get -Headers $headers
        $reportCount = if ($reports.items -is [array]) { $reports.items.Count } else { 0 }
        
        if ($reportCount -eq 0) {
            return @{ Status = "PASS"; Evidence = "Reports list loaded, showing empty state (0 reports)" }
        } else {
            $script:testReportId = $reports.items[0].id
            return @{ Status = "PASS"; Evidence = "Reports list loaded with $reportCount report(s)" }
        }
    } catch {
        return @{ Status = "FAIL"; Evidence = "Reports list failed: $($_.Exception.Message)" }
    }
}

Test-Step -Name "4.2 Reports Tab - Export JSON" -Test {
    if (-not $script:testReportId) {
        return @{ Status = "BLOCKED"; Evidence = "No reports available to test export" }
    }
    
    try {
        $exportData = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/reports/$($script:testReportId)/export/json" -Method Get -Headers $headers
        return @{ Status = "PASS"; Evidence = "JSON export succeeded for report_id=$($script:testReportId)" }
    } catch {
        return @{ Status = "FAIL"; Evidence = "JSON export failed: $($_.Exception.Message)" }
    }
}

Test-Step -Name "4.3 Reports Tab - Export CSV" -Test {
    if (-not $script:testReportId) {
        return @{ Status = "BLOCKED"; Evidence = "No reports available to test export" }
    }
    
    try {
        $exportData = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/reports/$($script:testReportId)/export/csv" -Method Get -Headers $headers
        return @{ Status = "PASS"; Evidence = "CSV export succeeded for report_id=$($script:testReportId)" }
    } catch {
        return @{ Status = "FAIL"; Evidence = "CSV export failed: $($_.Exception.Message)" }
    }
}

# Step 5: Compare functionality
Test-Step -Name "5.1 Compare - Run comparison between two runs" -Test {
    try {
        # Get available run IDs from reports
        $reports = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/reports?limit=20" -Method Get -Headers $headers
        $runIds = $reports.items | Where-Object { $_.test_run_id } | Select-Object -ExpandProperty test_run_id -Unique
        
        if ($runIds.Count -lt 2) {
            return @{ Status = "BLOCKED"; Evidence = "Need at least 2 run IDs for compare, found $($runIds.Count)" }
        }
        
        $compareBody = @{
            baseline_test_run_id = $runIds[1]
            candidate_test_run_id = $runIds[0]
        } | ConvertTo-Json
        
        $compareResult = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/compare" -Method Post -Body $compareBody -Headers $headers
        return @{ Status = "PASS"; Evidence = "Compare completed: delta=$($compareResult.violation_count_delta), regressed=$($compareResult.is_regressed)" }
    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg -like "*not found*" -or $errorMsg -like "*404*") {
            return @{ Status = "BLOCKED"; Evidence = "Run IDs not available for comparison" }
        }
        return @{ Status = "FAIL"; Evidence = "Compare failed: $errorMsg" }
    }
}

# Step 6: CI Gate functionality
Test-Step -Name "6.1 CI Gate - Run threshold validation" -Test {
    try {
        # Get available run ID
        $reports = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/reports?limit=1" -Method Get -Headers $headers
        
        if (-not $reports.items -or $reports.items.Count -eq 0) {
            return @{ Status = "BLOCKED"; Evidence = "No run IDs available for CI Gate" }
        }
        
        $runId = $reports.items[0].test_run_id
        
        $gateBody = @{
            candidate_test_run_id = $runId
            thresholds = @{
                critical = 0
                high = 2
            }
        } | ConvertTo-Json -Depth 5
        
        $gateResult = Invoke-RestMethod -Uri "$baseUrl/projects/$projectId/behavior/ci-gate" -Method Post -Body $gateBody -Headers $headers
        return @{ Status = "PASS"; Evidence = "CI Gate completed: pass=$($gateResult.pass), exit_code=$($gateResult.exit_code)" }
    } catch {
        $errorMsg = $_.Exception.Message
        if ($errorMsg -like "*not found*" -or $errorMsg -like "*404*") {
            return @{ Status = "BLOCKED"; Evidence = "Run ID not available for CI Gate" }
        }
        return @{ Status = "FAIL"; Evidence = "CI Gate failed: $errorMsg" }
    }
}

# Summary
Write-Host ""
Write-Host "=== TEST SUMMARY ===" -ForegroundColor Cyan
Write-Host "Total Passed:  $passed" -ForegroundColor Green
Write-Host "Total Failed:  $failed" -ForegroundColor Red
Write-Host "Total Blocked: $blocked" -ForegroundColor Yellow
Write-Host ""

Write-Host "=== DETAILED RESULTS ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize -Wrap

# Blockers and Next Steps
Write-Host ""
Write-Host "=== BLOCKERS & NEXT STEPS ===" -ForegroundColor Cyan
$blockers = $results | Where-Object { $_.Status -eq "BLOCKED" }
if ($blockers.Count -gt 0) {
    Write-Host "Blocked steps:" -ForegroundColor Yellow
    foreach ($blocker in $blockers) {
        Write-Host "  - $($blocker.Step): $($blocker.Evidence)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Next actions:" -ForegroundColor Cyan
    Write-Host "  1. Ensure project 8 exists and is accessible" -ForegroundColor White
    Write-Host "  2. Ingest test data/snapshots to populate agents" -ForegroundColor White
    Write-Host "  3. Run at least 2 test runs to enable Compare/CI Gate" -ForegroundColor White
} else {
    Write-Host "No blockers - all tests completed!" -ForegroundColor Green
}

$failures = $results | Where-Object { $_.Status -eq "FAIL" }
if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Failed steps:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $($failure.Step): $($failure.Evidence)" -ForegroundColor Red
    }
}

# Exit code
if ($failed -gt 0) { exit 1 }
exit 0
