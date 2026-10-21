import React from "react";
import { horarioCurto, rotuloCidade, type PontoMapa } from "../../lib/os/mapaNoturno";

interface Props {
  origem: string;
  destino: string;
  ultimaLocal?: string;
  horario?: string;
  kmPercorrido?: number;
  kmTotal?: number;
  atual?: PontoMapa | null;
  aoAmpliar: () => void;
}

const MapaNoturnoOs: React.FC<Props> = ({ origem, destino, ultimaLocal, horario, kmPercorrido, atual, aoAmpliar }) => {
  const cidadeA = rotuloCidade(origem) || "Origem";
  const cidadeB = rotuloCidade(ultimaLocal || "");
  const cidadeC = rotuloCidade(destino) || "Destino";
  const hora = horarioCurto(horario || "");
  const km = kmPercorrido && kmPercorrido > 0 ? Math.round(kmPercorrido) : 0;
  const detalheB = [hora, km > 0 ? km + " km" : ""].filter(Boolean).join(" · ");

  return (
    <div className="os-mapa os-mapa-ilustrado" data-testid="mapa-noturno" title={atual ? "Imagem ilustrativa da rota. A última coordenada existe no sistema." : "Imagem ilustrativa da rota."}>
      <img className="os-mapa-base" src="/assets/missions/mapa-rota-noite.webp" alt="" />
      <div className="os-mapa-legenda">
        <p title={origem}>
          <img src="/assets/missions/pin-origem.png" alt="" />
          <span><small>Ponto A · Origem</small><strong>{cidadeA}</strong></span>
        </p>
        <p title={ultimaLocal || "Última posição ainda não informada"}>
          <img src="/assets/missions/pin-localizacao.png" alt="" />
          <span>
            <small>Ponto B · Última posição</small>
            <strong>{cidadeB || "Sem posição"}</strong>
            {detalheB ? <em>{detalheB}</em> : null}
          </span>
        </p>
        <p title={destino}>
          <img src="/assets/missions/pin-destino.png" alt="" />
          <span><small>Ponto C · Destino</small><strong>{cidadeC}</strong></span>
        </p>
      </div>
      {hora ? <span className="os-mapa-hora">{hora}</span> : null}
      <button type="button" className="os-mapa-ampliar" onClick={aoAmpliar} title="Abrir a rota no Google Maps">
        <img src="/assets/missions/map-expand.svg" alt="" />
      </button>
    </div>
  );
};

export default MapaNoturnoOs;
