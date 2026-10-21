import assert from "node:assert/strict";
import test from "node:test";
import {
  montarUrlMapaEstatico,
  indiceAtras,
  origemIgualDestino,
  rotuloCidade,
  simplificarRota,
  situacaoEscolta,
} from "../lib/os/mapaNoturno.ts";

const rota = [
  { lat: -22.9, lng: -47.2 },
  { lat: -23.1, lng: -47.0 },
  { lat: -23.3, lng: -46.9 },
  { lat: -23.5, lng: -46.87 },
];

test("origem e destino iguais nao viram uma rota longa", () => {
  assert.equal(origemIgualDestino("  Hortolandia - SP ", "HORTOLANDIA - SP"), true);
  assert.equal(origemIgualDestino("Hortolandia", "Barueri"), false);
});

test("a escolta sem coordenada propria nao e posicionada", () => {
  const caminhao = { lat: -23.2, lng: -46.95 };
  assert.equal(situacaoEscolta(rota, caminhao, null), "indisponivel");
});

test("a escolta atras do caminhao permanece atras", () => {
  const caminhao = { lat: -23.3, lng: -46.9 };
  const escolta = { lat: -23.1, lng: -47.0 };
  assert.equal(situacaoEscolta(rota, caminhao, escolta), "atras");
});

test("a escolta a frente nao e puxada para tras", () => {
  const caminhao = { lat: -23.1, lng: -47.0 };
  const escolta = { lat: -23.5, lng: -46.87 };
  assert.equal(situacaoEscolta(rota, caminhao, escolta), "frente");
});

test("a escolta longe da rota e marcada como distante", () => {
  const caminhao = { lat: -23.1, lng: -47.0 };
  const escolta = { lat: -10, lng: -40 };
  assert.equal(situacaoEscolta(rota, caminhao, escolta), "distante");
});

test("o mapa estatico usa a polilinha inteira e nao liga so as pontas", () => {
  const url = montarUrlMapaEstatico({ chave: "teste", pontos: rota, atual: rota[1] });
  assert.ok(url);
  const decodificada = decodeURIComponent(url || "");
  assert.match(decodificada, /-22\.90000,-47\.20000/);
  assert.match(decodificada, /-23\.30000,-46\.90000/);
  assert.match(decodificada, /color:0xf59e0b/);
  assert.equal(montarUrlMapaEstatico({ chave: "", pontos: rota }), null);
  assert.equal(simplificarRota(rota, 2).length, 2);
});

test("o rotulo do mapa fica em cidade e UF", () => {
  assert.equal(rotuloCidade("AV. DA EMANCIPAÇÃO, 5000 - PARQUE DOS PINHEIROS, HORTOLÂNDIA - SP"), "HORTOLÂNDIA - SP");
  assert.equal(rotuloCidade("SUMARÉ - SP"), "SUMARÉ - SP");
  assert.equal(rotuloCidade("AV. DA EMANCIPAÇÃO, 5000, HORTOLÂNDIA - SP, 13184-654"), "HORTOLÂNDIA - SP");
});

test("a viatura ilustrada fica atras do caminhao na mesma rota", () => {
  const indice = indiceAtras(rota, 3, 1000);
  assert.ok(indice < 3);
});
