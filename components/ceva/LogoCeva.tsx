import React from 'react';

const ALTURA = {
  marca: 'h-11',
  destaque: 'h-16',
} as const;

export const LogoCeva: React.FC<{ tamanho?: keyof typeof ALTURA; className?: string }> = ({ tamanho = 'marca', className = '' }) => (
  <img src="/logo_ceva_portal.png" alt="CEVA Logistics" className={`${ALTURA[tamanho]} w-auto object-contain ${className}`} />
);
