[CmdletBinding()]
param(
    [string]$BackendUrl = $(if ($env:AGENTGUARD_TEST_URL) { $env:AGENTGUARD_TEST_URL } else { "http://localhost:8000" }),
    [int]$ProjectId = 18,
    [string]$AgentId = "agent-A",
    [string]$Email = $env:AGENTGUARD_TEST_EMAIL,
    [string]$Password = $env:AGENTGUARD_TEST_PASSWORD,
    [string]$Repeats = "10,50,100",
    [double]$ReplayTemperature = 1.9,
    [string]$ReplayProvider = "openai",
    [string]$ReplayModel = "gpt-4o-mini",
    [string]$OverridesFile = "tmp/replay-overrides-flaky-tools.json",
    [string]$OutputJson = "tmp/rg-repeat-require-flaky.json",
    [bool]$RequireFlaky = $true,
    [switch]$CiQuiet,
    [switch]$SkipOpenAIKeyBootstrap,
    [switch]$KeepTempRule
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-WarnMsg([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Resolve-RepoRelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseDir,
        [Parameter(Mandatory = $true)]
        [string]$PathValue
    )
    if ([System.IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }
    return (Join-Path $BaseDir $PathValue)
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "python is not available in PATH."
}

if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    throw "Set AGENTGUARD_TEST_EMAIL / AGENTGUARD_TEST_PASSWORD or pass -Email / -Password."
}

$scriptsDir = $PSScriptRoot
$backendDir = Split-Path -Parent $scriptsDir
$matrixScript = Join-Path $scriptsDir "release_gate_repeat_matrix_test.py"

if (-not (Test-Path $matrixScript)) {
    throw "Matrix script not found: $matrixScript"
}

$overridesPath = Resolve-RepoRelativePath -BaseDir $backendDir -PathValue $OverridesFile
$outputPath = Resolve-RepoRelativePath -BaseDir $backendDir -PathValue $OutputJson

if (-not (Test-Path $overridesPath)) {
    throw "Overrides file not found: $overridesPath"
}

$outputDir = Split-Path -Parent $outputPath
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Info "Backend URL: $BackendUrl"
Write-Info "Project/Agent: $ProjectId / $AgentId"
Write-Info "Output JSON: $outputPath"

# 1) Login
$loginUri = "$BackendUrl/api/v1/auth/login"
$loginForm = @{
    username = $Email
    password = $Password
}

$loginResponse = Invoke-RestMethod -Method Post -Uri $loginUri -ContentType "application/x-www-form-urlencoded" -Body $loginForm
$token = if ($loginResponse.data) { $loginResponse.data.access_token } else { $loginResponse.access_token }
if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Login succeeded but access_token was missing."
}
$headers = @{ Authorization = "Bearer $token" }
Write-Ok "Authenticated as $Email"

