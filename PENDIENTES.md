# Pendientes

La rutina «Capataz» (tarea programada de Claude, lunes y jueves 9:44 am) lee este
archivo, toma el primer pendiente de **Para Claude** que no esté hecho,
lo termina con pruebas en la rama `claude/automatizar-tareas-czbut9` y lo
marca `[x]`. Lo de **Para Jonathan** solo lo puede hacer él.

## Corre solo

- **Boletín del Corredor** (tarea programada, lunes a viernes 6:41 am de Puerto
  Rico): busca novedades de precio del cacao, de las empresas del libro,
  oportunidades publicadas y cambios de reglas; si hay algo, lo agrega a
  `boletin.html` y avisa al teléfono. Si no hay nada, no escribe ni molesta.
- **Pruebas** (`.github/workflows/ci.yml`, cada push): la app y los planes
  abren en Chromium sin errores, el lector de anuncios y el filtro de
  riesgo dan lo que tienen que dar.

## Para Jonathan

- [x] Fusionar `claude/automatizar-tareas-czbut9` a `main` (17 oct 2026).
- [ ] Pasarle a Claude los cuatro datos del perfil: nombre legal completo,
      nombre de la empresa (o decidir que todavía no hay), teléfono y si ya
      tiene RNC/EIN. Sin eso el NCND y la firma de los mensajes salen con
      corchetes.
- [ ] Las tres llamadas de la acción 4 (Departamento de Cacao, JAD con la
      extensión 263 que es la de compradores, y MIDA). Las listas para pegar y
      los mensajes ya están hechos.
- [ ] Las cinco acciones de la primera semana de
      `plan/corredor-sd-sju.html` (las llamadas y visitas son suyas).
- [ ] Permitirle a la Mesa usar Gmail la primera vez que toques «Revisar el
      correo». Si Claude no tiene Gmail conectado, se agrega en
      Configuración → Conectores.
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
- [x] Secuencia de seguimiento de día 0, 3, 7, 14 y 30, con mensaje propio
      por paso, y repaso del correo por el conector de Gmail (22 nov 2026).
- [x] Presentar a las dos partes con candado de NCND, lector de personas y
      origen de cada contacto (21 nov 2026).
- [x] Boletín diario con filtro, como tarea programada (21 nov 2026).
- [x] Mesa de Bolsillo (21 nov 2026, `bolsillo.html`): la pantalla de
      teléfono para disparar mensajes, con el día ordenado por lo vencido.
- [x] Libro de arranque del corredor con los once contactos y sus notas
      (21 nov 2026, `datos/mesa-arranque.json`).
- [x] Mensajes de contacto por WhatsApp y correo desde cada ficha (21 nov
      2026), con el canal sugerido por lado y el recordatorio a los 7 días.
- [x] Panel de números (22 nov 2026): embudo de contactos con la caída entre
      etapas, qué paso de la secuencia destraba las respuestas, qué canal de
      captación rinde, y el tiempo de primer contacto a respuesta. Las fechas
      se anotan solas al mandar y al marcar que respondió.
- [x] Libro de comisiones (22 nov 2026): cada oportunidad lleva estado de
      cobro, fecha de factura y cuánto entró de verdad; el panel suma en
      juego, facturado, cobrado y perdido, y avisa de facturas pasadas de 30
      días.
- [x] Papelería (22 nov 2026): los cinco documentos y el expediente completo
      salen como HTML con membrete de JRN Sourcing, listos para imprimir o
      guardar en PDF desde el navegador.
- [x] La secuencia de cinco pasos también en el teléfono (22 nov 2026): antes
      el bolsillo mandaba de nuevo el mensaje de apertura a quien ya lo había
      recibido, y recordaba a 7 días en vez de seguir los días de la Mesa.
- [ ] Revisar cada tanto que las cifras de los planes sigan vigentes. La fecha
      de MIDA ya cambió una vez (de junio a agosto de 2027).
- [ ] Antes de publicar `bolsillo.html` o `index.html` desde el repo: leer el
      `#estado` de la versión viva y pegarlo en el archivo que se publica. El
      repo guarda la plantilla vacía, así que publicar tal cual le borraría a
      Jonathan lo que trabajó desde el teléfono. (El 22 nov 2026 el servidor lo
      frenó con un conflicto; no siempre va a avisar.)
