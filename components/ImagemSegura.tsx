import React from 'react';
import { DEFAULT_LOGO_BASE64 } from '../lib/precificacao/imageUtils';

type Props = React.ImgHTMLAttributes<HTMLImageElement>;

/** Se a logo ou a assinatura falhar, mostra o fallback embutido. */
const ImagemSegura: React.FC<Props> = ({ onError, alt = '', ...resto }) => (
  <img
    {...resto}
    alt={alt}
    onError={(evento) => {
      const imagem = evento.currentTarget;
      if (imagem.src !== DEFAULT_LOGO_BASE64) imagem.src = DEFAULT_LOGO_BASE64;
      onError?.(evento);
    }}
  />
);

export default ImagemSegura;