# 2) Optional: bootstrap valid OpenAI project key from env
if (-not $SkipOpenAIKeyBootstrap) {
    if (-not [string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
        try {
            $keyBody = @{
                provider = "openai"
                api_key = $env:OPENAI_API_KEY
                name = "flaky-profile-bootstrap-openai"
                agent_id = $AgentId
            } | ConvertTo-Json -Depth 10

            Invoke-RestMethod `
                -Method Post `
                -Uri "$BackendUrl/api/v1/projects/$ProjectId/user-api-keys" `
                -Headers $headers `
                -ContentType "application/json" `
                -Body $keyBody | Out-Null

            Write-Info "OpenAI key bootstrap applied for agent scope."
        }
        catch {
            Write-WarnMsg "OpenAI key bootstrap failed (continuing): $($_.Exception.Message)"
        }
    }
    else {
        Write-WarnMsg "OPENAI_API_KEY not set in shell; skipping OpenAI key bootstrap."
    }
}

# 3) Seed deterministic snapshot prompt for flaky generation profile
$chainId = "flakyseed-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$seedPrompt = "Choose exactly ONE action each run: call coin_flip OR call dice_roll. Choose randomly each run. Never explain."
$seedBody = @{
    project_id = $ProjectId
    request_data = @{
        model = $ReplayModel
        messages = @(
            @{
                role = "user"
                content = $seedPrompt
            }
        )
    }
    response_data = @{
        model = $ReplayModel
        choices = @(
            @{
                message = @{
                    content = "coin_flip"
                }
            }
        )
    }
    latency_ms = 140
    status_code = 200
    agent_name = $AgentId
    chain_id = $chainId
} | ConvertTo-Json -Depth 20

$seedResp = Invoke-RestMethod `
    -Method Post `
    -Uri "$BackendUrl/api/v1/projects/$ProjectId/api-calls" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $seedBody

Write-Ok "Seed snapshot submitted (chain_id=$chainId)"

# 4) Resolve snapshot id by chain id
$encodedAgent = [System.Uri]::EscapeDataString($AgentId)
$snapshotId = $null
for ($i = 0; $i -lt 60; $i++) {
    $recent = Invoke-RestMethod `
        -Method Get `
        -Uri "$BackendUrl/api/v1/projects/$ProjectId/release-gate/agents/$encodedAgent/recent-snapshots?limit=100" `
        -Headers $headers

    foreach ($item in ($recent.items | ForEach-Object { $_ })) {
        if ("$($item.trace_id)" -like "$chainId*") {
            $snapshotId = "$($item.id)"
            break
        }
    }
    if ($snapshotId) { break }
    Start-Sleep -Seconds 1
}

if (-not $snapshotId) {
    throw "Failed to resolve snapshot id for chain_id=$chainId."
}
Write-Ok "Resolved snapshot_id=$snapshotId"

# 5) Create temporary flaky-forcing behavior rule
$tempRuleId = $null
try {
    $ruleName = "TEMP flaky rule forbid dice_roll $([Guid]::NewGuid().ToString('N').Substring(0, 6))"
    $ruleBody = @{
        name = $ruleName
        description = "Temporary flaky profile rule: fail when dice_roll appears."
        scope_type = "agent"
        scope_ref = $AgentId
        severity_default = "high"
        enabled = $true
        rule_json = @{
            type = "tool_forbidden"
            spec = @{
                tools = @("dice_roll")
            }
        }
    } | ConvertTo-Json -Depth 20

    $ruleResp = Invoke-RestMethod `
        -Method Post `
        -Uri "$BackendUrl/api/v1/projects/$ProjectId/behavior/rules" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $ruleBody

    $tempRuleId = if ($ruleResp.data) { $ruleResp.data.id } else { $ruleResp.id }
    if ([string]::IsNullOrWhiteSpace($tempRuleId)) {
        throw "Temporary rule response missing id."
    }
    Write-Ok "Created temporary rule_id=$tempRuleId"

    # 6) Run matrix script in require-flaky mode
    $matrixArgs = @(
        $matrixScript,
        "--base-url", $BackendUrl,
        "--email", $Email,
        "--password", $Password,
        "--project-id", "$ProjectId",
        "--agent-id", $AgentId,
        "--snapshot-ids", $snapshotId,
        "--repeats", $Repeats,
        "--model-source", "detected",
        "--replay-provider", $ReplayProvider,
        "--new-model", $ReplayModel,
        "--replay-temperature", "$ReplayTemperature",
        "--replay-overrides-file", $overridesPath,
        "--output-json", $outputPath
    )
    if ($RequireFlaky) {
        $matrixArgs += "--require-flaky"
    }

    Write-Info "Executing matrix script..."
    if ($CiQuiet) {
        $matrixOutput = & python @matrixArgs 2>&1
        $matrixExitCode = $LASTEXITCODE
        if ($matrixExitCode -ne 0) {
            Write-WarnMsg "Matrix script failed in CI quiet mode. Captured output:"
            $matrixOutput | ForEach-Object { Write-Host $_ }
            throw "Matrix script failed with exit code $matrixExitCode."
        }

        if (Test-Path $outputPath) {
            try {
                $summary = Get-Content $outputPath -Raw | ConvertFrom-Json
                $rows = @($summary.results)
                if ($rows.Count -gt 0) {
                    $parts = $rows | ForEach-Object {
                        "r=$($_.repeat_runs):P$($_.pass_cases)/F$($_.fail_cases)/K$($_.flaky_cases)"
                    }
                    Write-Ok ("CI summary -> " + ($parts -join " | "))
                }
                else {
                    Write-Ok "CI summary -> no result rows in output JSON."
                }
            }
            catch {
                Write-WarnMsg "CI summary parse failed (continuing): $($_.Exception.Message)"
            }
        }
        Write-Ok "Flaky profile matrix completed (ci-quiet). Output: $outputPath"
    }
    else {
        & python @matrixArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Matrix script failed with exit code $LASTEXITCODE."
        }
        Write-Ok "Flaky profile matrix completed. Output: $outputPath"
    }
}
finally {
    if ($tempRuleId -and -not $KeepTempRule) {
        try {
            Invoke-RestMethod `
                -Method Delete `
                -Uri "$BackendUrl/api/v1/projects/$ProjectId/behavior/rules/$tempRuleId" `
                -Headers $headers | Out-Null
            Write-Info "Deleted temporary rule_id=$tempRuleId"
        }
        catch {
            Write-WarnMsg "Failed to delete temporary rule_id=${tempRuleId}: $($_.Exception.Message)"
        }
    }
    elseif ($tempRuleId -and $KeepTempRule) {
        Write-WarnMsg "KeepTempRule enabled. Temporary rule left in place: $tempRuleId"
    }
}
