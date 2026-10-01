import React from 'react';
import CevaPortal from './CevaPortal';
import { PortalMarcaProvider } from './ceva/portalMarca';
import { MARCA_IBL } from '../lib/portalEscolta/marca';

/** Controle de escolta da IBL (Intermodal Brasil Logística), no mesmo modelo do portal CEVA. */
const IblPortal: React.FC = () => (
  <PortalMarcaProvider marca={MARCA_IBL}>
    <CevaPortal />
  </PortalMarcaProvider>
);

export default IblPortal;
