import React, { useEffect, useState } from 'react';
import { ExperienciaProposta } from './ExperienciaProposta';
import type { PropostaPortal } from '../../lib/portalCliente/cotacao';

type Vista = {
  cliente: string;
  validade: string;
  proposta: PropostaPortal;
};

/** Quem recebe o link vê só esta proposta. Não há menu, login nem outras telas. */
export const PropostaPublica: React.FC<{ id: string; token: string }> = ({ id, token }) => {
  const [vista, setVista] = useState<Vista | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const resposta = await fetch(`/api/proposta-publica/${encodeURIComponent(id)}/${encodeURIComponent(token)}`);
        const corpo = await resposta.json().catch(() => ({}));
        if (!resposta.ok || !corpo.proposta) throw new Error(corpo.error || 'Link inválido ou vencido.');
        if (!ativo) return;
        setVista({
          cliente: String(corpo.cliente || ''),
          validade: String(corpo.validade || ''),
          proposta: corpo.proposta as PropostaPortal,
        });
      } catch (falha) {
        if (ativo) setErro(falha instanceof Error ? falha.message : 'Link inválido ou vencido.');
      }
    };
    void carregar();
    return () => { ativo = false; };
  }, [id, token]);

  if (erro) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0c0d10] px-6 text-center text-white">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[#d0121a]">Grupo TM SEG</p>
          <h1 className="mt-3 text-2xl font-semibold">Esta visualização não está disponível</h1>
          <p className="mt-3 text-sm text-white/80">{erro}</p>
        </div>
      </main>
    );
  }
  if (!vista) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#0c0d10] text-white">
        <p>Abrindo a proposta…</p>
      </main>
    );
  }
  return (
    <ExperienciaProposta
      frase=""
      mostrando
      somenteLeitura
      validadeTexto={vista.validade}
      proposta={vista.proposta}
      clienteInterno={vista.cliente}
      pedido={{
        regiao: vista.proposta.regiao,
        origem: vista.proposta.origem,
        destino: vista.proposta.destino,
        paradas: vista.proposta.paradas,
        km: vista.proposta.kmRota || 0,
      }}
      onFechar={() => undefined}
    />
  );
};
