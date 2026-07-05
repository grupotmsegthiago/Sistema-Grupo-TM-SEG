
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

declare const Deno: any;

// Chave fornecida pelo usuário
const RESEND_API_KEY = "re_5Fc9hUR7_CtftxF7E5NzPAhmfygSvCxA2";

interface EmailPayload {
  type: 'NEW_USER' | 'MISSION_SCHEDULED';
  to: string;
  data: any; // Dados dinâmicos dependendo do tipo
}

const handler = async (request: Request): Promise<Response> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload: EmailPayload = await request.json()
    const { type, to, data } = payload;

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is missing.')
    }

    let subject = '';
    let htmlContent = '';

    // TEMPLATE 1: NOVO USUÁRIO
    if (type === 'NEW_USER') {
      subject = `Bem-vindo ao Sistema TMSEG - Suas Credenciais`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #000; padding: 20px; text-align: center;">
               <h1 style="color: #fff; margin: 0; font-size: 24px;">GRUPO TMSEG</h1>
            </div>
            <div style="padding: 30px;">
                <h2 style="color: #b91c1c; margin-top: 0;">Conta Criada com Sucesso!</h2>
                <p>Olá, <strong>${data.name}</strong>.</p>
                <p>Seu acesso ao Portal Operacional foi configurado. Abaixo estão seus dados de login:</p>
                
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #b91c1c;">
                    <p style="margin: 5px 0;"><strong>Login:</strong> ${to}</p>
                    <p style="margin: 5px 0;"><strong>Senha Provisória:</strong> ${data.password}</p>
                </div>

                <p style="font-size: 13px; color: #666;">Por segurança, o sistema solicitará a troca desta senha no primeiro acesso.</p>
                
                <div style="text-align: center; margin-top: 30px;">
                  <a href="${data.appUrl || 'https://tmseg.com.br'}" style="background-color: #b91c1c; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Acessar Sistema</a>
                </div>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                <p>&copy; ${new Date().getFullYear()} Grupo TMSEG - Security Intelligence.</p>
            </div>
        </div>
      `;
    } 
    // TEMPLATE 2: MISSÃO AGENDADA
    else if (type === 'MISSION_SCHEDULED') {
      subject = `Agendamento Confirmado - OS #${data.osId}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #000; padding: 20px; text-align: center;">
               <h1 style="color: #fff; margin: 0; font-size: 24px;">CONFIRMAÇÃO DE AGENDAMENTO</h1>
            </div>
            <div style="padding: 30px;">
                <p>Prezado Cliente,</p>
                <p>Informamos que a Ordem de Serviço <strong>#${data.osId}</strong> foi agendada e a equipe operacional já está alocada.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                  <tr style="background-color: #f3f4f6;">
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; width: 30%;">Data/Hora</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${data.date} às ${data.time}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Origem</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${data.origin}</td>
                  </tr>
                  <tr style="background-color: #f3f4f6;">
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Destino</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${data.destination}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Veículo Cliente</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${data.clientVehiclePlate} (${data.clientVehicleModel})</td>
                  </tr>
                  <tr style="background-color: #f3f4f6;">
                    <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Motorista</td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${data.driverName || 'Não informado'}</td>
                  </tr>
                </table>

                <div style="background-color: #eef2ff; padding: 15px; border-radius: 6px; border: 1px solid #c7d2fe; margin-top: 20px;">
                    <h4 style="margin: 0 0 10px 0; color: #1e3a8a;">Dados da Escolta (TMSEG)</h4>
                    <p style="margin: 5px 0;"><strong>Viatura:</strong> ${data.securityVehicle}</p>
                    <p style="margin: 5px 0;"><strong>Agentes:</strong> ${data.agent1} ${data.agent2 ? '/ ' + data.agent2 : ''}</p>
                </div>

                <p style="margin-top: 20px; font-size: 13px; color: #666;">Você pode acompanhar o status em tempo real através do nosso portal.</p>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                <p>&copy; ${new Date().getFullYear()} Grupo TMSEG - Security Intelligence.</p>
            </div>
        </div>
      `;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Grupo TMSEG <onboarding@resend.dev>', // Em produção, altere para seu domínio verificado
        to: [to],
        subject: subject,
        html: htmlContent,
      }),
    })

    const dataRes = await res.json()

    if (!res.ok) {
        return new Response(JSON.stringify({ error: dataRes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        })
    }

    return new Response(JSON.stringify(dataRes), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
}

serve(handler)
