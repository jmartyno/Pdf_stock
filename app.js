// Stock por tallas: CSV local -> pivot con tallas en columnas + filtros + print

const $ = (id) => document.getElementById(id);

const state = {
  rows: [],
  tallas: [],
  grupos: [],
  almacenes: [],
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
  const arr = [...new Set(list.map(x => String(x).trim()))];
  arr.sort((a,b)=>{
    const an=isNumericTalla(a), bn=isNumericTalla(b);
    if (an && bn) return Number(a)-Number(b);
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return a.localeCompare(b, "es");
  });
  return arr;
}

function parseCSV(text){
  // Simple parser for ; separated CSV with optional quotes
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
      Almacen: cols[iAlm] ?? "",
    });
  }
  return rows;
}

function fillSelect(selectEl, values){
  selectEl.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "Todos";
  selectEl.appendChild(optAll);

  values.forEach(v=>{
    const o=document.createElement("option");
    o.value = v;
    o.textContent = v;
    selectEl.appendChild(o);
  });
}

function buildPivot(rows){
  // key: Nombre|Grupo|Almacen
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
  for (const v of mapTalla.values()) t += v;
  return t;
}

function fmtCell(v, hideZeros){
  if (hideZeros && (!v || v === 0)) return "";
  // enteros sin decimales
  if (Number.isInteger(v)) return String(v);
  return String(v);
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

    const hasN = totalN !== 0;
    const hasU = totalU !== 0;

    // si hideEmptyRows, no pintamos líneas con total 0
    const paintN = hideEmptyRows ? hasN : true;
    const paintU = hideEmptyRows ? hasU : true;

    if (!paintN && !paintU) continue;

    // Nuevo
    if (paintN){
      const tr = document.createElement("tr");
      if (alt) tr.classList.add("alt");
      tr.appendChild(tdLeft(it.Nombre));
      tr.appendChild(tdLeft(it.Grupo));
      tr.appendChild(tdCenter(it.Almacen));
      tr.appendChild(tdTipo("Nuevo"));
      for (const t of tallas){
        const v = it.byTallaNuevo.get(t) ?? 0;
        tr.appendChild(tdCenter(fmtCell(v, hideZeros)));
      }
      tr.appendChild(tdTotal(fmtCell(totalN, hideZeros)));
      tbody.appendChild(tr);
    }

    // Usado (segunda línea con nombre/grupo/almacén vacíos)
    if (paintU){
      const tr = document.createElement("tr");
      if (alt) tr.classList.add("alt");
      tr.appendChild(tdLeft("", true));
      tr.appendChild(tdLeft("", true));
      tr.appendChild(tdCenter("", true));
      tr.appendChild(tdTipo("Usado"));
      for (const t of tallas){
        const v = it.byTallaUsado.get(t) ?? 0;
        tr.appendChild(tdCenter(fmtCell(v, hideZeros)));
      }
      tr.appendChild(tdTotal(fmtCell(totalU, hideZeros)));
      tbody.appendChild(tr);
    }

    alt = !alt;
  }

  table.appendChild(tbody);
  return table;
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

function makeSummary(rows, opts){
  const { hideZeros } = opts;

  // Totales por (Nombre,Grupo,Almacen)
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
  const items = [...map.values()].sort((a,b)=>{
    return (a.Grupo+a.Nombre).localeCompare(b.Grupo+b.Nombre, "es");
  });

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

  // Totales finales
  const trSep=document.createElement("tr");
  trSep.appendChild(tdLeft(""));
  trSep.appendChild(tdLeft(""));
  trSep.appendChild(tdCenter(""));
  trSep.appendChild(tdCenter(""));
  trSep.appendChild(tdCenter(""));
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

function applyFilters(){
  const q = $("qNombre").value.trim().toLowerCase();
  const g = $("fGrupo").value;
  const a = $("fAlmacen").value;

  const filtered = state.rows.filter(r=>{
    if (q && !String(r.Nombre).toLowerCase().includes(q)) return false;
    if (g && r.Grupo !== g) return false;
    if (a && String(r.Almacen) !== a) return false;
    return true;
  });

  const opts = {
    hideZeros: $("hideZeros").checked,
    hideEmptyRows: $("hideEmptyRows").checked
  };

  const pivot = buildPivot(filtered);

  // render pivot
  const wrap = $("tableWrap");
  wrap.innerHTML = "";
  wrap.appendChild(makeTablePivot(pivot, opts));

  // render summary
  const sw = $("summaryWrap");
  sw.innerHTML = "";
  sw.appendChild(makeSummary(filtered, opts));

  $("meta").textContent = `Filas: ${filtered.length} | Artículos: ${pivot.items.length} | Tallas: ${pivot.tallas.length}`;
}

function setupUI(){
  $("file").addEventListener("change", async (e)=>{
    const f = e.target.files?.[0];
    if (!f) return;

    // read as text (browser handles encodings fairly well; latin1/utf-8 depends on file)
    const text = await f.text();

    try{
      const rows = parseCSV(text);
      state.rows = rows;

      state.grupos = [...new Set(rows.map(r=>r.Grupo))].sort((a,b)=>a.localeCompare(b,"es"));
      state.almacenes = [...new Set(rows.map(r=>String(r.Almacen)))].sort((a,b)=>a.localeCompare(b,"es"));

      fillSelect($("fGrupo"), state.grupos);
      fillSelect($("fAlmacen"), state.almacenes);

      $("meta").textContent = `Archivo: ${f.name} | Filas: ${rows.length}`;
      applyFilters();
    }catch(err){
      alert(err?.message ?? String(err));
    }
  });

  ["qNombre","fGrupo","fAlmacen","hideZeros","hideEmptyRows"].forEach(id=>{
    $(id).addEventListener("input", applyFilters);
    $(id).addEventListener("change", applyFilters);
  });

  $("btnReset").addEventListener("click", ()=>{
    $("qNombre").value="";
    $("fGrupo").value="";
    $("fAlmacen").value="";
    $("hideZeros").checked=true;
    $("hideEmptyRows").checked=true;
    applyFilters();
  });

  $("btnPrint").addEventListener("click", ()=>{
    window.print();
  });
}

setupUI();
