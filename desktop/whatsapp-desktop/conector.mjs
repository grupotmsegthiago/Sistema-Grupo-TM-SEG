// desktop/whatsapp-desktop/servidor.ts
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// lib/dhlAutoTableSelector.ts
var DHL_CLIENT_NAME = "DHL SUPPLY CHAIN (BRAZIL) LTDA";
var DHL_AUTO_CLIENT_NAMES = [
  DHL_CLIENT_NAME,
  "DHL EXPRESS BRAZIL LTDA",
  "DHL GLOBAL FORWARDING (BRAZIL) LTDA",
  "DHL LOGISTICS (BRASIL) LTDA"
];
var normalize = (s) => {
  if (!s) return "";
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
};
var NORMALIZED_DHL_CLIENTS = new Map(
  DHL_AUTO_CLIENT_NAMES.map((name) => [normalize(name), name])
);

// lib/financialUtils.ts
var UF_TO_REGION = {
  "SP": "SUDESTE",
  "RJ": "SUDESTE",
  "MG": "SUDESTE",
  "ES": "SUDESTE",
  "DF": "CENTRO-OESTE",
  "GO": "CENTRO-OESTE",
  "MT": "CENTRO-OESTE",
  "MS": "CENTRO-OESTE",
  "PR": "SUL",
  "SC": "SUL",
  "RS": "SUL",
  "BA": "NORDESTE",
  "PE": "NORDESTE",
  "CE": "NORDESTE",
  "RN": "NORDESTE",
  "PB": "NORDESTE",
  "AL": "NORDESTE",
  "SE": "NORDESTE",
  "PI": "NORDESTE",
  "MA": "NORDESTE",
  "AM": "NORTE",
  "PA": "NORTE",
  "AC": "NORTE",
  "RO": "NORTE",
  "RR": "NORTE",
  "AP": "NORTE",
  "TO": "NORTE"
};

// lib/providerOperatingCoverage.ts
var REGION_ORDER = ["SUDESTE", "SUL", "CENTRO-OESTE", "NORDESTE", "NORTE"];
var UF_NAME = {
  SP: "S\xE3o Paulo",
  RJ: "Rio de Janeiro",
  MG: "Minas Gerais",
  ES: "Esp\xEDrito Santo",
  DF: "Distrito Federal",
  GO: "Goi\xE1s",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  PR: "Paran\xE1",
  SC: "Santa Catarina",
  RS: "Rio Grande do Sul",
  BA: "Bahia",
  PE: "Pernambuco",
  CE: "Cear\xE1",
  RN: "Rio Grande do Norte",
  PB: "Para\xEDba",
  AL: "Alagoas",
  SE: "Sergipe",
  PI: "Piau\xED",
  MA: "Maranh\xE3o",
  AM: "Amazonas",
  PA: "Par\xE1",
  AC: "Acre",
  RO: "Rond\xF4nia",
  RR: "Roraima",
  AP: "Amap\xE1",
  TO: "Tocantins"
};
var COVERAGE_UFS = Object.keys(UF_TO_REGION).map((uf) => ({
  uf,
  name: UF_NAME[uf] || uf,
  region: UF_TO_REGION[uf] || "SUDESTE"
}));
var COVERAGE_UFS_BY_REGION = REGION_ORDER.map((region) => ({
  region,
  ufs: COVERAGE_UFS.filter((item) => item.region === region)
}));

// lib/providerActivationRanking.ts
var UF_LABEL = {
  SP: "S\xE3o Paulo",
  RJ: "Rio de Janeiro",
  MG: "Minas Gerais",
  ES: "Esp\xEDrito Santo",
  DF: "Distrito Federal",
  GO: "Goi\xE1s",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  PR: "Paran\xE1",
  SC: "Santa Catarina",
  RS: "Rio Grande do Sul",
  BA: "Bahia",
  PE: "Pernambuco",
  CE: "Cear\xE1",
  RN: "Rio Grande do Norte",
  PB: "Para\xEDba",
  AL: "Alagoas",
  SE: "Sergipe",
  PI: "Piau\xED",
  MA: "Maranh\xE3o",
  AM: "Amazonas",
  PA: "Par\xE1",
  AC: "Acre",
  RO: "Rond\xF4nia",
  RR: "Roraima",
  AP: "Amap\xE1",
  TO: "Tocantins"
};
function stripAccents(value) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normKey(value) {
  return stripAccents(value).toUpperCase().replace(/\s+/g, " ").trim();
}

