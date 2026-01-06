const routes = new Map();

/**
 * Rejestracja widoku
 * @param {string} path np. "/login"
 * @param {(ctx: {root: HTMLElement, params: Record<string,string>}) => void} renderFn
 */
export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

function parseHash() {
  // "#/trainer?clientId=123" -> path "/trainer" + params
  const raw = location.hash || "#/login";
  const withoutHash = raw.startsWith("#") ? raw.slice(1) : raw; // "/login..."
  const [pathPart, queryPart] = withoutHash.split("?");
  const path = pathPart || "/login";

  const params = {};
  if (queryPart) {
    const usp = new URLSearchParams(queryPart);
    for (const [k, v] of usp.entries()) params[k] = v;
  }
  return { path, params };
}

export function navigate(path) {
  location.hash = `#${path}`;
}

export function initRouter(rootEl) {
  function render() {
    const { path, params } = parseHash();
    const view = routes.get(path) || routes.get("/404");
    if (!view) {
      rootEl.innerHTML = `<div class="card"><h1 class="h1">Brak widoku</h1><p class="p">Nie zarejestrowano routingu.</p></div>`;
      return;
    }

    // aktywny link w topnav
    document.querySelectorAll("[data-nav]").forEach(a => {
      const href = a.getAttribute("href") || "";
      a.classList.toggle("active", href === `#${path}`);
    });

    view({ root: rootEl, params });
  }

  window.addEventListener("hashchange", render);
  render();
}
