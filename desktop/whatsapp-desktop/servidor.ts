/**
 * Aplicativo local TM SEG. Escuta só em 127.0.0.1.
 * Não envia mensagem sem comando autenticado e destinatário confirmado.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarDestinatario, origemPermitida, PORTA_LOCAL, limparPesquisaEntreEnvios, decidirTesteHomologacao, lembrarDispositivo, VERSAO_CONECTOR, GRUPO_HOMOLOGACAO, MENSAGEM_TESTE_HOMOLOGACAO, dobrar } from '../../lib/whatsappDesktop/fila.ts';

const raiz = path.dirname(fileURLToPath(import.meta.url));

function acharArquivo(nome: string): string {
  const candidatos = [path.join(raiz, nome), path.join(raiz, '..', nome)];
  return candidatos.find((item) => fs.existsSync(item)) || candidatos[0];
}

function pastaDados(): string {
  return process.env.TMSEG_WA_HOME
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'TM SEG', 'WhatsApp Desktop');
}
function arquivoToken() { return path.join(pastaDados(), 'dispositivo.json'); }
function arquivoFeitos() { return path.join(pastaDados(), 'comandos.json'); }
function arquivoFila() { return path.join(pastaDados(), 'fila.lock'); }
function arquivoInstalacao() { return path.join(pastaDados(), 'instalacao.json'); }
function arquivoTeste() { return path.join(pastaDados(), 'teste-homologacao.json'); }

type EstadoComando = 'comando_executado' | 'falha_envio' | 'destinatario_nao_validado';
type Resultado = { id: string; estado: EstadoComando; motivo?: string };
type Driver = (grupo: string, texto: string) => Promise<Resultado>;

let pausado = false;
let parado = false;
let ocupado = false;

function garantirPasta() {
  fs.mkdirSync(pastaDados(), { recursive: true });
}

function lerToken(): string {
  try {
    return JSON.parse(fs.readFileSync(arquivoToken(), 'utf8')).token || '';
  } catch {
    return '';
  }
}

function gravarToken(token: string) {
  garantirPasta();
  fs.writeFileSync(arquivoToken(), JSON.stringify({ token, pareadoEm: new Date().toISOString() }));
}

function lerFeitos(): Record<string, Resultado> {
  try {
    return JSON.parse(fs.readFileSync(arquivoFeitos(), 'utf8'));
  } catch {
    return {};
  }
}

function gravarFeito(resultado: Resultado) {
  const feitos = lerFeitos();
  feitos[resultado.id] = resultado;
  garantirPasta();
  fs.writeFileSync(arquivoFeitos(), JSON.stringify(feitos));
}

function autorizado(req: http.IncomingMessage): boolean {
  const origem = req.headers.origin;
  if (origem && !origemPermitida(origem)) return false;
  const token = lerToken();
  if (!token) return false;
  const instalacao = lerJson(arquivoInstalacao());
  if (instalacao?.vinculado === false) return false;
  return req.headers.authorization === `Bearer ${token}`;
}

function cabecalhos(req: http.IncomingMessage): http.OutgoingHttpHeaders {
  const origem = String(req.headers.origin || '');
  const allow = origemPermitida(origem) ? origem : 'http://127.0.0.1';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function lerCorpo(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    const partes: Buffer[] = [];
    req.on('data', (parte) => partes.push(parte));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); }
      catch { resolve({}); }
    });
  });
}

export function driverSimulado(cenario: { titulo: string; candidatos: string[]; aberto?: boolean }): Driver {
  return async (grupo) => {
    if (cenario.aberto === false) return { id: '', estado: 'falha_envio', motivo: 'WhatsApp Desktop fechado.' };
    const conferencia = validarDestinatario({ esperado: grupo, tituloAberto: cenario.titulo, candidatos: cenario.candidatos });
    if (!conferencia.ok) return { id: '', estado: 'destinatario_nao_validado', motivo: conferencia.motivo };
    return { id: '', estado: 'comando_executado' };
  };
}

function lerJson(arquivo: string): any {
  try { return JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { return null; }
}

function garantirInstalacao(): { id: string; versao: string; preparado?: boolean; vinculado?: boolean; whatsappAutenticado?: boolean | null; preparadaEm?: string } {
  const atual = lerJson(arquivoInstalacao());
  if (atual?.id) return atual;
  const criada = { id: crypto.randomUUID(), versao: VERSAO_CONECTOR, criadaEm: new Date().toISOString(), preparado: false };
  garantirPasta();
  fs.writeFileSync(arquivoInstalacao(), JSON.stringify(criada));
  return criada;
}

function gravarInstalacao(parcial: Record<string, unknown>) {
  const atual = garantirInstalacao();
  const novo = { ...atual, ...parcial };
  garantirPasta();
  fs.writeFileSync(arquivoInstalacao(), JSON.stringify(novo));
  return novo;
}

function memoriaDispositivo() {
  const instalacao = lerJson(arquivoInstalacao());
  const teste = lerJson(arquivoTeste());
  const autenticado = instalacao?.whatsappAutenticado === true ? true : instalacao?.whatsappAutenticado === false ? false : null;
  const memoria = lembrarDispositivo({
    instalacaoId: instalacao?.id || null,
    preparado: instalacao?.preparado === true,
    vinculado: instalacao?.preparado === true && instalacao?.vinculado !== false && !!lerToken(),
    testeRegistrado: !!teste?.registrado,
    whatsappAutenticado: autenticado,
  });
  return { instalacao, teste, autenticado, memoria };
}

function origemDaRequisicao(req: http.IncomingMessage): boolean {
  const origem = req.headers.origin;
  if (!origem) return true;
  return origemPermitida(origem);
}

type InspecaoJanela = { candidatos?: string[]; titulo?: string; autenticado?: boolean | null; aberto?: boolean; motivo?: string };

function whatsappInstalado(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const saida = execFileSync('powershell.exe', ['-NoProfile', '-Command', "(Get-AppxPackage -Name '*WhatsApp*' | Measure-Object).Count"], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
    return Number(String(saida).trim()) > 0;
  } catch {
    return false;
  }
}

function prepararInicioAutomatico(): { criado: boolean; motivo: string } {
  const pasta = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  const destino = path.join(pasta, 'TM SEG WhatsApp.lnk');
  if (fs.existsSync(destino)) return { criado: false, motivo: 'A inicialização automática já estava configurada e foi preservada.' };
  const vbs = acharArquivo('Abrir instalador.vbs');
  const script = [
    '$atalho = New-Object -ComObject WScript.Shell',
    `$link = $atalho.CreateShortcut(${JSON.stringify(destino)})`,
    "$link.TargetPath = 'wscript.exe'",
    `$link.Arguments = '//B ${JSON.stringify(vbs)}'`,
    '$link.Save()',
  ].join('; ');
  execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 15000 });
  return { criado: fs.existsSync(destino), motivo: 'O conector foi autorizado a iniciar com o Windows.' };
}

function whatsappAberto(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const saida = execFileSync('powershell.exe', ['-NoProfile', '-Command', "@(Get-Process | Where-Object { $_.ProcessName -match 'WhatsApp' -and $_.MainWindowHandle -ne 0 }).Count"], { windowsHide: true, encoding: 'utf8' });
    return Number(String(saida).trim()) > 0;
  } catch {
    return false;
  }
}

function rodarPowerShell(acao: string, grupo = '', mensagem = ''): Promise<any> {
  return new Promise((resolve) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', acharArquivo('driver.ps1'), '-Acao', acao, '-Grupo', grupo, '-Mensagem', mensagem], { windowsHide: true });
    let saida = '';
    let falhou = false;
    proc.stdout.on('data', (parte) => { saida += parte.toString(); });
    proc.on('error', () => { falhou = true; resolve({ ok: false, aberto: false, motivo: 'O Windows não devolveu o resultado do WhatsApp.' }); });
    proc.on('close', () => {
      if (falhou) return;
      try { resolve(JSON.parse(saida || '{}')); }
      catch { resolve({ ok: false, motivo: 'O Windows não devolveu o resultado do WhatsApp.' }); }
    });
  });
}

function driverWindows(): Driver {
  return async (grupo, texto) => {
    const json = await rodarPowerShell('enviar', grupo, texto);
    if (json.estado === 'comando_executado' || json.estado === 'destinatario_nao_validado' || json.estado === 'falha_envio') {
      return { id: '', estado: json.estado, motivo: json.motivo };
    }
    return { id: '', estado: json.aberto === false ? 'falha_envio' : 'destinatario_nao_validado', motivo: json.motivo || 'Resposta inesperada do WhatsApp.' };
  };
}

async function executarFila(comandos: Array<{ id: string; groupName: string; text: string }>, driver: Driver): Promise<Resultado[]> {
  if (parado || pausado) return comandos.map((comando) => ({ id: comando.id, estado: 'falha_envio' as const, motivo: parado ? 'Aplicativo parado.' : 'Aplicativo pausado.' }));
  if (ocupado) return comandos.map((comando) => ({ id: comando.id, estado: 'falha_envio' as const, motivo: 'Já existe uma fila em execução neste computador.' }));
  ocupado = true;
  fs.writeFileSync(arquivoFila(), String(process.pid));
  const feitos = lerFeitos();
  const resultados: Resultado[] = [];
  const passos: string[] = [];
  try {
    for (const comando of comandos) {
      if (parado || pausado) {
        resultados.push({ id: comando.id, estado: 'falha_envio', motivo: 'Fila interrompida antes deste envio.' });
        continue;
      }
      const anterior = feitos[comando.id];
      if (anterior?.estado === 'comando_executado') {
        resultados.push(anterior);
        continue;
      }
      passos.push('pesquisar', 'enviar');
      const resultado = await driver(comando.groupName, comando.text);
      const gravado = { ...resultado, id: comando.id };
      gravarFeito(gravado);
      resultados.push(gravado);
    }
  } finally {
    ocupado = false;
    limparPesquisaEntreEnvios(passos);
    try { fs.unlinkSync(arquivoFila()); } catch { /* lock já liberado */ }
  }
  return resultados;
}

