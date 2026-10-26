import React from 'react';
import ImagemSegura from '../ImagemSegura';
import { usePortalMarca } from './portalMarca';

const ALTURA = {
  marca: 'h-11',
  destaque: 'h-16',
} as const;

export const LogoCeva: React.FC<{ tamanho?: keyof typeof ALTURA; className?: string }> = ({ tamanho = 'marca', className = '' }) => {
  const marca = usePortalMarca();
  if (!marca.logo) {
    return <span className={`inline-flex items-center px-1 text-sm font-black text-[var(--portal-marca)] ${className}`}>{marca.rotulo}</span>;
  }
  return <ImagemSegura src={marca.logo} alt={marca.logoAlt} className={`${ALTURA[tamanho]} w-auto object-contain ${className}`} />;
};
