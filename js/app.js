import { initRouter, registerRoute, navigate } from "./router.js";
import {
  bindOfflineBanner,
  getOrInitState,
  saveState,
  setRole,
  setPendingRole,
  getPendingRole,
} from "./storage.js";
import { supabase } from "./supabaseClient.js";

const root = document.getElementById("app");

// ------------------------------
// UI helpers
// ------------------------------
function setTopNavVisible(isVisible) {
  document.querySelectorAll("[data-nav]").forEach((a) => {
    if (isVisible) a.removeAttribute("hidden");
    else a.setAttribute("hidden", "true");
  });
}

// ------------------------------
// Helpers: local check-ins (offline-first)
// ------------------------------
function getStateWithCheckins() {
  const state = getOrInitState();
  if (!state.demo.checkins) state.demo.checkins = [];
  return state;
}

function addLocalCheckin({ note, photoDataUrl, location }) {
  const state = getStateWithCheckins();
  state.demo.checkins.unshift({
    id: `chk_${Date.now()}`,
    ts: Date.now(),
    note: note || "",
    photoDataUrl: photoDataUrl || null,
    location: location || null, // { lat, lng }
    synced: false,
  });
  saveState(state);
  return state.demo.checkins[0];
}

function markLocalCheckinSynced(localId) {
  const state = getStateWithCheckins();
  const c = state.demo.checkins.find((x) => x.id === localId);
  if (c) c.synced = true;
  saveState(state);
}

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("pl-PL");
  } catch {
    return String(ts);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ------------------------------
// Auth helpers (Supabase)
// ------------------------------
async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

async function ensureProfile(userId, roleFallback) {
  const { data: existing, error: e1 } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!e1 && existing) return existing;

  const { data, error: e2 } = await supabase
    .from("profiles")
    .insert({ id: userId, role: roleFallback || "client" })
    .select("id, role, display_name")
    .single();

  if (e2) throw e2;
  return data;
}

async function routeAfterLogin() {
  const user = await getCurrentUser();
  if (!user) return;

  const pending = getPendingRole() || "client";
  const profile = await ensureProfile(user.id, pending);

  setRole(profile.role);
  navigate(profile.role === "trainer" ? "/trainer" : "/client");
}

async function logoutAndGoStart() {
  try {
    await supabase.auth.signOut();
  } catch {}
  setRole(null);
  setPendingRole(null);
  navigate("/start");
}

// ------------------------------
// Views
// ------------------------------
function viewStart({ root }) {
  setTopNavVisible(false);

  root.innerHTML = `
    <section class="card" style="max-width:520px; margin: 40px auto; text-align:center">
      <h1 class="h1" style="margin-bottom:10px">CoachLog</h1>

      <div class="row" style="justify-content:center; margin-top:10px">
        <button class="btn primary" id="pickTrainer">Jestem trenerem</button>
        <button class="btn" id="pickClient">Jestem podopiecznym</button>
      </div>
    </section>
  `;

  root.querySelector("#pickTrainer").addEventListener("click", () => {
    setPendingRole("trainer");
    navigate("/auth");
  });

  root.querySelector("#pickClient").addEventListener("click", () => {
    setPendingRole("client");
    navigate("/auth");
  });
}

function viewAuth({ root }) {
  setTopNavVisible(true);

  const pendingRole = getPendingRole();

  root.innerHTML = `
    <section class="card" style="max-width:560px; margin: 20px auto;">
      <h1 class="h1">Logowanie / Rejestracja</h1>
      <p class="p">Wybrana rola: <strong>${pendingRole || "—"}</strong></p>

      <div class="field">
        <label>Email</label>
        <input class="input" id="email" type="email" placeholder="email@..." autocomplete="email" />
      </div>

      <div class="field">
        <label>Hasło</label>
        <input class="input" id="password" type="password" placeholder="••••••••" autocomplete="current-password" />
      </div>

      <div class="row">
        <button class="btn primary" id="loginBtn">Zaloguj</button>
        <button class="btn" id="registerBtn">Zarejestruj</button>
        <a class="btn" href="#/start">Wstecz</a>
      </div>

      <p class="p" id="msg" style="margin-top:12px"></p>

      <div class="row" style="margin-top:10px">
        <button class="btn" id="devSkip" title="Tylko do testów UI bez backendu">Tryb demo (bez logowania)</button>
      </div>
    </section>
  `;

  const emailEl = root.querySelector("#email");
  const passEl = root.querySelector("#password");
  const msg = root.querySelector("#msg");

  root.querySelector("#devSkip").addEventListener("click", () => {
    const r = getPendingRole() || "client";
    setRole(r);
    navigate(r === "trainer" ? "/trainer" : "/client");
  });

  root.querySelector("#loginBtn").addEventListener("click", async () => {
    msg.textContent = "Loguję…";
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailEl.value.trim(),
        password: passEl.value,
      });
      if (error) throw error;

      msg.textContent = "OK. Przekierowuję…";
      await routeAfterLogin();
    } catch (e) {
      msg.textContent = `Błąd: ${e?.message || e}`;
    }
  });

  root.querySelector("#registerBtn").addEventListener("click", async () => {
    msg.textContent = "Rejestruję…";
    try {
      const { data, error } = await supabase.auth.signUp({
        email: emailEl.value.trim(),
        password: passEl.value,
      });
      if (error) throw error;

      if (data?.user) {
        await ensureProfile(data.user.id, getPendingRole() || "client");
      }

      msg.textContent =
        "Konto utworzone. Jeśli wymagane, potwierdź email. Przekierowuję…";

      await routeAfterLogin();
    } catch (e) {
      msg.textContent = `Błąd: ${e?.message || e}`;
    }
  });
}

