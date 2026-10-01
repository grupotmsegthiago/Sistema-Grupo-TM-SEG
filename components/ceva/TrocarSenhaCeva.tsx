import React, { useState } from 'react';
import type { SessaoCeva } from '../../lib/cevaPortal/sessaoCliente';
import { LogoCeva } from './LogoCeva';
import { usePortalCliente } from './portalMarca';

const CAMPO = 'mt-4 block text-sm font-semibold text-slate-600';
const CONTROLE = 'mt-1.5 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--portal-destaque)] focus:ring-4 focus:ring-[var(--portal-anel)]';

export const TrocarSenhaCeva: React.FC<{
  onTrocou: (sessao: SessaoCeva) => void;
  onSair: () => void;
}> = ({ onTrocou, onSair }) => {
  const portal = usePortalCliente();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      const response = await fetch(portal.url('/trocar-senha'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...portal.cabecalhos() },
        body: JSON.stringify({ senhaAtual, senhaNova, confirmacao }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && !data.user) {
        if (String(data.error || '').includes('atual')) throw new Error(data.error);
        portal.limpar();
        onSair();
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível trocar a senha.');
      const atual = portal.ler();
      if (!atual) {
        onSair();
        return;
      }
      onTrocou({ ...atual, user: { ...atual.user, trocarSenha: false } });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha de comunicação.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#091426] px-4 py-10">
      <form onSubmit={(event) => void enviar(event)} className="w-full max-w-md rounded-[2rem] bg-[var(--portal-fundo)] p-8 text-slate-800 shadow-2xl">
        <LogoCeva tamanho="destaque" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.22em] text-[var(--portal-destaque)]">Primeiro acesso</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--portal-marca)]">Troque a senha</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">A senha do e-mail é temporária. Cadastre uma nova para abrir o controle. Essa troca é obrigatória.</p>
        <label className={CAMPO}>Senha do e-mail
          <input type="password" value={senhaAtual} onChange={(event) => setSenhaAtual(event.target.value)} className={CONTROLE} autoComplete="current-password" required />
        </label>
        <label className={CAMPO}>Nova senha
          <input type="password" value={senhaNova} onChange={(event) => setSenhaNova(event.target.value)} className={CONTROLE} autoComplete="new-password" required />
        </label>
        <label className={CAMPO}>Confirmar nova senha
          <input type="password" value={confirmacao} onChange={(event) => setConfirmacao(event.target.value)} className={CONTROLE} autoComplete="new-password" required />
        </label>
        {erro && <p className="mt-4 text-sm text-red-700">{erro}</p>}
        <button type="submit" disabled={enviando} className="mt-6 h-12 w-full rounded-2xl bg-[var(--portal-acao)] text-sm font-bold text-white disabled:opacity-60">
          {enviando ? 'Trocando...' : 'Trocar e entrar'}
        </button>
        <button type="button" onClick={() => { portal.limpar(); onSair(); }} className="mt-3 w-full text-sm font-semibold text-slate-500">Sair</button>
      </form>
    </div>
  );
};
