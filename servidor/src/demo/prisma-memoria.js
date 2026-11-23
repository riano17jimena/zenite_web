/**
 * Cliente de base de datos EN MEMORIA con la misma interfaz que Prisma Client,
 * solo para pruebas automáticas y para el modo demostración (sin PostgreSQL).
 *
 * Lee prisma/schema.prisma para conocer modelos, valores por defecto, campos
 * únicos y relaciones, y soporta el subconjunto de la API de Prisma que usa
 * el servidor: findMany, findFirst, findUnique, create, createMany, update,
 * updateMany, upsert, delete, deleteMany, count, include/select, orderBy,
 * filtros (equals, in, not, contains, lt/gt, AND/OR/NOT), increment/decrement
 * y las reglas onDelete (Cascade, SetNull, Restrict).
 *
 * No es una base de datos real: $transaction no revierte cambios.
 */
import { readFileSync } from 'node:fs';

const RUTA_ESQUEMA = new URL('../../prisma/schema.prisma', import.meta.url);

export class ErrorPrismaMemoria extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}

/** Interpreta schema.prisma (modelos, campos y relaciones). */
export function leerEsquema(texto = readFileSync(RUTA_ESQUEMA, 'utf8')) {
  const enums = new Set([...texto.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]));
  const modelos = {};
  for (const [, nombre, cuerpo] of texto.matchAll(/^model (\w+) \{([\s\S]*?)\n\}/gm)) {
    const campos = {};
    const unicos = [];
    for (const lineaCruda of cuerpo.split('\n')) {
      const linea = lineaCruda.replace(/\/\/.*$/, '').trim();
      if (!linea || linea.startsWith('@@')) continue;
      const [campo, tipoCrudo, ...resto] = linea.split(/\s+/);
      const atributos = resto.join(' ');
      const lista = tipoCrudo.endsWith('[]');
      const opcional = tipoCrudo.endsWith('?');
      const tipo = tipoCrudo.replace(/[?[\]]/g, '');
      const info = { campo, tipo, lista, opcional, atributos };
      const def = atributos.match(/@default\(((?:[^()]|\([^)]*\))*)\)/);
      if (def) info.porDefecto = def[1];
      info.id = /@id\b/.test(atributos);
      info.unico = /@unique\b/.test(atributos);
      info.actualizadoAuto = /@updatedAt\b/.test(atributos);
      const rel = atributos.match(/@relation\((?:"(\w+)")?,?\s*(?:fields:\s*\[(\w+)\],\s*references:\s*\[(\w+)\])?(?:,\s*onDelete:\s*(\w+))?/);
      if (rel) {
        info.nombreRelacion = rel[1] ?? null;
        if (rel[2]) Object.assign(info, { claveLocal: rel[2], claveRemota: rel[3], alEliminar: rel[4] ?? (opcional ? 'SetNull' : 'Restrict') });
      }
      if (info.id || info.unico) unicos.push(campo);
      campos[campo] = info;
    }
    modelos[nombre] = { nombre, campos, unicos };
  }
  // Clasifica relaciones y enlaza las listas con su lado dueño.
  for (const modelo of Object.values(modelos)) {
    for (const info of Object.values(modelo.campos)) {
      info.esRelacion = Boolean(modelos[info.tipo]);
      info.esEnum = enums.has(info.tipo);
    }
  }
  for (const modelo of Object.values(modelos)) {
    for (const info of Object.values(modelo.campos)) {
      if (!info.esRelacion || info.claveLocal) continue;
      const destino = modelos[info.tipo];
      const duenio = Object.values(destino.campos).find((c) => c.esRelacion && c.tipo === modelo.nombre && c.claveLocal
        && (c.nombreRelacion ?? null) === (info.nombreRelacion ?? null));
      if (!duenio) throw new Error(`Relación sin lado dueño: ${modelo.nombre}.${info.campo}`);
      info.inversa = { modelo: destino.nombre, claveLocal: duenio.claveLocal, claveRemota: duenio.claveRemota };
    }
  }
  return modelos;
}

const copiar = (valor) => (valor instanceof Date ? new Date(valor) : valor && typeof valor === 'object' ? structuredClone(valor) : valor);
const nombreDelegado = (modelo) => modelo.charAt(0).toLowerCase() + modelo.slice(1);

function comparar(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (a instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'string') return a.localeCompare(b, 'es');
  return a < b ? -1 : a > b ? 1 : 0;
}

