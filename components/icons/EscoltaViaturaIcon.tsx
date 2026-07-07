import React from 'react';

interface Props {
  className?: string;
  title?: string;
}

/** Viatura de escolta — silhueta lateral vetorizada, sem fundo. */
const EscoltaViaturaIcon: React.FC<Props> = ({
  className = 'h-5 w-auto text-white drop-shadow-md',
  title = 'Viatura de escolta',
}) => (
  <svg
    viewBox="0 0 96 28"
    width="52"
    height="18"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    {title ? <title>{title}</title> : null}
    {/* Rodas */}
    <circle cx="22" cy="21" r="4.2" fill="currentColor" />
    <circle cx="68" cy="21" r="4.2" fill="currentColor" />
    <circle cx="22" cy="21" r="1.6" fill="#1e3a5f" opacity="0.45" />
    <circle cx="68" cy="21" r="1.6" fill="#1e3a5f" opacity="0.45" />
    {/* Carroceria */}
    <path
      fill="currentColor"
      stroke="#0f172a"
      strokeWidth="0.6"
      strokeLinejoin="round"
      d="M6 18.5c0-2.2 1.8-4 4-4h3.2l3.8-5.2c.5-.7 1.3-1.1 2.2-1.1h14.3c.8 0 1.6.3 2.1.9l2.4 2.8h7.8l7.2 3.4c1 .5 1.6 1.5 1.6 2.6V18H6v.5zm5.5-4.2 4.2-5.6h12.8l2.8 3.4H18.2l-6.7 2.2zm19.5-.8h11.5l4.8 3.6H43l-3-3.6zm16.2 0 5.8 4.4h10.2l-2.8-4.4H47.2z"
    />
    {/* Vidros */}
    <path
      fill="#1e3a5f"
      opacity="0.55"
      d="M24.5 11.8h11.2l2.6 3.2H27.8l-3.3-3.2zm15.8 0h10.8l3.4 3.2H43.8l-3.5-3.2z"
    />
    {/* Giroflex */}
    <rect x="44" y="8.2" width="5.2" height="2.2" rx="0.6" fill="#dc2626" />
    {/* Farol */}
    <path fill="#fde68a" d="M83.5 14.2h2.8v2.4h-2.8a1.2 1.2 0 1 1 0-2.4z" />
  </svg>
);

export default EscoltaViaturaIcon;
