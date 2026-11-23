import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularCotizacion, ErrorCotizacion, numeroEnLetras, formatearCOP } from '../src/dominio/cotizacion.js';

const servicios = new Map([
  [1, { id: 1, categoria: 'CONSULTORIA', nombre: 'Análisis normativo', unidad: 'M2', precio: 5000, cargoMinimo: 800000 }],
  [2, { id: 2, categoria: 'CONSULTORIA', nombre: 'Visita técnica', unidad: 'GLOBAL', precio: 350000, cargoMinimo: null }],
  [3, { id: 3, categoria: 'FINANCIERA', nombre: 'Control de costos', unidad: 'MES', precio: 1200000, cargoMinimo: null }],
]);
const actividades = new Map([
  ['3.01', { codigo: '3.01', descripcion: 'Zapata en concreto', unidad: 'm3', precioUnitario: 1000000 }],
  ['7.02', { codigo: '7.02', descripcion: 'Muro en bloque', unidad: 'm2', precioUnitario: 85000.5 }],
]);
const parametros = { administracion: 0.1, imprevistos: 0.05, utilidad: 0.05, ivaSobreUtilidad: 0.19, maxLineas: 10 };
const calcular = (seleccion) => calcularCotizacion({ seleccion, buscarServicio: (id) => servicios.get(id), buscarActividad: (c) => actividades.get(c), parametros });

test('aplica AIU e IVA sobre la utilidad solo a construcción (hoja COTIZADOR)', () => {
  const r = calcular({ construccion: [{ codigo: '3.01', cantidad: 10 }] });
  const c = r.secciones.CONSTRUCCION;
  assert.equal(c.subtotal, 10_000_000);
  assert.deepEqual(c.aiu, { administracion: 1_000_000, imprevistos: 500_000, utilidad: 500_000, ivaUtilidad: 95_000 });
  assert.equal(c.total, 12_095_000);
  assert.equal(r.total, 12_095_000);
});

test('permite cotizar solo construcción, solo consultoría o combinar las tres', () => {
  assert.equal(calcular({ consultoria: [{ id: 2 }] }).total, 350_000);
  const todo = calcular({ areaM2: 300, consultoria: [{ id: 1 }], construccion: [{ codigo: '7.02', cantidad: 2 }], financiera: [{ id: 3, cantidad: 3 }] });
  assert.equal(todo.secciones.CONSULTORIA.subtotal, 1_500_000);
  assert.equal(todo.secciones.FINANCIERA.subtotal, 3_600_000);
  assert.equal(todo.secciones.CONSTRUCCION.lineas[0].valor, 170_001);
});

test('respeta el cargo mínimo de un servicio por m²', () => {
  const linea = calcular({ areaM2: 50, consultoria: [{ id: 1 }] }).secciones.CONSULTORIA.lineas[0];
  assert.equal(linea.valor, 800_000);
  assert.equal(linea.cargoMinimoAplicado, true);
});

test('rechaza selecciones inválidas con mensajes claros', () => {
  assert.throws(() => calcular({}), ErrorCotizacion);
  assert.throws(() => calcular({ consultoria: [{ id: 1 }] }), /área del proyecto/);
  assert.throws(() => calcular({ construccion: [{ codigo: '3.01', cantidad: 0 }] }), /mayor que cero/);
  assert.throws(() => calcular({ construccion: [{ codigo: '99.99', cantidad: 1 }] }), /ya no está disponible/);
  assert.throws(() => calcular({ construccion: [{ codigo: '3.01', cantidad: 1 }, { codigo: '3.01', cantidad: 2 }] }), /repetidos/);
  assert.throws(() => calcular({ financiera: [{ id: 1 }] }), /no corresponde/);
  const muchos = Array.from({ length: 11 }, (_, i) => ({ codigo: `x${i}`, cantidad: 1 }));
  assert.throws(() => calcular({ construccion: muchos }), /hasta 10/);
});

test('escribe el total en letras como la plantilla', () => {
  assert.equal(numeroEnLetras(290738828), 'DOSCIENTOS NOVENTA MILLONES SETECIENTOS TREINTA Y OCHO MIL OCHOCIENTOS VEINTIOCHO');
  assert.equal(numeroEnLetras(1_000_000), 'UN MILLÓN DE');
  assert.equal(numeroEnLetras(21_000), 'VEINTIUN MIL');
  assert.equal(formatearCOP(3461177), '$ 3.461.177');
});
