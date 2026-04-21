#Requires -Version 5.1

<#
.SYNOPSIS
    Allerac One - Windows Installer
.DESCRIPTION
    Installs WSL2 + Ubuntu and runs Allerac One transparently.
    The user does not need to know Linux is involved.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1
    powershell -ExecutionPolicy Bypass -File install.ps1 -HardwareTier lite
.NOTES
    Must be run as Administrator (the script will prompt if not).
#>

param(
    [string]$HardwareTier        = $env:HARDWARE_TIER,
    [string]$OllamaModels        = $env:OLLAMA_MODELS,
    [string]$EnableNotifications = $env:ENABLE_NOTIFICATIONS,
    [string]$EnableMonitoring    = $env:ENABLE_MONITORING,
    [string]$EnableGpu           = $env:ENABLE_GPU,
    [string]$Reconfigure         = $env:RECONFIGURE
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$REPO_RAW = "https://raw.githubusercontent.com/Allerac/allerac-one/main/install.sh"

# ============================================
# Logging
# ============================================
function Log-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Log-Ok    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Log-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Log-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Log-Step  { param($msg) Write-Host "`n--- $msg ---" -ForegroundColor White }

# ============================================
# Admin check - re-launch elevated if needed
# ============================================
function Assert-Admin {
    $principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host ""
        Write-Host "  Administrator privileges are required to install WSL2." -ForegroundColor Yellow
        Write-Host "  Relaunching as Administrator..." -ForegroundColor Yellow
        Write-Host ""

        $argList = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
        foreach ($p in $PSBoundParameters.GetEnumerator()) {
            $argList += " -$($p.Key) `"$($p.Value)`""
        }

        Start-Process powershell -Verb RunAs -ArgumentList $argList
        exit 0
    }
    Log-Ok "Running as Administrator"
}

# ============================================
# Windows version check
# ============================================
function Assert-WindowsVersion {
    $build = [System.Environment]::OSVersion.Version.Build
    if ($build -lt 19041) {
        Log-Error "WSL2 requires Windows 10 build 19041 or later (you have build $build)."
        Log-Error "Please update Windows and try again."
        exit 1
    }
    Log-Ok "Windows version: build $build"
}

# ============================================
# WSL2
# ============================================
function Test-WslAvailable {
    try {
        $null = & wsl --status 2>&1
        return $true
    } catch {
        return $false
    }
}

function Test-UbuntuInstalled {
    try {
        $distros = & wsl --list --quiet 2>&1
        return ($distros | Where-Object { $_ -match "Ubuntu" }).Count -gt 0
    } catch {
        return $false
    }
}

function Install-Wsl2AndUbuntu {
    Log-Step "Installing WSL2 + Ubuntu"
    Log-Info "This may take a few minutes..."

    $proc = Start-Process -FilePath "wsl" `
        -ArgumentList "--install -d Ubuntu --no-launch" `
        -Wait -PassThru -NoNewWindow

    if ($proc.ExitCode -eq 0) {
        Log-Ok "WSL2 + Ubuntu installed"
        return $false
    }

    $pendingReboot = Test-Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending"
    if ($pendingReboot) {
        return $true
    }

    Log-Warn "wsl --install exited with code $($proc.ExitCode) - checking if Ubuntu is available..."
    return $false
}

function Initialize-Ubuntu {
    Log-Step "Initializing Ubuntu"
    Log-Info "Starting Ubuntu for the first time (running as root)..."

    $null = & wsl -d Ubuntu -u root -- bash -c "echo ready" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Log-Info "Waiting for Ubuntu to finish initializing..."
        Start-Sleep -Seconds 10
        $null = & wsl -d Ubuntu -u root -- bash -c "echo ready" 2>&1
        if ($LASTEXITCODE -ne 0) {
            Log-Error "Could not start Ubuntu. Open Ubuntu from the Start menu to complete setup, then re-run this script."
            exit 1
        }
    }

    Log-Ok "Ubuntu is ready"
}

function Update-Ubuntu {
    Log-Step "Preparing Ubuntu environment"
    Log-Info "Updating package lists..."
    & wsl -d Ubuntu -u root -- bash -c "apt-get update -qq" | Out-Null
    Log-Info "Installing curl..."
    & wsl -d Ubuntu -u root -- bash -c "command -v curl >/dev/null 2>&1 || apt-get install -y curl -qq" | Out-Null
    Log-Ok "Ubuntu environment ready"
}

# ============================================
# Run Allerac installer inside WSL2
# ============================================
function Invoke-AlleracInstall {
    Log-Step "Running Allerac One installer"

    $envPrefix = ""
    if ($HardwareTier)        { $envPrefix += "HARDWARE_TIER=$HardwareTier " }
    if ($OllamaModels)        { $envPrefix += "OLLAMA_MODELS=$OllamaModels " }
    if ($EnableNotifications) { $envPrefix += "ENABLE_NOTIFICATIONS=$EnableNotifications " }
    if ($EnableMonitoring)    { $envPrefix += "ENABLE_MONITORING=$EnableMonitoring " }
    if ($EnableGpu)           { $envPrefix += "ENABLE_GPU=$EnableGpu " }
    if ($Reconfigure)         { $envPrefix += "RECONFIGURE=$Reconfigure " }

    $localInstallSh = Join-Path (Split-Path -Parent $PSCommandPath) "install.sh"
    if (Test-Path $localInstallSh) {
        $wslPath = (& wsl -- wslpath -a ($localInstallSh.Replace("\", "/"))).Trim()
        Log-Info "Using local install.sh: $wslPath"
        $installCmd = "${envPrefix}bash `"$wslPath`""
    } else {
        Log-Info "Downloading install.sh from repository..."
        $installCmd = "${envPrefix}bash <(curl -sSL $REPO_RAW)"
    }

    & wsl -d Ubuntu -u root -- bash -c $installCmd

    if ($LASTEXITCODE -ne 0) {
        Log-Error "Installation failed (exit code $LASTEXITCODE). See output above."
        exit 1
    }
}

# ============================================
# Register allerac command in Windows PATH
# ============================================
function Register-AlleracCli {
    $alleracPs1 = Join-Path (Split-Path -Parent $PSCommandPath) "allerac.ps1"
    if (-not (Test-Path $alleracPs1)) {
        Log-Warn "allerac.ps1 not found - skipping Windows PATH registration."
        return
    }

    $cliDir = Join-Path $env:LOCALAPPDATA "AlleracOne"
    $batFile = Join-Path $cliDir "allerac.bat"
    New-Item -ItemType Directory -Path $cliDir -Force | Out-Null

    $batContent = "@echo off`r`npowershell -ExecutionPolicy Bypass -File `"$alleracPs1`" %*"
    Set-Content -Path $batFile -Value $batContent -Encoding ASCII

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::User)
    if ($currentPath -notlike "*$cliDir*") {
        [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$cliDir", [EnvironmentVariableTarget]::User)
        Log-Ok "allerac registered in PATH (open a new terminal to use)"
    } else {
        Log-Ok "allerac already in PATH"
    }
}

# ============================================
# Desktop shortcut
# ============================================
function Create-DesktopShortcut {
    $shortcutScript = Join-Path (Split-Path -Parent $PSCommandPath) "create-shortcut.ps1"
    if (Test-Path $shortcutScript) {
        Log-Info "Creating desktop shortcut..."
        & powershell -ExecutionPolicy Bypass -File $shortcutScript
    }
}

# ============================================
# Open browser
# ============================================
function Open-AlleracBrowser {
    try {
        $portRaw = & wsl -d Ubuntu -u root -- bash -c "grep ^APP_PORT= ~/allerac-one/.env 2>/dev/null | cut -d= -f2"
        $port = ($portRaw | Out-String).Trim()
        if (-not $port -or $port -notmatch '^\d+$') { $port = "8080" }
    } catch {
        $port = "8080"
    }

    Log-Info "Opening http://localhost:$port ..."
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:$port"
}

# ============================================
# Reboot prompt with scheduled re-run
# ============================================
function Request-RebootAndResume {
    Write-Host ""
    Log-Warn "A reboot is required to complete WSL2 installation."
    Write-Host ""

    $taskName = "AlleracOneInstall"
    $argString = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($HardwareTier)        { $argString += " -HardwareTier `"$HardwareTier`"" }
    if ($OllamaModels)        { $argString += " -OllamaModels `"$OllamaModels`"" }
    if ($EnableNotifications) { $argString += " -EnableNotifications `"$EnableNotifications`"" }
    if ($EnableMonitoring)    { $argString += " -EnableMonitoring `"$EnableMonitoring`"" }

    $choice = Read-Host "  Reboot now and continue automatically? [Y/n]"
    if ($choice -notmatch "^[Nn]$") {
        $action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argString
        $trigger  = New-ScheduledTaskTrigger -AtLogOn
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
            -Settings $settings -RunLevel Highest -Force | Out-Null
        Log-Info "Installation will resume automatically after reboot."
        Restart-Computer -Force
        exit 0
    } else {
        Write-Host ""
        Log-Error "Please reboot manually and re-run install.ps1."
        exit 1
    }
}

# ============================================
# Cleanup scheduled resume task if present
# ============================================
function Remove-ResumeTask {
    $taskName = "AlleracOneInstall"
    if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Log-Info "Resumed after reboot - cleanup done."
    }
}

# ============================================
# Main
# ============================================
function Main {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host "   Allerac One - Windows Setup" -ForegroundColor Blue
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host ""

    Assert-Admin
    Assert-WindowsVersion
    Remove-ResumeTask

    if (-not (Test-WslAvailable)) {
        $needsReboot = Install-Wsl2AndUbuntu
        if ($needsReboot) { Request-RebootAndResume }
    } else {
        Log-Ok "WSL2 already installed"
    }

    if (-not (Test-UbuntuInstalled)) {
        Log-Info "Installing Ubuntu distribution..."
        $needsReboot = Install-Wsl2AndUbuntu
        if ($needsReboot) { Request-RebootAndResume }
    } else {
        Log-Ok "Ubuntu already installed"
    }

    Initialize-Ubuntu
    Update-Ubuntu
    Invoke-AlleracInstall
    Register-AlleracCli
    Open-AlleracBrowser
    Create-DesktopShortcut

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host "   Allerac One - Ready!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Open your browser at: http://localhost:8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Commands (open a new terminal first):" -ForegroundColor White
    Write-Host "    allerac start    - start services" -ForegroundColor Yellow
    Write-Host "    allerac stop     - stop services" -ForegroundColor Yellow
    Write-Host "    allerac status   - show status" -ForegroundColor Yellow
    Write-Host "    allerac update   - update to latest" -ForegroundColor Yellow
    Write-Host "    allerac help     - all commands" -ForegroundColor Yellow
    Write-Host ""
}

Main
