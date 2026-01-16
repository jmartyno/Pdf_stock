// modules/conciliacion.js
// =======================
// Conciliación Velneo vs CSV Tiendas
// Devuelve líneas planas listas para mostrar / exportar

(function(){

  function key(ean, talla, almacen){
    return `${ean}||${talla}||${almacen}`;
  }

  function norm(v){
    return String(v ?? "").trim();
  }

  function add(map, k, field, val){
    if(!map.has(k)) map.set(k, { nuevo:0, usado:0 });
    map.get(k)[field] += val;
  }

  window.generarConciliacion = function({
    velneoRows,
    tiendasRows,
    mappingAlmacenes   // ej: { "Ayala":"34", "3":"34" }
  }){

    // -----------------------
    // 1) Normalizar Velneo
    // -----------------------
    const velneo = new Map();
    const meta = new Map(); // info articulo

    velneoRows.forEach(r=>{
      const almacen = norm(r.Almacen);
      const k = key(r.EAN, r.Talla, almacen);

      add(velneo, k, "nuevo", Number(r.StockNuevo||0));
      add(velneo, k, "usado", Number(r.StockUsado||0));

      if(!meta.has(k)){
        meta.set(k,{
          concepto: r.Concepto,
          descripcion: r.Descripcion,
          talla: r.Talla
        });
      }
    });

    // -----------------------
    // 2) Normalizar TIENDAS (N CSV)
    // -----------------------
    const tiendas = new Map();

    tiendasRows.forEach(r=>{
      const almacenVelneo = mappingAlmacenes[norm(r.tienda)];
      if(!almacenVelneo) return; // no concilia

      const k = key(r.ean, r.talla, almacenVelneo);
      const uso = r.uso === "NUEVO" ? "nuevo" : "usado";

      add(tiendas, k, uso, Number(r.unidades||0));
    });

    // -----------------------
    // 3) Conciliar
    // -----------------------
    const resultado = [];

    const allKeys = new Set([...velneo.keys(), ...tiendas.keys()]);

    allKeys.forEach(k=>{
      const v = velneo.get(k) || {nuevo:0, usado:0};
      const t = tiendas.get(k) || {nuevo:0, usado:0};
      const m = meta.get(k);

      if(!m) return;

      const [ean, talla, almacen] = k.split("||");

      ["nuevo","usado"].forEach(uso=>{
        const V = v[uso];
        const T = t[uso];
        const D = V - T;

        if(V!==0){
          resultado.push({
            Concepto: m.concepto,
            Descripcion: m.descripcion,
            Almacen: almacen,
            Uso: uso === "nuevo" ? "Nuevo" : "Usado",
            Tallas: talla,
            Total: V
          });
        }

        if(T!==0){
          resultado.push({
            Concepto: m.concepto,
            Descripcion: m.descripcion,
            Almacen: "CSV",
            Uso: uso === "nuevo" ? "Nuevo" : "Usado",
            Tallas: talla,
            Total: T
          });
        }

        if(D!==0){
          resultado.push({
            Concepto: m.concepto,
            Descripcion: m.descripcion,
            Almacen: "Dif",
            Uso: uso === "nuevo" ? "Nuevo" : "Usado",
            Tallas: talla,
            Total: D
          });
        }
      });
    });

    return resultado;
  };

})();
