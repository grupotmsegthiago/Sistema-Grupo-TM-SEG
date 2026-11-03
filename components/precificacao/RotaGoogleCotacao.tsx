import React, { useEffect, useRef, useState } from 'react';
import { Autocomplete, useLoadScript } from '@react-google-maps/api';
import { googleMapsLoadConfig } from '../../lib/maps';
import { destinoDirections, lugarComGeometria, restricoesDaRota, textoComBrasil, type Coordenada } from '../../lib/portalCliente/rotaCotacao';

type Props = {
  origem: string;
  destino: string;
  onOrigem: (valor: string) => void;
  onDestino: (valor: string) => void;
  onKm: (valor: string) => void;
};

function tempoEstimado(minutos: number | null): string {
  if (minutos == null || minutos <= 0) return '—';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas <= 0) return `${resto} min`;
  return `${horas}h ${String(resto).padStart(2, '0')}min`;
}

/** Origem e destino pelo Google. O km e o tempo saem da rota, sem digitação solta. */
const RotaGoogleCotacao: React.FC<Props> = ({ origem, destino, onOrigem, onDestino, onKm }) => {
  const { isLoaded, loadError } = useLoadScript(googleMapsLoadConfig);
  const campoOrigem = useRef<google.maps.places.Autocomplete | null>(null);
  const campoDestino = useRef<google.maps.places.Autocomplete | null>(null);
  const [tempoMin, setTempoMin] = useState<number | null>(null);
  const [kmRota, setKmRota] = useState<number | null>(null);
  const [coordOrigem, setCoordOrigem] = useState<Coordenada | null>(null);
  const [coordDestino, setCoordDestino] = useState<Coordenada | null>(null);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    if (!isLoaded || !origem.trim() || !destino.trim()) {
      setKmRota(null);
      setTempoMin(null);
      return;
    }
    let ativo = true;
    const servico = new google.maps.DirectionsService();
    servico.route({
      origin: destinoDirections(coordOrigem, origem),
      destination: destinoDirections(coordDestino, destino),
      travelMode: google.maps.TravelMode.DRIVING,
      ...restricoesDaRota(),
    }, (resultado, status) => {
      if (!ativo) return;
      const pernas = resultado?.routes?.[0]?.legs || [];
      const metros = pernas.reduce((soma, trecho) => soma + (trecho.distance?.value || 0), 0);
      if (status !== 'OK' || metros <= 0) {
        setAviso('O Google não fechou essa rota.');
        setKmRota(null);
        setTempoMin(null);
        onKm('');
        return;
      }
      const km = Math.round(metros / 100) / 10;
      const segundos = pernas.reduce((soma, trecho) => soma + (trecho.duration?.value || 0), 0);
      const minutos = segundos > 0 ? Math.round(segundos / 60) : null;
      setAviso('');
      setKmRota(km);
      setTempoMin(minutos);
      onKm(String(km));
    });
    return () => { ativo = false; };
  }, [isLoaded, origem, destino, coordOrigem, coordDestino, onKm]);

  const escolher = (
    campo: google.maps.places.Autocomplete | null,
    aplicar: (valor: string) => void,
    guardar: (coordenada: Coordenada | null) => void,
  ) => {
    const achado = lugarComGeometria(campo?.getPlace());
    if (!achado) return;
    guardar(achado.coordenada);
    aplicar(achado.endereco || textoComBrasil(achado.endereco));
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3" data-testid="rota-google-cotacao">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Rota</p>
        <h3 className="text-sm font-black text-gray-900 uppercase">Origem e destino</h3>
      </div>
      {loadError && <p className="text-xs font-bold text-red-700">O Google não carregou.</p>}
      {!isLoaded && !loadError && <p className="text-xs font-bold text-gray-400">Carregando o Google…</p>}
      {isLoaded && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-[10px] font-bold uppercase text-gray-500">
            Origem
            <Autocomplete
              onLoad={(item) => { campoOrigem.current = item; }}
              onPlaceChanged={() => escolher(campoOrigem.current, onOrigem, setCoordOrigem)}
              options={{ componentRestrictions: { country: 'BR' }, fields: ['formatted_address', 'name', 'geometry', 'place_id', 'address_components'] }}
            >
              <input className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-xs font-bold uppercase" defaultValue={origem} placeholder="Busque a origem" data-testid="input-google-origem" />
            </Autocomplete>
          </label>
          <label className="text-[10px] font-bold uppercase text-gray-500">
            Destino
            <Autocomplete
              onLoad={(item) => { campoDestino.current = item; }}
              onPlaceChanged={() => escolher(campoDestino.current, onDestino, setCoordDestino)}
              options={{ componentRestrictions: { country: 'BR' }, fields: ['formatted_address', 'name', 'geometry', 'place_id', 'address_components'] }}
            >
              <input className="mt-1 w-full rounded-lg border border-gray-200 p-2 text-xs font-bold uppercase" defaultValue={destino} placeholder="Busque o destino" data-testid="input-google-destino" />
            </Autocomplete>
          </label>
        </div>
      )}
      <p className="text-[11px] font-bold text-gray-500" data-testid="km-rota-google">KM da rota: {kmRota == null ? '—' : `${kmRota.toLocaleString('pt-BR')} km`}</p>
      <p className="text-[11px] font-bold text-gray-500" data-testid="tempo-rota-google">Tempo estimado: {tempoEstimado(tempoMin)}</p>
      {aviso && <p className="text-[11px] font-bold text-amber-800">{aviso}</p>}
    </div>
  );
};

export default RotaGoogleCotacao;
