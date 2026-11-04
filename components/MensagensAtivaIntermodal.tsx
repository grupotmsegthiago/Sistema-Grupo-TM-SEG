import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { authFetch } from '../lib/authFetch';
import { parseJsonResponse } from '../lib/parseJsonResponse';
import { copyTextAsync } from '../lib/clipboard';
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

export default function MensagensAtivaIntermodal({ mission }: { mission: Mission }) {
  const [busy, setBusy] = useState<Qual | null>(null);
  const [copiado, setCopiado] = useState<Qual | null>(null);
  const quais = botoesWhatsAppDaOs(mission);
  if (!quais.agente && !quais.cliente && !quais.parceiro) return null;

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
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } finally {
      setBusy(null);
    }
  };

  const botao = (qual: Qual, rotulo: string, classe: string) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); void copiar(qual); }}
      disabled={busy !== null}
      data-testid={`btn-wa-ativa-${qual}-${mission.id}`}
      className={`px-2 py-1 text-white text-[9px] font-bold rounded-md leading-tight ${classe}`}
    >
      {busy === qual ? <Loader2 size={12} className="animate-spin mx-auto" /> : copiado === qual ? 'Copiado' : rotulo}
    </button>
  );

  return (
    <div className="col-span-3 flex flex-wrap gap-1 w-full" onClick={(e) => e.stopPropagation()} data-testid={`wa-ativa-intermodal-${mission.id}`}>
      {quais.agente && botao('agente', 'Copiar Agente', 'bg-green-600 hover:bg-green-700')}
      {quais.cliente && botao('cliente', 'Copiar Cliente', 'bg-blue-600 hover:bg-blue-700')}
      {quais.parceiro && botao('parceiro', 'Copiar Parceiro ATIVA', 'bg-emerald-700 hover:bg-emerald-800')}
    </div>
  );
}
