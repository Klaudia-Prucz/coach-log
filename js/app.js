import { initRouter, registerRoute, navigate } from "./router.js";
import { bindOfflineBanner, getOrInitState, setRole, saveState } from "./storage.js";

const root = document.getElementById("app");

function viewLogin({ root }) {
  root.innerHTML = `
    <section class="grid">
      <div class="card">
        <h1 class="h1">CoachLog</h1>
        <p class="p">PWA do komunikacji trener ↔ podopieczny. Wybierz rolę, żeby przejść dalej.</p>

        <div class="row">
          <button class="btn primary" id="asTrainer">Wejdź jako trener</button>
          <button class="btn" id="asClient">Wejdź jako podopieczny</button>
        </div>

        <p class="p" style="margin-top:12px">Na razie to demo lokalne (LocalStorage). W kolejnych krokach dodamy PWA offline + natywne funkcje.</p>
      </div>

      <aside class="card">
        <h2 class="h2">Wymagania (check)</h2>
        <div class="row">
          <span class="badge">✅ 3 widoki</span>
          <span class="badge">⏳ manifest</span>
          <span class="badge">⏳ service worker</span>
          <span class="badge">⏳ kamera</span>
          <span class="badge">⏳ geolokalizacja</span>
        </div>
      </aside>
    </section>
  `;

  root.querySelector("#asTrainer").addEventListener("click", () => {
    setRole("trainer");
    navigate("/trainer");
  });
  root.querySelector("#asClient").addEventListener("click", () => {
    setRole("client");
    navigate("/client");
  });
}

function viewTrainer({ root }) {
  const state = getOrInitState();
  const clients = state.demo.clients;

  const listHtml = clients.map(c => `
    <div class="card" style="padding:12px">
      <div class="row" style="justify-content:space-between">
        <strong>${c.name}</strong>
        <button class="btn" data-open="${c.id}">Otwórz</button>
      </div>
      <div class="row" style="margin-top:10px">
        ${Object.entries(c.modules).map(([k,v]) => `<span class="badge">${v ? "✅" : "—"} ${k}</span>`).join("")}
      </div>
    </div>
  `).join("");

  root.innerHTML = `
    <section class="grid">
      <div class="card">
        <h1 class="h1">Panel trenera</h1>
        <p class="p">Tutaj będzie baza podopiecznych. Na razie demo z 2 osobami + edycja modułów.</p>

        <div style="display:grid; gap:12px">
          ${listHtml}
        </div>
      </div>

      <aside class="card">
        <h2 class="h2">Edycja modułów (demo)</h2>
        <p class="p">Kliknij „Otwórz”, aby zmienić moduły wybranego podopiecznego.</p>

        <div id="editor" class="card" style="background:rgba(0,0,0,.12)"></div>
      </aside>
    </section>
  `;

  const editor = root.querySelector("#editor");

  function renderEditor(clientId) {
    const client = state.demo.clients.find(x => x.id === clientId);
    if (!client) {
      editor.innerHTML = `<p class="p">Nie znaleziono podopiecznego.</p>`;
      return;
    }

    editor.innerHTML = `
      <h3 class="h2" style="margin-top:0">${client.name}</h3>
      <div class="field">
        <label class="p">Aktywne moduły</label>

        ${Object.keys(client.modules).map(key => `
          <label class="row" style="justify-content:space-between; border:1px solid var(--line); padding:10px 12px; border-radius:12px; margin:8px 0">
            <span>${key}</span>
            <input type="checkbox" data-mod="${key}" ${client.modules[key] ? "checked" : ""} />
          </label>
        `).join("")}

        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="saveMods">Zapisz</button>
          <button class="btn" id="goClient">Podgląd jako podopieczny</button>
        </div>
      </div>
    `;

    editor.querySelectorAll("input[type=checkbox][data-mod]").forEach(chk => {
      chk.addEventListener("change", (e) => {
        const mod = e.target.getAttribute("data-mod");
        client.modules[mod] = e.target.checked;
      });
    });

    editor.querySelector("#saveMods").addEventListener("click", () => {
      saveState(state);
      navigate("/trainer"); // refresh
    });

    editor.querySelector("#goClient").addEventListener("click", () => {
      // przekazujemy clientId w query
      navigate(`/client?clientId=${encodeURIComponent(client.id)}`);
    });
  }

  root.querySelectorAll("button[data-open]").forEach(btn => {
    btn.addEventListener("click", () => renderEditor(btn.getAttribute("data-open")));
  });

  // domyślnie pierwszy
  if (clients[0]) renderEditor(clients[0].id);
}

function viewClient({ root, params }) {
  const state = getOrInitState();
  const clientId = params.clientId || state.demo.clients[0]?.id;
  const client = state.demo.clients.find(x => x.id === clientId) || state.demo.clients[0];

  if (!client) {
    root.innerHTML = `<div class="card"><h1 class="h1">Brak danych</h1><p class="p">Dodaj podopiecznego w panelu trenera.</p></div>`;
    return;
  }

  const modules = client.modules;

  const tiles = Object.entries(modules)
    .filter(([, enabled]) => enabled)
    .map(([key]) => `
      <div class="card" style="padding:12px">
        <h3 class="h2" style="margin-top:0">${labelFor(key)}</h3>
        <p class="p">${descFor(key)}</p>
        <button class="btn" disabled>Wkrótce</button>
      </div>
    `).join("");

  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Dashboard podopiecznego</h1>
      <p class="p"><strong>${client.name}</strong> • widzisz tylko moduły włączone przez trenera.</p>
      <div class="row" style="margin-top:10px">
        ${Object.entries(modules).map(([k,v]) => `<span class="badge">${v ? "✅" : "—"} ${k}</span>`).join("")}
      </div>
    </section>

    <section style="margin-top:14px; display:grid; gap:14px">
      ${tiles || `<div class="card"><p class="p">Brak aktywnych modułów.</p></div>`}
    </section>
  `;
}

function view404({ root }) {
  root.innerHTML = `
    <div class="card">
      <h1 class="h1">404</h1>
      <p class="p">Nie ma takiego widoku.</p>
      <button class="btn" id="goLogin">Wróć do loginu</button>
    </div>
  `;
  root.querySelector("#goLogin").addEventListener("click", () => navigate("/login"));
}

function labelFor(key){
  const map = {
    macro: "Makro",
    diet: "Dieta",
    training: "Trening",
    checkin: "Check-in",
    progress: "Postęp"
  };
  return map[key] || key;
}
function descFor(key){
  const map = {
    macro: "Cele kcal/białko/tłuszcze/węgle i raportowanie zgodności.",
    diet: "Jadłospis od trenera + oznaczanie zjedzonych posiłków.",
    training: "Plan treningowy + odhaczanie i notatki.",
    checkin: "Sen/energia/stres + krótka notatka dnia.",
    progress: "Waga, obwody, zdjęcia i wykresy."
  };
  return map[key] || "";
}

window.addEventListener("load", async () => {
  bindOfflineBanner();

  registerRoute("/login", viewLogin);
  registerRoute("/trainer", viewTrainer);
  registerRoute("/client", viewClient);
  registerRoute("/404", view404);

  initRouter(root);
});
