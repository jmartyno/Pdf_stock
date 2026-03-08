// app.js
// Stock por tallas: CSV local -> pivot con tallas en columnas + filtros + print
const $ = (id) => document.getElementById(id);

const state = {
  rows: [],
  grupos: [],
  almacenes: [],

  velneo: [],
  tiendas: [],
  concAll: [],
  concTiendasList: [],
  concViewRows: []
};

function setText(id, txt){
  const el = $(id);
  if (el) el.textContent = txt;
}

function normalizeKey(s){
  return String(s ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("á","a").replaceAll("é","e").replaceAll("í","i").replaceAll("ó","o").replaceAll("ú","u")
    .replaceAll("ñ","n")
    .replaceAll("�","")
    .replace(/[^a-z0-9]+/g, "");
}

function toNumber(v){
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function isNumericTalla(t){
  return /^[0-9]+$/.test(String(t).trim());
}

function sortTallas(list){
  const arr = [...new Set(list.map(x => String(x).trim()).filter(Boolean))];

  const norm = (s)=> normalizeKey(s);
  const isUnico = (s)=> {
    const n = norm(s);
    return n === "unico" || n === "u" || n === "unica";
  };

  arr.sort((a,b)=>{
    const au = isUnico(a), bu = isUnico(b);
    if (au && !bu) return 1;
    if (!au && bu) return -1;

    const an=isNumericTalla(a), bn=isNumericTalla(b);
    if (an && bn) return Number(a)-Number(b);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.localeCompare(b, "es");
  });

  return arr;
}

/* ===================== CSV genérico (pivot) ===================== */
function parseCSV(text){
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l => l.trim().length>0);
  if (!lines.length) return [];

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ";" && !inQ){
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(x => x.trim().replace(/^"|"$/g,""));
  };

  const header = parseLine(lines[0]).map(h => h.trim());
  const idx = new Map();
  header.forEach((h,i)=> idx.set(normalizeKey(h), i));

  const pickIdx = (...names) => {
    for (const n of names){
      const k = normalizeKey(n);
      if (idx.has(k)) return idx.get(k);
    }
    return -1;
  };

  const iNombre = pickIdx("Nombre");
  const iGrupo  = pickIdx("Grupo");
  const iTalla  = pickIdx("Talla");
  const iNuevo  = pickIdx("Stock Nuevo");
  const iUsado  = pickIdx("Stock Alquiler", "Stock Usado", "Usado");
  const iAlm    = pickIdx("Almacén", "Almacen", "Almac�n");

  const need = {iNombre,iGrupo,iTalla,iNuevo,iUsado,iAlm};
  if (Object.values(need).some(v => v < 0)){
    throw new Error("El CSV no tiene las columnas necesarias: Nombre, Grupo, Talla, Stock Nuevo, Stock Alquiler/Usado, Almacén.");
  }

  const rows = [];
  for (let li=1; li<lines.length; li++){
    const cols = parseLine(lines[li]);
    rows.push({
      Nombre: cols[iNombre] ?? "",
      Grupo: cols[iGrupo] ?? "",
      Talla: String(cols[iTalla] ?? "").trim(),
      StockNuevo: toNumber(cols[iNuevo]),
      StockUsado: toNumber(cols[iUsado]),
      Almacen: cols[iAlm] ?? ""
    });
  }
  return rows;
}

/* ====== Checklist utils ====== */
function fillChecklist(boxId, values, checked=true){
  const box = $(boxId);
  if (!box) return;
  box.innerHTML = "";
  values.forEach(v=>{
    const lbl = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = String(v);
    cb.checked = checked;
    lbl.appendChild(cb);
    lbl.append(" " + v);
    box.appendChild(lbl);
  });
}

function selectedChecklist(boxId){
  return Array.from(document.querySelectorAll(`#${boxId} input:checked`)).map(cb => cb.value);
}

function applySearchToChecklist(searchId, boxId){
  const q = (($(searchId)?.value) || "").toLowerCase();
  document.querySelectorAll(`#${boxId} label`).forEach(lbl=>{
    const txt = lbl.textContent.toLowerCase();
    lbl.style.display = (!q || txt.includes(q)) ? "" : "none";
  });
}

function setAll(boxId, val){
  document.querySelectorAll(`#${boxId} input[type=checkbox]`).forEach(cb=>cb.checked=val);
}

