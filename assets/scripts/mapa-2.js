function toggleDisplay(elementId) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  const isHidden = window.getComputedStyle(element).display === "none";
  element.style.display = isHidden ? "inline" : "none";
}

function bindOverlayToggles() {
  document.querySelectorAll("[data-toggle-target]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      toggleDisplay(trigger.dataset.toggleTarget);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  bindOverlayToggles();
});
