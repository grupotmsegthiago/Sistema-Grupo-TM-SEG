export type LinhaPainel = {
  status: string;
  dataInicio: string | null;
  servico: string | null;
  placa: string | null;
  motorista: string | null;
  local: string | null;
  operacao: string | null;
  kmRodado: number | null;
  kmExcedente: number | null;
  hrsTrabalhada: string | null;
  valorHrsExcedente: number | null;
  valorKmExcedente: number | null;
  valorAcionamento: number | null;
  valorTotal: number | null;
  pedagio: number | null;
  financeiro?: string;
};

export type Fatia = { nome: string; valor: number; quantidade: number };
export type MesPainel = { chave: string; mes: string; os: number; faturamento: number };

export type PainelDiretoria = {
  os: number;
  semValor: number;
  faturamento: number;
  ticketMedio: number | null;
  canceladas: number;
  emViagem: number;
  concluidas: number;
  kmRodado: number;
  kmExcedente: number;
  minutosTrabalhados: number;
  acionamento: number;
  kmExcedenteValor: number;
  horasExcedenteValor: number;
  pedagio: number;
  meses: MesPainel[];
  status: Fatia[];
  servicos: Fatia[];
  motoristas: Fatia[];
  placas: Fatia[];
  origens: Fatia[];
  operacoes: Fatia[];
};

export function minutosDeHora(valor: string | null | undefined): number | null {
  const match = String(valor || '').trim().match(/^(\d+):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function chaveMesBrasil(iso: string | null): { chave: string; mes: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(date);
  const ano = partes.find((parte) => parte.type === 'year')?.value;
  const mes = partes.find((parte) => parte.type === 'month')?.value;
  if (!ano || !mes) return null;
  return { chave: `${ano}-${mes}`, mes: `${mes}/${ano}` };
}

function origemDoLocal(local: string | null): string | null {
  const texto = String(local || '').split(/\s+x\s+/i)[0]?.trim();
  return texto || null;
}

function soma(linhas: LinhaPainel[], pegar: (linha: LinhaPainel) => number | null): number {
  return linhas.reduce((total, linha) => total + (pegar(linha) ?? 0), 0);
}

function ranking(linhas: LinhaPainel[], pegar: (linha: LinhaPainel) => string | null, limite = 8): Fatia[] {
  const mapa = new Map<string, Fatia>();
  for (const linha of linhas) {
    const nome = (pegar(linha) || '').trim();
    if (!nome) continue;
    const atual = mapa.get(nome) || { nome, valor: 0, quantidade: 0 };
    atual.quantidade += 1;
    if (linha.valorTotal != null && linha.financeiro !== 'NÃO CARREGADO') atual.valor += linha.valorTotal;
    mapa.set(nome, atual);
  }
  return [...mapa.values()]
    .sort((a, b) => b.valor - a.valor || b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, limite);
}

function porNome(linhas: LinhaPainel[], pegar: (linha: LinhaPainel) => string): Fatia[] {
  return ranking(linhas, pegar, 20);
}

export function montarPainel(linhas: LinhaPainel[]): PainelDiretoria {
  const comValor = linhas.filter((linha) => linha.valorTotal != null && linha.financeiro !== 'NÃO CARREGADO');
  const faturamento = comValor.reduce((total, linha) => total + (linha.valorTotal as number), 0);
  const mesesMapa = new Map<string, MesPainel>();
  for (const linha of linhas) {
    const mes = chaveMesBrasil(linha.dataInicio);
    if (!mes) continue;
    const atual = mesesMapa.get(mes.chave) || { chave: mes.chave, mes: mes.mes, os: 0, faturamento: 0 };
    atual.os += 1;
    if (linha.valorTotal != null && linha.financeiro !== 'NÃO CARREGADO') atual.faturamento += linha.valorTotal;
    mesesMapa.set(mes.chave, atual);
  }

  return {
    os: linhas.length,
    semValor: linhas.length - comValor.length,
    faturamento,
    ticketMedio: comValor.length ? faturamento / comValor.length : null,
    canceladas: linhas.filter((linha) => linha.status.toLowerCase().includes('cancel')).length,
    emViagem: linhas.filter((linha) => linha.status.trim().toLowerCase() === 'em viagem').length,
    concluidas: linhas.filter((linha) => linha.status.toLowerCase().includes('conclu')).length,
    kmRodado: soma(linhas, (linha) => linha.kmRodado),
    kmExcedente: soma(linhas, (linha) => linha.kmExcedente),
    minutosTrabalhados: linhas.reduce((total, linha) => total + (minutosDeHora(linha.hrsTrabalhada) ?? 0), 0),
    acionamento: soma(linhas, (linha) => linha.valorAcionamento),
    kmExcedenteValor: soma(linhas, (linha) => linha.valorKmExcedente),
    horasExcedenteValor: soma(linhas, (linha) => linha.valorHrsExcedente),
    pedagio: soma(linhas, (linha) => linha.pedagio),
    meses: [...mesesMapa.values()].sort((a, b) => a.chave.localeCompare(b.chave)),
    status: porNome(linhas, (linha) => linha.status || 'Sem status').sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR')),
    servicos: ranking(linhas, (linha) => linha.servico, 6),
    motoristas: ranking(linhas, (linha) => linha.motorista),
    placas: ranking(linhas, (linha) => linha.placa),
    origens: ranking(linhas, (linha) => origemDoLocal(linha.local)),
    operacoes: ranking(linhas, (linha) => linha.operacao),
  };
}
