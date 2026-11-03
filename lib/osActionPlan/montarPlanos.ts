import { analisarOcorrencia } from './analisarOcorrencia';
import type { OsActionPlanInput } from './types';

export type StatusPlano = 'Proposta' | 'Em andamento' | 'Concluída';

export interface LinhaPlano {
  acao: string;
  responsavel: string;
  prazo: string;
  status: StatusPlano;
  evidencia: string;
}

const RESPONSAVEL = 'A definir após validação';
const PRAZO = 'A definir após validação';
const EVIDENCIA = 'Pendente de confirmação';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fatosRegistrados(d: OsActionPlanInput): string {
  return [
    d.missionId,
    d.status,
    d.tipo,
    d.tratativaTexto,
    ...d.ocorrencias.flatMap((o) => [o.texto, o.autor, o.resolvida ? 'resolvida' : '']),
    ...d.atualizacoes.flatMap((a) => [a.texto, a.por]),
    ...d.equipe,
    d.motorista,
    ...d.fotos.map((f) => f.legenda),
  ].filter(Boolean).join(' ').toLowerCase();
}

function citado(fatos: string, trecho: string): boolean {
  const t = trecho.trim().toLowerCase();
  if (t.length < 4) return false;
  return fatos.includes(t);
}

function statusValido(bruto: string, fatos: string, permitirConcluida: boolean): StatusPlano {
  const t = bruto.trim().toLowerCase();
  if (t.startsWith('conclu')) return permitirConcluida ? 'Concluída' : 'Proposta';
  if (t.startsWith('em andamento')) return fatos.includes('em andamento') ? 'Em andamento' : 'Proposta';
  return 'Proposta';
}

function campoLivre(bruto: string | undefined, fatos: string, padrao: string, manterProposta = false): string {
  const t = String(bruto || '').trim();
  if (!t) return padrao;
  if (t.toLowerCase() === padrao.toLowerCase()) return padrao;
  if (t.toLowerCase() === 'pendente de confirmação') return 'Pendente de confirmação';
  if (manterProposta) return t;
  if (!citado(fatos, t)) return padrao;
  return t;
}

export function interpretarLinhasPlano(
  texto: string,
  fatos: string,
  permitirConcluida: boolean,
  manterProposta = false,
): LinhaPlano[] {
  const linhas: LinhaPlano[] = [];
  for (const bruta of texto.split('\n')) {
    const linha = bruta.trim();
    if (!linha.includes('|')) continue;
    if (/^a[cç][aã]o\s*\|/i.test(linha)) continue;
    const partes = linha.split('|').map((p) => p.trim());
    if (partes.length < 5 || !partes[0]) continue;
    if (!acaoAceita(partes[0], [])) continue;
    const status = statusValido(partes[3], fatos, permitirConcluida);
    let evidencia = campoLivre(partes.slice(4).join(' | '), fatos, EVIDENCIA, manterProposta);
    if (partes[3].toLowerCase().startsWith('conclu') && status !== 'Concluída') {
      evidencia = 'Pendente de confirmação. Status ajustado para Proposta: o resumo dos fatos não comprova a conclusão.';
    }
    linhas.push({
      acao: partes[0],
      responsavel: campoLivre(partes[1], fatos, RESPONSAVEL, manterProposta),
      prazo: campoLivre(partes[2], fatos, PRAZO, manterProposta),
      status,
      evidencia,
    });
  }
  return linhas;
}

function linha(acao: string, evidencia = EVIDENCIA, status: StatusPlano = 'Proposta'): LinhaPlano {
  return { acao, responsavel: RESPONSAVEL, prazo: PRAZO, status, evidencia };
}

export function textoEhRelatorioColado(texto: string): boolean {
  const t = String(texto || '').toLowerCase();
  if (t.length > 450) return true;
  if (t.includes('<table') || t.includes('<!doctype') || t.includes('<html')) return true;
  const marcas = ['plano de ação', 'plano de melhoria', 'justificativa de ocorrência', 'documento gerado', 'histórico da conta', 'evidência/indicador'];
  return marcas.filter((m) => t.includes(m)).length >= 2;
}

export function textoEhRotina(texto: string): boolean {
  const n = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^status\s*:/.test(n.trim())) return true;
  const rotina = [
    'sem novidade', 'segue sem novidade', 'equipe na origem', 'equipe no patio',
    'chegada na origem', 'solicitacao criada', 'em viagem', 'missao agendada',
    'segue viagem', 'sem atraso', 'monitoramento', 'posicao ok', 'tudo certo',
  ];
  const relevante = /atraso|ocorrenc|acidente|pane|recusa|falha|diverg|sinistro|roubo|quebra|pneu|bloqueio|avaria|extravio|problema|parada|\brf\b|reinicio|entregue|fim de miss/;
  if (relevante.test(n)) return false;
  if (/^equipe\b/.test(n.trim()) && /origem|patio|local|posicao/.test(n) && !/parada|entregue|fim de miss/.test(n)) return true;
  if (/segue (a )?missao|sem alter|inicio de viagem|localizacao|posicao atual|sem novidade|em acompanhamento/.test(n)) return true;
  return rotina.some((r) => n.includes(r));
}

