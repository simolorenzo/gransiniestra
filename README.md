# Gran Siniestra

Atlas estatico para una campana de rol: archivo de guias, mapa enlazado y una utilidad minima para colocar puntos sin depender de paneles externos.

## Estructura

- `content/guias/*.md`: entradas largas en Markdown.
- `data/guias.csv`: indice publico, categoria y descripcion corta.
- `data/mapa.csv`: puntos del mapa y enlace con cada guia.
- `guia.html`: vista individual de una entrada.
- `guias.html`: archivo navegable con filtro.
- `mapa.html`: mapa con marcadores.
- `utilidades/coordenadas.html`: herramienta para obtener X e Y.

## Flujo de trabajo

1. Crear o editar una entrada dentro de `content/guias/`.
2. Registrar su ficha en `data/guias.csv`.
3. Si debe verse en el mapa, anadirla tambien en `data/mapa.csv`.

## Publicacion

El proyecto esta pensado para GitHub Pages. No necesita backend ni dependencias de build: basta con publicar el repositorio tal como esta.

## Criterio editorial

- Las descripciones del CSV deben ser breves y especificas.
- Las guias funcionan mejor cuando aportan tono, conflicto y uso practico en mesa.
- El mapa debe senalar solo puntos con valor real para la campana, no relleno.
