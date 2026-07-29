import React from 'react';
import { Shield } from 'lucide-react';
import GcPageHeader from './shared/GcPageHeader';
import { GESTOR_COMERCIAL_DEF, GC_COMERCIAL_ALLOWED_SCREENS } from '../../../lib/gestores/comercial/definition';

const GcPermissions: React.FC<{ onNavigate: (screen: string) => void }> = ({ onNavigate }) => (
  <div className="p-4 md:p-8 max-w-4xl mx-auto">
    <GcPageHeader
      title="Controle de Permissões"
      subtitle="RBAC do Gestor Comercial — alinhado a Perfis de Acesso do sistema"
      icon={Shield}
      actions={
        <button
          type="button"
          onClick={() => onNavigate('profiles')}
          className="px-3 py-2 rounded-xl bg-slate-900 text-amber-300 text-sm font-bold"
        >
          Abrir Perfis de Acesso
        </button>
      }
    />

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <h2 className="font-black text-sm uppercase text-slate-900 mb-3">Comercial (escopo)</h2>
        <p className="text-sm text-slate-600 mb-3">
          Vê apenas carteira própria (`created_by` / `client_view:*`). Nunca faturamento global, lucro global ou margens estratégicas.
        </p>
        <ul className="space-y-1 text-sm">
          {[...GC_COMERCIAL_ALLOWED_SCREENS].map((id) => {
            const screen = GESTOR_COMERCIAL_DEF.screens.find((s) => s.id === id);
            return <li key={id} className="flex justify-between border-b border-slate-50 py-1"><span>{screen?.name || id}</span><code className="text-xs text-slate-400">{id}</code></li>;
          })}
        </ul>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
        <h2 className="font-black text-sm uppercase text-slate-900 mb-3">Diretoria (pleno)</h2>
        <p className="text-sm text-slate-600 mb-3">
          Acesso a todos os comerciais, indicadores, rankings, margens, configs e análises da IA.
        </p>
        <ul className="space-y-1 text-sm">
          {GESTOR_COMERCIAL_DEF.screens.map((s) => (
            <li key={s.id} className="flex justify-between border-b border-slate-50 py-1">
              <span>{s.name}{s.diretoriaOnly ? ' · só Diretoria' : ''}</span>
              <code className="text-xs text-slate-400">{s.id}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>

    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
      As permissões de menu são gerenciadas em <strong>Configurações → Perfis de Acesso</strong>.
      Os novos itens `gc-*` já aparecem automaticamente a partir do `NAV_ITEMS`.
      A IA e as consultas validam o perfil do usuário logado antes de exibir dados.
    </div>
  </div>
);

export default GcPermissions;
