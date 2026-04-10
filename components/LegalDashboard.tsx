
import { useState, useCallback } from 'react';
import { Scale, Search, ChevronDown, ChevronRight, Clock, Building2, FileText, AlertTriangle, Loader2, BookOpen, Gavel, Calendar, Hash, Eye, ArrowLeft, Download } from 'lucide-react';
import { authFetch } from '../lib/authFetch';

interface Movimento {
  nome: string;
  data: string;
  complemento: string;
}

interface Processo {
  id: string;
  numeroProcesso: string;
  classe: string;
  assuntos: string[];
  tribunal: string;
  grau: string;
  orgaoJulgador: string;
  dataAjuizamento: string;
  dataUltimaAtualizacao: string;
  nivelSigilo: number;
  formato: string;
  sistema: string;
  movimentos: Movimento[];
}

const TRIBUNAIS_AGRUPADOS = {
  'Tribunais Superiores': ['STF', 'STJ', 'TST'],
  'Justiça Estadual (TJ)': [
    'TJSP', 'TJRJ', 'TJMG', 'TJRS', 'TJPR', 'TJSC', 'TJBA', 'TJPE', 'TJCE', 'TJGO',
    'TJPA', 'TJMA', 'TJMT', 'TJMS', 'TJES', 'TJAL', 'TJRN', 'TJPB', 'TJSE', 'TJPI',
    'TJRO', 'TJAC', 'TJAM', 'TJAP', 'TJRR', 'TJTO', 'TJDFT'
  ],
  'Justiça Federal (TRF)': ['TRF1', 'TRF2', 'TRF3', 'TRF4', 'TRF5', 'TRF6'],
  'Justiça do Trabalho (TRT)': [
    'TRT1', 'TRT2', 'TRT3', 'TRT4', 'TRT5', 'TRT6', 'TRT7', 'TRT8', 'TRT9', 'TRT10',
    'TRT11', 'TRT12', 'TRT13', 'TRT14', 'TRT15', 'TRT16', 'TRT17', 'TRT18', 'TRT19',
    'TRT20', 'TRT21', 'TRT22', 'TRT23', 'TRT24'
  ],
};

const formatDate = (d: string) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  } catch { return d; }
};

const formatProcessoNumber = (n: string) => {
  if (!n) return '';
  const clean = n.replace(/\D/g, '');
  if (clean.length === 20) {
    return `${clean.slice(0,7)}-${clean.slice(7,9)}.${clean.slice(9,13)}.${clean.slice(13,14)}.${clean.slice(14,16)}.${clean.slice(16,20)}`;
  }
  return n;
};

const CNPJ_EMPRESA = '28804378000167';
const CNPJ_FORMATADO = '28.804.378/0001-67';
const NOME_EMPRESA = 'TM SEGURANÇA';

const CNPJ_TO_NOME: Record<string, string> = {
  '28804378000167': 'TM SEGURANÇA',
};

const TRIBUNAIS_CNPJ_BUSCA = [
  'TRT1', 'TRT2', 'TRT3', 'TRT4', 'TRT5', 'TRT6', 'TRT7', 'TRT8', 'TRT9', 'TRT10',
  'TRT11', 'TRT12', 'TRT13', 'TRT14', 'TRT15', 'TRT16', 'TRT17', 'TRT18',
  'TJSP', 'TJRJ', 'TJMG', 'TJPR', 'TJSC', 'TJRS', 'TJBA', 'TJGO', 'TJES', 'TJDFT',
  'TJPE', 'TJCE', 'TJPA', 'TJMA', 'TJMT', 'TJMS',
  'TRF1', 'TRF2', 'TRF3', 'TRF4', 'TRF5', 'TRF6',
  'STJ', 'TST',
];

