import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { prepararImagensDoElemento } from '../../lib/precificacao/imageUtils';

async function desenharPdf(artigo: HTMLElement): Promise<jsPDF> {
  await prepararImagensDoElemento(artigo);
  const canvas = await html2canvas(artigo, { scale: 2, useCORS: true, allowTaint: false, backgroundColor: '#f7f5f2', logging: false });
  const imagem = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largura = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const altura = (canvas.height * largura) / canvas.width;
  let restante = altura;
  let posicao = 0;
  pdf.addImage(imagem, 'PNG', 0, posicao, largura, altura);
  restante -= alturaPagina;
  while (restante > 0) {
    posicao = restante - altura;
    pdf.addPage();
    pdf.addImage(imagem, 'PNG', 0, posicao, largura, altura);
    restante -= alturaPagina;
  }
  return pdf;
}

/** PDF em Base64 para o anexo do e-mail. Não abre janela e não baixa o arquivo. */
export async function pdfBase64DaProposta(artigo: HTMLElement): Promise<string> {
  const pdf = await desenharPdf(artigo);
  return pdf.output('datauristring');
}

/** Abre o PDF já com as imagens em Base64 e também baixa o arquivo. A janela precisa ter sido aberta no clique. */
export async function abrirPdfDaProposta(artigo: HTMLElement, nomeArquivo: string, janela: Window | null): Promise<void> {
  const pdf = await desenharPdf(artigo);
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  if (janela && !janela.closed) janela.location.href = url;
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
