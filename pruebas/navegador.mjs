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

await caso("el embudo cuenta las etapas y la caída entre ellas", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.contactos = [
      { id: "a", lado: "proveedor", nombre: "A", estado: "nuevo" },
      { id: "b", lado: "proveedor", nombre: "B", estado: "contactado", ultimoContacto: "2026-11-01",
        primerContacto: "2026-11-01", origen: "feria" },
      { id: "c", lado: "proveedor", nombre: "C", estado: "respondio", primerContacto: "2026-11-01",
        respondioEl: "2026-11-05", pasoAlResponder: 1, origen: "feria" },
      { id: "d", lado: "comprador", nombre: "D", estado: "activo", primerContacto: "2026-11-01",
        respondioEl: "2026-11-03", pasoAlResponder: 0, origen: "referido" },
    ];
    const emb = embudoContactos(null);
    return {
      etapas: emb.map((x) => x.cuantos),
      conv: emb.map((x) => x.conversion),
      tiempos: tiempoHastaRespuesta(),
      soloProv: embudoContactos("proveedor").map((x) => x.cuantos),
      origenes: rendimientoPorOrigen().map((o) => o.rotulo + ":" + o.respondieron + "/" + o.contactados),
    };
  });
  igual(r.etapas.join(","), "4,3,2,1", "fichados, contactados, respondieron, activos");
  igual(r.conv[0], null, "la primera etapa no tiene de qué convertir");
  igual(r.conv[1], 75, "3 de 4 contactados");
  igual(r.tiempos.mediana, 3, "la mediana de días hasta la respuesta");
  igual(r.soloProv.join(","), "3,2,1,0", "el embudo filtrado por lado");
  if (r.origenes.some((x) => x.endsWith(":0/0"))) {
    throw new Error("un canal sin nadie contactado no va en la lista: " + r.origenes.join(" | "));
  }
  if (!r.origenes.some((x) => x.includes("feria:1/2"))) {
    throw new Error("el rendimiento por origen no cuadra: " + r.origenes.join(" | "));
  }
});

await caso("anotar la respuesta guarda fecha y paso una sola vez", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    const c = { id: "x", lado: "proveedor", nombre: "X", paso: 2 };
    const primera = anotarRespuesta(c);
    const fecha = c.respondioEl;
    c.paso = 4;
    const segunda = anotarRespuesta(c);
    return { primera, segunda, paso: c.pasoAlResponder, mismaFecha: c.respondioEl === fecha };
  });
  if (!r.primera) throw new Error("la primera respuesta debería anotarse");
  if (r.segunda) throw new Error("no debería sobrescribir la primera respuesta");
  igual(r.paso, 2, "el paso en que respondió");
  if (!r.mismaFecha) throw new Error("la fecha cambió al volver a marcar");
});

await caso("el libro de comisiones separa lo cobrado de lo pactado", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.deals = [
      { id: "d1", etapa: "presentada", fee: 10000 },
      { id: "d2", etapa: "cerrada", fee: 20000, cobro: "facturada", fechaFactura: "2026-01-01" },
      { id: "d3", etapa: "cerrada", fee: 30000, cobro: "cobrada", montoCobrado: 25000 },
      { id: "d4", etapa: "cerrada", fee: 40000, cobro: "perdida" },
    ];
    const d = dineroDelLibro();
    return { enJuego: d.enJuego, facturado: d.facturado, cobrado: d.cobrado,
      perdido: d.perdido, vencidas: d.vencidas.map((x) => x.id) };
  });
  igual(r.enJuego, 10000, "sólo los tratos vivos");
  igual(r.facturado, 20000, "lo facturado sin cobrar");
  igual(r.cobrado, 25000, "lo que entró de verdad, no lo pactado");
  igual(r.perdido, 40000, "lo perdido");
  igual(r.vencidas.join(","), "d2", "la factura pasada de 30 días");
});

await caso("el panel se dibuja sin datos y con datos", "/index.html", async (p) => {
  await p.evaluate(() => { estado.contactos = []; estado.deals = []; ui.seccion = "panel"; render(); });
  if (!(await p.locator('[data-accion="seccion:panel"]').count())) throw new Error("falta la pestaña del panel");
  const vacio = await p.locator(".tramo").count();
  if (vacio < 4) throw new Error("el embudo debería dibujar sus cuatro etapas igual sin datos");
  await p.evaluate(() => {
    estado.contactos = [{ id: "a", lado: "proveedor", nombre: "A", estado: "respondio",
      primerContacto: "2026-11-01", respondioEl: "2026-11-04", pasoAlResponder: 1, origen: "feria" }];
    estado.deals = [{ id: "d1", etapa: "cerrada", fee: 5000, cobro: "cobrada", montoCobrado: 5000 }];
    render();
  });
  const texto = await p.locator(".dinero").innerText();
  if (!texto.includes("$5,000")) throw new Error("el panel no muestra lo cobrado: " + texto);
});

