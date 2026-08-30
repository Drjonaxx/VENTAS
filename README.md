# Mesa de Intermediación

App de una sola página para trabajar oportunidades de *finder's fee*: esos
anuncios de "te pago X si me conectas con un exportador de Y". La mayoría no
llega a nada, así que la app existe para que descubras cuáles antes de meterles
semanas de trabajo, y para que en las que sí valen no te saquen del trato.

![Pantalla de riesgo](docs/pantalla-riesgo.png)

## Qué hace

**1. Lee el anuncio.** Copiás el post y lo pegás; la app saca producto,
cantidad, países, ciudades, comisión y requisitos, en inglés o en español, con
emojis y todo. El post de cacao dominicano de Instagram sale con nueve campos
llenos de un solo pegado. Lo que no reconoce lo cargás a mano, y el texto
original queda guardado en el deal.

**2. Filtra la oportunidad.** Sale una nota de 0 a 100 con las banderas rojas
concretas. El rubro revisa:

- La comisión contra el valor real de la carga. Más del 5% no existe en
  commodities: significa que el volumen o el precio del anuncio es inventado.
- El volumen contra lo que ese país exporta al año. 5.000 t de cacao dominicano
  son ~7% de la exportación nacional: ningún exportador individual lo cubre solo.
- Jerga de cadena de fraude en los términos de pago (SBLC, BG, MT103, POF,
  instrumentos "en leasing"). Eso es salida inmediata.
- Cualquier pago por adelantado. Un intermediario cobra al cierre, nunca paga
  por entrar.
- Si vas a presentar sin acuerdo firmado, que es exactamente como te brincan.

**3. Te dice dónde buscar y dónde verificar.** Dos cosas distintas: gremios y
agencias de promoción para *encontrar* al exportador, y registros oficiales
—registro fiscal, mercantil, aduanas— para confirmar que existe de verdad.
Más consultas de buscador armadas con los datos del deal.

**4. Genera los documentos.** Acuerdo NCND con cláusula de no elusión y
comisión, checklist de qué papeles exigirle al proveedor, y los mensajes de
primer contacto: uno en español para el exportador, uno en inglés para quien
publicó el anuncio. Los cinco salen juntos en un solo archivo con **Copiar
todo** o **Descargar .md**.

**5. Lleva la bitácora.** Etapa del embudo, siguiente paso concreto y las notas
de cada llamada. Esa bitácora es la prueba de que vos originaste el contacto.

## Cómo se usa

Es un archivo HTML sin dependencias ni servidor. Dos formas:

- **Publicada como Artifact en Claude** (así se usa hoy): guarda los deals
  publicando una versión nueva de sí misma, así que los ves desde cualquier
  dispositivo con el mismo enlace. El botón **Guardar** es el que sube los
  cambios; mientras tanto quedan en el navegador.
- **Local**: abrí `index.html` en el navegador. Todo funciona igual salvo el
  guardado en la nube: los deals quedan en el `localStorage` de esa máquina.

## El aviso que importa

El acuerdo NCND es una plantilla de trabajo, no asesoría legal. Antes de firmar
el primero, que lo lea un abogado de tu jurisdicción; las cláusulas a ajustar
son la de comisión y la de ley aplicable. Después ya lo reusás.

Los precios de referencia y las capacidades de exportación por país son órdenes
de magnitud para detectar disparates, no cifras oficiales. Si el número te
importa, cargá el precio real en el deal.

## Estructura

Todo vive en `index.html`, separado en bloques con `id`:

| Bloque   | Qué tiene                                                        |
|----------|------------------------------------------------------------------|
| `css`    | Tokens de color para tema claro y oscuro, y los componentes.     |
| `app`    | El rubro de banderas rojas y el directorio de fuentes.           |
| `docs`   | Las plantillas: NCND, checklist y mensajes.                      |
| `ui`     | Estado, guardado y utilidades.                                   |
| `vista`  | Render de las pantallas.                                         |
| `eventos`| Modales y manejo de eventos.                                     |

La app se republica a sí misma reconstruyendo el documento desde esos bloques
más el estado en `#estado`, así que **si agregás un `<script>` nuevo tiene que
llevar el atributo `data-src`** o se pierde en el primer guardado.

## Qué le falta

- La verificación de proveedores es un checklist manual: la app te dice dónde
  mirar, pero no consulta ningún registro por vos.
- El directorio cubre América Latina y España. Para África y Asia caen sólo las
  fuentes globales, que igual sirven: Trade Map te dice quién exporta qué.
- El lector de anuncios acierta con posts que traen etiquetas. Un texto corrido
  sin estructura saca poco más que la comisión y la cantidad.
