# API de Zenite Web

Base: `https://zenite-api.onrender.com` (variable `URL_API`). Todas las respuestas son JSON en UTF-8, salvo las descargas (Word y respaldo).

## Convenciones

- **Errores**: `{ "error": "mensaje en español", "detalles": { "campo": "mensaje" } }`. `detalles` aparece en errores de validación (400).

| Código | Significado |
|---|---|
| 200 / 201 / 204 | Correcto / creado / correcto sin contenido |
| 400 | Datos inválidos (ver `detalles`) |
| 401 | Sin sesión, sesión vencida o credenciales incorrectas |
| 403 | Sin permiso para el rol, o solicitud rechazada por seguridad (CSRF) |
| 404 | No existe |
| 409 | Conflicto: duplicado, en uso, o regla de negocio (p. ej. debe quedar un administrador) |
| 413 | Archivo o cuerpo demasiado grande |
| 423 | Acceso bloqueado temporalmente (5 intentos fallidos) |
| 429 | Demasiadas solicitudes (cabecera `Retry-After`) |

- **Rutas públicas** (`/api/publico`): CORS solo para `ORIGENES_PERMITIDOS`. Sin cookies.
- **Rutas del panel** (`/api/auth`, `/api/admin`): cookie `zenite_sesion` (HttpOnly, Secure, SameSite=Strict). Toda operación que no sea GET debe enviar la cabecera **`X-Zenite-Panel: 1`**; si el navegador envía `Origin`, debe ser el de la API.
- **Roles**: `EDITOR` y `ADMINISTRADOR`. En las tablas, «Rol» indica el mínimo necesario.
- Los campos vacíos de los formularios pueden enviarse como `""`: se guardan como `null`.

---

