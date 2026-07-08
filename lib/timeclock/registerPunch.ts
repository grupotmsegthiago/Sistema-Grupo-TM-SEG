import { generateContent } from '../gemini';
import { supabase } from '../supabase';
import { formatIsoDateBR } from '../dateUtils';
import { requestPresenceRefresh } from '../presenceChannel';
import type { TimeClockEntry, TimeClockStage, TimeClockUserContext } from './types';
import { getNextTimeClockStage } from './stages';
import { fetchTodayTimeClockEntriesFromApi } from './fetchEntriesApi';

export async function fetchTodayTimeClockEntries(userId: string): Promise<TimeClockEntry[]> {
  try {
    return await fetchTodayTimeClockEntriesFromApi(userId);
  } catch (apiErr) {
    const today = formatIsoDateBR();
    const { data, error } = await supabase
      .from('time_clock')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', `${today}T00:00:00`)
      .lte('timestamp', `${today}T23:59:59`)
      .order('timestamp', { ascending: true });

    if (error) {
      const msg = apiErr instanceof Error ? apiErr.message : 'Falha na API';
      throw new Error(error.message || msg);
    }
    return (data || []) as TimeClockEntry[];
  }
}

export async function verifySelfieForTimeClock(photoBase64: string): Promise<void> {
  const prompt =
    'Valide se o rosto está claro e se a pessoa está SEM óculos escuros e SEM boné. Responda apenas VALID ou o motivo do erro.';
  const resultText = await generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
        { text: prompt },
      ],
    },
  });

  if (!resultText.toUpperCase().includes('VALID')) {
    throw new Error('Falha na biometria: remova óculos/boné e garanta boa iluminação.');
  }
}

export async function uploadTimeClockPhoto(userId: string, photoBase64: string): Promise<string> {
  const path = `timeclock/${userId}/${Date.now()}.jpg`;
  const blob = await (await fetch(`data:image/jpeg;base64,${photoBase64}`)).blob();
  const { error } = await supabase.storage.from('mission-evidence').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) {
    return `data:image/jpeg;base64,${photoBase64}`;
  }
  const { data } = supabase.storage.from('mission-evidence').getPublicUrl(path);
  return data.publicUrl;
}

export interface RegisterTimeClockPunchInput {
  user: TimeClockUserContext;
  stage: TimeClockStage;
  photoBase64: string;
  signatureUrl: string;
  latitude: number;
  longitude: number;
}

export async function registerTimeClockPunch(
  input: RegisterTimeClockPunchInput
): Promise<TimeClockEntry> {
  const history = await fetchTodayTimeClockEntries(input.user.id);
  const expected = getNextTimeClockStage(history);
  if (expected === 'DONE') {
    throw new Error('Jornada de hoje já foi concluída.');
  }
  if (expected !== input.stage) {
    throw new Error(`Próxima batida esperada: ${expected}.`);
  }

  await verifySelfieForTimeClock(input.photoBase64);
  const photoUrl = await uploadTimeClockPhoto(input.user.id, input.photoBase64);

  const payload = {
    user_id: input.user.id,
    employee_id: input.user.employeeId || null,
    user_name: input.user.name,
    type: input.stage,
    timestamp: new Date().toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    photo_url: photoUrl,
    signature_url: input.signatureUrl,
    ai_verification: true,
    metadata: { stage: input.stage, device: 'mobile', source: 'mission-screen' },
  };

  const { data, error } = await supabase.from('time_clock').insert([payload]).select('*').single();
  if (error) throw error;

  try {
    requestPresenceRefresh();
  } catch {
    // se o canal de presença ainda não estiver ativo, não bloqueia a batida
  }

  return data as TimeClockEntry;
}
