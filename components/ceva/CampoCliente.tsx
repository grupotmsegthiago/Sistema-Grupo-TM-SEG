import React, { useState } from 'react';
import { avisoInclusaoAdmin, decidirGravacao, SERVICOS_FIXOS, type CampoFiltro } from '../../lib/cevaPortal/camposCliente';
import { usePortalCliente } from './portalMarca';

type HistoricoPgr = { valor: string; anterior: string; em: string; por: string };
type HttpPortal = {
  url: (caminho: string) => string;
  cabecalhos: () => Record<string, string>;
  sair: () => void;
};

async function salvarCampo(http: HttpPortal, os: string, campo: string, valor: string, confirmarNovo: boolean) {
  const response = await fetch(http.url('/campos'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...http.cabecalhos() },
    body: JSON.stringify({ os, campo, valor, confirmarNovo }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) http.sair();
  if (response.status === 409 && data.confirmar) return { confirmar: true as const, nome: String(data.nome || '') };
  if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
  return { confirmar: false as const, valor: (data.valor ?? null) as string | null, filtro: (data.filtro ?? null) as string | null };
}

export const CampoFiltro: React.FC<{
  os: string;
  campo: CampoFiltro;
  valor: string | null;
  opcoes: string[];
  podeIncluirNovo?: boolean;
  onChange: (valor: string | null, filtroNovo: string | null) => void;
}> = ({ os, campo, valor, opcoes, podeIncluirNovo = true, onChange }) => {
  const portal = usePortalCliente();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(valor || '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const fixos = campo === 'servico' ? [...SERVICOS_FIXOS] : [];
  const busca = texto.trim().toLocaleLowerCase('pt-BR');
  const extras = opcoes.filter((item) => !fixos.some((fixo) => fixo.toLocaleLowerCase('pt-BR') === item.toLocaleLowerCase('pt-BR')) && (!busca || item.toLocaleLowerCase('pt-BR').includes(busca)));
  const sugestoes = [...fixos, ...extras];
  const decisao = decidirGravacao(campo, texto, [...fixos, ...opcoes]);

  async function gravar(escolha: string, confirmarNovo: boolean) {
    setSalvando(true);
    setErro('');
    try {
      const resultado = await salvarCampo(portal, os, campo, escolha, confirmarNovo);
      if (resultado.confirmar) return;
      onChange(resultado.valor, resultado.filtro);
      setAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="whitespace-nowrap rounded-lg px-1 py-0.5 text-left font-semibold hover:bg-black/5 hover:underline" onClick={() => { setTexto(valor || ''); setErro(''); setAberto(true); }}>
        {valor || '—'}
      </button>
    );
  }

  return (
    <div className="relative min-w-[180px]">
      <input
        autoFocus
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setAberto(false);
          if (event.key === 'Enter' && decisao.acao === 'aplicar') void gravar(decisao.valor, false);
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] text-black outline-none focus:border-[var(--portal-acao)]"
        placeholder={campo === 'servico' ? 'Escolha ou escreva' : 'Digite para filtrar'}
      />
      {sugestoes.length > 0 && (
        <ul className="absolute left-0 z-30 mt-1 max-h-36 w-full overflow-auto rounded-xl border border-slate-200 bg-white text-black shadow-lg">
          {sugestoes.map((item) => (
            <li key={item}>
              <button type="button" className="block w-full px-2 py-1 text-left hover:bg-slate-100" onClick={() => void gravar(item, false)}>
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
      {decisao.acao === 'confirmar' && !podeIncluirNovo && (
        <p className="relative z-40 mt-1 w-64 rounded-2xl border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">{avisoInclusaoAdmin(campo)}</p>
      )}
      {decisao.acao === 'confirmar' && podeIncluirNovo && (
        <div className={`relative z-40 w-64 rounded-2xl border border-slate-200 bg-white p-3 text-[11px] text-black shadow-lg ${sugestoes.length > 0 ? 'mt-28' : 'mt-1'}`}>
          <p>Tem certeza que deseja salvar com esse nome <strong>{decisao.nome}</strong>?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={salvando} className="rounded-full bg-[var(--portal-acao)] px-3 py-1 font-bold text-white" onClick={() => void gravar(texto, true)}>Salvar</button>
            <button type="button" className="rounded-full border border-slate-300 px-3 py-1" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {decisao.acao === 'limpar' && valor && (
        <button type="button" className="mt-1 text-[10px] underline" onClick={() => void gravar('', false)}>Limpar</button>
      )}
      {erro && <p className="mt-1 text-[10px] text-red-700">{erro}</p>}
    </div>
  );
};

export const CampoPgr: React.FC<{
  os: string;
  valor: string | null;
  onChange: (valor: string | null) => void;
}> = ({ os, valor, onChange }) => {
  const portal = usePortalCliente();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(valor || '');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState<HistoricoPgr[] | null>(null);
  const [dica, setDica] = useState<{ x: number; y: number } | null>(null);

  async function carregarHistorico() {
    if (historico) return historico;
    const response = await fetch(portal.url(`/pgr/${os}`), { headers: portal.cabecalhos() });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) portal.sair();
    const lista = Array.isArray(data.historico) ? data.historico as HistoricoPgr[] : [];
    setHistorico(lista);
    return lista;
  }

  async function gravar() {
    setSalvando(true);
    setErro('');
    try {
      const resultado = await salvarCampo(portal, os, 'atendimentoPgr', texto, false);
      if (resultado.confirmar) return;
      onChange(resultado.valor);
      setHistorico(null);
      setAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (aberto) {
    return (
      <div className="min-w-[200px]">
        <textarea
          autoFocus
          value={texto}
          onChange={(event) => setTexto(event.target.value)}
          rows={3}
          className="w-full rounded-xl border border-slate-300 bg-white px-2 py-1 text-[11px] text-black outline-none focus:border-[var(--portal-acao)]"
        />
        <div className="mt-1 flex gap-2">
          <button type="button" disabled={salvando} className="rounded-full bg-[var(--portal-acao)] px-3 py-1 text-[10px] font-bold text-white" onClick={() => void gravar()}>Salvar</button>
          <button type="button" className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[10px] text-black" onClick={() => setAberto(false)}>Cancelar</button>
        </div>
        {erro && <p className="mt-1 text-[10px] text-red-700">{erro}</p>}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="block max-w-[220px] truncate whitespace-nowrap rounded-lg px-1 py-0.5 text-left font-semibold hover:bg-black/5 hover:underline"
        onClick={() => { setTexto(valor || ''); setErro(''); setAberto(true); }}
        onMouseEnter={(event) => {
          setDica({ x: event.clientX, y: event.clientY });
          void carregarHistorico();
        }}
        onMouseLeave={() => setDica(null)}
      >
        {valor || '—'}
      </button>
      {dica && (
        <div className="fixed z-50 w-72 rounded-2xl border border-slate-200 bg-white p-3 text-left text-[11px] text-black shadow-xl" style={{ left: dica.x + 12, top: dica.y + 12 }}>
          <p className="font-bold">Histórico do PGR</p>
          {!historico && <p className="mt-1 text-slate-500">Carregando...</p>}
          {historico && historico.length === 0 && <p className="mt-1 text-slate-500">Nenhuma atualização.</p>}
          {historico && historico.map((item, index) => (
            <p key={`${item.em}-${index}`} className="mt-1 border-t border-slate-200 pt-1">
              <span className="font-bold">{new Date(item.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
              {' — '}{item.por}
              <br />
              {item.valor || '—'}
              {item.anterior ? <span className="block text-slate-500">Antes: {item.anterior}</span> : null}
            </p>
          ))}
        </div>
      )}
    </>
  );
};

export const IncluirCatalogo: React.FC<{
  campo: 'operacao' | 'tsp';
  rotulo: string;
  onIncluiu: (valor: string) => void;
}> = ({ campo, rotulo, onIncluiu }) => {
  const portal = usePortalCliente();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const decisao = decidirGravacao(campo, texto, []);

  async function gravar(confirmarNovo: boolean) {
    setSalvando(true);
    setErro('');
    try {
      const response = await fetch(portal.url('/catalogo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
        body: JSON.stringify({ campo, valor: texto, confirmarNovo }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) portal.sair();
      if (response.status === 409 && data.confirmar) return;
      if (!response.ok) throw new Error(data.error || 'Não foi possível incluir.');
      onIncluiu(String(data.valor || ''));
      setTexto('');
      setAberto(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível incluir.');
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => { setTexto(''); setErro(''); setAberto(true); }} className="h-8 rounded-full border border-[var(--portal-acao)] bg-white px-3 text-xs font-bold text-[var(--portal-acao)]">
        {rotulo}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        placeholder={campo === 'tsp' ? 'Nome da TSP' : 'Nome da operação'}
        className="h-8 w-40 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-[var(--portal-acao)]"
      />
      {decisao.acao === 'confirmar' && (
        <button type="button" disabled={salvando} onClick={() => void gravar(true)} className="h-8 rounded-full bg-[var(--portal-acao)] px-3 text-xs font-bold text-white">
          Salvar {decisao.nome}
        </button>
      )}
      <button type="button" onClick={() => setAberto(false)} className="h-8 rounded-full border border-slate-200 px-3 text-xs font-bold text-slate-500">Cancelar</button>
      {erro && <span className="text-[11px] font-semibold text-red-700">{erro}</span>}
    </div>
  );
};
