#!/bin/bash
# Generate TypeScript types from OpenAPI schema
# This script fetches the OpenAPI schema from the backend and generates TypeScript types

set -e

BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
OUTPUT_FILE="${OUTPUT_FILE:-frontend/lib/api-types.ts}"

echo "Fetching OpenAPI schema from ${BACKEND_URL}/openapi.json..."
curl -s "${BACKEND_URL}/openapi.json" -o /tmp/openapi.json

echo "Generating TypeScript types..."
npx openapi-typescript /tmp/openapi.json -o "${OUTPUT_FILE}"

echo "Types generated successfully at ${OUTPUT_FILE}"
