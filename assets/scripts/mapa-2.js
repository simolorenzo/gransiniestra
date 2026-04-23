function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function localParseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (current === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (current === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((current === "\n" || current === "\r") && !inQuotes) {
      if (current === "\r" && next === "\n") {
        index += 1;
      }

      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }

      row = [];
      cell = "";
    } else {
      cell += current;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  const headers = rows.shift() || [];
  return rows.map((columns) => {
    const entry = {};
    headers.forEach((header, columnIndex) => {
      entry[header.trim()] = (columns[columnIndex] || "").trim();
    });
    return entry;
  });
}

async function loadCsvRows(path) {
  if (typeof fetchCsv === "function") {
    return fetchCsv(path);
  }

  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path}`);
  }

  return localParseCsv(await response.text());
}

function toggleOverlay(elementId, trigger) {
  const overlay = document.getElementById(elementId);

  if (!overlay) {
    return;
  }

  const nextHidden = window.getComputedStyle(overlay).display !== "none";
  overlay.style.display = nextHidden ? "none" : "block";
  trigger?.classList.toggle("is-active", !nextHidden);
}

function createMapToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "map-toolbar";
  toolbar.innerHTML = `
    <div class="map-toolbar-copy">
      <span class="section-tag">Visor</span>
      <p class="muted">Rueda o bot&oacute;n derecho para zoom. Arrastra con bot&oacute;n izquierdo para moverte.</p>
    </div>
    <div class="map-toolbar-actions">
      <button type="button" class="map-zoom-button" data-action="zoom-out" aria-label="Alejar">-</button>
      <output class="map-zoom-readout" aria-live="polite">100%</output>
      <button type="button" class="map-zoom-button" data-action="zoom-in" aria-label="Acercar">+</button>
      <button type="button" class="map-zoom-button map-zoom-reset" data-action="reset">Reset</button>
    </div>
  `;

  return toolbar;
}

function buildViewport(mapContainer) {
  const viewport = document.createElement("div");
  viewport.className = "map-viewport";

  const stage = document.createElement("div");
  stage.className = "map-stage";

  const children = Array.from(mapContainer.childNodes);
  children.forEach((node) => stage.appendChild(node));

  viewport.appendChild(stage);
  mapContainer.replaceChildren(createMapToolbar(), viewport);

  return {
    viewport,
    stage,
    baseImage: stage.querySelector(".map-image")
  };
}

function waitForImageReady(image) {
  if (!image) {
    return Promise.resolve();
  }

  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
      resolve();
    };

    const handleError = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
      reject(new Error("No se pudo cargar la imagen del mapa."));
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

function parsePercent(value) {
  return Number.parseFloat(String(value).replace("%", "")) || 0;
}

function extractMarkerTitle(content) {
  const titleNode = content?.querySelector(".descriptitulo");
  if (titleNode) {
    return titleNode.textContent.trim();
  }

  const fallback = content?.textContent?.trim() ?? "";
  return fallback.slice(0, 80) || "Punto del mapa";
}

function renderSidebarDetail(sidebar, content) {
  let detail = sidebar.querySelector(".sidebar-detail");

  if (!detail) {
    detail = document.createElement("section");
    detail.className = "sidebar-section sidebar-detail detail-panel";
    const collections = sidebar.querySelector(".sidebar-collections");
    if (collections) {
      sidebar.insertBefore(detail, collections);
    } else {
      sidebar.appendChild(detail);
    }
  }

  if (!content) {
    detail.innerHTML = `
      <div class="section-tag">Lugar activo</div>
      <p class="muted">Selecciona un icono del mapa para ver sus detalles aqu&iacute;.</p>
    `;
    return;
  }

  const title = content.querySelector(".descriptitulo");
  const body = content.querySelector(".descrip");
  const intro = content.querySelector(".iconot2");

  detail.innerHTML = `
    <div class="section-tag">Lugar activo</div>
    <div class="sidebar-detail-body">
      ${title ? `<div class="sidebar-detail-title">${title.innerHTML}</div>` : ""}
      ${
        body
          ? `<div class="sidebar-detail-copy">${body.innerHTML}</div>`
          : intro
            ? `<div class="sidebar-detail-copy">${intro.innerHTML}</div>`
            : `<p class="muted">Selecciona un icono del mapa para ver sus detalles aqu&iacute;.</p>`
      }
    </div>
  `;
}

function setupZoom(mapContainer, viewport, stage, baseImage) {
  const readout = mapContainer.querySelector(".map-zoom-readout");
  const state = {
    zoom: 1,
    minZoom: 1,
    maxZoom: 4,
    x: 0,
    y: 0,
    mode: null,
    startX: 0,
    startY: 0,
    startZoom: 1,
    dragging: false,
    contentWidth: Math.max(baseImage?.naturalWidth || baseImage?.clientWidth || 1, 1),
    contentHeight: Math.max(baseImage?.naturalHeight || baseImage?.clientHeight || 1, 1)
  };

  stage.style.width = `${state.contentWidth}px`;
  stage.style.height = `${state.contentHeight}px`;

  const clampPosition = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const scaledWidth = state.contentWidth * state.zoom;
    const scaledHeight = state.contentHeight * state.zoom;
    const minX = width - scaledWidth;
    const minY = height - scaledHeight;

    state.x = clamp(state.x, minX, 0);
    state.y = clamp(state.y, minY, 0);
  };

  const syncZoomBounds = (preserveCenter = true) => {
    const viewportWidth = Math.max(viewport.clientWidth, 1);
    const viewportHeight = Math.max(viewport.clientHeight, 1);
    const previousZoom = state.zoom;
    const centerX = (viewportWidth / 2 - state.x) / previousZoom;
    const centerY = (viewportHeight / 2 - state.y) / previousZoom;

    state.minZoom = Math.max(
      viewportWidth / state.contentWidth,
      viewportHeight / state.contentHeight
    );
    state.maxZoom = Math.max(state.minZoom * 5, state.minZoom + 2.5);
    state.zoom = Math.max(state.zoom, state.minZoom);

    if (preserveCenter) {
      state.x = viewportWidth / 2 - centerX * state.zoom;
      state.y = viewportHeight / 2 - centerY * state.zoom;
    } else {
      state.x = (viewportWidth - state.contentWidth * state.zoom) / 2;
      state.y = (viewportHeight - state.contentHeight * state.zoom) / 2;
    }
  };

  const applyTransform = () => {
    clampPosition();
    stage.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.zoom})`;
    mapContainer.style.setProperty("--map-zoom", state.zoom.toFixed(3));

    if (readout) {
      const label = `${Math.round((state.zoom / state.minZoom) * 100)}%`;
      readout.value = label;
      readout.textContent = label;
    }
  };

  const zoomTo = (nextZoom, originX = viewport.clientWidth / 2, originY = viewport.clientHeight / 2) => {
    const previousZoom = state.zoom;
    const zoom = clamp(nextZoom, state.minZoom, state.maxZoom);

    if (zoom === previousZoom) {
      return;
    }

    const contentX = (originX - state.x) / previousZoom;
    const contentY = (originY - state.y) / previousZoom;

    state.zoom = zoom;
    state.x = originX - contentX * zoom;
    state.y = originY - contentY * zoom;
    applyTransform();
  };

  const resetZoom = () => {
    syncZoomBounds(false);
    applyTransform();
  };

  const centerOnMarker = (label) => {
    if (!label) {
      return;
    }

    const x = (parsePercent(label.style.left) / 100) * state.contentWidth;
    const y = (parsePercent(label.style.top) / 100) * state.contentHeight;

    state.x = viewport.clientWidth / 2 - x * state.zoom;
    state.y = viewport.clientHeight / 2 - y * state.zoom;
    applyTransform();
  };

  const screenToMap = (clientX, clientY) => {
    const rect = viewport.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const relativeY = clientY - rect.top;
    const mapX = ((relativeX - state.x) / state.zoom / state.contentWidth) * 100;
    const mapY = ((relativeY - state.y) / state.zoom / state.contentHeight) * 100;

    return {
      x: clamp(mapX, 0, 100),
      y: clamp(mapY, 0, 100)
    };
  };

  mapContainer.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const step = Math.max(state.minZoom * 0.2, 0.12);

      if (action === "zoom-in") {
        zoomTo(state.zoom + step);
      } else if (action === "zoom-out") {
        zoomTo(state.zoom - step);
      } else {
        resetZoom();
      }
    });
  });

  viewport.addEventListener(
    "wheel",
    (event) => {
      if (event.target.closest(".map-marker")) {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const originX = event.clientX - rect.left;
      const originY = event.clientY - rect.top;
      const delta = event.deltaY < 0 ? Math.max(state.minZoom * 0.16, 0.1) : -Math.max(state.minZoom * 0.16, 0.1);
      zoomTo(state.zoom + delta, originX, originY);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".map-marker, .map-toolbar, .map-zoom-button")) {
      return;
    }

    event.preventDefault();

    if (event.button === 2) {
      state.mode = "zoom";
      state.startY = event.clientY;
      state.startZoom = state.zoom;
      viewport.classList.add("is-zooming");
    } else {
      state.mode = "pan";
      state.startX = event.clientX - state.x;
      state.startY = event.clientY - state.y;
      viewport.classList.add("is-dragging");
    }

    state.dragging = true;
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
      return;
    }

    if (state.mode === "zoom") {
      const deltaY = state.startY - event.clientY;
      zoomTo(state.startZoom + deltaY * Math.max(state.minZoom * 0.004, 0.0035));
      return;
    }

    state.x = event.clientX - state.startX;
    state.y = event.clientY - state.startY;
    applyTransform();
  });

  const stopDragging = (event) => {
    if (!state.dragging) {
      return;
    }

    state.dragging = false;
    state.mode = null;
    viewport.classList.remove("is-dragging");
    viewport.classList.remove("is-zooming");

    if (event?.pointerId !== undefined) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  viewport.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });

  viewport.addEventListener("selectstart", (event) => {
    event.preventDefault();
  });

  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("pointerleave", stopDragging);

  window.addEventListener("resize", () => {
    syncZoomBounds(true);
    applyTransform();
  });

  syncZoomBounds(false);
  applyTransform();

  return { centerOnMarker, resetZoom, screenToMap };
}

