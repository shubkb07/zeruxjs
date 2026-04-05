import { escapeHtml } from "./document.js";

export const renderThemeButton = () => `
  <button type="button" class="zx-theme-toggle" data-theme-toggle>
    <span data-theme-label>Theme: System</span>
  </button>
`;

export const renderSectionNav = (sections, activeId) => `
  <nav class="zx-sidebar-nav">
    ${sections.map((section) => `
      <button
        type="button"
        class="zx-sidebar-link${section.id === activeId ? " is-active" : ""}"
        data-section-link="${escapeHtml(section.id)}"
      >
        <span class="zx-sidebar-icon">${escapeHtml(section.icon ?? "•")}</span>
        <span>${escapeHtml(section.title)}</span>
      </button>
    `).join("")}
  </nav>
`;

export const renderSectionPanels = (sections, activeId) => `
  <div class="zx-panels">
    ${sections.map((section) => `
      <section
        class="zx-panel${section.id === activeId ? " is-active" : ""}"
        data-section-panel="${escapeHtml(section.id)}"
        ${section.moduleId ? `data-module-panel="${escapeHtml(section.moduleId)}"` : ""}
      >
        ${section.moduleId ? `
          <div class="zx-module-shell" data-module-root="${escapeHtml(section.moduleId)}" data-module-section="${escapeHtml(section.id)}">
            <template>${section.content}</template>
          </div>
        ` : section.content}
      </section>
    `).join("")}
  </div>
`;