function cumpleCondicion(valor, condicion) {
  if (condicion === null || typeof condicion !== 'object' || condicion instanceof Date) {
    return valor instanceof Date ? comparar(valor, condicion) === 0 : valor === condicion;
  }
  const insensible = condicion.mode === 'insensitive';
  const texto = (v) => (insensible ? String(v ?? '').toLocaleLowerCase('es') : String(v ?? ''));
  for (const [op, objetivo] of Object.entries(condicion)) {
    switch (op) {
      case 'mode': break;
      case 'equals': if (!cumpleCondicion(valor, objetivo)) return false; break;
      case 'not': if (cumpleCondicion(valor, objetivo)) return false; break;
      case 'in': if (!objetivo.some((o) => cumpleCondicion(valor, o))) return false; break;
      case 'notIn': if (objetivo.some((o) => cumpleCondicion(valor, o))) return false; break;
      case 'lt': if (!(valor != null && comparar(valor, objetivo) < 0)) return false; break;
      case 'lte': if (!(valor != null && comparar(valor, objetivo) <= 0)) return false; break;
      case 'gt': if (!(valor != null && comparar(valor, objetivo) > 0)) return false; break;
      case 'gte': if (!(valor != null && comparar(valor, objetivo) >= 0)) return false; break;
      case 'contains': if (!texto(valor).includes(texto(objetivo))) return false; break;
      case 'startsWith': if (!texto(valor).startsWith(texto(objetivo))) return false; break;
      case 'endsWith': if (!texto(valor).endsWith(texto(objetivo))) return false; break;
      default: throw new Error(`Filtro no soportado en la base en memoria: ${op}`);
    }
  }
  return true;
}