await caso("el documento con membrete sale como HTML imprimible", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    const md = [
      "# Acuerdo NCND",
      "",
      "## 1. Partes",
      "",
      "Firma: ______________________   Nombre: Jonathan",
      "",
      "- Un punto con **negrita**",
      "  que sigue en la línea de abajo",
      "- Otro punto",
      "",
      "---",
      "",
      "Un párrafo con <script>alert(1)</script> adentro.",
    ].join("\n");
    const html = hojaImprimible("Acuerdo", md, { empresa: "JRN Sourcing", nombre: "Jonathan Rodriguez",
      telefono: "939-254-4482", email: "x@y.com" });
    return {
      html,
      archivo: nombreArchivo("Acuerdo NCND de no elusión", { id: "d-1" }),
      iniciales: inicialesDe("JRN Sourcing"),
      items: (html.match(/<li>/g) || []).length,
    };
  });
  if (!r.html.startsWith("<!doctype html>")) throw new Error("no es un documento completo");
  if (!r.html.includes("JRN Sourcing")) throw new Error("falta el membrete");
  if (!r.html.includes("<h1>Acuerdo NCND</h1>")) throw new Error("no convirtió el título");
  if (!r.html.includes("<strong>negrita</strong>")) throw new Error("no convirtió la negrita");
  if (!r.html.includes('class="raya"')) throw new Error("la raya para firmar no salió");
  if (r.html.includes("<script>alert")) throw new Error("INYECCIÓN: el HTML del texto no se escapó");
  if (!r.html.includes("&lt;script&gt;")) throw new Error("el texto debería verse escapado");
  igual(r.items, 2, "dos viñetas, con la línea sangrada unida a la primera");
  if (!r.html.includes("que sigue en la línea de abajo")) throw new Error("se perdió la continuación");
  igual(r.archivo, "acuerdo-ncnd-de-no-elusion-d-1.html", "el nombre del archivo");
  igual(r.iniciales, "JRN", "el sello usa la sigla, no la inicial de cada palabra");
});

await caso("guardar reconstruye el documento entero", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    const doc = documentoCompleto();
    return { largo: doc.length, bloques: (doc.match(/<script id="[a-z]+" data-src>/g) || []).length,
      cierra: (doc.match(/<\/script>/g) || []).length, estado: doc.includes('id="estado"'),
      papel: doc.includes("CSS_PAPEL"), membrete: doc.includes("hojaImprimible") };
  });
  igual(r.bloques, 8, "los ocho bloques de código");
  if (!r.estado) throw new Error("el documento guardado no lleva el estado");
  if (!r.papel || !r.membrete) throw new Error("se perdió la papelería al reconstruir");
  if (r.cierra !== r.bloques + 1) throw new Error("etiquetas </script> descuadradas: " + r.cierra);
});

await caso("el teléfono manda el seguimiento, no de nuevo la apertura", "/bolsillo.html", async (p) => {
  const r = await p.evaluate(() => {
    const c = { id: "p-1", lado: "proveedor", nombre: "Rizek", telefono: "+18095551234",
      productos: ["cacao"], ultimoContacto: "2026-11-01", paso: 1 };
    estado.contactos = [c];
    const seguimiento = mensajePaso(c, "whatsapp");
    const asuntoSeguimiento = asuntoDe(c);
    c.paso = 0;
    return { seguimiento, apertura: mensajePaso(c, "whatsapp"),
      asuntoSeguimiento, asuntoApertura: asuntoDe(c),
      cierre: (() => { c.paso = 4; return mensajePaso(c, "whatsapp"); })() };
  });
  if (r.seguimiento === r.apertura) throw new Error("el paso 1 manda el mismo texto que el primer contacto");
  if (!r.seguimiento.includes("2026-11-01")) throw new Error("el rebote no cita cuándo le escribiste");
  if (!r.asuntoSeguimiento.startsWith("Re: ")) throw new Error("el seguimiento debería subir el hilo");
  if (r.asuntoApertura.startsWith("Re: ")) throw new Error("el primer contacto no es una respuesta");
  if (!r.cierre.includes("no te escribo más")) throw new Error("el cierre no cierra");
});

