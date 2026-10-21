# Instala o Node.js sem pedir comando ao operador.
# Primeiro tenta o winget no caminho real. Se não der, baixa o zip oficial LTS
# e extrai em %LOCALAPPDATA%\Programs\nodejs.

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Achar-Node {
  $candidatos = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:ProgramW6432 'nodejs\node.exe'),
    'C:\Program Files\nodejs\node.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  ) | Where-Object { $_ }
  foreach ($caminho in $candidatos) {
    if (Test-Path -LiteralPath $caminho) { return $caminho }
  }
  return $null
}

if (Achar-Node) { exit 0 }

$winget = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
if (Test-Path -LiteralPath $winget) {
  & $winget install --id OpenJS.NodeJS.LTS -e --scope user --accept-package-agreements --accept-source-agreements --disable-interactivity
  if (Achar-Node) { exit 0 }
}

$indice = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json'
$lts = $indice | Where-Object { $_.lts } | Select-Object -First 1
if (-not $lts.version) { throw 'Não achei a versão LTS no canal oficial do Node.js.' }
$versao = [string]$lts.version
$nome = "node-$versao-win-x64"
$zip = Join-Path $env:TEMP "$nome.zip"
$extraido = Join-Path $env:TEMP $nome
Invoke-WebRequest -Uri "https://nodejs.org/dist/$versao/$nome.zip" -OutFile $zip
if (Test-Path -LiteralPath $extraido) { Remove-Item -LiteralPath $extraido -Recurse -Force }
Expand-Archive -LiteralPath $zip -DestinationPath $extraido -Force
$origem = Join-Path $extraido $nome
$destino = Join-Path $env:LOCALAPPDATA 'Programs\nodejs'
New-Item -ItemType Directory -Force -Path $destino | Out-Null
Copy-Item -Path (Join-Path $origem '*') -Destination $destino -Recurse -Force
if (-not (Achar-Node)) { throw 'O Node.js foi baixado, mas o node.exe não ficou na pasta esperada.' }
exit 0
