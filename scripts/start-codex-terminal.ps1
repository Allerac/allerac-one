param(
  [string]$ConfigPath = "$PSScriptRoot\..\.tools\codex-terminal.json",
  [string]$ListenHost = '127.0.0.1'
)
$ErrorActionPreference = 'Stop'
$terminalConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$env:UNIT_TERMINAL_PROVIDER = 'codex'
$env:CODEX_TERMINAL_SECRET = $terminalConfig.secret
$env:CODEX_TERMINAL_USER_ID = $terminalConfig.userId
$env:CODEX_TERMINAL_EXECUTABLE = (Get-Command codex -CommandType Application -ErrorAction Stop).Source
$env:CODEX_TERMINAL_CWD = (Resolve-Path "$PSScriptRoot\..").Path
$env:CODEX_TERMINAL_HOST = $ListenHost
node "$PSScriptRoot\..\infra\claude-terminal\server.mjs"
