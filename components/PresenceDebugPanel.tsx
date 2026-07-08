import React, { useEffect, useMemo, useState } from 'react';
import { subscribePresence, subscribePresenceDebug } from '../lib/presenceChannel';
import type { PresenceUserState } from '../lib/timeclock/presence';

/**
 * Painel de diagnóstico da presença, acessível diretamente na tela do celular.
 * Ativa quando a URL contém ?debug=presence ou #debug=presence.
 */
const PresenceDebugPanel: React.FC = () => {
  const enabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get('debug') === 'presence') return true;
      const hash = window.location.hash || '';
      if (hash.includes('debug=presence')) return true;
    } catch {
      // ignora
    }
    return false;
  }, []);

  const [logs, setLogs] = useState<string[]>([]);
  const [users, setUsers] = useState<PresenceUserState[]>([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const unsubDebug = subscribePresenceDebug(setLogs);
    const unsubUsers = subscribePresence((list) => setUsers(list));
    return () => {
      unsubDebug();
      unsubUsers();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 999999,
        background: 'rgba(0,0,0,0.92)',
        color: '#f8fafc',
        borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        maxHeight: '65vh',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="presence-debug-panel"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: 0.5 }}>
          🔍 DEBUG PRESENÇA · {users.length} usuário(s)
        </strong>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: 'rgba(255,255,255,0.15)',
            color: '#fff',
            border: 0,
            borderRadius: 8,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {open ? 'ocultar' : 'mostrar'}
        </button>
      </div>

      {open && (
        <div style={{ padding: 8, overflow: 'auto', flex: 1 }}>
          <div style={{ marginBottom: 8, fontSize: 11 }}>
            <strong style={{ color: '#a7f3d0' }}>Usuários no map local:</strong>
            {users.length === 0 ? (
              <div style={{ color: '#fca5a5' }}>(vazio)</div>
            ) : (
              users.map((u) => (
                <div key={u.userId} style={{ color: '#e2e8f0' }}>
                  • {u.name} · {u.role} · {u.isClt ? 'CLT' : 'não CLT'}
                  {u.onDuty ? ` · ${u.onDutyLabel}` : ''}
                </div>
              ))
            )}
          </div>

          <div style={{ fontSize: 11 }}>
            <strong style={{ color: '#93c5fd' }}>Log ({logs.length}):</strong>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 10,
                lineHeight: 1.35,
                color: '#cbd5f5',
                margin: 0,
                marginTop: 4,
              }}
            >
              {logs.length === 0 ? '(sem logs ainda...)' : logs.join('\n')}
            </pre>
          </div>

          <div style={{ marginTop: 8, fontSize: 10, color: '#94a3b8' }}>
            Feche este painel: remova <code>?debug=presence</code> da URL e F5.
          </div>
        </div>
      )}
    </div>
  );
};

export default PresenceDebugPanel;
