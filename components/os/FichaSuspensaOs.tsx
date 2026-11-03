import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { horarioCurto, rotuloCidade } from "../../lib/os/mapaNoturno";

export interface ItemFicha {
  rotulo: string;
  valor?: string | null;
  largo?: boolean;
}

export interface MapaFicha {
  origem: string;
  destino: string;
  local: string;
  horario?: string;
  km?: number;
}

const limpo = (valor?: string | null) => {
  const texto = String(valor || "").trim();
  if (!texto || texto === "---" || texto === "-") return "";
  return texto;
};

export const FichaOs: React.FC<{
  titulo: string;
  nome: string;
  complemento?: string;
  logo?: string | null;
  itens: ItemFicha[];
  atualizacao?: string;
  localizacao?: string;
  mapa?: MapaFicha | null;
}> = ({ titulo, nome, complemento, logo, itens, atualizacao, localizacao, mapa }) => {
  const visiveis = itens.filter((item) => limpo(item.valor));
  const cidadeA = mapa ? rotuloCidade(mapa.origem) || "Origem" : "";
  const cidadeB = mapa ? rotuloCidade(mapa.local) : "";
  const cidadeC = mapa ? rotuloCidade(mapa.destino) || "Destino" : "";
  const detalhe = mapa
    ? [horarioCurto(mapa.horario || ""), mapa.km && mapa.km > 0 ? Math.round(mapa.km) + " km" : ""].filter(Boolean).join(" · ")
    : "";
  return (
    <div className="os-ficha-miolo">
      <header className="os-ficha-topo">
        {logo ? <img className="os-ficha-logo" src={logo} alt="" /> : null}
        <div>
          <small>{titulo}</small>
          <strong title={nome}>{nome || "Sem nome"}</strong>
          {limpo(complemento) && limpo(complemento) !== limpo(nome) ? <em title={complemento}>{complemento}</em> : null}
        </div>
      </header>
      {limpo(atualizacao) ? (
        <div className="os-ficha-atualizacao">
          <small>Última atualização</small>
          <strong title={atualizacao}>{atualizacao}</strong>
        </div>
      ) : null}
      {mapa ? (
        <div className="os-ficha-mapa">
          <img className="os-ficha-mapa-foto" src="/assets/missions/mapa-rota-noite.webp" alt="" />
          <div className="os-mapa-legenda">
            <p title={mapa.origem}><img src="/assets/missions/pin-origem.png" alt="" /><span><small>Ponto A · Origem</small><strong>{cidadeA}</strong></span></p>
            <p title={mapa.local || "Última posição ainda não informada"}><img src="/assets/missions/pin-localizacao.png" alt="" /><span><small>Ponto B · Última posição</small><strong>{cidadeB || "Sem posição"}</strong>{detalhe ? <em>{detalhe}</em> : null}</span></p>
            <p title={mapa.destino}><img src="/assets/missions/pin-destino.png" alt="" /><span><small>Ponto C · Destino</small><strong>{cidadeC}</strong></span></p>
          </div>
        </div>
      ) : null}
      {limpo(localizacao) ? (
        <div className="os-ficha-local">
          <small>Localização</small>
          <strong title={localizacao}>{localizacao}</strong>
        </div>
      ) : null}
      {visiveis.length > 0 ? (
        <div className="os-ficha-grade">
          {visiveis.map((item) => (
            <div key={item.rotulo} className={item.largo ? "os-ficha-item os-ficha-largo" : "os-ficha-item"}>
              <small>{item.rotulo}</small>
              <strong title={limpo(item.valor)}>{limpo(item.valor)}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

/** Painel que abre ao clicar na coluna e fecha ao clicar fora. */
const PainelSuspensoOs: React.FC<{ children: React.ReactNode; painel: React.ReactNode }> = ({ children, painel }) => {
  const ancora = useRef<HTMLDivElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 8, left: 8 });

  const aoClicar = (ev: React.MouseEvent) => {
    const alvo = ev.target as HTMLElement | null;
    if (alvo?.closest("button, a, summary, input, textarea, select, label")) return;
    setAberto((atual) => !atual);
  };

  useEffect(() => {
    if (!aberto) return;
    const ajustar = () => {
      const r = ancora.current?.getBoundingClientRect();
      const p = caixa.current;
      if (!r || !p) return;
      const margem = 8;
      const largura = p.offsetWidth || 380;
      const altura = Math.min(p.scrollHeight, window.innerHeight - margem * 2);
      let left = r.left;
      if (left + largura > window.innerWidth - margem) left = window.innerWidth - largura - margem;
      if (left < margem) left = margem;
      let top = Math.max(margem, r.top);
      if (top + altura > window.innerHeight - margem) top = Math.max(margem, window.innerHeight - altura - margem);
      setPos({ top, left });
    };
    ajustar();
    const depois = window.requestAnimationFrame(ajustar);
    const sairRolagem = (ev: Event) => {
      const alvo = ev.target as Node | null;
      if (alvo && caixa.current && (alvo === caixa.current || caixa.current.contains(alvo))) return;
      setAberto(false);
    };
    const fora = (ev: MouseEvent) => {
      const alvo = ev.target as Node | null;
      if (!alvo) return;
      if (ancora.current?.contains(alvo)) return;
      if (caixa.current?.contains(alvo)) return;
      setAberto(false);
    };
    window.addEventListener("resize", ajustar);
    window.addEventListener("scroll", sairRolagem, true);
    const ouvir = window.setTimeout(() => document.addEventListener("mousedown", fora), 0);
    return () => {
      window.cancelAnimationFrame(depois);
      window.clearTimeout(ouvir);
      window.removeEventListener("resize", ajustar);
      window.removeEventListener("scroll", sairRolagem, true);
      document.removeEventListener("mousedown", fora);
    };
  }, [aberto]);

  return (
    <div className="os-hover-ancora" ref={ancora} onClick={aoClicar}>
      {children}
      {aberto ? createPortal(
        <div className="os-ficha" ref={caixa} style={{ top: pos.top, left: pos.left }}>
          {painel}
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default PainelSuspensoOs;
