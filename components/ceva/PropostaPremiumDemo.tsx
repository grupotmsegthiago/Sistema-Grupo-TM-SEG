import React from 'react';
import type { PropostaPortal } from '../../lib/portalCliente/cotacao';
import { pecasPublicadas } from '../../lib/portalCliente/propostaPremium';
import { PropostaPremium } from './PropostaPremium';

const proposta: PropostaPortal = {
  acordada: false,
  regiao: 'SUDESTE SP/RJ',
  origem: 'Rodovia Presidente Dutra, 17744 - Cumbica, Guarulhos - SP',
  destino: 'Av. Brigadeiro Faria Lima, 2232 - Jardim Paulistano, São Paulo - SP',
  paradas: [],
  acionamento: 690,
  kmFranquia: 100,
  horasFranquia: 3,
  kmExtra: 6.9,
  horaExtra: 159,
  operacao: 'SUDESTE SP/RJ',
  vigencia: '2027',
  kmRota: 46.6,
  duracaoMin: null,
  kmFaturado: 100,
  horasContadas: 3,
};

/** Página local da prévia. Não entra no menu e não grava cotação. */
export const PropostaPremiumDemo: React.FC = () => {
  return (
    <main className="min-h-screen bg-[#07080d]">
      <div className="mx-auto max-w-6xl">
        <PropostaPremium
          cliente="CEVA LOGISTICS"
          caminho="Rodovia Presidente Dutra, 17744 - Cumbica, Guarulhos - SP → Av. Brigadeiro Faria Lima, 2232 - Jardim Paulistano, São Paulo - SP"
          tabela="Rodovia Presidente Dutra x Av. Brig. Faria Lima"
          rota="Rodovia Presidente Dutra x Av. Brig. Faria Lima"
          regiao="SUDESTE SP/RJ"
          data="26 de outubro de 2026"
          validade="05/11/2026"
          proposta={proposta}
          cena={{
            mapa: '/propostas-premium/demo-mapa-ceva.png',
            carreta: '/caminhoes/3d/ceva-recorte.webp',
            logo: '/logo_ceva_portal.png',
            sobreporLogo: true,
          }}
          pecas={pecasPublicadas('CEVA LOGISTICS')}
          linkPublico
          altMapa="Mapa da rota calculada no Google"
        />
      </div>
    </main>
  );
};
