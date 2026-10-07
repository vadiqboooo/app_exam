# Локальный запуск для чистой Windows: ничего не нужно ставить заранее.
# Скрипт сам ставит uv (если его нет); uv скачивает Python и всё остальное, включая Node.js для
# сборки интерфейса. Запуск: двойной щелчок по start.cmd в корне проекта или
#   powershell -ExecutionPolicy Bypass -File scripts\start.ps1
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location $projectPath

# Where the uv installer puts the program (the first path is the current one).
$uvFolders = @((Join-Path $env:USERPROFILE '.local\bin'), (Join-Path $env:USERPROFILE '.cargo\bin'))

function Find-Uv {
    if (Get-Command uv -ErrorAction SilentlyContinue) { return $true }
    foreach ($folder in $uvFolders) {
        if (Test-Path (Join-Path $folder 'uv.exe')) {
            # Installed, but this window does not know the path yet.
            $env:Path = "$folder;$env:Path"
            return $true
        }
    }
    return $false
}

if (-not (Find-Uv)) {
    Write-Host 'Устанавливаю uv (менеджер Python) — это нужно один раз, права администратора не нужны...'
    try {
        Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
    } catch {
        Write-Host "Не удалось установить uv: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host 'Проверьте интернет или установите вручную: https://docs.astral.sh/uv/getting-started/installation/'
        exit 1
    }
    if (-not (Find-Uv)) {
        Write-Host 'uv установлен, но не найден. Закройте это окно и запустите start.cmd ещё раз.' -ForegroundColor Red
        exit 1
    }
}

# uv finds or downloads Python by itself, installs the script's packages and runs it.
& uv run scripts/run_local.py @args
exit $LASTEXITCODE