function viewTrainer({ root }) {
  setTopNavVisible(true);

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
        <div class="row" style="justify-content:space-between">
          <div>
            <h1 class="h1" style="margin-bottom:6px">Panel trenera</h1>
            <p class="p">Demo: edycja modułów per podopieczny. (Później podepniemy pod DB)</p>
          </div>
          <button class="btn" id="logoutBtn">Wyloguj</button>
        </div>

        <div style="display:grid; gap:12px; margin-top:12px">
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

  root.querySelector("#logoutBtn").addEventListener("click", logoutAndGoStart);

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
      navigate("/trainer");
    });

    editor.querySelector("#goClient").addEventListener("click", () => {
      navigate(`/client?clientId=${encodeURIComponent(client.id)}`);
    });
  }

  root.querySelectorAll("button[data-open]").forEach((btn) => {
    btn.addEventListener("click", () =>
      renderEditor(btn.getAttribute("data-open"))
    );
  });

  if (clients[0]) renderEditor(clients[0].id);
}

function viewClient({ root, params }) {
  setTopNavVisible(true);

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

  const s2 = getStateWithCheckins();
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
              <span class="badge">${c.synced ? "☁️ synced" : "📱 local"}</span>
            </div>

            <div class="row" style="margin-top:10px">
              ${
                c.location
                  ? `<span class="badge">📍 ${c.location.lat.toFixed(
                      3
                    )}, ${c.location.lng.toFixed(3)}</span>`
                  : `<span class="badge">📍 brak</span>`
              }
            </div>

            ${
              c.note
                ? `<p class="p" style="margin-top:10px">${escapeHtml(
                    c.note
                  )}</p>`
                : `<p class="p" style="margin-top:10px">—</p>`
            }

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
      <div class="row" style="justify-content:space-between">
        <div>
          <h1 class="h1" style="margin-bottom:6px">Dashboard podopiecznego</h1>
          <p class="p"><strong>${client.name}</strong> • widzisz tylko moduły włączone przez trenera.</p>
        </div>
        <button class="btn" id="logoutBtn">Wyloguj</button>
      </div>

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

  root.querySelector("#logoutBtn").addEventListener("click", logoutAndGoStart);
}

function viewCheckin({ root }) {
  setTopNavVisible(true);

  root.innerHTML = `
    <section class="card" style="max-width:720px; margin: 20px auto;">
      <h1 class="h1">Daily check-in</h1>
      <p class="p">Dodaj zdjęcie (kamera), notatkę i lokalizację. Zapis offline działa lokalnie.</p>

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

      <p class="p" id="msg" style="margin-top:12px"></p>
      <div id="preview" style="margin-top:12px"></div>
    </section>
  `;

  const photoInput = root.querySelector("#photoInput");
  const preview = root.querySelector("#preview");
  const noteEl = root.querySelector("#note");
  const locBtn = root.querySelector("#getLocation");
  const locInfo = root.querySelector("#locationInfo");
  const msg = root.querySelector("#msg");

  let photoDataUrl = null;
  let location = null;

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
        locInfo.textContent = `Lokalizacja: ${latitude.toFixed(
          4
        )}, ${longitude.toFixed(4)}`;
      },
      (err) => {
        location = null;
        locInfo.textContent = "Nie udało się pobrać lokalizacji (odmowa lub błąd).";
        console.warn("Geolocation error:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  root.querySelector("#saveCheckin").addEventListener("click", async () => {
    const note = (noteEl.value || "").trim();

    const local = addLocalCheckin({ note, photoDataUrl, location });

    msg.textContent = navigator.onLine
      ? "Zapisuję lokalnie i próbuję wysłać do bazy…"
      : "Zapisano lokalnie (offline).";

    if (navigator.onLine) {
      try {
        const user = await getCurrentUser();
        if (user) {
          await ensureProfile(user.id, getPendingRole() || "client");
          const { error } = await supabase.from("checkins").insert({
            client_id: user.id,
            note: note || null,
            lat: location?.lat ?? null,
            lng: location?.lng ?? null,
            photo_url: null,
          });
          if (!error) {
            markLocalCheckinSynced(local.id);
            msg.textContent = "Zapisano w bazie ✅";
          } else {
            msg.textContent = "Zapisano lokalnie. Błąd wysyłki do bazy (OK offline).";
            console.warn(error);
          }
        } else {
          msg.textContent = "Zapisano lokalnie. (Brak zalogowania — nie wysyłam do bazy)";
        }
      } catch (e) {
        msg.textContent = "Zapisano lokalnie. (Błąd połączenia z bazą — OK offline)";
        console.warn(e);
      }
    }

    navigate("/client");
  });
}

function view404({ root }) {
  setTopNavVisible(true);
  root.innerHTML = `
    <div class="card">
      <h1 class="h1">404</h1>
      <p class="p">Nie ma takiego widoku.</p>
      <button class="btn" id="goStart">Wróć do startu</button>
    </div>
  `;
  root.querySelector("#goStart").addEventListener("click", () => navigate("/start"));
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

// ------------------------------
// Boot
// ------------------------------
window.addEventListener("load", async () => {
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./sw.js");
    } catch (e) {
      console.warn("SW registration failed", e);
    }
  }

  bindOfflineBanner();

  registerRoute("/start", viewStart);
  registerRoute("/auth", viewAuth);

  registerRoute("/trainer", viewTrainer);
  registerRoute("/client", viewClient);
  registerRoute("/checkin", viewCheckin);

  registerRoute("/404", view404);

  const user = await getCurrentUser();
  if (user) {
    try {
      await routeAfterLogin();
    } catch (e) {
      console.warn("Auto-login route failed:", e);
      if (!location.hash) navigate("/start");
    }
  } else {
    if (!location.hash || location.hash === "#/login") navigate("/start");
  }

  initRouter(root);
});
