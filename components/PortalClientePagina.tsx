import React, { useEffect, useState } from 'react';
import CevaPortal from './CevaPortal';
import { PortalMarcaProvider } from './ceva/portalMarca';
import { marcaPortalCliente, type MarcaPortal } from '../lib/portalEscolta/marca';

/** Página /slug. Se o cadastro não tiver portal, volta para o sistema. */
const PortalClientePagina: React.FC<{ slug: string }> = ({ slug }) => {
  const [marca, setMarca] = useState<MarcaPortal | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'portal' | 'ausente'>('carregando');

  useEffect(() => {
    let ativo = true;
    fetch('/api/cliente-portal/marca', { headers: { 'x-portal-slug': slug } })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!ativo) return;
        if (!data?.slug) {
          setEstado('ausente');
          return;
        }
        setMarca(marcaPortalCliente(data));
        setEstado('portal');
      })
      .catch(() => {
        if (ativo) setEstado('ausente');
      });
    return () => { ativo = false; };
  }, [slug]);

  useEffect(() => {
    if (estado === 'ausente') window.location.replace('/');
  }, [estado]);

  if (estado !== 'portal' || !marca) {
    return <p className="p-8 text-sm text-slate-500">Abrindo o portal...</p>;
  }
  return (
    <PortalMarcaProvider marca={marca}>
      <CevaPortal />
    </PortalMarcaProvider>
  );
};

export default PortalClientePagina;