await caso("el teléfono también cita el registro de aduana", "/bolsillo.html", async (p) => {
  const r = await p.evaluate(() => {
    const c = { id: "c-1", lado: "comprador", nombre: "ATLANTIC COCOA CO", email: "x@y.com",
      productos: ["cacao en grano"], mercados: ["República Dominicana"],
      importa: [{ producto: "cacao en grano", contraparte: "RIZEK CACAO S.A.S",
        fecha: "2026-08-14", cantidad: "18 toneladas" }] };
    estado.contactos = [c];
    const con = mensajePaso(c, "correo");
    const sin = mensajePaso({ ...c, importa: [] }, "correo");
    return { con, sin, mes: mesLargo("2026-08") };
  });
  if (r.con === r.sin) throw new Error("manda el mismo mensaje sepa o no qué importan");
  if (!r.con.includes("RIZEK CACAO S.A.S")) throw new Error("no cita al proveedor que ya usan");
  if (!r.con.includes("agosto de 2026")) throw new Error("no cita cuándo: " + r.con);
  if (!r.con.includes("segunda fuente")) throw new Error("no ofrece segunda fuente");
  igual(r.mes, "agosto de 2026", "el mes en palabras");
});

await caso("el teléfono avanza la secuencia con los días de la Mesa", "/bolsillo.html", async (p) => {
  const r = await p.evaluate(() => {
    const c = { id: "p-1", lado: "proveedor", nombre: "Rizek", telefono: "+18095551234",
      productos: ["cacao"], estado: "nuevo" };
    estado.contactos = [c];
    ui.abierto = "p-1"; render();
    const boton = document.querySelector('[data-accion="ya"]');
    if (!boton) throw new Error("no hay botón de “ya le escribí”");
    boton.click();
    const tras1 = { paso: c.paso, dias: diasPara(c.recontactar), primero: c.primerContacto,
      estado: c.estado };
    ui.abierto = "p-1"; render();
    document.querySelector('[data-accion="ya"]').click();
    return { tras1, paso2: c.paso, dias2: diasPara(c.recontactar), notas: (c.notas || []).length };
  });
  igual(r.tras1.paso, 1, "después del primer contacto queda en el paso 1");
  igual(r.tras1.dias, 3, "el rebote es a los 3 días, no a los 7");
  igual(r.tras1.estado, "contactado", "el estado");
  if (!r.tras1.primero) throw new Error("no anotó la fecha del primer contacto");
  igual(r.paso2, 2, "el segundo envío lo deja en el paso 2");
  igual(r.dias2, 4, "del día 3 al día 7 hay 4 días");
  igual(r.notas, 2, "una anotación por envío");
});

await caso("el lector de registros saca empresas, fecha y cantidad", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    const texto = [
      "ATLANTIC COCOA CO\tRIZEK CACAO S.A.S\t2026-08-14\t18 toneladas",
      "NEDERLAND S.A. | JG GARCIA DOMINICAN CACAO SRL | 05/02/2024 | 25 tonnes",
      "BARRY CALLEBAUT USA LLC   JRCA CACAO GROUP SRL   Aug 3, 2026   8 containers",
      "Atlantic Cocoa Co",
      "934 shipments",
      "",
    ].join("\n");
    const leido = parsearRegistros(texto);
    return {
      filas: leido.filas.map((x) => [x.importador, x.proveedor, x.fecha, x.cantidad]),
      sueltos: leido.sueltos.map((x) => x.nombre),
      ignoradas: leido.ignoradas,
      fechas: ["2026-08-14", "05/02/2024", "Aug 3, 2026", "mayo de 2024", "nada"].map(fechaDeTexto),
      empresa: ["RIZEK CACAO S.A.S", "Atlantic Cocoa Co", "934", "18 toneladas", "cacao"].map(pareceEmpresa),
    };
  });
  igual(r.filas.length, 3, "tres filas con las dos partes");
  igual(r.filas[0].join("|"), "ATLANTIC COCOA CO|RIZEK CACAO S.A.S|2026-08-14|18 toneladas", "la fila de tabulaciones");
  igual(r.filas[1][2], "2024-05-02", "la fecha de EEUU es mes primero");
  igual(r.filas[2][1], "JRCA CACAO GROUP SRL", "la fila separada por espacios");
  igual(r.filas[2][3], "8 containers", "los contenedores");
  igual(r.sueltos.join(","), "Atlantic Cocoa Co", "la empresa sin contraparte");
  igual(r.ignoradas.join(","), "934 shipments", "lo que no es una empresa se descarta");
  igual(r.fechas[3], "2024-05", "un mes sin día sirve igual");
  igual(r.fechas[4], "", "lo que no es fecha no inventa una");
  igual(r.empresa.join(","), "true,true,false,false,false", "qué parece empresa y qué no");
});