// lib/solicitacaoEscolta/regras.ts
var INTERVALO_FILA_MS = 5 * 60 * 1e3;
var UFS = Object.keys(UF_LABEL);
var CIDADES_EXTRAS = [
  ["RIO DE JANEIRO", "RJ"],
  ["SAO PAULO", "SP"],
  ["BELO HORIZONTE", "MG"],
  ["DUQUE DE CAXIAS", "RJ"],
  ["NOVA IGUACU", "RJ"],
  ["SAO GONCALO", "RJ"],
  ["NITEROI", "RJ"],
  ["CAMPINAS", "SP"],
  ["GUARULHOS", "SP"],
  ["SANTOS", "SP"],
  ["SAO JOSE DOS CAMPOS", "SP"],
  ["JUNDIAI", "SP"],
  ["CAJAMAR", "SP"],
  ["CONTAGEM", "MG"],
  ["BETIM", "MG"],
  ["CURITIBA", "PR"],
  ["PORTO ALEGRE", "RS"],
  ["FLORIANOPOLIS", "SC"],
  ["JOINVILLE", "SC"],
  ["ITAJAI", "SC"],
  ["BRASILIA", "DF"],
  ["GOIANIA", "GO"],
  ["CAMPO GRANDE", "MS"],
  ["CUIABA", "MT"],
  ["SALVADOR", "BA"],
  ["RECIFE", "PE"],
  ["FORTALEZA", "CE"],
  ["MANAUS", "AM"]
];
var CIDADES = [
  ...Object.entries(UF_LABEL).map(([uf, nome]) => ({ chave: normKey(nome), uf, rotulo: nome })),
  ...CIDADES_EXTRAS.map(([chave, uf]) => ({
    chave,
    uf,
    rotulo: chave.replace(/\b\w/g, (letra) => letra.toUpperCase())
  }))
].sort((a, b) => b.chave.length - a.chave.length);

