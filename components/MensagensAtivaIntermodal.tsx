import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { copyTextAsync } from '../lib/clipboard';
import { agenteEstaLogado } from '../lib/liveTrack/pure';
import {
  botoesWhatsAppDaOs,
  textoAgenteAtiva,
  textoClienteAtiva,
  textoParceiroAtiva,
  type TextoAtivaIntermodal,
} from '../lib/ativaIntermodalWhatsApp';
import type { Mission } from '../types';

type Qual = 'parceiro' | 'agente' | 'cliente';

async function linksDaMissao(missionId: string): Promise<{ url: string; clientUrl: string } | null> {
  const watch = await authFetch(`/api/live-track?op=watch&missionId=${encodeURIComponent(missionId)}`);
  const atual = await parseJsonResponse(watch);
  if (atual?.url && atual?.clientUrl) {
    return { url: String(atual.url), clientUrl: String(atual.clientUrl) };
  }
  const gen = await authFetch('/api/live-track?op=generate', {
    method: 'POST',
    body: JSON.stringify({ missionId }),
  });
  const criado = await parseJsonResponse(gen);
  if (!gen.ok || !criado?.url || !criado?.clientUrl) return null;
  return { url: String(criado.url), clientUrl: String(criado.clientUrl) };
}

function useAgenteConectado(missionId: string, ativo: boolean): boolean | null {
  const [conectado, setConectado] = useState<boolean | null>(null);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const ler = async () => {
      try {
        const r = await authFetch(`/api/live-track?op=watch&missionId=${encodeURIComponent(missionId)}`);
        const j = await parseJsonResponse(r);
        if (!vivo || !r.ok) return;
        const track = j?.track;
        setConectado(agenteEstaLogado({
          status: track?.status,
          ended: track?.status === 'ended' || Boolean(track?.ended_at),
          vistoEm: track?.last_seen_at,
        }));
      } catch {
        // Mantém o último estado lido.
      }
    };
    void ler();
    const id = window.setInterval(() => { void ler(); }, 10000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [missionId, ativo]);
  return conectado;
}

export default function MensagensAtivaIntermodal({ mission }: { mission: Mission }) {
  const quais = botoesWhatsAppDaOs(mission);
  const ativo = Boolean(quais.agente || quais.cliente || quais.parceiro);
  const conectado = useAgenteConectado(mission.id, ativo);
  const [busy, setBusy] = useState<Qual | null>(null);
  const [gerado, setGerado] = useState<Partial<Record<Qual, boolean>>>({});
  const [sobre, setSobre] = useState<Qual | null>(null);
  if (!ativo) return null;

  const copiar = async (qual: Qual) => {
    setBusy(qual);
    try {
      const links = await linksDaMissao(mission.id);
      if (!links) {
        alert('Não foi possível obter o link de rastreio desta OS.');
        return;
      }
      const viatura = [mission.clientVehicle?.plate, mission.clientVehicle?.model].filter(Boolean).join(' • ');
      const dados: TextoAtivaIntermodal = {
        os: mission.id,
        cliente: mission.client || '',
        origem: mission.origin || '',
        destino: mission.destination || '',
        motorista: mission.driver_name || '',
        agente: mission.agent1 || mission.driver_name || '',
        viatura,
        linkAgente: links.url,
        linkCliente: links.clientUrl,
      };
      const texto = qual === 'parceiro' ? textoParceiroAtiva(dados) : qual === 'agente' ? textoAgenteAtiva(dados) : textoClienteAtiva(dados);
      const ok = await copyTextAsync(texto);
      if (!ok) {
        alert('Não foi possível copiar. Tente novamente.');
        return;
      }
      setGerado((atual) => ({ ...atual, [qual]: true }));
    } finally {
      setBusy(null);
    }
  };

  const rotulo = (qual: Qual, inicial: string, pronto: string) => {
    if (busy === qual) return 'Copiando';
    if (gerado[qual] && sobre === qual) return 'Copiar de novo';
    if (gerado[qual]) return pronto;
    return inicial;
  };

  const botao = (qual: Qual, inicial: string, pronto: string) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void copiar(qual); }}
      onMouseEnter={() => setSobre(qual)}
      onMouseLeave={() => setSobre((atual) => atual === qual ? null : atual)}
      disabled={busy !== null}
      title={gerado[qual] ? 'Copiar a mensagem de novo' : inicial}
      data-testid={`btn-wa-ativa-${qual}-${mission.id}`}
      className="px-2 py-1 rounded-md bg-slate-950/80 text-white text-[8px] font-black uppercase leading-tight shadow-lg border border-white/25 backdrop-blur-sm"
    >
      {busy === qual ? <Loader2 size={11} className="animate-spin mx-auto" /> : rotulo(qual, inicial, pronto)}
    </button>
  );

  return (
    <div className="flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()} data-testid={`wa-ativa-intermodal-${mission.id}`}>
      {conectado !== null && (
        <p
          data-testid={`wa-agente-sinal-${mission.id}`}
          className={`px-2 py-1 rounded-md text-[8px] font-black uppercase leading-tight shadow-lg border backdrop-blur-sm ${conectado ? 'bg-emerald-500 text-slate-950 border-emerald-200' : 'bg-amber-400 text-slate-950 border-amber-200'}`}
        >
          {conectado ? 'Agente conectado' : 'Agente desconectado'}
        </p>
      )}
      {quais.agente && botao('agente', 'Gerar link do agente', 'Link agente - gerado')}
      {quais.cliente && botao('cliente', 'Gerar link do cliente', 'Link cliente - gerado')}
      {quais.parceiro && botao('parceiro', 'Gerar link parceiro', 'Link parceiro - gerado')}
    </div>
  );
}