## Salud

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/api/salud` | `{ "estado": "ok", "hora": "…" }` (la usa Render para saber si el servicio está vivo) |

## Público (sitio web)

### `GET /api/publico/contenido`

Versión publicada del sitio. Caché de 60 s. Límite: 240 solicitudes / 10 min por IP.

```json
{
  "version": 3, "publicada": "2026-11-06T18:00:00.000Z",
  "hero": { "antetitulo": "…", "titulo": "…", "texto": "…", "pieImagen": "…",
            "imagen": { "url": "…", "url960": "…", "ancho": 1920, "alto": 1044, "alt": "…" } },
  "proyectos": [{ "id": 1, "titulo": "…", "categoria": "residencial", "ubicacion": "…", "anio": 2025, "area": 180,
                  "descripcion": "…", "destacado": true, "imagenes": [{ "url": "…", "url960": "…", "alt": "…" }] }],
  "videos": [{ "id": 1, "titulo": "…", "etiqueta": "…", "descripcion": "…", "transcripcion": "…", "duracionSeg": 35,
               "url": "…mp4", "poster": "…webp", "ancho": 720, "alto": 1216 }],
  "testimonios": [{ "id": 1, "nombre": "…", "proyecto": "…", "ciudad": "…", "comentario": "…", "foto": null }],
  "preguntas": [{ "id": 1, "pregunta": "…", "respuesta": "…" }],
  "contactos": [{ "tipo": "WHATSAPP", "etiqueta": "WhatsApp", "valor": "315 711 0946", "enlace": "https://wa.me/573157110946" }],
  "perfiles": [{ "nombre": "…", "cargo": "…", "lema": "…", "mision": "…", "formacion": "…", "trayectoria": "…", "experiencia": "…", "foto": { } }]
}
```

Solo incluye elementos visibles; los testimonios además deben estar marcados como autorizados, y los videos, listos.

`?vista-previa=TOKEN` devuelve el **borrador** (`"vistaPrevia": true`, sin caché). El token lo genera el panel y vence en 30 min; si es inválido responde 401. Si aún no hay nada publicado: 404.

### `GET /api/publico/cotizador/opciones`

Opciones del cotizador **sin precios**. Caché de 5 min.

```json
{
  "tiposProyecto": [{ "clave": "residencial", "nombre": "Residencial (Vivienda)" }],
  "capitulos": [{ "codigo": "1", "nombre": "Preliminares" }],
  "consultoria": [{ "id": 1, "categoria": "CONSULTORIA", "nombre": "…", "descripcion": "…", "unidad": "GLOBAL", "unidadTexto": "Global" }],
  "financiera": [ ],
  "avisoReferencial": "…", "maxLineas": 60
}
```

### `GET /api/publico/cotizador/actividades?capitulo=3&buscar=muro`

Búsqueda de actividades de obra. Requiere `capitulo` o al menos 3 letras en `buscar` (si no, 400). Máximo 30 resultados; **no incluye precios ni análisis**. Límite: 120 / 10 min.

```json
{ "actividades": [{ "codigo": "3.11", "descripcion": "…", "unidad": "m2", "subcapitulo": null }], "hayMas": false }
```

### `POST /api/publico/cotizador/calcular`

Calcula en el servidor. Límite: 60 / 10 min.

```json
{
  "seleccion": {
    "tipoProyecto": "residencial",
    "areaM2": 120,
    "consultoria": [{ "id": 5 }, { "id": 9, "cantidad": 3 }],
    "construccion": [{ "codigo": "3.11", "cantidad": 45 }],
    "financiera": [{ "id": 11 }]
  }
}
```

- Cada pestaña es opcional (se puede cotizar solo construcción); debe haber al menos un elemento.
- Servicios por **m²** usan `areaM2` (obligatoria en ese caso) y respetan el cargo mínimo; **GLOBAL** = 1; **MES, UNIDAD, HORA** usan `cantidad`.
- Construcción: costo directo = Σ cantidad × precio unitario; luego **Administración, Imprevistos y Utilidad** sobre el costo directo e **IVA sobre la utilidad** (porcentajes de la configuración).

Respuesta:

```json
{
  "areaM2": 120,
  "secciones": {
    "CONSULTORIA": { "lineas": [{ "referencia": "5", "descripcion": "…", "unidad": "m²", "cantidad": 120, "precioUnitario": 18000, "valor": 2160000 }], "subtotal": 2160000 },
    "CONSTRUCCION": { "lineas": [], "subtotal": 28889595,
                      "aiu": { "administracion": 2888960, "imprevistos": 1444480, "utilidad": 1444480, "ivaUtilidad": 274451 },
                      "porcentajes": { "administracion": 0.1, "imprevistos": 0.05, "utilidad": 0.05, "ivaSobreUtilidad": 0.19 },
                      "total": 34941966 },
    "FINANCIERA": { "lineas": [], "subtotal": 600000 }
  },
  "total": 37701966, "avisoReferencial": "…", "validezDias": 15
}
```

### `POST /api/publico/cotizaciones`

Guarda la cotización, crea la solicitud de contacto, genera el **Word** con la plantilla de Zenite y lo envía al correo configurado (por defecto `zeniteark@gmail.com`). Límite: 5 / hora por IP.

```json
{ "nombre": "María Gómez", "correo": "maria@correo.co", "telefono": "300 123 4567", "ciudad": "Tunja",
  "mensaje": "Opcional", "consentimiento": true, "seleccion": { } }
```

Respuesta 201: `{ "codigo": "ZEN-2026-0001", "total": 37701966, "mensaje": "…" }`.

### `POST /api/publico/contacto`

Formulario de contacto. Límite: 5 / hora por IP.

```json
{ "nombre": "…", "correo": "…", "telefono": "…", "tipoProyecto": "comercial", "mensaje": "…", "consentimiento": true }
```

`tipoProyecto`: una de las 7 claves (`residencial`, `comercial`, `dotacional`, `recreativo`, `industrial`, `intervenciones`, `urbanismo`) u `otro`. Sin `consentimiento: true` responde 400 (Ley 1581).

**Campo trampa**: si llega `sitioWeb` con valor (lo llenan los robots), se responde 201 sin guardar nada.

---

## Acceso (`/api/auth`)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/ingresar` | `{ correo, contrasena }` | `{ desafio, correo: "ad•••@gmail.com", minutos: 10 }` y envía el código. 401 con intentos restantes; 423 al bloquear. |
| POST | `/verificar` | `{ desafio, codigo }` | Crea la cookie de sesión. `{ usuario }` |
| POST | `/reenviar-codigo` | `{ desafio }` | Nuevo código (anula el anterior) |
| POST | `/salir` | — | Cierra la sesión |
| GET | `/yo` | — | `{ usuario: { id, nombre, correo, rol }, urlSitio }` o 401 |
| POST | `/recuperar` | `{ correo }` | Siempre la misma respuesta (no revela si el correo existe). Envía un enlace de 30 min. |
| POST | `/restablecer` | `{ token, contrasena }` | Guarda la contraseña, desbloquea y cierra las demás sesiones. Enlace de un solo uso. |
| POST | `/contrasena` | `{ actual, nueva }` | Cambia la contraseña propia (requiere sesión) |

