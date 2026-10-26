import React, { useEffect, useState } from 'react';
import { logoConhecido, type CenaVisual } from '../../lib/portalCliente/frotaVisual';

const CARRETAS: Record<string, string> = {
  ceva: '/caminhoes/3d/ceva-recorte.webp',
  dhl: '/caminhoes/3d/dhl-recorte.webp',
  ibl: '/caminhoes/3d/ibl-recorte.webp',
};

const GENERICA = '/caminhoes/3d/generico-recorte.webp';

/** A mesma cena do botão, do PDF, do e-mail e do link: mapa estático e a carreta do cliente. */
export function cenaDaProposta(cliente: string, mapa: string | null | undefined): CenaVisual | null {
  if (!mapa || !mapa.startsWith('data:image/')) return null;
  const logo = logoConhecido(cliente);
  return { mapa, carreta: carretaDoCliente(cliente), logo, sobreporLogo: Boolean(logo) };
}

/** Usa a carreta já gravada no projeto. A imagem nova, quando existe, chega pela prop src. */
export function carretaDoCliente(nome: string): string {
  const chave = nome.toLowerCase();
  if (chave.includes('ceva')) return CARRETAS.ceva;
  if (chave.includes('dhl')) return CARRETAS.dhl;
  if (chave.includes('ibl')) return CARRETAS.ibl;
  return GENERICA;
}

export const ClientTruckVisual: React.FC<{
  cliente: string;
  src?: string | null;
  logo?: string | null;
  className?: string;
}> = ({ cliente, src, logo, className = '' }) => {
  const [imagem, setImagem] = useState(src || carretaDoCliente(cliente));
  useEffect(() => {
    setImagem(src || carretaDoCliente(cliente));
  }, [src, cliente]);
  return (
    <span className="relative inline-flex items-end [filter:drop-shadow(0_18px_12px_rgba(0,0,0,0.55))]">
      <img
        src={imagem}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setImagem(GENERICA)}
        className={className}
      />
      {logo ? (
        <span className="pointer-events-none absolute left-[56%] top-[18%] flex h-[18%] w-[26%] items-center justify-center rounded-md bg-white/95 px-1 shadow-[0_8px_16px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80">
          <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
        </span>
      ) : null}
    </span>
  );
};

/** Foto da rota real com a carreta por cima. O traçado vem do mapa estático do Google. */
export const CenaRotaVisual: React.FC<{
  mapa: string;
  carreta: string;
  logo?: string | null;
  className?: string;
  faixa?: boolean;
  onMapaErro?: () => void;
}> = ({ mapa, carreta, logo, className = '', faixa = true, onMapaErro }) => (
  <div className={`relative h-full w-full overflow-hidden bg-slate-200 ${className}`}>
    <img
      src={mapa}
      alt="Mapa da rota calculada no Google"
      className="h-full w-full object-cover"
      onLoad={(evento) => {
        if (evento.currentTarget.naturalWidth < 80) onMapaErro?.();
      }}
      onError={() => onMapaErro?.()}
    />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_42%,rgba(8,16,32,0.5)_100%)]" />
    <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
      <ClientTruckVisual cliente="" src={carreta} logo={logo} className="h-48 w-auto max-w-none object-contain drop-shadow-[0_18px_18px_rgba(0,0,0,0.45)]" />
      {faixa && (
        <div className="mb-2 hidden gap-2 sm:flex">
          <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Escolta intermediada</p>
          <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Acompanhamento da operação</p>
          <p className="rounded-2xl border border-white/50 bg-white/75 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow backdrop-blur">Atendimento 24/7</p>
        </div>
      )}
    </div>
  </div>
);
