// modules/conciliacion.js
// Genera filas conciliadas Velneo vs Tiendas

(function(){

function norm(v){
  return String(v ?? "").trim();
}

function key(ean,talla,alm){
  return `${ean}||${talla}||${alm}`;
}

function add(map,k,val){
  map.set(k,(map.get(k)||0)+Number(val||0));
}

function tallaNum(t){
  const m = String(t).match(/\d+/);
  return m ? Number(m[0]) : 9999;
}

window.generarConciliacion = function({
  velneoRows,
  tiendasRows,
  mappingAlmacenes
}){

  const mapVelneo = new Map();
  const mapTiendas = new Map();
  const metaEAN = new Map();

  /* ======================
     VELNEO
  ====================== */

  velneoRows.forEach(r=>{
    const ean = norm(r.EAN);
    const talla = norm(r.Talla);
    const alm = norm(r.Almacen);

    const k = key(ean,talla,alm);

    const v = (Number(r.StockNuevo)||0)+(Number(r.StockUsado)||0);
    add(mapVelneo,k,v);

    if(!metaEAN.has(ean)){
      metaEAN.set(ean,{
        Concepto:norm(r.Concepto),
        Descripcion:norm(r.Descripcion)
      });
    }
  });

  /* ======================
     TIENDAS
  ====================== */

  tiendasRows.forEach(r=>{
    const tienda = norm(r.tienda).toLowerCase();
    const uso = norm(r.uso).toLowerCase();

    const dest = (uso==="nuevo")
      ? mappingAlmacenes.nuevo[tienda]
      : mappingAlmacenes.usado[tienda];

    if(!dest) return;

    const ean = norm(r.ean);
    const talla = norm(r.talla);

    const k = key(ean,talla,dest);
    add(mapTiendas,k,r.unidades);
  });

  /* ======================
     UNION KEYS
  ====================== */

  const allKeys = new Set([
    ...mapVelneo.keys(),
    ...mapTiendas.keys()
  ]);

  const rows = [];

  allKeys.forEach(k=>{

    const [ean,talla,alm] = k.split("||");

    const meta = metaEAN.get(ean) || {
      Concepto:"",
      Descripcion:""
    };

    const v = mapVelneo.get(k)||0;
    const t = mapTiendas.get(k)||0;
    const d = v-t;

    if(v!==0){
      rows.push({
        EAN:ean,
        Concepto:meta.Concepto,
        Descripcion:meta.Descripcion,
        Almacen:alm,
        Uso:"",
        Tallas:talla,
        Total:v
      });
    }

    if(t!==0){
      rows.push({
        EAN:ean,
        Concepto:meta.Concepto,
        Descripcion:meta.Descripcion,
        Almacen:"CSV",
        Uso:"",
        Tallas:talla,
        Total:t
      });
    }

    if(d!==0){
      rows.push({
        EAN:ean,
        Concepto:meta.Concepto,
        Descripcion:meta.Descripcion,
        Almacen:"Dif",
        Uso:"",
        Tallas:talla,
        Total:d
      });
    }

  });

  /* ======================
     ORDEN
  ====================== */

  rows.sort((a,b)=>{

    const ak=`${a.Concepto}${a.Descripcion}`;
    const bk=`${b.Concepto}${b.Descripcion}`;

    if(ak!==bk) return ak.localeCompare(bk,"es");

    const p=(x)=>x==="Dif"?0:(x==="CSV"?1:2);
    if(p(a.Almacen)!==p(b.Almacen)) return p(a.Almacen)-p(b.Almacen);

    return tallaNum(a.Tallas)-tallaNum(b.Tallas);

  });

  return rows;

};

})();