export function crearPrismaMemoria({ esquema = leerEsquema() } = {}) {
  const tablas = Object.fromEntries(Object.keys(esquema).map((m) => [m, []]));
  const contadores = Object.fromEntries(Object.keys(esquema).map((m) => [m, 0]));

  function cumple(modelo, fila, where = {}) {
    for (const [clave, condicion] of Object.entries(where ?? {})) {
      if (condicion === undefined) continue;
      if (clave === 'AND') { if (![].concat(condicion).every((w) => cumple(modelo, fila, w))) return false; continue; }
      if (clave === 'OR') { if (!condicion.some((w) => cumple(modelo, fila, w))) return false; continue; }
      if (clave === 'NOT') { if ([].concat(condicion).some((w) => cumple(modelo, fila, w))) return false; continue; }
      const info = esquema[modelo].campos[clave];
      if (info?.esRelacion) {
        const relacionados = relacionadosDe(modelo, fila, info);
        if (condicion.some) { if (!relacionados.some((r) => cumple(info.tipo, r, condicion.some))) return false; continue; }
        if (condicion.none) { if (relacionados.some((r) => cumple(info.tipo, r, condicion.none))) return false; continue; }
        if (condicion.is !== undefined || !info.lista) {
          const filtro = condicion.is ?? condicion;
          const r = relacionados[0];
          if (filtro === null ? r : !(r && cumple(info.tipo, r, filtro))) return false;
          continue;
        }
        throw new Error(`Filtro de relación no soportado: ${clave}`);
      }
      // Clave compuesta no usada; filtro escalar.
      if (!cumpleCondicion(fila[clave], condicion)) return false;
    }
    return true;
  }

  function relacionadosDe(modelo, fila, info) {
    if (info.claveLocal) {
      const valor = fila[info.claveLocal];
      return valor == null ? [] : tablas[info.tipo].filter((r) => r[info.claveRemota] === valor);
    }
    const { modelo: destino, claveLocal, claveRemota } = info.inversa;
    return tablas[destino].filter((r) => r[claveLocal] === fila[claveRemota]);
  }

  function ordenar(filas, orderBy) {
    if (!orderBy) return filas;
    const criterios = [].concat(orderBy).flatMap((o) => Object.entries(o));
    return [...filas].sort((a, b) => {
      for (const [campo, direccion] of criterios) {
        const sentido = (typeof direccion === 'object' ? direccion.sort : direccion) === 'desc' ? -1 : 1;
        const r = comparar(a[campo], b[campo]);
        if (r !== 0) return r * sentido;
      }
      return 0;
    });
  }

  function proyectar(modelo, fila, { include, select } = {}) {
    const campos = esquema[modelo].campos;
    let salida;
    if (select) {
      salida = {};
      for (const [campo, opcion] of Object.entries(select)) {
        if (!opcion) continue;
        const info = campos[campo];
        if (info?.esRelacion) salida[campo] = resolverRelacion(modelo, fila, info, opcion);
        else salida[campo] = copiar(fila[campo]);
      }
      return salida;
    }
    salida = {};
    for (const [campo, info] of Object.entries(campos)) if (!info.esRelacion) salida[campo] = copiar(fila[campo]);
    for (const [campo, opcion] of Object.entries(include ?? {})) {
      if (!opcion) continue;
      const info = campos[campo];
      if (!info?.esRelacion) throw new Error(`include desconocido: ${modelo}.${campo}`);
      salida[campo] = resolverRelacion(modelo, fila, info, opcion);
    }
    return salida;
  }

  function resolverRelacion(modelo, fila, info, opcion) {
    const opciones = opcion === true ? {} : opcion;
    let relacionados = relacionadosDe(modelo, fila, info);
    if (opciones.where) relacionados = relacionados.filter((r) => cumple(info.tipo, r, opciones.where));
    relacionados = ordenar(relacionados, opciones.orderBy);
    if (opciones.take != null) relacionados = relacionados.slice(opciones.skip ?? 0, (opciones.skip ?? 0) + opciones.take);
    const proyectados = relacionados.map((r) => proyectar(info.tipo, r, opciones));
    return info.lista ? proyectados : (proyectados[0] ?? null);
  }

  function valorPorDefecto(modelo, info) {
    const d = info.porDefecto;
    if (d === undefined) return info.opcional ? null : undefined;
    if (d === 'autoincrement()') { contadores[modelo] += 1; return contadores[modelo]; }
    if (d === 'now()') return new Date();
    if (d === 'true' || d === 'false') return d === 'true';
    if (/^-?\d+(\.\d+)?$/.test(d)) return Number(d);
    if (d.startsWith('"')) return JSON.parse(d);
    return d; // enum
  }

  function validarUnicos(modelo, fila, excluir = null) {
    for (const campo of esquema[modelo].unicos) {
      if (fila[campo] == null) continue;
      const choque = tablas[modelo].find((r) => r !== excluir && r[campo] === fila[campo]);
      if (choque) throw new ErrorPrismaMemoria('P2002', `Valor duplicado en ${modelo}.${campo}`, { target: [campo] });
    }
  }

  function validarLlaves(modelo, fila) {
    for (const info of Object.values(esquema[modelo].campos)) {
      if (!info.claveLocal || fila[info.claveLocal] == null) continue;
      if (!tablas[info.tipo].some((r) => r[info.claveRemota] === fila[info.claveLocal])) {
        throw new ErrorPrismaMemoria('P2003', `Llave foránea inválida: ${modelo}.${info.claveLocal}`, { field_name: info.claveLocal });
      }
    }
  }

  function aplicarDatos(modelo, fila, data) {
    const campos = esquema[modelo].campos;
    for (const [campo, valor] of Object.entries(data)) {
      if (valor === undefined) continue;
      const info = campos[campo];
      if (!info) throw new Error(`Campo desconocido ${modelo}.${campo}`);
      if (info.esRelacion) {
        if (valor?.connect && info.claveLocal) { fila[info.claveLocal] = valor.connect[info.claveRemota]; continue; }
        if (valor?.disconnect && info.claveLocal) { fila[info.claveLocal] = null; continue; }
        throw new Error(`Escritura anidada no soportada en ${modelo}.${campo}; use las llaves foráneas.`);
      }
      if (valor && typeof valor === 'object' && !(valor instanceof Date) && !Array.isArray(valor) && ('increment' in valor || 'decrement' in valor || 'set' in valor)) {
        if ('set' in valor) fila[campo] = copiar(valor.set);
        if ('increment' in valor) fila[campo] = Number(fila[campo] ?? 0) + Number(valor.increment);
        if ('decrement' in valor) fila[campo] = Number(fila[campo] ?? 0) - Number(valor.decrement);
        continue;
      }
      fila[campo] = info.tipo === 'DateTime' && valor != null ? new Date(valor) : info.tipo === 'Decimal' && valor != null ? Number(valor) : copiar(valor);
    }
  }

  function crearFila(modelo, data) {
    const fila = {};
    for (const info of Object.values(esquema[modelo].campos)) {
      if (info.esRelacion) continue;
      if (data[info.campo] === undefined) {
        const v = valorPorDefecto(modelo, info);
        if (v !== undefined) fila[info.campo] = v;
      }
      if (info.actualizadoAuto) fila[info.campo] = new Date();
    }
    aplicarDatos(modelo, fila, data);
    for (const info of Object.values(esquema[modelo].campos)) {
      if (info.esRelacion || info.lista) continue;
      if (fila[info.campo] === undefined) {
        if (info.opcional) fila[info.campo] = null;
        else throw new ErrorPrismaMemoria('P2012', `Falta el campo obligatorio ${modelo}.${info.campo}`);
      }
      if (info.porDefecto === 'autoincrement()' && fila[info.campo] > contadores[modelo]) contadores[modelo] = fila[info.campo];
    }
    validarUnicos(modelo, fila);
    validarLlaves(modelo, fila);
    tablas[modelo].push(fila);
    return fila;
  }

  function buscarUnica(modelo, where) {
    return tablas[modelo].find((r) => cumple(modelo, r, where)) ?? null;
  }

  function eliminarFila(modelo, fila) {
    // Reglas onDelete de las tablas que apuntan a esta fila.
    for (const otro of Object.values(esquema)) {
      for (const info of Object.values(otro.campos)) {
        if (!info.claveLocal || info.tipo !== modelo) continue;
        const dependientes = tablas[otro.nombre].filter((r) => r[info.claveLocal] === fila[info.claveRemota]);
        if (dependientes.length === 0) continue;
        if (info.alEliminar === 'Cascade') dependientes.forEach((d) => eliminarFila(otro.nombre, d));
        else if (info.alEliminar === 'SetNull') dependientes.forEach((d) => { d[info.claveLocal] = null; });
        else throw new ErrorPrismaMemoria('P2003', `No se puede eliminar ${modelo}: está en uso en ${otro.nombre}`, { field_name: info.claveLocal });
      }
    }
    tablas[modelo] = tablas[modelo].filter((r) => r !== fila);
  }

  function delegado(modelo) {
    const listar = (args = {}) => {
      let filas = tablas[modelo].filter((r) => cumple(modelo, r, args.where));
      filas = ordenar(filas, args.orderBy);
      const inicio = args.skip ?? 0;
      if (args.take != null) filas = filas.slice(inicio, inicio + args.take); else if (inicio) filas = filas.slice(inicio);
      return filas;
    };
    const api = {
      async findMany(args = {}) { return listar(args).map((f) => proyectar(modelo, f, args)); },
      async findFirst(args = {}) { const f = listar(args)[0]; return f ? proyectar(modelo, f, args) : null; },
      async findUnique(args) { const f = buscarUnica(modelo, args.where); return f ? proyectar(modelo, f, args) : null; },
      async findUniqueOrThrow(args) {
        const r = await api.findUnique(args);
        if (!r) throw new ErrorPrismaMemoria('P2025', `${modelo} no encontrado`);
        return r;
      },
      async count(args = {}) { return tablas[modelo].filter((r) => cumple(modelo, r, args.where)).length; },
      async create(args) { return proyectar(modelo, crearFila(modelo, args.data), args); },
      async createMany(args) { for (const d of args.data) crearFila(modelo, d); return { count: args.data.length }; },
      async update(args) {
        const fila = buscarUnica(modelo, args.where);
        if (!fila) throw new ErrorPrismaMemoria('P2025', `${modelo} no encontrado para actualizar`);
        const copia = { ...fila };
        aplicarDatos(modelo, copia, args.data);
        for (const info of Object.values(esquema[modelo].campos)) if (info.actualizadoAuto) copia[info.campo] = new Date();
        validarUnicos(modelo, copia, fila);
        validarLlaves(modelo, copia);
        Object.assign(fila, copia);
        return proyectar(modelo, fila, args);
      },
      async updateMany(args) {
        const filas = tablas[modelo].filter((r) => cumple(modelo, r, args.where));
        for (const fila of filas) {
          aplicarDatos(modelo, fila, args.data);
          for (const info of Object.values(esquema[modelo].campos)) if (info.actualizadoAuto) fila[info.campo] = new Date();
        }
        return { count: filas.length };
      },
      async upsert(args) {
        const fila = buscarUnica(modelo, args.where);
        if (fila) return api.update({ where: args.where, data: args.update, include: args.include, select: args.select });
        return api.create({ data: { ...args.where, ...args.create }, include: args.include, select: args.select });
      },
      async delete(args) {
        const fila = buscarUnica(modelo, args.where);
        if (!fila) throw new ErrorPrismaMemoria('P2025', `${modelo} no encontrado para eliminar`);
        const proyectada = proyectar(modelo, fila, args);
        eliminarFila(modelo, fila);
        return proyectada;
      },
      async deleteMany(args = {}) {
        const filas = tablas[modelo].filter((r) => cumple(modelo, r, args.where));
        filas.forEach((f) => eliminarFila(modelo, f));
        return { count: filas.length };
      },
    };
    return api;
  }

  const cliente = {
    async $connect() {},
    async $disconnect() {},
    async $queryRaw() { return [{ ok: 1 }]; },
    async $transaction(operacion) {
      if (typeof operacion === 'function') return operacion(cliente);
      return Promise.all(operacion);
    },
    /** Solo pruebas: acceso directo a las filas. */
    $tablas: tablas,
  };
  for (const modelo of Object.keys(esquema)) cliente[nombreDelegado(modelo)] = delegado(modelo);
  return cliente;
}
