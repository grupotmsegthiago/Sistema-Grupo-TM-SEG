import React from "react";
import { resolverLogoCliente, resolverVisualCaminhao } from "../../lib/os/visualCaminhao";

interface Props {
  cliente: string;
  nome?: string;
  placa?: string;
  modelo?: string;
  motorista?: string;
  telefone?: string;
  atualizacao?: string;
  onChamar?: () => void;
}

const texto = (valor?: string) => {
  const limpo = (valor || "").trim();
  if (!limpo || limpo === "---" || limpo === "-") return "";
  return limpo;
};

/** Foto do caminhão na estrada, com os dados reais da OS por cima. */
const Vehicle3DCard: React.FC<Props> = ({ cliente, nome, placa, modelo, motorista, telefone, atualizacao, onChamar }) => {
  const visual = resolverVisualCaminhao(cliente);
  const logo = resolverLogoCliente(nome || "") || resolverLogoCliente(cliente);
  const placaVisivel = texto(placa);
  const modeloVisivel = texto(modelo);
  const motoristaVisivel = texto(motorista);
  const telefoneVisivel = texto(telefone);
  const atualizacaoVisivel = texto(atualizacao);

  return (
    <div className="os-veiculo3d" data-testid="caminhao-relevo" data-tema={visual.tema}>
      <div className="os-veiculo3d-moldura">
        <img className="os-veiculo3d-fundo" src={visual.foto} alt="" draggable={false} loading="lazy" decoding="async" />
        <div className="os-veiculo3d-luz" />
      </div>
      {logo ? (
        <div className="os-veiculo3d-marca" title={nome || cliente}>
          <img src={logo} alt="" />
        </div>
      ) : (nome || cliente) ? (
        <div className="os-veiculo3d-marca os-veiculo3d-marca--nome" title={nome || cliente}>
          <span>{nome || cliente}</span>
        </div>
      ) : null}
      {atualizacaoVisivel ? (
        <p className="os-veiculo3d-atualizacao" title={atualizacaoVisivel}>
          {atualizacaoVisivel}
        </p>
      ) : null}
      <div className="os-veiculo3d-dados">
        <strong>{placaVisivel || "—"}</strong>
        {modeloVisivel ? <span>{modeloVisivel}</span> : null}
        {motoristaVisivel ? <span>{motoristaVisivel}</span> : null}
        {telefoneVisivel ? <span>{telefoneVisivel}</span> : null}
      </div>
      {onChamar ? (
        <button type="button" className="os-veiculo3d-chamar" onClick={onChamar} title="Chamar motorista no WhatsApp">
          WhatsApp
        </button>
      ) : null}
    </div>
  );
};

export default Vehicle3DCard;
