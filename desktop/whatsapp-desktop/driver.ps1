param(
  [Parameter(Mandatory = $true)][ValidateSet('detectar', 'ler', 'inspecionar', 'enviar')][string]$Acao,
  [string]$Grupo = '',
  [string]$Mensagem = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

function Emitir($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress))
}

trap {
  Emitir @{ ok = $false; aberto = $true; estado = 'falha_envio'; motivo = ([string]$_.Exception.Message) }
  exit 1
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

function TrazerFrente($alvo) {
  if (-not ('FocoJanela' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class FocoJanela {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
}
'@
  }
  $janela = $alvo.MainWindowHandle
  $frente = [FocoJanela]::GetForegroundWindow()
  $processoFrente = [uint32]0
  $processoAlvo = [uint32]0
  $fioFrente = [FocoJanela]::GetWindowThreadProcessId($frente, [ref]$processoFrente)
  $fioAtual = [FocoJanela]::GetCurrentThreadId()
  $fioAlvo = [FocoJanela]::GetWindowThreadProcessId($janela, [ref]$processoAlvo)
  [FocoJanela]::AttachThreadInput($fioAtual, $fioFrente, $true) | Out-Null
  [FocoJanela]::AttachThreadInput($fioAtual, $fioAlvo, $true) | Out-Null
  [FocoJanela]::ShowWindow($janela, 9) | Out-Null
  [FocoJanela]::BringWindowToTop($janela) | Out-Null
  [FocoJanela]::SetForegroundWindow($janela) | Out-Null
  [FocoJanela]::AttachThreadInput($fioAtual, $fioAlvo, $false) | Out-Null
  [FocoJanela]::AttachThreadInput($fioAtual, $fioFrente, $false) | Out-Null
}

function GarantirWhatsApp {
  $alvo = AcharWhatsApp
  if (-not $alvo) {
    Start-Process 'whatsapp:'
    for ($i = 0; $i -lt 24; $i++) {
      Start-Sleep -Milliseconds 500
      $alvo = AcharWhatsApp
      if ($alvo) { break }
    }
  }
  return $alvo
}

$proc = if ($Acao -eq 'enviar') { GarantirWhatsApp } else { AcharWhatsApp }
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

function ColarTexto([string]$texto) {
  $thread = New-Object System.Threading.Thread {
    param($valor)
    [System.Windows.Forms.Clipboard]::SetText([string]$valor)
  }
  $thread.SetApartmentState([System.Threading.ApartmentState]::STA)
  $thread.Start($texto)
  $thread.Join()
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('^v')
}

if (-not ('CliqueJanela' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CliqueJanela {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
'@
}

function AtualizarTela {
  $script:raiz = ElementoRaiz $proc
  $script:todos = Descendentes $script:raiz
}

function AcharPorNome([string]$padrao) {
  foreach ($el in $script:todos) {
    if ((Dobrar (NomeDe $el)) -match $padrao) { return $el }
  }
  return $null
}

function ClicarElemento($el) {
  if (-not $el) { return }
  try { $el.SetFocus() } catch {}
  try {
    $r = $el.Current.BoundingRectangle
    if ($r.Width -ge 4 -and $r.Height -ge 4) {
      $x = [int]($r.X + ($r.Width / 2))
      $y = [int]($r.Y + ($r.Height / 2))
      [CliqueJanela]::SetCursorPos($x, $y) | Out-Null
      [CliqueJanela]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
      [CliqueJanela]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    }
  } catch {}
}

function ValorDe($el) {
  if (-not $el) { return '' }
  try {
    $valor = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($valor) { return [string]$valor.Current.Value }
  } catch {}
  return ''
}

function AcharBusca {
  $melhor = $null
  $melhorY = 999999
  foreach ($el in $script:todos) {
    $nome = Dobrar (NomeDe $el)
    $tipo = ''
    try { $tipo = [string]$el.Current.ControlType.ProgrammaticName } catch {}
    if ($tipo -notmatch 'Edit') { continue }
    if ($nome -match 'DIGITE UMA MENSAGEM|DIGITA UMA MENSAGEM|TYPE A MESSAGE') { continue }
    try {
      $r = $el.Current.BoundingRectangle
      if ($r.Width -lt 40 -or $r.Height -lt 8 -or $r.Y -ge $melhorY) { continue }
      $melhorY = $r.Y
      $melhor = $el
    } catch {}
  }
  return $melhor
}

function EscaparTeclas([string]$texto) {
  return ($texto -replace '([+^%~(){}\[\]])', '{$1}')
}

function TextoDaBusca($busca) {
  if (-not $busca) { return '' }
  $valor = ValorDe $busca
  if ($valor) { return $valor }
  $nome = NomeDe $busca
  if ($nome -and -not (TextoVazio $nome)) { return $nome }
  return ''
}

function ClicarConversas {
  TrazerFrente $proc
  Start-Sleep -Milliseconds 200
  AtualizarTela
  foreach ($el in $script:todos) {
    $nome = Dobrar (NomeDe $el)
    if ($nome -ne 'CONVERSAS' -and $nome -ne 'CHATS') { continue }
    $tipo = ''
    try { $tipo = [string]$el.Current.ControlType.ProgrammaticName } catch {}
    if ($tipo -notmatch 'Button') { continue }
    ClicarElemento $el
    Start-Sleep -Milliseconds 350
    return $true
  }
  return $false
}

function DigitarBusca([string]$texto) {
  $null = ClicarConversas
  AtualizarTela
  $busca = AcharBusca
  if (-not $busca) { return $false }
  ClicarElemento $busca
  Start-Sleep -Milliseconds 150
  try {
    $valor = $busca.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($valor) { $valor.SetValue($texto) }
  } catch {}
  Start-Sleep -Milliseconds 300
  AtualizarTela
  $busca = AcharBusca
  if ((Dobrar (TextoDaBusca $busca)).Contains((Dobrar $texto))) { return $true }
  if (-not $busca) { return $false }
  ClicarElemento $busca
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
  [System.Windows.Forms.SendKeys]::SendWait((EscaparTeclas $texto))
  Start-Sleep -Milliseconds 400
  AtualizarTela
  $busca = AcharBusca
  return ((Dobrar (TextoDaBusca $busca)).Contains((Dobrar $texto)))
}

function LimparPesquisa {
  TrazerFrente $proc
  Start-Sleep -Milliseconds 150
  AtualizarTela
  $busca = AcharBusca
  if ($busca) {
    ClicarElemento $busca
    try {
      $valorBusca = $busca.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($valorBusca) { $valorBusca.SetValue('') }
    } catch {}
  }
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
  [System.Windows.Forms.SendKeys]::SendWait('{DELETE}')
}

function AcharCampoMensagem {
  $porNome = AcharPorNome 'DIGITE UMA MENSAGEM|DIGITA UMA MENSAGEM|TYPE A MESSAGE'
  if ($porNome) { return $porNome }
  $area = $script:raiz.Current.BoundingRectangle
  $limite = $area.Y + ($area.Height * 0.45)
  $melhor = $null
  $melhorY = -1
  foreach ($el in $script:todos) {
    try {
      $tipo = [string]$el.Current.ControlType.ProgrammaticName
      if ($tipo -notmatch 'Edit|Document') { continue }
      $r = $el.Current.BoundingRectangle
      if ($r.Width -lt 80 -or $r.Y -lt $limite) { continue }
      if ($r.Y -gt $melhorY) { $melhorY = $r.Y; $melhor = $el }
    } catch {}
  }
  return $melhor
}

function AcharGrupoNaLista {
  $melhor = $null
  $melhorY = 999999
  foreach ($el in $script:todos) {
    if ((Dobrar (NomeDe $el)) -ne $esperado) { continue }
    try {
      $r = $el.Current.BoundingRectangle
      if ($r.Height -lt 8 -or $r.Y -ge $melhorY) { continue }
      $melhorY = $r.Y
      $melhor = $el
    } catch {}
  }
  return $melhor
}

function AcharBotaoEnviar {
  foreach ($el in $script:todos) {
    $nome = Dobrar (NomeDe $el)
    if ($nome -notmatch '^(ENVIAR|SEND)$' -and $nome -notmatch 'ENVIAR MENSAGEM|SEND MESSAGE') { continue }
    try {
      if ([string]$el.Current.ControlType.ProgrammaticName -match 'Button') { return $el }
    } catch {}
  }
  return $null
}

function UsarClipboard([string]$modo, [string]$texto) {
  $arquivo = Join-Path $env:TEMP ('tmseg-clip-' + [guid]::NewGuid().ToString() + '.txt')
  $thread = New-Object System.Threading.Thread {
    param($dados)
    try {
      if ($dados[0] -eq 'ler') {
        $lido = ''
        if ([System.Windows.Forms.Clipboard]::ContainsText()) { $lido = [System.Windows.Forms.Clipboard]::GetText() }
        [System.IO.File]::WriteAllText($dados[1], $lido, [System.Text.Encoding]::UTF8)
      } elseif ([string]::IsNullOrEmpty($dados[2])) {
        [System.Windows.Forms.Clipboard]::Clear()
        [System.IO.File]::WriteAllText($dados[1], 'ok', [System.Text.Encoding]::UTF8)
      } else {
        [System.Windows.Forms.Clipboard]::SetText([string]$dados[2])
        [System.IO.File]::WriteAllText($dados[1], 'ok', [System.Text.Encoding]::UTF8)
      }
    } catch {
      [System.IO.File]::WriteAllText($dados[1], '', [System.Text.Encoding]::UTF8)
    }
  }
  $thread.SetApartmentState([System.Threading.ApartmentState]::STA)
  $thread.Start(@($modo, $arquivo, $texto))
  $thread.Join()
  $resultado = ''
  if (Test-Path $arquivo) {
    $resultado = [System.IO.File]::ReadAllText($arquivo, [System.Text.Encoding]::UTF8)
    Remove-Item $arquivo -Force -ErrorAction SilentlyContinue
  }
  return $resultado
}

function TextoVazio([string]$texto) {
  $dobrado = Dobrar $texto
  if (-not $dobrado) { return $true }
  return $dobrado -match 'PESQUISAR|SEARCH|COMECAR UMA NOVA|START A NEW|DIGITE UMA MENSAGEM|DIGITA UMA MENSAGEM|TYPE A MESSAGE|^\[\[TMSEG\]\]$'
}

function TrechoMensagem {
  $limpo = ($Mensagem -replace '\s+', ' ').Trim()
  if ($limpo.Length -le 40) { return Dobrar $limpo }
  return Dobrar $limpo.Substring(0, 40)
}

function CopiarCampo($el) {
  if (-not $el) { return $null }
  UsarClipboard 'gravar' '[[TMSEG]]' | Out-Null
  ClicarElemento $el
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 80
  [System.Windows.Forms.SendKeys]::SendWait('^c')
  Start-Sleep -Milliseconds 150
  $lido = UsarClipboard 'ler' ''
  if ($lido -eq '[[TMSEG]]') { return $null }
  return $lido
}

function ApagarCampo($el) {
  if (-not $el) { return }
  ClicarElemento $el
  Start-Sleep -Milliseconds 100
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  [System.Windows.Forms.SendKeys]::SendWait('{BACKSPACE}')
  [System.Windows.Forms.SendKeys]::SendWait('{DELETE}')
}

function OlharTela {
  AtualizarTela
  $busca = AcharBusca
  $campo = AcharCampoMensagem
  $textoBusca = ''
  $buscaConhecida = $false
  $textoCampo = ''
  $campoConhecido = $false
  if ($busca) {
    $peloValor = TextoDaBusca $busca
    if ($peloValor) { $textoBusca = $peloValor; $buscaConhecida = $true }
    else {
      $copiado = CopiarCampo $busca
      if ($null -ne $copiado) { $textoBusca = $copiado; $buscaConhecida = $true }
    }
  }
  if ($campo) {
    $peloValor = ValorDe $campo
    if ($peloValor) { $textoCampo = $peloValor; $campoConhecido = $true }
    else {
      $copiado = CopiarCampo $campo
      if ($null -ne $copiado) { $textoCampo = $copiado; $campoConhecido = $true }
    }
  }
  $trecho = TrechoMensagem
  $buscaDobro = Dobrar $textoBusca
  $campoDobro = Dobrar $textoCampo
  return @{
    temCampo = [bool]$campo
    buscaConhecida = $buscaConhecida
    campoConhecido = $campoConhecido
    msgNaPesquisa = $buscaConhecida -and $trecho -and $buscaDobro.Contains($trecho)
    grupoNaPesquisa = $buscaConhecida -and $esperado -and $buscaDobro.Contains($esperado) -and -not ($trecho -and $buscaDobro.Contains($trecho))
    grupoNoCampo = $campoConhecido -and $esperado -and $campoDobro -eq $esperado
    msgNoCampo = $campoConhecido -and $trecho -and $campoDobro.Contains($trecho)
    pesquisaSuja = $buscaConhecida -and -not (TextoVazio $textoBusca)
  }
}

# Um grupo por chamada. Se a ação caiu no lugar errado, volta a etapa e corrige.
# A fila chama de novo para o grupo seguinte.
Add-Type -AssemblyName System.Windows.Forms
$clipboardOriginal = UsarClipboard 'ler' ''
$passo = 'pesquisar'
$enviou = $false
$pesquisaLimpa = $false
$ultimo = 'abrir'
$colagens = 0
$tentativasEnvio = 0
try {
for ($ciclo = 0; $ciclo -lt 10 -and -not ($enviou -and $pesquisaLimpa); $ciclo++) {
  $vivo = AcharWhatsApp
  if (-not $vivo) { $proc = GarantirWhatsApp } else { $proc = $vivo }
  if (-not $proc) { $ultimo = 'abrir'; Start-Sleep -Milliseconds 500; continue }
  TrazerFrente $proc
  Start-Sleep -Milliseconds 250
  $tela = OlharTela

  if ($tela.msgNaPesquisa) {
    $ultimo = 'pesquisar'
    LimparPesquisa
    $enviou = $false
    $passo = $(if ($tela.temCampo) { 'colar' } else { 'pesquisar' })
    continue
  }
  if ($tela.grupoNoCampo) {
    $ultimo = 'pesquisar'
    AtualizarTela
    ApagarCampo (AcharCampoMensagem)
    $enviou = $false
    $passo = 'pesquisar'
    continue
  }

  switch ($passo) {
    'pesquisar' {
      $ultimo = 'pesquisar'
      if (-not (DigitarBusca $Grupo)) { continue }
      $passo = 'abrir-chat'
    }
    'abrir-chat' {
      $ultimo = 'abrir-chat'
      if ($tela.buscaConhecida -and -not $tela.grupoNaPesquisa) { $passo = 'pesquisar'; continue }
      AtualizarTela
      $alvo = AcharGrupoNaLista
      if ($alvo) { ClicarElemento $alvo } else { [System.Windows.Forms.SendKeys]::SendWait('{DOWN}{ENTER}') }
      Start-Sleep -Milliseconds 600
      AtualizarTela
      if (AcharCampoMensagem) { $passo = 'colar' } else { $passo = 'pesquisar' }
    }
    'colar' {
      $ultimo = 'colar'
      if (-not $tela.temCampo) { $passo = 'pesquisar'; continue }
      if ($tela.msgNoCampo) { $passo = 'enviar'; continue }
      AtualizarTela
      $campoMensagem = AcharCampoMensagem
      if (-not $campoMensagem) { $passo = 'pesquisar'; continue }
      ClicarElemento $campoMensagem
      Start-Sleep -Milliseconds 150
      ColarTexto $Mensagem
      Start-Sleep -Milliseconds 250
      $colagens++
      if ($colagens -ge 2 -and -not $tela.msgNoCampo) { $passo = 'enviar' }
    }
    'enviar' {
      $ultimo = 'enviar'
      if ($tela.campoConhecido -and -not $tela.msgNoCampo) { $passo = 'colar'; continue }
      if ($tentativasEnvio -ge 2 -and -not $tela.msgNoCampo) { $enviou = $true; $passo = 'limpar'; continue }
      AtualizarTela
      $botao = AcharBotaoEnviar
      if ($botao) { ClicarElemento $botao } else { [System.Windows.Forms.SendKeys]::SendWait('{ENTER}') }
      $tentativasEnvio++
      Start-Sleep -Milliseconds 400
      $passo = 'conferir-envio'
    }
    'conferir-envio' {
      $ultimo = 'enviar'
      if ($tela.msgNoCampo -and $tentativasEnvio -lt 3) { $passo = 'enviar'; continue }
      if ($tela.msgNoCampo) { continue }
      $enviou = $true
      $passo = 'limpar'
    }
    'limpar' {
      $ultimo = 'limpar-pesquisa'
      LimparPesquisa
      Start-Sleep -Milliseconds 200
      $passo = 'conferir-limpeza'
    }
    'conferir-limpeza' {
      $ultimo = 'limpar-pesquisa'
      if ($tela.grupoNaPesquisa -or $tela.msgNaPesquisa) { $passo = 'limpar'; continue }
      $pesquisaLimpa = $true
    }
  }
}
} finally {
  UsarClipboard 'gravar' $clipboardOriginal | Out-Null
}

if (-not ($enviou -and $pesquisaLimpa)) {
  if ($enviou) { LimparPesquisa }
  $motivo = switch ($ultimo) {
    'abrir' { 'O WhatsApp nao abriu. Nada foi enviado.' }
    'pesquisar' { 'Parei na pesquisa do grupo. Nada foi enviado.' }
    'abrir-chat' { 'Parei antes de abrir o grupo. Nada foi enviado.' }
    'colar' { 'Parei em Digite uma mensagem. Nada foi enviado.' }
    'limpar-pesquisa' { 'A mensagem foi enviada, mas a pesquisa do grupo nao foi apagada.' }
    default { 'A sequencia parou antes de concluir. Nada foi enviado.' }
  }
  Emitir @{ ok = $false; aberto = $true; estado = $(if ($enviou) { 'falha_envio' } else { 'destinatario_nao_validado' }); motivo = $motivo }
  exit 3
}
Emitir @{ ok = $true; aberto = $true; estado = 'comando_executado'; titulo = $Grupo; motivo = 'Comando executado no WhatsApp. Entrega e leitura não foram comprovadas.' }
exit 0
