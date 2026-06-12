import {
  CheckCircle2,
  MapPin,
  ExternalLink,
  AlertTriangle,
  Radar,
  ArrowRightLeft,
  TableProperties,
  Gauge,
  XCircle,
  CalendarClock,
  ShieldCheck,
  CircleDot,
} from "lucide-react";

export function FinalizeChecklist() {
  return (
    <div className="min-h-screen bg-slate-100 p-5 font-['Inter'] text-slate-800">
      <div className="mx-auto w-full max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-amber-900">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold leading-tight text-slate-900">
              Finalizar Missão DHL
            </h2>
            <p className="truncate text-xs text-slate-500">
              OS GTM-5384 · Fornecedor: TM Security · 14/06/2026
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
            <CircleDot className="h-3 w-3" /> Em conferência
          </span>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full w-[40%] rounded-full bg-amber-500" />
          </div>
          <span className="text-[11px] font-semibold text-slate-500">2 de 5 verificados</span>
        </div>

        <div className="space-y-3 p-5">
          {/* 1 - Endereço destino final */}
          <Section
            n={1}
            done
            icon={<MapPin className="h-4 w-4" />}
            title="Endereço de destino final"
          >
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[13px] font-medium text-slate-800">
                Rua Eng. Ranulfo Pinheiro Lima, 200 — Guarulhos / SP
              </p>
              <button className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir link do mapa
              </button>
            </div>
            <Check label="Confirmo o endereço de destino final" checked />
          </Section>

          {/* 2 - Destino RAIO (forçar verificação) */}
          <Section
            n={2}
            warn
            icon={<Radar className="h-4 w-4" />}
            title="Destino definido como RAIO"
          >
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-[13px] font-medium text-amber-900">
                  Esta OS foi cadastrada com destino por <b>raio de 100 km</b>. Confirme
                  se a viatura realmente rodou esse raio.
                </p>
              </div>
              <p className="mt-3 text-xs font-semibold text-amber-900">
                A viatura rodou o raio de 100 km?
              </p>
              <div className="mt-2 flex gap-2">
                <button className="flex-1 rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-700">
                  Sim, rodou o raio
                </button>
                <button className="flex-1 rounded-md border border-red-300 bg-red-600 px-3 py-2 text-xs font-bold text-white">
                  Não — ajustar
                </button>
              </div>
              {/* manual adjust (estado: Não selecionado) */}
              <div className="mt-3 rounded-md border border-red-200 bg-white p-2.5">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-red-600">
                  Ajustar raio realmente rodado (km)
                </label>
                <input
                  defaultValue="62"
                  className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:border-red-400"
                />
              </div>
            </div>
          </Section>

          {/* 3 - Confirmar cidades + tabela */}
          <Section
            n={3}
            icon={<ArrowRightLeft className="h-4 w-4" />}
            title="Confirmar origem e destino"
          >
            <div className="grid grid-cols-2 gap-2">
              <CityBox label="Cidade de origem (início da SM)" value="Embu das Artes / SP" />
              <CityBox label="Cidade de fim (link do mapa)" value="Guarulhos / SP" mapLink />
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <TableProperties className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-[12px] font-medium text-blue-900">
                Lembrete: verifique se a <b>tabela aplicada</b> nesta OS está correta —
                <span className="font-bold"> SUDESTE - DHL 100KM</span>.
              </p>
            </div>
            <Check label="Confirmo as cidades e a tabela aplicada" />
          </Section>

          {/* 4 - KM rodado x KM da tabela */}
          <Section
            n={4}
            warn
            icon={<Gauge className="h-4 w-4" />}
            title="KM rodado x KM da tabela"
          >
            <div className="grid grid-cols-2 gap-2">
              <Stat label="KM rodado (real)" value="148 km" tone="slate" />
              <Stat label="KM da tabela (franquia)" value="100 km" tone="slate" />
            </div>
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <p className="text-[12px] font-medium text-red-900">
                O KM rodado <b>não bate</b> com o KM da tabela. Selecione a tabela mais
                correta para esta REGIÃO:
              </p>
            </div>

            <div className="mt-2 space-y-2">
              <TableSuggestion
                title="SUDESTE - DHL 150KM"
                meta="Origem + destino batem · KM mais próximo (150 km)"
                best
              />
              <TableSuggestion
                title="SUDESTE - DHL 200KM"
                meta="Mesma região · próximo KM acima (200 km)"
              />
              <TableSuggestion
                title="SUDESTE - DHL 100KM"
                meta="Tabela atual · franquia 100 km"
                current
              />
            </div>
          </Section>

          {/* 5 - Cancelamento (campos obrigatórios) */}
          <Section
            n={5}
            danger
            icon={<XCircle className="h-4 w-4" />}
            title="Missão cancelada — datas obrigatórias"
          >
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <p className="text-[12px] font-medium text-red-900">
                  Esta seção só aparece quando a OS está <b>Cancelada</b>. Os dois campos
                  abaixo são <b>obrigatórios</b> para evitar erro de cobrança.
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <DateField label="Data do cancelamento *" value="14/06/2026 09:40" />
                <DateField label="Data de fim de viagem *" value="14/06/2026 11:05" />
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <p className="text-[11px] text-slate-500">
            Conclua todos os itens para liberar a finalização.
          </p>
          <button className="ml-auto rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
            Cancelar
          </button>
          <button className="rounded-lg bg-slate-300 px-4 py-2 text-sm font-bold text-slate-500">
            Finalizar missão
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  n,
  title,
  icon,
  children,
  done,
  warn,
  danger,
}: {
  n: number;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  done?: boolean;
  warn?: boolean;
  danger?: boolean;
}) {
  const ring = done
    ? "ring-emerald-200"
    : danger
    ? "ring-red-200"
    : warn
    ? "ring-amber-200"
    : "ring-slate-200";
  const badge = done
    ? "bg-emerald-500 text-white"
    : danger
    ? "bg-red-500 text-white"
    : warn
    ? "bg-amber-400 text-amber-900"
    : "bg-slate-200 text-slate-600";
  return (
    <div className={`rounded-xl bg-white p-4 ring-1 ${ring}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-extrabold ${badge}`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : n}
        </div>
        <div className="flex items-center gap-1.5 text-slate-700">{icon}</div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-2 pl-1">{children}</div>
    </div>
  );
}

