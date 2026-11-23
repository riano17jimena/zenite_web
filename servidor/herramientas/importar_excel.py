"""Convierte el Excel «COTIZADOR BASE DE PRECIOS A TODO COSTO» en archivos JSON
listos para cargar en la base de datos (npm run db:sembrar).

Uso:
    python3 herramientas/importar_excel.py RUTA_DEL_EXCEL.xlsx

Genera en prisma/datos-privados/:
    capitulos.json, actividades.json, insumos.json, apu.json, auxiliares.json, aiu.json

IMPORTANTE: la base de precios tiene derechos de autor de su proveedor y es de
uso exclusivo del comprador. Estos archivos NO deben publicarse ni subirse a un
repositorio público (la carpeta está en .gitignore).
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl

SALIDA = Path(__file__).resolve().parents[1] / "prisma" / "datos-privados"

GRUPOS = {
    "MATERIALES:": "MATERIALES",
    "EQUIPO Y HERRAMIENTAS:": "EQUIPO",
    "MANO DE OBRA:": "MANO_OBRA",
    "TRANSPORTES:": "TRANSPORTE",
    "SUBCONTRATOS:": "SUBCONTRATO",
    "OTROS:": "OTROS",
    "SEGURIDAD SOCIAL:": "SEGURIDAD_SOCIAL",
    "PRESTACIONES SOCIALES:": "PRESTACIONES",
    "APORTES PARAFISCALES:": "PARAFISCALES",
}
TIPO_POR_GRUPO = {
    "MATERIALES": "MATERIAL", "EQUIPO": "EQUIPO", "MANO_OBRA": "MANO_OBRA",
    "TRANSPORTE": "TRANSPORTE", "SUBCONTRATO": "SUBCONTRATO", "PERSONAL": "MANO_OBRA",
}
RE_CABECERA = re.compile(r"^(\d+\.\d+(?:\.\d+)?)\s+(.+)$", re.S)


def limpio(valor):
    if valor is None:
        return ""
    return re.sub(r"\s+", " ", str(valor)).strip()


def clave(descripcion, unidad):
    """Clave de búsqueda insensible a mayúsculas, tildes y espacios."""
    texto = unicodedata.normalize("NFKD", f"{descripcion}|{unidad}".upper())
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto).strip()


def numero(valor):
    return float(valor) if isinstance(valor, (int, float)) else None


def filas(hoja):
    for fila in hoja.iter_rows(values_only=True):
        fila = list(fila)
        while fila and fila[-1] in (None, ""):
            fila.pop()
        if fila:
            yield fila


def leer_actividades(hoja):
    capitulos, actividades = [], []
    subtitulos = {}
    for fila in filas(hoja):
        codigo = limpio(fila[0]) if fila else ""
        if re.fullmatch(r"\d+", codigo) and len(fila) > 1:
            capitulos.append({"codigo": codigo, "nombre": limpio(fila[1]).capitalize(), "orden": int(codigo)})
        elif re.fullmatch(r"\d+\.\d+(\.\d+)?", codigo) and len(fila) > 2 and limpio(fila[2]) == "-":
            # Subtítulo dentro de un capítulo (p. ej. 22.63 ALCANTARILLADO): agrupa códigos 22.63.xx
            subtitulos[codigo] = limpio(fila[1]).capitalize()
        elif re.fullmatch(r"\d+\.\d+(\.\d+)?", codigo) and len(fila) > 4 and limpio(fila[2]):
            # Se omiten los «ítems nuevos» vacíos (sin unidad ni precio).
            partes = codigo.split(".")
            actividades.append({
                "codigo": codigo,
                "capitulo": partes[0],
                "subcapitulo": subtitulos.get(".".join(partes[:2])) if len(partes) == 3 else None,
                "descripcion": limpio(fila[1]),
                "unidad": limpio(fila[2]),
                "precio": numero(fila[4]) or 0,
            })
    return capitulos, actividades


def leer_insumos(hoja):
    insumos, vistos = [], set()
    for fila in filas(hoja):
        if len(fila) < 4 or not fila[1] or numero(fila[3]) is None:
            continue
        descripcion, unidad = limpio(fila[1]), limpio(fila[2])
        k = clave(descripcion, unidad)
        if k in vistos:
            continue
        vistos.add(k)
        insumos.append({"clave": k, "descripcion": descripcion, "unidad": unidad, "precio": numero(fila[3])})
    return insumos


def leer_analisis(hoja, patron_cabecera):
    """Lee bloques de análisis (APU o auxiliares). Devuelve lista de bloques."""
    bloques, actual, grupo = [], None, None
    for fila in filas(hoja):
        primero = limpio(fila[0])
        ultimo = fila[4] if len(fila) > 4 else None
        if isinstance(ultimo, str) and ultimo.startswith("UNIDAD:"):
            m = patron_cabecera(primero)
            if m is None:
                continue
            actual = {**m, "unidad": limpio(ultimo.split(":", 1)[1]), "componentes": [], "total_excel": None}
            bloques.append(actual)
            grupo = None
            continue
        if actual is None:
            continue
        if primero.upper() in GRUPOS and len([v for v in fila if v not in (None, "")]) == 1:
            grupo = GRUPOS[primero.upper()]
            continue
        etiqueta = limpio(fila[3]) if len(fila) > 3 else ""
        if etiqueta.startswith("VR COSTO DIRECTO") or etiqueta.startswith("VR UNITARIO"):
            actual["total_excel"] = numero(fila[4])
            continue
        if primero in ("", "DESCRIPCIÓN") or etiqueta.startswith("Subtotal"):
            continue
        cantidad, precio = numero(fila[2]) if len(fila) > 2 else None, numero(fila[3]) if len(fila) > 3 else None
        if cantidad is None or precio is None:
            continue
        unidad = limpio(fila[1])
        actual["componentes"].append({
            # Las filas antes del primer grupo son el personal (capítulo 27: salarios).
            "grupo": grupo or "PERSONAL",
            "descripcion": primero,
            "unidad": unidad,
            "cantidad": cantidad,
            "precio": precio,
            "porcentaje": unidad.startswith("%"),
        })
    return bloques


def cabecera_apu(texto):
    m = RE_CABECERA.match(texto)
    return {"codigo": m.group(1), "descripcion": limpio(m.group(2))} if m else None


def cabecera_aux(texto):
    return {"descripcion": texto} if texto else None


def main(ruta):
    libro = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    capitulos, actividades = leer_actividades(libro["ACTIVIDADES"])
    insumos = leer_insumos(libro["MATERIALES"])
    apu = leer_analisis(libro["APU"], cabecera_apu)
    auxiliares = leer_analisis(libro["APU AUXILIARES"], cabecera_aux)

    # Porcentajes de administración, imprevistos y utilidad de la hoja COTIZADOR
    aiu = {}
    for fila in filas(libro["COTIZADOR"]):
        nombre = limpio(fila[0])
        if nombre in ("Administración", "Imprevistos", "Utilidad", "IVA sobre Utilidad") and len(fila) > 4:
            aiu[nombre] = numero(fila[4])

    # Insumos: los auxiliares también son insumos (su precio sale de su propio análisis)
    por_clave = {i["clave"]: i for i in insumos}
    for aux in auxiliares:
        k = clave(aux["descripcion"], aux["unidad"])
        aux["clave"] = k
        if k in por_clave:
            por_clave[k]["auxiliar"] = True
        else:
            nuevo = {"clave": k, "descripcion": aux["descripcion"], "unidad": aux["unidad"], "precio": aux["total_excel"] or 0, "auxiliar": True}
            insumos.append(nuevo)
            por_clave[k] = nuevo

    # Tipo de cada insumo según el grupo del APU donde más aparece
    uso = defaultdict(Counter)
    sin_insumo = Counter()
    for bloque in apu + auxiliares:
        for c in bloque["componentes"]:
            if c["porcentaje"]:
                continue
            k = clave(c["descripcion"], c["unidad"])
            if k not in por_clave:
                # Componentes sin insumo en la hoja MATERIALES (p. ej. salarios del capítulo 27)
                sin_insumo[k] += 1
                nuevo = {"clave": k, "descripcion": c["descripcion"], "unidad": c["unidad"], "precio": c["precio"]}
                insumos.append(nuevo)
                por_clave[k] = nuevo
            c["insumo"] = k
            uso[k][c["grupo"]] += 1
    for i in insumos:
        if i.get("auxiliar"):
            i["tipo"] = "AUXILIAR"
        elif uso[i["clave"]]:
            i["tipo"] = TIPO_POR_GRUPO.get(uso[i["clave"]].most_common(1)[0][0], "OTRO")
        else:
            i["tipo"] = "MATERIAL"
        i.pop("auxiliar", None)

    SALIDA.mkdir(parents=True, exist_ok=True)
    escribir = lambda nombre, datos: (SALIDA / nombre).write_text(json.dumps(datos, ensure_ascii=False, indent=0), encoding="utf-8")
    escribir("capitulos.json", capitulos)
    escribir("actividades.json", actividades)
    escribir("insumos.json", insumos)
    escribir("apu.json", [{k: b[k] for k in ("codigo", "unidad", "componentes", "total_excel")} for b in apu])
    escribir("auxiliares.json", [{k: b[k] for k in ("clave", "descripcion", "unidad", "componentes", "total_excel")} for b in auxiliares])
    escribir("aiu.json", aiu)

    con_apu = {b["codigo"] for b in apu}
    print(f"Capítulos: {len(capitulos)} | Actividades: {len(actividades)} (con APU: {len(con_apu & {a['codigo'] for a in actividades})})")
    print(f"Insumos: {len(insumos)} (auxiliares: {len(auxiliares)}, agregados desde el APU: {len(sin_insumo)})")
    print(f"AIU: {aiu}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
