/* =========================================================================
   store.js — state, opslag in IndexedDB, en sync via een eigen bestand.

   Alle records dragen een `mod` (epoch ms). Verwijderen zet `del:1` in plaats
   van de rij weg te gooien, zodat een verwijdering ook bij een merge overleeft.
   Samenvoegen is daardoor simpel: per id wint het record met de hoogste `mod`.
   ========================================================================= */

const Store = (() => {
  const DB = 'kracht';
  const STORE = 'kv';
  const KEY = 'state';

  let state = null;
  let db = null;
  let saveTimer = null;
  const listeners = new Set();

  /* ---------------------------- IndexedDB ------------------------------ */

  function open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  function idbGet(key) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  function idbPut(key, val) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ------------------------------ Boot --------------------------------- */

  /* Spiergroepen waar de app mee begint als er geen seed meegeleverd is.
     De ids komen overeen met die van de FitNotes-conversie, zodat een latere
     import netjes op dezelfde categorieën aansluit. */
  const BASE_CATEGORIES = [
    { id: 'c1', name: 'Schouders', src: 'Shoulders', colour: '#f0a35e' },
    { id: 'c2', name: 'Triceps',   src: 'Triceps',   colour: '#4fd1c5' },
    { id: 'c3', name: 'Biceps',    src: 'Biceps',    colour: '#f2789f' },
    { id: 'c4', name: 'Borst',     src: 'Chest',     colour: '#6ea8fe' },
    { id: 'c5', name: 'Rug',       src: 'Back',      colour: '#a78bfa' },
    { id: 'c6', name: 'Benen',     src: 'Legs',      colour: '#7ee787' },
    { id: 'c7', name: 'Buik',      src: 'Abs',       colour: '#ffd76e' },
    { id: 'c8', name: 'Cardio',    src: 'Cardio',    colour: '#ff8a65' },
  ];

  const blank = () => ({
    v: 1,
    categories: BASE_CATEGORIES,
    exercises: [],
    sets: [],
    routines: [],
    gear: { bar: 20, plates: [20, 15, 10, 5, 2.5, 1.25] },
    settings: { targetSets: 3, targetReps: 10, unit: 'kg' },
  });

  async function init() {
    db = await open();
    state = await idbGet(KEY);

    if (!state) {
      // Eerste start. Ligt er een seed naast de app, dan is dat de geschiedenis
      // uit FitNotes. Zo niet, dan begint de app leeg en leest hij zijn back-up
      // via Meer → Inlezen van bestand — handig als de app publiek gehost staat
      // en de trainingsdata daar niet hoort te liggen.
      let seed = null;
      try {
        const res = await fetch('data/seed.json', { cache: 'no-cache' });
        if (res.ok) seed = await res.json();
      } catch { /* geen seed: prima, we starten leeg */ }

      state = seed
        ? { ...blank(), ...seed, importedAt: Date.now() }
        : blank();
      await idbPut(KEY, state);
    }

    // Voor opslag van een oudere versie die een later veld nog mist.
    state.categories ||= BASE_CATEGORIES;
    state.routines ||= [];
    state.settings ||= { targetSets: 3, targetReps: 10, unit: 'kg' };
    state.gear ||= { bar: 20, plates: [20, 15, 10, 5, 2.5, 1.25] };

    buildIndex();
    return state;
  }

  /* ---------------------------- Indexen -------------------------------- */
  /* Afgeleide lookups die veel schermen nodig hebben. Eén keer opbouwen en
     invalideren bij wijziging is een stuk sneller dan telkens filteren.     */

  const idx = { exById: new Map(), catById: new Map(), setsByEx: new Map(), byDate: new Map(), dates: [] };

  function buildIndex() {
    idx.exById.clear(); idx.catById.clear(); idx.setsByEx.clear(); idx.byDate.clear();

    for (const c of state.categories) idx.catById.set(c.id, c);
    for (const e of state.exercises) if (!e.del) idx.exById.set(e.id, e);

    for (const s of state.sets) {
      if (s.del) continue;
      if (!idx.setsByEx.has(s.ex)) idx.setsByEx.set(s.ex, []);
      idx.setsByEx.get(s.ex).push(s);
      if (!idx.byDate.has(s.d)) idx.byDate.set(s.d, []);
      idx.byDate.get(s.d).push(s);
    }

    for (const arr of idx.setsByEx.values()) arr.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
    idx.dates = [...idx.byDate.keys()].sort();
  }

  /* ---------------------------- Opslaan -------------------------------- */

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => idbPut(KEY, state).catch(e => console.error('opslaan mislukt', e)), 220);
  }

  function touched() {
    buildIndex();
    save();
    listeners.forEach(fn => fn());
  }

  const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* ----------------------------- Muteren ------------------------------- */

  const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function addSet({ ex, d, w, r, sec, n }) {
    const s = { id: uid(), ex, d, w: +w, r: +r, mod: Date.now() };
    if (sec) s.sec = sec;
    if (n) s.n = n;
    state.sets.push(s);
    touched();
    return s;
  }

  function updateSet(id, patch) {
    const s = state.sets.find(x => x.id === id);
    if (!s) return;
    Object.assign(s, patch, { mod: Date.now() });
    touched();
  }

  function removeSet(id) {
    const s = state.sets.find(x => x.id === id);
    if (!s) return;
    s.del = 1;
    s.mod = Date.now();
    touched();
  }

  function addExercise(name, cat) {
    const e = { id: uid(), name: name.trim(), cat, mod: Date.now() };
    state.exercises.push(e);
    touched();
    return e;
  }

  function saveRoutine(name, exIds, id) {
    const existing = id && state.routines.find(r => r.id === id);
    if (existing) {
      Object.assign(existing, { name, items: exIds, mod: Date.now() });
    } else {
      state.routines.push({ id: uid(), name, items: exIds, mod: Date.now() });
    }
    touched();
  }

  function removeRoutine(id) {
    const r = state.routines.find(x => x.id === id);
    if (!r) return;
    r.del = 1;
    r.mod = Date.now();
    touched();
  }

  /* Een gestarte routine geldt voor één dag; daarna komt het voorstel terug. */
  function startRoutine(id, date) {
    state.settings.activeRoutine = id ? { id, date } : null;
    touched();
  }

  function activeRoutine(date) {
    const a = state.settings.activeRoutine;
    if (!a || a.date !== date) return null;
    return state.routines.find(r => r.id === a.id && !r.del) || null;
  }

  /* ------------------------- Export / import --------------------------- */

  function exportBlob() {
    const payload = { ...state, app: 'kracht', exportedAt: Date.now() };
    return new Blob([JSON.stringify(payload)], { type: 'application/json' });
  }

  function fileName() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `kracht-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
  }

  /* Per id wint het record met de hoogste `mod`. Records uit de seed hebben
     geen `mod` en verliezen dus altijd van een bewerkt record.              */
  function mergeList(mine, theirs) {
    const map = new Map();
    for (const r of mine) map.set(r.id, r);
    let added = 0, updated = 0;
    for (const r of theirs) {
      const cur = map.get(r.id);
      if (!cur) { map.set(r.id, r); added++; }
      else if ((r.mod || 0) > (cur.mod || 0)) { map.set(r.id, r); updated++; }
    }
    return { list: [...map.values()], added, updated };
  }

  function merge(incoming) {
    if (!incoming || !Array.isArray(incoming.sets)) throw new Error('Onbekend bestandsformaat');

    const s = mergeList(state.sets, incoming.sets);
    const e = mergeList(state.exercises, incoming.exercises || []);
    const r = mergeList(state.routines, incoming.routines || []);
    const c = mergeList(state.categories, incoming.categories || []);

    state.sets = s.list;
    state.exercises = e.list;
    state.routines = r.list;
    state.categories = c.list;   // nodig als de app leeg begon
    if (incoming.gear) state.gear = incoming.gear;

    touched();
    return {
      sets: s.added,
      setsUpdated: s.updated,
      exercises: e.added,
      routines: r.added,
      total: state.sets.filter(x => !x.del).length,
    };
  }

  /* --- Handle naar het sync-bestand onthouden (Chrome/Android/desktop) --- */

  const getHandle = () => idbGet('syncHandle');
  const setHandle = h => idbPut('syncHandle', h);

  async function handleReady(h, mode) {
    if (!h) return false;
    const opts = { mode };
    if ((await h.queryPermission?.(opts)) === 'granted') return true;
    return (await h.requestPermission?.(opts)) === 'granted';
  }

  return {
    init, onChange, touched, uid,
    get state() { return state; },
    get idx() { return idx; },
    addSet, updateSet, removeSet, addExercise,
    saveRoutine, removeRoutine, startRoutine, activeRoutine,
    exportBlob, fileName, merge,
    getHandle, setHandle, handleReady,
    setsOn: d => idx.byDate.get(d) || [],
    setsFor: id => idx.setsByEx.get(id) || [],
    ex: id => idx.exById.get(id),
    cat: id => idx.catById.get(id),
  };
})();
