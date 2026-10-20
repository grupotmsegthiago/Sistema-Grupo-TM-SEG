/**
 * Aplicativo local TM SEG. Escuta só em 127.0.0.1.
 * Não envia mensagem sem comando autenticado e destinatário confirmado.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarDestinatario, origemPermitida, PORTA_LOCAL, limparPesquisaEntreEnvios } from '../../lib/whatsappDesktop/fila.ts';

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

function driverWindows(): Driver {
  return (grupo, texto) => new Promise((resolve) => {
    const script = acharArquivo('driver.ps1');
    const proc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Acao', 'enviar', '-Grupo', grupo, '-Mensagem', texto], { windowsHide: true });
    let saida = '';
    proc.stdout.on('data', (parte) => { saida += parte.toString(); });
    proc.on('close', () => {
      try {
        const json = JSON.parse(saida || '{}');
        if (json.estado === 'comando_executado' || json.estado === 'destinatario_nao_validado' || json.estado === 'falha_envio') {
          resolve({ id: '', estado: json.estado, motivo: json.motivo });
          return;
        }
        resolve({ id: '', estado: json.aberto === false ? 'falha_envio' : 'destinatario_nao_validado', motivo: json.motivo || 'Resposta inesperada do WhatsApp.' });
      } catch {
        resolve({ id: '', estado: 'falha_envio', motivo: 'O Windows não devolveu o resultado do WhatsApp.' });
      }
    });
  });
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

export function criarServidor(driver: Driver = driverWindows()) {
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
      enviar(200, { mensagem: 'A detecção definitiva acontece no envio. Se o WhatsApp estiver fechado, o lote fica pendente e nada é marcado como enviado.' });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/install/ping') {
      enviar(200, { mensagem: lerToken() ? 'Comunicação local autenticada pronta neste computador.' : 'Gere o código na etapa de vinculação.' });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/install/apply') {
      garantirPasta();
      enviar(200, { ok: true, pasta: pastaDados() });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      if (!autorizado(req)) { enviar(401, { conectado: true, pareado: false, pausado, whatsappAberto: false }); return; }
      enviar(200, { conectado: true, pareado: true, pausado, whatsappAberto: true });
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
