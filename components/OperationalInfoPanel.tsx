
import React, { useState, useEffect } from 'react';
import { 
    Cloud, Sun, CloudRain, Wind, DollarSign, TrendingUp, TrendingDown, 
    AlertTriangle, Truck, Map, ShieldAlert, ExternalLink, Newspaper, RefreshCw,
    MapPin, Loader2
} from 'lucide-react';

interface CurrencyData {
    code: string;
    codein: string;
    name: string;
    high: string;
    low: string;
    varBid: string;
    pctChange: string;
    bid: string;
    ask: string;
    timestamp: string;
    create_date: string;
}

interface WeatherData {
    temperature: number;
    windSpeed: number;
    weatherCode: number; // WMO code
}

const OperationalInfoPanel: React.FC = () => {
    const [currency, setCurrency] = useState<{ USD: CurrencyData | null, EUR: CurrencyData | null }>({ USD: null, EUR: null });
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState('São Paulo');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        await Promise.all([fetchCurrency(), fetchWeather()]);
        setLoading(false);
    };

    // 1. COTAÇÃO (AwesomeAPI)
    const fetchCurrency = async () => {
        try {
            const res = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL');
            if (!res.ok) throw new Error("API de cotação indisponível");
            const data = await res.json();
            setCurrency({
                USD: data.USDBRL,
                EUR: data.EURBRL
            });
        } catch (e) {
            console.warn("Erro ao buscar cotação");
        }
    };

    // 2. CLIMA (Open-Meteo - Gratuito, sem chave)
    const fetchWeather = async () => {
        try {
            // Padrão: São Paulo (-23.55, -46.63). Tenta pegar geolocalização se permitido.
            let lat = -23.5505;
            let lon = -46.6333;

            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(async (position) => {
                    lat = position.coords.latitude;
                    lon = position.coords.longitude;
                    setCity('Local Atual');
                    await getWeatherFromCoords(lat, lon);
                }, async () => {
                    // Fallback se negar permissão
                    await getWeatherFromCoords(lat, lon);
                });
            } else {
                await getWeatherFromCoords(lat, lon);
            }
        } catch (e) {
            console.warn("Erro ao buscar clima");
        }
    };

    const getWeatherFromCoords = async (lat: number, lon: number) => {
        try {
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=America%2FSao_Paulo`);
            if (!res.ok) throw new Error("API de clima indisponível");
            const data = await res.json();
            
            if (data.current) {
                setWeather({
                    temperature: data.current.temperature_2m,
                    windSpeed: data.current.wind_speed_10m,
                    weatherCode: data.current.weather_code
                });
            }
        } catch (e) {
            console.warn("Falha ao obter dados meteorológicos");
        }
    };

    const getWeatherIcon = (code: number) => {
        if (code <= 1) return <Sun className="text-yellow-500" size={24} />;
        if (code <= 3) return <Cloud className="text-gray-400" size={24} />;
        if (code <= 67) return <CloudRain className="text-blue-400" size={24} />;
        return <Wind className="text-blue-300" size={24} />;
    };

    // 3. NEWS FEED (Mockado para demonstração - Idealmente viria do Supabase)
    const newsFeed = [
        {
            id: 1,
            category: 'RODOVIAS',
            title: 'Restrição de Tráfego: Feriados 2025',
            desc: 'Confira a portaria da PRF sobre restrição de caminhões em pistas simples.',
            source: 'Gov.br / PRF',
            link: 'https://www.gov.br/prf/pt-br',
            critical: true
        },
        {
            id: 2,
            category: 'SEGURANÇA',
            title: 'Índice de Roubos de Carga (SP/RJ)',
            desc: 'Queda de 5% no último trimestre na região Sudeste segundo SSP.',
            source: 'NTC & Logística',
            link: 'https://www.portalntc.org.br/',
            critical: false
        },
        {
            id: 3,
            category: 'TRÂNSITO',
            title: 'Obras na Via Dutra (Km 210)',
            desc: 'Lentidão esperada sentido SP devido a recapeamento.',
            source: 'CCR RioSP',
            link: 'https://www.ccrriosp.com.br/',
            critical: false
        }
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6 animate-fade-in">
            
            {/* WIDGET 1: FINANCEIRO */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5">
                    <DollarSign size={64} />
                </div>
                <div>
                    <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-3">
                        <TrendingUp size={14} /> Mercado Financeiro
                    </h3>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-xs text-gray-400 font-bold">DÓLAR (USD)</span>
                                <div className="text-lg font-black text-green-700">
                                    R$ {currency.USD ? parseFloat(currency.USD.bid).toFixed(3) : '...'}
                                </div>
                            </div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${parseFloat(currency.USD?.pctChange || '0') >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {currency.USD?.pctChange}%
                            </span>
                        </div>
                        <div className="w-full h-px bg-gray-100"></div>
                        <div className="flex justify-between items-end">
                            <div>
                                <span className="text-xs text-gray-400 font-bold">EURO (EUR)</span>
                                <div className="text-lg font-black text-blue-700">
                                    R$ {currency.EUR ? parseFloat(currency.EUR.bid).toFixed(3) : '...'}
                                </div>
                            </div>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${parseFloat(currency.EUR?.pctChange || '0') >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {currency.EUR?.pctChange}%
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-2 text-[9px] text-gray-400 text-right">Fonte: AwesomeAPI</div>
            </div>

            {/* WIDGET 2: CLIMA */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-4 rounded-xl shadow-sm text-white flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-20">
                    <Cloud size={64} />
                </div>
                <div>
                    <h3 className="text-xs font-bold text-blue-100 uppercase flex items-center gap-1 mb-2">
                        <MapPin size={14} /> Clima Operacional
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                        {weather ? getWeatherIcon(weather.weatherCode) : <Loader2 className="animate-spin" />}
                        <div>
                            <div className="text-3xl font-black">
                                {weather ? `${Math.round(weather.temperature)}°C` : '--'}
                            </div>
                            <div className="text-xs text-blue-100 font-medium">{city}</div>
                        </div>
                    </div>
                </div>
                <div className="mt-3 flex gap-4 text-xs font-medium text-blue-100">
                    <span className="flex items-center gap-1"><Wind size={12}/> {weather?.windSpeed} km/h</span>
                    <span className="flex items-center gap-1">Risco Chuva: {weather && weather.weatherCode > 50 ? 'Alto' : 'Baixo'}</span>
                </div>
            </div>

            {/* WIDGET 3: NEWS FEED & RISCOS (2 Colunas) */}
            <div className="lg:col-span-2 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-100">
                    <h3 className="text-xs font-bold text-gray-800 uppercase flex items-center gap-2">
                        <Newspaper size={14} className="text-red-600" /> Boletim de Inteligência & Estradas
                    </h3>
                    <button onClick={fetchData} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14}/></button>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[140px] space-y-3 pr-2 scrollbar-thin">
                    {newsFeed.map(news => (
                        <div key={news.id} className="flex gap-3 group">
                            <div className="mt-1">
                                {news.category === 'RODOVIAS' && <Truck size={16} className="text-orange-500" />}
                                {news.category === 'SEGURANÇA' && <ShieldAlert size={16} className="text-red-600" />}
                                {news.category === 'TRÂNSITO' && <AlertTriangle size={16} className="text-yellow-500" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-xs font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                                        {news.title}
                                    </h4>
                                    {news.critical && <span className="bg-red-100 text-red-600 text-[9px] px-1.5 rounded font-bold uppercase">Urgente</span>}
                                </div>
                                <p className="text-[10px] text-gray-500 leading-snug mt-0.5">
                                    {news.desc}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] text-gray-400 font-bold uppercase">{news.source}</span>
                                    <a href={news.link} target="_blank" rel="noreferrer" className="text-[9px] text-blue-500 flex items-center gap-0.5 hover:underline">
                                        Ver Fonte <ExternalLink size={8} />
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
};

export default OperationalInfoPanel;
