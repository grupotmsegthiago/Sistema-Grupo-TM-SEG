import { servicoDoSistema } from './camposCliente';
import { kmGravado, localOrigemDestino, numeroOsDoBoletim, cidadeUfDoEndereco } from './report';

export const STATUS_AO_VIVO = ['Em Viagem', 'Origem', 'Agendada', 'Solicitada', 'Documentação', 'Pendente'] as const;

/**
 * A OS sai do ao vivo quando o faturamento já foi aprovado ou quando a situação
 * ficou Pendente mesmo com hora final — é a conclusão que o sistema não grava
 * como Concluída se a OS já estava aprovada. Em Viagem e Origem com hora final
 * continuam, porque a rota ainda pode estar no ar.
 */
export function segueNoAoVivo(row: {
  status?: string | null;
  end_time?: string | null;
  billing_approved?: boolean | null;
}): boolean {
  const status = String(row.status || '').trim();
  if (!(STATUS_AO_VIVO as readonly string[]).includes(status)) return false;
  if (row.billing_approved === true) return false;
  if (status === 'Pendente' && String(row.end_time || '').trim()) return false;
  return true;
}

export type MissaoAoVivo = {
  os: string;
  status: string;
  servico: string | null;
  placa: string | null;
  motorista: string | null;
  local: string | null;
  origem: string | null;
  destino: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  kmInicio: number | null;
  kmFim: number | null;
  solicitante: string | null;
  quemAutorizou: string | null;
  operacao: string | null;
  tsp: string | null;
  atendimentoPgr: string | null;
};

function texto(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

/** Linha ao vivo com os dados operacionais da OS. Dinheiro fica no controle, só depois de aprovada. */
export function montarMissaoAoVivo(input: {
  id: string;
  status?: string | null;
  missionType?: string | null;
  plate?: string | null;
  driver?: string | null;
  origin?: string | null;
  destination?: string | null;
  start?: string | null;
  end?: string | null;
  startKm?: unknown;
  endKm?: unknown;
  campos?: {
    solicitante?: string | null;
    quem_autorizou?: string | null;
    servico?: string | null;
    operacao?: string | null;
    tsp?: string | null;
    atendimento_pgr?: string | null;
  } | null;
}): MissaoAoVivo | null {
  const os = numeroOsDoBoletim(input.id);
  if (!os) return null;
  const campos = input.campos;
  return {
    os,
    status: texto(input.status) || 'Pendente',
    servico: texto(campos?.servico) || servicoDoSistema(input.missionType),
    placa: texto(input.plate),
    motorista: texto(input.driver),
    local: localOrigemDestino(input.origin, input.destination),
    origem: cidadeUfDoEndereco(input.origin),
    destino: cidadeUfDoEndereco(input.destination),
    dataInicio: texto(input.start),
    dataFim: texto(input.end),
    kmInicio: kmGravado(input.startKm),
    kmFim: kmGravado(input.endKm),
    solicitante: texto(campos?.solicitante),
    quemAutorizou: texto(campos?.quem_autorizou),
    operacao: texto(campos?.operacao),
    tsp: texto(campos?.tsp),
    atendimentoPgr: texto(campos?.atendimento_pgr),
  };
}

const PESO: Record<string, number> = {
  'Em Viagem': 0,
  Origem: 1,
  Agendada: 2,
  Solicitada: 3,
  'Documentação': 4,
  Pendente: 5,
};

export function ordenarMissoesAoVivo<T extends { status: string; dataInicio: string | null; os: string }>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    const peso = (PESO[a.status] ?? 9) - (PESO[b.status] ?? 9);
    if (peso) return peso;
    const inicioA = a.dataInicio ? new Date(a.dataInicio).getTime() : 0;
    const inicioB = b.dataInicio ? new Date(b.dataInicio).getTime() : 0;
    if (inicioB !== inicioA) return inicioB - inicioA;
    return Number(b.os) - Number(a.os);
  });
}
