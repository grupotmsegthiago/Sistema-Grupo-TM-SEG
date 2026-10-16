import React, { useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch';
import { rotuloCampo, textoValorCampo } from '../lib/reaprovacaoFinanceira/camposEdicao';
import {
  ETAPAS_REAPROVACAO,
  type CampoAuditado,
  type EtapasReaprovacao,
} from '../lib/reaprovacaoFinanceira/tipos';
import { etapasVazias, percentualExibido, rotuloEtapa } from '../lib/reaprovacaoFinanceira/regras';

type Resposta = {
  ok?: boolean;
  erro?: string;
  percentual?: number;
  etapas?: EtapasReaprovacao;
  status?: string;
};

async function capturar(elemento: HTMLElement): Promise<string> {
  const html2canvas = (await import('html2canvas')).default;
  const canvas = await html2canvas(elemento, { backgroundColor: '#ffffff', scale: 1, logging: false });
  const data = canvas.toDataURL('image/jpeg', 0.85);
  if (!data.startsWith('data:image/jpeg')) throw new Error('captura');
  return data;
}

export default function EdicaoTotalConfirmacao({
  campos,
  capturaAntes,
  osId,
  cliente,
  raiz,
  onFechar,
  onConcluida,
}: {
  campos: CampoAuditado[];
  capturaAntes: string;
  osId: string;
  cliente: string;
  raiz: HTMLElement | null;
  onFechar: () => void;
  onConcluida: () => void;
}) {
  const [justificativa, setJustificativa] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [tentativaId, setTentativaId] = useState('');

  useEffect(() => {
    setTentativaId(crypto.randomUUID());
  }, []);

  const concluida = resposta?.ok === true && resposta.status === 'concluida';
  const etapas = resposta?.etapas || etapasVazias();
  const percentual = percentualExibido(resposta?.percentual ?? 0, concluida);

  const confirmar = async () => {
    if (enviando || concluida) return;
    setErro('');
    if (justificativa.trim().length < 8) {
      setErro('A justificativa é obrigatória.');
      return;
    }
    if (!senha.trim()) {
      setErro('Informe a senha pessoal.');
      return;
    }
    if (!capturaAntes.startsWith('data:image/jpeg') || !raiz) {
      setErro('A captura anterior não está disponível. Nada foi salvo.');
      return;
    }
    setEnviando(true);
    let capturaDepois = '';
    const painel = raiz.querySelector('[data-testid="edicao-total-confirmacao"]') as HTMLElement | null;
    if (painel) painel.style.visibility = 'hidden';
    try {
      capturaDepois = await capturar(raiz);
    } catch {
      setEnviando(false);
      setErro('Falha na captura do estado novo. Nada foi salvo.');
      return;
    } finally {
      if (painel) painel.style.visibility = '';
    }
    try {
      const res = await authFetch('/api/reaprovacao-financeira?op=edicao-total', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missionId: osId,
          tentativaId,
          justificativa: justificativa.trim(),
          senha,
          capturaAntes,
          capturaDepois,
          campos,
          cliente,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Resposta;
      setSenha('');
      setResposta(data);
      if (data.ok === true && data.status === 'concluida' && data.percentual === 100) {
        window.setTimeout(() => onConcluida(), 600);
        return;
      }
      setErro(data.erro || 'A edição não foi concluída. Nada foi salvo.');
    } catch {
      setSenha('');
      setErro('Falha de comunicação. Nada foi salvo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[140] flex items-center justify-center bg-black/70 p-4" data-testid="edicao-total-confirmacao">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-4 border border-gray-200">
        <h3 className="text-sm font-black text-slate-900">Confirmar alterações</h3>
        <p className="text-[11px] text-gray-600 mt-1">OS {osId}{cliente ? ` · ${cliente}` : ''}. A senha é conferida no servidor.</p>
        <ul className="mt-3 space-y-1">
          {campos.map((campo) => (
            <li key={campo.campo} className="text-[11px] text-gray-800">
              {rotuloCampo(campo.campo)}: {textoValorCampo(campo.campo, campo.antes)} → {textoValorCampo(campo.campo, campo.depois)}
            </li>
          ))}
        </ul>
        <label className="block mt-3 text-[10px] font-black uppercase text-gray-500">Justificativa</label>
        <textarea
          value={justificativa}
          onChange={(e) => setJustificativa(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
          rows={3}
          data-testid="edicao-total-justificativa"
        />
        <label className="block mt-2 text-[10px] font-black uppercase text-gray-500">Senha pessoal</label>
        <input
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="mt-1 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs"
          data-testid="edicao-total-senha"
        />
        <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-600" style={{ width: `${percentual}%` }} />
        </div>
        <p className="text-[10px] text-gray-500 mt-1">{percentual}%</p>
        <ul className="mt-1">
          {ETAPAS_REAPROVACAO.map((etapa) => (
            <li key={etapa} className="text-[10px] text-gray-500">{etapas[etapa] ? '●' : '○'} {rotuloEtapa(etapa)}</li>
          ))}
        </ul>
        {erro && <p className="mt-2 text-[11px] font-bold text-red-700">{erro}</p>}
        <div className="mt-3 flex gap-2 justify-end">
          <button type="button" onClick={onFechar} disabled={enviando} className="px-3 py-2 text-[10px] font-black uppercase text-slate-500" data-testid="edicao-total-cancelar">Cancelar</button>
          <button type="button" onClick={() => { void confirmar(); }} disabled={enviando || concluida} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase disabled:opacity-50" data-testid="edicao-total-confirmar">
            {enviando ? 'Salvando…' : 'Confirmar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
}
