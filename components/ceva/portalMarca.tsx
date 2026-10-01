import React, { createContext, useContext, useMemo } from 'react';
import { MARCA_CEVA, type MarcaPortal } from '../../lib/portalEscolta/marca';
import {
  cabecalhosPortal,
  gravarSessaoPortal,
  lerSessaoPortal,
  limparSessaoPortal,
  sairDoPortal,
  type SessaoCeva,
} from '../../lib/cevaPortal/sessaoCliente';

const MarcaContexto = createContext<MarcaPortal>(MARCA_CEVA);

export const PortalMarcaProvider: React.FC<{ marca: MarcaPortal; children: React.ReactNode }> = ({ marca, children }) => (
  <MarcaContexto.Provider value={marca}>{children}</MarcaContexto.Provider>
);

export function usePortalMarca(): MarcaPortal {
  return useContext(MarcaContexto);
}

export function usePortalCliente() {
  const marca = usePortalMarca();
  return useMemo(() => ({
    marca,
    url: (caminho: string) => `${marca.api}${caminho}`,
    cabecalhos: () => cabecalhosPortal(marca.chaveSessao),
    sair: () => sairDoPortal(marca.chaveSessao, marca.eventoSair),
    ler: () => lerSessaoPortal(marca.chaveSessao),
    gravar: (sessao: SessaoCeva) => gravarSessaoPortal(marca.chaveSessao, sessao),
    limpar: () => limparSessaoPortal(marca.chaveSessao),
  }), [marca]);
}

export const PortalCasca: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const marca = usePortalMarca();
  return (
    <div className={className} style={marca.css as React.CSSProperties}>
      {children}
    </div>
  );
};
