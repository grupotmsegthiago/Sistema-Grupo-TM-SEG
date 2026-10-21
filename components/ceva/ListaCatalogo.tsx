import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CampoListaSolicitacao } from '../../lib/cevaPortal/camposCliente';
import { usePortalCliente } from './portalMarca';

const CAMPO = 'h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-[var(--portal-acao)]';

/** No localhost o catálogo pode recusar a gravação. O nome segue só nesta solicitação. */
function ambienteDeTrabalhoLocal(): boolean {
  if (import.meta.env?.DEV) return true;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

type Props = {
  rotulo: string;
  campo: CampoListaSolicitacao;
  valor: string;
  opcoes: string[];
  obrigatorio?: boolean;
  avisoVazio?: string;
  podeRemover: boolean;
  somenteVisualizacao?: boolean;
  onChange: (valor: string) => void;
  onOpcoes: (opcoes: string[]) => void;
};

export const ListaCatalogo: React.FC<Props> = ({
  rotulo,
  campo,
  valor,
  opcoes,
  obrigatorio = false,
  avisoVazio,
  podeRemover,
  somenteVisualizacao = false,
  onChange,
  onOpcoes,
}) => {
  const portal = usePortalCliente();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  function usarNomeLocal(bruto: string) {
    const oficial = bruto.toLocaleUpperCase('pt-BR');
    const lista = opcoes.some((item) => item.toLocaleUpperCase('pt-BR') === oficial) ? opcoes : [...opcoes, oficial].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    onOpcoes(lista);
    onChange(oficial);
    setTexto('');
    setAberto(false);
    setErro('');
    setAviso('Neste ambiente a lista não foi gravada. O nome entra nesta solicitação e o formulário segue.');
  }

  async function incluir() {
    const nome = texto.trim().replace(/\s+/g, ' ');
    if (nome.length < 2) {
      setErro('Informe o nome.');
      return;
    }
    setOcupado(true);
    setErro('');
    setAviso('');
    try {
      if (somenteVisualizacao) {
        const oficial = nome.toLocaleUpperCase('pt-BR');
        const lista = opcoes.some((item) => item.toLocaleUpperCase('pt-BR') === oficial) ? opcoes : [...opcoes, oficial].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        onOpcoes(lista);
        onChange(oficial);
        setTexto('');
        setAberto(false);
        return;
      }
      const response = await fetch(portal.url('/catalogo'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
        body: JSON.stringify({ campo, valor: nome, confirmarNovo: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        portal.sair();
        setErro('Sessão expirada. Entre novamente.');
        return;
      }
      if (!response.ok) {
        if (ambienteDeTrabalhoLocal()) {
          usarNomeLocal(nome);
          return;
        }
        throw new Error(data.error || 'Não foi possível incluir.');
      }
      const oficial = String(data.valor || nome);
      const lista = opcoes.some((item) => item === oficial) ? opcoes : [...opcoes, oficial].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      onOpcoes(lista);
      onChange(oficial);
      setTexto('');
      setAberto(false);
    } catch (error) {
      if (ambienteDeTrabalhoLocal()) {
        usarNomeLocal(nome);
        return;
      }
      setErro(error instanceof Error ? error.message : 'Não foi possível incluir.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    if (!valor) return;
    if (!window.confirm(`Remover ${valor} da lista? As OS já gravadas continuam com esse nome.`)) return;
    setOcupado(true);
    setErro('');
    try {
      if (!somenteVisualizacao) {
        const response = await fetch(portal.url('/catalogo'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
          body: JSON.stringify({ campo, valor }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) portal.sair();
        if (!response.ok) throw new Error(data.error || 'Não foi possível remover.');
      }
      onOpcoes(opcoes.filter((item) => item !== valor));
      onChange('');
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível remover.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="block text-sm font-bold text-slate-600">
      <span className="flex items-center justify-between gap-2">
        {rotulo}
        <button type="button" title="Cadastrar" onClick={() => { setErro(''); setAviso(''); setAberto((atual) => !atual); }} className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--portal-acao)] px-3 text-xs font-black text-[var(--portal-acao-texto)] shadow-md">
          <Plus size={14} /> Novo
        </button>
      </span>
      <select required={obrigatorio} value={valor} onChange={(event) => onChange(event.target.value)} aria-label={rotulo} className="sr-only">
        <option value="">{opcoes.length ? 'Selecione' : 'Nenhum nome ainda'}</option>
        {opcoes.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <div className="mt-2 flex max-h-32 flex-wrap gap-2 overflow-auto">
        {opcoes.length === 0 && !valor && <p className="text-xs font-semibold text-slate-400">{avisoVazio || 'Nenhum nome ainda. Use Novo.'}</p>}
        {opcoes.map((item) => {
          const ativo = item === valor;
          return (
            <span key={item} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-black shadow-sm ${ativo ? 'border-[#0B2545] bg-[#0B2545] text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
              <button type="button" onClick={() => onChange(ativo ? '' : item)} className="text-left">{item}</button>
              {ativo && <span className="rounded-sm bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-[#0B2545]">Selecionado</span>}
              {podeRemover && ativo && (
                <button type="button" title="Remover da lista" disabled={ocupado} onClick={() => void remover()} className="text-white/80">
                  <Trash2 size={13} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      {aberto && (
        <div className="mt-2 flex items-center gap-2">
          <input value={texto} onChange={(event) => setTexto(event.target.value)} placeholder="Nome novo" className={CAMPO} />
          <button type="button" disabled={ocupado} onClick={() => void incluir()} className="h-10 rounded-full bg-[var(--portal-marca)] px-3 text-xs font-black text-white shadow-md disabled:opacity-50">Salvar</button>
        </div>
      )}
      {erro && <p className="mt-1 text-[11px] font-bold text-red-700">{erro}</p>}
      {aviso && <p className="mt-1 text-[11px] font-bold text-amber-800">{aviso}</p>}
    </div>
  );
};
