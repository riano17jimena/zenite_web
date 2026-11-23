"""Uso: python3 herramientas/generar-paginas.py

Genera las páginas interiores de Zenite Web e inserta en index.html los
bloques compartidos (encabezado, menú lateral y pie), para que todas las
páginas usen exactamente el mismo marcado."""
from pathlib import Path
from html import escape
import re

RAIZ = Path(__file__).resolve().parents[1]
ISOTIPO = (
    '<g fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"><path d="M40.68 15.23A36 36 0 1 1 18.82 68.00"/><path d="M57.51 21.99A29 29 0 1 1 40.08 77.25"/><path d="M65.56 34.44A22 22 0 0 1 57.52 70.67"/></g><circle cx="46" cy="50" r="12" fill="var(--color-punto, #E3A72F)"/>'
)
WHATSAPP = "573157110946"
WHATSAPP_VISIBLE = "315 711 0946"
INSTAGRAM = "zenitearquitectura"
CORREO = "zeniteark@gmail.com"

SECCIONES = [("inicio", "Inicio"), ("servicios", "Servicios"), ("portafolio", "Portafolio"),
             ("proceso", "Proceso"), ("nosotros", "Nosotros"), ("simulador", "Simulador"), ("contacto", "Contacto")]

NUEVA = '<span class="visually-hidden"> (se abre en una pestaña nueva)</span>'


def marca(p, clase=""):
    return (f'<a class="marca {clase}" href="{p}index.html" aria-label="Zenite Arquitectura, ir al inicio">'
            f'<svg class="marca__isotipo" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href="#isotipo"></use></svg>'
            f'<span class="marca__texto" aria-hidden="true"><span class="marca__nombre">Zenite</span>'
            f'<span class="marca__sub">Arquitectura</span></span></a>')


def encabezado(p, inicio):
    ancla = "" if inicio else f"{p}index.html"
    enlaces = "\n".join(
        f'            <li><a class="nav-link panel-menu__enlace" href="{ancla}#{sid}" data-menu-enlace>'
        f'<span class="panel-menu__num" aria-hidden="true">{i:02d}</span>{escape(nombre)}</a></li>'
        for i, (sid, nombre) in enumerate(SECCIONES, 1))
    clase = "encabezado encabezado--superpuesto" if inicio else "encabezado encabezado--solido"
    return f"""  <a class="saltar-contenido" href="#contenido">Saltar al contenido principal</a>
  <svg class="d-none" aria-hidden="true" focusable="false"><symbol id="isotipo" viewBox="0 0 100 100">{ISOTIPO}</symbol></svg>

  <!-- RF-02 · Encabezado fijo con menú lateral -->
  <header class="{clase}" data-encabezado>
    <div class="container encabezado__barra">
      {marca(p)}
      <div class="encabezado__acciones">
        <a class="btn btn-acento encabezado__cotizar" href="{ancla}#simulador">Cotiza tu proyecto</a>
        <button class="btn-menu" type="button" data-bs-toggle="offcanvas" data-bs-target="#panel-menu"
                aria-controls="panel-menu" aria-expanded="false">
          <span class="btn-menu__texto">Menú</span>
          <span class="btn-menu__icono" aria-hidden="true"><span></span><span></span></span>
        </button>
      </div>
    </div>
  </header>

  <div class="offcanvas offcanvas-end panel-menu" tabindex="-1" id="panel-menu" aria-labelledby="panel-menu-titulo">
    <div class="container panel-menu__cabecera">
      {marca(p, "marca--clara")}
      <h2 class="visually-hidden" id="panel-menu-titulo">Menú de navegación</h2>
      <button type="button" class="btn-menu btn-menu--cerrar" data-bs-dismiss="offcanvas">
        <span class="btn-menu__texto">Cerrar</span><span class="btn-menu__x" aria-hidden="true">✕</span>
      </button>
    </div>
    <div class="offcanvas-body">
      <div class="container panel-menu__cuerpo">
        <nav id="panel-menu-nav" aria-label="Secciones del sitio">
          <ol class="panel-menu__lista">
{enlaces}
          </ol>
        </nav>
        <div class="panel-menu__contacto">
          <p class="panel-menu__frase">Tu idea, nuestro diseño, el futuro de todos.</p>
          <dl>
            <div><dt>WhatsApp</dt><dd><a href="https://wa.me/{WHATSAPP}" rel="noopener" target="_blank">{WHATSAPP_VISIBLE}{NUEVA}</a></dd></div>
            <div><dt>Correo</dt><dd><a href="mailto:{CORREO}">{CORREO}</a></dd></div>
            <div><dt>Instagram</dt><dd><a href="https://www.instagram.com/{INSTAGRAM}/" rel="noopener" target="_blank">@{INSTAGRAM}{NUEVA}</a></dd></div>
          </dl>
          <a class="btn btn-acento btn-lg" href="{ancla}#simulador" data-menu-enlace>Cotiza tu proyecto</a>
        </div>
      </div>
    </div>
  </div>
"""


