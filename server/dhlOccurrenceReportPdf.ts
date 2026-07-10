/** Re-exporta de lib/ para compatibilidade com imports existentes no servidor Express. */
export {
  generateDhlOccurrenceReportPdf,
  generateDhlOccurrenceReportHtml,
  dhlOccurrenceReportFilename,
} from '../lib/dhlOccurrenceReport/generateReportOutput';