function readLegacyMarkers(mapLayer) {
  return Array.from(mapLayer.querySelectorAll(".lugar1"))
    .map((marker, index) => {
      const label = marker.querySelector("label");
      const content = marker.querySelector(".contentlugar");
      const titleNode = content?.querySelector(".descriptitulo");
      const bodyNode = content?.querySelector(".descrip");

      if (!label || !content || !titleNode) {
        return null;
      }

      return {
        id: marker.querySelector("input")?.id || `mapa-punto-${index + 1}`,
        title: titleNode.textContent.trim(),
        x: parsePercent(label.style.left),
        y: parsePercent(label.style.top),
        marker_html: label.innerHTML.trim(),
        title_html: titleNode.innerHTML.trim(),
        body_html: bodyNode?.innerHTML.trim() || "",
        source: "legacy"
      };
    })
    .filter(Boolean)
    .filter((marker) => marker.title && marker.title !== "Explora el mundo dándole click a los iconos en el mapa para ver su información, diviértete!");
}

function normalizeMarkerRow(row, index) {
  const x = Number.parseFloat(String(row.x).replace(",", ".")) || 0;
  const y = Number.parseFloat(String(row.y).replace(",", ".")) || 0;

  return {
    id: row.id || `mapa-punto-${index + 1}`,
    title: row.title || `Punto ${index + 1}`,
    x,
    y,
    marker_html: row.marker_html || '<span class="fas fa-map-marker-alt"></span>',
    title_html: row.title_html || row.title || `Punto ${index + 1}`,
    body_html: row.body_html || "",
    source: "csv"
  };
}