/* ====== Pivot ====== */
function buildPivot(rows){
  const map = new Map();
  const tallas = sortTallas(rows.map(r => r.Talla));

  for (const r of rows){
    const key = `${r.Nombre}||${r.Grupo}||${r.Almacen}`;
    if (!map.has(key)){
      map.set(key, {
        Nombre: r.Nombre,
        Grupo: r.Grupo,
        Almacen: r.Almacen,
        byTallaNuevo: new Map(),
        byTallaUsado: new Map()
      });
    }
    const item = map.get(key);
    item.byTallaNuevo.set(r.Talla, (item.byTallaNuevo.get(r.Talla) ?? 0) + r.StockNuevo);
    item.byTallaUsado.set(r.Talla, (item.byTallaUsado.get(r.Talla) ?? 0) + r.StockUsado);
  }

  return { items: [...map.values()], tallas };
}

function rowTotal(mapTalla){
  let t = 0;
  for (const v of mapTalla.values()) t += Number(v) || 0;
  return t;
}

function fmtCell(v, hideZeros){
  const n = Number(v) || 0;
  if (hideZeros && n === 0) return "";
  return Number.isInteger(n) ? String(n) : String(n);
}

function tdLeft(text, muted=false){
  const td=document.createElement("td");
  td.textContent = text;
  td.classList.add("left");
  if (muted) td.classList.add("muted");
  return td;
}
function tdCenter(text, muted=false){
  const td=document.createElement("td");
  td.textContent = text;
  if (muted) td.classList.add("muted");
  return td;
}
function tdTipo(text){
  const td=document.createElement("td");
  td.textContent = text;
  td.classList.add("tipo");
  return td;
}
function tdTotal(text){
  const td=document.createElement("td");
  td.textContent = text;
  td.classList.add("total");
  return td;
}

