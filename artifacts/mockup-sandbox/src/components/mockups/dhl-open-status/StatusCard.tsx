import { PackageOpen, Layers } from "lucide-react";

export function StatusCard() {
  const dhl = 18;
  const demais = 12;
  const total = dhl + demais;
  const dhlPct = Math.round((dhl / total) * 100);
  const demaisPct = 100 - dhlPct;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6 font-['Inter']">
      <div className="w-full max-w-[480px] rounded-2xl bg-white shadow-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <PackageOpen className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">
              Missões em Aberto
            </h2>
            <p className="text-xs text-slate-500">DHL vs Demais clientes</p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-extrabold text-slate-900 leading-none">{total}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Total
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-600 text-white">
                  <Layers className="h-4 w-4" />
                </div>
                <span className="text-sm font-bold text-slate-700">Demais Clientes</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-800 leading-none">{demais}</span>
                <span className="text-sm font-bold text-slate-500">{demaisPct}%</span>
              </div>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-slate-500" style={{ width: `${demaisPct}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <span>Distribuição</span>
              <span>{total} em aberto</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              <div className="h-full bg-amber-500" style={{ width: `${dhlPct}%` }} />
              <div className="h-full bg-slate-500" style={{ width: `${demaisPct}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
