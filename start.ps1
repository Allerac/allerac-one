#Requires -Version 5.1

<#
.SYNOPSIS
    Allerac One - Start
.DESCRIPTION
    Starts Allerac One inside WSL2 and opens the browser.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File start.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Log-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Log-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Log-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

function Test-UbuntuInstalled {
    try {
        $distros = & wsl --list --quiet 2>&1
        return ($distros | Where-Object { $_ -match "Ubuntu" }).Count -gt 0
    } catch {
        return $false
    }
}

function Start-Allerac {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Blue
    Write-Host "║   Allerac One — Starting...              ║" -ForegroundColor Blue
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Blue
    Write-Host ""

    if (-not (Test-UbuntuInstalled)) {
        Log-Error "Allerac One is not installed. Please run install.ps1 first."
        Read-Host "Press Enter to exit"
        exit 1
    }

    # Check if already running
    $running = & wsl -d Ubuntu -u root -- bash -c `
        "docker ps --filter 'name=allerac-app' --format '{{.Names}}' 2>/dev/null"
    if ($running -match "allerac-app") {
        Log-Ok "Allerac One is already running"
    } else {
        Log-Info "Starting containers..."
        & wsl -d Ubuntu -u root -- bash -c `
            "cd ~/allerac-one && docker compose -f docker-compose.local.yml up -d 2>&1"
        if ($LASTEXITCODE -ne 0) {
            Log-Error "Failed to start containers. Run install.ps1 if this is a fresh install."
            Read-Host "Press Enter to exit"
            exit 1
        }
        Log-Ok "Containers started"
    }

    # Wait for app to respond
    Log-Info "Waiting for app to be ready..."
    $port = (& wsl -d Ubuntu -u root -- bash -c `
        "grep '^APP_PORT=' ~/allerac-one/.env 2>/dev/null | cut -d= -f2 || echo '8080'").Trim()
    if (-not $port -or $port -notmatch '^\d+$') { $port = "8080" }

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            $ready = $true
            break
        } catch {
            Write-Host -NoNewline "."
            Start-Sleep -Seconds 2
        }
    }

    Write-Host ""

    if ($ready) {
        Log-Ok "Allerac One is ready at http://localhost:$port"
    } else {
        Log-Warn "App may still be starting — opening browser anyway."
    }

    Start-Process "http://localhost:$port"

    Write-Host ""
    Write-Host "  To stop:   run stop.ps1 or close this window" -ForegroundColor Yellow
    Write-Host ""
}

Start-Allerac