function normalizeCollectionRow(row, index) {
  return {
    id: row.id || `${row.layer_id || "capa"}-${index + 1}`,
    layerId: row.layer_id || "recoleccion",
    category: row.category || "general",
    name: row.name || `Punto ${index + 1}`,
    x: Number.parseFloat(String(row.x).replace(",", ".")) || 0,
    y: Number.parseFloat(String(row.y).replace(",", ".")) || 0,
    color: row.color || "#da4444",
    iconHtml: row.icon_html || '<span class="fas fa-circle"></span>'
  };
}

async function getMarkerData(mapLayer) {
  const legacyMarkers = readLegacyMarkers(mapLayer);

  try {
    const rows = await loadCsvRows("./data/mapa-puntos.csv");
    if (!rows.length) {
      return legacyMarkers;
    }

    return rows.map(normalizeMarkerRow);
  } catch (error) {
    console.warn("No se pudo cargar data/mapa-puntos.csv. Uso los puntos embebidos del HTML.", error);
    return legacyMarkers;
  }
}

async function getCollectionData() {
  try {
    const rows = await loadCsvRows("./data/mapa-recoleccion.csv");
    return rows.map(normalizeCollectionRow);
  } catch (error) {
    console.warn("No se pudo cargar data/mapa-recoleccion.csv.", error);
    return [];
  }
}