export function acaoAceita(acao: string, fontes: string[]): boolean {
  const t = acao.trim();
  if (t.length < 12 || t.length > 180) return false;
  if (/apurar a atualiza/i.test(t)) return false;
  if (textoEhRelatorioColado(t) || textoEhRotina(t)) return false;
  if (/plano de a[cç][aã]o|<!doctype|<table|hist[oó]rico da conta/i.test(t)) return false;
  return !fontes.some((f) => f.length > 70 && t.toLowerCase().includes(f.slice(0, 70).toLowerCase()));
}

function temaDoRelato(objetivo: string, resumo: string): string {
  const texto = `${objetivo} ${resumo}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/atraso/.test(texto)) return 'o atraso descrito no resumo dos fatos';
  if (/parada|\brf\b|descanso/.test(texto)) return 'a parada descrita no resumo dos fatos';
  if (/pane|pneu|quebra|avaria/.test(texto)) return 'a falha descrita no resumo dos fatos';
  if (/velocidade|contato|condutor/.test(texto)) return 'a perda de acompanhamento descrita no resumo dos fatos';
  return 'o fato descrito no resumo e no objetivo deste documento';
}

/** Plano proposto a partir do objetivo e do resumo. Não lê status, ocorrência nem atualização da OS. */
export function linhasPlanoSobreRelato(input: {
  objetivo: string;
  resumo: string;
  planoAcao?: string | null;
  planoMelhoria?: string | null;
}): { acao: LinhaPlano[]; melhoria: LinhaPlano[] } {
  const relato = `${input.objetivo}\n${input.resumo}`;
  const acaoIa = interpretarLinhasPlano(input.planoAcao || '', relato, false, true)
    .filter((l) => acaoAceita(l.acao, []));
  const melhoriaIa = interpretarLinhasPlano(input.planoMelhoria || '', relato, false, true)
    .filter((l) => acaoAceita(l.acao, []) && !acaoIa.some((a) => a.acao === l.acao));
  if (acaoIa.length || melhoriaIa.length) {
    return {
      acao: acaoIa.length ? acaoIa : [linha(`Tratar com o fornecedor ${temaDoRelato(input.objetivo, input.resumo)} e devolver posição ao cliente.`)],
      melhoria: melhoriaIa.length ? melhoriaIa : [linha(`Definir, com o fornecedor, um controle para que ${temaDoRelato(input.objetivo, input.resumo)} não se repita.`)],
    };
  }
  const tema = temaDoRelato(input.objetivo, input.resumo);
  return {
    acao: [
      linha(`Alinhar com o fornecedor ${tema} e informar o cliente sobre a tratativa.`),
      linha('Combinar com o fornecedor o retorno da apuração, com responsável e prazo visíveis para o cliente.'),
    ],
    melhoria: [
      linha(`Definir, com o fornecedor, um controle para que ${tema} não se repita na operação seguinte.`),
    ],
  };
}

export function linhasPlanoAcao(d: OsActionPlanInput): LinhaPlano[] {
  return analisarOcorrencia(d).acao;
}

export function linhasPlanoMelhoria(d: OsActionPlanInput): LinhaPlano[] {
  const plano = analisarOcorrencia(d);
  const acoes = new Set(plano.acao.map((l) => l.acao));
  return plano.melhoria.filter((l) => !acoes.has(l.acao));
}

function renderTabela(linhas: LinhaPlano[], nota: string, modo: 'acao' | 'melhoria'): string {
  const ultima = modo === 'acao' ? 'Evidência de conclusão' : 'Indicador de eficácia';
  const primeira = modo === 'acao' ? 'Ação' : 'Melhoria';
  const corpo = linhas.map((l) => (
    `<tr><td>${esc(l.acao)}</td><td>${esc(l.responsavel)}</td><td>${esc(l.prazo)}</td><td>${esc(l.status)}</td><td>${esc(l.evidencia)}</td></tr>`
  )).join('');
  return `<p class="aviso-plano">${esc(nota)}</p>
<table class="grade">
  <thead><tr><th>${primeira}</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>${ultima}</th></tr></thead>
  <tbody>${corpo}</tbody>
</table>`;
}

export function htmlPlanoAcao(d: OsActionPlanInput): string {
  const linhas = linhasPlanoAcao(d);
  return renderTabela(
    linhas.length ? linhas : [linha('Nenhuma medida corretiva é proposta: não há ocorrência formal nem ponto fora da rotina.')],
    'Medidas propostas para o problema identificado nos registros. Não repetem o que o sistema já lançou.',
    'acao',
  );
}

export function htmlPlanoMelhoria(d: OsActionPlanInput): string {
  return renderTabela(linhasPlanoMelhoria(d), 'Somente medidas preventivas. Não repetem a apuração da seção anterior.', 'melhoria');
}
