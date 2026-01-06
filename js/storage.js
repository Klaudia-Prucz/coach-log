const KEY = "coachlog_state_v1";

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getOrInitState() {
  const existing = loadState();
  if (existing) return existing;

  const initial = {
    session: { role: null }, // "trainer" | "client"
    demo: {
      clients: [
        {
          id: "c1",
          name: "Podopieczny #1",
          modules: {
            macro: true,
            diet: false,
            training: false,
            checkin: true,
            progress: true,
          },
        },
        {
          id: "c2",
          name: "Podopieczny #2",
          modules: {
            macro: true,
            diet: true,
            training: true,
            checkin: true,
            progress: true,
          },
        },
      ],
    },
  };
  saveState(initial);
  return initial;
}

export function setRole(role) {
  const s = getOrInitState();
  s.session.role = role;
  saveState(s);
}

export function bindOfflineBanner() {
  const el = document.getElementById("offlineBanner");
  if (!el) return;

  const update = () => {
    el.hidden = navigator.onLine;
  };

  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}