await caso("fichar desde un registro llena las dos fichas y no duplica", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    estado.contactos = [];
    ui.seccion = "registros";
    ui.registro = { producto: "cacao en grano", origen: "República Dominicana", destino: "Puerto Rico" };
    render();
    document.querySelector('[data-accion="leer-registros"] textarea').value =
      "ATLANTIC COCOA CO\tRIZEK CACAO S.A.S\t2026-08-14\t18 toneladas";
    document.querySelector('[data-accion="leer-registros"]')
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    document.querySelector('[data-accion="fichar-reg:par.0.ambos"]').click();
    // el mismo registro otra vez: no debe crear fichas nuevas
    document.querySelector('[data-accion="leer-registros"] textarea').value =
      "ATLANTIC COCOA CO\tRIZEK CACAO S.A.S\t2026-08-14\t18 toneladas";
    document.querySelector('[data-accion="leer-registros"]')
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    document.querySelector('[data-accion="fichar-reg:par.0.ambos"]').click();

    const comp = estado.contactos.find((c) => c.lado === "comprador");
    const prov = estado.contactos.find((c) => c.lado === "proveedor");
    return {
      cuantos: estado.contactos.length,
      comp: { nombre: comp.nombre, pais: comp.pais, origen: comp.origen,
        importa: comp.importa.length, prod: comp.productos[0] },
      prov: { nombre: prov.nombre, pais: prov.pais, importa: (prov.importa || []).length },
      mensaje: mensajeDe(comp, "correo"),
      corto: mensajeDe(comp, "whatsapp"),
      resumen: resumenImporta(comp),
    };
  });
  igual(r.cuantos, 2, "dos fichas, no cuatro: el segundo pegado no duplica");
  igual(r.comp.nombre, "ATLANTIC COCOA CO", "el importador queda de comprador");
  igual(r.comp.pais, "Puerto Rico", "el comprador va al país destino");
  igual(r.comp.origen, "registro", "queda anotado de dónde salió la ficha");
  igual(r.comp.importa, 1, "un solo dato de importación, no dos");
  igual(r.prov.nombre, "RIZEK CACAO S.A.S", "el proveedor es la otra parte");
  igual(r.prov.pais, "República Dominicana", "el proveedor va al país de origen");
  igual(r.prov.importa, 0, "a un proveedor no se le anota qué importa");
  if (!r.mensaje.includes("RIZEK CACAO S.A.S")) throw new Error("el correo no cita al proveedor que ya usan");
  if (!r.mensaje.includes("agosto de 2026")) throw new Error("el correo no cita cuándo: " + r.mensaje);
  if (!r.mensaje.includes("segunda fuente")) throw new Error("el correo debería ofrecer segunda fuente");
  if (r.mensaje.includes("creo que puede encajar")) throw new Error("salió el mensaje genérico");
  if (!r.corto.includes("registros de aduana")) throw new Error("el de WhatsApp no cita el registro");
  if (!r.resumen.includes("RIZEK")) throw new Error("el resumen de la ficha no dice qué importa");
});

await caso("las fuentes de registros salen con enlace y partida", "/index.html", async (p) => {
  const r = await p.evaluate(() => {
    const f = consultasRegistro("cacao en grano", "República Dominicana", "Puerto Rico");
    const sin = consultasRegistro("", "", "");
    return {
      nombres: f.map((x) => x.nombre),
      urls: f.map((x) => x.url),
      hs: partidaHS("cacao en grano"),
      sinProducto: sin.length,
      mesLargo: [mesLargo("2026-08"), mesLargo("2024-05"), mesLargo("nada")],
    };
  });
  if (!r.nombres.some((n) => n.startsWith("ImportYeti"))) throw new Error("falta ImportYeti");
  if (!r.nombres.some((n) => n.includes("USITC"))) throw new Error("falta la fuente oficial gratis");
  if (r.urls.some((u) => !/^https:\/\//.test(u))) throw new Error("hay una URL que no es https");
  igual(r.hs, "1801 — cacao en grano", "la partida del cacao");
  if (r.sinProducto < 2) throw new Error("sin producto igual tiene que ofrecer las fuentes generales");
  igual(r.mesLargo.join(","), "agosto de 2026,mayo de 2024,nada", "el mes en palabras");
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
