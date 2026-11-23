# Lista de cambios al documento de análisis

Cambios que deben hacerse en *Lara_Danna_Actividad_2_1.docx* (Unidad 2) y *Lara_Danna_Actividad_3.docx* (Unidad 3) para que coincidan con el producto construido. Ya están aplicados en **Lara_Danna_Zenite_Web_Unidades_2_y_3_integrado.docx**, que une los dos documentos.

Prioridad: **A** = obligatorio (el documento contradice el producto), **M** = recomendado, **B** = mejora de forma.

## 0. Estructura general

| # | Cambio | Prioridad |
|---|---|:-:|
| 0.1 | Unir ambos documentos: la Unidad 2 aporta la fase de análisis y la Unidad 3 el modelado, las métricas, el prototipo y los manuales. Eliminar la repetición de «Necesidad identificada» y «Objetivos» de la Unidad 3. | A |
| 0.2 | Portada: «Unidades 2 y 3 · versión integrada» y un título que mencione el sitio, el panel y el cotizador. Corregir «INGENERIA DE SOFWARE» → «INGENIERÍA DE SOFTWARE» (Unidad 2). | A |
| 0.3 | Renumerar tablas y figuras de forma continua y revisar las referencias cruzadas («Tabla 2», «Figura 5»…). | A |
| 0.4 | En la Unidad 2, la sección «2. Fase de Diseño» tiene imágenes sin texto ni rótulo («2. 1 Diagrama de Clases:», «2.5 Casos de uso :»). Rotularlas en formato APA o reemplazarlas por los diagramas nuevos. | A |
| 0.5 | Eliminar la tabla duplicada «2.3 Listado de requerimientos» de la Unidad 2: repite la Tabla 8. | M |

## 1. Introducción

| # | Cambio | Prioridad |
|---|---|:-:|
| 1.1 | Explicar que el sitio dejó de ser solo estático: ahora tiene backend (Node.js, Express, Prisma), base de datos PostgreSQL en Supabase, archivos en Supabase Storage y un panel de administración en Render. | A |
| 1.2 | Mencionar el cotizador de 3 pestañas con la base de precios real y el envío del Word a zeniteark@gmail.com. | A |
| 1.3 | Actualizar la descripción de la estructura del documento. | M |

## 2. Fase de análisis

