# Starter limpio para GitHub Pages

Este pack esta pensado para un flujo sencillo:

- **Hosting**: GitHub Pages
- **Sin CMS ni login**
- **Guías**: archivos Markdown (`content/guias/*.md`)
- **Listado de guías**: `data/guias.csv`
- **Mapa**: `data/mapa.csv`
- **Herramienta para sacar coordenadas**: `utilidades/coordenadas.html`

## Que edita cada persona

### Para editar una guia existente
1. Ir a `content/guias/slug-de-la-guia.md`
2. Cambiar el texto
3. Guardar el commit

### Para crear una guia nueva
1. Duplicar `content/guias/_plantilla.md`
2. Renombrarla, por ejemplo: `ciudad-puerto.md`
3. Rellenar el contenido
4. Añadir una fila nueva en `data/guias.csv`
5. Si quieres que salga en el mapa, añade tambien una fila en `data/mapa.csv`

### Para editar el mapa
1. Ir a `utilidades/coordenadas.html`
2. Hacer clic en el punto del mapa
3. Copiar los valores X e Y
4. Pegarlos en la fila correspondiente dentro de `data/mapa.csv`

## Archivos importantes

- `index.html` -> portada con acceso a guias y mapa
- `guias.html` -> indice de guias
- `mapa.html` -> mapa interactivo
- `guia.html?slug=...` -> pagina individual de cada guia
- `data/guias.csv` -> listado/indice de guias
- `data/mapa.csv` -> puntos del mapa
- `content/guias/` -> textos de las guias

## Publicar en GitHub Pages
1. Subir todos los archivos descomprimidos al repo
2. Ir a **Settings -> Pages**
3. Elegir **Deploy from a branch**
4. Seleccionar `main` y carpeta `/ (root)`

## Sugerencia de uso real
- Que **todo el mundo edite las guias**
- Que **solo una persona toque `data/mapa.csv`**

Es el flujo mas estable sin meter CMS ni autenticacion.
