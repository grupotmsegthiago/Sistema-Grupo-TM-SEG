export type DhlReportPhase = 'origem' | 'em_viagem' | 'destino' | 'conclusao';

export interface DhlReportPhasePhoto {
  phase: DhlReportPhase;
  label: string;
  at: string | null;
  url: string | null;
  note: string | null;
}

/** Evidência fotográfica coletada do sistema (Atualizar OS, storage, logs). */
export interface DhlReportEvidenceItem {
  url: string;
  label: string;
  actionType: string;
  at: string | null;
  source: string;
}

export interface DhlReportOperationalMark {
  label: string;
  at: string | null;
}

export interface DhlOccurrenceReportInput {
  missionId: string;
  factsSummary?: string | null;
  /** Parecer da diretoria — linha de raciocínio e conclusão (independente de e-mails/evidências). */
  reportParecer?: string | null;
  emailLink?: string | null;
  emailAttachmentText?: string | null;
  directorName?: string | null;
  generatedAt?: string;
}

export interface DhlOccurrenceReportData {
  missionId: string;
  seNumber: string;
  client: string;
  provider: string;
  origin: string;
  destination: string;
  destinationOperational: string | null;
  clientVehiclePlate: string | null;
  escortVehiclePlate: string | null;
  agents: string[];
  scheduledOriginAt: string | null;
  marks: DhlReportOperationalMark[];
  phasePhotos: DhlReportPhasePhoto[];
  /** Todas as evidências fotográficas encontradas no sistema para esta OS. */
  allEvidencePhotos: DhlReportEvidenceItem[];
  delayMinutesAtOrigin: number | null;
  factsSummary: string | null;
  reportParecer: string | null;
  emailLink: string | null;
  emailAttachmentText: string | null;
  directorName: string;
  generatedAt: string;
  missionCreatedAt: string | null;
  clientVehicleModel: string | null;
  escortVehicleModel: string | null;
  scheduledMissionAt: string | null;
  odometerStartKm: string | null;
  odometerEndKm: string | null;
}
