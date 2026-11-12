param(
  [string]$ConfigPath = "$PSScriptRoot\..\.tools\claude-terminal.json",
  [string]$ListenHost = '127.0.0.1',
  # Required to bind 0.0.0.0 / ::; use only on an isolated test machine behind a firewall.
  [switch]$AllowWildcardHost
)
$ErrorActionPreference = 'Stop'
$env:UNIT_TERMINAL_PROVIDER = 'claude'
$terminalConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$env:CLAUDE_TERMINAL_SECRET = $terminalConfig.secret
$env:CLAUDE_TERMINAL_USER_ID = $terminalConfig.userId
$env:CLAUDE_TERMINAL_EXECUTABLE = (Get-Command claude -ErrorAction Stop).Source
$env:CLAUDE_TERMINAL_CWD = (Resolve-Path "$PSScriptRoot\..").Path
$env:CLAUDE_TERMINAL_HOST = $ListenHost
if ($AllowWildcardHost) { $env:UNIT_TERMINAL_ALLOW_WILDCARD_HOST = 'true' } else { Remove-Item Env:UNIT_TERMINAL_ALLOW_WILDCARD_HOST -ErrorAction SilentlyContinue }
node "$PSScriptRoot\..\infra\claude-terminal\server.mjs"
