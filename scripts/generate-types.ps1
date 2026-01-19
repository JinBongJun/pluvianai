# Generate TypeScript types from OpenAPI schema (PowerShell version)
# This script fetches the OpenAPI schema from the backend and generates TypeScript types

$BackendUrl = if ($env:BACKEND_URL) { $env:BACKEND_URL } else { "http://localhost:8000" }
$OutputFile = if ($env:OUTPUT_FILE) { $env:OUTPUT_FILE } else { "frontend/lib/api-types.ts" }

Write-Host "Fetching OpenAPI schema from ${BackendUrl}/openapi.json..."
Invoke-WebRequest -Uri "${BackendUrl}/openapi.json" -OutFile "$env:TEMP\openapi.json"

Write-Host "Generating TypeScript types..."
npx openapi-typescript "$env:TEMP\openapi.json" -o $OutputFile

Write-Host "Types generated successfully at $OutputFile"
