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

function Test-WslAndUbuntu {
    try {
        $result = & wsl -d Ubuntu -- echo ok 2>&1
        return ($result -join '') -match 'ok'
    } catch {
        return $false
    }
}

function Get-AlleracPort {
    try {
        $portLine = (& wsl -d Ubuntu -u root -- grep "^APP_PORT=" "/root/allerac-one/.env" 2>$null | Select-Object -First 1)
        $port = (($portLine | Out-String).Trim() -replace '^APP_PORT=', '').Trim()
        if ($port -match '^\d+$') { return $port }
    } catch {
    }
    return "8080"
}

function Start-Allerac {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host "   Allerac One - Starting" -ForegroundColor Blue
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host ""

    if (-not (Test-WslAndUbuntu)) {
        Log-Error "Allerac One is not installed. Please run install.ps1 first."
        Read-Host "Press Enter to exit"
        exit 1
    }

    $wrapper = Join-Path (Split-Path -Parent $PSCommandPath) "allerac.ps1"
    if (-not (Test-Path $wrapper)) {
        Log-Error "allerac.ps1 not found next to start.ps1."
        Read-Host "Press Enter to exit"
        exit 1
    }

    Log-Info "Starting containers..."
    & powershell -ExecutionPolicy Bypass -File $wrapper start
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to start containers. Run install.ps1 if this is a fresh install."
        Read-Host "Press Enter to exit"
        exit 1
    }

    $port = Get-AlleracPort
    Log-Info "Waiting for app to be ready..."

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        try {
            $null = Invoke-WebRequest -Uri "http://localhost:$port" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
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
        Log-Warn "App may still be starting. Opening browser anyway."
    }

    Start-Process "http://localhost:$port"

    Write-Host ""
    Write-Host "  To stop: allerac stop" -ForegroundColor Yellow
    Write-Host ""
}

Start-Allerac
