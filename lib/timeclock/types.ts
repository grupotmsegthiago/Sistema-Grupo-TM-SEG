export type TimeClockStage = 'IN' | 'BREAK_START' | 'BREAK_END' | 'OUT';

export type TimeClockStageState = TimeClockStage | 'DONE';

export interface TimeClockEntry {
  id: string;
  user_id: string;
  employee_id?: string | null;
  user_name: string;
  type: TimeClockStage;
  timestamp: string;
  latitude?: number | null;
  longitude?: number | null;
  photo_url?: string | null;
  signature_url?: string | null;
  ai_verification?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface CltEmployeeInfo {
  id: string;
  user_id: string | null;
  full_name: string;
  contract_type: string;
  digital_signature_url?: string | null;
  matricula?: string | null;
  status?: string | null;
  email?: string | null;
  shift_type?: string | null;
  requires_timeclock?: boolean | null;
  face_photo_url?: string | null;
  face_registered_at?: string | null;
}

export interface TimeClockUserContext {
  id: string;
  name: string;
  email?: string;
  role?: string;
  employeeId?: string;
  contractType?: string;
  isClt?: boolean;
  requiresTimeclock?: boolean;
  shiftType?: 'diurno' | 'noturno';
  digitalSignatureUrl?: string | null;
  facePhotoUrl?: string | null;
  faceRegisteredAt?: string | null;
}
