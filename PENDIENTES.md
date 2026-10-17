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

- [ ] El lector de anuncios con texto corrido (sin etiquetas): sacar
      producto, países y Incoterm de frases como "busco 200 toneladas de
      cacao de República Dominicana para Holanda FOB". Con casos en
      `pruebas/navegador.mjs`.
- [ ] Seguimiento por anuncio: cuántas respuestas trajo cada post que
      generó la app (campo en el deal y un contador en la vista).
- [ ] Mantener `ci.yml` en verde.
