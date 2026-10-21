import React from "react";
import { CarFront, MessageCircle, Shield, User } from "lucide-react";

export interface AgenteEscoltaCard {
  nome: string;
  onChamar: () => void;
  temTelefone: boolean;
}

interface Props {
  fornecedor: string;
  tipo: string;
  velada: boolean;
  placa: string;
  modelo: string;
  agentes: AgenteEscoltaCard[];
  emOperacao: boolean;
  onCobrar?: () => void;
  cobrado?: boolean;
  testId?: string;
}

/** Cena ilustrativa genérica. Não representa os agentes cadastrados. */
const EscortCinematic3DCard: React.FC<Props> = ({
  fornecedor,
  tipo,
  velada,
  placa,
  modelo,
  agentes,
  emOperacao,
  onCobrar,
  cobrado,
  testId,
}) => {
  const cenaConfirmada = Boolean(tipo) && !velada;
  const foto = velada
    ? "/assets/escort/escort-velada-tmseg.webp"
    : cenaConfirmada
      ? "/assets/escort/escort-characterized-composite.webp"
      : "/assets/missions/escort-unmarked-3d.svg";
  const legendaModelo = modelo ? modelo + " · VIATURA DE ESCOLTA" : "VIATURA DE ESCOLTA";

  return (
    <div className={"os-escolta-cine" + (velada || !cenaConfirmada ? " os-escolta-cine--velada" : "")}>
      <div className="os-escolta-cena" title={cenaConfirmada ? "Ilustração genérica de escolta caracterizada" : "Ilustração genérica. Não é a viatura cadastrada."}>
        <img src={foto} alt="" draggable={false} />
        {fornecedor ? (
          <span className="os-escolta-fornecedor" title={fornecedor}>
            <Shield size={12} />
            {fornecedor}
          </span>
        ) : null}
        {tipo ? (
          <span className={"os-escolta-tipo" + (velada ? " os-escolta-tipo--velada" : "")}>
            <CarFront size={11} />
            {tipo}
          </span>
        ) : null}
        <div className="os-escolta-legenda">
          <strong>{placa || "—"}</strong>
          <small>{legendaModelo}</small>
          {(agentes.length > 0 || emOperacao) ? (
            <span className="os-escolta-selos">
              {agentes.length > 0 ? <em>{agentes.length === 1 ? "1 AGENTE" : agentes.length + " AGENTES"}</em> : null}
              {emOperacao ? <em className="os-escolta-selo--ok">EM OPERAÇÃO</em> : null}
            </span>
          ) : null}
        </div>
      </div>
      {agentes.length > 0 ? (
        <div className="os-escolta-agentes">
          {agentes.map((agente, indice) => (
            <div className="os-escolta-agente" key={agente.nome + "-" + indice}>
              <User size={12} />
              <span title={agente.nome}>{agente.nome}</span>
              <button
                type="button"
                onClick={agente.onChamar}
                title={agente.temTelefone ? "Chamar " + agente.nome + " no WhatsApp" : "Telefone de " + agente.nome + " não localizado"}
              >
                <MessageCircle size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {onCobrar ? (
        <button
          type="button"
          onClick={onCobrar}
          data-testid={testId}
          title="Copiar texto para cobrar atualização no WhatsApp da equipe"
          className={"os-id-cobrar" + (cobrado ? " os-id-cobrar--ok" : "")}
        >
          {cobrado ? "Copiado" : "Cobrar atualização"}
        </button>
      ) : null}
    </div>
  );
};

export default EscortCinematic3DCard;