function makeTablePivot(pivot, opts){
  const { hideZeros, hideEmptyRows } = opts;
  const { items, tallas } = pivot;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const headCells = ["Nombre","Grupo","Almacén","Tipo", ...tallas, "Total"];
  headCells.forEach((h,idx)=>{
    const th=document.createElement("th");
    th.textContent = h;
    if (idx <= 2) th.classList.add("left");
    if (h==="Total") th.classList.add("total");
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  let alt = false;
  for (const it of items){
    const totalN = rowTotal(it.byTallaNuevo);
    const totalU = rowTotal(it.byTallaUsado);

    const hasN = tallas.some(t => (Number(it.byTallaNuevo.get(t)) || 0) !== 0);
    const hasU = tallas.some(t => (Number(it.byTallaUsado.get(t)) || 0) !== 0);

    const paintN = hideEmptyRows ? hasN : true;
    const paintU = hideEmptyRows ? hasU : true;

    if (!paintN && !paintU) continue;

    if (paintN){
      const tr = document.createElement("tr");
      if (alt) tr.classList.add("alt");
      tr.appendChild(tdLeft(it.Nombre));
      tr.appendChild(tdLeft(it.Grupo));
      tr.appendChild(tdCenter(it.Almacen));
      tr.appendChild(tdTipo("Nuevo"));
      for (const t of tallas){
        tr.appendChild(tdCenter(fmtCell(it.byTallaNuevo.get(t) ?? 0, hideZeros)));
      }
      tr.appendChild(tdTotal(fmtCell(totalN, hideZeros)));
      tbody.appendChild(tr);
    }

    if (paintU){
      const tr = document.createElement("tr");
      if (alt) tr.classList.add("alt");
      tr.appendChild(tdLeft("", true));
      tr.appendChild(tdLeft("", true));
      tr.appendChild(tdCenter("", true));
      tr.appendChild(tdTipo("Usado"));
      for (const t of tallas){
        tr.appendChild(tdCenter(fmtCell(it.byTallaUsado.get(t) ?? 0, hideZeros)));
      }
      tr.appendChild(tdTotal(fmtCell(totalU, hideZeros)));
      tbody.appendChild(tr);
    }

    alt = !alt;
  }

  table.appendChild(tbody);
  return table;
}

function makeSummary(rows, opts){
  const { hideZeros } = opts;

  const map = new Map();
  for (const r of rows){
    const key = `${r.Nombre}||${r.Grupo}||${r.Almacen}`;
    if (!map.has(key)){
      map.set(key, {Nombre:r.Nombre, Grupo:r.Grupo, Almacen:r.Almacen, Nuevo:0, Usado:0});
    }
    const it = map.get(key);
    it.Nuevo += r.StockNuevo;
    it.Usado += r.StockUsado;
  }

  const items = [...map.values()].sort((a,b)=> (a.Grupo+a.Nombre).localeCompare(b.Grupo+b.Nombre, "es"));
  let grandN=0, grandU=0;

  const table=document.createElement("table");
  const thead=document.createElement("thead");
  const trh=document.createElement("tr");
  ["Nombre","Grupo","Almacén","Tipo","Stock"].forEach((h,idx)=>{
    const th=document.createElement("th");
    th.textContent=h;
    if (idx<=2) th.classList.add("left");
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody=document.createElement("tbody");
  let alt=false;

  for (const it of items){
    grandN += it.Nuevo;
    grandU += it.Usado;

    const nTxt = fmtCell(it.Nuevo, hideZeros);
    const uTxt = fmtCell(it.Usado, hideZeros);

    if (nTxt !== ""){
      const tr=document.createElement("tr");
      if (alt) tr.classList.add("alt");
      tr.appendChild(tdLeft(it.Nombre));
      tr.appendChild(tdLeft(it.Grupo));
      tr.appendChild(tdCenter(it.Almacen));
      tr.appendChild(tdTipo("Nuevo"));
      tr.appendChild(tdCenter(nTxt));
      tbody.appendChild(tr);
    }
    if (uTxt !== ""){
      const tr=document.createElement("tr");
      if (alt) tr.classList.add("alt");
      tr.appendChild(tdLeft("", true));
      tr.appendChild(tdLeft("", true));
      tr.appendChild(tdCenter("", true));
      tr.appendChild(tdTipo("Usado"));
      tr.appendChild(tdCenter(uTxt));
      tbody.appendChild(tr);
    }

    alt=!alt;
  }

  const trSep=document.createElement("tr");
  for(let i=0;i<5;i++) trSep.appendChild(document.createElement("td"));
  tbody.appendChild(trSep);

  const trTN=document.createElement("tr");
  trTN.appendChild(tdLeft("TOTAL"));
  trTN.appendChild(tdLeft(""));
  trTN.appendChild(tdCenter(""));
  trTN.appendChild(tdTipo("Nuevo"));
  trTN.appendChild(tdTotal(fmtCell(grandN, hideZeros)));
  tbody.appendChild(trTN);

  const trTU=document.createElement("tr");
  trTU.appendChild(tdLeft(""));
  trTU.appendChild(tdLeft(""));
  trTU.appendChild(tdCenter(""));
  trTU.appendChild(tdTipo("Usado"));
  trTU.appendChild(tdTotal(fmtCell(grandU, hideZeros)));
  tbody.appendChild(trTU);

  table.appendChild(tbody);
  return table;
}

function renderVacio(){
  $("tableWrap").innerHTML = "";
  $("summaryWrap").innerHTML = "";
  $("meta").textContent = "Filas: 0 | Artículos: 0 | Tallas: 0";
}

function applyFilters(){
  const q = ($("qNombre")?.value || "").trim().toLowerCase();

  const gruposSel = selectedChecklist("fGrupoList");
  const gTxt = ($("fGrupoSearch")?.value || "").trim().toLowerCase();

  const aSel = selectedChecklist("fAlmacenList");
  const aTxt = ($("fAlmacenSearch")?.value || "").trim().toLowerCase();

  const totalGrupos = document.querySelectorAll("#fGrupoList input").length;
  const totalAlm    = document.querySelectorAll("#fAlmacenList input").length;
  if (totalGrupos > 0 && gruposSel.length === 0) { renderVacio(); return; }
  if (totalAlm > 0 && aSel.length === 0) { renderVacio(); return; }

  const filtered = state.rows.filter(r=>{
    if (q && !String(r.Nombre).toLowerCase().includes(q)) return false;
    if (gruposSel.length && !gruposSel.includes(String(r.Grupo))) return false;
    if (gTxt && !String(r.Grupo).toLowerCase().includes(gTxt)) return false;
    if (aSel.length && !aSel.includes(String(r.Almacen))) return false;
    if (aTxt && !String(r.Almacen).toLowerCase().includes(aTxt)) return false;
    return true;
  });

  const opts = {
    hideZeros: $("hideZeros").checked,
    hideEmptyRows: $("hideEmptyRows").checked
  };

  const pivot = buildPivot(filtered);

  $("tableWrap").innerHTML = "";
  $("tableWrap").appendChild(makeTablePivot(pivot, opts));

  $("summaryWrap").innerHTML = "";
  $("summaryWrap").appendChild(makeSummary(filtered, opts));

  $("meta").textContent = `Filas: ${filtered.length} | Artículos: ${pivot.items.length} | Tallas: ${pivot.tallas.length}`;
}

/* ===================== Conciliación ===================== */

function parseVelneoCSV(text){
  const lines = text
    .replace(/\r\n/g,"\n").replace(/\r/g,"\n")
    .split("\n")
    .filter(l => l.trim().length > 0);

  if (!lines.length) return [];

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i=0;i<line.length;i++){
      const ch = line[i];
      if (ch === '"'){
        if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ";" && !inQ){
        out.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map(x => x.trim().replace(/^"|"$/g,""));
  };

  const header = parseLine(lines[0]).map(h => h.trim());
  const idx = new Map();
  header.forEach((h,i)=> idx.set(normalizeKey(h), i));

  const pickIdx = (...names) => {
    for (const n of names){
      const k = normalizeKey(n);
      if (idx.has(k)) return idx.get(k);
    }
    return -1;
  };

  const iConcepto = pickIdx("Concepto");
  const iDesc     = pickIdx("Descripcion", "Descripción", "Descripci�n");
  const iTalla    = pickIdx("Talla");
  const iEAN      = pickIdx("EAN", "Talla -> Código de barras", "Talla -> C�digo de barras");
  const iNuevo    = pickIdx("Stock Nuevo");
  const iAlq      = pickIdx("Stock Alquiler", "Stock Usado");
  const iAlm      = pickIdx("Almacén", "Almacen", "Almac�n");

  const need = {iConcepto,iDesc,iTalla,iEAN,iNuevo,iAlq,iAlm};
  if (Object.values(need).some(v => v < 0)){
    throw new Error("CSV Velneo: faltan columnas. Necesito Concepto, Descripcion, Talla, EAN, Stock Nuevo, Stock Alquiler, Almacen.");
  }

  const out = [];
  for (let li=1; li<lines.length; li++){
    const cols = parseLine(lines[li]);

    const concepto = String(cols[iConcepto] ?? "").trim();
    const descripcion = String(cols[iDesc] ?? "").trim();
    const talla = String(cols[iTalla] ?? "").trim();
    const ean = String(cols[iEAN] ?? "").trim();
    const almacen = String(cols[iAlm] ?? "").trim();

    if (!ean) continue;

    out.push({
      EAN: ean,
      Concepto: concepto,
      Descripcion: descripcion,
      Talla: talla,
      StockNuevo: toNumber(cols[iNuevo]),
      StockUsado: toNumber(cols[iAlq]),
      Almacen: almacen
    });
  }

  return out;
}

function parseTiendasCSV(text){
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).filter(l=>l.trim()).map(l=>{
    const [fecha,sesion,tienda,uso,concepto,descripcion,talla,unidades,ean] = l.split(";");
    return {
      tienda: String(tienda ?? "").trim(),
      uso: String(uso ?? "").trim(),
      talla: String(talla ?? "").trim(),
      unidades: toNumber(unidades),
      ean: String(ean ?? "").trim()
    };
  });
}

/* ====== ✅ Persistencia checks (localStorage) ====== */
const LS_OK_PREFIX = "conc_ok_v3::";

function currentDest(){
  return String($("cAlmacenDestino")?.value || "").trim();
}

function stableRowId(r){
  const dest = currentDest();
  const ean = String(r?.EAN ?? "").trim();
  const uso = String(r?.Uso ?? "").trim();
  const alm = String(r?.Almacen ?? "").trim();
  const con = String(r?.Concepto ?? "").trim();
  const des = String(r?.Descripcion ?? "").trim();
  const tal = String(r?.Talla ?? r?.Tallas ?? "").trim();
  return [dest, ean, con, des, alm, uso, tal].join("||");
}
function okKey(r){ return LS_OK_PREFIX + stableRowId(r); }
function isOk(r){
  try { return localStorage.getItem(okKey(r)) === "1"; }
  catch { return false; }
}
function setOk(r, val){
  try{
    const k = okKey(r);
    if (val) localStorage.setItem(k, "1");
    else localStorage.removeItem(k);
  }catch{}
}
function clearAllOk(){
  try{
    const keys = [];
    for (let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_OK_PREFIX)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }catch{}
}

/* ====== Botonera checks ====== */
function ensureConcButtons(){
  const meta = $("cMeta");
  if (!meta) return;
  if ($("btnConcMarkAll") || $("btnConcClearAll")) return;

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "8px";
  wrap.style.flexWrap = "wrap";
  wrap.style.marginTop = "8px";

  const b1 = document.createElement("button");
  b1.id = "btnConcMarkAll";
  b1.type = "button";
  b1.className = "btn secondary";
  b1.textContent = "✅ Marcar todas (visibles)";
  b1.addEventListener("click", ()=>{
    const rows = state.concViewRows || [];
    rows.forEach(r => setOk(r, true));
    applyConciliacionViewFilters();
  });

  const b2 = document.createElement("button");
  b2.id = "btnConcClearAll";
  b2.type = "button";
  b2.className = "btn secondary";
  b2.textContent = "🧹 Limpiar checks (todos)";
  b2.addEventListener("click", ()=>{
    if (!confirm("¿Seguro que quieres borrar todos los checks guardados?")) return;
    clearAllOk();
    applyConciliacionViewFilters();
  });

  wrap.appendChild(b1);
  wrap.appendChild(b2);
  meta.parentElement?.appendChild(wrap);
}

/* ====== Render tabla conciliación ====== */
function renderTablaConciliacion(rows){
  const wrap = $("conciliacionWrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  if(!rows || !rows.length){
    wrap.textContent = "Sin diferencias.";
    return;
  }

  const get = (r, ...keys)=>{
    for (const k of keys){
      if (r && r[k] !== undefined && r[k] !== null) return r[k];
    }
    return "";
  };

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const headers = ["Uso","Descripcion","Almacen","Tallas","Concepto","CSV Velneo","CSV Tiendas","Total Stock Velneo","✅"];
  headers.forEach(h=>{
    const th=document.createElement("th");
    th.textContent=h;
    trh.appendChild(th);
  });

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody=document.createElement("tbody");

  rows.forEach((r, idx)=>{
    const tr=document.createElement("tr");
    if (idx % 2 === 1) tr.classList.add("alt");

    const uso = get(r, "Uso");
    const des = get(r, "Descripcion", "Descripción", "Descripci�n");
    const alm = get(r, "Almacen", "Almacén");
    const tal = get(r, "Talla", "Tallas");
    const con = get(r, "Concepto");
    const vVel = get(r, "CSVVelneo", "CSV Velneo");
    const vTie = get(r, "CSVTiendas", "CSV Tiendas");
    const vTot = get(r, "TotalStockVelneo", "Total", "Total Stock Velneo");

    const values = [uso, des, alm, tal, con, vVel, vTie, vTot];

    values.forEach(v=>{
      const td=document.createElement("td");
      td.textContent = v ?? "";
      tr.appendChild(td);
    });

    const tdOk = document.createElement("td");
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.title = "Marcar como revisado";
    chk.style.transform = "scale(1.15)";
    chk.checked = isOk(r);

    const applyRowOkStyle = ()=>{
      tr.style.opacity = chk.checked ? "0.55" : "";
    };
    applyRowOkStyle();

    chk.addEventListener("change", ()=>{
      setOk(r, chk.checked);
      applyRowOkStyle();
    });

    tdOk.appendChild(chk);
    tr.appendChild(tdOk);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
}

/* ====== Filtros vista conciliación ====== */
function applyConciliacionViewFilters(){
  const q = ($("cQ")?.value || "").trim().toLowerCase();
  const qConcepto = ($("cConcepto")?.value || "").trim().toLowerCase();
  const soloDif = !!$("cSoloDif")?.checked;
  const usoSel = String($("cUso")?.value || "").trim();

  let rows = state.concAll || [];

  if (qConcepto){
    rows = rows.filter(r => String(r.Concepto ?? "").toLowerCase().includes(qConcepto));
  }

  if (q){
    rows = rows.filter(r=>{
      const c = String(r.Concepto ?? "").toLowerCase();
      const d = String(r.Descripcion ?? "").toLowerCase();
      return c.includes(q) || d.includes(q);
    });
  }

  if (soloDif){
    rows = rows.filter(r => Number(r.TotalStockVelneo || 0) !== 0);
  }

  if (usoSel){
    rows = rows.filter(r => String(r.Uso) === usoSel);
  }

  state.concViewRows = [...rows];
  setText("cMeta", `Líneas: ${rows.length} (Total generadas: ${(state.concAll||[]).length})`);
  renderTablaConciliacion(rows);
}

/* ====== Mappings por uso ====== */
function buildMappingsForConciliacion(destAlmacen){
  const selTiendas = selectedChecklist("cTiendaList").map(t => String(t).trim().toLowerCase());

  const mapNuevo = {};
  const mapUsado = {};
  const ruleExcludeCentralFromNuevo = (String(destAlmacen).trim() === "34");

  selTiendas.forEach(tienda=>{
    const t = String(tienda).trim().toLowerCase();
    mapUsado[t] = String(destAlmacen);
    if (ruleExcludeCentralFromNuevo && t === "central") return;
    mapNuevo[t] = String(destAlmacen);
  });

  return { nuevo: mapNuevo, usado: mapUsado };
}

function runConciliacion(){
  if (typeof generarConciliacion !== "function"){
    alert("Falta cargar modules/conciliacion.js antes que app.js");
    return;
  }
  if (!state.velneo.length){
    alert("Carga primero el CSV de Velneo.");
    return;
  }
  if (!state.tiendas.length){
    alert("Carga primero los CSV de Tiendas.");
    return;
  }

  const dest = currentDest();
  if (!dest){
    alert("Selecciona Almacén destino (Velneo).");
    return;
  }

  const totalTiendas = document.querySelectorAll("#cTiendaList input").length;
  const tiendasSel = selectedChecklist("cTiendaList");
  if (totalTiendas > 0 && tiendasSel.length === 0){
    alert("Selecciona al menos una tienda para sumar.");
    return;
  }

  const velneoFiltrado = state.velneo.filter(r => String(r.Almacen).trim() === dest);
  const mappingAlmacenes = buildMappingsForConciliacion(dest);

  const res = generarConciliacion({
    velneoRows: velneoFiltrado,
    tiendasRows: state.tiendas,
    mappingAlmacenes
  });

  state.concAll = res;
  applyConciliacionViewFilters();
}

function fillConcAlmacenDestinoOptions(almacenesVelneo){
  const sel = $("cAlmacenDestino");
  if (!sel) return;

  sel.innerHTML = "";
  almacenesVelneo.forEach(a=>{
    const o=document.createElement("option");
    o.value = String(a);
    o.textContent = String(a);
    sel.appendChild(o);
  });

  if (sel.options.length && !sel.value) {
    sel.value = sel.options[0].value;
  }
}

function fillConcTiendasChecklistFromData(){
  const tiendas = [...new Set(state.tiendas.map(r=>String(r.tienda).trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"es"));
  state.concTiendasList = tiendas;
  fillChecklist("cTiendaList", tiendas, true);
  applySearchToChecklist("cTiendaSearch", "cTiendaList");
}

function applyPreset(destAlmacen, tiendasList){
  const sel = $("cAlmacenDestino");
  if (sel) sel.value = String(destAlmacen);

  const wanted = new Set(tiendasList.map(v=>String(v).trim().toLowerCase()));
  document.querySelectorAll("#cTiendaList input[type=checkbox]").forEach(cb=>{
    cb.checked = wanted.has(String(cb.value).trim().toLowerCase());
  });

  applySearchToChecklist("cTiendaSearch", "cTiendaList");
}

function setupUI(){
  $("file")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;

    const text = await f.text();
    try{
      const rows = parseCSV(text);
      state.rows = rows;

      state.grupos = [...new Set(rows.map(r=>r.Grupo))].sort((a,b)=>a.localeCompare(b,"es"));
      state.almacenes = [...new Set(rows.map(r=>String(r.Almacen)))].sort((a,b)=>a.localeCompare(b,"es"));

      fillChecklist("fGrupoList", state.grupos, true);
      fillChecklist("fAlmacenList", state.almacenes, true);

      applySearchToChecklist("fGrupoSearch", "fGrupoList");
      applySearchToChecklist("fAlmacenSearch", "fAlmacenList");

      $("meta").textContent = `Archivo: ${f.name} | Filas: ${rows.length}`;
      applyFilters();
    }catch(err){
      alert(err?.message ?? String(err));
    }
  });

  $("fGrupoSearch")?.addEventListener("input", ()=>{ applySearchToChecklist("fGrupoSearch","fGrupoList"); applyFilters(); });
  $("fAlmacenSearch")?.addEventListener("input", ()=>{ applySearchToChecklist("fAlmacenSearch","fAlmacenList"); applyFilters(); });
  $("fGrupoList")?.addEventListener("change", applyFilters);
  $("fAlmacenList")?.addEventListener("change", applyFilters);

  $("btnGrupoAll")?.addEventListener("click", ()=>{ setAll("fGrupoList", true); applyFilters(); });
  $("btnGrupoNone")?.addEventListener("click", ()=>{ setAll("fGrupoList", false); applyFilters(); });
  $("btnAlmAll")?.addEventListener("click", ()=>{ setAll("fAlmacenList", true); applyFilters(); });
  $("btnAlmNone")?.addEventListener("click", ()=>{ setAll("fAlmacenList", false); applyFilters(); });

  ["qNombre","hideZeros","hideEmptyRows"].forEach(id=>{
    $(id)?.addEventListener("input", applyFilters);
    $(id)?.addEventListener("change", applyFilters);
  });

  $("btnReset")?.addEventListener("click", ()=>{
    $("qNombre").value="";
    $("fGrupoSearch").value="";
    $("fAlmacenSearch").value="";
    setAll("fGrupoList", true);
    setAll("fAlmacenList", true);
    applySearchToChecklist("fGrupoSearch","fGrupoList");
    applySearchToChecklist("fAlmacenSearch","fAlmacenList");
    $("hideZeros").checked=true;
    $("hideEmptyRows").checked=true;
    applyFilters();
  });

  $("btnPrint")?.addEventListener("click", ()=> window.print());

  $("fileVelneo")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;

    try{
      state.velneo = parseVelneoCSV(await f.text());

      const almacenesVelneo = [...new Set(state.velneo.map(r=>String(r.Almacen)).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b,"es"));

      fillConcAlmacenDestinoOptions(almacenesVelneo);
      setText("cMeta", `Velneo cargado: ${state.velneo.length} filas | Almacenes: ${almacenesVelneo.join(", ")}`);
      ensureConcButtons();
    }catch(err){
      state.velneo = [];
      alert(err?.message ?? String(err));
    }
  });

  $("fileTiendas")?.addEventListener("change", async (e)=>{
    state.tiendas = [];
    const files = Array.from(e.target.files || []);
    for(const f of files){
      state.tiendas.push(...parseTiendasCSV(await f.text()));
    }
    fillConcTiendasChecklistFromData();
    setText("cMeta", `Tiendas cargadas: ${state.tiendas.length} filas | Tiendas: ${state.concTiendasList.join(", ")}`);
    ensureConcButtons();
  });

  $("cQ")?.addEventListener("input", applyConciliacionViewFilters);
  $("cSoloDif")?.addEventListener("change", applyConciliacionViewFilters);
  $("cUso")?.addEventListener("change", applyConciliacionViewFilters);
  $("cConcepto")?.addEventListener("input", applyConciliacionViewFilters);
  $("cAlmacenDestino")?.addEventListener("change", applyConciliacionViewFilters);

  $("cTiendaSearch")?.addEventListener("input", ()=> applySearchToChecklist("cTiendaSearch","cTiendaList"));
  $("cTiendaAll")?.addEventListener("click", ()=> setAll("cTiendaList", true));
  $("cTiendaNone")?.addEventListener("click", ()=> setAll("cTiendaList", false));

  $("btnPreset34")?.addEventListener("click", ()=> applyPreset("34", ["3","4","7","central"]));
  $("btnPreset1")?.addEventListener("click", ()=> applyPreset("1", ["1"]));

  $("btnConciliar")?.addEventListener("click", runConciliacion);

  ensureConcButtons();
}

document.addEventListener("DOMContentLoaded", setupUI);
