const payloadElement = document.getElementById("zerux-dev-payload");
const payload = payloadElement ? JSON.parse(payloadElement.textContent || "{}") : {};
const themeStorageKey = "zerux:devtools:theme";
const themeModes = ["system", "dark", "light"];
let forcedThemeMode = null;
const moduleMounts = new Map();

let applicationState = {
  app: payload.app?.routeName || null,
  identifier: payload.identifier || null,
  bootstrap: null,
  socket: null,
  devtoolsSocket: null
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const getSystemTheme = () =>
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const applyTheme = (mode) => {
  const effective = forcedThemeMode === "dark" || forcedThemeMode === "light"
    ? forcedThemeMode
    : mode === "system" ? getSystemTheme() : mode;
  document.documentElement.setAttribute("data-theme", effective);
  const label = document.querySelector("[data-theme-label]");
  if (label) {
    label.textContent = `Theme: ${mode[0].toUpperCase()}${mode.slice(1)}`;
  }
};

const getSavedTheme = () => localStorage.getItem(themeStorageKey) || "system";

const broadcastThemeToParent = (mode) => {
  if (window.parent === window) return;
  window.parent.postMessage({
    type: "zerux:theme-sync",
    mode,
    effectiveTheme: mode === "system" ? getSystemTheme() : mode
  }, "*");
};

const setupThemeToggle = () => {
  let mode = getSavedTheme();
  applyTheme(mode);
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const currentIndex = themeModes.indexOf(mode);
    mode = themeModes[(currentIndex + 1) % themeModes.length];
    localStorage.setItem(themeStorageKey, mode);
    forcedThemeMode = null;
    applyTheme(mode);
    broadcastThemeToParent(mode);
  });
  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
    if (mode === "system") {
      applyTheme(mode);
      broadcastThemeToParent(mode);
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key === themeStorageKey) {
      mode = getSavedTheme();
      forcedThemeMode = null;
      applyTheme(mode);
      broadcastThemeToParent(mode);
    }
  });
  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "zerux:theme-sync") return;
    const nextMode = event.data.mode;
    const nextEffectiveTheme = event.data.effectiveTheme;
    if (nextMode === "system" || nextMode === "dark" || nextMode === "light") {
      mode = nextMode;
      localStorage.setItem(themeStorageKey, nextMode);
    }
    forcedThemeMode = nextEffectiveTheme === "dark" || nextEffectiveTheme === "light"
      ? nextEffectiveTheme
      : null;
    applyTheme(mode);
  });
  broadcastThemeToParent(mode);
};

const renderOverview = (snapshot, modules) => {
  const root = document.querySelector("[data-overview-root]");
  if (root) root.textContent = snapshot.rootDir || "unknown";
  const manifest = document.querySelector("[data-overview-manifest]");
  if (manifest) manifest.textContent = snapshot.manifestPath || "missing";
  const log = document.querySelector("[data-overview-log]");
  if (log) log.textContent = snapshot.logFilePath || "missing";
  const updated = document.querySelector("[data-overview-updated]");
  if (updated) updated.textContent = snapshot.updatedAt || "unknown";
  const port = document.querySelector("[data-overview-port]");
  if (port) port.textContent = String(snapshot.appPort ?? "unknown");
  const mode = document.querySelector("[data-overview-mode]");
  if (mode) mode.textContent = snapshot.mode || "unknown";
  const routes = document.querySelector("[data-overview-routes]");
  if (routes) routes.textContent = String((snapshot.routes || []).length);
  const moduleCount = document.querySelector("[data-overview-modules]");
  if (moduleCount) moduleCount.textContent = String(modules.length);
  const moduleCountDetail = document.querySelector("[data-overview-module-count]");
  if (moduleCountDetail) moduleCountDetail.textContent = `${modules.length} active`;
};

const renderPages = (snapshot) => {
  const list = document.querySelector("[data-pages-list]");
  if (!list) return;
  list.innerHTML = (snapshot.routes || []).length
    ? snapshot.routes.map((route) => `
      <div class="zx-route-item">
        <strong>${escapeHtml(route.path)}</strong>
        <span>${escapeHtml((route.methods || []).join(", "))}</span>
      </div>
    `).join("")
    : `<p class="zx-empty">No routes found.</p>`;
};

