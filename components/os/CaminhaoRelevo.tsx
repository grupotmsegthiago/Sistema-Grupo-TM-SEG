import React from "react";
import { resolverVisualCaminhao } from "../../lib/os/visualCaminhao";

interface Props {
  cliente: string;
  placa?: string;
  modelo?: string;
  motorista?: string;
  telefone?: string;
  onChamar?: () => void;
}

const texto = (valor?: string) => {
  const limpo = (valor || "").trim();
  if (!limpo || limpo === "---" || limpo === "-") return "";
  return limpo;
};

const CaminhaoRelevo: React.FC<Props> = ({ cliente, placa, modelo, motorista, telefone, onChamar }) => {
  const visual = resolverVisualCaminhao(cliente);
  const placaVisivel = texto(placa);
  const modeloVisivel = texto(modelo);
  const motoristaVisivel = texto(motorista);
  const telefoneVisivel = texto(telefone);

  return (
    <div className="os-caminhao-ancora" data-testid="caminhao-relevo" data-tema={visual.tema}>
      <div className="os-caminhao-sombra" />
      <div className="os-caminhao-palco">
        <img className="os-caminhao" src={visual.foto} alt="" draggable={false} />
        <div className="os-caminhao-marca">
          {visual.logo ? <img src={visual.logo} alt={visual.rotulo} /> : <span>TM SEG</span>}
        </div>
        <div className="os-caminhao-dados">
          <strong>{placaVisivel || "—"}</strong>
          {modeloVisivel ? <span>{modeloVisivel}</span> : null}
          {motoristaVisivel ? <span>{motoristaVisivel}</span> : null}
          {telefoneVisivel ? <span>{telefoneVisivel}</span> : null}
        </div>
        {onChamar ? (
          <button type="button" className="os-caminhao-chamar" onClick={onChamar} title="Chamar motorista no WhatsApp">
            WhatsApp
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default CaminhaoRelevo;
