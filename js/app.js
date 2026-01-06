import { initRouter, registerRoute, navigate } from "./router.js";
import { bindOfflineBanner, getOrInitState, setRole, saveState } from "./storage.js";

const root = document.getElementById("app");

// ------------------------------
// Helpers: check-ins in local state
// ------------------------------
function getCheckinsState() {
  const state = getOrInitState();
  if (!state.demo.checkins) state.demo.checkins = [];
  return state;
}

function addCheckin({ note, photoDataUrl, location }) {
  const state = getCheckinsState();
  state.demo.checkins.unshift({
    id: `chk_${Date.now()}`,
    ts: Date.now(),
    note: note || "",
    photoDataUrl: photoDataUrl || null,
    location: location || null, // { lat, lng }
  });
  saveState(state);
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("pl-PL");
  } catch {
    return String(ts);
  }
}

// ------------------------------
// Views
// ------------------------------
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

        <p class="p" style="margin-top:12px">
          Demo lokalne (LocalStorage). Offline działa dzięki Service Workerowi,
          a check-in używa kamery i geolokalizacji.
        </p>
      </div>

      <aside class="card">
        <h2 class="h2">Wymagania (check)</h2>
        <div class="row">
          <span class="badge">✅ 3+ widoki</span>
          <span class="badge">✅ manifest</span>
          <span class="badge">✅ service worker</span>
          <span class="badge">✅ kamera</span>
          <span class="badge">✅ geolokalizacja</span>
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

  const listHtml = clients
    .map(
      (c) => `
      <div class="card" style="padding:12px">
        <div class="row" style="justify-content:space-between">
          <strong>${c.name}</strong>
          <button class="btn" data-open="${c.id}">Otwórz</button>
        </div>
        <div class="row" style="margin-top:10px">
          ${Object.entries(c.modules)
            .map(([k, v]) => `<span class="badge">${v ? "✅" : "—"} ${k}</span>`)
            .join("")}
        </div>
      </div>
    `
    )
    .join("");

  root.innerHTML = `
    <section class="grid">
      <div class="card">
        <h1 class="h1">Panel trenera</h1>
        <p class="p">Baza podopiecznych + edycja modułów (demo). Ustaw, czy klient ma dietę czy tylko makro itd.</p>

        <div style="display:grid; gap:12px">
          ${listHtml}
        </div>
      </div>

      <aside class="card">
        <h2 class="h2">Edycja modułów</h2>
        <p class="p">Kliknij „Otwórz”, aby zmienić moduły wybranego podopiecznego.</p>

        <div id="editor" class="card" style="background:rgba(0,0,0,.12)"></div>
      </aside>
    </section>
  `;

  const editor = root.querySelector("#editor");

  function renderEditor(clientId) {
    const client = state.demo.clients.find((x) => x.id === clientId);
    if (!client) {
      editor.innerHTML = `<p class="p">Nie znaleziono podopiecznego.</p>`;
      return;
    }

    editor.innerHTML = `
      <h3 class="h2" style="margin-top:0">${client.name}</h3>
      <div class="field">
        <label class="p">Aktywne moduły</label>

        ${Object.keys(client.modules)
          .map(
            (key) => `
          <label class="row" style="justify-content:space-between; border:1px solid var(--line); padding:10px 12px; border-radius:12px; margin:8px 0">
            <span>${key}</span>
            <input type="checkbox" data-mod="${key}" ${
              client.modules[key] ? "checked" : ""
            } />
          </label>
        `
          )
          .join("")}

        <div class="row" style="margin-top:10px">
          <button class="btn primary" id="saveMods">Zapisz</button>
          <button class="btn" id="goClient">Podgląd jako podopieczny</button>
        </div>
      </div>
    `;

    editor.querySelectorAll("input[type=checkbox][data-mod]").forEach((chk) => {
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
      navigate(`/client?clientId=${encodeURIComponent(client.id)}`);
    });
  }

  root.querySelectorAll("button[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => renderEditor(btn.getAttribute("data-open")));
  });

  if (clients[0]) renderEditor(clients[0].id);
}