def pie(p, inicio):
    ancla = "" if inicio else f"{p}index.html"
    servicios_pie = "\n".join(f'            <li><a href="{p}servicios/{c}.html">{escape(SERVICIOS[c]["corto"])}</a></li>' for c in SERVICIOS)
    secciones = "\n".join(f'            <li><a href="{ancla}#{sid}">{escape(n)}</a></li>' for sid, n in SECCIONES)
    return f"""  <footer class="pie">
    <div class="container">
      <div class="row g-4">
        <div class="col-lg-4">
          {marca(p, "marca--clara")}
          <p class="pie__frase">Diseñamos espacios que inspiran y conectan con tu vida.</p>
        </div>
        <nav class="col-6 col-md-4 col-lg-2" aria-label="Secciones">
          <h2 class="pie__titulo">Secciones</h2>
          <ul class="pie__lista">
{secciones}
          </ul>
        </nav>
        <nav class="col-6 col-md-4 col-lg-3" aria-label="Servicios">
          <h2 class="pie__titulo">Servicios</h2>
          <ul class="pie__lista">
{servicios_pie}
          </ul>
        </nav>
        <div class="col-md-4 col-lg-3">
          <h2 class="pie__titulo">Contacto</h2>
          <ul class="pie__lista">
            <li><a href="https://wa.me/{WHATSAPP}" rel="noopener" target="_blank">WhatsApp {WHATSAPP_VISIBLE}{NUEVA}</a></li>
            <li><a href="https://www.instagram.com/{INSTAGRAM}/" rel="noopener" target="_blank">Instagram{NUEVA}</a></li>
            <li><a href="mailto:{CORREO}">{CORREO}</a></li>
            <li><a href="{p}politica-de-datos.html">Política de tratamiento de datos</a></li>
          </ul>
        </div>
      </div>
      <p class="pie__legal">© <span data-anio>2026</span> Zenite Arquitectura SAS. Los valores del simulador son referenciales y no constituyen una oferta contractual.</p>
    </div>
  </footer>

  <!-- RF-13 · Botón flotante de WhatsApp -->
  <a class="whatsapp-flotante" href="https://wa.me/{WHATSAPP}?text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20un%20proyecto"
     rel="noopener" target="_blank" aria-label="Escribir por WhatsApp (se abre en una pestaña nueva)">
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.6c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.6 10.6 0 1 1 16 26.6zm5.8-7.9c-.3-.2-1.9-.9-2.2-1s-.5-.2-.7.2-.8 1-1 1.2-.4.2-.7 0a8.7 8.7 0 0 1-4.3-3.8c-.3-.6.3-.5.9-1.7.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.2-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.2-.3-.3-.5-.4z"/></svg>
  </a>

  <script src="{p}vendor/bootstrap/bootstrap.bundle.min.js" defer></script>
  <script src="{p}vendor/gsap/gsap.min.js" defer></script>
  <script src="{p}vendor/gsap/ScrollTrigger.min.js" defer></script>
  <script type="module" src="{p}js/main.js"></script>
"""