| Sección | Cambio | Prioridad |
|---|---|:-:|
| 1.2 Problema | Reemplazar los «tres servicios» (estudio técnico y legal, diseño arquitectónico, interiores) por las **3 líneas de servicio**: Análisis y Consultoría, Construcción, y Financiera y Costos. | A |
| 1.2 Problema | Reemplazar los **5 tipos de proyecto** (propiedad horizontal, casa, lote, remodelación, hospitalario) por los **7**: Residencial (Vivienda), Comercial y de Negocios, Dotacional e Institucional, Recreativo y Deportivo, Industrial y Logística, Intervenciones sobre lo Existente, Urbanismo y Territorio. | A |
| 1.2 Problema | Agregar NIT 901.850.784-0, dirección en Tunja y las necesidades nuevas: editar el contenido sin programador, cotizar con la base de precios del Excel y guardar las solicitudes de forma segura. | A |
| 1.3 Objetivos | Objetivo general: cambiar «sitio estático con portafolio filtrable y simulador referencial» por «sitio con cotizador de 3 pestañas y panel de administración con base de datos». | A |
| 1.3 Objetivos | Objetivo 4: el simulador ya no calcula un rango mínimo–máximo con tarifas por m² en JSON; calcula en el servidor con precios de la base de datos (APU + AIU). | A |
| 1.3 Objetivos | Objetivo 5: el formulario ya no usa Netlify Forms; guarda en la base de datos. | A |
| 1.3 Objetivos | Objetivo 7: la «guía para editar JSON» se reemplaza por el panel y su manual. Agregar objetivos de API, panel, seguridad, migración de datos y Ley 1581. | A |
| 1.4 Viabilidad | Técnica: agregar Node.js, Express, Prisma, PostgreSQL, Supabase y Render. Económica: ya no es «sin base de datos ni hosting con costo». Operativa: ya no se edita JSON ni Git; se usa el panel. Legal: agregar la licencia de uso exclusivo de la base de precios. | A |
| 1.4 Costos | Agregar desarrollo del backend y del panel, cotizador, Render Starter (USD 7/mes) y Supabase (gratis o Pro USD 25/mes). Total del primer año: COP 4,1 a 5,3 millones (antes 1,47). | A |
| 1.5 Cronograma | De 9,5 a 14 semanas; agregar base de datos y API, panel, cotizador e importación de precios, y migración de contenido. Actualizar el Gantt. | A |
| 1.6 Metodología | Mantener Scrum adaptado; actualizar el plan de sprints (8 sprints) y la gestión de configuración (Render ejecuta migraciones; respaldo con GitHub Actions; ya no hay revisión de tarifas por pull request). | M |
| 1.7 Hardware | «Servidor propio: no requerido» → servidores gestionados en Render, Supabase y Netlify. | M |
| 1.7 Software | Agregar Node.js 20, Express, Prisma, PostgreSQL/Supabase, Supabase Storage, sharp, ffmpeg, docx, nodemailer, zod, Python/openpyxl, Render, Playwright. Quitar Netlify Forms. Node.js ya no es solo para pruebas. | A |
| 1.7 RF | Actualizar RF-03, RF-04, RF-06 (no hay filtros, el portafolio es un carrusel), RF-08, RF-10 a RF-12 (base de datos en vez de Netlify Forms), RF-16 a RF-19 (cotizador de 3 pestañas), RF-21 (dotacional en vez de hospitalario). | A |
| 1.7 RF | Agregar RF-22 a RF-40: acceso con contraseña cifrada, segundo factor, bloqueo tras 5 intentos, recuperación por correo, roles, CRUD de secciones, ordenar y ocultar, medios (10 MB/50 MB, WebP, alt obligatorio), borrador y publicación, historial, usuarios, respaldos, CRUD de precios, cotización en Word, envío por correo, solicitudes (Ley 1581), panel accesible, migración y respaldo del contenido. | A |
| 1.7 RNF | Seguridad (scrypt, 2FA, cookies seguras, CSRF, CORS, límites, CSP); Privacidad (Ley 1581 con anonimización a 24 meses); Confidencialidad de precios; Mantenibilidad (ya no «editando JSON»); Disponibilidad con copia de respaldo del contenido; Trazabilidad; Recuperabilidad. | A |
| 1.8 Interfaz | Tabla 10 de módulos: «cinco tarjetas numeradas» → siete tipos; «portafolio con filtros» → carrusel automático con flechas por proyecto; «proceso de cinco pasos» → cinco fases de análisis con actividades; «formulario precargado desde el simulador» → solicitud dentro del cotizador; quitar «Descartado: hotelería, oficinas y comercio» (ahora es parte del tipo Comercial); «video de fondo descartado» → hay una sección de videos con transcripción. | A |
| 1.8 Mapa del sitio | Agregar sección de videos, las 7 páginas de tipo de proyecto y el panel. | A |
| 1.8 Guía visual | Cambiar la paleta: azul noche **#0B2A45**, dorado **#E3A72F**, dorado oscuro **#8A5A00**, dorado claro **#F2C14E**, crema **#F7F4EE**, gris **#5B6470** (antes #16263A, terracota #A35A32, #F5F1EA, #6B6F6C). | A |
| 1.8 Figuras | Reemplazar las maquetas provisionales por capturas reales (sección 4 del documento integrado). | M |

## 3. Fase de diseño

| Sección | Cambio | Prioridad |
|---|---|:-:|
| Arquitectura (nueva) | Agregar el diagrama de arquitectura: Netlify ↔ API en Render ↔ PostgreSQL y Storage en Supabase ↔ Gmail. | A |
| Casos de uso | Actualizar CU-09 y CU-10; CU-13 «Actualizar tarifas» pasa a «Actualizar precios» en el panel; CU-14 y CU-15 ya no usan JSON ni Netlify. Agregar CU-16 a CU-19 (medios, publicar, usuarios, historial y respaldos) y el actor **Editor**. | A |
| Modelo E/R | Reemplazar el modelo de la Unidad 3 (tipo_proyecto, servicio, configuracion_tarifas, tarifa, cotizacion, detalle_cotizacion…) por el de la base real de 23 tablas: usuario, sesion, codigo_verificacion, medio, hero, proyecto, imagen_proyecto, video, testimonio, pregunta_frecuente, dato_contacto, perfil, publicacion, historial_cambio, capitulo, actividad, insumo, componente_apu, servicio_catalogo, configuracion_cotizador, cotizacion, cotizacion_linea, solicitud_contacto. | A |
| Modelo E/R | Quitar la nota «las tarifas y el portafolio se guardan en archivos JSON y las solicitudes en Netlify Forms». | A |
| Diagrama de clases (U2) | Reemplazarlo por el diagrama de arquitectura en capas (rutas, servicios, dominio, seguridad) o actualizarlo con los servicios nuevos. | M |
| Secuencia CU-09 | Ya no se lee tarifas.json ni se calcula en el navegador: el sitio pide opciones a la API, busca actividades y la API calcula. | A |
| Secuencia CU-10 | Ya no hay Netlify Forms ni precarga del formulario: la API guarda la cotización y la solicitud, genera el Word y lo envía al correo. | A |
| Secuencia CU-13 | Ya no hay rama de Git, pull request ni Deploy Preview: el administrador cambia el precio en el panel y se recalculan las actividades. | A |
| Secuencias nuevas | Ingreso con segundo factor y bloqueo; editar, previsualizar y publicar. | A |
| Estados: solicitud | Mantener los estados; agregar «Eliminada» (pedido del titular) y «Anonimizada» (24 meses). «Recibida por Netlify Forms» → «guardada en la base de datos». | A |
| Estados: simulador | Reemplazar los 6 estados del simulador de 5 pasos por los del cotizador modal (Cargando, Sin conexión, Eligiendo, Con errores, Resultado, Enviando, Enviado). | A |
| Estados: formulario | Quitar el estado «Precargado» y «POST a Netlify Forms». | A |
| Estados nuevos | Publicación (al día / con cambios), usuario (invitado, activo, bloqueado, inactivo) y medio (validando, procesando, listo, en uso, error). | M |
| API (nueva) | Agregar el resumen de la API y las reglas de cálculo (APU, %MO, AIU, unidades de cobro). | A |

