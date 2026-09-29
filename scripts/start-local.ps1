$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $projectPath 'frontend')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
} finally { Pop-Location }
Push-Location (Join-Path $projectPath 'backend')
try {
    uv sync --locked
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    uv run python desktop.py
} finally { Pop-Location }