def layout(*, titulo, descripcion, prefijo, migas, cuerpo):
    p = prefijo
    migas_html = "".join(
        f'<li><a href="{escape(href)}">{escape(txt)}</a></li>' if href else f'<li aria-current="page">{escape(txt)}</li>'
        for txt, href in migas)
    return f"""<!doctype html>
<html lang="es-CO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{escape(titulo)} · Zenite Arquitectura</title>
  <meta name="description" content="{escape(descripcion)}">
  <meta name="theme-color" content="#0B2A45">
  <link rel="icon" href="{p}assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&family=Poppins:wght@300;400;500;600&display=swap">
  <link rel="stylesheet" href="{p}vendor/bootstrap/bootstrap.min.css">
  <link rel="stylesheet" href="{p}css/styles.css">
</head>
<body>
{encabezado(p, False)}
  <main id="contenido">
    <div class="cabecera-interna">
      <div class="container">
        <nav class="migas" aria-label="Ruta de navegación"><ol>{migas_html}</ol></nav>
      </div>
    </div>
{cuerpo}
  </main>

{pie(p, False)}</body>
</html>
"""


def insertar_en_index():
    ruta = RAIZ / "index.html"
    html = ruta.read_text(encoding="utf-8")
    for clave, contenido in (("encabezado", encabezado("", True)), ("pie", pie("", True))):
        html, n = re.subn(rf"<!-- @{clave} -->.*?<!-- /@{clave} -->",
                          lambda _m: f"<!-- @{clave} -->\n{contenido}<!-- /@{clave} -->", html, flags=re.S)
        assert n == 1, clave
    ruta.write_text(html, encoding="utf-8")



def lista(items):
    return "\n".join(f"              <li>{escape(i)}</li>" for i in items)


SERVICIOS = {
    "residencial": {
        "corto": "Residencial", "nombre": "Residencial (Vivienda)",
        "lead": "Viviendas para cada etapa de la vida: desde la casa de tu familia hasta edificios y conjuntos completos. Diseñamos espacios cómodos, eficientes y que cumplan la norma de tu municipio.",
        "docs": ["Certificado de tradición y libertad del lote o inmueble.", "Escritura y, si existe, levantamiento topográfico.", "Lista de espacios que necesitas y fotos de referencias que te gusten."],
    },
    "comercial": {
        "corto": "Comercial y de negocios", "nombre": "Comercial y de Negocios",
        "lead": "Espacios que venden, atienden y hacen crecer tu negocio. Diseñamos locales, oficinas, restaurantes y hoteles pensando en la experiencia del cliente y en la operación diaria.",
        "docs": ["Documentos del inmueble o lote (tradición, escritura, planos).", "Descripción de la actividad comercial y del número de usuarios esperado.", "Requisitos de la marca o franquicia, si aplica."],
    },
    "dotacional": {
        "corto": "Dotacional e institucional", "nombre": "Dotacional e Institucional (Servicios Públicos)",
        "lead": "Infraestructura para la salud, la educación, la cultura y el servicio público. Estos proyectos tienen normas técnicas especiales (como la habilitación en salud), por eso cada caso requiere un estudio detallado.",
        "docs": ["Programa de servicios que se prestarán (por ejemplo, servicios de salud por habilitar).", "Documentos del predio y planos existentes.", "Estudios previos o lineamientos de la entidad contratante."],
        "aviso": "Por los requisitos normativos, la cotización final de un proyecto dotacional se define después de un estudio especial. El cotizador te da un valor de partida.",
    },
    "recreativo": {
        "corto": "Recreativo y deportivo", "nombre": "Recreativo y Deportivo",
        "lead": "Lugares para encontrarse, moverse y disfrutar. Diseñamos parques, plazas, escenarios deportivos y centros recreativos seguros, accesibles y fáciles de mantener.",
        "docs": ["Documentos y levantamiento del terreno.", "Número estimado de usuarios y actividades que se realizarán.", "Normas de la federación o entidad deportiva, si aplica."],
    },
    "industrial": {
        "corto": "Industrial y logística", "nombre": "Industrial y Logística",
        "lead": "Edificaciones que hacen funcionar la producción y la distribución. Diseñamos bodegas, naves y parques industriales con flujos eficientes, estructura adecuada y cumplimiento ambiental.",
        "docs": ["Documentos del lote y uso del suelo.", "Proceso productivo o logístico: maquinaria, cargas y circulación de vehículos.", "Requisitos ambientales o de seguridad industrial conocidos."],
    },
    "intervenciones": {
        "corto": "Intervenciones sobre lo existente", "nombre": "Intervenciones sobre lo Existente",
        "lead": "Para remodelar, ampliar, restaurar o cambiar el uso de una edificación que ya existe. Revisamos lo que hay, lo que la norma permite cambiar y diseñamos la mejor solución.",
        "docs": ["Certificado de tradición y libertad.", "Planos o licencia anterior, si existen.", "Fotos actuales de los espacios por intervenir."],
    },
    "urbanismo": {
        "corto": "Urbanismo y territorio", "nombre": "Urbanismo y Territorio",
        "lead": "Planeación de barrios, loteos y espacio público. Estudiamos el territorio y la norma para proponer desarrollos ordenados, viables y con buena calidad de vida.",
        "docs": ["Documentos del predio o del área de estudio.", "Plan de Ordenamiento Territorial (POT) del municipio y normas vigentes.", "Levantamiento topográfico y estudios existentes."],
    },
}