const renderModules = (modules) => {
  const root = document.querySelector("[data-modules-list]");
  if (!root) return;
  root.innerHTML = modules.length
    ? modules.map((module) => `
      <article class="zx-module-card">
        <strong>${escapeHtml(module.title)}</strong>
        <span>${escapeHtml(module.description || "No description provided.")}</span>
        <small>${escapeHtml(module.packageName || module.badge || "custom module")}</small>
      </article>
    `).join("")
    : `<p class="zx-empty">No registered devtools modules.</p>`;
};

const renderDiagnostics = (snapshot) => {
  const events = document.getElementById("events");
  if (events) {
    events.innerHTML = (snapshot.clientEvents || []).length
      ? snapshot.clientEvents.slice().reverse().map((event) => {
          const css = event.type === "error" ? "event-error" : event.type === "warn" ? "event-warn" : "event-info";
          return `<code class="${css}">[${escapeHtml(event.type || "info")}] ${escapeHtml(event.message || JSON.stringify(event))}</code>`;
        }).join("")
      : `<div class="zx-empty">No client events yet.</div>`;
  }
  const logs = document.getElementById("logs");
  if (logs) {
    logs.textContent = (snapshot.logs || []).join("\n") || "No logs yet.";
  }
};

const createModuleApi = (moduleId) => async (name, options = {}) => {
  const url = new URL(`/${applicationState.app}/__zerux/modules/${moduleId}/api/${name}`, window.location.origin);
  if (applicationState.identifier) {
    url.searchParams.set("identifier", applicationState.identifier);
  }
  url.searchParams.set("requester", moduleId);
  const method = options.method || "POST";
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(options.body ?? {})
  });
  return response.json();
};

const createDevtoolsSocket = () => {
  const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = new URL(`${wsProtocol}//${location.host}/__zerux/ws`);
  wsUrl.searchParams.set("app", applicationState.app);
  wsUrl.searchParams.set("client", "devtools");
  if (applicationState.identifier) {
    wsUrl.searchParams.set("identifier", applicationState.identifier);
  }
  return new WebSocket(wsUrl.toString());
};

const createModuleSocket = (moduleId) => {
  const socket = applicationState.devtoolsSocket;

  return {
    raw: socket,
    requestServer(channel, payload) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: "channel",
        channelType: "server",
        app: applicationState.app,
        moduleId,
        requesterModuleId: moduleId,
        channel,
        identifier: applicationState.identifier || undefined,
        payload: payload || {}
      }));
    },
    sendPeer(channel, payload, targetModuleId) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: "channel",
        channelType: "peer",
        app: applicationState.app,
        moduleId,
        targetModuleId,
        requesterModuleId: moduleId,
        channel,
        identifier: applicationState.identifier || undefined,
        payload: payload || {}
      }));
    },
    onMessage(handler) {
      socket?.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message.moduleId && message.moduleId !== moduleId) return;
          handler(message);
        } catch {
          return;
        }
      });
    },
    close() {
      return;
    }
  };
};

const mountModulePanel = async (panel, moduleData) => {
  if (!moduleData || moduleMounts.has(panel)) {
    return;
  }

  const host = panel.querySelector("[data-module-root]");
  const template = host?.querySelector("template");
  if (!host || !template) {
    return;
  }

  const shadowRoot = host.attachShadow({ mode: "open" });
  const wrapper = document.createElement("div");
  wrapper.className = "zx-module-surface";

  const baseStyle = document.createElement("style");
  baseStyle.textContent = `
    :host { color: inherit; }
    *, *::before, *::after { box-sizing: border-box; }
    .zx-module-surface { color: inherit; font: inherit; }
  `;
  shadowRoot.append(baseStyle, wrapper);
  wrapper.append(template.content.cloneNode(true));

  if (moduleData.assets?.styleUrl) {
    const styleResponse = await fetch(moduleData.assets.styleUrl, { cache: "no-store" });
    if (styleResponse.ok) {
      const style = document.createElement("style");
      style.textContent = await styleResponse.text();
      shadowRoot.prepend(style);
    }
  }

  let lifecycle = null;
  if (moduleData.assets?.scriptUrl) {
    const mod = await import(new URL(moduleData.assets.scriptUrl, window.location.origin).toString());
    const mount = mod.mount || mod.default?.mount;
    if (typeof mount === "function") {
      lifecycle = await mount({
        app: payload.app,
        identifier: payload.identifier || null,
        snapshot: applicationState.bootstrap?.snapshot || payload.snapshot,
        module: moduleData,
        root: wrapper,
        shadowRoot,
        api: createModuleApi(moduleData.id),
        socket: createModuleSocket(moduleData.id)
      });
    }
  }

  moduleMounts.set(panel, {
    refresh(nextState) {
      lifecycle?.refresh?.(nextState);
    },
    destroy() {
      lifecycle?.destroy?.();
      lifecycle?.socket?.close?.();
    }
  });
};

