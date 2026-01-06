// Na MVP v0.1 trzymamy dane lokalnie (LocalStorage).
// Tu później podepniemy prawdziwe API / sync / Supabase itp.

export const api = {
  async ping() {
    return { ok: true, ts: Date.now() };
  },
};
