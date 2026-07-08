import { generateContent } from '../gemini';
import { isGeminiUnavailableError } from '../geminiUnavailable';
import { supabase } from '../supabase';
import { withTimeout, TimeoutError } from '../promiseTimeout';

const FACE_VERIFY_TIMEOUT_MS = 25_000;

const FACE_REGISTER_PROMPT =
  'Valide esta foto de cadastro facial. Regras: (1) rosto humano claro e visível; ' +
  '(2) SEM óculos escuros; (3) SEM boné ou chapéu. Responda apenas VALID ou ERR_GLASSES, ERR_HAT, ERR_FACE.';

const FACE_MATCH_PROMPT =
  'Compare estas duas fotos do MESMO funcionário. A primeira é o cadastro oficial; a segunda é a selfie atual. ' +
  'Regras: (1) deve ser a mesma pessoa; (2) selfie SEM óculos escuros; (3) SEM boné. ' +
  'Responda apenas VALID ou ERR_MISMATCH, ERR_GLASSES, ERR_HAT, ERR_FACE.';

function parseFaceResult(text: string): void {
  const r = text.trim().toUpperCase();
  if (r.includes('VALID')) return;
  if (r.includes('GLASSES')) throw new Error('Remova os óculos para validação facial.');
  if (r.includes('HAT')) throw new Error('Remova boné ou chapéu para validação facial.');
  if (r.includes('MISMATCH')) throw new Error('Rosto não confere com o cadastro facial.');
  throw new Error('Rosto não identificado corretamente. Tente novamente com boa iluminação.');
}

async function callFaceGemini(parts: { mimeType: string; data: string }[], prompt: string): Promise<void> {
  const resultText = await withTimeout(
    generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [...parts.map((p) => ({ inlineData: p })), { text: prompt }] },
    }),
    FACE_VERIFY_TIMEOUT_MS,
    'Timeout na validação facial',
  );
  parseFaceResult(resultText);
}

/** Valida selfie para cadastro facial inicial. */
export async function validateFaceForRegistration(photoBase64: string): Promise<void> {
  try {
    await callFaceGemini([{ mimeType: 'image/jpeg', data: photoBase64 }], FACE_REGISTER_PROMPT);
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.warn('[faceAuth] Timeout no cadastro — permitindo com aviso');
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (isGeminiUnavailableError(msg)) {
      console.warn('[faceAuth] IA indisponível no cadastro — permitindo sem validação automática:', msg);
      return;
    }
    throw e;
  }
}

/** Compara selfie com foto cadastrada. */
export async function validateFaceAgainstRegistered(
  registeredPhotoUrl: string,
  selfieBase64: string,
): Promise<void> {
  try {
    let refB64 = '';
    if (registeredPhotoUrl.startsWith('data:image')) {
      refB64 = registeredPhotoUrl.split(',')[1] || '';
    } else {
      const res = await fetch(registeredPhotoUrl);
      const blob = await res.blob();
      refB64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('Falha ao ler foto cadastrada'));
        r.readAsDataURL(blob);
      });
    }
    if (!refB64) throw new Error('Foto facial cadastrada indisponível.');

    await callFaceGemini(
      [
        { mimeType: 'image/jpeg', data: refB64 },
        { mimeType: 'image/jpeg', data: selfieBase64 },
      ],
      FACE_MATCH_PROMPT,
    );
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.warn('[faceAuth] Timeout na comparação — permitindo com aviso');
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (isGeminiUnavailableError(msg)) {
      console.warn('[faceAuth] IA indisponível na comparação — permitindo sem validação automática:', msg);
      return;
    }
    throw e;
  }
}

export async function uploadEmployeeFacePhoto(
  employeeId: string,
  photoBase64: string,
): Promise<string> {
  const path = `timeclock-faces/${employeeId}/face.jpg`;
  const blob = await (await fetch(`data:image/jpeg;base64,${photoBase64}`)).blob();
  const { error } = await supabase.storage.from('mission-evidence').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) throw error;
  const { data } = supabase.storage.from('mission-evidence').getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: dbErr } = await supabase
    .from('rh_employees')
    .update({
      face_photo_url: publicUrl,
      face_registered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', employeeId);

  if (dbErr) throw dbErr;
  return publicUrl;
}