const setActiveSection = async (id) => {
  document.querySelectorAll("[data-section-link]").forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("data-section-link") === id);
  });

  const modules = applicationState.bootstrap?.modules || payload.modules || [];
  const moduleMap = new Map(modules.map((module) => [module.id, module]));

  for (const panel of document.querySelectorAll("[data-section-panel]")) {
    const isActive = panel.getAttribute("data-section-panel") === id;
    panel.classList.toggle("is-active", isActive);
    if (!isActive) continue;

    const moduleId = panel.getAttribute("data-module-panel");
    if (moduleId) {
      await mountModulePanel(panel, moduleMap.get(moduleId));
    }
  }
};

const setupSectionNavigation = (sections) => {
  const shell = document.querySelector(".zx-app-shell");
  const closeSidebar = () => shell?.classList.remove("is-sidebar-open");
  document.querySelectorAll("[data-section-link]").forEach((link) => {
    link.addEventListener("click", async () => {
      const id = link.getAttribute("data-section-link");
      if (!id) return;
      await setActiveSection(id);
      if (window.innerWidth <= 750) {
        closeSidebar();
      }
    });
  });
  if (sections[0]?.id) {
    void setActiveSection(sections[0].id);
  }
  document.querySelector("[data-sidebar-close]")?.addEventListener("click", closeSidebar);
  document.addEventListener("click", (event) => {
    if (window.innerWidth > 750) return;
    if (!shell?.classList.contains("is-sidebar-open")) return;
    const sidebar = document.querySelector("[data-sidebar]");
    const toggle = document.querySelector("[data-sidebar-toggle]");
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (sidebar?.contains(target) || toggle?.contains(target)) return;
    closeSidebar();
  });
};

const setupApplication = async () => {
  const app = payload.app?.routeName;
  if (!app) return;

  applicationState.app = app;
  applicationState.identifier = payload.identifier || null;

  const bootstrapUrl = new URL(`/${app}/__zerux/api/bootstrap`, window.location.origin);
  if (applicationState.identifier) bootstrapUrl.searchParams.set("identifier", applicationState.identifier);

  const refresh = async () => {
    const response = await fetch(bootstrapUrl, { cache: "no-store" });
    const data = await response.json();
    applicationState.bootstrap = data;
    renderOverview(data.snapshot, data.modules || []);
    renderPages(data.snapshot);
    renderModules(data.modules || []);
    renderDiagnostics(data.snapshot);
    for (const mount of moduleMounts.values()) {
      mount.refresh?.(data);
    }
  };

  setupSectionNavigation(payload.sections || []);
  document.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => {
    document.querySelector(".zx-app-shell")?.classList.toggle("is-sidebar-open");
  });
  await refresh();

  const socket = createDevtoolsSocket();
  applicationState.devtoolsSocket = socket;
  applicationState.socket = socket;
  socket.addEventListener("open", () => {
    const badge = document.getElementById("ws-badge");
    if (badge) badge.textContent = "ws: connected";
  });
  socket.addEventListener("message", () => {
    refresh().catch(() => undefined);
  });
  socket.addEventListener("close", () => {
    const badge = document.getElementById("ws-badge");
    if (badge) badge.textContent = "ws: reconnecting";
    setTimeout(setupApplication, 1000);
  }, { once: true });
};

setupThemeToggle();
if (payload.page === "application") {
  setupApplication().catch(() => undefined);
}
