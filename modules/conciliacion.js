// modules/conciliacion.js
// Conciliación Velneo vs CSV Tiendas
// Salida: filas para tabla (EAN, Concepto, Descripcion, Almacen, Uso, Tallas, Total)

(function(){

  function norm(v){ return String(v ?? "").trim(); }

  function key(ean, talla, almacen){
    return `${norm(ean)}||${norm(talla)}||${norm(almacen)}`;
  }

  function add(map, k, field, val){
    if(!map.has(k)) map.set(k, { nuevo:0, usado:0 });
    map.get(k)[field] += (Number(val) || 0);
  }

  function tallaNum(t){
    const s = String(t||"");
    const low = s.trim().toLowerCase();
    if (["unico","único","u","unica","única"].includes(low)) return 999999;
    const m = s.match(/\d+/);
    return m ? Number(m[0]) : 999998;
  }

  // ✅ ahora "Tallas" será SOLO la talla (sin ":unidades")
  function tallasToOnlyTalla(mapTalla){
    const entries = [...mapTalla.entries()]
      .map(([t,v]) => [String(t).trim(), Number(v)||0])
      .filter(([,v]) => v !== 0);

    // orden asc
    entries.sort(([ta],[tb]) => tallaNum(ta) - tallaNum(tb));

    // si hay varias tallas, las separo por espacio (igual que antes)
    return entries.map(([t]) => t).join(" ");
  }

  window.generarConciliacion = function({
    velneoRows,
    tiendasRows,
    mappingAlmacenes  // { nuevo:{tienda->alm}, usado:{tienda->alm} }
  }){

    const mapNuevo = (mappingAlmacenes && mappingAlmacenes.nuevo) ? mappingAlmacenes.nuevo : {};
    const mapUsado = (mappingAlmacenes && mappingAlmacenes.usado) ? mappingAlmacenes.usado : {};

    // 1) Velneo -> Map por (EAN,talla,almacen) con nuevo/usado
    const velneo = new Map();
    const metaByEAN = new Map(); // ean -> {concepto, descripcion}

    velneoRows.forEach(r=>{
      const ean = norm(r.EAN);
      if (!ean) return;

      const almacen = norm(r.Almacen);
      const talla = norm(r.Talla);
      const k = key(ean, talla, almacen);

      add(velneo, k, "nuevo", r.StockNuevo);
      add(velneo, k, "usado", r.StockUsado);

      if(!metaByEAN.has(ean)){
        metaByEAN.set(ean, {
          concepto: norm(r.Concepto),
          descripcion: norm(r.Descripcion)
        });
      }
    });

    // 2) Tiendas -> Map por (EAN,talla,almacenDestino) con nuevo/usado
    const tiendas = new Map();

    tiendasRows.forEach(r=>{
      const tienda = norm(r.tienda).toLowerCase();
      const uso = norm(r.uso).toUpperCase();   // "NUEVO" / "USADO"
      const isNuevo = (uso === "NUEVO");

      const almacenDestino = isNuevo ? mapNuevo[tienda] : mapUsado[tienda];
      if(!almacenDestino) return;

      const ean = norm(r.ean);
      if (!ean) return;

      const talla = norm(r.talla);
      const k = key(ean, talla, almacenDestino);

      const field = isNuevo ? "nuevo" : "usado";
      add(tiendas, k, field, r.unidades);
    });

    // 3) Agrupar por (EAN, almacen, uso) con tallas
    const group = new Map(); // GK -> {ean, concepto, descripcion, almacen, uso, V,T,D maps}

    function gkey(ean, almacen, uso){
      return `${ean}||${almacen}||${uso}`;
    }

    const allKeys = new Set([...velneo.keys(), ...tiendas.keys()]);

    allKeys.forEach(k=>{
      const [ean, talla, almacen] = k.split("||");
      const m = metaByEAN.get(ean);
      if(!m) return;

      const v = velneo.get(k) || {nuevo:0, usado:0};
      const t = tiendas.get(k) || {nuevo:0, usado:0};

      ["nuevo","usado"].forEach(uso=>{
        const V = Number(v[uso] || 0);
        const T = Number(t[uso] || 0);
        const D = V - T;

        const GK = gkey(ean, almacen, uso);
        if(!group.has(GK)){
          group.set(GK, {
            ean,
            concepto: m.concepto,
            descripcion: m.descripcion,
            almacen,
            uso: (uso === "nuevo" ? "Nuevo" : "Usado"), // ✅ CLAVE: vuelve a salir Uso
            V: new Map(),
            T: new Map(),
            D: new Map()
          });
        }
        const it = group.get(GK);

        if (V !== 0) it.V.set(talla, (it.V.get(talla) || 0) + V);
        if (T !== 0) it.T.set(talla, (it.T.get(talla) || 0) + T);
        if (D !== 0) it.D.set(talla, (it.D.get(talla) || 0) + D);
      });
    });

    function sumMap(m){
      let s=0; for(const v of m.values()) s += Number(v)||0;
      return s;
    }

    const resultado = [];

    for(const it of group.values()){
      const totalV = sumMap(it.V);
      const totalT = sumMap(it.T);
      const totalD = sumMap(it.D);

      if (totalV !== 0){
        resultado.push({
          EAN: it.ean,
          Concepto: it.concepto,
          Descripcion: it.descripcion,
          Almacen: it.almacen,
          Uso: it.uso,
          Tallas: tallasToOnlyTalla(it.V),   // ✅ solo talla
          Total: totalV
        });
      }
      if (totalT !== 0){
        resultado.push({
          EAN: it.ean,
          Concepto: it.concepto,
          Descripcion: it.descripcion,
          Almacen: "CSV",
          Uso: it.uso,
          Tallas: tallasToOnlyTalla(it.T),   // ✅ solo talla
          Total: totalT
        });
      }
      if (totalD !== 0){
        resultado.push({
          EAN: it.ean,
          Concepto: it.concepto,
          Descripcion: it.descripcion,
          Almacen: "Dif",
          Uso: it.uso,
          Tallas: tallasToOnlyTalla(it.D),   // ✅ solo talla
          Total: totalD
        });
      }
    }

    // Orden: Concepto/Desc/Uso, DIF/CSV/Velneo, y talla ASC
    resultado.sort((a,b)=>{
      const ak = `${a.Concepto} ${a.Descripcion} ${a.Uso}`;
      const bk = `${b.Concepto} ${b.Descripcion} ${b.Uso}`;
      if (ak !== bk) return ak.localeCompare(bk, "es");

      const prio = (x)=> x.Almacen==="Dif" ? 0 : (x.Almacen==="CSV" ? 1 : 2);
      const pa = prio(a), pb = prio(b);
      if (pa !== pb) return pa - pb;

      const ta = tallaNum(String(a.Tallas).split(/\s+/)[0] || "");
      const tb = tallaNum(String(b.Tallas).split(/\s+/)[0] || "");
      if (ta !== tb) return ta - tb;

      return String(a.EAN||"").localeCompare(String(b.EAN||""), "es");
    });

    return resultado;
  };

})();
