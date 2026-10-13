# Esencia · Catálogo de perfumes

Catálogo web de perfumes (sin precios), en español, publicado con GitHub Pages:
**https://limerence69x.github.io/catalogo-perfumes/**

## Qué incluye

- 45 marcas (diseñador, nicho y árabes) y más de 260 perfumes.
- Ilustración del frasco en cada perfume (color según su familia olfativa) y botón «Ver fotos» que abre fotos reales en Google Imágenes.
- Buscador por nombre o marca.
- Filtros por género, familia olfativa, nota, temporada y ocasión.
- «Si te gusta X, prueba Y» en cada perfume (se calcula comparando familia, notas, género, temporadas y los parecidos que menciona la descripción).
- Listas «Favorito», «Lo tengo» y «Quiero probarlo», guardadas en el navegador del dispositivo.

## Estructura

```
index.html      página
estilos.css     diseño
app.js          funcionamiento
datos/
  marcas.json   lista de archivos de marca que carga la página
  dior.json     un archivo por marca
  ...
```

Cada archivo de marca tiene esta forma:

```json
{
  "marca": "Dior",
  "tipo": "Diseñador",
  "estilo": "Una línea que describe el estilo de la casa.",
  "perfumes": [
    {
      "nombre": "Sauvage",
      "marca": "Dior",
      "anio": 2015,
      "genero": "masculino",
      "familia": "Aromática",
      "notas": { "salida": ["bergamota"], "corazon": ["lavanda"], "fondo": ["ambroxán"] },
      "concentraciones": ["EDT", "EDP", "Parfum"],
      "temporadas": ["primavera", "verano", "otoño", "invierno"],
      "ocasiones": ["diario", "oficina", "citas", "noche"],
      "descripcion": "Descripción original de 2 o 3 frases."
    }
  ]
}
```

- `tipo`: `Diseñador`, `Nicho` o `Árabe`.
- `genero`: `masculino`, `femenino` o `unisex`.
- `temporadas`: `primavera`, `verano`, `otoño`, `invierno`.
- `ocasiones`: `diario`, `oficina`, `citas`, `noche`, `eventos formales`.
- `imagen` (opcional): dirección web de una foto del frasco. Si existe, se muestra en lugar de la ilustración.
- Si un dato no es seguro se deja vacío (`""` o `[]`) en lugar de inventarlo.

## Agregar una marca

1. Crear `datos/nombre-de-la-marca.json` con la forma de arriba.
2. Añadir `"nombre-de-la-marca"` a la lista de `datos/marcas.json`.

## Probar en la computadora

La página lee los datos con `fetch`, así que hay que abrirla con un servidor (no con doble clic):

```
python3 -m http.server
```

y entrar a http://localhost:8000
