/** Histórico local de saúde do sistema (24h) — persiste no navegador. */

export type HealthSlotStatus = 'online' | 'degraded' | 'offline';

export interface HealthHourSlot {
  hourKey: string; // yyyy-mm-ddTHH (Brasília via ISO slice)
  label: string;
  status: HealthSlotStatus;
  latencyMs: number;
  servicesOk: number;
  servicesTotal: number;
  updatedAt: string;
}

const STORAGE_KEY = 'tmseg_health_history_v1';
const MAX_SLOTS = 48;

function hourKeyBR(d = new Date()): string {
  return d.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 13);
}

function hourLabelBR(d = new Date()): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export function loadHealthHistory(): HealthHourSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HealthHourSlot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveHealthSnapshot(input: {
  latencyMs: number;
  servicesOk: number;
  servicesTotal: number;
}): HealthHourSlot[] {
  const now = new Date();
  const key = hourKeyBR(now);
  const label = hourLabelBR(now);
  const ratio = input.servicesTotal > 0 ? input.servicesOk / input.servicesTotal : 1;
  let status: HealthSlotStatus = 'online';
  if (input.latencyMs > 2000 || ratio < 0.5) status = 'offline';
  else if (input.latencyMs > 800 || ratio < 1) status = 'degraded';

  const slot: HealthHourSlot = {
    hourKey: key,
    label,
    status,
    latencyMs: input.latencyMs,
    servicesOk: input.servicesOk,
    servicesTotal: input.servicesTotal,
    updatedAt: now.toISOString(),
  };

  const prev = loadHealthHistory().filter(s => s.hourKey !== key);
  const next = [...prev, slot].slice(-MAX_SLOTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Preenche as últimas 24 horas para o gráfico (usa histórico real onde existir). */
export function build24hGraph(history: HealthHourSlot[]): HealthHourSlot[] {
  const map = new Map(history.map(h => [h.hourKey, h]));
  const out: HealthHourSlot[] = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const key = hourKeyBR(d);
    const existing = map.get(key);
    if (existing) {
      out.push(existing);
    } else {
      out.push({
        hourKey: key,
        label: hourLabelBR(d),
        status: 'offline',
        latencyMs: 0,
        servicesOk: 0,
        servicesTotal: 0,
        updatedAt: '',
      });
    }
  }
  return out;
}
