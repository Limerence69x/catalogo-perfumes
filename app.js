"use strict";

/* ===== Estado ===== */
const estado = {
  marcas: [],        // [{slug, marca, tipo, estilo, perfumes:[...]}]
  perfumes: [],      // todos los perfumes, con id y slugMarca
  porId: new Map(),
  similares: new Map(),
  filtros: { genero: "", familia: "", nota: "", temporada: "", ocasion: "" },
  tipoMarca: "",
  busqueda: "",
};

const LISTAS = {
  favorito: { etiqueta: "Favorito", icono: "♥" },
  tengo: { etiqueta: "Lo tengo", icono: "✓" },
  probar: { etiqueta: "Quiero probarlo", icono: "✧" },
};
const CLAVE_LISTAS = "catalogoPerfumes.listas.v1";
const TEMPORADAS = ["primavera", "verano", "otoño", "invierno"];
const OCASIONES = ["diario", "oficina", "citas", "noche", "eventos formales"];

/* ===== Utilidades ===== */
const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const slug = (s) => normalizar(s).replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const comparar = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (sel, raiz = document) => raiz.querySelector(sel);

/* ===== Listas guardadas (localStorage) ===== */
function leerListas() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_LISTAS) || "{}");
    return datos && typeof datos === "object" ? datos : {};
  } catch {
    return {};
  }
}
let listas = leerListas();

function guardarListas() {
  try {
    localStorage.setItem(CLAVE_LISTAS, JSON.stringify(listas));
  } catch {
    /* almacenamiento no disponible: los cambios duran solo esta visita */
  }
}

function enLista(id, lista) {
  return Array.isArray(listas[id]) && listas[id].includes(lista);
}

function alternarLista(id, lista) {
  const actual = new Set(listas[id] || []);
  actual.has(lista) ? actual.delete(lista) : actual.add(lista);
  if (actual.size) listas[id] = [...actual];
  else delete listas[id];
  guardarListas();
  actualizarContador();
}

function actualizarContador() {
  const total = Object.keys(listas).filter((id) => estado.porId.has(id)).length;
  $("#contador-listas").textContent = total ? total : "";
}

