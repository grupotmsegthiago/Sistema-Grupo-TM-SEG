import React, { useState } from 'react';
import {
  extrairCep,
  getRegionFromLocation,
  nomeRegiao,
  numerosDaCotacaoRegional,
  type VersaoTabelaRegional,
} from '../../lib/precificacao/tabela2027';

type LinhaTarifa = {
  operation_type?: string | null;
  price_per_extra_km?: number | null;
  price_per_extra_hour?: number | null;
};

type Props = {
  cliente: string;
  versao?: VersaoTabelaRegional;
  linhas?: LinhaTarifa[];
  origem: string;
  destino: string;
  km: string;
  onOrigem: (valor: string) => void;
  onDestino: (valor: string) => void;
  onKm: (valor: string) => void;
  tarifaKm?: number | null;
  horaExtra?: number | null;
  ocultarCampos?: boolean;
};

const reais = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const QuoteCalculatorCard: React.FC<Props> = ({
  cliente,
  versao = '2027',
  linhas = [],
  origem,
  destino,
  km,
  onOrigem,
  onDestino,
  onKm,
  tarifaKm,
  horaExtra,
  ocultarCampos = false,
}) => {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const local = getRegionFromLocation(origem, '', cliente);
  const kmNumero = Number(String(km).replace(',', '.'));
  const regional = numerosDaCotacaoRegional({
    cliente,
    origem,
    km: kmNumero,
    versao,
    linhas,
    tarifaKmFallback: tarifaKm,
    horaExtraFallback: horaExtra,
  });
  const conta = regional.aplicar ? regional.conta : null;
  const hora = regional.aplicar ? regional.horaExtra : horaExtra;

  const resolverCep = async () => {
    const cep = extrairCep(origem);
    if (!cep || origem.replace(/\D/g, '') !== cep) {
      return;
    }
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();
      if (!dados.erro && dados.uf) {
        const endereco = [dados.logradouro, dados.bairro, `${dados.localidade} - ${dados.uf}`].filter(Boolean).join(', ');
        onOrigem(endereco || `${dados.localidade} - ${dados.uf}`);
      }
    } catch {
      /* a região segue o texto digitado */
    } finally {
      setBuscandoCep(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3" data-testid="card-cotacao-unificada">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cotação</p>
        <h3 className="text-sm font-black text-gray-900 uppercase">Origem, destino e km</h3>
      </div>
      {!ocultarCampos && (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-[10px] font-bold uppercase text-gray-500">
          Origem
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-xs font-bold uppercase"
            value={origem}
            placeholder="Cidade, UF ou CEP"
            onChange={(evento) => onOrigem(evento.target.value)}
            onBlur={() => { void resolverCep(); }}
            data-testid="input-cotacao-origem"
          />
        </label>
        <label className="text-[10px] font-bold uppercase text-gray-500">
          Destino
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-xs font-bold uppercase"
            value={destino}
            placeholder="Cidade ou endereço"
            onChange={(evento) => onDestino(evento.target.value)}
            data-testid="input-cotacao-destino"
          />
        </label>
        <label className="text-[10px] font-bold uppercase text-gray-500">
          KM da rota
          <input
            className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-xs font-bold"
            value={km}
            inputMode="decimal"
            placeholder="0"
            onChange={(evento) => onKm(evento.target.value)}
            data-testid="input-cotacao-km"
          />
        </label>
      </div>
      )}
      {buscandoCep && <p className="text-[10px] font-bold uppercase text-gray-400">Buscando o CEP…</p>}
      {local.clienteContratual && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900" data-testid="cotacao-contratual">
          Cliente contratual. A cotação permanece na tabela já cadastrada de {local.motivo === 'cliente_ibl' ? 'IBL' : 'DHL'}.
        </p>
      )}
      {!local.clienteContratual && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]" data-testid="resultado-cotacao">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold uppercase text-gray-400">Região</p>
            <p className="mt-1 font-black text-gray-900">{nomeRegiao(local.region) || 'Informe a origem'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold uppercase text-gray-400">KM faturado</p>
            <p className="mt-1 font-black text-gray-900">{conta ? `${conta.kmFaturado} km` : '—'}</p>
            {conta?.usouMinimo && <p className="text-[10px] font-bold text-amber-700">Franquia de 100 km</p>}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold uppercase text-gray-400">Horas</p>
            <p className="mt-1 font-black text-gray-900">{conta ? `${conta.horasFaturadas} h` : '—'}</p>
            {conta && <p className="text-[10px] font-bold text-gray-500">{conta.minutos} min no corte</p>}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="font-bold uppercase text-gray-400">Total</p>
            <p className="mt-1 font-black text-gray-900">{conta ? reais(conta.valor) : '—'}</p>
            {conta && <p className="text-[10px] font-bold text-gray-500">Acionamento mínimo {reais(conta.acionamentoMinimo)}{hora != null && Number.isFinite(hora) ? ` · hora extra ${reais(hora)}` : ''}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteCalculatorCard;
