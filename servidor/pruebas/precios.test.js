/**
 * Verifica que la regla de cálculo reproduce los precios del Excel original.
 * Usa los datos privados importados (prisma/datos-privados); si no existen,
 * la prueba se omite.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { crearCalculadora, redondearPeso } from '../src/dominio/precios.js';

const carpeta = new URL('../prisma/datos-privados/', import.meta.url);
const hayDatos = existsSync(new URL('apu.json', carpeta));
const leer = (n) => JSON.parse(readFileSync(new URL(n, carpeta), 'utf8'));

test('redondea al peso', () => {
  assert.equal(redondearPeso(15171.19), 15171);
  assert.equal(redondearPeso(0.5), 1);
});

test('porcentaje de herramienta menor se calcula sobre la mano de obra', () => {
  const calc = crearCalculadora({ obtenerInsumo: () => undefined, componentesAuxiliar: () => undefined });
  const { total } = calc.sumar([
    { grupo: 'EQUIPO', unidad: '%MO', cantidad: 10, precio: 999999, porcentaje: true },
    { grupo: 'MANO_OBRA', unidad: 'Día', cantidad: 0.5, precio: 200000, porcentaje: false },
  ]);
  assert.equal(total, 110000);
});

test('detecta auxiliares que se contienen a sí mismos', () => {
  const calc = crearCalculadora({
    obtenerInsumo: () => ({ precio: 1, tipo: 'AUXILIAR' }),
    componentesAuxiliar: () => [{ grupo: 'EQUIPO', unidad: 'Un', cantidad: 1, precio: 1, porcentaje: false, insumoId: 'A' }],
  });
  assert.throws(() => calc.precioInsumo('A'), /a sí mismo/);
});

test('reproduce los precios del Excel', { skip: !hayDatos && 'sin datos privados' }, () => {
  const insumos = new Map(leer('insumos.json').map((i) => [i.clave, i]));
  const auxiliares = new Map(leer('auxiliares.json').map((a) => [a.clave, a.componentes.map((c) => ({ ...c, insumoId: c.insumo }))]));
  const calc = crearCalculadora({ obtenerInsumo: (k) => insumos.get(k), componentesAuxiliar: (k) => auxiliares.get(k) });
  const actividades = new Map(leer('actividades.json').map((a) => [a.codigo, a]));
  let iguales = 0; const distintos = [];
  for (const bloque of leer('apu.json')) {
    const { total } = calc.sumar(bloque.componentes.map((c) => ({ ...c, insumoId: c.insumo ?? null })));
    const esperado = actividades.get(bloque.codigo)?.precio ?? bloque.total_excel;
    if (Math.abs(total - esperado) <= 1) iguales += 1; else distintos.push([bloque.codigo, total, esperado]);
  }
  const porcentaje = (iguales / (iguales + distintos.length)) * 100;
  console.log(`Coinciden ${iguales} de ${iguales + distintos.length} actividades (${porcentaje.toFixed(2)} %)`, distintos.slice(0, 8));
  assert.ok(porcentaje >= 99, `Solo coincide el ${porcentaje.toFixed(2)} %`);
});