SUBTIPOS = {
    "residencial": ["Casa unifamiliar (aislada, adosada o en hilera)", "Edificio de apartamentos o viviendas multifamiliares", "Conjunto residencial cerrado o urbanización de viviendas", "Vivienda de interés social (VIS / VIP)", "Residencia de estudiantes o para la tercera edad", "Casa de campo o fincas de recreo"],
    "comercial": ["Centro comercial, pasaje comercial o mall", "Edificio de oficinas o sedes corporativas", "Local comercial individual (tiendas, boutiques)", "Restaurante, bar, cafetería o food court", "Supermercado, hipermercado o mercado público de abastos", "Hotel, resort, hostal o glamping", "Estación de servicio / Gasolinera"],
    "dotacional": ["Hospital, clínica, centro de salud o puestos de atención médica", "Colegio, escuela, jardín infantil o universidad", "Biblioteca, museo, galería de arte o centro cultural", "Teatro, auditorio o centro de convenciones", "Sede gubernamental (alcaldías, ministerios, palacios de justicia)", "Estación de bomberos, policía o centros penitenciarios", "Terminal de transporte (terrestre, marítimo o aeropuertos)", "Centro religioso (iglesia, templo, mezquita)"],
    "recreativo": ["Parque urbano, parque lineal, plazas o plazoletas", "Complejo deportivo (estadio, coliseo, pistas de atletismo)", "Gimnasio, centro de alto rendimiento o club social", "Piscina pública, centro acuático o spa", "Parque temático o parque de atracciones"],
    "industrial": ["Bodega, almacén o centro de distribución (CEDI)", "Nave industrial o fábrica de producción", "Parque industrial o zona franca", "Planta de tratamiento (de agua, energía o residuos)"],
    "intervenciones": ["Remodelación o reforma de interiores (casas, locales, oficinas)", "Ampliación o extensión de una edificación actual", "Restauración patrimonial o conservación de monumentos históricos", "Adecuación de local (cambio de uso, ej: de oficina a cafetería)"],
    "urbanismo": ["Zona urbanística (planificación de un nuevo barrio o sector)", "Loteo y parcelación (división de un terreno grande en lotes más pequeños)", "Plan de Ordenamiento Territorial (POT) o planes parciales", "Diseño de espacio público (andenes, ciclorrutas, alamedas)"],
}

AYUDA = [
    ("Análisis y Consultoría", "Estudio del predio, de la norma y de tus necesidades; anteproyecto, diseño arquitectónico e interiores, trámite de licencia e interventoría."),
    ("Construcción", "Presupuesto de obra por actividades con precios unitarios actualizados y ejecución con control de calidad hasta la entrega."),
    ("Financiera y Costos", "Presupuesto paramétrico y detallado, factibilidad, cronograma de inversión y control de costos durante la obra."),
]

