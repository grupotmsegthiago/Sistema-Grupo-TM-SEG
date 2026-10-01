import React from 'react';
import { usePortalMarca } from './portalMarca';

const ALTURA = {
  marca: 'h-11',
  destaque: 'h-16',
} as const;

export const LogoCeva: React.FC<{ tamanho?: keyof typeof ALTURA; className?: string }> = ({ tamanho = 'marca', className = '' }) => {
  const marca = usePortalMarca();
  return <img src={marca.logo} alt={marca.logoAlt} className={`${ALTURA[tamanho]} w-auto object-contain ${className}`} />;
};
