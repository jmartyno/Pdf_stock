// modules/conciliacion.js
// Genera conciliación VELNEO vs CSV Tiendas por EAN + Uso + Almacén, con tallas en columnas (texto) + total.

function norm(s){ return String(s ?? "").trim(); }
function normKey(s){ return norm(s).toLowerCase(); }
function num(v){ const n = Number(String(v ?? "").replace(",", ".").trim()); return Number.isFinite(n) ? n : 0; }

function addTo(map, key, value){
  map.set(key, (map.get(key) ?? 0) + value);
}

function joinTallas(mapTalla){
  // "46 2 | 48 1 | UNICO 5"  (solo las no-0)
  const parts = [];
  for (const [t,v] of mapTalla.entries()){
    if ((Number(v) || 0) !== 0) parts.push(`${t} ${v}`);
  }
  return parts.join(" | ");
}

function totalFromMap(mapTalla){
  let t = 0;
  for (const v of mapTalla.values()) t += (Number(v) || 0);
  return t;
}

// ----- API pública -----
function generarConciliacion({ velneoRows, tiendasRows, mappingAlmacenes }){
  velneoRows = Array.isArray(velneoRows) ? velneoRows : [];
  tiendasRows = Array.isArray(tiendasRows) ? tiendasRows : [];
  mappingAlmacenes = mappingAlmacenes || {};

  // Index Velneo: (ean|almacen|uso) -> {concepto, descripcion, tallasMap}
  const V = new Map();

  for (const r of velneoRows){
    const ean = norm(r.EAN ?? r.ean ?? r["Talla -> Código de barras"] ?? r["Talla -> C�digo de barras"]);
    if (!ean) continue;

    const talla = norm(r.Talla ?? r.talla);
    const almacen = norm(r.Almacen ?? r.almacen);

    // Concepto/Descripcion opcionales
    const concepto = norm(r.Concepto ?? r.concepto ?? r.Grupo ?? r.grupo ?? "");
    const descripcion = norm(r.Descripcion ?? r.descripcion ?? r.Nombre ?? r.nombre ?? "");

    const stockNuevo = num(r.StockNuevo ?? r.stockNuevo);
    const stockUsado = num(r.StockUsado ?? r.stockUsado);

    // Nuevo
    if (stockNuevo !== 0){
      const key = `${ean}||${almacen}||NUEVO`;
      if (!V.has(key)) V.set(key, { ean, almacen, uso:"Nuevo", concepto, descripcion, tallas:new Map() });
      addTo(V.get(key).tallas, talla || "(sin talla)", stockNuevo);
    }
    // Usado
    if (stockUsado !== 0){
      const key = `${ean}||${almacen}||USADO`;
      if (!V.has(key)) V.set(key, { ean, almacen, uso:"Usado", concepto, descripcion, tallas:new Map() });
      addTo(V.get(key).tallas, talla || "(sin talla)", stockUsado);
    }
  }

  // Index Tiendas: (ean|almacenVelneo|uso) -> {concepto, descripcion, tallasMap}
  const T = new Map();

  for (const r of tiendasRows){
    const ean = norm(r.ean ?? r.EAN);
    if (!ean) continue;

    const talla = norm(r.talla ?? r.Talla);
    const usoRaw = normKey(r.uso ?? r.Uso);
    const uso = usoRaw === "usado" || usoRaw === "alquiler" ? "USADO" : "NUEVO";

    const tienda = norm(r.tienda ?? r.Tienda);
    const almacenVelneo = norm(mappingAlmacenes[tienda] ?? mappingAlmacenes[String(tienda)] ?? "");
    if (!almacenVelneo) continue; // si no hay mapping, no sabemos con qué almacén conciliar

    const concepto = norm(r.concepto ?? r.Concepto ?? "");
    const descripcion = norm(r.descripcion ?? r.Descripcion ?? "");

    const unidades = num(r.unidades ?? r.Unidades);

    if (unidades === 0) continue;

    const key = `${ean}||${almacenVelneo}||${uso}`;
    if (!T.has(key)) T.set(key, {
      ean,
      almacen: almacenVelneo,
      uso: (uso === "USADO" ? "Usado" : "Nuevo"),
      concepto,
      descripcion,
      tallas: new Map()
    });

    addTo(T.get(key).tallas, talla || "(sin talla)", unidades);
  }

  // Comparar keys
  const keys = new Set([...V.keys(), ...T.keys()]);
  const out = [];

  let comparados = 0;

  for (const k of keys){
    const v = V.get(k);
    const t = T.get(k);

    const ean = (v?.ean || t?.ean || "");
    const almacen = (v?.almacen || t?.almacen || "");
    const uso = (v?.uso || t?.uso || "");

    const concepto = (v?.concepto || t?.concepto || "");
    const descripcion = (v?.descripcion || t?.descripcion || "");

    const vTallas = v?.tallas || new Map();
    const tTallas = t?.tallas || new Map();

    // dif por talla
    const allT = new Set([...vTallas.keys(), ...tTallas.keys()]);
    const difTallas = new Map();
    for (const talla of allT){
      const dv = (Number(vTallas.get(talla)) || 0) - (Number(tTallas.get(talla)) || 0);
      if (dv !== 0) difTallas.set(talla, dv);
    }

    // si no hay diferencias, no pintamos (pero contamos)
    comparados++;
    if (difTallas.size === 0) continue;

    // Líneas: VELNEO / CSV / DIF
    const vLine = {
      Concepto: concepto,
      Descripcion: descripcion,
      Almacen: almacen,
      Uso: uso,
      Tallas: joinTallas(vTallas),
      Total: totalFromMap(vTallas),
    };
    const tLine = {
      Concepto: concepto,
      Descripcion: descripcion,
      Almacen: "CSV",
      Uso: uso,
      Tallas: joinTallas(tTallas),
      Total: totalFromMap(tTallas),
    };
    const dLine = {
      Concepto: concepto,
      Descripcion: descripcion,
      Almacen: "DIF",
      Uso: uso,
      Tallas: joinTallas(difTallas),
      Total: totalFromMap(difTallas),
    };

    out.push(vLine, tLine, dLine);
  }

  // Si no hay diferencias, devolvemos [] pero dejamos un contador accesible
  out._meta = { comparados, velneo: V.size, tiendas: T.size };
  return out;
}

// Exponer global
window.generarConciliacion = generarConciliacion;