Política de contraseñas: 10 a 128 caracteres, al menos una letra y un número.
Límites: 20 intentos / 15 min por IP en ingreso; 6 correos / hora.

---

## Panel (`/api/admin`) — requiere sesión

### Resumen

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/resumen` | Editor | Estado de publicación, conteos por sección y (administrador) solicitudes nuevas |

### Secciones del sitio (CRUD, orden y visibilidad)

`{seccion}` ∈ `proyectos`, `videos`, `testimonios`, `preguntas`, `contactos`, `perfiles`. Rol: **Editor**.

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/{seccion}` | Lista en orden |
| POST | `/{seccion}` | Crea (201) |
| GET | `/{seccion}/:id` | Detalle |
| PUT | `/{seccion}/:id` | Reemplaza los datos |
| DELETE | `/{seccion}/:id` | Elimina (204) |
| PUT | `/{seccion}/orden` | `{ ids: [3, 1, 2] }` nuevo orden completo (arrastrar y soltar) |
| PATCH | `/{seccion}/:id/visible` | `{ visible: false }` ocultar sin borrar |

Campos por sección:

| Sección | Campos (obligatorios en **negrita**) |
|---|---|
| proyectos | **titulo**, **categoria** (7 claves), ubicacion, anio, area, **descripcion**, destacado, visible, **imagenes** `[{ medioId, alt }]` (1 a 12, alt ≥ 8 caracteres) |
| videos | **titulo**, **etiqueta**, **descripcion**, transcripcion, **archivoId** (video LISTO), posterId, visible |
| testimonios | **nombre**, **proyecto**, ciudad, **comentario**, fotoId, fotoAlt (obligatorio si hay foto), autorizado, visible |
| preguntas | **pregunta**, **respuesta**, visible |
| contactos | **tipo** (`WHATSAPP`, `TELEFONO`, `CORREO`, `INSTAGRAM`, `DIRECCION`, `HORARIO`, `OTRO`), **etiqueta**, **valor**, enlace (`https://`, `mailto:` o `tel:`), visible |
| perfiles | **nombre**, **cargo**, lema, mision, **formacion**, **trayectoria**, experiencia, fotoId, fotoAlt, visible |

### Portada

| Método | Ruta | Rol | Cuerpo |
|---|---|---|---|
| GET | `/hero` | Editor | — |
| PUT | `/hero` | Editor | **antetitulo**, **titulo**, **texto**, **imagenId**, **imagenAlt**, pieImagen |

### Fotos y videos

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/medios?tipo=IMAGEN\|VIDEO` | Editor | Biblioteca |
| POST | `/medios` | Editor | Subida binaria (ver abajo) |
| GET | `/medios/:id` | Editor | Detalle con `usos` (dónde se usa) |
| PATCH | `/medios/:id` | Editor | `{ alt }` |
| DELETE | `/medios/:id` | Editor | 409 si está en uso |

Subida: el cuerpo es el archivo; cabeceras `Content-Type` (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`), `X-Nombre-Archivo` y `X-Texto-Alternativo` (codificadas con `encodeURIComponent`).

- **Fotos**: máximo 10 MB, texto alternativo obligatorio (≥ 8 caracteres). Se convierten a **WebP** de 1920 px y una variante de 960 px.
- **Videos**: máximo 50 MB. Responde de inmediato con `estado: "PROCESANDO"`; se comprimen en segundo plano a **H.264** (máx. 1280 px, `faststart`) con portada WebP y pasan a `LISTO` (o `ERROR`).

