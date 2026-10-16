import React, { useEffect, useState } from 'react';
import { assinarArquivo } from '../lib/financeiro/assinarArquivoCliente';
import { extrairArquivoProtegido } from '../lib/financeiro/arquivoSeguro';

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string | null };

/** Abre o arquivo com link curto. Endereço de fora do storage segue normal. */
export function LinkArquivo({ href, children, onClick, ...resto }: LinkProps) {
  const protegido = Boolean(extrairArquivoProtegido(href));
  return (
    <a
      {...resto}
      href={protegido ? undefined : href || undefined}
      onClick={async (evento) => {
        onClick?.(evento);
        if (evento.defaultPrevented || !protegido) return;
        evento.preventDefault();
        const assinada = await assinarArquivo(href);
        if (!assinada) return;
        window.open(assinada, '_blank', 'noopener,noreferrer');
      }}
    >
      {children}
    </a>
  );
}

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement> & { src?: string | null };

/** Mostra a foto só depois da autorização. Não usa o link público antigo. */
export function ImgArquivo({ src, alt, ...resto }: ImgProps) {
  const [mostra, setMostra] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!src) {
      setMostra(null);
      return undefined;
    }
    if (!extrairArquivoProtegido(src)) {
      setMostra(src);
      return undefined;
    }
    setMostra(null);
    assinarArquivo(src).then((url) => {
      if (vivo) setMostra(url);
    });
    return () => {
      vivo = false;
    };
  }, [src]);
  if (!mostra) return null;
  return <img {...resto} src={mostra} alt={alt || ''} />;
}
