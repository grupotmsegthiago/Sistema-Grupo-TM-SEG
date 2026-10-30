/**
 * PDF da pré-fatura. Lê o snapshot já montado. Não grava valor e não chama Asaas.
 */
import { jsPDF } from 'jspdf';
import {
  formatarMoeda,
  linhasDoPdf,
  nomeCompetencia,
  situacaoPdf,
  textoInformacoes,
  totaisDaPreFatura,
  type LinhaPreFatura,
} from './preFaturaMensal';

export type DadosPdfPreFatura = {
  rascunho: boolean;
  competencia: string;
  emissorNome: string;
  emissorCnpj: string;
  clienteFantasia: string;
  clienteRazao: string;
  clienteCnpj: string;
  clienteEndereco: string;
  clienteTelefone: string;
  clienteEmail: string;
  linhas: LinhaPreFatura[];
};

const EMISSOR_NOME = 'GRUPO TM SEG';
const EMISSOR_CNPJ = '28.804.378/0001-67';

export function dadosEmissorPadrao(): { nome: string; cnpj: string } {
  return { nome: EMISSOR_NOME, cnpj: EMISSOR_CNPJ };
}

export function gerarPdfPreFatura(dados: DadosPdfPreFatura): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const margem = 12;
  const linhas = linhasDoPdf(dados.linhas);
  const totais = totaisDaPreFatura(dados.linhas);
  let y = 0;

  const cabecalho = () => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, largura, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('PRÉ-FATURA TM SEG', margem, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(nomeCompetencia(dados.competencia), margem, 19);
    if (dados.rascunho) {
      doc.setTextColor(252, 165, 165);
      doc.setFont('helvetica', 'bold');
      doc.text('RASCUNHO', largura - margem, 12, { align: 'right' });
    }
    doc.setTextColor(30, 41, 59);
    y = 36;
  };

  const quebra = (precisa: number) => {
    if (y + precisa <= altura - 16) return;
    doc.addPage();
    cabecalho();
  };

  const bloco = (titulo: string, linhasTexto: string[]) => {
    quebra(8 + linhasTexto.length * 4.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(127, 29, 29);
    doc.text(titulo, margem, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    for (const linha of linhasTexto) {
      const pedacos = doc.splitTextToSize(linha || '—', largura - margem * 2);
      for (const pedaco of pedacos) {
        quebra(4.2);
        doc.text(String(pedaco), margem, y);
        y += 4.2;
      }
    }
    y += 2;
  };

  cabecalho();
  bloco('EMISSOR', [
    dados.emissorNome || EMISSOR_NOME,
    `CNPJ ${dados.emissorCnpj || EMISSOR_CNPJ}`,
  ]);
  bloco('CLIENTE', [
    dados.clienteFantasia || dados.clienteRazao,
    dados.clienteRazao,
    dados.clienteCnpj ? `CNPJ ${dados.clienteCnpj}` : '',
    dados.clienteEndereco,
    [dados.clienteTelefone, dados.clienteEmail].filter(Boolean).join(' · '),
  ].filter(Boolean));
  bloco('SITUAÇÃO', [situacaoPdf(dados.linhas)]);
  bloco('INFORMAÇÕES', [textoInformacoes(dados.linhas)]);

  const colunas = [margem, margem + 28, margem + 108, margem + 148];
  const desenharGrade = () => {
    quebra(10);
    doc.setFillColor(15, 23, 42);
    doc.rect(margem, y - 4, largura - margem * 2, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('COBRANÇA', colunas[0] + 1, y);
    doc.text('DESCRIÇÃO DA COBRANÇA', colunas[1], y);
    doc.text('VALOR MENSAL', colunas[2], y);
    doc.text('VALOR', colunas[3], y);
    y += 6;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
  };

  desenharGrade();
  linhas.forEach((linha, indice) => {
    const descricao = doc.splitTextToSize(linha.descricao, 76);
    const alto = Math.max(6, descricao.length * 3.6 + 2);
    if (y + alto > altura - 20) {
      doc.addPage();
      cabecalho();
      desenharGrade();
    }
    if (indice % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margem, y - 3.2, largura - margem * 2, alto, 'F');
    }
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(linha.cobranca, colunas[0] + 1, y);
    doc.text(descricao, colunas[1], y);
    doc.text(`R$ ${formatarMoeda(linha.valorMensal)}`, colunas[2], y);
    doc.text(`R$ ${formatarMoeda(linha.valor)}`, colunas[3], y);
    y += alto;
  });

  quebra(12);
  doc.setDrawColor(15, 23, 42);
  doc.line(margem, y, largura - margem, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', colunas[1], y);
  doc.text(`R$ ${formatarMoeda(totais.faturar)}`, colunas[3], y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Documento gerado eletronicamente pelo GRUPO TM SEG', margem, altura - 8);

  const saida = doc.output('arraybuffer');
  return new Uint8Array(saida);
}
