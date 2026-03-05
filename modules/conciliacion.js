// modules/conciliacion.js
// Conciliación Velneo vs CSV Tiendas (1 fila por talla)
// Salida: {EAN, Concepto, Descripcion, Almacen, Uso, Talla, CSVVelneo, CSVTiendas, TotalStockVelneo}

(function(){

  function norm(v){ return String(v ?? "").trim(); }

  function key(ean, talla, almacen){
    return `${norm(ean)}||${norm(talla)}||${norm(almacen)}`;
  }

  function add(map, k, field, val){
    if(!map.has(k)) map.set(k, { nuevo:0, usado:0 });
    map.get(k)[field] += (Number(val) || 0);
  }

  window.generarConciliacion = function({
    velneoRows,
    tiendasRows,
    mappingAlmacenes // { nuevo:{tienda->alm}, usado:{tienda->alm} }
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
      const uso = norm(r.uso).toUpperCase(); // NUEVO / USADO
      const isNuevo = (uso === "NUEVO");

      const almacenDestino = isNuevo ? mapNuevo[tienda] : mapUsado[tienda];
      if(!almacenDestino) return;

      const ean = norm(r.ean);
      if (!ean) return;

      const talla = norm(r.talla);
      const k = key(ean, talla, almacenDestino);

      add(tiendas, k, isNuevo ? "nuevo" : "usado", r.unidades);
    });

    // 3) Unir claves y sacar filas "planas" por talla
    const allKeys = new Set([...velneo.keys(), ...tiendas.keys()]);
    const out = [];

    allKeys.forEach(k=>{
      const [ean, talla, almacen] = k.split("||");
      const meta = metaByEAN.get(ean);
      if(!meta) return;

      const v = velneo.get(k) || { nuevo:0, usado:0 };
      const t = tiendas.get(k) || { nuevo:0, usado:0 };

      // Nuevo
      if ((v.nuevo || 0) !== 0 || (t.nuevo || 0) !== 0){
        const csvVelneo = Number(v.nuevo||0);
        const csvTiendas = Number(t.nuevo||0);
        out.push({
          EAN: ean,
          Concepto: meta.concepto,
          Descripcion: meta.descripcion,
          Almacen: almacen,
          Uso: "Nuevo",
          Talla: talla,
          CSVVelneo: csvVelneo,
          CSVTiendas: csvTiendas,
          TotalStockVelneo: csvTiendas - csvVelneo
        });
      }

      // Usado
      if ((v.usado || 0) !== 0 || (t.usado || 0) !== 0){
        const csvVelneo = Number(v.usado||0);
        const csvTiendas = Number(t.usado||0);
        out.push({
          EAN: ean,
          Concepto: meta.concepto,
          Descripcion: meta.descripcion,
          Almacen: almacen,
          Uso: "Usado",
          Talla: talla,
          CSVVelneo: csvVelneo,
          CSVTiendas: csvTiendas,
          TotalStockVelneo: csvTiendas - csvVelneo
        });
      }
    });

    return out;
  };

})();