/* ===== Carga de datos ===== */
async function cargar() {
  const indice = await fetch("datos/marcas.json").then((r) => {
    if (!r.ok) throw new Error("No se pudo leer datos/marcas.json");
    return r.json();
  });
  const archivos = await Promise.all(
    indice.marcas.map((archivo) =>
      fetch(`datos/${archivo}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((datos) => (datos ? { ...datos, slug: archivo } : null))
        .catch(() => null)
    )
  );
  estado.marcas = archivos.filter(Boolean).sort((a, b) => comparar(a.marca, b.marca));
  for (const marca of estado.marcas) {
    marca.perfumes = (marca.perfumes || []).slice().sort((a, b) => comparar(a.nombre, b.nombre));
    for (const p of marca.perfumes) {
      p.marca = p.marca || marca.marca;
      p.slugMarca = marca.slug;
      p.id = `${marca.slug}--${slug(p.nombre)}`;
      p.notas = p.notas || {};
      p.todasNotas = [...(p.notas.salida || []), ...(p.notas.corazon || []), ...(p.notas.fondo || [])];
      p._busqueda = normalizar(`${p.nombre} ${p.marca}`);
      p._notas = p.todasNotas.map(normalizar);
      estado.perfumes.push(p);
      estado.porId.set(p.id, p);
    }
  }
  calcularSimilares();
}

/* ===== "Si te gusta X, prueba Y" ===== */
function menciones(perfume, nombres) {
  // Busca nombres de otros perfumes del catálogo dentro de la descripción.
  const texto = perfume.descripcion || "";
  const usados = new Array(texto.length).fill(false);
  const encontrados = new Set();
  const letra = /[\p{L}\p{N}]/u;
  for (const { nombre, ids } of nombres) {
    let desde = 0;
    while (true) {
      const i = texto.indexOf(nombre, desde);
      if (i < 0) break;
      const fin = i + nombre.length;
      const libre = !usados.slice(i, fin).some(Boolean);
      const bordes = !letra.test(texto[i - 1] || "") && !letra.test(texto[fin] || "");
      if (libre && bordes) {
        for (let k = i; k < fin; k++) usados[k] = true;
        ids.forEach((id) => encontrados.add(id));
      }
      desde = fin;
    }
  }
  encontrados.delete(perfume.id);
  return encontrados;
}

function calcularSimilares() {
  const porNombre = new Map();
  for (const p of estado.perfumes) {
    if (p.nombre.length < 3) continue;
    if (!porNombre.has(p.nombre)) porNombre.set(p.nombre, []);
    porNombre.get(p.nombre).push(p.id);
  }
  const nombres = [...porNombre.entries()]
    .map(([nombre, ids]) => ({ nombre, ids }))
    .sort((a, b) => b.nombre.length - a.nombre.length);

  const jaccard = (a, b) => {
    if (!a.length || !b.length) return 0;
    const A = new Set(a), B = new Set(b);
    let comun = 0;
    A.forEach((x) => B.has(x) && comun++);
    return comun / (A.size + B.size - comun);
  };

  const mencionados = new Map(estado.perfumes.map((p) => [p.id, menciones(p, nombres)]));

  for (const p of estado.perfumes) {
    const puntajes = [];
    for (const q of estado.perfumes) {
      if (q.id === p.id) continue;
      let s = 0;
      if (q.familia && q.familia === p.familia) s += 3;
      s += 8 * jaccard(p._notas, q._notas);
      if (p.genero === q.genero) s += 1;
      else if (p.genero === "unisex" || q.genero === "unisex") s += 0.5;
      else s -= 3;
      s += 1.5 * jaccard(p.temporadas || [], q.temporadas || []);
      s += 0.5 * jaccard(p.ocasiones || [], q.ocasiones || []);
      if (mencionados.get(p.id).has(q.id)) s += 6;
      if (mencionados.get(q.id).has(p.id)) s += 3;
      if (q.slugMarca === p.slugMarca) s -= 0.5; // preferimos variedad de casas
      puntajes.push([s, q]);
    }
    puntajes.sort((a, b) => b[0] - a[0]);
    estado.similares.set(p.id, puntajes.slice(0, 3).filter(([s]) => s > 2).map(([, q]) => q));
  }
}

/* ===== Filtros ===== */
function hayFiltros() {
  return Object.values(estado.filtros).some(Boolean);
}

function cumpleFiltros(p) {
  const f = estado.filtros;
  if (f.genero && p.genero !== f.genero) return false;
  if (f.familia && p.familia !== f.familia) return false;
  if (f.temporada && !(p.temporadas || []).includes(f.temporada)) return false;
  if (f.ocasion && !(p.ocasiones || []).includes(f.ocasion)) return false;
  if (f.nota) {
    const n = normalizar(f.nota);
    if (!p._notas.some((x) => x.includes(n))) return false;
  }
  if (estado.busqueda && rutaActual().vista === "explorar") {
    const q = normalizar(estado.busqueda);
    if (!p._busqueda.includes(q)) return false;
  }
  return true;
}

function opciones(valores, actual, todas) {
  return [`<option value="">${todas}</option>`]
    .concat(valores.map((v) => `<option value="${esc(v)}"${v === actual ? " selected" : ""}>${esc(mayus(v))}</option>`))
    .join("");
}

function panelFiltros() {
  const f = estado.filtros;
  const familias = [...new Set(estado.perfumes.map((p) => p.familia).filter(Boolean))].sort(comparar);
  const notas = [...new Set(estado.perfumes.flatMap((p) => p.todasNotas))].sort(comparar);
  const activos = Object.values(f).filter(Boolean).length;
  return `
  <details class="filtros"${activos ? " open" : ""}>
    <summary>
      <span>Filtros${activos ? ` <span class="contador">${activos}</span>` : ""}</span>
      <span class="filtros-flecha" aria-hidden="true"></span>
    </summary>
    <div class="filtros-cuerpo">
      <label>Género
        <select data-filtro="genero">${opciones(["masculino", "femenino", "unisex"], f.genero, "Todos")}</select>
      </label>
      <label>Familia olfativa
        <select data-filtro="familia">${opciones(familias, f.familia, "Todas")}</select>
      </label>
      <label>Nota
        <input type="search" data-filtro="nota" list="lista-notas" placeholder="Ej.: vainilla, cuero…" value="${esc(f.nota)}">
        <datalist id="lista-notas">${notas.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      </label>
      <label>Temporada
        <select data-filtro="temporada">${opciones(TEMPORADAS, f.temporada, "Todas")}</select>
      </label>
      <label>Ocasión
        <select data-filtro="ocasion">${opciones(OCASIONES, f.ocasion, "Todas")}</select>
      </label>
      <button type="button" class="boton-texto" data-accion="limpiar"${activos ? "" : " hidden"}>Limpiar filtros</button>
    </div>
  </details>`;
}

/* ===== Plantillas ===== */
function filaNotas(titulo, notas) {
  return notas && notas.length
    ? `<div class="nota-fila"><dt>${titulo}</dt><dd>${notas.map(esc).join(" · ")}</dd></div>`
    : "";
}

/* ===== Imagen de referencia ===== */
const COLORES_FAMILIA = {
  "Amaderada": "#8a6a4a", "Aromática": "#7d8f6a", "Fougère": "#6f8a7a", "Cítrica": "#d9ae3c",
  "Acuática": "#5f9cbf", "Floral": "#d98fa6", "Floral afrutada": "#e07f7f", "Chipre": "#8f8150",
  "Ambarada": "#c27a32", "Gourmand": "#8b4f3a", "Cuero": "#5b3a2a", "Almizclada": "#cbbcae", "Especiada": "#b4502e",
};

function hashTexto(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return h;
}

function iniciales(nombre) {
  const palabras = nombre.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (palabras.length > 1 ? palabras[0][0] + palabras[1][0] : (palabras[0] || "?").slice(0, 2)).toUpperCase();
}

function frasco(p) {
  // Ilustración del frasco: la forma sale del nombre y el color de la familia olfativa.
  const color = COLORES_FAMILIA[p.familia] || "#a57f45";
  const forma = hashTexto(p.id) % 4;
  const g = `g-${p.id}`;
  const cuerpos = [
    `<rect x="14" y="34" width="52" height="70" rx="7"/>`,
    `<ellipse cx="40" cy="72" rx="30" ry="32"/>`,
    `<rect x="22" y="30" width="36" height="76" rx="4"/>`,
    `<path d="M18 40 L28 32 H52 L62 40 V96 L52 106 H28 L18 96 Z"/>`,
  ];
  const tapas = [
    `<rect x="29" y="8" width="22" height="20" rx="3"/><rect x="34" y="27" width="12" height="8"/>`,
    `<circle cx="40" cy="22" r="11"/><rect x="35" y="31" width="10" height="9"/>`,
    `<rect x="31" y="4" width="18" height="22" rx="2"/><rect x="35" y="25" width="10" height="6"/>`,
    `<path d="M30 10 H50 L54 26 H26 Z"/><rect x="35" y="25" width="10" height="8"/>`,
  ];
  return `<svg class="frasco" viewBox="0 0 80 112" role="img" aria-label="Ilustración de ${esc(p.nombre)}">
    <defs><linearGradient id="${g}" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset="1" stop-color="${color}"/>
    </linearGradient></defs>
    <g fill="#1d1915">${tapas[forma]}</g>
    <g fill="url(#${g})" stroke="#1d1915" stroke-opacity=".25">${cuerpos[forma]}</g>
    <rect x="22" y="40" width="5" height="44" rx="2.5" fill="#fff" opacity=".35"/>
    <rect x="27" y="62" width="26" height="18" rx="2" fill="#fffcf7" opacity=".9"/>
    <text x="40" y="75" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="11" fill="#1d1915">${esc(iniciales(p.nombre))}</text>
  </svg>`;
}

function imagenPerfume(p) {
  const ilustracion = frasco(p);
  if (!p.imagen) return `<div class="perfume-imagen">${ilustracion}</div>`;
  return `<div class="perfume-imagen"><img src="${esc(p.imagen)}" alt="Frasco de ${esc(p.nombre)}" loading="lazy" referrerpolicy="no-referrer"
    onerror="this.replaceWith(this.nextElementSibling.content.cloneNode(true))"><template>${ilustracion}</template></div>`;
}

function enlaceFotos(p) {
  const q = encodeURIComponent(`${p.marca} ${p.nombre} perfume`);
  return `<a class="ver-fotos" href="https://www.google.com/search?tbm=isch&q=${q}" target="_blank" rel="noopener">Ver fotos ↗</a>`;
}

function tarjetaPerfume(p, { mostrarMarca = false } = {}) {
  const meta = [p.anio, mayus(p.genero || ""), p.familia].filter(Boolean).map(esc).join(" · ");
  const n = p.notas;
  const piramide = filaNotas("Salida", n.salida) + filaNotas("Corazón", n.corazon) + filaNotas("Fondo", n.fondo);
  const similares = estado.similares.get(p.id) || [];
  const chips = (arr, clase) => (arr || []).map((x) => `<li class="chip ${clase}">${esc(mayus(x))}</li>`).join("");
  return `
  <article class="perfume" id="p-${p.id}">
    <header class="perfume-cabeza">
      ${imagenPerfume(p)}
      <div class="perfume-titulo">
        ${mostrarMarca ? `<a class="perfume-marca" href="#/marca/${p.slugMarca}">${esc(p.marca)}</a>` : ""}
        <h3 class="perfume-nombre">${esc(p.nombre)}</h3>
        <p class="perfume-meta">${meta}</p>
        ${enlaceFotos(p)}
      </div>
    </header>
    <p class="perfume-desc">${esc(p.descripcion || "")}</p>
    <dl class="piramide">${piramide || `<div class="nota-fila"><dt>Notas</dt><dd class="tenue">Sin confirmar</dd></div>`}</dl>
    <ul class="chips" aria-label="Concentraciones">${chips(p.concentraciones, "chip-conc")}</ul>
    <ul class="chips" aria-label="Temporadas y ocasiones">${chips(p.temporadas, "chip-temp")}${chips(p.ocasiones, "chip-ocas")}</ul>
    <div class="acciones">
      ${Object.entries(LISTAS)
        .map(([clave, { etiqueta, icono }]) => {
          const activo = enLista(p.id, clave);
          return `<button type="button" class="boton-lista${activo ? " activo" : ""}" data-lista="${clave}" data-id="${p.id}" aria-pressed="${activo}">
            <span aria-hidden="true">${icono}</span> ${etiqueta}</button>`;
        })
        .join("")}
    </div>
    ${
      similares.length
        ? `<aside class="similares">
      <p class="similares-titulo">Si te gusta <em>${esc(p.nombre)}</em>, prueba</p>
      <ul>${similares
        .map((q) => `<li><a href="#/marca/${q.slugMarca}/${q.id}"><span class="sim-nombre">${esc(q.nombre)}</span><span class="sim-marca">${esc(q.marca)}</span></a></li>`)
        .join("")}</ul>
    </aside>`
        : ""
    }
  </article>`;
}

function rejillaPerfumes(lista, opciones) {
  if (!lista.length) return `<p class="vacio">No hay perfumes que coincidan. Prueba con otros filtros.</p>`;
  return `<div class="rejilla-perfumes">${lista.map((p) => tarjetaPerfume(p, opciones)).join("")}</div>`;
}

/* ===== Vistas ===== */
function vistaInicio() {
  const tipos = ["Diseñador", "Nicho", "Árabe"];
  const marcas = estado.marcas.filter((m) => !estado.tipoMarca || m.tipo === estado.tipoMarca);
  let letraAnterior = "";
  const tarjetas = marcas
    .map((m) => {
      const letra = normalizar(m.marca).charAt(0).toUpperCase();
      const separador = letra !== letraAnterior ? `<h2 class="letra">${letra}</h2>` : "";
      letraAnterior = letra;
      const n = m.perfumes.length;
      return `${separador}
      <a class="marca" href="#/marca/${m.slug}">
        <span class="marca-tipo">${esc(m.tipo || "")}</span>
        <span class="marca-nombre">${esc(m.marca)}</span>
        <span class="marca-estilo">${esc(m.estilo || "")}</span>
        <span class="marca-cantidad">${n} ${n === 1 ? "perfume" : "perfumes"}</span>
      </a>`;
    })
    .join("");
  return `
  <section class="portada">
    <p class="portada-sobre">Diseñador · Nicho · Árabes</p>
    <h1>Las casas de perfume</h1>
    <p class="portada-texto">${estado.marcas.length} marcas y ${estado.perfumes.length} perfumes, con sus notas, familias y recomendaciones.</p>
    <div class="tipos" role="group" aria-label="Tipo de marca">
      ${["", ...tipos]
        .map((t) => `<button type="button" class="tipo${estado.tipoMarca === t ? " activo" : ""}" data-tipo="${t}">${t || "Todas"}</button>`)
        .join("")}
    </div>
  </section>
  <section class="marcas">${tarjetas}</section>`;
}

function vistaMarca(slugMarca, idPerfume) {
  const m = estado.marcas.find((x) => x.slug === slugMarca);
  if (!m) return `<p class="vacio">No encontramos esa marca. <a href="#/">Volver a las marcas</a></p>`;
  const filtrados = m.perfumes.filter(cumpleFiltros);
  const n = m.perfumes.length;
  return {
    html: `
    <a class="volver" href="#/">← Todas las marcas</a>
    <section class="portada portada-marca">
      <p class="portada-sobre">${esc(m.tipo || "")}</p>
      <h1>${esc(m.marca)}</h1>
      <p class="portada-texto">${esc(m.estilo || "")}</p>
      <p class="portada-cantidad">${n} ${n === 1 ? "perfume" : "perfumes"}</p>
    </section>
    ${panelFiltros()}
    ${hayFiltros() ? `<p class="resultado">${filtrados.length} de ${n} perfumes</p>` : ""}
    ${rejillaPerfumes(filtrados)}`,
    destacar: idPerfume,
  };
}

function vistaExplorar() {
  const filtrados = estado.perfumes.filter(cumpleFiltros).sort((a, b) => comparar(a.nombre, b.nombre));
  const q = normalizar(estado.busqueda);
  const marcas = q ? estado.marcas.filter((m) => normalizar(m.marca).includes(q)) : [];
  return `
  <section class="portada portada-marca">
    <p class="portada-sobre">Todo el catálogo</p>
    <h1>${estado.busqueda ? `Resultados para «${esc(estado.busqueda)}»` : "Explorar perfumes"}</h1>
    <p class="portada-texto">Combina el buscador con los filtros para encontrar tu próximo perfume.</p>
  </section>
  ${
    marcas.length
      ? `<div class="marcas-encontradas">${marcas.map((m) => `<a class="chip chip-enlace" href="#/marca/${m.slug}">${esc(m.marca)} →</a>`).join("")}</div>`
      : ""
  }
  ${panelFiltros()}
  <p class="resultado">${filtrados.length} ${filtrados.length === 1 ? "perfume" : "perfumes"}</p>
  ${rejillaPerfumes(filtrados, { mostrarMarca: true })}`;
}

let pestanaLista = "favorito";
function vistaListas() {
  const pestanas = Object.entries(LISTAS)
    .map(([clave, { etiqueta, icono }]) => {
      const total = estado.perfumes.filter((p) => enLista(p.id, clave)).length;
      return `<button type="button" role="tab" class="tipo${pestanaLista === clave ? " activo" : ""}" data-pestana="${clave}" aria-selected="${pestanaLista === clave}">
        ${icono} ${etiqueta} <span class="contador">${total}</span></button>`;
    })
    .join("");
  const lista = estado.perfumes.filter((p) => enLista(p.id, pestanaLista)).sort((a, b) => comparar(a.nombre, b.nombre));
  return `
  <section class="portada portada-marca">
    <p class="portada-sobre">Guardado en este dispositivo</p>
    <h1>Mis listas</h1>
    <p class="portada-texto">Tus favoritos, los que ya tienes y los que quieres probar. Se guardan en este navegador aunque cierres la página.</p>
    <div class="tipos" role="tablist">${pestanas}</div>
  </section>
  ${
    lista.length
      ? rejillaPerfumes(lista, { mostrarMarca: true })
      : `<p class="vacio">Aún no hay perfumes en «${LISTAS[pestanaLista].etiqueta}». Toca el botón correspondiente en cualquier perfume para añadirlo.</p>`
  }`;
}

/* ===== Enrutador ===== */
function rutaActual() {
  const partes = decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean);
  return { vista: partes[0] || "inicio", args: partes.slice(1) };
}

function pintar({ conservarScroll = false } = {}) {
  const { vista, args } = rutaActual();
  const main = $("#contenido");
  const scroll = window.scrollY;
  let resultado;
  if (vista === "marca") resultado = vistaMarca(args[0], args[1]);
  else if (vista === "explorar") resultado = vistaExplorar();
  else if (vista === "listas") resultado = vistaListas();
  else resultado = vistaInicio();

  const html = typeof resultado === "string" ? resultado : resultado.html;
  main.innerHTML = html;

  document.querySelectorAll(".menu a").forEach((a) => {
    const activo = a.dataset.ruta === (vista === "marca" ? "inicio" : vista);
    a.classList.toggle("activo", activo);
    activo ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });

  const destacar = resultado && resultado.destacar;
  if (destacar) {
    const el = document.getElementById(`p-${destacar}`);
    if (el) {
      el.classList.add("destacado");
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
      setTimeout(() => el.classList.remove("destacado"), 2600);
      return;
    }
  }
  if (conservarScroll) window.scrollTo(0, scroll);
  else window.scrollTo(0, 0);
}

/* ===== Eventos ===== */
function enlazarEventos() {
  window.addEventListener("hashchange", () => pintar());

  const busqueda = $("#busqueda");
  let espera;
  busqueda.addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      estado.busqueda = busqueda.value.trim();
      if (rutaActual().vista === "explorar") pintar({ conservarScroll: true });
      else if (estado.busqueda) location.hash = "#/explorar";
    }, 180);
  });
  $("#form-busqueda").addEventListener("submit", (e) => {
    e.preventDefault();
    estado.busqueda = busqueda.value.trim();
    busqueda.blur();
    if (rutaActual().vista !== "explorar") location.hash = "#/explorar";
    else pintar();
  });

  const main = $("#contenido");
  main.addEventListener("click", (e) => {
    const botonLista = e.target.closest("[data-lista]");
    if (botonLista) {
      alternarLista(botonLista.dataset.id, botonLista.dataset.lista);
      if (rutaActual().vista === "listas") return pintar({ conservarScroll: true });
      const activo = enLista(botonLista.dataset.id, botonLista.dataset.lista);
      botonLista.classList.toggle("activo", activo);
      botonLista.setAttribute("aria-pressed", activo);
      return;
    }
    const tipo = e.target.closest("[data-tipo]");
    if (tipo) {
      estado.tipoMarca = tipo.dataset.tipo;
      return pintar({ conservarScroll: true });
    }
    const pestana = e.target.closest("[data-pestana]");
    if (pestana) {
      pestanaLista = pestana.dataset.pestana;
      return pintar({ conservarScroll: true });
    }
    if (e.target.closest("[data-accion='limpiar']")) {
      Object.keys(estado.filtros).forEach((k) => (estado.filtros[k] = ""));
      return pintar({ conservarScroll: true });
    }
    // Enlace a un perfume en la misma página de marca: volver a destacarlo
    const enlace = e.target.closest("a[href^='#/marca/']");
    if (enlace && enlace.getAttribute("href") === location.hash) pintar();
  });

  const alCambiarFiltro = (e) => {
    const campo = e.target.closest("[data-filtro]");
    if (!campo) return;
    estado.filtros[campo.dataset.filtro] = campo.value.trim();
    const foco = campo.dataset.filtro;
    const pos = campo.selectionStart;
    pintar({ conservarScroll: true });
    const nuevo = main.querySelector(`[data-filtro="${foco}"]`);
    if (nuevo && nuevo.tagName === "INPUT") {
      nuevo.focus();
      try { nuevo.setSelectionRange(pos, pos); } catch { /* sin soporte */ }
    }
  };
  main.addEventListener("change", (e) => e.target.tagName === "SELECT" && alCambiarFiltro(e));
  let esperaNota;
  main.addEventListener("input", (e) => {
    if (e.target.dataset.filtro !== "nota") return;
    clearTimeout(esperaNota);
    esperaNota = setTimeout(() => alCambiarFiltro(e), 300);
  });

  // Sincroniza las listas si se cambian en otra pestaña
  window.addEventListener("storage", (e) => {
    if (e.key !== CLAVE_LISTAS) return;
    listas = leerListas();
    actualizarContador();
    pintar({ conservarScroll: true });
  });
}

/* ===== Inicio ===== */
(async function iniciar() {
  try {
    await cargar();
  } catch (err) {
    $("#contenido").innerHTML = `<p class="vacio">No se pudo cargar el catálogo. Si abriste el archivo directamente desde tu computadora, usa la dirección web publicada.<br><small>${esc(err.message)}</small></p>`;
    return;
  }
  actualizarContador();
  enlazarEventos();
  pintar();
})();
