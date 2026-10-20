import React from "react";
import { resolverVisualCaminhao } from "../../lib/os/visualCaminhao";

interface Props {
  cliente: string;
}

const CaminhaoRelevo: React.FC<Props> = ({ cliente }) => {
  const visual = resolverVisualCaminhao(cliente);
  return (
    <div className="os-caminhao-ancora" data-testid="caminhao-relevo" data-tema={visual.tema}>
      <div className="os-caminhao-palco">
        <img className="os-caminhao" src={visual.foto} alt="" draggable={false} />
      </div>
    </div>
  );
};

export default CaminhaoRelevo;