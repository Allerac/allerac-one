#Requires -Version 5.1

<#
.SYNOPSIS
    Creates an Allerac One shortcut on the Desktop.
.DESCRIPTION
    Run once after installation to add a desktop shortcut
    that starts Allerac One with a double-click.
#>

$startScript = Join-Path $PSScriptRoot "start.ps1"

if (-not (Test-Path $startScript)) {
    Write-Host "[ERROR] start.ps1 not found. Make sure you run this from the allerac-one folder." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "Allerac One.lnk"

$shell    = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)

$shortcut.TargetPath       = "powershell.exe"
$shortcut.Arguments        = "-ExecutionPolicy Bypass -WindowStyle Normal -File `"$startScript`""
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description      = "Start Allerac One"
$shortcut.IconLocation     = "powershell.exe,0"

$shortcut.Save()

Write-Host ""
Write-Host "[OK]    Shortcut created: $shortcutPath" -ForegroundColor Green
Write-Host ""
Write-Host "  Double-click 'Allerac One' on your Desktop to start." -ForegroundColor Cyan
Write-Host ""
