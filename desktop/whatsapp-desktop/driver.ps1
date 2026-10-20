param(
  [Parameter(Mandatory = $true)][ValidateSet('detectar', 'ler', 'inspecionar', 'enviar')][string]$Acao,
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
  $webview = Get-Process -Name 'msedgewebview2' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'WhatsApp' } |
    Select-Object -First 1
  if ($webview) { return $webview }
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

if ($Acao -eq 'inspecionar') {
  $nomes = @()
  $temCampo = $false
  $temQr = $false
  foreach ($el in $todos) {
    $nome = NomeDe $el
    if (-not $nome) { continue }
    $dobrado = Dobrar $nome
    if ($dobrado -match 'QR|ESCANEIE|SCAN') { $temQr = $true }
    if ($dobrado -match 'DIGITE UMA MENSAGEM|TYPE A MESSAGE') { $temCampo = $true }
    if ($nome.Length -gt 1 -and $nome.Length -lt 80) { $nomes += $nome }
  }
  $unicos = @($nomes | Select-Object -Unique)
  $titulo = ''
  foreach ($el in $todos) {
    try {
      $selecao = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      if ($selecao -and $selecao.Current.IsSelected) {
        $nomeSelecionado = NomeDe $el
        if ($nomeSelecionado) { $titulo = $nomeSelecionado }
      }
    } catch {}
  }
  $motivo = ''
  if (-not $temCampo) { $motivo = 'O WhatsApp abriu, mas a janela nao mostrou o campo Digite uma mensagem. Abra o grupo e tente de novo. Nada foi enviado.' }
  Emitir @{ ok = $true; aberto = $true; autenticado = (-not $temQr -and $temCampo); campoMensagem = $temCampo; titulo = $titulo; candidatos = $unicos; motivo = $motivo }
  exit 0
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
Start-Sleep -Milliseconds 200
[System.Windows.Forms.SendKeys]::SendWait('{ESC}')
Emitir @{ ok = $true; aberto = $true; estado = 'comando_executado'; titulo = $titulo; motivo = 'Comando executado no WhatsApp. Entrega e leitura não foram comprovadas.' }
exit 0
