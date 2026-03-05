// modules/conciliacion.js
// Conciliación Velneo vs CSV Tiendas
// Salida: filas por talla (EAN, Concepto, Descripcion, Almacen, Uso, Talla, Velneo, Tiendas, TotalStockVelneo)
//
// TotalStockVelneo = Tiendas - Velneo

(function(){

  function norm(v){ return String(v ?? "").trim(); }

  function key(ean, talla, almacen){
    return `${norm(ean)}||${norm(talla)}||${norm(almacen)}`;
  }

  function add(map, k, field, val){
    if(!map.has(k)) map.set(k, { nuevo:0, usado:0 });
    map.get(k)[field] += (Number(val) || 0);
  }

  function usoLabel(field){
    return field === "nuevo" ? "Nuevo" : "Usado";
  }

  function tallaSortKey(t){
    const s = String(t ?? "").trim();
    const low = s.toLowerCase();
    if (["unico","único","u","unica","única"].includes(low)) return 999999;

    const m = s.match(/\d+/);
    if (m) return Number(m[0]);
    return 999998;
  }

  window.generarConciliacion = function({
    velneoRows,
    tiendasRows,
    mappingAlmacenes  // { nuevo:{tienda->alm}, usado:{tienda->alm} }  o {tienda->alm}
  }){

    // Normaliza mapping: permitir que venga plano {tienda:alm}
    const mapNuevo = (mappingAlmacenes && mappingAlmacenes.nuevo) ? mappingAlmacenes.nuevo : (mappingAlmacenes || {});
    const mapUsado = (mappingAlmacenes && mappingAlmacenes.usado) ? mappingAlmacenes.usado : (mappingAlmacenes || {});

    // 1) Velneo -> Map por (EAN,talla,almacen) con nuevo/usado
    const velneo = new Map();
    const metaByEAN = new Map(); // ean -> {concepto, descripcion}

    (velneoRows || []).forEach(r=>{
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

    (tiendasRows || []).forEach(r=>{
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

    // 3) Resultado por clave (EAN,talla,almacen,uso)
    const allKeys = new Set([...velneo.keys(), ...tiendas.keys()]);
    const resultado = [];

    allKeys.forEach(k=>{
      const [ean, talla, almacen] = k.split("||");
      const m = metaByEAN.get(ean);
      if(!m) return;

      const v = velneo.get(k) || {nuevo:0, usado:0};
      const t = tiendas.get(k) || {nuevo:0, usado:0};

      ["nuevo","usado"].forEach(field=>{
        const V = Number(v[field] || 0);
        const T = Number(t[field] || 0);

        // si quieres también mostrar ceros, quita este if
        if (V === 0 && T === 0) return;

        const diff = T - V; // ✅ Tiendas - Velneo

        resultado.push({
          EAN: ean,
          Concepto: m.concepto,
          Descripcion: m.descripcion,
          Almacen: almacen,
          Uso: usoLabel(field),
          Talla: talla,            // ✅ talla sola
          CSVVelneo: V,
          CSVTiendas: T,
          TotalStockVelneo: diff
        });
      });
    });

    // Orden: Concepto/Desc/Uso + Talla ASC
    resultado.sort((a,b)=>{
      const ak = `${a.Concepto} ${a.Descripcion} ${a.Uso}`;
      const bk = `${b.Concepto} ${b.Descripcion} ${b.Uso}`;
      if (ak !== bk) return ak.localeCompare(bk, "es");

      const ta = tallaSortKey(a.Talla);
      const tb = tallaSortKey(b.Talla);
      if (ta !== tb) return ta - tb;

      return String(a.EAN||"").localeCompare(String(b.EAN||""), "es");
    });

    return resultado;
  };

})();
