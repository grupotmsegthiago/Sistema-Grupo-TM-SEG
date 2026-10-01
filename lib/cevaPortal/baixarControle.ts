import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { CABECALHOS_CONTROLE, nomeArquivoControle } from './exportarControle';

export function baixarExcelControle(linhas: string[][], prefixo = 'ceva', cabecalhos: readonly string[] = CABECALHOS_CONTROLE): void {
  const planilha = XLSX.utils.aoa_to_sheet([[...cabecalhos], ...linhas]);
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Controle');
  XLSX.writeFile(livro, nomeArquivoControle('xlsx', new Date(), prefixo));
}

export function baixarPdfControle(linhas: string[][], titulo = 'Controle de Escolta CEVA', prefixo = 'ceva', cabecalhos: readonly string[] = CABECALHOS_CONTROLE): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const margem = 16;
  const largura = doc.internal.pageSize.getWidth() - margem * 2;
  const altura = doc.internal.pageSize.getHeight();
  const larguraColuna = largura / cabecalhos.length;
  const alturaLinha = 11;
  let y = margem + 12;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(titulo, margem, margem + 2);

  const escrever = (celulas: string[], negrito: boolean) => {
    if (y + alturaLinha > altura - margem) {
      doc.addPage();
      y = margem + 8;
    }
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(5);
    celulas.forEach((texto, index) => {
      const corte = doc.splitTextToSize(String(texto || ''), Math.max(4, larguraColuna - 1));
      doc.text(String(corte[0] || ''), margem + index * larguraColuna, y);
    });
    y += alturaLinha;
  };

  escrever([...cabecalhos], true);
  for (const linha of linhas) escrever(linha, false);
  doc.save(nomeArquivoControle('pdf', new Date(), prefixo));
}
