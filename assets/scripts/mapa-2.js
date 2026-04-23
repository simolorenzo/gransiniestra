function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
      <p class="muted">Rueda para acercar, arrastra para moverte.</p>
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
  mapContainer.append(createMapToolbar(), viewport);

  return { viewport, stage };
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
    detail.className = "sidebar-detail detail-panel";
    sidebar.appendChild(detail);
  }

  if (!content) {
    detail.innerHTML = `
      <div class="section-tag">Lugar activo</div>
      <p class="muted">Selecciona un icono del mapa para ver sus detalles aquí.</p>
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
            : `<p class="muted">Selecciona un icono del mapa para ver sus detalles aquí.</p>`
      }
    </div>
  `;
}

function parsePercent(value) {
  return Number.parseFloat(String(value).replace("%", "")) || 0;
}

function setupZoom(mapContainer, viewport, stage) {
  const readout = mapContainer.querySelector(".map-zoom-readout");
  const state = {
    zoom: 1,
    minZoom: 1,
    maxZoom: 3.5,
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    dragging: false
  };

  const clampPosition = () => {
    const width = viewport.clientWidth;
    const height = viewport.clientHeight;
    const minX = width - width * state.zoom;
    const minY = height - height * state.zoom;

    state.x = clamp(state.x, minX, 0);
    state.y = clamp(state.y, minY, 0);
  };

  const applyTransform = () => {
    clampPosition();
    stage.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.zoom})`;
    mapContainer.style.setProperty("--map-zoom", state.zoom.toFixed(3));
    if (readout) {
      readout.value = `${Math.round(state.zoom * 100)}%`;
      readout.textContent = `${Math.round(state.zoom * 100)}%`;
    }
  };

  const zoomTo = (nextZoom, originX = viewport.clientWidth / 2, originY = viewport.clientHeight / 2) => {
    const prevZoom = state.zoom;
    const zoom = clamp(nextZoom, state.minZoom, state.maxZoom);

    if (zoom === prevZoom) {
      return;
    }

    const contentX = (originX - state.x) / prevZoom;
    const contentY = (originY - state.y) / prevZoom;

    state.zoom = zoom;
    state.x = originX - contentX * zoom;
    state.y = originY - contentY * zoom;
    applyTransform();
  };

  const resetZoom = () => {
    state.zoom = 1;
    state.x = 0;
    state.y = 0;
    applyTransform();
  };

  const centerOnMarker = (label) => {
    if (!label) {
      return;
    }

    const x = (parsePercent(label.style.left) / 100) * viewport.clientWidth;
    const y = (parsePercent(label.style.top) / 100) * viewport.clientHeight;

    state.x = viewport.clientWidth / 2 - x * state.zoom;
    state.y = viewport.clientHeight / 2 - y * state.zoom;
    applyTransform();
  };

  mapContainer.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;

      if (action === "zoom-in") {
        zoomTo(state.zoom + 0.2);
      } else if (action === "zoom-out") {
        zoomTo(state.zoom - 0.2);
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
      const delta = event.deltaY < 0 ? 0.16 : -0.16;
      zoomTo(state.zoom + delta, originX, originY);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".map-marker, .map-toolbar, .map-zoom-button")) {
      return;
    }

    state.dragging = true;
    state.startX = event.clientX - state.x;
    state.startY = event.clientY - state.y;
    viewport.classList.add("is-dragging");
    viewport.setPointerCapture(event.pointerId);
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!state.dragging) {
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
    viewport.classList.remove("is-dragging");
    if (event?.pointerId !== undefined) {
      viewport.releasePointerCapture(event.pointerId);
    }
  };

  viewport.addEventListener("pointerup", stopDragging);
  viewport.addEventListener("pointercancel", stopDragging);
  viewport.addEventListener("pointerleave", stopDragging);

  window.addEventListener("resize", applyTransform);
  applyTransform();

  return { centerOnMarker, resetZoom };
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

function initializeMapPage() {
  const mapContainer = document.querySelector(".map-container");
  const sidebar = document.querySelector(".sidebar");

  if (!mapContainer || !sidebar) {
    return;
  }

  try {
    const { viewport, stage } = buildViewport(mapContainer);
    const zoomApi = setupZoom(mapContainer, viewport, stage);

    bindOverlayToggles();
    enhanceMarkers(mapContainer, sidebar, zoomApi);
  } catch (error) {
    console.error("No se pudo inicializar el visor del mapa.", error);
  }
}

document.addEventListener("DOMContentLoaded", initializeMapPage);
