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
