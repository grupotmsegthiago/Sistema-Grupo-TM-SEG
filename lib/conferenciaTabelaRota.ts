import { UF_TO_REGION, extractCityFromAddress, extractUF } from './financialUtils';

export type TabelaConferencia = {
  id: string;
  nome: string;
  franchiseKm?: number | null;
};

export type RotaConferencia = {
  origem: string;
  destino: string;
  km?: number | null;
};

export type ResultadoConferenciaTabela = {
  status: 'OK' | 'ERRADA' | 'INCONCLUSIVO';
  motivos: string[];
  sugestaoId: string;
  sugestaoNome: string;
};

const REGIOES = ['CENTRO OESTE', 'CENTRO-OESTE', 'NORDESTE', 'SUDESTE', 'NORTE', 'SUL'];

function semAcento(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function limp(value: string): string {
  return semAcento(value).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function regiaoDaUf(uf: string): string {
  return String(UF_TO_REGION[uf] || '').toUpperCase().replace('-', ' ');
}

function cidadeDoEndereco(endereco: string): string {
  return limp(extractCityFromAddress(endereco || '') || endereco || '');
}

function cidadeBate(cidadeTabela: string, endereco: string): boolean {
  const alvo = limp(cidadeTabela);
  if (alvo.length < 4) return false;
  const cidade = cidadeDoEndereco(endereco);
  if (cidade && (cidade.includes(alvo) || alvo.includes(cidade))) return true;
  return limp(endereco).includes(alvo);
}

type NomeTabela = {
  cidades: string[];
  ufs: string[];
  kmNome: number | null;
  regiao: string;
};

function lerNomeTabela(nome: string): NomeTabela {
  const raw = semAcento(nome);
  const kmMatch = raw.match(/(\d+)\s*KM\b/);
  let regiao = '';
  for (const item of REGIOES) {
    if (raw.includes(item)) {
      regiao = item.replace('-', ' ');
      break;
    }
  }
  const ufs = [...raw.matchAll(/\b([A-Z]{2})\b/g)]
    .map((match) => match[1])
    .filter((uf) => Boolean(UF_TO_REGION[uf]));
  let semRegiao = raw;
  for (const item of REGIOES) semRegiao = semRegiao.replace(item, ' ');
  semRegiao = semRegiao.replace(/\b\d+\s*KM\b/g, ' ');
  const cidades = semRegiao
    .split(/\s+X\s+/)
    .map((parte) => limp(parte).split(' ').filter((word) => word.length > 2 && !UF_TO_REGION[word]).join(' '))
    .map((parte) => parte.trim())
    .filter((parte) => parte.length >= 4);
  return { cidades, ufs, kmNome: kmMatch ? Number(kmMatch[1]) : null, regiao };
}

function cidadesCombinam(cidades: string[], rota: RotaConferencia): boolean {
  if (cidades.length < 2) return false;
  const [a, b] = cidades;
  const direto = cidadeBate(a, rota.origem) && cidadeBate(b, rota.destino);
  const trocado = cidadeBate(a, rota.destino) && cidadeBate(b, rota.origem);
  return direto || trocado;
}

function faixaKm(tabela: TabelaConferencia, lida: NomeTabela): number {
  const faixa = Number(tabela.franchiseKm);
  if (Number.isFinite(faixa) && faixa > 0) return faixa;
  return lida.kmNome && lida.kmNome > 0 ? lida.kmNome : 0;
}

function pontuar(tabela: TabelaConferencia, rota: RotaConferencia): number {
  const lida = lerNomeTabela(tabela.nome);
  const origemUf = extractUF(rota.origem || '');
  const destinoUf = extractUF(rota.destino || '');
  let pontos = 0;
  if (cidadesCombinam(lida.cidades, rota)) pontos += 8;
  else if (lida.cidades.some((cidade) => cidadeBate(cidade, rota.origem) || cidadeBate(cidade, rota.destino))) pontos += 3;
  const ufsRota = [origemUf, destinoUf].filter(Boolean);
  if (lida.ufs.length && ufsRota.length && lida.ufs.every((uf) => ufsRota.includes(uf))) pontos += 4;
  if (lida.regiao && ufsRota.some((uf) => regiaoDaUf(uf) === lida.regiao)) pontos += 2;
  const km = Number(rota.km);
  const faixa = faixaKm(tabela, lida);
  if (Number.isFinite(km) && km > 0 && faixa > 0) {
    if (faixa >= km) pontos += 3 - Math.min(2, (faixa - km) / km);
    else pontos += 0.5;
  }
  return pontos;
}

function melhorFaixa(opcoes: TabelaConferencia[], rota: RotaConferencia, atual: TabelaConferencia): TabelaConferencia | null {
  const km = Number(rota.km);
  if (!Number.isFinite(km) || km <= 0) return null;
  const atualLida = lerNomeTabela(atual.nome);
  const cobre = opcoes.filter((tabela) => {
    const faixa = faixaKm(tabela, lerNomeTabela(tabela.nome));
    if (faixa < km) return false;
    if (atualLida.cidades.length >= 2) return cidadesCombinam(lerNomeTabela(tabela.nome).cidades, rota);
    return pontuar(tabela, rota) >= pontuar(atual, rota);
  });
  if (!cobre.length) return null;
  return [...cobre].sort((a, b) => faixaKm(a, lerNomeTabela(a.nome)) - faixaKm(b, lerNomeTabela(b.nome)))[0];
}

export function conferirTabelaRota(
  atual: TabelaConferencia | null,
  rota: RotaConferencia,
  opcoes: TabelaConferencia[],
): ResultadoConferenciaTabela {
  const vazio: ResultadoConferenciaTabela = { status: 'INCONCLUSIVO', motivos: [], sugestaoId: '', sugestaoNome: '' };
  const nome = String(atual?.nome || '').trim();
  if (!atual || !nome || /^__AUTO_MASTER__/i.test(nome)) return vazio;
  const lida = lerNomeTabela(nome);
  const origemUf = extractUF(rota.origem || '');
  const destinoUf = extractUF(rota.destino || '');
  const motivos: string[] = [];
  const temCidade = lida.cidades.length >= 2;
  const temUf = lida.ufs.length > 0;
  const temRegiao = Boolean(lida.regiao);
  if (!temCidade && !temUf && !temRegiao && !lida.kmNome) return vazio;

  if (temCidade && !cidadesCombinam(lida.cidades, rota)) {
    const origem = cidadeDoEndereco(rota.origem) || rota.origem || 'origem';
    const destino = cidadeDoEndereco(rota.destino) || rota.destino || 'destino';
    motivos.push(`A tabela cita ${lida.cidades.join(' x ')} e a OS é ${origem} / ${destino}.`);
  }
  const ufsRota = [origemUf, destinoUf].filter(Boolean);
  if (!temCidade && temUf && ufsRota.length && !lida.ufs.some((uf) => ufsRota.includes(uf))) {
    motivos.push(`A tabela cita ${lida.ufs.join('/')} e a rota é ${origemUf || '—'} / ${destinoUf || '—'}.`);
  }
  if (!temCidade && !temUf && temRegiao && ufsRota.length) {
    const regioes = ufsRota.map(regiaoDaUf).filter(Boolean);
    if (regioes.length && !regioes.includes(lida.regiao)) {
      motivos.push(`A tabela é ${lida.regiao} e a rota está em ${regioes.join(' / ')}.`);
    }
  }

  const faixaAtual = faixaKm(atual, lida);
  const km = Number(rota.km);
  const sugestaoKm = Number.isFinite(km) && km > 0 && faixaAtual > 0 && faixaAtual < km
    ? melhorFaixa(opcoes.filter((item) => item.id !== atual.id), rota, atual)
    : null;
  if (sugestaoKm && (!temCidade || cidadesCombinam(lida.cidades, rota) || cidadesCombinam(lerNomeTabela(sugestaoKm.nome).cidades, rota))) {
    motivos.push(`O KM da rota é ${Math.round(km)} e a faixa aplicada é ${faixaAtual}. A faixa que cobre é ${faixaKm(sugestaoKm, lerNomeTabela(sugestaoKm.nome))} (${sugestaoKm.nome}).`);
  }

  const candidatas = opcoes.filter((item) => item.id !== atual.id && !/^__AUTO_MASTER__/i.test(item.nome || ''));
  const melhor = [...candidatas].sort((a, b) => pontuar(b, rota) - pontuar(a, rota))[0] || null;
  const atualPontos = pontuar(atual, rota);
  const sugestao = melhor && pontuar(melhor, rota) > atualPontos ? melhor : sugestaoKm;
  if (!motivos.length) {
    return { status: 'OK', motivos: [], sugestaoId: '', sugestaoNome: '' };
  }
  return {
    status: 'ERRADA',
    motivos,
    sugestaoId: sugestao?.id || '',
    sugestaoNome: sugestao?.nome || '',
  };
}
