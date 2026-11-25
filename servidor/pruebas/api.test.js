/**
 * Pruebas de la API completa (Express + servicios + base en memoria).
 * Ejecutar con: npm test
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, test } from 'node:test';
import { crearEntorno, CONTRASENA } from './apoyo/entorno.js';

let e;
before(async () => { e = await crearEntorno(); });
after(async () => { await e?.cerrar(); });

describe('API pública', () => {
  test('salud y contenido publicado migrado del sitio', async () => {
    const c = e.cliente({ panel: false });
    assert.equal((await c.get('/api/salud')).estado, 200);
    const r = await c.get('/api/publico/contenido');
    assert.equal(r.estado, 200);
    assert.equal(r.datos.version, 1);
    assert.match(r.datos.hero.titulo, /Arquitectura/);
    assert.ok(r.datos.hero.imagen.alt.length > 10, 'la foto principal conserva su texto alternativo');
    assert.equal(r.datos.proyectos.length, 5);
    assert.ok(r.datos.proyectos.every((p) => p.imagenes.every((i) => i.alt && i.url.endsWith('.webp'))));
    assert.equal(r.datos.videos.length, 4);
    assert.ok(r.datos.perfiles[0].nombre.includes('Daniel'));
    assert.match(r.cabeceras.get('cache-control'), /max-age=60/);
  });

  test('CORS solo para el sitio autorizado', async () => {
    const permitido = await fetch(`${e.url}/api/publico/contenido`, { headers: { Origin: 'http://sitio.prueba' } });
    assert.equal(permitido.headers.get('access-control-allow-origin'), 'http://sitio.prueba');
    const ajeno = await fetch(`${e.url}/api/publico/contenido`, { headers: { Origin: 'https://otro.com' } });
    assert.equal(ajeno.headers.get('access-control-allow-origin'), null);
  });

  test('el cotizador público no expone precios del catálogo', async () => {
    const c = e.cliente({ panel: false });
    const op = await c.get('/api/publico/cotizador/opciones');
    assert.equal(op.estado, 200);
    assert.equal(op.datos.tiposProyecto.length, 7);
    assert.ok(op.datos.consultoria.length > 0 && op.datos.financiera.length > 0);
    assert.ok(op.datos.consultoria.every((s) => !('precio' in s) && !('cargoMinimo' in s)));

    const sinFiltro = await c.get('/api/publico/cotizador/actividades');
    assert.equal(sinFiltro.estado, 400);
    const acts = await c.get('/api/publico/cotizador/actividades?capitulo=2');
    assert.equal(acts.estado, 200);
    assert.equal(acts.datos.actividades[0].codigo, '2.01');
    assert.deepEqual(Object.keys(acts.datos.actividades[0]).sort(), ['codigo', 'descripcion', 'subcapitulo', 'unidad']);
  });

  test('calcula solo construcción con AIU en el servidor', async () => {
    const c = e.cliente({ panel: false });
    const r = await c.post('/api/publico/cotizador/calcular', { seleccion: { construccion: [{ codigo: '2.01', cantidad: 10 }] } });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    const cons = r.datos.secciones.CONSTRUCCION;
    // 12.5 × 1500 + 0.02 × (8 × 30000 + 1.1 × 80000) + 0.08 × 200000 = 18750 + 6560 + 16000
    assert.equal(cons.lineas[0].precioUnitario, 41310);
    assert.equal(cons.subtotal, 413100);
    assert.equal(cons.aiu.administracion, 41310);
    assert.equal(r.datos.secciones.CONSULTORIA.lineas.length, 0);
    assert.equal(r.datos.total, cons.total);
    const malo = await c.post('/api/publico/cotizador/calcular', { seleccion: { construccion: [{ codigo: '9.99', cantidad: 1 }] } });
    assert.equal(malo.estado, 400);
  });

  test('cotización: se guarda, genera Word y se envía a zeniteark@gmail.com', async () => {
    const c = e.cliente({ panel: false });
    const servicio = (await c.get('/api/publico/cotizador/opciones')).datos.consultoria[0];
    const r = await c.post('/api/publico/cotizaciones', {
      nombre: 'Laura Gómez', correo: 'laura@correo.co', telefono: '3001234567', consentimiento: true,
      seleccion: { tipoProyecto: 'residencial', areaM2: 120, consultoria: [{ id: servicio.id }], construccion: [{ codigo: '1.01', cantidad: 120 }] },
    });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
    assert.match(r.datos.codigo, /^ZEN-\d{4}-0001$/);
    const correo = e.servicios.correo.bandeja.find((m) => m.subject.includes(r.datos.codigo));
    assert.equal(correo.to, 'zeniteark@gmail.com');
    assert.equal(correo.attachments[0].filename, `${r.datos.codigo}.docx`);
    assert.ok(correo.attachments[0].bytes > 10_000);
    const solicitud = await e.db.solicitudContacto.findFirst({ where: { origen: 'COTIZADOR' } });
    assert.equal(solicitud.consentimiento, true);
    assert.ok(solicitud.ipHash && !solicitud.ipHash.includes('127.0.0.1'), 'la IP se guarda cifrada');
  });

  test('contacto exige autorización de datos (Ley 1581)', async () => {
    const c = e.cliente({ panel: false });
    const base = { nombre: 'Carlos Pérez', correo: 'carlos@correo.co', telefono: '3109876543', tipoProyecto: 'comercial', mensaje: 'Quiero remodelar un local comercial en Tunja.' };
    const sin = await c.post('/api/publico/contacto', base);
    assert.equal(sin.estado, 400);
    assert.ok(sin.datos.detalles.consentimiento);
    const con = await c.post('/api/publico/contacto', { ...base, consentimiento: true });
    assert.equal(con.estado, 201);
    const robot = await c.post('/api/publico/contacto', { ...base, consentimiento: true, sitioWeb: 'spam.com' });
    assert.equal(robot.estado, 201);
    assert.equal(await e.db.solicitudContacto.count({ where: { origen: 'FORMULARIO' } }), 1, 'el robot no se guarda');
  });
});

describe('Acceso al panel', () => {
  test('pide la cabecera anti-CSRF', async () => {
    const r = await e.cliente({ panel: false }).post('/api/auth/ingresar', { correo: 'admin@prueba.co', contrasena: CONTRASENA });
    assert.equal(r.estado, 403);
  });

  test('contraseña correcta y cookie segura', async () => {
    const c = e.cliente();
    const r = await c.post('/api/auth/ingresar', { correo: 'admin@prueba.co', contrasena: CONTRASENA });
    assert.equal(r.estado, 200);
    assert.match(r.cabeceras.get('set-cookie'), /HttpOnly; SameSite=Strict/i);
    const yo = await c.get('/api/auth/yo');
    assert.equal(yo.datos.usuario.rol, 'ADMINISTRADOR');
    assert.equal(yo.datos.usuario.hashContrasena, undefined);
    await c.post('/api/auth/salir', {});
    assert.equal((await c.get('/api/auth/yo')).estado, 401);
  });

  test('bloqueo tras 5 intentos fallidos y aviso por correo', async () => {
    await e.db.usuario.create({ data: { nombre: 'Bloqueo', correo: 'bloqueo@prueba.co', rol: 'EDITOR', hashContrasena: (await e.db.usuario.findFirst({ where: { correo: 'editor@prueba.co' } })).hashContrasena } });
    const c = e.cliente();
    for (let i = 1; i <= 4; i += 1) {
      const r = await c.post('/api/auth/ingresar', { correo: 'bloqueo@prueba.co', contrasena: 'incorrecta' });
      assert.equal(r.estado, 401);
      assert.match(r.datos.error, new RegExp(`${5 - i} intento`));
    }
    assert.equal((await c.post('/api/auth/ingresar', { correo: 'bloqueo@prueba.co', contrasena: 'incorrecta' })).estado, 423);
    assert.equal((await c.post('/api/auth/ingresar', { correo: 'bloqueo@prueba.co', contrasena: CONTRASENA })).estado, 423, 'ni con la contraseña correcta');
    assert.ok(e.servicios.correo.bandeja.some((m) => m.to === 'bloqueo@prueba.co' && /bloqueamos/i.test(m.subject)));
  });

  test('recuperación de contraseña por correo', async () => {
    const c = e.cliente();
    const r = await c.post('/api/auth/recuperar', { correo: 'editor@prueba.co' });
    assert.equal(r.estado, 200);
    const igual = await c.post('/api/auth/recuperar', { correo: 'noexiste@prueba.co' });
    assert.equal(igual.datos.mensaje, r.datos.mensaje, 'no revela si el correo existe');
    const correo = e.servicios.correo.bandeja.find((m) => m.to === 'editor@prueba.co' && /restablece/i.test(m.subject));
    const token = correo.text.match(/#token=([\w-]+)/)[1];
    assert.equal((await c.post('/api/auth/restablecer', { token, contrasena: 'corta' })).estado, 400);
    assert.equal((await c.post('/api/auth/restablecer', { token, contrasena: CONTRASENA })).estado, 200);
    assert.equal((await c.post('/api/auth/restablecer', { token, contrasena: CONTRASENA })).estado, 400, 'el enlace es de un solo uso');
  });
});

describe('Panel: contenido, permisos y publicación', () => {
  test('el editor crea, ordena y oculta sin borrar; el sitio no cambia hasta publicar', async () => {
    const ed = await e.ingresar('editor@prueba.co');
    const nueva = await ed.post('/api/admin/preguntas', { pregunta: '¿Trabajan fuera de Boyacá?', respuesta: 'Sí, atendemos proyectos en todo el país con visitas programadas.' });
    assert.equal(nueva.estado, 201, JSON.stringify(nueva.datos));
    const lista = (await ed.get('/api/admin/preguntas')).datos;
    const ids = [nueva.datos.id, ...lista.filter((p) => p.id !== nueva.datos.id).map((p) => p.id)];
    assert.equal((await ed.put('/api/admin/preguntas/orden', { ids })).estado, 200);
    assert.equal((await ed.get('/api/admin/preguntas')).datos[0].id, nueva.datos.id);
    const oculta = await ed.patch(`/api/admin/preguntas/${ids[1]}/visible`, { visible: false });
    assert.equal(oculta.datos.visible, false);
    assert.equal((await ed.get('/api/admin/preguntas')).datos.length, lista.length, 'ocultar no borra');

    assert.equal((await ed.get('/api/admin/publicacion/estado')).datos.hayCambios, true);
    const publico = (await e.cliente({ panel: false }).get('/api/publico/contenido')).datos;
    assert.ok(!publico.preguntas.some((p) => p.pregunta.includes('fuera de Boyacá')), 'el borrador no se ve en el sitio');

    const vista = await ed.post('/api/admin/publicacion/vista-previa', {});
    const token = new URL(vista.datos.url).searchParams.get('vista-previa');
    const previa = (await e.cliente({ panel: false }).get(`/api/publico/contenido?vista-previa=${encodeURIComponent(token)}`)).datos;
    assert.equal(previa.vistaPrevia, true);
    assert.equal(previa.preguntas[0].pregunta, '¿Trabajan fuera de Boyacá?');
    assert.ok(!previa.preguntas.some((p) => p.id === ids[1]), 'lo oculto no aparece');

    assert.equal((await ed.post('/api/admin/publicacion/publicar', {})).estado, 403, 'el editor no publica');
    for (const ruta of ['/api/admin/solicitudes', '/api/admin/usuarios', '/api/admin/cotizador/insumos', '/api/admin/historial']) {
      assert.equal((await ed.get(ruta)).estado, 403, `editor sin acceso a ${ruta}`);
    }
  });

  test('el administrador publica, ve el historial y puede restaurar', async () => {
    const ad = await e.ingresar('admin@prueba.co');
    const pub = await ad.post('/api/admin/publicacion/publicar', { nota: 'Nueva pregunta' });
    assert.equal(pub.estado, 201);
    const publico = (await e.cliente({ panel: false }).get('/api/publico/contenido')).datos;
    assert.equal(publico.version, 2);
    assert.equal(publico.preguntas[0].pregunta, '¿Trabajan fuera de Boyacá?');
    const historial = (await ad.get('/api/admin/historial')).datos;
    assert.ok(historial.registros.some((h) => h.accion === 'ORDENAR'));
    assert.ok(historial.registros.some((h) => h.accion === 'PUBLICAR'));
    const versiones = (await ad.get('/api/admin/publicaciones')).datos;
    const v1 = versiones.find((v) => v.version === 1);
    assert.equal((await ad.post(`/api/admin/publicaciones/${v1.id}/restaurar`, {})).estado, 201);
  });

  test('fotos: texto alternativo obligatorio y conversión a WebP', async () => {
    const ed = await e.ingresar('editor@prueba.co');
    const jpg = await readFile(new URL('../../assets/img/arquitecto.webp', import.meta.url));
    const sinAlt = await ed.post('/api/admin/medios', jpg, { 'Content-Type': 'image/webp', 'X-Nombre-Archivo': 'foto.webp' });
    assert.equal(sinAlt.estado, 400, JSON.stringify(sinAlt.datos));
    assert.ok(sinAlt.datos.detalles.alt);
    const ok = await ed.post('/api/admin/medios', jpg, { 'Content-Type': 'image/webp', 'X-Nombre-Archivo': encodeURIComponent('Retrato del arquitecto.webp'), 'X-Texto-Alternativo': encodeURIComponent('Retrato del arquitecto en su estudio') });
    assert.equal(ok.estado, 201, JSON.stringify(ok.datos));
    assert.equal(ok.datos.mime, 'image/webp');
    assert.ok(ok.datos.variantes['960']);
    const pdf = await ed.post('/api/admin/medios', Buffer.from('%PDF-1.4'), { 'Content-Type': 'application/pdf', 'X-Texto-Alternativo': 'documento de prueba' });
    assert.equal(pdf.estado, 400);
    const enUso = (await e.db.hero.findUnique({ where: { id: 1 } })).imagenId;
    assert.equal((await ed.delete(`/api/admin/medios/${enUso}`)).estado, 409, 'no se borra una foto en uso');
  });

  test('portafolio exige texto alternativo en cada imagen', async () => {
    const ed = await e.ingresar('editor@prueba.co');
    const medio = (await ed.get('/api/admin/medios?tipo=IMAGEN')).datos[0];
    const malo = await ed.post('/api/admin/proyectos', { titulo: 'Casa de prueba', categoria: 'residencial', descripcion: 'Una casa de prueba para validar.', imagenes: [{ medioId: medio.id, alt: '' }] });
    assert.equal(malo.estado, 400);
    const bueno = await ed.post('/api/admin/proyectos', { titulo: 'Casa de prueba', categoria: 'residencial', descripcion: 'Una casa de prueba para validar el portafolio.', imagenes: [{ medioId: medio.id, alt: 'Fachada principal de la casa de prueba' }] });
    assert.equal(bueno.estado, 201, JSON.stringify(bueno.datos));
    assert.equal((await ed.delete(`/api/admin/proyectos/${bueno.datos.id}`)).estado, 204);
  });

  test('precios: cambiar un insumo recalcula las actividades que lo usan', async () => {
    const ad = await e.ingresar('admin@prueba.co');
    const insumos = (await ad.get('/api/admin/cotizador/insumos?buscar=oficial')).datos;
    const oficial = insumos.insumos.find((i) => i.descripcion === 'Oficial');
    const r = await ad.put(`/api/admin/cotizador/insumos/${oficial.id}`, { ...oficial, precio: 140000 });
    assert.equal(r.estado, 200, JSON.stringify(r.datos));
    const act = (await ad.get('/api/admin/cotizador/actividades?buscar=muro')).datos.actividades[0];
    // la cuadrilla sube a 220000: 18750 + 6560 + 0.08 × 220000
    assert.equal(act.precioUnitario, 42910);
  });

  test('insumos: se les puede agregar, cambiar y quitar una foto', async () => {
    const ad = await e.ingresar('admin@prueba.co');
    const jpg = await readFile(new URL('../../assets/img/arquitecto.webp', import.meta.url));
    const foto1 = await ad.post('/api/admin/medios', jpg, { 'Content-Type': 'image/webp', 'X-Nombre-Archivo': encodeURIComponent('Material 1.webp'), 'X-Texto-Alternativo': encodeURIComponent('Foto de prueba del material uno') });
    assert.equal(foto1.estado, 201, JSON.stringify(foto1.datos));
    const foto2 = await ad.post('/api/admin/medios', jpg, { 'Content-Type': 'image/webp', 'X-Nombre-Archivo': encodeURIComponent('Material 2.webp'), 'X-Texto-Alternativo': encodeURIComponent('Foto de prueba del material dos') });
    assert.equal(foto2.estado, 201, JSON.stringify(foto2.datos));

    const creado = await ad.post('/api/admin/cotizador/insumos', { descripcion: 'Insumo de prueba con foto', unidad: 'Un', tipo: 'MATERIAL', precio: 1000, imagenId: foto1.datos.id });
    assert.equal(creado.estado, 201, JSON.stringify(creado.datos));
    assert.equal(creado.datos.imagen?.id, foto1.datos.id, 'el insumo nace con la foto elegida');

    const cambiado = await ad.put(`/api/admin/cotizador/insumos/${creado.datos.id}`, { ...creado.datos, imagenId: foto2.datos.id });
    assert.equal(cambiado.estado, 200, JSON.stringify(cambiado.datos));
    assert.equal(cambiado.datos.imagen?.id, foto2.datos.id, 'se puede cambiar la foto');

    const sinFoto = await ad.put(`/api/admin/cotizador/insumos/${creado.datos.id}`, { ...cambiado.datos, imagenId: null });
    assert.equal(sinFoto.estado, 200, JSON.stringify(sinFoto.datos));
    assert.equal(sinFoto.datos.imagen, null, 'se puede quitar la foto');

    assert.equal((await ad.delete(`/api/admin/cotizador/insumos/${creado.datos.id}`)).estado, 204, 'el insumo se puede eliminar');
  });

  test('solicitudes y cotizaciones: ver, descargar Word y eliminar a pedido del titular', async () => {
    const ad = await e.ingresar('admin@prueba.co');
    const lista = (await ad.get('/api/admin/solicitudes')).datos;
    assert.ok(lista.total >= 2);
    const cot = (await ad.get('/api/admin/cotizaciones')).datos.cotizaciones[0];
    const doc = await ad.get(`/api/admin/cotizaciones/${cot.id}/documento`);
    assert.equal(doc.estado, 200);
    assert.equal(doc.datos.subarray(0, 2).toString(), 'PK', 'es un .docx');
    const contacto = lista.solicitudes.find((s) => s.origen === 'FORMULARIO');
    assert.equal((await ad.patch(`/api/admin/solicitudes/${contacto.id}`, { estado: 'CONTACTADA', notas: 'Llamada el lunes' })).datos.estado, 'CONTACTADA');
    assert.equal((await ad.delete(`/api/admin/solicitudes/${contacto.id}`)).estado, 204);
    assert.equal(await e.db.solicitudContacto.count({ where: { id: contacto.id } }), 0);
  });

  test('usuarios: invitación por correo y siempre queda un administrador', async () => {
    const ad = await e.ingresar('admin@prueba.co');
    const nuevo = await ad.post('/api/admin/usuarios', { nombre: 'Ana Ruiz', correo: 'ana@prueba.co', rol: 'EDITOR' });
    assert.equal(nuevo.estado, 201, JSON.stringify(nuevo.datos));
    assert.ok(e.servicios.correo.bandeja.some((m) => m.to === 'ana@prueba.co' && /invitaron/i.test(m.subject)));
    const yo = (await ad.get('/api/auth/yo')).datos.usuario;
    assert.equal((await ad.patch(`/api/admin/usuarios/${yo.id}`, { rol: 'EDITOR' })).estado, 409);
  });

  test('respaldo descargable sin datos personales por defecto', async () => {
    const ad = await e.ingresar('admin@prueba.co');
    const r = await ad.get('/api/admin/respaldo');
    assert.equal(r.estado, 200);
    assert.match(r.cabeceras.get('content-disposition'), /zenite-respaldo-/);
    const datos = JSON.parse(Buffer.isBuffer(r.datos) ? r.datos.toString() : JSON.stringify(r.datos));
    assert.ok(datos.tablas.proyecto.length >= 5);
    assert.equal(datos.tablas.solicitudContacto, undefined);
  });
});
