export const RH_INPUT_CLASS = "w-full px-4 py-3 bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 text-sm font-medium text-gray-700";
export const RH_SELECT_CLASS = `${RH_INPUT_CLASS} appearance-none bg-[url('https://api.iconify.design/lucide/chevron-down.svg?color=%239ca3af')] bg-[length:1.25em] bg-no-repeat bg-[position:right_1rem_center]`;
export const RH_LABEL_CLASS = "text-xs font-bold text-gray-500 uppercase mb-1.5 block tracking-wider";

export const RH_CONTRACT_TYPES = ['CLT', 'PJ', 'Temporário', 'Estagiário', 'Aprendiz'] as const;
export const RH_EMPLOYEE_STATUS = ['Ativo', 'Férias', 'Afastado', 'Desligado', 'Experiência'] as const;
export const RH_COMMISSION_TYPES = ['Por OS', 'Por faturamento', 'Por entrega', 'Por coleta', 'Por cliente', 'Por veículo', 'Por equipe', 'Por região', 'Por meta mensal'] as const;
export const RH_BONUS_TYPES = ['Produtividade', 'Metas', 'Economia', 'Desempenho', 'OS concluída'] as const;
export const RH_LEAVE_TYPES = ['INSS', 'Acidente', 'Licença maternidade', 'Licença paternidade', 'Doença', 'Outros'] as const;
export const RH_PAYMENT_STATUS = ['Pago', 'Pendente', 'Cancelado'] as const;
export const RH_EXAM_TYPES = ['Admissional', 'Periódico', 'Retorno', 'Mudança de função', 'Demissional'] as const;
export const RH_DOC_TYPES = ['CPF', 'RG', 'CNH', 'Título', 'Reservista', 'Comprovante de residência', 'Carteira de Trabalho', 'PIS', 'Certificados', 'Contrato', 'Outros'] as const;

export const RH_MENU_IDS = [
  'rh-dashboard', 'rh-employees', 'rh-admissions', 'rh-positions', 'rh-departments',
  'rh-salaries', 'rh-benefits', 'rh-work-schedule', 'rh-timeclock', 'rh-commissions',
  'rh-awards', 'rh-bonuses', 'rh-warnings', 'rh-vacations', 'rh-leaves',
  'rh-payslips', 'rh-payroll', 'rh-reports', 'rh-settings', 'rh-point-report',
] as const;
