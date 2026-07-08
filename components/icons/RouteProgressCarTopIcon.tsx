import React from 'react';

interface Props {
  className?: string;
  title?: string;
}

/** Sedan prata visto de cima, apontando para a direita (direção da rota). */
const RouteProgressCarTopIcon: React.FC<Props> = ({
  className = 'h-8 w-auto drop-shadow-lg',
  title = 'Veículo em rota',
}) => (
  <svg
    viewBox="0 0 88 44"
    width="44"
    height="22"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label={title}
  >
    <title>{title}</title>
    {/* Sombra suave */}
    <ellipse cx="44" cy="40" rx="30" ry="3" fill="#000" opacity="0.18" />
    {/* Carroceria */}
    <rect x="14" y="8" width="60" height="26" rx="9" fill="#b8bec8" stroke="#8b93a0" strokeWidth="1.2" />
    {/* Capô / frente */}
    <path
      fill="#a8afb9"
      d="M58 10h12c2.2 0 4 1.8 4 4v18c0 2.2-1.8 4-4 4H58V10z"
    />
    {/* Para-choque dianteiro */}
    <rect x="72" y="14" width="4" height="14" rx="1.5" fill="#7d8694" />
    {/* Para-brisas */}
    <path fill="#4a5568" opacity="0.85" d="M52 12h10v18h-10a4 4 0 0 1-4-4v-10a4 4 0 0 1 4-4z" />
    <path fill="#5f6d7d" opacity="0.75" d="M24 12h14v18H24a4 4 0 0 1-4-4v-10a4 4 0 0 1 4-4z" />
    {/* Teto */}
    <rect x="30" y="14" width="24" height="14" rx="4" fill="#c9cfd8" />
    {/* Faróis */}
    <circle cx="76" cy="17" r="2" fill="#fde68a" opacity="0.9" />
    <circle cx="76" cy="25" r="2" fill="#fde68a" opacity="0.9" />
    {/* Rodas */}
    <circle cx="24" cy="10" r="4.2" fill="#2d3748" />
    <circle cx="24" cy="32" r="4.2" fill="#2d3748" />
    <circle cx="62" cy="10" r="4.2" fill="#2d3748" />
    <circle cx="62" cy="32" r="4.2" fill="#2d3748" />
    <circle cx="24" cy="10" r="1.6" fill="#9ca3af" />
    <circle cx="24" cy="32" r="1.6" fill="#9ca3af" />
    <circle cx="62" cy="10" r="1.6" fill="#9ca3af" />
    <circle cx="62" cy="32" r="1.6" fill="#9ca3af" />
  </svg>
);

export default RouteProgressCarTopIcon;
