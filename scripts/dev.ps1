$ErrorActionPreference = 'Stop'

Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

if (!(Test-Path '.tmp')) {
  New-Item -ItemType Directory -Force -Path '.tmp' | Out-Null
}

$tmpPath = (Resolve-Path '.tmp').Path
$env:TEMP = $tmpPath
$env:TMP = $tmpPath

if (-not $env:HOST) {
  $env:HOST = '127.0.0.1'
}

if (-not $env:PORT) {
  $env:PORT = '4100'
}

fnm exec --using v22.22.0 npm.cmd run dev