## 4. Métricas y calidad

| Cambio | Prioridad |
|---|:-:|
| Tabla ISO/IEC 25010: «Los 21 requisitos» → 40; Seguridad: agregar 2FA, bloqueo, CSRF, Ley 1581 y confidencialidad de precios; Fiabilidad: agregar restauración de respaldos. | A |
| Desarrollo: la «cobertura de pruebas del simulador» pasa a pruebas automáticas de la API y del sitio; agregar «exactitud de precios unitarios frente al Excel». | A |
| Despliegue: «tiempo de actualización de tarifas editando JSON (≤ 10 min)» → «tiempo de actualización desde el panel (≤ 2 min)»; «Solicitudes en Netlify Forms» → «en el panel». Agregar tiempo de respuesta de la API. | A |
| Proceso: desviación del cronograma (14 semanas) y del costo (nuevo presupuesto). | A |
| Agregar los **resultados obtenidos**: 27/27 pruebas de la API, 9/9 del sitio, 2.288/2.288 precios iguales al Excel, migración de 23 tablas, 0 px de desbordamiento en celular. | A |
| Definición de «hecho»: agregar migraciones de Prisma, ningún secreto en el repositorio y revisión en la vista previa del panel (antes de Netlify). | M |

## 5. Prototipo → interfaz implementada

| Pantalla | Cambio | Prioridad |
|---|---|:-:|
| General | Paleta nueva; botón «Cotiza tu proyecto» lleva al cotizador. Cambiar «prototipo» por «interfaz implementada» y usar capturas reales. | A |
| Servicios | Tres líneas de servicio con descripción y 7 tipos de proyecto. Quitar «tarjeta final que lleva al simulador» y la banda «¿Cuánto costaría tu proyecto?». | A |
| Portafolio | Quitar los filtros: carrusel automático con pausa y flechas por proyecto; descripción visible en la tarjeta. Datos desde la API. | A |
| Proceso | Las cinco fases de análisis con sus actividades (briefing, sitio y entorno, normativo y legal, factibilidad y viabilidad, síntesis y entregable). | A |
| Videos (nueva) | Sección «Mira cómo trabajamos» con transcripciones. | M |
| Simulador | Reemplazar el flujo de 5 pasos con barra de progreso por el cotizador modal de 3 pestañas con resultado detallado y solicitud. | A |
| Contacto | Formulario con los 7 tipos y envío a la API; datos con dirección de Tunja. | A |
| Panel (nueva) | Agregar las pantallas del panel: ingreso con código, tablero, listas ordenables, edición, medios, publicación, APU, solicitudes, usuarios e historial. | A |

## 6. Manuales

| Cambio | Prioridad |
|---|:-:|
| Manual de usuario: reescribir «Cómo usar el simulador» para el cotizador de 3 pestañas y quitar «Solicitar cotización real → formulario precargado». | A |
| Capítulo 7 «Guía del administrador» (pendiente): ahora es el **manual del panel** (docs/MANUAL-PANEL.md). | A |
| Manual del programador: quitar Live Server como forma de ejecución; agregar el modo demostración (npm run demo), la instalación en Supabase, Render y Netlify, las variables de entorno, la importación del Excel, la migración y los respaldos. | A |
| Estructura del proyecto: reemplazar el árbol propuesto (assets/js/simulador.js, data/tarifas.json…) por el real (js/modules, servidor/src, servidor/panel, prisma). Quitar el ejemplo de tarifas.json. | A |
| Tabla de módulos JavaScript: agregar api.js, contenido.js, cotizador.js (nuevo), marquesina.js, videos.js; quitar simulador.js. Agregar los servicios del servidor. | M |

## 7. Conclusiones y referencias

| Cambio | Prioridad |
|---|:-:|
| Actualizar conclusiones con el cambio de arquitectura, la exactitud del cotizador, la seguridad y la Ley 1581. | A |
| Agregar referencias: Decreto 1377 de 2013, Express, Prisma, Supabase, Render, OWASP Top 10 y Sommerville (2016), que se cita en la Unidad 2 pero no está en sus referencias. | A |
| Quitar Netlify Forms si ya no se cita; mantener Martin (2009) y Mozilla solo si se citan en el texto. | B |
