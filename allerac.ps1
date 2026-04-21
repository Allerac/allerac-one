#Requires -Version 5.1

<#
.SYNOPSIS
    Allerac One CLI — Windows wrapper
.DESCRIPTION
    Delegates all commands to allerac.sh running inside WSL2.
    Usage is identical to the Linux CLI.
.EXAMPLE
    .\allerac.ps1 start
    .\allerac.ps1 logs app
    .\allerac.ps1 pull qwen2.5:7b
    .\allerac.ps1 backup
    .\allerac.ps1 help
#>

param(
    [Parameter(Position = 0)]
    [string]$Command = "help",

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Args = @()
)

function Test-WslAndUbuntu {
    try {
        $distros = & wsl --list --quiet 2>&1
        return ($distros | Where-Object { $_ -match "Ubuntu" }).Count -gt 0
    } catch {
        return $false
    }
}

if (-not (Test-WslAndUbuntu)) {
    Write-Host ""
    Write-Host "[ERROR] Allerac One is not installed." -ForegroundColor Red
    Write-Host "        Run install.ps1 first." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Build the full argument list
$allArgs = @($Command) + $Args

# Delegate to allerac.sh inside WSL2
& wsl -d Ubuntu -u root -- bash ~/allerac-one/allerac.sh @allArgs

exit $LASTEXITCODE
