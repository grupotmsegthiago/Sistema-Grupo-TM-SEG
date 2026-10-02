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

function campoLivre(bruto: string | undefined, fatos: string, padrao: string): string {
  const t = String(bruto || '').trim();
  if (!t) return padrao;
  if (t.toLowerCase() === padrao.toLowerCase()) return padrao;
  if (t.toLowerCase() === 'pendente de confirmação') return 'Pendente de confirmação';
  if (!citado(fatos, t)) return padrao;
  return t;
}

export function interpretarLinhasPlano(
  texto: string,
  fatos: string,
  permitirConcluida: boolean,
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
    let evidencia = campoLivre(partes.slice(4).join(' | '), fatos, EVIDENCIA);
    if (partes[3].toLowerCase().startsWith('conclu') && status !== 'Concluída') {
      evidencia = 'Pendente de confirmação. Status ajustado para Proposta: não há comprovante de conclusão na OS.';
    }
    linhas.push({
      acao: partes[0],
      responsavel: campoLivre(partes[1], fatos, RESPONSAVEL),
      prazo: campoLivre(partes[2], fatos, PRAZO),
      status,
      evidencia,
    });
  }
  return linhas;
}

function linha(acao: string, evidencia = EVIDENCIA, status: StatusPlano = 'Proposta'): LinhaPlano {
  return { acao, responsavel: RESPONSAVEL, prazo: PRAZO, status, evidencia };
}

function atualizacoes(d: OsActionPlanInput) {
  return (d.atualizacoes || []).filter((a) => String(a.texto || '').trim());
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

function fontesBrutas(d: OsActionPlanInput): string[] {
  return [
    ...d.atualizacoes.map((a) => a.texto),
    ...d.ocorrencias.map((o) => o.texto),
    d.tratativaTexto || '',
    d.narrativaIa || '',
    d.planoAcaoIa || '',
  ].filter((t) => t.trim().length > 0);
}

export function linhasPlanoAcao(d: OsActionPlanInput): LinhaPlano[] {
  const linhas: LinhaPlano[] = [];
  const ocorrenciasUteis = d.ocorrencias.filter((o) => !textoEhRelatorioColado(o.texto));
  const relevantes = atualizacoes(d).filter((a) => !textoEhRotina(a.texto) && !textoEhRelatorioColado(a.texto));
  if (ocorrenciasUteis.some((o) => o.resolvida)) {
    linhas.push(linha(
      'Registrar o encerramento da ocorrência já lançado nesta OS.',
      'Resolução registrada na OS',
      'Concluída',
    ));
  }
  if (ocorrenciasUteis.some((o) => !o.resolvida)) {
    linhas.push(linha(
      'Validar a ocorrência formal registrada nesta OS, sem tratar o texto como causa concluída.',
      d.fotos.length ? 'Conferir os anexos já lançados. Complemento pendente de confirmação.' : EVIDENCIA,
    ));
  }
  if (relevantes.length > 0 && !ocorrenciasUteis.some((o) => !o.resolvida)) {
    const n = relevantes.map((a) => a.texto).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const acao = /parada|\brf\b|descanso/.test(n)
      ? 'Confirmar o motivo da parada registrada nesta OS, sem concluir a causa.'
      : /atraso/.test(n)
        ? 'Validar o atraso registrado nesta OS, sem concluir a causa.'
        : /pane|pneu|quebra|avaria/.test(n)
          ? 'Isolar a falha mecânica registrada nesta OS e separar fato de relato.'
          : 'Reunir as atualizações relevantes e confirmar se há ocorrência a apurar.';
    linhas.push(linha(acao));
  }
  if (d.fotos.length > 0 && (ocorrenciasUteis.length > 0 || relevantes.length > 0)) {
    linhas.push(linha('Conferir as evidências anexadas antes de encerrar a apuração. A foto não comprova o que não estiver visível.'));
  }
  if (linhas.length === 0) {
    linhas.push(linha('Nenhuma medida corretiva é proposta: não há ocorrência formal nem ponto fora da rotina.'));
  }
  return linhas.filter((l) => acaoAceita(l.acao, fontesBrutas(d)));
}

export function linhasPlanoMelhoria(d: OsActionPlanInput): LinhaPlano[] {
  const relevantes = atualizacoes(d).filter((a) => !textoEhRotina(a.texto) && !textoEhRelatorioColado(a.texto));
  const temPonto = d.ocorrencias.some((o) => !textoEhRelatorioColado(o.texto)) || relevantes.length > 0;
  if (!temPonto) return [linha('Nenhuma medida preventiva específica é proposta. Não há fato fora da rotina que a sustente.')];
  const acoes = new Set(linhasPlanoAcao(d).map((l) => l.acao));
  const candidatas = [
    linha('Revisar o modo de registrar atualização, separando rotina, fato e ponto pendente. Medida preventiva, ainda não executada.', 'Indicador: atualização seguinte com essa separação. Pendente de confirmação'),
    linha('Incluir no checklist da central a conferência de evidência antes de encerrar apuração. Medida preventiva, ainda não executada.', 'Indicador: evidência conferida na OS. Pendente de confirmação'),
  ];
  return candidatas.filter((l) => !acoes.has(l.acao) && acaoAceita(l.acao, fontesBrutas(d)));
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
    'Somente medidas de apuração ou correção. O texto das outras seções não entra nesta tabela.',
    'acao',
  );
}

export function htmlPlanoMelhoria(d: OsActionPlanInput): string {
  return renderTabela(linhasPlanoMelhoria(d), 'Somente medidas preventivas. Não repetem a apuração da seção anterior.', 'melhoria');
}