function ensureMapLayer(stage) {
  let mapLayer = stage.querySelector(".lugar");

  if (!mapLayer) {
    mapLayer = document.createElement("div");
    mapLayer.className = "lugar";
    stage.appendChild(mapLayer);
  }

  return mapLayer;
}

function ensureOverlayRoot(stage) {
  let root = stage.querySelector(".map-overlay-root");

  if (!root) {
    root = document.createElement("div");
    root.className = "map-overlay-root";
    stage.appendChild(root);
  }

  return root;
}

function renderMarkers(mapLayer, markers) {
  mapLayer.innerHTML = markers
    .map((marker, index) => {
      const inputId = `map-marker-${index + 1}`;
      return `
        <div class="lugar1" data-marker-id="${marker.id}">
          <input type="radio" name="tabthree-group-3" id="${inputId}">
          <label for="${inputId}" style="top:${marker.y}%;left:${marker.x}%;">${marker.marker_html}</label>
          <div class="contentlugar">
            <div class="descriptitulo">${marker.title_html}</div>
            <div class="descrip">${marker.body_html}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderCollectionLayers(overlayRoot, rows) {
  overlayRoot.innerHTML = "";

  const grouped = rows.reduce((map, row) => {
    if (!map.has(row.layerId)) {
      map.set(row.layerId, []);
    }

    map.get(row.layerId).push(row);
    return map;
  }, new Map());

  grouped.forEach((items, layerId) => {
    const layer = document.createElement("div");
    layer.className = "map-resource-layer";
    layer.id = `layer-${layerId}`;
    layer.style.display = "none";

    items.forEach((item) => {
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "map-resource-dot";
      marker.style.left = `${item.x}%`;
      marker.style.top = `${item.y}%`;
      marker.style.setProperty("--resource-color", item.color);
      marker.setAttribute("aria-label", item.name);
      marker.innerHTML = `
        <span class="map-resource-glyph">${item.iconHtml}</span>
        <span class="map-resource-pulse"></span>
      `;
      layer.appendChild(marker);
    });

    overlayRoot.appendChild(layer);
  });
}

function renderCollectionControls(sidebar, rows) {
  const vegetationSection = sidebar.querySelector("#content2 .nojodas");
  if (!vegetationSection || !rows.length) {
    return;
  }

  vegetationSection.querySelector(".dynamic-collection-group")?.remove();

  const grouped = rows.reduce((map, row) => {
    if (!map.has(row.layerId)) {
      map.set(row.layerId, row);
    }

    return map;
  }, new Map());

  const unresolved = [];

  Array.from(grouped.values()).forEach((item, index) => {
    const legacyLabel = Array.from(vegetationSection.querySelectorAll("label[data-toggle-target]")).find((label) => {
      const text = label.textContent.replace(/\*/g, "").trim().toLowerCase();
      return text === item.name.trim().toLowerCase();
    });

    if (legacyLabel) {
      legacyLabel.dataset.toggleTarget = `layer-${item.layerId}`;
      legacyLabel.classList.add("is-dynamic");
      return;
    }

    unresolved.push({ item, index });
  });

  if (!unresolved.length) {
    return;
  }

  const group = document.createElement("div");
  group.className = "dynamic-collection-group";

  const title = document.createElement("p");
  title.className = "dynamic-collection-title";
  title.textContent = "Capas por CSV";
  group.appendChild(title);

  unresolved.forEach(({ item, index }) => {
    const input = document.createElement("input");
    input.className = "checkbox-booking";
    input.type = "checkbox";
    input.name = "booking";
    input.id = `dynamic-booking-${index + 1}`;

    const label = document.createElement("label");
    label.className = "for-checkbox-booking is-dynamic";
    label.setAttribute("for", input.id);
    label.dataset.toggleTarget = `layer-${item.layerId}`;
    label.innerHTML = `<span class="text">${item.name}</span>`;

    group.append(input, label);
  });

  vegetationSection.prepend(group);
}

function enhanceMarkers(mapContainer, sidebar, zoomApi) {
  const markers = Array.from(mapContainer.querySelectorAll(".lugar1"));

  const updateSelection = (center = false) => {
    const checkedInput = mapContainer.querySelector('input[name="tabthree-group-3"]:checked');

    markers.forEach((marker) => {
      const input = marker.querySelector('input[name="tabthree-group-3"]');
      const label = marker.querySelector("label");
      const isSelected = input === checkedInput;
      label?.classList.toggle("is-selected", isSelected);
    });

    const activeMarker = checkedInput?.closest(".lugar1");
    const activeContent = activeMarker?.querySelector(".contentlugar");
    const activeLabel = activeMarker?.querySelector("label");

    renderSidebarDetail(sidebar, activeContent);

    if (center && activeLabel) {
      zoomApi.centerOnMarker(activeLabel);
    }
  };

  markers.forEach((marker) => {
    const input = marker.querySelector('input[name="tabthree-group-3"]');
    const label = marker.querySelector("label");
    const content = marker.querySelector(".contentlugar");
    const glyph = label?.querySelector("span, i");

    if (!input || !label || !content) {
      return;
    }

    label.classList.add("map-marker");
    label.setAttribute("tabindex", "0");
    label.setAttribute("role", "button");
    label.setAttribute("aria-label", extractMarkerTitle(content));

    if (glyph) {
      glyph.classList.add("marker-glyph");
    } else {
      label.classList.add("is-placeholder");
    }

    label.addEventListener("click", () => {
      window.requestAnimationFrame(() => updateSelection(true));
    });

    label.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      input.checked = true;
      updateSelection(true);
    });

    input.addEventListener("change", () => updateSelection(false));
  });

  updateSelection(false);
}

function bindOverlayToggles() {
  document.querySelectorAll("[data-toggle-target]").forEach((trigger) => {
    const targetId = trigger.dataset.toggleTarget;
    const overlay = document.getElementById(targetId);

    if (overlay && window.getComputedStyle(overlay).display !== "none") {
      trigger.classList.add("is-active");
    }

    trigger.addEventListener("click", () => toggleOverlay(targetId, trigger));
  });
}

function moveCollectionsIntoSidebar(sidebar) {
  const recol = document.querySelector(".recol");
  if (!recol || sidebar.querySelector(".sidebar-collections")) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "sidebar-section sidebar-collections";
  panel.innerHTML = `
    <div class="section-tag">Puntos de recolecci&oacute;n</div>
    <p class="muted">Las capas siguen funcionando, pero ahora viven dentro del lateral para que el mapa quede limpio.</p>
  `;

  panel.appendChild(recol);
  sidebar.appendChild(panel);
}

function ensureCoordinateEditor(sidebar) {
  let editor = sidebar.querySelector(".map-editor");

  if (!editor) {
    editor = document.createElement("section");
    editor.className = "sidebar-section map-editor";
    editor.innerHTML = `
      <div class="section-tag">Editor de coordenadas</div>
      <p class="muted">Activa el modo y haz click en el mapa para sacar coordenadas en porcentaje listas para el CSV.</p>
      <button type="button" class="map-editor-toggle" aria-pressed="false">Activar modo coordenadas</button>
      <div class="map-editor-output">
        <div class="map-editor-pair"><span>X</span><strong data-map-x>--</strong></div>
        <div class="map-editor-pair"><span>Y</span><strong data-map-y>--</strong></div>
      </div>
      <code class="map-editor-code" data-map-row>id,nombre,x,y,marker_html,title_html,body_html</code>
    `;
    sidebar.appendChild(editor);
  }

  const toggle = editor.querySelector(".map-editor-toggle");
  const xNode = editor.querySelector("[data-map-x]");
  const yNode = editor.querySelector("[data-map-y]");
  const rowNode = editor.querySelector("[data-map-row]");

  const state = { active: false };

  toggle?.addEventListener("click", () => {
    state.active = !state.active;
    editor.classList.toggle("is-active", state.active);
    toggle.setAttribute("aria-pressed", String(state.active));
    toggle.textContent = state.active ? "Desactivar modo coordenadas" : "Activar modo coordenadas";
  });

  return {
    isActive() {
      return state.active;
    },
    update(point) {
      xNode.textContent = point.x.toFixed(2);
      yNode.textContent = point.y.toFixed(2);
      rowNode.textContent = `nuevo-punto,Nuevo punto,${point.x.toFixed(2)},${point.y.toFixed(2)},"<span class=""fas fa-map-marker-alt""></span>","Nuevo punto","Describe aqu&iacute; el lugar"`;
    }
  };
}

function bindCoordinateCapture(viewport, zoomApi, editor) {
  if (!viewport || !zoomApi || !editor) {
    return;
  }

  viewport.addEventListener("click", (event) => {
    if (!editor.isActive() || event.target.closest(".map-toolbar")) {
      return;
    }

    const point = zoomApi.screenToMap(event.clientX, event.clientY);
    editor.update(point);
  });
}

async function initializeMapPage() {
  const mapContainer = document.querySelector(".map-container");
  const sidebar = document.querySelector(".sidebar");

  if (!mapContainer || !sidebar) {
    return;
  }

  try {
    moveCollectionsIntoSidebar(sidebar);

    const { viewport, stage, baseImage } = buildViewport(mapContainer);
    mapContainer.classList.add("is-enhanced");
    await waitForImageReady(baseImage);

    const zoomApi = setupZoom(mapContainer, viewport, stage, baseImage);
    const mapLayer = ensureMapLayer(stage);
    const overlayRoot = ensureOverlayRoot(stage);
    const markers = await getMarkerData(mapLayer);
    const collectionRows = await getCollectionData();

    renderMarkers(mapLayer, markers);
    renderCollectionLayers(overlayRoot, collectionRows);
    renderSidebarDetail(sidebar, null);
    enhanceMarkers(mapContainer, sidebar, zoomApi);
    renderCollectionControls(sidebar, collectionRows);
    bindOverlayToggles();

    const editor = ensureCoordinateEditor(sidebar);
    bindCoordinateCapture(viewport, zoomApi, editor);
  } catch (error) {
    console.error("No se pudo inicializar el visor del mapa.", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initializeMapPage();
});
