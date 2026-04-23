function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function loadCsvRows(path) {
  if (typeof fetchCsv === "function") {
    return fetchCsv(path);
  }

  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`No se pudo cargar ${path}`);
  }

  return parseCsv(await response.text());
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }

  return text;
}

function stringifyCsv(headers, rows) {
  const lines = [headers.join(",")];

  rows.forEach((row) => {
    lines.push(headers.map((header) => escapeCsvCell(row[header] ?? "")).join(","));
  });

  return `${lines.join("\n")}\n`;
}

function createMapToolbar() {
  const toolbar = document.createElement("div");
  toolbar.className = "map-toolbar";
  toolbar.innerHTML = `
    <div class="map-toolbar-copy">
      <span class="section-tag">Editor</span>
      <p class="muted">Rueda o bot&oacute;n derecho para zoom. Arrastra con bot&oacute;n izquierdo para moverte. Arrastra un icono para recolocarlo.</p>
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
    const handleLoad = () => resolve();
    const handleError = () => reject(new Error("No se pudo cargar la imagen del mapa."));

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
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
    if (event.target.closest(".editor-marker, .map-toolbar, .map-zoom-button")) {
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

  viewport.addEventListener("contextmenu", (event) => event.preventDefault());
  viewport.addEventListener("dragstart", (event) => event.preventDefault());
  viewport.addEventListener("selectstart", (event) => event.preventDefault());
  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("pointerleave", stopDragging);

  window.addEventListener("resize", () => {
    syncZoomBounds(true);
    applyTransform();
  });

  syncZoomBounds(false);
  applyTransform();

  return { screenToMap, resetZoom };
}

const MAP_HEADERS = {
  places: ["id", "title", "x", "y", "marker_html", "title_html", "body_html"],
  resources: ["layer_id", "category", "subtype", "name", "x", "y", "color", "icon_html"]
};

const FORM_FIELDS = {
  places: [
    { key: "id", label: "ID", type: "text" },
    { key: "title", label: "Título", type: "text" },
    { key: "x", label: "X", type: "number", step: "0.01" },
    { key: "y", label: "Y", type: "number", step: "0.01" },
    { key: "marker_html", label: "Icono HTML", type: "textarea" },
    { key: "title_html", label: "Título HTML", type: "textarea" },
    { key: "body_html", label: "Descripción HTML", type: "textarea" }
  ],
  resources: [
    { key: "layer_id", label: "Layer ID", type: "text" },
    { key: "category", label: "Categoría", type: "text" },
    { key: "subtype", label: "Subtipo", type: "text" },
    { key: "name", label: "Nombre", type: "text" },
    { key: "x", label: "X", type: "number", step: "0.01" },
    { key: "y", label: "Y", type: "number", step: "0.01" },
    { key: "color", label: "Color", type: "text" },
    { key: "icon_html", label: "Icono HTML", type: "textarea" }
  ]
};

function defaultPlace(index) {
  return {
    id: `nuevo-lugar-${index}`,
    title: "Nuevo lugar",
    x: 50,
    y: 50,
    marker_html: '<span class="fas fa-map-marker-alt" style="color:#a11011;font-size:14px;"></span>',
    title_html: "Nuevo lugar",
    body_html: "Describe aquí el lugar."
  };
}

function defaultResource(index) {
  return {
    layer_id: `nuevo-recurso-${index}`,
    category: "vegetacion",
    subtype: "subtipo",
    name: "Nuevo recurso",
    x: 50,
    y: 50,
    color: "#da4444",
    icon_html: '<span class="fas fa-spa"></span>'
  };
}

function normalizePlaceRow(row, index) {
  return {
    id: row.id || `lugar-${index + 1}`,
    title: row.title || `Lugar ${index + 1}`,
    x: Number.parseFloat(String(row.x).replace(",", ".")) || 0,
    y: Number.parseFloat(String(row.y).replace(",", ".")) || 0,
    marker_html: row.marker_html || defaultPlace(index).marker_html,
    title_html: row.title_html || row.title || `Lugar ${index + 1}`,
    body_html: row.body_html || ""
  };
}

function normalizeResourceRow(row, index) {
  return {
    layer_id: row.layer_id || `recurso-${index + 1}`,
    category: row.category || "general",
    subtype: row.subtype || "subtipo",
    name: row.name || `Recurso ${index + 1}`,
    x: Number.parseFloat(String(row.x).replace(",", ".")) || 0,
    y: Number.parseFloat(String(row.y).replace(",", ".")) || 0,
    color: row.color || "#da4444",
    icon_html: row.icon_html || defaultResource(index).icon_html
  };
}

function createEditorState() {
  return {
    mode: "places",
    places: [],
    resources: [],
    selectedIndex: 0,
    dragging: null,
    zoomApi: null,
    overlayRoot: null,
    listNode: null,
    formNode: null,
    previewNode: null,
    viewport: null
  };
}

function getDataset(state, mode = state.mode) {
  return mode === "places" ? state.places : state.resources;
}

function getCurrentItem(state) {
  return getDataset(state)[state.selectedIndex] || null;
}

function ensureSelectedIndex(state) {
  const dataset = getDataset(state);
  if (!dataset.length) {
    state.selectedIndex = -1;
    return;
  }

  state.selectedIndex = clamp(state.selectedIndex, 0, dataset.length - 1);
}

function renderList(state) {
  const dataset = getDataset(state);
  state.listNode.innerHTML = "";

  if (!dataset.length) {
    state.listNode.innerHTML = '<p class="muted">No hay elementos en este dataset.</p>';
    return;
  }

  if (state.mode === "places") {
    dataset.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `editor-list-item${index === state.selectedIndex ? " is-active" : ""}`;
      button.textContent = item.title;
      button.addEventListener("click", () => {
        state.selectedIndex = index;
        renderEditor(state);
      });
      state.listNode.appendChild(button);
    });
    return;
  }

  const grouped = dataset.reduce((map, item, index) => {
    const category = item.category || "general";
    const subtype = item.subtype || "subtipo";

    if (!map.has(category)) {
      map.set(category, new Map());
    }

    if (!map.get(category).has(subtype)) {
      map.get(category).set(subtype, []);
    }

    map.get(category).get(subtype).push({ item, index });
    return map;
  }, new Map());

  grouped.forEach((subtypes, category) => {
    const categoryHeading = document.createElement("div");
    categoryHeading.className = "editor-group-heading";
    categoryHeading.textContent = category;
    state.listNode.appendChild(categoryHeading);

    subtypes.forEach((items, subtype) => {
      const subtypeHeading = document.createElement("div");
      subtypeHeading.className = "editor-subgroup-heading";
      subtypeHeading.textContent = subtype;
      state.listNode.appendChild(subtypeHeading);

      items.forEach(({ item, index }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `editor-list-item${index === state.selectedIndex ? " is-active" : ""}`;
        button.textContent = `${item.name} · ${item.layer_id}`;
        button.addEventListener("click", () => {
          state.selectedIndex = index;
          renderEditor(state);
        });
        state.listNode.appendChild(button);
      });
    });
  });
}

function renderForm(state) {
  const item = getCurrentItem(state);
  const fields = FORM_FIELDS[state.mode];

  if (!item) {
    state.formNode.innerHTML = '<p class="muted">Selecciona o crea un elemento para editarlo.</p>';
    return;
  }

  state.formNode.innerHTML = "";

  fields.forEach((field) => {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-field";

    const label = document.createElement("span");
    label.className = "editor-field-label";
    label.textContent = field.label;

    const control = field.type === "textarea"
      ? document.createElement("textarea")
      : document.createElement("input");

    if (field.type !== "textarea") {
      control.type = field.type || "text";
    }

    if (field.step) {
      control.step = field.step;
    }

    control.className = "editor-field-control";
    control.value = item[field.key] ?? "";
    control.spellcheck = false;

    control.addEventListener("input", () => {
      let nextValue = control.value;

      if (field.key === "x" || field.key === "y") {
        nextValue = clamp(Number.parseFloat(nextValue) || 0, 0, 100);
      }

      item[field.key] = nextValue;

      if (field.key === "title" || field.key === "name") {
        renderList(state);
      }

      if (field.key === "x" || field.key === "y" || field.key === "marker_html" || field.key === "icon_html" || field.key === "color") {
        renderMarkers(state);
      }

      renderPreview(state);
    });

    wrapper.append(label, control);
    state.formNode.appendChild(wrapper);
  });
}

function renderPreview(state) {
  const headers = MAP_HEADERS[state.mode];
  const rows = getDataset(state).map((item) => ({ ...item }));
  state.previewNode.value = stringifyCsv(headers, rows);
}

function renderMarkers(state) {
  state.overlayRoot.innerHTML = "";

  const placeLayer = document.createElement("div");
  placeLayer.className = "map-editor-layer";

  const resourceLayer = document.createElement("div");
  resourceLayer.className = "map-editor-layer";

  state.places.forEach((item, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `editor-marker editor-marker-place${state.mode === "places" && index === state.selectedIndex ? " is-selected" : ""}${state.mode !== "places" ? " is-muted" : ""}`;
    marker.style.left = `${item.x}%`;
    marker.style.top = `${item.y}%`;
    marker.innerHTML = `<span class="editor-marker-glyph">${item.marker_html}</span>`;
    marker.setAttribute("aria-label", item.title);
    bindMarkerEvents(state, marker, "places", index);
    placeLayer.appendChild(marker);
  });

  state.resources.forEach((item, index) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `editor-marker editor-marker-resource${state.mode === "resources" && index === state.selectedIndex ? " is-selected" : ""}${state.mode !== "resources" ? " is-muted" : ""}`;
    marker.style.left = `${item.x}%`;
    marker.style.top = `${item.y}%`;
    marker.style.setProperty("--resource-color", item.color || "#da4444");
    marker.innerHTML = `<span class="editor-marker-glyph">${item.icon_html}</span>`;
    marker.setAttribute("aria-label", item.name);
    bindMarkerEvents(state, marker, "resources", index);
    resourceLayer.appendChild(marker);
  });

  state.overlayRoot.append(placeLayer, resourceLayer);
}

function syncActiveMarkerStyles(state) {
  state.overlayRoot.querySelectorAll(".editor-marker").forEach((marker) => {
    const markerMode = marker.dataset.mode;
    const markerIndex = Number(marker.dataset.index);
    const isSelected = markerMode === state.mode && markerIndex === state.selectedIndex;
    const isMuted = markerMode !== state.mode;

    marker.classList.toggle("is-selected", isSelected);
    marker.classList.toggle("is-muted", isMuted);
  });
}

function bindMarkerEvents(state, marker, mode, index) {
  marker.dataset.mode = mode;
  marker.dataset.index = String(index);

  marker.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    state.mode = mode;
    state.selectedIndex = index;
    syncActiveMarkerStyles(state);
    renderList(state);
    renderForm(state);
    renderPreview(state);
  });

  marker.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.mode = mode;
    state.selectedIndex = index;
    state.dragging = { mode, index };
    syncActiveMarkerStyles(state);
    renderList(state);
    renderForm(state);
    renderPreview(state);
  });
}

function renderEditor(state, options = {}) {
  ensureSelectedIndex(state);
  renderMarkers(state);
  renderList(state);
  renderForm(state);
  renderPreview(state);

  document.querySelectorAll("[data-editor-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.editorMode === state.mode);
  });
}

function createNewItem(state) {
  const center = state.zoomApi.screenToMap(
    state.viewport.getBoundingClientRect().left + state.viewport.clientWidth / 2,
    state.viewport.getBoundingClientRect().top + state.viewport.clientHeight / 2
  );

  if (state.mode === "places") {
    const item = defaultPlace(state.places.length + 1);
    item.x = center.x;
    item.y = center.y;
    state.places.push(item);
    state.selectedIndex = state.places.length - 1;
  } else {
    const item = defaultResource(state.resources.length + 1);
    item.x = center.x;
    item.y = center.y;
    state.resources.push(item);
    state.selectedIndex = state.resources.length - 1;
  }

  renderEditor(state);
}

function duplicateCurrentItem(state) {
  const item = getCurrentItem(state);
  if (!item) {
    return;
  }

  const clone = { ...item };
  clone.x = clamp((Number(clone.x) || 0) + 1.2, 0, 100);
  clone.y = clamp((Number(clone.y) || 0) + 1.2, 0, 100);

  if (state.mode === "places") {
    clone.id = `${clone.id}-copy`;
    clone.title = `${clone.title} copia`;
    state.places.splice(state.selectedIndex + 1, 0, clone);
  } else {
    clone.layer_id = `${clone.layer_id}-copy`;
    clone.name = `${clone.name} copia`;
    clone.subtype = clone.subtype || "subtipo";
    state.resources.splice(state.selectedIndex + 1, 0, clone);
  }

  state.selectedIndex += 1;
  renderEditor(state);
}

function deleteCurrentItem(state) {
  const dataset = getDataset(state);
  if (!dataset.length || state.selectedIndex < 0) {
    return;
  }

  dataset.splice(state.selectedIndex, 1);
  ensureSelectedIndex(state);
  renderEditor(state);
}

async function copyCurrentCsv(state) {
  const csv = state.previewNode.value;
  try {
    await navigator.clipboard.writeText(csv);
  } catch (_error) {
    state.previewNode.focus();
    state.previewNode.select();
    document.execCommand("copy");
  }
}

function downloadCurrentCsv(state) {
  const blob = new Blob([state.previewNode.value], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = state.mode === "places" ? "mapa-puntos.csv" : "mapa-recoleccion.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function bindSidebarActions(state) {
  document.querySelectorAll("[data-editor-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.editorMode;
      ensureSelectedIndex(state);
      renderEditor(state);
    });
  });

  document.querySelectorAll("[data-editor-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.editorAction;

      if (action === "new") {
        createNewItem(state);
      } else if (action === "duplicate") {
        duplicateCurrentItem(state);
      } else if (action === "delete") {
        deleteCurrentItem(state);
      }
    });
  });

  document.querySelectorAll("[data-editor-export]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.editorExport === "copy") {
        copyCurrentCsv(state);
      } else {
        downloadCurrentCsv(state);
      }
    });
  });
}

function bindDragEditing(state) {
  window.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
      return;
    }

    const point = state.zoomApi.screenToMap(event.clientX, event.clientY);
    const dataset = getDataset(state, state.dragging.mode);
    const item = dataset[state.dragging.index];

    if (!item) {
      return;
    }

    item.x = point.x;
    item.y = point.y;

    if (state.mode !== state.dragging.mode) {
      state.mode = state.dragging.mode;
      state.selectedIndex = state.dragging.index;
    } else {
      state.selectedIndex = state.dragging.index;
    }

    renderEditor(state);
  });

  const stopDragging = () => {
    state.dragging = null;
  };

  window.addEventListener("pointerup", stopDragging);
  window.addEventListener("pointercancel", stopDragging);
}

async function initializeEditorPage() {
  const mapContainer = document.querySelector(".map-editor-canvas");
  if (!mapContainer) {
    return;
  }

  const state = createEditorState();
  state.listNode = document.querySelector("[data-editor-list]");
  state.formNode = document.querySelector("[data-editor-form]");
  state.previewNode = document.querySelector("[data-editor-preview]");

  const { viewport, stage, baseImage } = buildViewport(mapContainer);
  state.viewport = viewport;

  await waitForImageReady(baseImage);
  mapContainer.classList.add("is-enhanced");

  const overlayRoot = document.createElement("div");
  overlayRoot.className = "map-overlay-root map-editor-overlay-root";
  stage.appendChild(overlayRoot);
  state.overlayRoot = overlayRoot;

  state.zoomApi = setupZoom(mapContainer, viewport, stage, baseImage);
  state.places = (await loadCsvRows("./data/mapa-puntos.csv")).map(normalizePlaceRow);
  state.resources = (await loadCsvRows("./data/mapa-recoleccion.csv")).map(normalizeResourceRow);

  bindSidebarActions(state);
  bindDragEditing(state);
  renderEditor(state);
}

document.addEventListener("DOMContentLoaded", () => {
  initializeEditorPage().catch((error) => {
    console.error("No se pudo inicializar el editor del mapa.", error);
  });
});
