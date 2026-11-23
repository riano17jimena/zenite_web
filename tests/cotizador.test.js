/**
 * Pruebas de la lógica del cotizador del sitio (sin navegador).
 * Ejecutar con: npm test   (Node.js 20 o superior)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  construirSeleccion, crearEstado, formatearCOP, leerNumero, totalElegidos, validarSeleccion,
} from '../js/modules/cotizador.js';
import { CATEGORIAS } from '../js/modules/categorias.js';

const servicios = new Map([
  [1, { id: 1, nombre: 'Diseño arquitectónico', unidad: 'M2' }],
  [2, { id: 2, nombre: 'Interventoría', unidad: 'MES' }],
  [3, { id: 3, nombre: 'Presupuesto paramétrico', unidad: 'GLOBAL' }],
]);

describe('leerNumero', () => {
  test('acepta coma o punto decimal y separador de miles', () => {
    assert.equal(leerNumero('2,5'), 2.5);
    assert.equal(leerNumero('2.5'), 2.5);
    assert.equal(leerNumero('1.500'), 1500);
    assert.equal(leerNumero(' 120 '), 120);
    assert.ok(Number.isNaN(leerNumero('')));
    assert.ok(Number.isNaN(leerNumero('abc')));
  });
});

describe('validarSeleccion', () => {
  test('exige al menos un elemento en cualquier pestaña', () => {
    const errores = validarSeleccion(crearEstado(), servicios);
    assert.equal(errores[0].campo, 'general');
  });

  test('permite cotizar solo construcción, sin área', () => {
    const e = crearEstado();
    e.construccion.set('2.01', { descripcion: 'Muro', unidad: 'm2', cantidad: '10' });
    assert.deepEqual(validarSeleccion(e, servicios), []);
    assert.equal(totalElegidos(e), 1);
  });

  test('pide el área si hay servicios por m² y la cantidad de los servicios por mes', () => {
    const e = crearEstado();
    e.consultoria.set(1, { cantidad: 1 });
    e.consultoria.set(2, { cantidad: '' });
    const campos = validarSeleccion(e, servicios).map((x) => x.campo);
    assert.deepEqual(campos, ['area', 'servicio:2']);
  });

  test('rechaza cantidades de obra vacías o negativas', () => {
    const e = crearEstado();
    e.construccion.set('1.01', { descripcion: 'Replanteo', unidad: 'm2', cantidad: '-3' });
    assert.equal(validarSeleccion(e, servicios)[0].campo, 'obra:1.01');
  });
});

describe('construirSeleccion', () => {
  test('arma el cuerpo que espera la API', () => {
    const e = crearEstado();
    e.tipoProyecto = 'residencial';
    e.area = '120,5';
    e.consultoria.set(1, { cantidad: 1 });
    e.financiera.set(2, { cantidad: '3' });
    e.financiera.set(3, { cantidad: 1 });
    e.construccion.set('2.01', { cantidad: '10' });
    assert.deepEqual(construirSeleccion(e, servicios), {
      tipoProyecto: 'residencial', areaM2: 120.5,
      consultoria: [{ id: 1 }],
      construccion: [{ codigo: '2.01', cantidad: 10 }],
      financiera: [{ id: 2, cantidad: 3 }, { id: 3 }],
    });
  });
});

test('formatea en pesos colombianos', () => {
  assert.match(formatearCOP(1234567.4), /^\$\s?1\.234\.567$/);
});

test('las 7 categorías del sitio coinciden con las del servidor', async () => {
  const servidor = await import('../servidor/src/dominio/categorias.js');
  assert.deepEqual(CATEGORIAS, servidor.CATEGORIAS);
  assert.equal(CATEGORIAS.length, 7);
});

test('la copia de respaldo del contenido es válida', async () => {
  const datos = JSON.parse(await readFile(new URL('../data/contenido.json', import.meta.url), 'utf8'));
  assert.ok(datos.hero.titulo);
  assert.ok(datos.proyectos.length > 0);
  for (const p of datos.proyectos) {
    assert.ok(CATEGORIAS.some((c) => c.clave === p.categoria), `categoría inválida en ${p.titulo}`);
    assert.ok(p.imagenes.every((i) => i.alt && i.alt.length >= 8), `falta texto alternativo en ${p.titulo}`);
  }
});
