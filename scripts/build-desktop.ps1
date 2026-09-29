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
    uv sync --locked --group desktop
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    uv run --group desktop pyinstaller --noconfirm --onefile --name Probnik `
        --distpath ../dist --workpath build/desktop `
        --add-data 'alembic.ini;.' --add-data 'migrations;migrations' `
        --add-data '../frontend/dist;frontend' `
        --collect-submodules app --collect-submodules uvicorn `
        --hidden-import sqlalchemy.dialects.sqlite.pysqlite desktop.py
    if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
} finally { Pop-Location }
Write-Host 'Ready: dist/Probnik.exe. Database: data/probnik.db next to the executable.'
