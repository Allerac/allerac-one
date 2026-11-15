param(
  [string]$ConfigPath = "$PSScriptRoot\..\.tools\codex-terminal.json",
  [string]$ListenHost = '127.0.0.1',
  # Required to bind 0.0.0.0 / ::; use only on an isolated test machine behind a firewall.
  [switch]$AllowWildcardHost
)
$ErrorActionPreference = 'Stop'
$terminalConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$env:UNIT_TERMINAL_PROVIDER = 'codex'
$env:CODEX_TERMINAL_SECRET = $terminalConfig.secret
$env:CODEX_TERMINAL_USER_ID = $terminalConfig.userId
$env:CODEX_TERMINAL_EXECUTABLE = (Get-Command codex -CommandType Application -ErrorAction Stop).Source
$env:CODEX_TERMINAL_CWD = (Resolve-Path "$PSScriptRoot\..").Path
$env:CODEX_TERMINAL_HOST = $ListenHost
if ($AllowWildcardHost) { $env:UNIT_TERMINAL_ALLOW_WILDCARD_HOST = 'true' } else { Remove-Item Env:UNIT_TERMINAL_ALLOW_WILDCARD_HOST -ErrorAction SilentlyContinue }
node "$PSScriptRoot\..\infra\claude-terminal\server.mjs"