const LegalDashboard = () => {
  const [tribunal, setTribunal] = useState('TJSP');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [searchType, setSearchType] = useState<'numero' | 'texto' | 'cnpj'>('numero');
  const [searchText, setSearchText] = useState('');
  const [cnpjInput, setCnpjInput] = useState(CNPJ_EMPRESA);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Processo[]>([]);
  const [error, setError] = useState('');
  const [totalResults, setTotalResults] = useState(0);
  const [selectedProcesso, setSelectedProcesso] = useState<Processo | null>(null);
  const [searchHistory, setSearchHistory] = useState<{ tribunal: string; query: string; date: string; count: number }[]>([]);
  const [expandedGroup, setExpandedGroup] = useState('Justiça Estadual (TJ)');
  const [multiTribunalProgress, setMultiTribunalProgress] = useState('');

  const searchSingleTribunal = async (trib: string, query: string, isNumero: boolean) => {
    const body: any = { tribunal: trib };
    if (isNumero) body.numeroProcesso = query;
    else body.query = query;

    const resp = await authFetch('/api/datajud/consulta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) return [];
    return (data.results || []).map((r: any) => ({ ...r, tribunal: trib }));
  };

  const handleSearch = useCallback(async () => {
    if (searchType === 'cnpj') {
      const cnpj = cnpjInput.replace(/\D/g, '').trim();
      if (!cnpj || cnpj.length < 11) {
        setError('Informe um CNPJ/CPF válido.');
        return;
      }

      const nomeEmpresa = CNPJ_TO_NOME[cnpj] || '';
      if (!nomeEmpresa) {
        setError('CNPJ não cadastrado. Para buscar por CNPJ desconhecido, use a Busca Textual com o nome da empresa.');
        return;
      }

      setLoading(true);
      setError('');
      setResults([]);
      setSelectedProcesso(null);
      setTotalResults(0);

      try {
        const allResults: Processo[] = [];
        const dedup = new Set<string>();
        for (let i = 0; i < TRIBUNAIS_CNPJ_BUSCA.length; i++) {
          const trib = TRIBUNAIS_CNPJ_BUSCA[i];
          setMultiTribunalProgress(`Consultando ${trib} (${i + 1}/${TRIBUNAIS_CNPJ_BUSCA.length})...`);
          try {
            const found = await searchSingleTribunal(trib, nomeEmpresa, false);
            for (const p of found) {
              const key = p.numeroProcesso || p.id;
              if (!dedup.has(key)) {
                dedup.add(key);
                allResults.push(p);
              }
            }
          } catch { }
        }
        setMultiTribunalProgress('');
        setResults(allResults);
        setTotalResults(allResults.length);
        if (allResults.length === 0) {
          setError(`Nenhum processo encontrado para "${nomeEmpresa}" (CNPJ ${cnpj}) nos ${TRIBUNAIS_CNPJ_BUSCA.length} tribunais consultados.`);
        }
        setSearchHistory(prev => [{ tribunal: 'MULTI', query: `${nomeEmpresa} (${cnpj})`, date: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }), count: allResults.length }, ...prev].slice(0, 10));
      } catch (err: any) {
        setError(err.message || 'Falha na comunicação com o servidor.');
        setMultiTribunalProgress('');
      } finally {
        setLoading(false);
        setMultiTribunalProgress('');
      }
      return;
    }

    const query = searchType === 'numero' ? numeroProcesso.trim() : searchText.trim();
    if (!query) {
      setError('Informe o número do processo ou termo de busca.');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);
    setSelectedProcesso(null);
    setTotalResults(0);

    try {
      const body: any = { tribunal };
      if (searchType === 'numero') {
        body.numeroProcesso = query;
      } else {
        body.query = query;
      }

      const resp = await authFetch('/api/datajud/consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      if (!resp.ok) {
        setError(data.error || 'Erro ao consultar o DataJud.');
        return;
      }

      setResults(data.results || []);
      setTotalResults(data.total || 0);

      if (data.results?.length === 0) {
        setError('Nenhum processo encontrado para esta consulta.');
      }

      setSearchHistory(prev => [{ tribunal, query, date: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }), count: data.total || 0 }, ...prev].slice(0, 10));
    } catch (err: any) {
      setError(err.message || 'Falha na comunicação com o servidor.');
    } finally {
      setLoading(false);
    }
  }, [tribunal, numeroProcesso, searchText, searchType, cnpjInput]);

  if (selectedProcesso) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <button onClick={() => setSelectedProcesso(null)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-2" data-testid="button-back-to-list">
          <ArrowLeft size={18} /> <span className="text-sm font-medium">Voltar à lista</span>
        </button>

        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-red-950 p-6 text-white">
            <div className="flex items-center gap-3 mb-3">
              <Scale size={28} className="text-red-300" />
              <div>
                <h2 className="text-xl font-bold tracking-wide" data-testid="text-processo-numero">{formatProcessoNumber(selectedProcesso.numeroProcesso)}</h2>
                <p className="text-gray-300 text-sm">{selectedProcesso.classe}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm mt-4">
              <div className="flex items-center gap-1.5"><Building2 size={14} className="text-gray-400" /> {selectedProcesso.tribunal} — {selectedProcesso.grau || '—'}</div>
              <div className="flex items-center gap-1.5"><Gavel size={14} className="text-gray-400" /> {selectedProcesso.orgaoJulgador || '—'}</div>
              <div className="flex items-center gap-1.5"><Calendar size={14} className="text-gray-400" /> Ajuizado: {formatDate(selectedProcesso.dataAjuizamento)}</div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {selectedProcesso.assuntos.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2"><BookOpen size={14} /> Assuntos</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedProcesso.assuntos.map((a, i) => (
                    <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">{a}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Formato', value: selectedProcesso.formato || '—' },
                { label: 'Sistema', value: selectedProcesso.sistema || '—' },
                { label: 'Sigilo', value: selectedProcesso.nivelSigilo === 0 ? 'Público' : `Nível ${selectedProcesso.nivelSigilo}` },
                { label: 'Última Atualização', value: formatDate(selectedProcesso.dataUltimaAtualizacao) },
              ].map(item => (
                <div key={item.label} className="bg-gray-50 rounded-xl p-3 border">
                  <span className="text-[10px] text-gray-400 uppercase font-semibold">{item.label}</span>
                  <p className="text-sm font-medium text-gray-800 mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Clock size={14} /> Movimentações ({selectedProcesso.movimentos.length})</h3>
              {selectedProcesso.movimentos.length === 0 ? (
                <p className="text-gray-400 text-sm italic">Nenhuma movimentação disponível.</p>
              ) : (
                <div className="relative border-l-2 border-gray-200 ml-2 space-y-0">
                  {selectedProcesso.movimentos.map((m, i) => (
                    <div key={i} className="pl-6 pb-4 relative group">
                      <div className={`absolute left-[-7px] top-1.5 w-3 h-3 rounded-full border-2 ${i === 0 ? 'bg-red-500 border-red-300' : 'bg-white border-gray-300 group-hover:bg-gray-400'} transition-colors`} />
                      <div className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-800 leading-snug">{m.nome || 'Movimentação'}</p>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">{formatDate(m.data)}</span>
                        </div>
                        {m.complemento && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{m.complemento}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-900 to-red-900 flex items-center justify-center shadow-lg">
            <Scale size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Jurídico</h1>
            <p className="text-sm text-gray-500">Consulta de Processos — DataJud / CNJ</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <Search size={18} className="text-gray-400" />
          <h2 className="font-semibold text-gray-800">Consultar Processo</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {searchType !== 'cnpj' && (
            <div className="md:col-span-3">
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Tribunal</label>
              <select value={tribunal} onChange={e => setTribunal(e.target.value)} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white" data-testid="select-tribunal">
                {Object.entries(TRIBUNAIS_AGRUPADOS).map(([grupo, tribunais]) => (
                  <optgroup key={grupo} label={grupo}>
                    {tribunais.map(t => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Tipo de Busca</label>
            <select value={searchType} onChange={e => setSearchType(e.target.value as any)} className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white" data-testid="select-search-type">
              <option value="numero">Nº do Processo</option>
              <option value="texto">Busca Textual</option>
              <option value="cnpj">CNPJ / CPF</option>
            </select>
          </div>

          <div className={searchType === 'cnpj' ? 'md:col-span-8' : 'md:col-span-5'}>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
              {searchType === 'numero' ? 'Número do Processo' : searchType === 'cnpj' ? 'CNPJ / CPF' : 'Termo de Busca'}
            </label>
            {searchType === 'numero' ? (
              <input
                type="text"
                value={numeroProcesso}
                onChange={e => setNumeroProcesso(e.target.value)}
                placeholder="0000000-00.0000.0.00.0000"
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                data-testid="input-numero-processo"
              />
            ) : searchType === 'cnpj' ? (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cnpjInput}
                    onChange={e => setCnpjInput(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="flex-1 border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    data-testid="input-cnpj"
                  />
                  <button
                    type="button"
                    onClick={() => setCnpjInput(CNPJ_EMPRESA)}
                    className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors whitespace-nowrap"
                    data-testid="button-cnpj-tmseg"
                    title={`Usar CNPJ Grupo TMSEG: ${CNPJ_FORMATADO}`}
                  >
                    TMSEG
                  </button>
                </div>
                {CNPJ_TO_NOME[cnpjInput.replace(/\D/g, '')] && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 flex items-center gap-1">
                    <Building2 size={12} /> Buscará por: <strong>{CNPJ_TO_NOME[cnpjInput.replace(/\D/g, '')]}</strong> em {TRIBUNAIS_CNPJ_BUSCA.length} tribunais
                  </p>
                )}
              </div>
            ) : (
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Ex: GRUPO TMSEG, furto, indenização..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                data-testid="input-search-text"
              />
            )}
          </div>

          <div className="md:col-span-2 flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="w-full bg-gradient-to-r from-gray-900 to-red-900 text-white py-2.5 px-4 rounded-lg font-semibold text-sm hover:from-gray-800 hover:to-red-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-md"
              data-testid="button-search"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {loading ? 'Buscando...' : 'Consultar'}
            </button>
          </div>
        </div>

        {multiTribunalProgress && (
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            <Loader2 size={16} className="animate-spin shrink-0" />
            <span>{multiTribunalProgress}</span>
            <div className="flex-1 bg-blue-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${(TRIBUNAIS_CNPJ_BUSCA.indexOf(multiTribunalProgress.match(/\w+/)?.[1] || '') + 1) / TRIBUNAIS_CNPJ_BUSCA.length * 100}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            <AlertTriangle size={16} className="shrink-0" /> {error}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-600">
              {totalResults} processo{totalResults !== 1 ? 's' : ''} encontrado{totalResults !== 1 ? 's' : ''}
            </h3>
          </div>

          {results.map((p, idx) => (
            <div key={p.id || idx} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setSelectedProcesso(p)} data-testid={`card-processo-${idx}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Hash size={14} className="text-red-500 shrink-0" />
                      <span className="font-bold text-gray-900 text-sm tracking-wide">{formatProcessoNumber(p.numeroProcesso)}</span>
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-semibold uppercase">{p.tribunal}</span>
                      {p.grau && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-semibold">{p.grau}</span>}
                    </div>
                    <p className="text-sm text-gray-700 font-medium">{p.classe}</p>
                    {p.assuntos.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1 truncate">{p.assuntos.join(' • ')}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span className="flex items-center gap-1"><Gavel size={12} /> {p.orgaoJulgador || '—'}</span>
                      <span className="flex items-center gap-1"><Calendar size={12} /> {formatDate(p.dataAjuizamento)}</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> {p.movimentos.length} mov.</span>
                    </div>
                  </div>
                  <button className="p-2 rounded-lg bg-gray-50 text-gray-400 group-hover:bg-red-50 group-hover:text-red-600 transition-colors shrink-0" data-testid={`button-view-processo-${idx}`}>
                    <Eye size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <FileText size={32} className="text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Consulte Processos Judiciais</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            Pesquise processos diretamente no DataJud (CNJ). Selecione o tribunal, informe o número do processo e clique em Consultar.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-lg mx-auto text-left">
            <div className="bg-gray-50 rounded-lg p-3 border">
              <span className="text-xs font-semibold text-red-600">1. Tribunal</span>
              <p className="text-[11px] text-gray-500 mt-0.5">Selecione o tribunal onde o processo tramita</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border">
              <span className="text-xs font-semibold text-red-600">2. Nº Processo</span>
              <p className="text-[11px] text-gray-500 mt-0.5">Informe o número CNJ do processo</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border">
              <span className="text-xs font-semibold text-red-600">3. Consultar</span>
              <p className="text-[11px] text-gray-500 mt-0.5">Visualize classe, assuntos e movimentações</p>
            </div>
          </div>
        </div>
      )}

      {searchHistory.length > 0 && !selectedProcesso && results.length === 0 && (
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Clock size={14} /> Histórico de Consultas</h3>
          <div className="space-y-2">
            {searchHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 text-sm border hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] font-bold">{h.tribunal}</span>
                  <span className="text-gray-700 font-medium truncate max-w-xs">{h.query}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{h.count} resultado{h.count !== 1 ? 's' : ''}</span>
                  <span>{h.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LegalDashboard;
