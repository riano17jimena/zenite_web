"""Uso: python3 herramientas/generar-respaldo-contenido.py

Crea data/contenido.json, la copia de respaldo que usa el sitio si la API no
responde. Se genera a partir de servidor/prisma/datos/contenido-inicial.json
(el mismo contenido que se migra a la base de datos). Para actualizarla con lo
publicado en el panel, descargue /api/publico/contenido y guárdelo aquí."""
import json
from pathlib import Path
from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
datos = json.loads((RAIZ / "servidor/prisma/datos/contenido-inicial.json").read_text(encoding="utf-8"))


def ruta(r):
    return r.removeprefix("../") if r else None


def imagen(r, alt):
    if not r:
        return None
    ancho, alto = Image.open(RAIZ / ruta(r)).size
    return {"url": ruta(r), "url960": None, "ancho": ancho, "alto": alto, "alt": alt}


h = datos["hero"]
salida = {
    "version": 0,
    "respaldo": True,
    "hero": {k: h[k] for k in ("antetitulo", "titulo", "texto", "pieImagen")} | {"imagen": imagen(h["imagen"], h["imagenAlt"])},
    "proyectos": [
        {"id": i + 1, **{k: p.get(k) for k in ("titulo", "categoria", "ubicacion", "anio", "area", "descripcion", "destacado")},
         "imagenes": [{"url": ruta(im["archivo"]), "url960": None, "alt": im["alt"]} for im in p["imagenes"]]}
        for i, p in enumerate(datos["proyectos"])
    ],
    "videos": [
        {"id": i + 1, **{k: v.get(k) for k in ("titulo", "etiqueta", "descripcion", "transcripcion", "duracionSeg")},
         "url": ruta(v["archivo"]), "poster": ruta(v["poster"]), **dict(zip(("ancho", "alto"), Image.open(RAIZ / ruta(v["poster"])).size))}
        for i, v in enumerate(datos["videos"])
    ],
    "testimonios": [{"id": i + 1, **{k: t.get(k) for k in ("nombre", "proyecto", "ciudad", "comentario")}, "foto": None}
                    for i, t in enumerate(datos["testimonios"]) if t.get("autorizado")],
    "preguntas": [{"id": i + 1, "pregunta": q["pregunta"], "respuesta": q["respuesta"]} for i, q in enumerate(datos["preguntas"])],
    "contactos": [{k: c.get(k) for k in ("tipo", "etiqueta", "valor", "enlace")} for c in datos["contactos"]],
    "perfiles": [{**{k: p.get(k) for k in ("nombre", "cargo", "lema", "mision", "formacion", "trayectoria", "experiencia")},
                  "foto": imagen(p.get("foto"), p.get("fotoAlt"))} for p in datos["perfiles"]],
}
(RAIZ / "data/contenido.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
print("data/contenido.json:", len(salida["proyectos"]), "proyectos,", len(salida["videos"]), "videos")
