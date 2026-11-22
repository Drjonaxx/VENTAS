// Abre la app y los tres planes en Chromium y prueba lo que importa: que
// no haya errores de JavaScript, que el lector de anuncios saque los campos
// de un post real y que el filtro frene un trato con jerga de fraude.
// Uso: node pruebas/navegador.mjs   (necesita playwright instalado)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const tipos = { ".html": "text/html; charset=utf-8", ".png": "image/png" };

const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    const cuerpo = await readFile(join(raiz, ruta));
    res.writeHead(200, { "content-type": tipos[extname(ruta)] ?? "application/octet-stream" });
    res.end(cuerpo);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${servidor.address().port}`;

const navegador = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
let fallos = 0;

async function caso(nombre, ruta, revisar) {
  const pagina = await navegador.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(e.message));
  try {
    await pagina.goto(base + ruta, { waitUntil: "load" });
    if (revisar) await revisar(pagina);
    if (errores.length) throw new Error(`errores de JavaScript: ${errores.join(" | ")}`);
    console.log(`✓ ${nombre}`);
  } catch (error) {
    fallos++;
    console.error(`✗ ${nombre}\n  ${error.message}`);
  } finally {
    await pagina.close();
  }
}

// Lo mismo que contarLeidos() de la app, del lado de la prueba.
function contarLeidosEn(campos) {
  return Object.values(campos).filter((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== null)).length;
}

function igual(actual, esperado, que) {
  if (actual !== esperado) throw new Error(`${que}: se esperaba ${JSON.stringify(esperado)}, salió ${JSON.stringify(actual)}`);
}

const ANUNCIO = `🔥 EARN $25,000 FINDER'S FEE 🔥
📦 Product: Cocoa beans
⚖️ Quantity: 5,000 MT
🌎 Supplier: Dominican Republic
🏙️ City: San Francisco de Macorís
🛳️ Buyer: Netherlands
🏙️ City: Amsterdam
📄 Requirements: Organic, Fairtrade, SGS inspection
💳 Payment: LC at sight
🚢 Incoterm: FOB`;

await caso("la app abre", "/index.html");

await caso("el lector saca los campos del anuncio de cacao", "/index.html", async (p) => {
  const d = await p.evaluate((t) => parsearAnuncio(t), ANUNCIO);
  igual(d.producto, "Cocoa beans", "producto");
  igual(d.cantidad, 5000, "cantidad");
  igual(d.unidad, "t", "unidad");
  igual(d.paisOrigen, "Dominican Republic", "origen");
  igual(d.paisDestino, "Netherlands", "destino");
  igual(d.ciudadOrigen, "San Francisco de Macorís", "ciudad de origen");
  igual(d.ciudadDestino, "Amsterdam", "ciudad de destino");
  igual(d.fee, 25000, "comisión");
  igual(d.incoterm, "FOB", "incoterm");
  igual(d.requisitos.length, 3, "requisitos");
});

await caso("el lector entiende texto corrido en español", "/index.html", async (p) => {
  const d = await p.evaluate((t) => parsearAnuncio(t),
    "busco 200 toneladas de cacao de República Dominicana para Holanda FOB");
  igual(d.producto, "cacao", "producto");
  igual(d.cantidad, 200, "cantidad");
  igual(d.unidad, "t", "unidad");
  igual(d.paisOrigen, "República Dominicana", "origen");
  igual(d.paisDestino, "Holanda", "destino");
  igual(d.incoterm, "FOB", "incoterm");
});

await caso("el lector entiende texto corrido en inglés", "/index.html", async (p) => {
  const d = await p.evaluate((t) => parsearAnuncio(t),
    "Looking for 5,000 MT of sugar from Brazil to China, CIF. Earn $20,000 if you connect me with the mill.");
  igual(d.producto, "sugar", "producto");
  igual(d.cantidad, 5000, "cantidad");
  igual(d.paisOrigen, "Brazil", "origen");
  igual(d.paisDestino, "China", "destino");
  igual(d.incoterm, "CIF", "incoterm");
  igual(d.fee, 20000, "comisión");
});

await caso("un gentilicio dice de dónde sale la carga", "/index.html", async (p) => {
  const d = await p.evaluate((t) => parsearAnuncio(t),
    "Necesito café colombiano, 2 contenedores, con destino a España");
  igual(d.producto, "café", "producto");
  igual(d.cantidad, 2, "cantidad");
  igual(d.unidad, "contenedores", "unidad");
  igual(d.paisOrigen, "Colombia", "origen");
  igual(d.paisDestino, "España", "destino");
});

await caso("las etiquetas mandan sobre el texto corrido", "/index.html", async (p) => {
  const d = await p.evaluate((t) => parsearAnuncio(t),
    "Vendo cacao de Ecuador\nProduct: Coffee\nSupplier: Colombia\nBuyer: Spain");
  igual(d.producto, "Coffee", "producto");
  igual(d.paisOrigen, "Colombia", "origen");
  igual(d.paisDestino, "Spain", "destino");
});

await caso("un texto sin trato no inventa campos", "/index.html", async (p) => {
  const d = await p.evaluate((t) => parsearAnuncio(t), "Hola, ¿cómo estás? Te escribo mañana.");
  igual(contarLeidosEn(d), 0, "campos leídos");
});

await caso("el filtro frena la jerga de fraude", "/index.html", async (p) => {
  const r = await p.evaluate(() => evaluar({
    producto: "azucar", cantidad: 12500, unidad: "t", paisOrigen: "Brasil",
    fee: 50000, pago: "MT103 / SBLC", comprador: "", fuente: "WhatsApp",
  }));
  igual(r.nivel, "rojo", "nivel");
  if (!r.banderas.some((b) => b.sev === "stop" && /fraude/.test(b.texto)))
    throw new Error("no salió la bandera de jerga de fraude");
});

await caso("un trato sano sale en verde", "/index.html", async (p) => {
  const r = await p.evaluate(() => evaluar({
    producto: "cacao", cantidad: 100, unidad: "t", paisOrigen: "Republica Dominicana",
    fee: 6000, pago: "Carta de credito irrevocable a la vista", incoterm: "FOB",
    comprador: "Chocolates del Norte BV", fuente: "referido",
  }));
  igual(r.nivel, "verde", `nivel (banderas: ${r.banderas.map((b) => b.texto).join(" / ")})`);
});

await caso("el seguimiento cuenta las respuestas de cada post", "/index.html", async (p) => {
  await p.evaluate(() => {
    estado.deals = [{ id: "cacao-1", producto: "cacao", cantidad: 100, unidad: "t", paisOrigen: "República Dominicana", etapa: "captada", notas: [] }];
    ui.sel = "cacao-1";
    ui.tab = "publicar";
    render();
  });
  await p.click('[data-accion="publicado:instagram"]');
  await p.click('[data-accion="idioma:en"]');
  await p.click('[data-accion="publicado:linkedin"]');
  await p.click('[data-accion="resp-mas:0"]');
  await p.click('[data-accion="resp-mas:0"]');
  await p.click('[data-accion="resp-mas:1"]');
  await p.click('[data-accion="resp-menos:1"]');
  igual(await p.textContent("#total-seguimiento"), "2 posts · 2 respuestas", "total");
  igual(await p.locator(".publicacion .cuenta-resp").allTextContents().then((t) => t.join(",")), "2,0", "por post");
  if (!(await p.locator('[data-accion="resp-menos:1"]').isDisabled())) throw new Error("se puede restar por debajo de cero");
  const pubs = await p.evaluate(() => estado.deals[0].publicaciones.map((x) => x.formato + "/" + x.idioma));
  igual(pubs.join(","), "instagram/es,linkedin/en", "lo que quedó en el deal");
  igual(await p.textContent('.fila[data-accion="sel:cacao-1"] .meta:last-child'), "2 posts · 2 respuestas", "contador en la lista");
  p.once("dialog", (d) => d.accept());
  await p.click('[data-accion="quitar-pub:0"]');
  igual(await p.textContent("#total-seguimiento"), "1 post · 0 respuestas", "total al quitar uno");
});

// --- lo que se rompió alguna vez y no puede volver a romperse ---------

await caso("los productos cruzan por palabra, no por subcadena", "/index.html", async (p) => {
  const r = await p.evaluate(() => ({
    camaronRon: coincideProducto(["camarón congelado"], ["ron añejo"]),
    espinacaPina: coincideProducto(["espinaca baby"], ["piña MD2"]),
    cacaoCacao: coincideProducto(["Premium cocoa beans"], ["cacao en grano"]),
    cafeCafe: coincideProducto(["coffee"], ["café verde"]),
  }));
  if (r.camaronRon) throw new Error("camarón cruza con ron");
  if (r.espinacaPina) throw new Error("espinaca cruza con piña");
  if (!r.cacaoCacao || !r.cafeCafe) throw new Error("dejó de cruzar lo que sí es lo mismo");
});

await caso("cambiar el tamaño no borra lo que estás escribiendo", "/index.html", async (p) => {
  await p.evaluate(() => {
    estado.contactos = [{ id: "p-1", lado: "proveedor", nombre: "CONACADO", pais: "RD",
      productos: ["cacao"], volumen: 100, unidad: "t", certificaciones: [], incoterms: [],
      pagos: [], mercados: [], verif: {}, estado: "nuevo", notas: [] }];
    ui.seccion = "proveedor"; ui.selContacto = "p-1"; ui.tabContacto = "bitacora"; render();
  });
  await p.click('textarea[name="texto"]');
  await p.type('textarea[name="texto"]', "piden la LOI");
  await p.setViewportSize({ width: 1280, height: 600 });   // el teclado del móvil
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({ foco: document.activeElement.tagName, valor: document.activeElement.value || "" }));
  igual(r.foco + "|" + r.valor, "TEXTAREA|piden la LOI", "lo escrito sobrevive");
});

await caso("borrar una ficha suelta los acuerdos que la usaban", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.contactos = [{ id: "p-9", lado: "proveedor", nombre: "CONACADO", fiscal: "1-01-1",
      pais: "RD", productos: ["cacao"], volumen: 100, unidad: "t", certificaciones: [],
      incoterms: [], pagos: [], mercados: [], verif: {}, estado: "activo", notas: [] }];
    estado.deals = [{ id: "d-1", producto: "cacao", cantidad: 25, unidad: "t", fee: 5000,
      paisOrigen: "RD", paisDestino: "PR", requisitos: [], etapa: "captada", notas: [],
      contraparteId: "p-9" }];
    window.confirm = () => true;
    ui.seccion = "proveedor"; ui.selContacto = "p-9"; ui.tabContacto = "bitacora"; render();
    document.querySelector('[data-accion="borrar-contacto"]').click();
    ui.seccion = "deals"; ui.sel = "d-1"; ui.tab = "docs"; render();
    return { apunta: estado.deals[0].contraparteId,
      avisa: document.body.textContent.includes("ya no está en el libro") };
  });
  if (r.apunta) throw new Error("el deal sigue apuntando a una ficha borrada");
  if (!r.avisa) throw new Error("no avisa que la contraparte desapareció");
});

// --- lo que la app tiene que aguantar para sostener el plan -----------

await caso("se fichan muchos de una pegando la lista", "/index.html", async (p) => {
  await p.click('[data-accion="seccion:proveedor"]');
  await p.click('[data-accion="lote:proveedor"]');
  await p.fill('textarea[name="lote"]', [
    "CONACADO, República Dominicana, cacao",
    "Rizek Cacao, República Dominicana, cacao/manteca de cacao",
    "Roig Agro Cacao, República Dominicana",
    "Öko Caribe",
    "CONACADO",
  ].join("\n"));
  await p.click('button[type="submit"]');
  const r = await p.evaluate(() => ({
    cuantas: estado.contactos.length,
    pais: estado.contactos[1].pais,
    productos: estado.contactos[1].productos.length,
  }));
  igual(String(r.cuantas), "4", "fichas creadas sin repetir");
  igual(r.pais + "/" + r.productos, "República Dominicana/2", "país y productos del lote");
});

await caso("se busca entre muchas fichas sin perder el foco", "/index.html", async (p) => {
  await p.evaluate(() => {
    estado.contactos = ["CONACADO", "Rizek Cacao", "Roig Agro Cacao", "Öko Caribe"].map((n, i) => ({
      id: "p-" + i, lado: "proveedor", nombre: n, pais: "República Dominicana",
      productos: ["cacao"], volumen: 100, unidad: "t", certificaciones: [], incoterms: [],
      pagos: [], mercados: [], verif: {}, estado: "nuevo", notas: [],
    }));
    ui.seccion = "proveedor"; render();
  });
  await p.click('[data-accion="buscar"]');
  await p.type('[data-accion="buscar"]', "rizek", { delay: 20 });
  await p.waitForTimeout(150);
  igual(String(await p.locator("#lista-cuerpo .fila").count()), "1", "filtra");
  igual(await p.textContent("#cuenta-busqueda"), "1 de 4", "contador");
  igual(await p.evaluate(() => document.activeElement.getAttribute("data-accion")), "buscar", "el foco se queda");
});

await caso("avisa a quién toca recontactar", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.contactos = [{ id: "p-1", lado: "proveedor", nombre: "CONACADO", pais: "RD",
      productos: ["cacao"], volumen: 100, unidad: "t", certificaciones: [], incoterms: [],
      pagos: [], mercados: [], verif: {}, estado: "nuevo", notas: [], recontactar: enFecha(-2) }];
    ui.seccion = "proveedor"; render();
    return { fila: document.querySelector("#lista-cuerpo .fila").textContent,
      resumen: document.querySelectorAll(".cifra")[3].textContent };
  });
  if (!r.fila.includes("vencido hace 2")) throw new Error("la fila no marca el vencido");
  if (!r.resumen.includes("1")) throw new Error("el resumen no cuenta los pendientes");
});

await caso("el respaldo se exporta, se valida y se restaura", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.contactos = [{ id: "p-1", lado: "proveedor", nombre: "CONACADO", notas: [] }];
    estado.deals = [{ id: "d-1", producto: "cacao", notas: [] }];
    const copia = respaldoJSON();
    estado.contactos = []; estado.deals = [];
    const basura = aplicarRespaldo("no soy json").ok;
    const incompleto = aplicarRespaldo('{"a":1}').ok;
    const bueno = aplicarRespaldo(copia);
    return { basura, incompleto, ok: bueno.ok, contactos: estado.contactos.length, deals: estado.deals.length };
  });
  if (r.basura || r.incompleto) throw new Error("acepta un archivo que no es un respaldo");
  if (!r.ok || r.contactos !== 1 || r.deals !== 1) throw new Error("no restaura el libro");
});

await caso("escribirle a una ficha por el canal que conviene", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.perfil = { nombre: "Jonathan Guzmán", empresa: "JG Trade", telefono: "787-555-0101" };
    estado.contactos = [
      { id: "p-1", lado: "proveedor", nombre: "CONACADO", persona: "María Reyes",
        telefono: "809 563 1234", email: "export@conacado.com.do", pais: "República Dominicana",
        productos: ["cacao en grano"], volumen: 6000, unidad: "t", certificaciones: ["orgánico"],
        incoterms: [], pagos: [], mercados: ["Puerto Rico"], verif: {}, estado: "nuevo", notas: [] },
      { id: "c-1", lado: "comprador", nombre: "José Santiago", email: "compras@josesantiago.com",
        telefono: "", pais: "Puerto Rico", productos: ["cacao en grano"], volumen: 25, unidad: "t",
        certificaciones: ["orgánico"], incoterms: [], pagos: [], mercados: ["República Dominicana"],
        verif: {}, estado: "nuevo", notas: [] },
    ];
    ui.seccion = "proveedor"; ui.selContacto = "p-1"; ui.tabContacto = "escribir"; ui.canal = null;
    render();
    const prov = {
      canal: canalSugerido(contactoActual()),
      enlace: document.querySelector("a.btn.enviar").getAttribute("href"),
      texto: document.querySelector("pre.doc").textContent,
    };
    ui.seccion = "comprador"; ui.selContacto = "c-1"; ui.canal = null;
    render();
    const comp = {
      canal: canalSugerido(contactoActual()),
      enlace: document.querySelector("a.btn.enviar").getAttribute("href"),
    };
    // sin teléfono, WhatsApp queda apagado y no se puede pinchar
    ui.canal = "whatsapp"; render();
    const apagado = document.querySelector('[aria-disabled="true"]') !== null;
    // y "ya lo mandé" deja la nota y el recordatorio
    ui.canal = null; render();
    document.querySelector('[data-accion^="ya-escribi:"]').click();
    const c = contactoPorId("c-1");
    return { prov, comp, apagado, estado: c.estado, dias: diasPara(c.recontactar),
      nota: (c.notas[0] || {}).texto || "" };
  });
  igual(r.prov.canal, "whatsapp", "a un proveedor conviene WhatsApp");
  igual(r.comp.canal, "correo", "a un comprador conviene el correo");
  if (!r.prov.enlace.startsWith("https://wa.me/18095631234?text=")) {
    throw new Error("el número no se normalizó: " + r.prov.enlace.slice(0, 40));
  }
  if (!r.comp.enlace.startsWith("mailto:compras@josesantiago.com?subject=")) {
    throw new Error("el mailto salió mal: " + r.comp.enlace.slice(0, 40));
  }
  if (!r.prov.texto.includes("María") || !r.prov.texto.includes("JG Trade")) {
    throw new Error("el mensaje no usa los campos de la ficha ni los tuyos");
  }
  if (!r.apagado) throw new Error("sin teléfono el botón de WhatsApp debería estar apagado");
  igual(r.estado + "/" + r.dias, "contactado/3", "al mandarlo arranca la secuencia: el rebote es a los 3 días");
  if (!r.nota.includes("correo")) throw new Error("no quedó la nota en la bitácora");
  if (!r.nota.includes("Primer contacto")) throw new Error("la nota no dice en qué paso de la secuencia va");
});

await caso("el bolsillo ordena el día y manda lo que editaste", "/bolsillo.html", async (p) => {
  const r = await p.evaluate(() => {
    aplicarRespaldo(JSON.stringify({
      formato: "mesa-intermediacion-1",
      perfil: { nombre: "Jonathan Rodríguez Nieves", empresa: "JRN Sourcing", telefono: "939-254-4482" },
      deals: [],
      contactos: [
        { id: "p-1", lado: "proveedor", nombre: "Rizek Cacao", telefono: "809-530-9400",
          productos: ["cacao en grano"], notas: [], recontactar: enFecha(-2) },
        { id: "p-2", lado: "proveedor", nombre: "Yacao", productos: ["cacao en grano"], notas: [] },
        { id: "c-1", lado: "comprador", nombre: "José Santiago", email: "compras@ejemplo.com",
          productos: ["alimentos"], notas: [], recontactar: enFecha(5) },
      ],
    }));
    render();
    const orden = grupos().map((g) => g[0]).join(",");
    ui.abierto = "p-1"; ui.canal = null; ui.borrador = null; render();
    const antes = document.querySelector("[data-enviar]").getAttribute("href");
    const llamar0 = (document.querySelector('.barra a[href^="tel:"]') || {}).href;
    const caja = document.querySelector("textarea.mensaje");
    caja.value = caja.value + " PD.";
    caja.dispatchEvent(new Event("input", { bubbles: true }));
    const despues = document.querySelector("[data-enviar]").getAttribute("href");
    return { orden, antes, despues,
      llamarAntes: llamar0, llamarDespues: (document.querySelector('.barra a[href^="tel:"]') || {}).href,
      firma: caja.value.includes("JRN Sourcing"),
      foco: document.activeElement.tagName };
  });
  igual(r.orden.split(",")[0], "Toca hoy", "lo vencido va primero");
  if (!r.antes.startsWith("https://wa.me/18095309400")) throw new Error("el wa.me salió mal");
  if (!decodeURIComponent(r.despues).endsWith(" PD.")) {
    throw new Error("el botón manda el texto original en vez de lo editado");
  }
  if (!r.firma) throw new Error("el mensaje no sale firmado con el perfil");
  if (r.llamarAntes !== r.llamarDespues) {
    throw new Error("editar el mensaje le pisó el enlace al botón de llamar");
  }
  if (!(r.llamarAntes || "").startsWith("tel:")) throw new Error("falta el botón de llamar");
});

await caso("presentar exige las dos firmas y queda anotado", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.perfil = { nombre: "Jonathan Rodríguez Nieves", empresa: "JRN Sourcing" };
    estado.presentaciones = [];
    estado.contactos = [
      { id: "c-1", lado: "comprador", nombre: "Chocolaterie Montréal", persona: "Marc Tremblay",
        email: "achats@choco.ca", pais: "Canadá", productos: ["cacao en grano"], volumen: 25,
        unidad: "t", certificaciones: ["orgánico"], incoterms: [], pagos: [],
        mercados: ["República Dominicana"], verif: {}, estado: "nuevo", notas: [] },
      { id: "p-1", lado: "proveedor", nombre: "CONACADO", persona: "María Reyes",
        email: "export@conacado.com.do", pais: "República Dominicana", productos: ["cacao en grano"],
        volumen: 6000, unidad: "t", certificaciones: ["orgánico", "Fairtrade"], incoterms: [],
        pagos: [], mercados: ["Canadá"], verif: { fiscal: 1, mercantil: 1 }, estado: "nuevo", notas: [] },
    ];
    ui.seccion = "comprador"; ui.selContacto = "c-1"; ui.tabContacto = "cruce"; render();
    document.querySelector('[data-accion^="presentar:"]').click();
    const cerrada = document.querySelector(".puerta").className.includes("cerrada");
    // forzar el botón bloqueado no debe registrar nada
    const boton = document.querySelector('[data-accion^="ya-presente:"]');
    const bloqueado = boton.disabled;
    boton.removeAttribute("disabled");
    boton.click();
    const trasForzar = presentaciones().length;
    // firmar las dos partes
    document.querySelector('[data-accion="ncnd:c-1"]').click();
    document.querySelector('[data-accion="ncnd:p-1"]').click();
    const abierta = document.querySelector(".puerta").className.includes("abierta");
    const mailto = (document.querySelector("a.btn.chico.primario") || {}).href || "";
    const texto = document.querySelector("pre.doc").textContent;
    document.querySelector('[data-accion^="ya-presente:"]').click();
    return { cerrada, bloqueado, trasForzar, abierta, mailto, texto,
      cuantas: presentaciones().length,
      notaC: (contactoPorId("c-1").notas.slice(-1)[0] || {}).texto || "",
      dias: diasPara(contactoPorId("c-1").recontactar) };
  });
  if (!r.cerrada || !r.bloqueado) throw new Error("sin NCND la puerta debería estar cerrada");
  if (r.trasForzar !== 0) throw new Error("forzando el botón registró una presentación sin firmas");
  if (!r.abierta) throw new Error("con las dos firmas debería abrirse");
  if (!r.mailto.startsWith("mailto:achats@choco.ca,export@conacado.com.do")) {
    throw new Error("el correo no va a los dos a la vez: " + r.mailto.slice(0, 50));
  }
  if (!r.texto.includes("registro fiscal, registro mercantil")) {
    throw new Error("el correo no dice lo que verificaste");
  }
  if (r.texto.match(/cacao en grano/g).length > 3) throw new Error("el correo repite el producto");
  igual(r.cuantas + "/" + r.dias, "1/3", "queda registrada y con recordatorio");
  if (!r.notaC.includes("CONACADO")) throw new Error("no quedó la nota en la ficha del comprador");
});

await caso("el lector de personas llena una ficha", "/index.html", async (p) => {
  await p.click('[data-accion="seccion:proveedor"]');
  await p.click('[data-accion="nuevo-contacto:proveedor"]');
  await p.fill('textarea[name="pegado"]',
    "Luis Ortiz — Export Manager\nRizek Cacao, S.A.S.\nlortiz@rizekcacao.com\n809-530-9400");
  await p.click('[data-accion="leer-persona"]');
  const r = await p.evaluate(() => ({
    nombre: document.querySelector('[name="nombre"]').value,
    persona: document.querySelector('[name="persona"]').value,
    cargo: document.querySelector('[name="cargo"]').value,
    email: document.querySelector('[name="email"]').value,
    tel: document.querySelector('[name="telefono"]').value,
  }));
  igual(r.persona, "Luis Ortiz", "la persona");
  igual(r.cargo, "Export Manager", "el cargo");
  igual(r.email, "lortiz@rizekcacao.com", "el correo");
  igual(r.tel, "809-530-9400", "el teléfono");
  if (!r.nombre.includes("Rizek")) throw new Error("no sacó la empresa: " + r.nombre);
});

await caso("la secuencia avanza con un mensaje distinto en cada paso", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.perfil = { nombre: "Jonathan Rodríguez Nieves", empresa: "JRN Sourcing" };
    estado.contactos = [{ id: "p-1", lado: "proveedor", nombre: "Rizek Cacao", persona: "Luis",
      telefono: "809-530-9400", productos: ["cacao en grano"], certificaciones: ["orgánico"],
      incoterms: [], pagos: [], mercados: ["Puerto Rico"], verif: {}, estado: "nuevo", notas: [] }];
    ui.seccion = "proveedor"; ui.selContacto = "p-1"; ui.tabContacto = "escribir";
    ui.canal = null; ui.paso = null; render();
    const lineas = [], esperas = [];
    for (let i = 0; i < 5; i++) {
      lineas.push(document.querySelector("pre.doc").textContent.split("\n")[0]);
      document.querySelector('[data-accion^="ya-escribi:"]').click();
      esperas.push(diasPara(contactoPorId("p-1").recontactar));
      ui.tabContacto = "escribir"; ui.paso = null; render();
    }
    const c = contactoPorId("p-1");
    return { lineas, esperas, paso: pasoDe(c), recordatorio: c.recontactar, notas: c.notas.length };
  });
  if (new Set(r.lineas).size !== 5) throw new Error("algún paso repite el mismo mensaje");
  igual(JSON.stringify(r.esperas), "[3,4,7,16,null]", "las esperas de la cadencia");
  igual(String(r.paso) + "/" + r.notas, "4/5", "paso final y una nota por paso");
  if (r.recordatorio !== "") throw new Error("al terminar la secuencia no debería seguir recordando");
});

await caso("el repaso del correo empareja y explica cada fallo", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.contactos = [
      { id: "p-1", lado: "proveedor", nombre: "Rizek", email: "info@rizekcacao.com", notas: [] },
      { id: "c-1", lado: "comprador", nombre: "Malgor", email: "malgorco@malgor.com", notas: [] },
      { id: "p-9", lado: "proveedor", nombre: "Personal", email: "x@gmail.com", notas: [] },
    ];
    // forma observada en una llamada real a search_threads
    const hallazgos = cruzarCorreo({ resultCountEstimate: "2", threads: [
      { id: "t1", messageCount: 2, viewUrl: "https://mail.google.com/t1", messages: [
        { id: "m1", sender: "luis@rizekcacao.com", date: "2026-11-20T10:00:00Z",
          subject: "Re: Consulta", viewUrl: "https://mail.google.com/m1" } ] },
      { id: "t2", messageCount: 1, messages: [
        { id: "m2", sender: "otra@desconocida.com", date: "2026-11-19T10:00:00Z" } ] },
    ] });
    const codigos = ["server_not_connected", "needs_reauth", "not_in_manifest", "approval_required",
      "blocked_by_policy", "selection_required", "server_unavailable", "codigo_nuevo"];
    return { consulta: consultaCorreo(), dominios: dominiosDelLibro(), hallazgos: hallazgos,
      textos: codigos.map(explicarFalloCorreo), reintenta: reintentable("server_unavailable"),
      noReintenta: reintentable("needs_reauth") };
  });
  igual(r.consulta, "from:(rizekcacao.com OR malgor.com) newer_than:90d", "la consulta a Gmail");
  if (r.dominios.indexOf("gmail.com") >= 0) throw new Error("no debería buscar en dominios gratuitos");
  igual(Object.keys(r.hallazgos).join(","), "p-1", "sólo empareja la ficha del dominio que escribió");
  igual(r.hallazgos["p-1"].de, "luis@rizekcacao.com", "el remitente");
  if (new Set(r.textos).size !== r.textos.length) throw new Error("dos códigos dan el mismo mensaje");
  if (!r.reintenta || r.noReintenta) throw new Error("mal clasificado qué se puede reintentar");
});

for (const plan of ["primer-comprador", "corredor-sd-sju", "anatomia-de-un-trato"]) {
  await caso(`el plan ${plan} abre`, `/plan/${plan}.html`, async (p) => {
    if (!(await p.locator("h1").count())) throw new Error("sin título");
  });
}

await navegador.close();
servidor.close();
if (fallos) {
  console.error(`\n${fallos} caso(s) fallaron`);
  process.exit(1);
}
console.log("\nTodo en orden");
