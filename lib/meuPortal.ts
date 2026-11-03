import { getOnDutyStageLabel } from './timeclock/onDuty';
import type { TimeClockStage } from './timeclock/types';

/** Pedido do colaborador. Usa system_logs, a mesma trilha das notícias. Sem tabela nova. */
export const ACAO_PORTAL_PEDIDO = 'TMSEG_PORTAL_REQUEST';

export const TIPOS_PEDIDO = [
  'Correção de ponto',
  'Atestado',
  'Declaração',
  'Alteração cadastral',
  'Outro',
] as const;

export type TipoPedido = (typeof TIPOS_PEDIDO)[number];

export type PendenciaPortal = {
  id: string;
  texto: string;
};

export type DocumentoPortal = {
  id: string;
  doc_type?: string | null;
  file_name?: string | null;
  expiry_date?: string | null;
};

export type ExamePortal = {
  id: string;
  exam_type?: string | null;
  expiry_date?: string | null;
};

const PROFISSIONAL = /cnv|forma|recicl|aso|certific|vigilante|curso/i;

export function documentoProfissional(doc: Pick<DocumentoPortal, 'doc_type' | 'file_name'>): boolean {
  return PROFISSIONAL.test(`${doc.doc_type || ''} ${doc.file_name || ''}`);
}

export function rotuloPontoHoje(entries: { type: TimeClockStage }[]): { texto: string; ok: boolean } {
  if (!entries.length) return { texto: 'Aguardando', ok: false };
  const label = getOnDutyStageLabel(entries);
  if (label === 'Aguardando ponto') return { texto: 'Aguardando', ok: false };
  if (label === 'Fora do expediente') return { texto: 'Encerrado', ok: true };
  return { texto: 'Regular', ok: true };
}

/** Horas extras lançadas no salário. Não existe saldo de banco de horas no RH. */
export function textoBancoHoras(horas: number | null | undefined): string {
  const valor = Number(horas);
  if (!Number.isFinite(valor) || valor === 0) return 'Sem lançamento';
  const total = Math.round(Math.abs(valor) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const sinal = valor < 0 ? '− ' : '+ ';
  return `${sinal}${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

type SlotEscala = { weekday: number; inicio: string; folga: boolean };

const DIA_PARA_SEMANA: Record<string, number> = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6,
};

function diaDaSemana(valor: unknown): number | null {
  if (typeof valor === 'number' && valor >= 0 && valor <= 6) return valor;
  const texto = String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!texto) return null;
  if (texto in DIA_PARA_SEMANA) return DIA_PARA_SEMANA[texto];
  const numero = Number(texto);
  if (Number.isInteger(numero) && numero >= 0 && numero <= 6) return numero;
  return null;
}

export function slotsDaEscala(scheduleJson: unknown): SlotEscala[] {
  if (!Array.isArray(scheduleJson)) return [];
  const slots: SlotEscala[] = [];
  for (const item of scheduleJson) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const weekday = diaDaSemana(row.weekday ?? row.dia ?? row.day);
    if (weekday == null) continue;
    const inicio = String(row.inicio || row.start || row.entrada || '').trim();
    const folga = row.folga === true || row.off === true || row.tipo === 'folga';
    slots.push({ weekday, inicio, folga });
  }
  return slots;
}

export function textoProximaEscala(
  scheduleJson: unknown,
  shiftType: string | null | undefined,
  agora = new Date(),
): string {
  const slots = slotsDaEscala(scheduleJson);
  if (slots.length) {
    for (let i = 1; i <= 7; i += 1) {
      const data = new Date(agora);
      data.setDate(data.getDate() + i);
      const slot = slots.find((item) => item.weekday === data.getDay() && !item.folga);
      if (!slot) continue;
      const quando = i === 1
        ? 'Amanhã'
        : data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return slot.inicio ? `${quando} • ${slot.inicio}` : quando;
    }
    return 'Folga na semana';
  }
  if (shiftType === 'noturno') return 'Turno noturno';
  if (shiftType === 'diurno') return 'Turno diurno';
  return 'Sem escala';
}

function diasAte(expiry: string | null | undefined, hoje: Date): number | null {
  const iso = String(expiry || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const fim = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(fim.getTime())) return null;
  const base = new Date(hoje);
  base.setHours(12, 0, 0, 0);
  return Math.round((fim.getTime() - base.getTime()) / 86_400_000);
}

function textoValidade(nome: string, expiry: string | null | undefined, hoje: Date): string | null {
  const dias = diasAte(expiry, hoje);
  if (dias == null || dias > 45) return null;
  if (dias < 0) return `${nome} venceu`;
  if (dias === 0) return `${nome} vence hoje`;
  return `${nome} vence em ${dias} dias`;
}

export function pendenciasDoPortal(input: {
  documentos: DocumentoPortal[];
  exames: ExamePortal[];
  cnhExpiry?: string | null;
  modulosFaltando: string[];
  comunicadosNaoLidos: number;
  hoje?: Date;
}): PendenciaPortal[] {
  const hoje = input.hoje || new Date();
  const lista: PendenciaPortal[] = [];
  const cnh = textoValidade('CNH', input.cnhExpiry, hoje);
  if (cnh) lista.push({ id: 'cnh', texto: cnh });
  for (const doc of input.documentos) {
    if (!documentoProfissional(doc)) continue;
    const nome = String(doc.doc_type || doc.file_name || 'Documento').trim();
    const texto = textoValidade(nome, doc.expiry_date, hoje);
    if (texto) lista.push({ id: `doc-${doc.id}`, texto });
  }
  for (const exame of input.exames) {
    const nome = String(exame.exam_type || 'ASO').trim();
    const texto = textoValidade(nome, exame.expiry_date, hoje);
    if (texto) lista.push({ id: `exame-${exame.id}`, texto });
  }
  if (input.modulosFaltando.length) {
    lista.push({
      id: 'treinamento',
      texto: `Treinamento: falta assistir ${input.modulosFaltando[0]}${input.modulosFaltando.length > 1 ? ` e mais ${input.modulosFaltando.length - 1}` : ''}`,
    });
  }
  if (input.comunicadosNaoLidos > 0) {
    lista.push({
      id: 'comunicados',
      texto: input.comunicadosNaoLidos === 1
        ? '1 comunicado sem leitura'
        : `${input.comunicadosNaoLidos} comunicados sem leitura`,
    });
  }
  return lista;
}

export function textoLidoEm(iso: string | null | undefined): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '';
  const dia = data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `Lido em ${dia} às ${hora}`;
}
