param(
  [Parameter(Mandatory = $true)][ValidateSet('detectar', 'ler', 'enviar')][string]$Acao,
  [string]$Grupo = '',
  [string]$Mensagem = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Emitir($obj) {
  $obj | ConvertTo-Json -Compress
}

function Dobrar([string]$texto) {
  if (-not $texto) { return '' }
  $form = $texto.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $form.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne 'NonSpacingMark') { [void]$sb.Append($ch) }
  }
  return ($sb.ToString().ToUpperInvariant() -replace '\s+', ' ').Trim()
}

function AcharWhatsApp {
  $procs = Get-Process | Where-Object { $_.ProcessName -match 'WhatsApp' -and $_.MainWindowHandle -ne 0 }
  return $procs | Select-Object -First 1
}

function ElementoRaiz($proc) {
  return [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
}

function Descendentes($raiz) {
  return $raiz.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
}

$proc = AcharWhatsApp
if (-not $proc) {
  Emitir @{ ok = $false; aberto = $false; motivo = 'WhatsApp Desktop fechado.' }
  exit 2
}

if ($Acao -eq 'detectar') {
  Emitir @{ ok = $true; aberto = $true; motivo = '' }
  exit 0
}

$raiz = ElementoRaiz $proc
$todos = Descendentes $raiz
$esperado = Dobrar $Grupo

function NomeDe($el) {
  try { return [string]$el.Current.Name } catch { return '' }
}

if ($Acao -eq 'ler') {
  $titulos = @()
  foreach ($el in $todos) {
    $nome = NomeDe $el
    if ($nome -and $nome.Length -gt 1 -and $nome.Length -lt 80) { $titulos += $nome }
  }
  Emitir @{ ok = $true; aberto = $true; titulo = ($titulos | Select-Object -First 1); motivo = '' }
  exit 0
}

$campoMensagem = $null
$candidatos = @()
foreach ($el in $todos) {
  $nome = NomeDe $el
  $dobrado = Dobrar $nome
  if ($dobrado -eq $esperado -and $esperado) { $candidatos += $el }
  if ($dobrado -match 'DIGITE UMA MENSAGEM|TYPE A MESSAGE') { $campoMensagem = $el }
}

$exatos = @($candidatos | Where-Object { (Dobrar (NomeDe $_)) -eq $esperado })
if ($exatos.Count -ne 1 -or -not $campoMensagem) {
  Emitir @{ ok = $false; aberto = $true; estado = 'destinatario_nao_validado'; motivo = 'O nome exato do grupo nao foi confirmado na janela do WhatsApp.' }
  exit 3
}

try { $exatos[0].SetFocus() } catch {}
Start-Sleep -Milliseconds 200
$titulo = NomeDe $exatos[0]
if ((Dobrar $titulo) -ne $esperado) {
  Emitir @{ ok = $false; aberto = $true; estado = 'destinatario_nao_validado'; motivo = 'O chat focado nao confere com o grupo.' }
  exit 3
}

try { $campoMensagem.SetFocus() } catch {}
$valor = $campoMensagem.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
if (-not $valor) {
  Emitir @{ ok = $false; aberto = $true; estado = 'falha_envio'; motivo = 'Nao foi possivel escrever no campo Digite uma mensagem.' }
  exit 4
}
$valor.SetValue($Mensagem)
Start-Sleep -Milliseconds 150
$campoMensagem.SetFocus()
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Emitir @{ ok = $true; aberto = $true; estado = 'comando_executado'; titulo = $titulo; motivo = '' }
exit 0
