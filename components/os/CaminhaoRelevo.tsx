import React, { useId, useState } from "react";
import { resolverVisualCaminhao } from "../../lib/os/visualCaminhao";

interface Props {
  cliente: string;
}

const PALETA = {
  dhl: { cabine: "#F8FAFC", faixa: "#D40511", carreta: "#FFCC00", vidro: "#7DD3FC", texto: "#111827" },
  ceva: { cabine: "#F8FAFC", faixa: "#E11D48", carreta: "#152C54", vidro: "#7DD3FC", texto: "#F8FAFC" },
  ibl: { cabine: "#F8FAFC", faixa: "#38BDF8", carreta: "#0C4A6E", vidro: "#BAE6FD", texto: "#F8FAFC" },
  tmseg: { cabine: "#F8FAFC", faixa: "#B91C1C", carreta: "#1F2937", vidro: "#93C5FD", texto: "#F8FAFC" },
} as const;

const CaminhaoRelevo: React.FC<Props> = ({ cliente }) => {
  const visual = resolverVisualCaminhao(cliente);
  const cor = PALETA[visual.tema];
  const id = useId().replace(/:/g, "");
  const [logoOk, setLogoOk] = useState(true);
  const mostrarLogo = Boolean(visual.logo) && logoOk;

  return (
    <div className="os-caminhao-ancora" data-testid="caminhao-relevo" data-tema={visual.tema}>
      <div className="os-caminhao-caixa" aria-hidden="true">
        <div className="os-caminhao-moldura" />
        <svg className="os-caminhao" viewBox="0 0 320 170" role="img">
          <title>{`Ilustração de caminhão ${visual.rotulo}`}</title>
          <defs>
            <linearGradient id={`${id}-lado`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
              <stop offset="0.22" stopColor={cor.carreta} />
              <stop offset="1" stopColor={cor.carreta} />
            </linearGradient>
            <linearGradient id={`${id}-cabine`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.4" stopColor={cor.cabine} />
              <stop offset="1" stopColor="#94A3B8" />
            </linearGradient>
            <linearGradient id={`${id}-teto`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.65" />
              <stop offset="1" stopColor={cor.carreta} />
            </linearGradient>
          </defs>
          <ellipse cx="150" cy="156" rx="118" ry="8" fill="rgba(15,23,42,0.22)" />
          <polygon points="22,78 168,78 188,52 42,52" fill={`url(#${id}-teto)`} stroke="rgba(15,23,42,0.15)" />
          <rect x="12" y="76" width="164" height="62" rx="8" fill={`url(#${id}-lado)`} stroke="rgba(15,23,42,0.2)" />
          <rect x="12" y="76" width="164" height="12" rx="4" fill={cor.faixa} />
          <path d="M28 102h132M28 118h132" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" />
          {mostrarLogo ? (
            <image
              href={visual.logo || undefined}
              x="36"
              y="98"
              width="112"
              height="28"
              preserveAspectRatio="xMidYMid meet"
              onError={() => setLogoOk(false)}
            />
          ) : (
            <text x="94" y="122" textAnchor="middle" fill={cor.texto} fontSize="16" fontFamily="Arial, sans-serif" fontWeight="700">
              TM SEG
            </text>
          )}
          <polygon points="168,64 250,64 268,48 186,48" fill="#E2E8F0" stroke="rgba(15,23,42,0.18)" />
          <path d="M160 72h92c14 0 24 8 32 20h22c4 0 6 3 6 7v16c0 4-3 7-8 7H160V72z" fill={`url(#${id}-cabine)`} stroke="rgba(15,23,42,0.28)" />
          <path d="M184 74h48c8 0 16 5 20 14H184V74z" fill={cor.vidro} />
          <rect x="292" y="98" width="12" height="7" rx="2" fill="#FDE68A" />
          <rect x="164" y="90" width="12" height="22" rx="2" fill={cor.faixa} />
          <g>
            <circle cx="58" cy="140" r="14" fill="#0F172A" />
            <circle cx="118" cy="140" r="14" fill="#0F172A" />
            <circle cx="236" cy="140" r="14" fill="#0F172A" />
            <circle cx="58" cy="140" r="6" fill="#E2E8F0" />
            <circle cx="118" cy="140" r="6" fill="#E2E8F0" />
            <circle cx="236" cy="140" r="6" fill="#E2E8F0" />
          </g>
        </svg>
      </div>
    </div>
  );
};

export default CaminhaoRelevo;