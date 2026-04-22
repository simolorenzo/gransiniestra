# Discord RP starter (GitHub Pages + Decap CMS)

Base minima para:
- GitHub Pages
- guias en Markdown
- mapa de imagen con hotspots por porcentaje
- panel Decap CMS en /admin

## Que funciona ya
- Web publica del mapa
- Guias cargadas desde content/guias/*.md
- Hotspots del mapa cargados desde data/mapa.json
- Interfaz de Decap montada en /admin

## Ojo
El login/guardado de Decap con backend GitHub necesita resolver la autenticacion.
La web publica si funciona tal cual en GitHub Pages.

## Pasos
1. Sube todo esto al repo.
2. Cambia `TU-USUARIO` y `TU-REPO` en `admin/config.yml`.
3. Activa GitHub Pages desde la rama `main` y la raiz del repo.
4. Sustituye `assets/mapa.svg` por vuestro mapa real si hace falta.
5. Edita `data/mapa.json` para colocar los puntos.
6. Crea o edita guias dentro de `content/guias/`.

## Notas
- Las posiciones `x` e `y` del mapa van de 0 a 100.
- Cada `guideSlug` debe coincidir con el nombre del archivo Markdown.
