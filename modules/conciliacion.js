// modules/conciliacion.js
// Conciliación Velneo vs CSV Tiendas
// Devuelve filas: {EAN,Concepto,Descripcion,Almacen,Uso,Talla,CSVVelneo,CSVTiendas,TotalStockVelneo}

(function () {
  function norm(v){ return String(v ?? "").trim(); }

  function key(ean, talla, almacen, uso){
    return `${norm(ean)}||${norm(talla)}||${norm(almacen)}||${norm(uso)}`;
  }

  function add(map, k, val){
    map.set(k, (map.get(k) || 0) + (Number(val) || 0));
  }

  window.generarConciliacion = function({
    velneoRows,
    tiendasRows,
    mappingAlmacenes  // { nuevo:{tienda->alm}, usado:{tienda->alm} }
  }){
    const mapNuevo = (mappingAlmacenes && mappingAlmacenes.nuevo) ? mappingAlmacenes.nuevo : {};
    const mapUsado = (mappingAlmacenes && mappingAlmacenes.usado) ? mappingAlmacenes.usado : {};

    // Meta por EAN (concepto/descripcion) con fallback desde tiendas
    const metaByEAN = new Map(); // ean -> {concepto, descripcion}

    // Velneo: sumas por EAN+talla+almacen+uso
    const velneoSum = new Map(); // key(ean,talla,alm,usoLabel) -> qty

    for (const r of (velneoRows || [])){
      const ean = norm(r.EAN);
      if (!ean) continue;

      const almacen = norm(r.Almacen);
      const talla = norm(r.Talla);

      const concepto = norm(r.Concepto);
      const descripcion = norm(r.Descripcion);
      if (!metaByEAN.has(ean)) metaByEAN.set(ean, { concepto, descripcion });

      add(velneoSum, key(ean, talla, almacen, "Nuevo"), Number(r.StockNuevo) || 0);
      add(velneoSum, key(ean, talla, almacen, "Usado"), Number(r.StockUsado) || 0);
    }

    // Tiendas: sumas por EAN+talla+almacenDestino+uso
    const tiendasSum = new Map();

    for (const r of (tiendasRows || [])){
      const tienda = norm(r.tienda).toLowerCase();
      const usoRaw = norm(r.uso).toUpperCase(); // NUEVO / USADO
      const uso = (usoRaw === "NUEVO") ? "Nuevo" : "Usado";

      const almacenDestino = (uso === "Nuevo") ? mapNuevo[tienda] : mapUsado[tienda];
      if (!almacenDestino) continue;

      const ean = norm(r.ean);
      if (!ean) continue;

      const talla = norm(r.talla);

      // fallback meta desde tiendas si en velneo no existe
      if (!metaByEAN.has(ean)){
        metaByEAN.set(ean, {
          concepto: norm(r.concepto),
          descripcion: norm(r.descripcion)
        });
      }

      add(tiendasSum, key(ean, talla, String(almacenDestino), uso), Number(r.unidades) || 0);
    }

    // Unimos keys
    const allKeys = new Set([...velneoSum.keys(), ...tiendasSum.keys()]);

    const out = [];
    for (const k of allKeys){
      const [ean, talla, almacen, uso] = k.split("||");
      const meta = metaByEAN.get(ean) || { concepto:"", descripcion:"" };

      const v = Number(velneoSum.get(k) || 0);
      const t = Number(tiendasSum.get(k) || 0);
      const diff = t - v; // ✅ pedido: Tiendas - Velneo

      out.push({
        EAN: ean,
        Concepto: meta.concepto,
        Descripcion: meta.descripcion,
        Almacen: almacen,
        Uso: uso,
        Talla: talla,
        CSVVelneo: v,
        CSVTiendas: t,
        TotalStockVelneo: diff
      });
    }

    // Orden: Concepto/Descripcion/Uso y luego talla ASC (UNICO al final)
    const tallaKey = (s)=>{
      const x = String(s||"").trim().toLowerCase();
      if (["unico","único","u","unica","única"].includes(x)) return 999999;
      const m = String(s||"").match(/\d+/);
      return m ? Number(m[0]) : 999998;
    };

    out.sort((a,b)=>{
      const ak = `${a.Concepto} ${a.Descripcion} ${a.Uso}`;
      const bk = `${b.Concepto} ${b.Descripcion} ${b.Uso}`;
      const c = ak.localeCompare(bk, "es");
      if (c) return c;

      const ta = tallaKey(a.Talla);
      const tb = tallaKey(b.Talla);
      if (ta !== tb) return ta - tb;

      return String(a.EAN||"").localeCompare(String(b.EAN||""), "es");
    });

    return out;
  };
})();