### Publicación

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/publicacion/estado` | Editor | `{ hayCambios, ultima: { version, publicada, por, nota } }` |
| POST | `/publicacion/vista-previa` | Editor | `{ url, minutos: 30 }` enlace firmado al sitio con el borrador |
| POST | `/publicacion/publicar` | **Administrador** | `{ nota? }` → nueva versión |
| GET | `/publicaciones` | Administrador | Últimas 50 versiones |
| POST | `/publicaciones/:id/restaurar` | Administrador | Vuelve a publicar una versión anterior |

### Cotizador — Administrador

| Método | Ruta | Descripción |
|---|---|---|
| GET, POST | `/cotizador/servicios` | Servicios de consultoría y financieros (`categoria`, `nombre`, `descripcion`, `unidad`, `precio`, `cargoMinimo`, `provisional`, `visible`) |
| PUT | `/cotizador/servicios/orden` | `{ ids }` |
| PUT, DELETE | `/cotizador/servicios/:id` | |
| GET, PUT | `/cotizador/configuracion` | AIU en **porcentaje 0–100**, `validezDias`, `correoDestino`, `avisoReferencial`, `condicionesPago`, `datosPago`, `maxLineas` |
| GET, POST | `/cotizador/capitulos` | `codigo`, `nombre`, `visiblePublico` |
| PUT, DELETE | `/cotizador/capitulos/:id` | No se elimina si tiene actividades (409) |
| GET | `/cotizador/actividades?buscar=&capituloId=&pagina=&porPagina=` | Paginado (máx. 100) |
| POST | `/cotizador/actividades` | `codigo` (`3.15` o `22.63.04`), `capituloId`, `subcapitulo`, `descripcion`, `unidad`, `precioUnitario` (solo sin APU), `visiblePublico` |
| GET, PUT, DELETE | `/cotizador/actividades/:id` | GET incluye los `componentes` del APU |
| PUT | `/cotizador/actividades/:id/componentes` | `{ componentes: [{ grupo, insumoId \| (descripcion, unidad, precio), cantidad, porcentaje }] }` reemplaza el APU y recalcula |
| GET | `/cotizador/insumos?buscar=&tipo=&pagina=` | Paginado |
| POST, PUT, DELETE | `/cotizador/insumos[/:id]` | Al cambiar el precio se recalculan las actividades que lo usan (también a través de auxiliares). Respuesta con `recalculo: { revisadas, cambiadas }` |

### Solicitudes y cotizaciones — Administrador

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/solicitudes?estado=&buscar=&pagina=` | `{ total, nuevas, solicitudes }` |
| GET | `/solicitudes/:id` | Detalle con autorización de datos |
| PATCH | `/solicitudes/:id` | `{ estado, notas }` — estados `NUEVA`, `EN_REVISION`, `CONTACTADA`, `CERRADA`, `DESCARTADA` |
| DELETE | `/solicitudes/:id` | Supresión a pedido del titular (borra también su cotización) |
| GET | `/cotizaciones?buscar=&pagina=` | Lista |
| GET | `/cotizaciones/:id` | Detalle con líneas |
| GET | `/cotizaciones/:id/documento` | Descarga `.docx` |
| POST | `/cotizaciones/:id/reenviar` | Reenvía el correo con el Word |

### Usuarios — Administrador

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/usuarios` | Lista con estado (activo, bloqueado, último acceso) |
| POST | `/usuarios` | `{ nombre, correo, rol }` → envía invitación (enlace de 72 h) |
| PATCH | `/usuarios/:id` | `{ nombre?, correo?, rol?, activo? }` — siempre debe quedar un administrador activo; no puedes desactivarte |
| POST | `/usuarios/:id/desbloquear` | Quita el bloqueo |
| POST | `/usuarios/:id/invitacion` | Reenvía la invitación |
| DELETE | `/usuarios/:id` | Elimina |

### Historial y respaldo — Administrador

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/historial?entidad=&usuarioId=&pagina=` | `{ total, registros: [{ fecha, usuario, entidad, accion, resumen }] }` |
| GET | `/historial/:id` | Con `antes` y `despues` |
| GET | `/respaldo?precios=1&solicitudes=1` | Descarga JSON. Por defecto sin base de precios ni datos personales |

## Modo demostración

Con `ZENITE_DEMO=1` existe además `GET /api/demo/correos`: bandeja simulada con los últimos 30 correos (códigos, enlaces y cotizaciones).