function Check({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <label className="mt-1 flex items-center gap-2 text-[13px] font-medium text-slate-700">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
          checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
        }`}
      >
        {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
      </span>
      {label}
    </label>
  );
}

function CityBox({ label, value, mapLink }: { label: string; value: string; mapLink?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-[13px] font-bold text-slate-800">{value}</p>
      {mapLink && (
        <button className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600">
          <ExternalLink className="h-3 w-3" /> ver no mapa
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-slate-800">{value}</p>
    </div>
  );
}

function TableSuggestion({
  title,
  meta,
  best,
  current,
}: {
  title: string;
  meta: string;
  best?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2.5 ${
        best ? "border-emerald-300 bg-emerald-50" : current ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-bold text-slate-800">{title}</p>
          {best && (
            <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
              sugerida
            </span>
          )}
          {current && (
            <span className="rounded-full bg-slate-300 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600">
              atual
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-slate-500">{meta}</p>
      </div>
      <button
        className={`ml-auto shrink-0 rounded-md px-3 py-1.5 text-xs font-bold ${
          best ? "bg-emerald-600 text-white" : "border border-slate-300 bg-white text-slate-600"
        }`}
      >
        {current ? "Manter" : "Aplicar"}
      </button>
    </div>
  );
}

function DateField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="text-[10px] font-semibold uppercase tracking-wide text-red-600">{label}</label>
      <input
        defaultValue={value}
        className="mt-1 w-full rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-slate-800 outline-none focus:border-red-500"
      />
    </div>
  );
}
