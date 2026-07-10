export type DhlReportPhase = 'origem' | 'em_viagem' | 'destino' | 'conclusao';

export interface DhlReportPhasePhoto {
  phase: DhlReportPhase;
  label: string;
  at: string | null;
  url: string | null;
  note: string | null;
}

export interface DhlReportOperationalMark {
  label: string;
  at: string | null;
}

export interface DhlOccurrenceReportInput {
  missionId: string;
  factsSummary?: string | null;
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
  delayMinutesAtOrigin: number | null;
  factsSummary: string | null;
  emailLink: string | null;
  emailAttachmentText: string | null;
  directorName: string;
  generatedAt: string;
}