// lib/whatsappDesktop/fila.ts
var PORTA_LOCAL = 47321;
var ORIGEM_LOCAL = `http://127.0.0.1:${PORTA_LOCAL}`;
var VERSAO_CONECTOR = "1.1.0";
var GRUPO_HOMOLOGACAO = "GRUPO TM SEG - ADM";
var MENSAGEM_TESTE_HOMOLOGACAO = [
  "\u{1F6E1}\uFE0F GRUPO TM SEG | ATIVA\xC7\xC3O CONCLU\xCDDA",
  "",
  "\u2705 Instala\xE7\xE3o e configura\xE7\xE3o realizadas com sucesso!",
  "",
  "Meu computador foi preparado para utilizar a integra\xE7\xE3o oficial do Sistema Grupo TM SEG com o WhatsApp Desktop.",
  "",
  "\u{1F539} Aplicativo TM SEG instalado",
  "\u{1F539} WhatsApp Desktop configurado",
  "\u{1F539} Comunica\xE7\xE3o com o sistema estabelecida",
  "\u{1F539} Teste de envio autom\xE1tico realizado",
  "",
  "\u{1F680} Estou apto(a) para iniciar as atividades automatizadas do Grupo TM SEG!",
  "",
  "\u{1F4BB} Sistema Grupo TM SEG",
  "Tecnologia, integra\xE7\xE3o e efici\xEAncia operacional."
].join("\n");
function dobrar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}
function validarDestinatario(entrada) {
  const esperado = dobrar(entrada.esperado);
  if (!esperado) return { ok: false, motivo: "Grupo sem nome exato cadastrado." };
  const exatos = entrada.candidatos.map(dobrar).filter((nome) => nome === esperado);
  if (exatos.length !== 1) {
    return {
      ok: false,
      motivo: exatos.length === 0 ? "Nenhum resultado da pesquisa corresponde ao nome exato do grupo." : "Mais de um resultado tem o mesmo nome. O envio foi bloqueado."
    };
  }
  const titulo = dobrar(entrada.tituloAberto);
  if (titulo !== esperado) {
    return { ok: false, motivo: "O chat aberto n\xE3o \xE9 o grupo associado. O envio foi bloqueado." };
  }
  return { ok: true, nome: esperado };
}
function origemPermitida(origem) {
  if (!origem) return false;
  try {
    const url = new URL(origem);
    if (url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")) return true;
    if (url.protocol !== "https:") return false;
    return url.hostname === "sistema.grupotmseg.com.br" || url.hostname === "sistema-grupo-tm-seg.vercel.app" || url.hostname.endsWith(".vercel.app") && url.hostname.startsWith("sistema-grupo-tm-seg");
  } catch {
    return false;
  }
}
function lembrarDispositivo(entrada) {
  const preparado = !!entrada.instalacaoId && entrada.preparado;
  const vinculado = preparado && entrada.vinculado;
  const precisaReautenticar = preparado && entrada.whatsappAutenticado === false;
  return {
    identificado: vinculado && !precisaReautenticar,
    preparado,
    vinculado,
    repetirInstalacao: !preparado,
    repetirQr: !preparado || precisaReautenticar,
    repetirTeste: !preparado && !entrada.testeRegistrado,
    precisaReautenticar
  };
}
function decidirTesteHomologacao(entrada) {
  const base = { mensagem: MENSAGEM_TESTE_HOMOLOGACAO, grupo: GRUPO_HOMOLOGACAO };
  if (entrada.testeJaRegistrado) {
    return { ...base, enviar: false, motivo: "Este computador j\xE1 registrou o teste de ativa\xE7\xE3o. O reenvio foi bloqueado." };
  }
  if (!entrada.autorizar) {
    return { ...base, enviar: false, motivo: "O teste s\xF3 segue depois de uma autoriza\xE7\xE3o expl\xEDcita." };
  }
  const conferencia = validarDestinatario({
    esperado: GRUPO_HOMOLOGACAO,
    tituloAberto: entrada.tituloAberto,
    candidatos: entrada.candidatos
  });
  if (!conferencia.ok) return { ...base, enviar: false, motivo: conferencia.motivo };
  return { ...base, enviar: true, motivo: "Destinat\xE1rio confirmado. O comando pode ser executado uma vez." };
}
function limparPesquisaEntreEnvios(passos) {
  const saida = [];
  for (let i = 0; i < passos.length; i++) {
    saida.push(passos[i]);
    const enviou = passos[i] === "enviar";
    const proximo = passos[i + 1];
    if (enviou && proximo === "pesquisar") saida.push("limpar-pesquisa");
  }
  return saida;
}

// lib/whatsappDesktop/componentesInstalador.ts
var COMPONENTES_INSTALADOR = [
  {
    id: "node",
    nome: "Node.js",
    pacote: "OpenJS.NodeJS.LTS",
    motivo: "Executa o conector do Grupo TM SEG neste computador."
  },
  {
    id: "python",
    nome: "Python",
    pacote: "Python.Python.3.12",
    motivo: "Fica instalado para os programas do Grupo TM SEG."
  },
  {
    id: "whatsapp",
    nome: "WhatsApp",
    pacote: "WhatsApp.WhatsApp",
    motivo: "Aplicativo oficial usado pela integra\xE7\xE3o."
  }
];
function argumentosWinget(pacote) {
  return [
    "install",
    "--id",
    pacote,
    "-e",
    "--scope",
    "user",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--disable-interactivity"
  ];
}
function componentePorId(id) {
  return COMPONENTES_INSTALADOR.find((item) => item.id === id) || null;
}
function resumoInstalacao(estado) {
  const faltam = COMPONENTES_INSTALADOR.filter((item) => !estado[item.id]).map((item) => item.nome);
  if (faltam.length === 0) return "Node.js, Python e WhatsApp j\xE1 est\xE3o neste computador.";
  return `Faltam: ${faltam.join(", ")}. Avance para instalar e configurar.`;
}

// desktop/whatsapp-desktop/servidor.ts
var raiz = path.dirname(fileURLToPath(import.meta.url));
function acharArquivo(nome) {
  const candidatos = [path.join(raiz, nome), path.join(raiz, "..", nome)];
  return candidatos.find((item) => fs.existsSync(item)) || candidatos[0];
}
function pastaDados() {
  return process.env.TMSEG_WA_HOME || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "TM SEG", "WhatsApp Desktop");
}
function arquivoToken() {
  return path.join(pastaDados(), "dispositivo.json");
}
function arquivoFeitos() {
  return path.join(pastaDados(), "comandos.json");
}
function arquivoFila() {
  return path.join(pastaDados(), "fila.lock");
}
function arquivoInstalacao() {
  return path.join(pastaDados(), "instalacao.json");
}
function arquivoTeste() {
  return path.join(pastaDados(), "teste-homologacao.json");
}
var pausado = false;
var parado = false;
var ocupado = false;
function garantirPasta() {
  fs.mkdirSync(pastaDados(), { recursive: true });
}
function lerToken() {
  try {
    return JSON.parse(fs.readFileSync(arquivoToken(), "utf8")).token || "";
  } catch {
    return "";
  }
}
function gravarToken(token) {
  garantirPasta();
  fs.writeFileSync(arquivoToken(), JSON.stringify({ token, pareadoEm: (/* @__PURE__ */ new Date()).toISOString() }));
}
function lerFeitos() {
  try {
    return JSON.parse(fs.readFileSync(arquivoFeitos(), "utf8"));
  } catch {
    return {};
  }
}
function gravarFeito(resultado) {
  const feitos = lerFeitos();
  feitos[resultado.id] = resultado;
  garantirPasta();
  fs.writeFileSync(arquivoFeitos(), JSON.stringify(feitos));
}
function autorizado(req) {
  const origem = req.headers.origin;
  if (origem && !origemPermitida(origem)) return false;
  const token = lerToken();
  if (!token) return false;
  const instalacao = lerJson(arquivoInstalacao());
  if (instalacao?.vinculado === false) return false;
  return req.headers.authorization === `Bearer ${token}`;
}
function cabecalhos(req) {
  const origem = String(req.headers.origin || "");
  const allow = origemPermitida(origem) ? origem : "http://127.0.0.1";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Content-Type": "application/json; charset=utf-8"
  };
}
function lerCorpo(req) {
  return new Promise((resolve) => {
    const partes = [];
    req.on("data", (parte) => partes.push(parte));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(partes).toString("utf8") || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
function driverSimulado(cenario) {
  return async (grupo) => {
    if (cenario.aberto === false) return { id: "", estado: "falha_envio", motivo: "WhatsApp Desktop fechado." };
    const conferencia = validarDestinatario({ esperado: grupo, tituloAberto: cenario.titulo, candidatos: cenario.candidatos });
    if (!conferencia.ok) return { id: "", estado: "destinatario_nao_validado", motivo: conferencia.motivo };
    return { id: "", estado: "comando_executado" };
  };
}
function lerJson(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    return null;
  }
}
function garantirInstalacao() {
  const atual = lerJson(arquivoInstalacao());
  if (atual?.id) return atual;
  const criada = { id: crypto.randomUUID(), versao: VERSAO_CONECTOR, criadaEm: (/* @__PURE__ */ new Date()).toISOString(), preparado: false };
  garantirPasta();
  fs.writeFileSync(arquivoInstalacao(), JSON.stringify(criada));
  return criada;
}
function gravarInstalacao(parcial) {
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
    whatsappAutenticado: autenticado
  });
  return { instalacao, teste, autenticado, memoria };
}
function origemDaRequisicao(req) {
  const origem = req.headers.origin;
  if (!origem) return true;
  return origemPermitida(origem);
}
function whatsappInstalado() {
  if (process.platform !== "win32") return false;
  try {
    const saida = execFileSync("powershell.exe", ["-NoProfile", "-Command", "(Get-AppxPackage -Name '*WhatsApp*' | Measure-Object).Count"], { windowsHide: true, encoding: "utf8", timeout: 15e3 });
    return Number(String(saida).trim()) > 0;
  } catch {
    return false;
  }
}
function prepararInicioAutomatico() {
  const pasta = path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const destino = path.join(pasta, "TM SEG WhatsApp.lnk");
  if (fs.existsSync(destino)) return { criado: false, motivo: "A inicializa\xE7\xE3o autom\xE1tica j\xE1 estava configurada e foi preservada." };
  const vbs = acharArquivo("Abrir instalador.vbs");
  const script = [
    "$atalho = New-Object -ComObject WScript.Shell",
    `$link = $atalho.CreateShortcut(${JSON.stringify(destino)})`,
    "$link.TargetPath = 'wscript.exe'",
    `$link.Arguments = '//B ${JSON.stringify(vbs)}'`,
    "$link.Save()"
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true, timeout: 15e3 });
  return { criado: fs.existsSync(destino), motivo: "O conector foi autorizado a iniciar com o Windows." };
}
function programaExiste(comando) {
  try {
    execFileSync(process.platform === "win32" ? "where.exe" : "which", [comando], { stdio: "ignore", timeout: 8e3 });
    return true;
  } catch {
    return false;
  }
}
function arquivoEm(candidatos) {
  return candidatos.some((item) => item && fs.existsSync(item));
}
function detectarComponentes() {
  const local = process.env.LOCALAPPDATA || "";
  const programas = process.env.ProgramFiles || "";
  const node = process.platform === "win32" ? arquivoEm([path.join(programas, "nodejs", "node.exe"), path.join(local, "Programs", "nodejs", "node.exe")]) || programaExiste("node") : true;
  const pythonNoDisco = arquivoEm([
    path.join(local, "Programs", "Python", "Python312", "python.exe"),
    path.join(local, "Programs", "Python", "Python313", "python.exe"),
    path.join(programas, "Python312", "python.exe")
  ]);
  let python = pythonNoDisco;
  if (!python && process.platform === "win32") {
    try {
      const saida = execFileSync("py", ["-3", "-c", "import sys; print(sys.executable)"], { encoding: "utf8", timeout: 8e3, windowsHide: true });
      const exe = String(saida).toLowerCase();
      python = exe.includes("python") && !exe.includes("windowsapps");
    } catch {
      python = false;
    }
  }
  if (!python && process.platform !== "win32") python = programaExiste("python3") || programaExiste("python");
  return { node, python, whatsapp: whatsappInstalado() || whatsappAberto() };
}
function instalarComWinget(id) {
  const item = componentePorId(id);
  if (!item) return Promise.resolve({ ok: false, motivo: "Componente desconhecido." });
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, motivo: "A instala\xE7\xE3o autom\xE1tica dos aplicativos \xE9 feita no Windows." });
  }
  return new Promise((resolve) => {
    const proc = spawn("winget", argumentosWinget(item.pacote), { windowsHide: false });
    let saida = "";
    let resolvido = false;
    let timer;
    const terminar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      clearTimeout(timer);
      resolve(valor);
    };
    timer = setTimeout(() => {
      proc.kill();
      terminar({ ok: false, motivo: `${item.nome} demorou demais para instalar.` });
    }, 10 * 60 * 1e3);
    proc.stdout.on("data", (parte) => {
      saida += parte.toString();
    });
    proc.stderr.on("data", (parte) => {
      saida += parte.toString();
    });
    proc.on("error", () => {
      terminar({ ok: false, motivo: `O Windows n\xE3o encontrou o winget para instalar ${item.nome}.` });
    });
    proc.on("close", (code) => {
      const texto = saida.toLowerCase();
      const jaEstava = texto.includes("already installed") || texto.includes("j\xE1 instalado") || texto.includes("no available upgrade");
      if (code === 0 || jaEstava || detectarComponentes()[id]) {
        terminar({ ok: true, motivo: `${item.nome} instalado.` });
        return;
      }
      terminar({ ok: false, motivo: `${item.nome} n\xE3o foi instalado. ${saida}`.trim().slice(0, 400) });
    });
  });
}
function abrirWhatsApp() {
  if (process.platform !== "win32") return { ok: false, motivo: "O WhatsApp abre no Windows." };
  try {
    spawn("cmd.exe", ["/c", "start", "", "whatsapp:"], { windowsHide: true, detached: true, stdio: "ignore" }).unref();
    return { ok: true, motivo: "O WhatsApp foi aberto para a conta ser conectada pelo QR Code, se ainda n\xE3o estiver." };
  } catch {
    return { ok: false, motivo: "N\xE3o foi poss\xEDvel abrir o WhatsApp." };
  }
}
function whatsappAberto() {
  if (process.platform !== "win32") return false;
  try {
    const saida = execFileSync("powershell.exe", ["-NoProfile", "-Command", "@(Get-Process | Where-Object { $_.ProcessName -match 'WhatsApp' -and $_.MainWindowHandle -ne 0 }).Count"], { windowsHide: true, encoding: "utf8" });
    return Number(String(saida).trim()) > 0;
  } catch {
    return false;
  }
}
function rodarPowerShell(acao, grupo = "", mensagem = "") {
  return new Promise((resolve) => {
    const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", acharArquivo("driver.ps1"), "-Acao", acao, "-Grupo", grupo, "-Mensagem", mensagem], { windowsHide: true });
    let saida = "";
    let erro = "";
    let falhou = false;
    const texto = (parte) => parte.toString("utf8").replace(/\u0000/g, "").trim();
    proc.stdout.on("data", (parte) => {
      saida += texto(parte);
    });
    proc.stderr.on("data", (parte) => {
      erro += texto(parte);
    });
    proc.on("error", () => {
      falhou = true;
      resolve({ ok: false, aberto: false, estado: "falha_envio", motivo: "O Windows n\xE3o devolveu o resultado do WhatsApp." });
    });
    proc.on("close", () => {
      if (falhou) return;
      const bruto = saida.trim();
      const inicio = bruto.lastIndexOf("{");
      const fim = bruto.lastIndexOf("}");
      let json = null;
      if (inicio >= 0 && fim > inicio) {
        try {
          json = JSON.parse(bruto.slice(inicio, fim + 1));
        } catch {
          json = null;
        }
      }
      if (!json || !json.estado) {
        const detalhe = (json?.motivo || erro || bruto || "O Windows n\xE3o devolveu o resultado do WhatsApp.").replace(/\s+/g, " ").slice(0, 400);
        resolve({ ok: false, aberto: json?.aberto !== false, estado: "falha_envio", motivo: detalhe });
        return;
      }
      resolve(json);
    });
  });
}
function driverWindows() {
  return async (grupo, texto) => {
    const json = await rodarPowerShell("enviar", grupo, texto);
    if (json.estado === "comando_executado" || json.estado === "destinatario_nao_validado" || json.estado === "falha_envio") {
      return { id: "", estado: json.estado, motivo: json.motivo };
    }
    const detalhe = json.motivo || (typeof json === "string" ? json : JSON.stringify(json));
    return { id: "", estado: json.aberto === false ? "falha_envio" : "falha_envio", motivo: String(detalhe || "O Windows n\xE3o devolveu o resultado do WhatsApp.").slice(0, 400) };
  };
}
async function executarFila(comandos, driver) {
  if (parado || pausado) return comandos.map((comando) => ({ id: comando.id, estado: "falha_envio", motivo: parado ? "Aplicativo parado." : "Aplicativo pausado." }));
  if (ocupado) return comandos.map((comando) => ({ id: comando.id, estado: "falha_envio", motivo: "J\xE1 existe uma fila em execu\xE7\xE3o neste computador." }));
  ocupado = true;
  fs.writeFileSync(arquivoFila(), String(process.pid));
  const feitos = lerFeitos();
  const resultados = [];
  const passos = [];
  try {
    for (const comando of comandos) {
      if (parado || pausado) {
        resultados.push({ id: comando.id, estado: "falha_envio", motivo: "Fila interrompida antes deste envio." });
        continue;
      }
      const anterior = feitos[comando.id];
      if (anterior?.estado === "comando_executado") {
        resultados.push(anterior);
        continue;
      }
      passos.push("abrir", "limpar", "pesquisar", "colar", "enviar", "limpar");
      const resultado = await driver(comando.groupName, comando.text);
      const gravado = { ...resultado, id: comando.id };
      gravarFeito(gravado);
      resultados.push(gravado);
    }
  } finally {
    ocupado = false;
    limparPesquisaEntreEnvios(passos);
    try {
      fs.unlinkSync(arquivoFila());
    } catch {
    }
  }
  return resultados;
}
function criarServidor(driver = driverWindows(), inspecionar, instalador) {
  const lerJanela = inspecionar || (() => rodarPowerShell("inspecionar"));
  const detectar = instalador?.detectar || detectarComponentes;
  const instalar = instalador?.instalar || instalarComWinget;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "OPTIONS") {
      res.writeHead(204, cabecalhos(req));
      res.end();
      return;
    }
    const enviar = (codigo, corpo) => {
      res.writeHead(codigo, cabecalhos(req));
      res.end(JSON.stringify(corpo));
    };
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(acharArquivo("assistente.html")));
      return;
    }
    if (req.method === "GET" && url.pathname === "/logo.png") {
      const logo = [path.join(raiz, "logo.png"), path.resolve(raiz, "../../public/logo.png"), path.resolve(raiz, "../../../public/logo.png")].find((item) => fs.existsSync(item)) || "";
      if (!fs.existsSync(logo)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(fs.readFileSync(logo));
      return;
    }
    if (req.method === "GET" && url.pathname === "/health") {
      enviar(200, { ok: true, pareado: !!lerToken() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/identificar") {
      if (!origemDaRequisicao(req)) {
        enviar(403, { identificado: false, motivo: "Origem n\xE3o autorizada." });
        return;
      }
      const { instalacao, teste, autenticado, memoria } = memoriaDispositivo();
      const corpo = {
        ...memoria,
        instalacaoId: instalacao?.id || null,
        versao: instalacao?.versao || null,
        ultimoTeste: teste,
        whatsappAutenticado: autenticado
      };
      if (memoria.preparado && memoria.vinculado) corpo.codigo = lerToken();
      enviar(200, corpo);
      return;
    }
    if (req.method === "POST" && url.pathname === "/dispositivo/preparar") {
      if (!origemDaRequisicao(req)) {
        enviar(403, { ok: false, motivo: "Origem n\xE3o autorizada." });
        return;
      }
      const instalacao = gravarInstalacao({ preparado: true, vinculado: true, preparadaEm: (/* @__PURE__ */ new Date()).toISOString(), versao: VERSAO_CONECTOR });
      if (!lerToken()) gravarToken(crypto.randomBytes(18).toString("hex"));
      const { memoria, teste, autenticado } = memoriaDispositivo();
      enviar(200, { ok: true, ...memoria, instalacaoId: instalacao.id, versao: instalacao.versao, ultimoTeste: teste, whatsappAutenticado: autenticado, codigo: lerToken() });
      return;
    }
    if (req.method === "POST" && url.pathname === "/dispositivo/vincular") {
      if (!origemDaRequisicao(req)) {
        enviar(403, { ok: false, motivo: "Origem n\xE3o autorizada." });
        return;
      }
      const { memoria } = memoriaDispositivo();
      if (!memoria.preparado) {
        enviar(200, { ok: false, motivo: "Este computador ainda n\xE3o foi preparado." });
        return;
      }
      if (!lerToken()) gravarToken(crypto.randomBytes(18).toString("hex"));
      gravarInstalacao({ vinculado: true });
      const atual = memoriaDispositivo();
      enviar(200, { ok: true, ...atual.memoria, instalacaoId: atual.instalacao?.id, codigo: lerToken() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/pair/code") {
      let token = lerToken();
      if (!token) {
        token = crypto.randomBytes(18).toString("hex");
        gravarToken(token);
      }
      enviar(200, { codigo: token });
      return;
    }
    if (req.method === "GET" && url.pathname === "/install/check") {
      const estado = detectar();
      const componentes = COMPONENTES_INSTALADOR.map((item) => ({ ...item, instalado: estado[item.id] }));
      enviar(200, {
        mensagem: process.platform === "win32" || instalador?.detectar ? resumoInstalacao(estado) : "Este instalador \xE9 para Windows.",
        componentes
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/install/componente") {
      const corpo = await lerCorpo(req);
      const item = componentePorId(String(corpo?.id || ""));
      if (!item) {
        enviar(400, { ok: false, motivo: "Componente desconhecido." });
        return;
      }
      if (detectar()[item.id]) {
        enviar(200, { ok: true, id: item.id, motivo: `${item.nome} j\xE1 estava instalado.` });
        return;
      }
      const resultado = await instalar(item.id);
      enviar(200, { ok: resultado.ok, id: item.id, motivo: resultado.motivo });
      return;
    }
    if (req.method === "POST" && url.pathname === "/install/whatsapp/abrir") {
      enviar(200, abrirWhatsApp());
      return;
    }
    if (req.method === "GET" && url.pathname === "/install/whatsapp") {
      const instalado = detectar().whatsapp;
      enviar(200, {
        instalado,
        canalOficial: "https://www.whatsapp.com/download",
        mensagem: instalado ? "O WhatsApp oficial est\xE1 neste computador. Se a conta ainda n\xE3o estiver conectada, use o QR Code na tela do pr\xF3prio WhatsApp. Nenhuma senha \xE9 pedida aqui." : "O WhatsApp ainda n\xE3o foi instalado. Volte um passo e avance de novo para o assistente instalar o aplicativo oficial."
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/install/mensagem") {
      enviar(200, { grupo: GRUPO_HOMOLOGACAO, mensagem: MENSAGEM_TESTE_HOMOLOGACAO });
      return;
    }
    if (req.method === "GET" && url.pathname === "/install/ping") {
      enviar(200, { mensagem: lerToken() ? "Comunica\xE7\xE3o local autenticada pronta neste computador." : "Gere o c\xF3digo na etapa de vincula\xE7\xE3o." });
      return;
    }
    if (req.method === "POST" && url.pathname === "/install/apply") {
      garantirPasta();
      const corpo = await lerCorpo(req);
      let inicio = { criado: false, motivo: "A inicializa\xE7\xE3o autom\xE1tica n\xE3o foi autorizada." };
      if (corpo?.autostart === true && process.platform === "win32") inicio = prepararInicioAutomatico();
      enviar(200, { ok: true, pasta: pastaDados(), inicio });
      return;
    }
    if (req.method === "GET" && url.pathname === "/status") {
      const instalacao = garantirInstalacao();
      const teste = lerJson(arquivoTeste());
      const aberto = whatsappAberto();
      if (!autorizado(req)) {
        enviar(401, { conectado: true, pareado: false, pausado, whatsappAberto: aberto, whatsappAutenticado: null, versao: instalacao.versao, instalacaoId: instalacao.id, ultimoTeste: teste, resultadoComunicacao: "Pareamento necess\xE1rio." });
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
        resultadoComunicacao: memoria.identificado ? "Computador preparado e reconhecido automaticamente." : "Conector local autenticado neste computador.",
        ...memoria
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/unlink") {
      if (!autorizado(req)) {
        enviar(401, { motivo: "Pareie este computador antes de desvincular." });
        return;
      }
      gravarInstalacao({ vinculado: false });
      enviar(200, { ok: true, pareado: false, preparado: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/update") {
      if (!autorizado(req)) {
        enviar(401, { motivo: "Pareie este computador antes de atualizar." });
        return;
      }
      const instalacao = garantirInstalacao();
      instalacao.versao = VERSAO_CONECTOR;
      fs.writeFileSync(arquivoInstalacao(), JSON.stringify({ ...instalacao, atualizadoEm: (/* @__PURE__ */ new Date()).toISOString() }));
      enviar(200, { ok: true, versao: VERSAO_CONECTOR, instalacaoId: instalacao.id });
      return;
    }
    if (req.method === "POST" && url.pathname === "/homologacao") {
      if (!autorizado(req)) {
        enviar(401, { motivo: "Pareie este computador antes do teste." });
        return;
      }
      const corpo = await lerCorpo(req);
      const instalacao = garantirInstalacao();
      const teste = lerJson(arquivoTeste());
      const inspecao = await lerJanela();
      if (inspecao.aberto === true && inspecao.autenticado === false) gravarInstalacao({ whatsappAutenticado: false });
      if (inspecao.autenticado === true) gravarInstalacao({ whatsappAutenticado: true });
      const decisao = decidirTesteHomologacao({
        autorizar: corpo?.autorizar === true,
        tituloAberto: GRUPO_HOMOLOGACAO,
        candidatos: [GRUPO_HOMOLOGACAO],
        testeJaRegistrado: !!teste?.registrado
      });
      if (!decisao.enviar) {
        enviar(200, { ok: false, motivo: decisao.motivo, instalacaoId: instalacao.id, entrega: null, whatsappAutenticado: inspecao.autenticado ?? null });
        return;
      }
      if (inspecao.aberto === false) abrirWhatsApp();
      const resultado = await driver(GRUPO_HOMOLOGACAO, MENSAGEM_TESTE_HOMOLOGACAO);
      const registro = {
        registrado: resultado.estado === "comando_executado",
        instalacaoId: instalacao.id,
        em: (/* @__PURE__ */ new Date()).toISOString(),
        estado: resultado.estado,
        motivo: resultado.motivo || decisao.motivo,
        entrega: null
      };
      if (registro.registrado) fs.writeFileSync(arquivoTeste(), JSON.stringify(registro));
      enviar(200, { ok: registro.registrado, ...registro });
      return;
    }
    if (!autorizado(req)) {
      enviar(401, { motivo: "Pareie este computador antes de enviar comandos." });
      return;
    }
    if (req.method === "POST" && url.pathname === "/pause") {
      pausado = true;
      enviar(200, { pausado: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/resume") {
      pausado = false;
      parado = false;
      enviar(200, { pausado: false });
      return;
    }
    if (req.method === "POST" && url.pathname === "/stop") {
      parado = true;
      pausado = true;
      enviar(200, { parado: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/commands") {
      const corpo = await lerCorpo(req);
      const comandos = Array.isArray(corpo.commands) ? corpo.commands : [];
      const resultados = await executarFila(comandos, driver);
      enviar(200, { resultados });
      return;
    }
    enviar(404, { motivo: "Rota inexistente." });
  });
}
var executadoDireto = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executadoDireto) {
  criarServidor().listen(PORTA_LOCAL, "127.0.0.1", () => {
    console.log(`TM SEG WhatsApp Desktop em http://127.0.0.1:${PORTA_LOCAL}`);
  });
}
export {
  criarServidor,
  detectarComponentes,
  driverSimulado
};