for numero, (clave, s) in enumerate(SERVICIOS.items(), 1):
    aviso = f'\n            <p class="aviso aviso--advertencia mt-4"><strong>Importante:</strong> {escape(s["aviso"])}</p>' if s.get("aviso") else ""
    ayuda = "\n".join(f"              <li><strong>{escape(t)}:</strong> {escape(d)}</li>" for t, d in AYUDA)
    cuerpo = f"""    <section class="seccion-intro" aria-labelledby="titulo-pagina">
      <div class="container">
        <p class="antetitulo">Tipo de proyecto {numero:02d}</p>
        <h1 id="titulo-pagina" class="titulo-pagina">{escape(s['nombre'])}</h1>
        <p class="texto-guia">{escape(s['lead'])}</p>{aviso}
        <div class="acciones mt-4">
          <a class="btn btn-acento btn-lg" href="../index.html?tipo={clave}#simulador">Cotizar este tipo de proyecto</a>
          <a class="btn btn-contorno btn-lg" href="../index.html#contacto">Hablar con un arquitecto</a>
        </div>
      </div>
    </section>

    <section class="seccion" aria-labelledby="incluye-titulo">
      <div class="container">
        <div class="row g-4 g-lg-5">
          <div class="col-lg-6">
            <h2 id="incluye-titulo" class="titulo-seccion">Proyectos que diseñamos</h2>
            <ul class="lista-marcada">
{lista(SUBTIPOS[clave])}
            </ul>
          </div>
          <div class="col-lg-6">
            <h2 class="titulo-seccion">Cómo te ayudamos</h2>
            <ul class="lista-marcada">
{ayuda}
            </ul>
            <h3 class="subtitulo-seccion">Qué documentos te pediremos</h3>
            <ul class="lista-marcada">
{lista(s['docs'])}
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section class="seccion seccion-crema" aria-labelledby="cta-titulo">
      <div class="container">
        <h2 id="cta-titulo" class="titulo-seccion">¿Quieres saber cuánto costaría?</h2>
        <p class="texto-guia">Usa el cotizador para armar tu cotización con precios de nuestra base, o escríbenos y te preparamos una propuesta formal.</p>
        <div class="acciones">
          <a class="btn btn-noche btn-lg" href="../index.html?tipo={clave}#simulador">Abrir el cotizador</a>
          <a class="btn btn-contorno btn-lg" href="../index.html#servicios">Ver otros tipos de proyecto</a>
        </div>
      </div>
    </section>"""
    html = layout(
        titulo=s["nombre"], descripcion=s["lead"], prefijo="../",
        migas=[("Inicio", "../index.html"), ("Servicios", "../index.html#servicios"), (s["corto"], None)],
        cuerpo=cuerpo,
    )
    (RAIZ / "servicios" / f"{clave}.html").write_text(html, encoding="utf-8")

