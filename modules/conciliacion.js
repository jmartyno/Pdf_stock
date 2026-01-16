// modules/conciliacion.js
// Conciliación Velneo vs CSV Tiendas
// Salida: filas para tabla (Concepto, Descripcion, Almacen, Uso, Tallas, Total)

(function(){

  function norm(v){ return String(v ?? "").trim(); }

  function key(ean, talla, almacen){
    return `${norm(ean)}||${norm(talla)}||${norm(almacen)}`;
  }

  function add(map, k, field, val){
    if(!map.has(k)) map.set(k, { nuevo:0, usado:0 });
    map.get(k)[field] += (Number(val) || 0);
  }

  // Convierte a string tipo: "44:-2 46:5 UNICO:1"
  function tallasToText(mapTalla){
    const pairs = [...mapTalla.entries()]
      .filter(([,v]) => (Number(v)||0) !== 0)
      .map(([t,v]) => `${t}:${v}`);
    return pairs.join(" ");
  }

  window.generarConciliacion = function({
    velneoRows,
    tiendasRows,
    mappingAlmacenes  // ej: { "3":"34", "4":"34", "7":"34" }
  }){

    // 1) Velneo -> Map por (EAN,talla,almacen) con nuevo/usado
    const velneo = new Map();
    const metaByEAN = new Map(); // {concepto, descripcion}

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
      const tienda = norm(r.tienda);
      const almacenDestino = mappingAlmacenes[tienda];
      if(!almacenDestino) return;

      const ean = norm(r.ean);
      if (!ean) return;

      const talla = norm(r.talla);
      const k = key(ean, talla, almacenDestino);

      const uso = norm(r.uso).toUpperCase();
      const field = (uso === "NUEVO") ? "nuevo" : "usado";

      add(tiendas, k, field, r.unidades);
    });

    // 3) Agregación final por (EAN, almacenDestino, uso) con tallas en mapa
    //    y sacamos 3 filas: Velneo / CSV / Dif
    const group = new Map(); // gkey -> {meta, uso, almacen, V:MapTalla, T:MapTalla, D:MapTalla}

    function gkey(ean, almacen, uso){
      return `${ean}||${almacen}||${uso}`;
    }

    const allKeys = new Set([...velneo.keys(), ...tiendas.keys()]);

    allKeys.forEach(k=>{
      const [ean, talla, almacen] = k.split("||");
      const m = metaByEAN.get(ean);
      if(!m) return; // si no existe en Velneo, no podemos poner concepto/desc

      const v = velneo.get(k) || {nuevo:0, usado:0};
      const t = tiendas.get(k) || {nuevo:0, usado:0};

      ["nuevo","usado"].forEach(uso=>{
        const V = Number(v[uso] || 0);
        const T = Number(t[uso] || 0);
        const D = V - T;

        const GK = gkey(ean, almacen, uso);
        if(!group.has(GK)){
          group.set(GK, {
            concepto: m.concepto,
            descripcion: m.descripcion,
            almacen: almacen,
            uso: (uso === "nuevo" ? "Nuevo" : "Usado"),
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

    // 4) Flatten
    const resultado = [];

    function sumMap(m){
      let s=0;
      for(const v of m.values()) s += Number(v)||0;
      return s;
    }

    for(const it of group.values()){
      const totalV = sumMap(it.V);
      const totalT = sumMap(it.T);
      const totalD = sumMap(it.D);

      if (totalV !== 0){
        resultado.push({
          Concepto: it.concepto,
          Descripcion: it.descripcion,
          Almacen: it.almacen,
          Uso: it.uso,
          Tallas: tallasToText(it.V),
          Total: totalV
        });
      }

      if (totalT !== 0){
        resultado.push({
          Concepto: it.concepto,
          Descripcion: it.descripcion,
          Almacen: "CSV",
          Uso: it.uso,
          Tallas: tallasToText(it.T),
          Total: totalT
        });
      }

      if (totalD !== 0){
        resultado.push({
          Concepto: it.concepto,
          Descripcion: it.descripcion,
          Almacen: "Dif",
          Uso: it.uso,
          Tallas: tallasToText(it.D),
          Total: totalD
        });
      }
    }

    // Orden: Concepto/Desc/uso y que Dif quede visible
    resultado.sort((a,b)=>{
      const ak = `${a.Concepto} ${a.Descripcion} ${a.Uso}`;
      const bk = `${b.Concepto} ${b.Descripcion} ${b.Uso}`;
      if (ak !== bk) return ak.localeCompare(bk, "es");
      const prio = (x)=> x.Almacen==="Dif" ? 0 : (x.Almacen==="CSV" ? 1 : 2);
      return prio(a)-prio(b);
    });

    return resultado;
  };

})();
