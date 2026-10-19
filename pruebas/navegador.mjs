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
