// Global high-score leaderboard via dreamlo (no backend needed).
//
// dreamlo's free tier is HTTP-only; our site is HTTPS, so scores need SSL.
// GO-LIVE: donate $5+ at https://dreamlo.com/donate, then use the "contact" link
// to ask Carmine to enable SSL for public code 6a569cdd8f40bc13189cbc98. Once he
// confirms, flip `ready` to true below and the leaderboard turns on.
//
// Note: dreamlo's model puts the private (write) code in client code — it's public
// by design. To wipe/reset, generate a fresh board at dreamlo.com and swap codes.
const DREAMLO = {
  publicCode:  '6a569cdd8f40bc13189cbc98',
  privateCode: 'I280s2ONZkOHPI_miZQ8LwIiJkSzmkN0G1YdiDWfWVJA',
  base: 'https://www.dreamlo.com/lb',
  ready: true,   // dreamlo SSL enabled 2026-07-22 — leaderboard live
};

const Leaderboard = {
  configured() { return DREAMLO.ready && !!DREAMLO.publicCode; },

  // Fire-and-forget write (no-cors: the GET records the score, response is opaque)
  submit(name, score) {
    if (!this.configured()) return Promise.resolve();
    const n = encodeURIComponent((name || 'ANON').slice(0, 16));
    return fetch(`${DREAMLO.base}/${DREAMLO.privateCode}/add/${n}/${Math.floor(score)}`, { mode: 'no-cors' })
      .catch(() => {});
  },

  // Top N scores, already sorted high→low by dreamlo. Resolves [] on any failure.
  top(count = 10) {
    if (!this.configured()) return Promise.resolve([]);
    return fetch(`${DREAMLO.base}/${DREAMLO.publicCode}/json/${count}`)
      .then(r => r.json())
      .then(d => {
        const lb = d && d.dreamlo && d.dreamlo.leaderboard;
        if (!lb || !lb.entry) return [];
        const e = lb.entry;
        return (Array.isArray(e) ? e : [e]).map(x => ({ name: x.name, score: +x.score }));
      })
      .catch(() => []);
  },
};
