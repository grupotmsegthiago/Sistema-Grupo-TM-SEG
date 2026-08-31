import { authFetch } from '../authFetch';
import { parseJsonResponse } from '../parseJsonResponse';
import type {
  RhMedicalExam,
  SaveRhMedicalExamInput,
} from './medicalExamsApiCore';

const ENDPOINT = '/api/rh/employees/medical-exams';
export const GENERIC_MEDICAL_EXAM_ERROR = 'Falha ao operar exames médicos';

async function requireOk(response: Response): Promise<any> {
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    throw new Error(GENERIC_MEDICAL_EXAM_ERROR);
  }
  return payload;
}

export const medicalExamsClient = {
  async list(employeeId: string): Promise<RhMedicalExam[]> {
    const response = await authFetch(
      `${ENDPOINT}?employeeId=${encodeURIComponent(employeeId)}`,
    );
    const payload = await requireOk(response);
    return (payload?.medicalExams || []) as RhMedicalExam[];
  },

  async create(input: SaveRhMedicalExamInput): Promise<RhMedicalExam> {
    const response = await authFetch(ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.medicalExam as RhMedicalExam;
  },

  async update(
    id: string,
    input: SaveRhMedicalExamInput,
  ): Promise<RhMedicalExam> {
    const response = await authFetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    const payload = await requireOk(response);
    return payload.medicalExam as RhMedicalExam;
  },

  async remove(id: string): Promise<void> {
    const response = await authFetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    await requireOk(response);
  },
};
