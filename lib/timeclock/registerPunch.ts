import { generateContent } from '../gemini';
import { isGeminiUnavailableError } from '../geminiUnavailable';
import { supabase } from '../supabase';
import { getBrazilDayBounds } from '../dateUtils';
import { requestPresenceRefresh } from '../presenceChannel';
import { withTimeout, TimeoutError } from '../promiseTimeout';
import type { TimeClockEntry, TimeClockStage, TimeClockUserContext } from './types';
import { getNextTimeClockStage } from './stages';
import { fetchTimeClockEntriesFromApi } from './fetchEntriesApi';
import { requiresTimeclockUser } from './eligibility';
import { registerTimeClockPunchViaApi } from './punchApi';
import { validateFaceAgainstRegistered } from './faceAuth';
import { fetchActiveShiftEntries } from './shiftEntries';

const SELFIE_VERIFY_TIMEOUT_MS = 25_000;

async function fetchDayTimeClockEntries(userId: string, isoDate: string): Promise<TimeClockEntry[]> {
  const uid = String(userId);
  const { start, end } = getBrazilDayBounds(isoDate);

  try {
    const { data, error } = await supabase
      .from('time_clock')
      .select('*')
      .eq('user_id', uid)
      .gte('timestamp', start)
      .lte('timestamp', end)
      .order('timestamp', { ascending: true });

    if (!error) {
      return (data || []) as TimeClockEntry[];
    }
    console.warn('[timeclock] Supabase read falhou, tentando API:', error.message);
  } catch (supabaseErr) {
    console.warn('[timeclock] Supabase read exceção, tentando API:', supabaseErr);
  }

  const entries = await fetchTimeClockEntriesFromApi({
    startDate: isoDate,
    endDate: isoDate,
    userId: uid,
  });
  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function fetchTodayTimeClockEntries(
  userId: string,
  options?: { shiftType?: string | null },
): Promise<TimeClockEntry[]> {
  const uid = String(userId);
  try {
    return await fetchActiveShiftEntries(uid, fetchDayTimeClockEntries, options?.shiftType);
  } catch (apiErr) {
    const msg = apiErr instanceof Error ? apiErr.message : 'Falha na API';
    throw new Error(msg);
  }
}

/** Valida selfie via IA. Retorna true se aprovada; false se timeout/falha de rede (não bloqueia). */
export async function verifySelfieForTimeClock(photoBase64: string): Promise<boolean> {
  const prompt =
    'Valide se o rosto está claro e se a pessoa está SEM óculos escuros e SEM boné. Responda apenas VALID ou o motivo do erro.';
  try {
    const resultText = await withTimeout(
      generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: photoBase64 } },
            { text: prompt },
          ],
        },
      }),
      SELFIE_VERIFY_TIMEOUT_MS,
      'Timeout na verificação biométrica',
    );

    if (!resultText.toUpperCase().includes('VALID')) {
      throw new Error('Falha na biometria: remova óculos/boné e garanta boa iluminação.');
    }
    return true;
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.warn('[timeclock] Verificação biométrica por IA expirou — registrando sem validação automática.');
      return false;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (isGeminiUnavailableError(msg)) {
      console.warn('[timeclock] Verificação biométrica indisponível:', msg);
      return false;
    }
    throw e;
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
  latitude?: number | null;
  longitude?: number | null;
}

export async function registerTimeClockPunch(
  input: RegisterTimeClockPunchInput
): Promise<TimeClockEntry> {
  if (!requiresTimeclockUser(input.user)) {
    throw new Error('Seu perfil não exige registro de ponto.');
  }

  const history = await fetchTodayTimeClockEntries(input.user.id, {
    shiftType: input.user.shiftType,
  });
  const expected = getNextTimeClockStage(history);
  if (expected === 'DONE') {
    throw new Error('Jornada de hoje já foi concluída.');
  }
  if (expected !== input.stage) {
    throw new Error(`Próxima batida esperada: ${expected}.`);
  }

  try {
    if (input.user.facePhotoUrl) {
      await validateFaceAgainstRegistered(input.user.facePhotoUrl, input.photoBase64);
    } else {
      const aiVerified = await verifySelfieForTimeClock(input.photoBase64);
      if (!aiVerified) {
        console.warn('[timeclock] Selfie sem validação IA (primeiro cadastro ou IA indisponível)');
      }
    }
  } catch (faceErr) {
    const msg = faceErr instanceof Error ? faceErr.message : String(faceErr);
    if (isGeminiUnavailableError(msg)) {
      console.warn('[timeclock] Validação facial ignorada — IA indisponível:', msg);
    } else {
      throw faceErr;
    }
  }

  try {
    const entry = await registerTimeClockPunchViaApi({
      stage: input.stage,
      photoBase64: input.photoBase64,
      signatureUrl: input.signatureUrl,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    });
    try {
      requestPresenceRefresh();
    } catch {
      // não bloqueia
    }
    return entry;
  } catch (apiErr) {
    console.warn('[timeclock] API punch falhou, fallback Supabase:', apiErr);
  }

  const aiVerified = input.user.facePhotoUrl
    ? true
    : await verifySelfieForTimeClock(input.photoBase64);
  const photoUrl = await uploadTimeClockPhoto(input.user.id, input.photoBase64);

  const payload = {
    user_id: String(input.user.id),
    employee_id: input.user.employeeId || null,
    user_name: input.user.name,
    type: input.stage,
    timestamp: new Date().toISOString(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    photo_url: photoUrl,
    signature_url: input.signatureUrl,
    ai_verification: aiVerified,
    metadata: {
      stage: input.stage,
      device: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
      source: 'client-fallback',
      ai_skipped: !aiVerified,
    },
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
