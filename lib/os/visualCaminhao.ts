export type TemaCaminhao = "dhl" | "ceva" | "ibl" | "tmseg";

export interface VisualCaminhao {
  tema: TemaCaminhao;
  logo: string | null;
  foto: string;
  fundo: string;
  recorte: string;
  rotulo: string;
}

/** Escolhe só a marca visual. Não inventa placa, modelo nem identificação de veículo. */
export function resolverVisualCaminhao(cliente: string): VisualCaminhao {
  const nome = (cliente || "").toUpperCase();
  if (nome.includes("DHL")) {
    return { tema: "dhl", logo: "/logo-dhl.svg", foto: "/caminhoes/dhl.jpg", fundo: "/caminhoes/3d/dhl-cena.jpg", recorte: "/caminhoes/3d/dhl-veiculo.webp", rotulo: "DHL" };
  }
  if (nome.includes("CEVA")) {
    return { tema: "ceva", logo: "/logo-ceva.png", foto: "/caminhoes/ceva.jpg", fundo: "/caminhoes/3d/ceva-cena.jpg", recorte: "/caminhoes/3d/ceva-veiculo.webp", rotulo: "CEVA" };
  }
  if (nome.includes("IBL")) {
    return { tema: "ibl", logo: "/logo-ibl.png", foto: "/caminhoes/ibl.jpg", fundo: "/caminhoes/3d/ibl-cena.jpg", recorte: "/caminhoes/3d/ibl-veiculo.webp", rotulo: "IBL" };
  }
  return { tema: "tmseg", logo: null, foto: "/caminhoes/generico.jpg", fundo: "/caminhoes/3d/generico-cena.jpg", recorte: "/caminhoes/3d/generico-veiculo.webp", rotulo: "TM SEG" };
}

/** Logotipo do cliente para o card. Não altera o tema do caminhão nem inventa placa. */
export function resolverLogoCliente(cliente: string): string | null {
  const nome = (cliente || "").toUpperCase();
  if (nome.includes("DHL")) return "/logo-dhl.svg";
  if (nome.includes("CEVA")) return "/logo-ceva.png";
  if (nome.includes("IBL")) return "/logo-ibl.png";
  if (nome.includes("AUTOPART")) return "/logos-clientes/brautoparts-sem-fundo.png";
  if (nome.includes("COMOLATTI") || nome.includes("COMOLLATI")) return "/logos-clientes/comolatti-sem-fundo.png";
  if (nome.includes("FLASH")) return "/logos-clientes/flash-sem-fundo.png";
  if (nome.includes("CESLOG")) return "/logos-clientes/ceslog-sem-fundo.png";
  return null;
}
