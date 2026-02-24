
import { createClient } from '@supabase/supabase-js';

// SUA URL JÁ ESTÁ CONFIGURADA ABAIXO (PEGUEI DO SEU PRINT)
const supabaseUrl = 'https://ajhmmjuewdsukecaimik.supabase.co';

// CHAVE DE ACESSO CONFIGURADA
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqaG1tanVld2RzdWtlY2FpbWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzUxMjEsImV4cCI6MjA3OTc1MTEyMX0.5bXRWTyb1HxLimt3lqJTBfjzDoumux7TXlW4lycXrPk';

export const supabase = createClient(supabaseUrl, supabaseKey);
