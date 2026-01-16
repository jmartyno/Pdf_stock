// Stock por tallas: CSV local -> pivot con tallas en columnas + filtros + print
const $ = (id) => document.getElementById(id);

const state = {
  rows: [],
  grupos: [],
  almacenes: [],

  velneo: [],
  tiendas: [],
  concAll: [],
  concTiendasList: []
};

function normalizeKey(s){
  return String(s ?? "").trim().toLowerCase()
    .replaceAll("á","a").replaceAll("é","e").replaceAll("í","i").replaceAll("ó","o").replaceAll("ú","u")
    .replaceAll("ñ","n");
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
    if (au && !bu) return 1;     // UNICO al final
    if (!au && bu) return -1;

    const an=isNumericTalla(a), bn=isNumericTalla(b);
    if (an && bn) return Number(a)-Number(b);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.localeCompare(b, "es");
  });

  return arr;
}

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
  const iEAN    = pickIdx("Talla -> Código de barras", "Talla -> C�digo de barras", "EAN", "ean");

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
      Almacen: cols[iAlm] ?? "",
      EAN: iEAN >= 0 ? (cols[iEAN] ?? "") : ""
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

/* ====== Conciliación ====== */

function parseVelneoCSV(text){
  const rows = parseCSV(text);
  return rows.map(r=>({
    EAN: r.EAN || r.ean || r["Talla -> Código de barras"] || r["Talla -> C�digo de barras"] || "",
    Concepto: r.Concepto ?? "",
    Descripcion: r.Descripcion ?? "",
    Talla: r.Talla ?? "",
    StockNuevo: toNumber(r.StockNuevo),
    StockUsado: toNumber(r.StockUsado),
    Almacen: String(r.Almacen ?? "").trim()
  }));
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

function renderTablaConciliacion(rows){
  const wrap = $("conciliacionWrap");
  wrap.innerHTML = "";

  if(!rows || !rows.length){
    wrap.textContent = "Sin diferencias.";
    return;
  }

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  ["Concepto","Descripcion","Almacen","Uso","Tallas","Total"].forEach(h=>{
    const th=document.createElement("th");
    th.textContent=h;
    trh.appendChild(th);
  });

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody=document.createElement("tbody");
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    ["Concepto","Descripcion","Almacen","Uso","Tallas","Total"].forEach(k=>{
      const td=document.createElement("td");
      td.textContent = r[k] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
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
}

function fillConcTiendasChecklistFromData(){
  const tiendas = [...new Set(state.tiendas.map(r=>String(r.tienda).trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"es"));
  state.concTiendasList = tiendas;
  fillChecklist("cTiendaList", tiendas, true);
  applySearchToChecklist("cTiendaSearch", "cTiendaList");
}

function applyConciliacionViewFilters(){
  const q = ($("cQ")?.value || "").trim().toLowerCase();
  const soloDif = !!$("cSoloDif")?.checked;

  let rows = state.concAll || [];

  if (q){
    rows = rows.filter(r=>{
      const c = String(r.Concepto ?? "").toLowerCase();
      const d = String(r.Descripcion ?? "").toLowerCase();
      return c.includes(q) || d.includes(q);
    });
  }
  if (soloDif){
    rows = rows.filter(r => r.Almacen === "Dif");
  }

  $("cMeta").textContent = `Líneas: ${rows.length} (Total generadas: ${(state.concAll||[]).length})`;
  renderTablaConciliacion(rows);
}

function buildMappingFromSelectedTiendas(destAlmacen){
  const selTiendas = selectedChecklist("cTiendaList");
  const map = {};
  selTiendas.forEach(t=>{ map[String(t)] = String(destAlmacen); });
  return map;
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

  const dest = String($("cAlmacenDestino")?.value || "").trim();
  if (!dest){
    alert("Selecciona Almacén destino (Velneo).");
    return;
  }

  const mappingAlmacenes = buildMappingFromSelectedTiendas(dest);
  const tiendasFiltradas = state.tiendas.filter(r => mappingAlmacenes[String(r.tienda).trim()] !== undefined);

  const velneoFiltrado = state.velneo.filter(r => String(r.Almacen).trim() === dest);

  const res = generarConciliacion({
    velneoRows: velneoFiltrado,
    tiendasRows: tiendasFiltradas,
    mappingAlmacenes
  });

  state.concAll = res;
  applyConciliacionViewFilters();
}

function applyPreset(destAlmacen, tiendasList){
  // set almacén destino
  const sel = $("cAlmacenDestino");
  if (sel) sel.value = String(destAlmacen);

  // marcar solo esas tiendas
  const wanted = new Set(tiendasList.map(String));
  document.querySelectorAll("#cTiendaList input[type=checkbox]").forEach(cb=>{
    cb.checked = wanted.has(String(cb.value));
  });

  applySearchToChecklist("cTiendaSearch", "cTiendaList");
}

function setupUI(){
  // Pivot CSV
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

  // Pivot listeners
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

  // Conciliación: cargar Velneo
  $("fileVelneo")?.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if(!f) return;
    state.velneo = parseVelneoCSV(await f.text());

    const almacenesVelneo = [...new Set(state.velneo.map(r=>String(r.Almacen)).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,"es"));
    fillConcAlmacenDestinoOptions(almacenesVelneo);

    $("cMeta").textContent = `Velneo cargado: ${state.velneo.length} filas | Almacenes: ${almacenesVelneo.join(", ")}`;
  });

  // Conciliación: cargar Tiendas (varios)
  $("fileTiendas")?.addEventListener("change", async (e)=>{
    state.tiendas = [];
    const files = Array.from(e.target.files || []);
    for(const f of files){
      state.tiendas.push(...parseTiendasCSV(await f.text()));
    }
    fillConcTiendasChecklistFromData();
    $("cMeta").textContent = `Tiendas cargadas: ${state.tiendas.length} filas | Tiendas detectadas: ${state.concTiendasList.join(", ")}`;
  });

  // Conciliación: filtros vista
  $("cQ")?.addEventListener("input", applyConciliacionViewFilters);
  $("cSoloDif")?.addEventListener("change", applyConciliacionViewFilters);

  // Tiendas checklist
  $("cTiendaSearch")?.addEventListener("input", ()=>{
    applySearchToChecklist("cTiendaSearch","cTiendaList");
  });
  $("cTiendaList")?.addEventListener("change", ()=>{ /* no recalcula, solo afecta al próximo conciliar */ });
  $("cTiendaAll")?.addEventListener("click", ()=>{ setAll("cTiendaList", true); });
  $("cTiendaNone")?.addEventListener("click", ()=>{ setAll("cTiendaList", false); });

  // Presets
  $("btnPreset34")?.addEventListener("click", ()=>{
    applyPreset("34", ["3","4","7"]);
  });
  $("btnPreset1")?.addEventListener("click", ()=>{
    applyPreset("1", ["1"]);
  });

  // Conciliar
  $("btnConciliar")?.addEventListener("click", runConciliacion);
}

setupUI();