function viewClient({ root, params }) {
  const state = getOrInitState();
  const clientId = params.clientId || state.demo.clients[0]?.id;
  const client =
    state.demo.clients.find((x) => x.id === clientId) || state.demo.clients[0];

  if (!client) {
    root.innerHTML = `
      <div class="card">
        <h1 class="h1">Brak danych</h1>
        <p class="p">Dodaj podopiecznego w panelu trenera.</p>
      </div>`;
    return;
  }

  const modules = client.modules;

  const tiles = Object.entries(modules)
    .filter(([, enabled]) => enabled)
    .map(
      ([key]) => `
      <div class="card" style="padding:12px">
        <h3 class="h2" style="margin-top:0">${labelFor(key)}</h3>
        <p class="p">${descFor(key)}</p>
        <button class="btn" disabled>Wkrótce</button>
      </div>
    `
    )
    .join("");

  // Last check-ins preview
  const s2 = getCheckinsState();
  const last = (s2.demo.checkins || []).slice(0, 3);
  const lastHtml =
    last.length === 0
      ? `<div class="card"><p class="p">Brak zapisanych check-inów.</p></div>`
      : last
          .map(
            (c) => `
          <div class="card" style="padding:12px">
            <div class="row" style="justify-content:space-between">
              <strong>${formatDate(c.ts)}</strong>
              ${c.location ? `<span class="badge">📍 ${c.location.lat.toFixed(3)}, ${c.location.lng.toFixed(3)}</span>` : `<span class="badge">📍 brak</span>`}
            </div>
            ${c.note ? `<p class="p" style="margin-top:10px">${escapeHtml(c.note)}</p>` : `<p class="p" style="margin-top:10px">—</p>`}
            ${
              c.photoDataUrl
                ? `<img src="${c.photoDataUrl}" alt="Check-in photo" style="margin-top:10px; width:100%; max-height:240px; object-fit:cover; border-radius:12px" />`
                : ``
            }
          </div>
        `
          )
          .join("");

  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Dashboard podopiecznego</h1>
      <p class="p"><strong>${client.name}</strong> • widzisz tylko moduły włączone przez trenera.</p>

      <div class="row" style="margin-top:10px">
        ${Object.entries(modules)
          .map(([k, v]) => `<span class="badge">${v ? "✅" : "—"} ${k}</span>`)
          .join("")}
      </div>

      <div style="margin:14px 0">
        <a class="btn primary" href="#/checkin">➕ Daily check-in</a>
      </div>
    </section>

    <section style="margin-top:14px" class="grid">
      <div>
        <h2 class="h2" style="margin:0 0 10px">Aktywne moduły</h2>
        <div style="display:grid; gap:14px">
          ${tiles || `<div class="card"><p class="p">Brak aktywnych modułów.</p></div>`}
        </div>
      </div>

      <aside>
        <h2 class="h2" style="margin:0 0 10px">Ostatnie check-iny</h2>
        <div style="display:grid; gap:12px">
          ${lastHtml}
        </div>
      </aside>
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

function viewCheckin({ root }) {
  root.innerHTML = `
    <section class="card">
      <h1 class="h1">Daily check-in</h1>
      <p class="p">Dodaj zdjęcie (kamera), notatkę i lokalizację. Zapis działa lokalnie i offline.</p>

      <div class="field">
        <label>Zdjęcie (kamera)</label>
        <input
          class="input"
          type="file"
          accept="image/*"
          capture="environment"
          id="photoInput"
        />
        <small class="p">Na telefonie otworzy kamerę. Na komputerze: wybór pliku.</small>
      </div>

      <div class="field">
        <label>Notatka</label>
        <textarea class="input" id="note" rows="3" placeholder="Jak poszło dziś?"></textarea>
      </div>

      <div class="field">
        <button class="btn" id="getLocation">📍 Pobierz lokalizację</button>
        <p class="p" id="locationInfo">Lokalizacja: —</p>
      </div>

      <div class="row">
        <button class="btn primary" id="saveCheckin">Zapisz check-in</button>
        <a class="btn" href="#/client">Powrót</a>
      </div>

      <div id="preview" style="margin-top:12px"></div>
    </section>
  `;

  const photoInput = root.querySelector("#photoInput");
  const preview = root.querySelector("#preview");
  const noteEl = root.querySelector("#note");
  const locBtn = root.querySelector("#getLocation");
  const locInfo = root.querySelector("#locationInfo");

  let photoDataUrl = null;
  let location = null;

  // Kamera / zdjęcie
  photoInput.addEventListener("change", () => {
    const file = photoInput.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = reader.result;
      preview.innerHTML = `
        <p class="p">Podgląd zdjęcia:</p>
        <img src="${photoDataUrl}" alt="Preview" style="max-width:100%; border-radius:12px" />
      `;
    };
    reader.readAsDataURL(file);
  });

  // Geolokalizacja
  locBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      locInfo.textContent = "Geolokalizacja nie jest wspierana w tej przeglądarce.";
      return;
    }

    locInfo.textContent = "Pobieram lokalizację…";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        location = { lat: latitude, lng: longitude };
        locInfo.textContent = `Lokalizacja: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      },
      (err) => {
        location = null;
        locInfo.textContent = "Nie udało się pobrać lokalizacji (odmowa lub błąd).";
        console.warn("Geolocation error:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Zapis check-in
  root.querySelector("#saveCheckin").addEventListener("click", () => {
    const note = (noteEl.value || "").trim();
    addCheckin({ note, photoDataUrl, location });
    navigate("/client");
  });
}

// ------------------------------
// Labels
// ------------------------------
function labelFor(key) {
  const map = {
    macro: "Makro",
    diet: "Dieta",
    training: "Trening",
    checkin: "Check-in",
    progress: "Postęp",
  };
  return map[key] || key;
}

function descFor(key) {
  const map = {
    macro: "Cele kcal/białko/tłuszcze/węgle i raportowanie zgodności.",
    diet: "Jadłospis od trenera + oznaczanie zjedzonych posiłków.",
    training: "Plan treningowy + odhaczanie i notatki.",
    checkin: "Sen/energia/stres + krótka notatka dnia.",
    progress: "Waga, obwody, zdjęcia i wykresy.",
  };
  return map[key] || "";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------
// Boot
// ------------------------------
window.addEventListener("load", async () => {
  // Rejestracja Service Workera (offline)
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("SW registration failed", e);
    }
  }

  bindOfflineBanner();

  registerRoute("/login", viewLogin);
  registerRoute("/trainer", viewTrainer);
  registerRoute("/client", viewClient);
  registerRoute("/checkin", viewCheckin);
  registerRoute("/404", view404);

  initRouter(root);
});
