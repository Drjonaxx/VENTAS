# Pendientes

La rutina «Capataz» (tarea programada de Claude, lunes y jueves 9:44 am) lee este
archivo, toma el primer pendiente de **Para Claude** que no esté hecho,
lo termina con pruebas en la rama `claude/automatizar-tareas-czbut9` y lo
marca `[x]`. Lo de **Para Jonathan** solo lo puede hacer él.

## Corre solo

- **Pruebas** (`.github/workflows/ci.yml`, cada push): la app y los planes
  abren en Chromium sin errores, el lector de anuncios y el filtro de
  riesgo dan lo que tienen que dar.

## Para Jonathan

- [x] Fusionar `claude/automatizar-tareas-czbut9` a `main` (17 oct 2026).
- [ ] Las cinco acciones de la primera semana de
      `plan/corredor-sd-sju.html` (las llamadas y visitas son suyas).
- [ ] Que un abogado lea el NCND antes de firmar el primero.

## Para Claude

- [x] El lector de anuncios con texto corrido (sin etiquetas): sacar
      producto, países y Incoterm de frases como "busco 200 toneladas de
      cacao de República Dominicana para Holanda FOB". Con casos en
      `pruebas/navegador.mjs`. (19 oct 2026: también en inglés y con
      gentilicios como "café colombiano".)
- [x] Seguimiento por anuncio: cuántas respuestas trajo cada post que
      generó la app (campo en el deal y un contador en la vista). (22 oct
      2026: «Lo publiqué» en cada formato, +1 por respuesta y el total en
      la lista; también en la ficha de un comprador.)
- [x] Mantener `ci.yml` en verde.
- [x] Auditoría de seguridad y fallas (21 nov 2026): 15 vistas probadas contra
      inyección de HTML, sin agujeros. Cuatro fallas encontradas y arregladas:
      el emparejamiento cruzaba camarón con ron y espinaca con piña; en el
      teléfono el teclado borraba lo que estabas escribiendo; borrar una ficha
      dejaba acuerdos apuntando al vacío; y publicar bien dejaba el botón
      trabado en «Guardando…». Las tres primeras quedaron con prueba en CI.
- [x] Que la app aguante el volumen del plan (21 nov 2026): alta en lote,
      búsqueda, fecha de recontacto con aviso, y respaldo exportable.
- [ ] Revisar cada tanto que las cifras de los planes sigan vigentes. La fecha
      de MIDA ya cambió una vez (de junio a agosto de 2027).