# Política de tratamiento de datos (Ley 1581 de 2012)
politica = """    <section class="seccion-intro" aria-labelledby="titulo-pagina">
      <div class="container">
        <p class="antetitulo">Ley 1581 de 2012</p>
        <h1 id="titulo-pagina" class="titulo-seccion">Política de tratamiento de datos personales</h1>
        <p class="texto-guia">Así cuidamos la información que nos entregas a través de este sitio web.</p>
      </div>
    </section>
    <section class="seccion">
      <div class="container contenido-legal">
        <p class="aviso mb-4">Versión 2026-11 · Vigente desde el 6 de noviembre de 2026.</p>
        <h2>Responsable del tratamiento</h2>
        <p>Zenite Arquitectura SAS, NIT 901.850.784-0, Calle 24 # 12-51, Tunja (Boyacá). Correo: zeniteark@gmail.com · WhatsApp: 315 711 0946.</p>
        <h2>Datos que recogemos</h2>
        <p>Nombre, correo electrónico, teléfono, ciudad (opcional), tipo de proyecto y el mensaje que escribes en el formulario de contacto o en el cotizador, junto con los servicios y cantidades que elegiste. También guardamos la fecha en que aceptaste esta política y un código cifrado de tu conexión (no tu dirección IP) para prevenir abusos.</p>
        <h2>Para qué los usamos</h2>
        <ul class="lista-marcada">
          <li>Responder tu solicitud y prepararte una cotización o propuesta formal.</li>
          <li>Contactarte por correo, teléfono o WhatsApp sobre el proyecto que nos consultaste.</li>
          <li>Llevar un registro interno de las solicitudes y cotizaciones recibidas.</li>
        </ul>
        <p>No vendemos ni compartimos tus datos con terceros para fines comerciales.</p>
        <h2>Dónde se guardan y quién los ve</h2>
        <p>La información se guarda en una base de datos protegida. Solo el personal administrador de Zenite puede consultarla, desde un panel con contraseña cifrada y código de verificación enviado al correo. Los siguientes proveedores actúan como encargados del tratamiento, con medidas de seguridad y bajo nuestras instrucciones: Supabase (base de datos y archivos), Render (servidor de la aplicación), Netlify (alojamiento del sitio) y Google (correo electrónico). Algunos de estos servicios almacenan datos fuera de Colombia, en países con niveles adecuados de protección.</p>
        <h2>Cuánto tiempo los conservamos</h2>
        <p>Conservamos los datos mientras atendemos tu solicitud y hasta por 24 meses después. Pasado ese tiempo se anonimizan automáticamente. Puedes pedir que los eliminemos antes.</p>
        <h2>Tus derechos</h2>
        <p>Como titular de los datos puedes conocer, actualizar y rectificar tu información; solicitar prueba de la autorización que nos diste; ser informado sobre el uso de tus datos; revocar la autorización o pedir que los eliminemos; y presentar quejas ante la Superintendencia de Industria y Comercio.</p>
        <h2>Cómo ejercerlos</h2>
        <p>Escríbenos a zeniteark@gmail.com indicando tu nombre y tu solicitud. Respondemos consultas en un máximo de diez días hábiles y reclamos en un máximo de quince días hábiles, según los plazos de la Ley 1581 de 2012 y el Decreto 1377 de 2013.</p>
        <h2>Vigencia</h2>
        <p>Esta política rige desde su publicación. Si la cambiamos, publicaremos la nueva versión en esta página y te pediremos autorización de nuevo cuando sea necesario.</p>
      </div>
    </section>"""
(RAIZ / "politica-de-datos.html").write_text(layout(
    titulo="Política de tratamiento de datos", descripcion="Política de tratamiento de datos personales de Zenite Arquitectura SAS según la Ley 1581 de 2012.",
    prefijo="", migas=[("Inicio", "index.html"), ("Política de tratamiento de datos", None)], cuerpo=politica), encoding="utf-8")

# Página de confirmación (respaldo cuando el navegador no ejecuta JavaScript)
gracias = """    <section class="seccion-intro" aria-labelledby="titulo-pagina">
      <div class="container">
        <h1 id="titulo-pagina" class="titulo-seccion">¡Gracias por escribirnos!</h1>
        <p class="texto-guia">Recibimos tu solicitud. Te responderemos en un plazo máximo de un día hábil.</p>
        <a class="btn btn-noche btn-lg" href="index.html">Volver al inicio</a>
      </div>
    </section>"""
(RAIZ / "gracias.html").write_text(layout(
    titulo="Solicitud recibida", descripcion="Confirmación de envío del formulario de contacto.",
    prefijo="", migas=[("Inicio", "index.html"), ("Solicitud recibida", None)], cuerpo=gracias), encoding="utf-8")

no_encontrada = """    <section class="seccion-intro" aria-labelledby="titulo-pagina">
      <div class="container">
        <p class="antetitulo">Error 404</p>
        <h1 id="titulo-pagina" class="titulo-seccion">No encontramos esta página</h1>
        <p class="texto-guia">Es posible que la dirección haya cambiado. Desde el inicio puedes ver nuestros servicios, el portafolio y el simulador.</p>
        <a class="btn btn-noche btn-lg" href="/index.html">Ir al inicio</a>
      </div>
    </section>"""
(RAIZ / "404.html").write_text(layout(
    titulo="Página no encontrada", descripcion="La página solicitada no existe.",
    prefijo="/", migas=[("Inicio", "/index.html"), ("Página no encontrada", None)], cuerpo=no_encontrada), encoding="utf-8")

print("ok")

insertar_en_index()
print("index ok")
