
import { supabase } from './supabase';

type ActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'HEARTBEAT' | 'OTHER';

export const logAction = async (
    actionType: ActionType,
    entity: string,
    entityId: string,
    details: string
) => {
    try {
        const storedUser = localStorage.getItem('userData');
        const user = storedUser ? JSON.parse(storedUser) : { name: 'Sistema' };

        // Tenta gravar no banco. Se a tabela não existir, apenas loga no console para não quebrar o app
        const { error } = await supabase.from('system_logs').insert([{
            user_name: user.name,
            action_type: actionType,
            entity: entity,
            entity_id: entityId,
            details: details,
            created_at: new Date().toISOString()
        }]);

        if (error) {
            console.warn("Log remoto falhou (tabela system_logs pode não existir):", error.message);
        }
    } catch (error) {
        console.error("Falha crítica no logger:", error);
    }
};
