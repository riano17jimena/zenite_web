/**
 * Los 7 tipos generales de proyecto que atiende Zenite, con sus subtipos.
 * Se usan en el sitio (sección «Elige tu tipo de proyecto»), en el portafolio,
 * en el cotizador y en el formulario de contacto.
 * @module dominio/categorias
 */
export const CATEGORIAS = Object.freeze([
  {
    clave: 'residencial', nombre: 'Residencial (Vivienda)',
    subtipos: ['Casa unifamiliar (aislada, adosada o en hilera)', 'Edificio de apartamentos o viviendas multifamiliares', 'Conjunto residencial cerrado o urbanización de viviendas', 'Vivienda de interés social (VIS / VIP)', 'Residencia de estudiantes o para la tercera edad', 'Casa de campo o fincas de recreo'],
  },
  {
    clave: 'comercial', nombre: 'Comercial y de Negocios',
    subtipos: ['Centro comercial, pasaje comercial o mall', 'Edificio de oficinas o sedes corporativas', 'Local comercial individual (tiendas, boutiques)', 'Restaurante, bar, cafetería o food court', 'Supermercado, hipermercado o mercado público de abastos', 'Hotel, resort, hostal o glamping', 'Estación de servicio / Gasolinera'],
  },
  {
    clave: 'dotacional', nombre: 'Dotacional e Institucional (Servicios Públicos)',
    subtipos: ['Hospital, clínica, centro de salud o puestos de atención médica', 'Colegio, escuela, jardín infantil o universidad', 'Biblioteca, museo, galería de arte o centro cultural', 'Teatro, auditorio o centro de convenciones', 'Sede gubernamental (alcaldías, ministerios, palacios de justicia)', 'Estación de bomberos, policía o centros penitenciarios', 'Terminal de transporte (terrestre, marítimo o aeropuertos)', 'Centro religioso (iglesia, templo, mezquita)'],
  },
  {
    clave: 'recreativo', nombre: 'Recreativo y Deportivo',
    subtipos: ['Parque urbano, parque lineal, plazas o plazoletas', 'Complejo deportivo (estadio, coliseo, pistas de atletismo)', 'Gimnasio, centro de alto rendimiento o club social', 'Piscina pública, centro acuático o spa', 'Parque temático o parque de atracciones'],
  },
  {
    clave: 'industrial', nombre: 'Industrial y Logística',
    subtipos: ['Bodega, almacén o centro de distribución (CEDI)', 'Nave industrial o fábrica de producción', 'Parque industrial o zona franca', 'Planta de tratamiento (de agua, energía o residuos)'],
  },
  {
    clave: 'intervenciones', nombre: 'Intervenciones sobre lo Existente',
    subtipos: ['Remodelación o reforma de interiores (casas, locales, oficinas)', 'Ampliación o extensión de una edificación actual', 'Restauración patrimonial o conservación de monumentos históricos', 'Adecuación de local (cambio de uso, ej: de oficina a cafetería)'],
  },
  {
    clave: 'urbanismo', nombre: 'Urbanismo y Territorio',
    subtipos: ['Zona urbanística (planificación de un nuevo barrio o sector)', 'Loteo y parcelación (división de un terreno grande en lotes más pequeños)', 'Plan de Ordenamiento Territorial (POT) o planes parciales', 'Diseño de espacio público (andenes, ciclorrutas, alamedas)'],
  },
]);

export const CLAVES_CATEGORIA = CATEGORIAS.map((c) => c.clave);
export const nombreCategoria = (clave) => CATEGORIAS.find((c) => c.clave === clave)?.nombre ?? clave;