export function criarServidor(driver: Driver = driverWindows(), inspecionar?: () => Promise<InspecaoJanela>) {
  const lerJanela = inspecionar || (() => rodarPowerShell('inspecionar'));
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cabecalhos(req));
      res.end();
      return;
    }
    const enviar = (codigo: number, corpo: unknown) => {
      res.writeHead(codigo, cabecalhos(req));
      res.end(JSON.stringify(corpo));
    };
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(acharArquivo('assistente.html')));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/logo.png') {
      const logo = [path.resolve(raiz, '../../public/logo.png'), path.resolve(raiz, '../../../public/logo.png')].find((item) => fs.existsSync(item)) || '';
      if (!fs.existsSync(logo)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(fs.readFileSync(logo));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/health') {
      enviar(200, { ok: true, pareado: !!lerToken() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/identificar') {
      if (!origemDaRequisicao(req)) { enviar(403, { identificado: false, motivo: 'Origem não autorizada.' }); return; }
      const { instalacao, teste, autenticado, memoria } = memoriaDispositivo();
      const corpo: Record<string, unknown> = {
        ...memoria,
        instalacaoId: instalacao?.id || null,
        versao: instalacao?.versao || null,
        ultimoTeste: teste,
        whatsappAutenticado: autenticado,
      };
      if (memoria.preparado && memoria.vinculado) corpo.codigo = lerToken();
      enviar(200, corpo);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/dispositivo/preparar') {
      if (!origemDaRequisicao(req)) { enviar(403, { ok: false, motivo: 'Origem não autorizada.' }); return; }
      const instalacao = gravarInstalacao({ preparado: true, vinculado: true, preparadaEm: new Date().toISOString(), versao: VERSAO_CONECTOR });
      if (!lerToken()) gravarToken(crypto.randomBytes(18).toString('hex'));
      const { memoria, teste, autenticado } = memoriaDispositivo();
      enviar(200, { ok: true, ...memoria, instalacaoId: instalacao.id, versao: instalacao.versao, ultimoTeste: teste, whatsappAutenticado: autenticado, codigo: lerToken() });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/dispositivo/vincular') {
      if (!origemDaRequisicao(req)) { enviar(403, { ok: false, motivo: 'Origem não autorizada.' }); return; }
      const { memoria } = memoriaDispositivo();
      if (!memoria.preparado) { enviar(200, { ok: false, motivo: 'Este computador ainda não foi preparado.' }); return; }
      if (!lerToken()) gravarToken(crypto.randomBytes(18).toString('hex'));
      gravarInstalacao({ vinculado: true });
      const atual = memoriaDispositivo();
      enviar(200, { ok: true, ...atual.memoria, instalacaoId: atual.instalacao?.id, codigo: lerToken() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/pair/code') {
      let token = lerToken();
      if (!token) {
        token = crypto.randomBytes(18).toString('hex');
        gravarToken(token);
      }
      enviar(200, { codigo: token });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/install/check') {
      enviar(200, { mensagem: process.platform === 'win32' ? 'Windows detectado. A pasta do usuário pode receber o aplicativo.' : 'Este instalador é para Windows.' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/install/whatsapp') {
      const instalado = whatsappInstalado() || whatsappAberto();
      enviar(200, {
        instalado,
        canalOficial: 'https://www.whatsapp.com/download',
        mensagem: instalado
          ? 'O WhatsApp Desktop oficial está neste computador. Se a conta ainda não estiver conectada, use o QR Code na tela do próprio WhatsApp. Nenhuma senha é pedida aqui.'
          : 'O WhatsApp Desktop oficial ainda não foi encontrado. Abra o canal oficial, instale o aplicativo e conecte a conta pelo QR Code.',
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/install/mensagem') {
      enviar(200, { grupo: GRUPO_HOMOLOGACAO, mensagem: MENSAGEM_TESTE_HOMOLOGACAO });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/install/ping') {
      enviar(200, { mensagem: lerToken() ? 'Comunicação local autenticada pronta neste computador.' : 'Gere o código na etapa de vinculação.' });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/install/apply') {
      garantirPasta();
      const corpo = await lerCorpo(req);
      let inicio = { criado: false, motivo: 'A inicialização automática não foi autorizada.' };
      if (corpo?.autostart === true && process.platform === 'win32') inicio = prepararInicioAutomatico();
      enviar(200, { ok: true, pasta: pastaDados(), inicio });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      const instalacao = garantirInstalacao();
      const teste = lerJson(arquivoTeste());
      const aberto = whatsappAberto();
      if (!autorizado(req)) {
        enviar(401, { conectado: true, pareado: false, pausado, whatsappAberto: aberto, whatsappAutenticado: null, versao: instalacao.versao, instalacaoId: instalacao.id, ultimoTeste: teste, resultadoComunicacao: 'Pareamento necessário.' });
        return;
      }
      const { memoria, autenticado } = memoriaDispositivo();
      enviar(200, {
        conectado: true,
        pareado: true,
        pausado,
        whatsappAberto: aberto,
        whatsappAutenticado: autenticado,
        versao: VERSAO_CONECTOR,
        instalacaoId: instalacao.id,
        ultimoTeste: teste,
        resultadoComunicacao: memoria.identificado
          ? 'Computador preparado e reconhecido automaticamente.'
          : 'Conector local autenticado neste computador.',
        ...memoria,
      });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/unlink') {
      if (!autorizado(req)) { enviar(401, { motivo: 'Pareie este computador antes de desvincular.' }); return; }
      gravarInstalacao({ vinculado: false });
      enviar(200, { ok: true, pareado: false, preparado: true });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/update') {
      if (!autorizado(req)) { enviar(401, { motivo: 'Pareie este computador antes de atualizar.' }); return; }
      const instalacao = garantirInstalacao();
      instalacao.versao = VERSAO_CONECTOR;
      fs.writeFileSync(arquivoInstalacao(), JSON.stringify({ ...instalacao, atualizadoEm: new Date().toISOString() }));
      enviar(200, { ok: true, versao: VERSAO_CONECTOR, instalacaoId: instalacao.id });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/homologacao') {
      if (!autorizado(req)) { enviar(401, { motivo: 'Pareie este computador antes do teste.' }); return; }
      const corpo = await lerCorpo(req);
      const instalacao = garantirInstalacao();
      const teste = lerJson(arquivoTeste());
      const inspecao = await lerJanela();
      if (inspecao.aberto === true && inspecao.autenticado === false) gravarInstalacao({ whatsappAutenticado: false });
      if (inspecao.autenticado === true) gravarInstalacao({ whatsappAutenticado: true });
      if (inspecao.campoMensagem === false || inspecao.aberto === false) {
        enviar(200, {
          ok: false,
          motivo: 'O WhatsApp Desktop não mostrou o chat GRUPO TM SEG - ADM nem o campo de mensagem. Abra esse grupo no aplicativo oficial e autorize o teste outra vez. Nada foi enviado.',
          instalacaoId: instalacao.id,
          entrega: null,
          whatsappAutenticado: false,
        });
        return;
      }
      const candidatos = Array.isArray(inspecao.candidatos) ? inspecao.candidatos.map(String) : [];
      const titulo = dobrar(inspecao.titulo) === dobrar(GRUPO_HOMOLOGACAO) ? GRUPO_HOMOLOGACAO : '';
      const decisao = decidirTesteHomologacao({
        autorizar: corpo?.autorizar === true,
        tituloAberto: titulo,
        candidatos,
        testeJaRegistrado: !!teste?.registrado,
      });
      if (!decisao.enviar) {
        enviar(200, { ok: false, motivo: decisao.motivo, instalacaoId: instalacao.id, entrega: null, whatsappAutenticado: inspecao.autenticado ?? null });
        return;
      }
      const resultado = await driver(GRUPO_HOMOLOGACAO, MENSAGEM_TESTE_HOMOLOGACAO);
      const registro = {
        registrado: resultado.estado === 'comando_executado',
        instalacaoId: instalacao.id,
        em: new Date().toISOString(),
        estado: resultado.estado,
        motivo: resultado.motivo || decisao.motivo,
        entrega: null,
      };
      if (registro.registrado) fs.writeFileSync(arquivoTeste(), JSON.stringify(registro));
      enviar(200, { ok: registro.registrado, ...registro });
      return;
    }
    if (!autorizado(req)) { enviar(401, { motivo: 'Pareie este computador antes de enviar comandos.' }); return; }
    if (req.method === 'POST' && url.pathname === '/pause') { pausado = true; enviar(200, { pausado: true }); return; }
    if (req.method === 'POST' && url.pathname === '/resume') { pausado = false; parado = false; enviar(200, { pausado: false }); return; }
    if (req.method === 'POST' && url.pathname === '/stop') { parado = true; pausado = true; enviar(200, { parado: true }); return; }
    if (req.method === 'POST' && url.pathname === '/commands') {
      const corpo = await lerCorpo(req);
      const comandos = Array.isArray(corpo.commands) ? corpo.commands : [];
      const resultados = await executarFila(comandos, driver);
      enviar(200, { resultados });
      return;
    }
    enviar(404, { motivo: 'Rota inexistente.' });
  });
}

const executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  criarServidor().listen(PORTA_LOCAL, '127.0.0.1', () => {
    console.log(`TM SEG WhatsApp Desktop em http://127.0.0.1:${PORTA_LOCAL}`);
  });
}
