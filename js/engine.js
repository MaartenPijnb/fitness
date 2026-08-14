/* =========================================================================
   engine.js — afgeleide kennis uit het logboek.

   Twee dingen die de app slim maken:

   1. De gewichtsladder. Machines in een sportschool hebben een eigen reeks
      (54, 59, 66 ...) die niets met schijven van 2,5 kg te maken heeft. In
      plaats van een vast increment te raden lezen we de reeks terug uit wat
      er in het logboek staat. De + knop springt dus naar de pen die er echt
      in past.

   2. Progressie. Het patroon in het logboek is consequent 3×10: worden alle
      werksets op het topgewicht gehaald, dan gaat het gewicht de volgende
      keer omhoog. Zo niet, dan blijft het staan.
   ========================================================================= */

const Engine = (() => {
  const DAY = 86400000;
  const LADDER_WINDOW = 550;    // dagen terug voor de ladder (~18 maanden)
  const REGULAR_WINDOW = 365;   // dagen terug voor 'vaste' oefeningen
  const ROTATION_WINDOW = 120;  // dagen die de huidige rotatie beslaan

  const today = () => toISO(new Date());
  const toISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = s => new Date(s + 'T12:00:00');
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const daysAgo = d => daysBetween(d, today());

  const cache = new Map();
  const memo = (key, fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };
  const clear = () => cache.clear();

  /* ------------------------- Sets per sessie --------------------------- */

  /** Alle sets van een oefening, gegroepeerd per datum, oplopend. */
  function sessions(exId) {
    return memo('ses:' + exId, () => {
      const byDate = new Map();
      for (const s of Store.setsFor(exId)) {
        if (!byDate.has(s.d)) byDate.set(s.d, []);
        byDate.get(s.d).push(s);
      }
      return [...byDate.entries()].map(([d, sets]) => ({ d, sets })).sort((a, b) => a.d < b.d ? -1 : 1);
    });
  }

  const lastSession = exId => { const s = sessions(exId); return s.length ? s[s.length - 1] : null; };

  /** Opwarmsets eruit: duidelijk lichter dan het zwaarste van die sessie. */
  function workingSets(sets) {
    if (sets.length < 2) return sets;
    const top = Math.max(...sets.map(s => s.w));
    const work = sets.filter(s => s.w >= top * 0.8);
    return work.length ? work : sets;
  }

  /* --------------------------- Gewichtsladder -------------------------- */

  /** De gewichten die deze oefening in de praktijk kent, van licht naar zwaar. */
  function ladder(exId) {
    return memo('lad:' + exId, () => {
      const all = Store.setsFor(exId);
      if (!all.length) return [];

      const build = (minDays, minCount) => {
        const count = new Map();
        for (const s of all) {
          if (minDays && daysAgo(s.d) > minDays) continue;
          count.set(s.w, (count.get(s.w) || 0) + 1);
        }
        return [...count.entries()].filter(([, n]) => n >= minCount).map(([w]) => w).sort((a, b) => a - b);
      };

      // Recent en herhaald gebruikt is de beste weergave van de machine nu.
      let l = build(LADDER_WINDOW, 2);
      if (l.length < 3) l = build(LADDER_WINDOW, 1);
      if (l.length < 3) l = build(0, 2);
      if (l.length < 3) l = build(0, 1);
      return l;
    });
  }

  /** Typische stap van deze oefening; valt terug op 2,5 kg als er niets te zien is. */
  function stepOf(exId) {
    const l = ladder(exId);
    if (l.length < 2) return 2.5;
    const gaps = [];
    for (let i = 1; i < l.length; i++) gaps.push(l[i] - l[i - 1]);
    gaps.sort((a, b) => a - b);
    return gaps[Math.floor(gaps.length / 2)] || 2.5;
  }

  /** Eén pen omhoog of omlaag langs de ladder. */
  function stepWeight(exId, w, dir) {
    const l = ladder(exId);
    const step = stepOf(exId);

    if (l.length >= 2) {
      const next = dir > 0 ? l.find(x => x > w + 0.001) : [...l].reverse().find(x => x < w - 0.001);
      // Een gat groter dan drie normale stappen is meestal een andere machine.
      if (next != null && Math.abs(next - w) <= step * 3.2) return next;
    }
    return Math.max(0, Math.round((w + dir * step) * 4) / 4);
  }

  /* --------------------------- Doelherhalingen ------------------------- */

  /** Het aantal reps dat hij bij deze oefening normaal aanhoudt. */
  function targetReps(exId) {
    return memo('reps:' + exId, () => {
      const ses = sessions(exId).slice(-10);
      const count = new Map();
      for (const { sets } of ses) {
        for (const s of workingSets(sets)) count.set(s.r, (count.get(s.r) || 0) + 1);
      }
      if (!count.size) return Store.state.settings.targetReps;
      return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
    });
  }

  function targetSets(exId) {
    const ses = sessions(exId).slice(-8);
    if (!ses.length) return Store.state.settings.targetSets;
    const counts = ses.map(s => workingSets(s.sets).length).sort((a, b) => a - b);
    return counts[Math.floor(counts.length / 2)] || 3;
  }

  /* ---------------------------- Voorstel gewicht ----------------------- */

  /**
   * Wat te tillen bij de volgende sessie.
   * Alle werksets op het topgewicht gehaald → een pen erbij, anders herhalen.
   *
   * `skipDate` laat de sessie waar je middenin zit buiten beschouwing: die is
   * nog niet af, dus "je bleef steken op 1×50" zou onzin zijn zolang set 2 en 3
   * nog moeten komen. Standaard is dat vandaag.
   */
  function suggest(exId, skipDate = today()) {
    const ses = sessions(exId).filter(s => s.d !== skipDate);
    const last = ses.length ? ses[ses.length - 1] : null;
    const reps = targetReps(exId);
    const nSets = targetSets(exId);

    if (!last) return { w: 0, r: reps, sets: nSets, reason: 'Eerste keer — kies zelf een gewicht.', up: false, fresh: true };

    const work = workingSets(last.sets);
    const topW = Math.max(...work.map(s => s.w));
    const atTop = work.filter(s => s.w === topW);
    const allHit = atTop.every(s => s.r >= reps);
    const enough = atTop.length >= Math.min(nSets, 3);
    const gap = daysAgo(last.d);

    // Na een lange pauze is doorpakken op het oude topgewicht zelden slim.
    if (gap > 45) {
      return {
        w: stepWeight(exId, topW, -1), r: reps, sets: nSets, up: false,
        reason: `${gap} dagen geleden gedaan — een pen lichter om weer in te komen.`,
      };
    }

    if (allHit && enough) {
      const next = stepWeight(exId, topW, 1);
      return {
        w: next, r: reps, sets: nSets, up: next > topW,
        reason: `Vorige keer ${atTop.length}×${reps} op ${fmt(topW)} kg gehaald${next > topW ? ' — tijd voor meer' : ''}.`,
      };
    }

    const best = Math.max(...atTop.map(s => s.r));
    return {
      w: topW, r: reps, sets: nSets, up: false,
      reason: `Vorige keer bleef je op ${best}×${fmt(topW)} kg steken — nog een keer voor de volle ${reps}.`,
    };
  }

  /* ------------------------- Rotatie van oefeningen -------------------- */

  /**
   * Welke oefening in deze categorie is aan de beurt?
   *
   * Puur "het langst geleden" werkt niet: dan komen oefeningen bovendrijven die
   * hij een half jaar geleden heeft laten vallen. Elke oefening heeft zijn eigen
   * ritme — de ene doet hij om de twee weken, de andere om de twee maanden. De
   * score zet het verstreken aantal dagen af tegen dat eigen ritme, zodat zowel
   * een vaste als een zeldzame oefening op zijn eigen moment terugkomt.
   */
  function rotation(catId) {
    const all = [];
    for (const e of Store.state.exercises) {
      if (e.del || e.cat !== catId) continue;
      const ses = sessions(e.id);
      if (!ses.length) continue;
      const last = ses[ses.length - 1];
      all.push({
        ex: e,
        uses: ses.filter(s => daysAgo(s.d) <= REGULAR_WINDOW).length,
        total: ses.length,
        lastDate: last.d,
        since: daysAgo(last.d),
        ses,
      });
    }

    /** Kandidaten binnen een venster, gescoord op hun eigen cadans. */
    const score = window => all
      .map(o => {
        const inWin = o.ses.filter(s => daysAgo(s.d) <= window).length;
        return inWin ? { ...o, inWin, score: o.since / (window / inWin) } : null;
      })
      .filter(Boolean);

    // Eén keer in het venster zegt weinig over ritme; die tellen pas mee als er
    // te weinig echte kandidaten overblijven.
    let pool = score(ROTATION_WINDOW);
    const solid = pool.filter(o => o.inWin >= 2);
    if (solid.length >= 2) pool = solid;
    if (pool.length < 2) pool = score(REGULAR_WINDOW);
    if (pool.length < 1) pool = all.map(o => ({ ...o, score: o.since }));

    pool.sort((a, b) => b.score - a.score);
    return { pool, all: all.sort((a, b) => b.uses - a.uses || a.since - b.since) };
  }

  /* -------------------------- Voorstel sessie -------------------------- */

  /** Hoeveel spiergroepen per training, en wanneer was elke groep voor het laatst? */
  function catStats() {
    return memo('catstats', () => {
      const byCat = new Map();
      for (const c of Store.state.categories) byCat.set(c.id, { cat: c, dates: new Set() });

      for (const s of Store.state.sets) {
        if (s.del) continue;
        const e = Store.ex(s.ex);
        if (!e) continue;
        byCat.get(e.cat)?.dates.add(s.d);
      }

      const out = [];
      for (const { cat, dates } of byCat.values()) {
        const list = [...dates].sort();
        if (!list.length) continue;
        const recent = list.filter(d => daysAgo(d) <= REGULAR_WINDOW);
        const gaps = [];
        for (let i = 1; i < recent.length; i++) gaps.push(daysBetween(recent[i - 1], recent[i]));
        gaps.sort((a, b) => a - b);
        const typical = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 7;
        const last = list[list.length - 1];
        out.push({ cat, last, since: daysAgo(last), uses: recent.length, typical: Math.max(typical, 2) });
      }
      return out;
    });
  }

  /** Hoeveel spiergroepen doet hij normaal op één dag? */
  function typicalCatsPerSession() {
    return memo('cps', () => {
      const perDay = new Map();
      for (const s of Store.state.sets) {
        if (s.del || daysAgo(s.d) > REGULAR_WINDOW) continue;
        const e = Store.ex(s.ex);
        if (!e) continue;
        if (!perDay.has(s.d)) perDay.set(s.d, new Set());
        perDay.get(s.d).add(e.cat);
      }
      const sizes = [...perDay.values()].map(s => s.size).sort((a, b) => a - b);
      if (!sizes.length) return 5;
      return Math.min(6, Math.max(4, sizes[Math.floor(sizes.length / 2)]));
    });
  }

  /**
   * Het voorstel voor vandaag: per spiergroep één oefening, precies zoals in
   * het logboek — 98% van de trainingsdagen heeft één oefening per groep.
   */
  function suggestSession(date = today()) {
    const doneToday = new Map();
    for (const s of Store.setsOn(date)) {
      const e = Store.ex(s.ex);
      if (e) doneToday.set(e.cat, e.id);
    }

    const stats = catStats()
      .filter(c => c.uses > 0)
      .map(c => ({ ...c, ready: c.since / c.typical }))
      .sort((a, b) => b.ready - a.ready);

    const n = typicalCatsPerSession();
    const picked = new Set(stats.slice(0, n).map(c => c.cat.id));
    for (const catId of doneToday.keys()) picked.add(catId); // vandaag begonnen telt altijd mee

    const order = Store.state.categories.map(c => c.id);
    return [...picked]
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map(catId => planItem(doneToday.get(catId) || rotation(catId).pool[0]?.ex.id, date))
      .filter(Boolean);
  }

  /** Eén regel in het dagplan: welke oefening, hoe lang geleden, wat te tillen. */
  function planItem(exId, date = today()) {
    const e = exId && Store.ex(exId);
    if (!e) return null;
    const prev = sessions(exId).filter(s => s.d !== date).pop();
    return {
      cat: Store.cat(e.cat),
      exId,
      since: prev ? daysAgo(prev.d) : null,   // van de oefening zelf, niet de spiergroep
      plan: suggest(exId, date),
      logged: Store.setsOn(date).filter(s => s.ex === exId),
    };
  }

  /**
   * Dagplan uit een vaste lijst oefeningen (een routine). Wat er die dag verder
   * nog gelogd is komt erachteraan, zodat niets buiten beeld valt.
   */
  function planFor(exIds, date = today()) {
    const seen = new Set(exIds);
    const extra = [];
    for (const s of Store.setsOn(date)) {
      if (!seen.has(s.ex)) { seen.add(s.ex); extra.push(s.ex); }
    }
    return [...exIds, ...extra].map(id => planItem(id, date)).filter(Boolean);
  }

  /* ------------------------------ Records ------------------------------ */

  const e1rm = (w, r) => r <= 1 ? w : w * (1 + r / 30);   // Epley

  /**
   * Beste prestatie per oefening, plus het beste gewicht per aantal reps.
   *
   * `perRep` is cumulatief: het record voor 3 reps is het zwaarste gewicht uit
   * alle sets van drie reps óf meer. Wie 80 kg × 6 tilt heeft 80 kg × 3 immers
   * ook staan, en zonder die stap loopt de tabel niet netjes af.
   */
  function records(exId) {
    return memo('rec:' + exId, () => {
      let bestE = null, heaviest = null;
      const exact = new Map();

      for (const s of Store.setsFor(exId)) {
        if (!s.r) continue;
        if (!bestE || e1rm(s.w, s.r) > e1rm(bestE.w, bestE.r)) bestE = s;
        if (!heaviest || s.w > heaviest.w) heaviest = s;
        const cur = exact.get(s.r);
        if (!cur || s.w > cur.w) exact.set(s.r, s);
      }

      const perRep = new Map();
      let best = null;
      for (const r of [...exact.keys()].sort((a, b) => b - a)) {
        const s = exact.get(r);
        if (!best || s.w > best.w) best = s;
        perRep.set(r, best);
      }
      return { bestE, heaviest, perRep };
    });
  }

  /** Is dit een record? Vergelijkt tegen alles wat vóór deze set gelogd is. */
  function checkPR(exId, w, r, exclId) {
    let bestE = 0, bestAtReps = 0;
    for (const s of Store.setsFor(exId)) {
      if (s.id === exclId) continue;
      bestE = Math.max(bestE, e1rm(s.w, s.r));
      if (s.r >= r) bestAtReps = Math.max(bestAtReps, s.w);
    }
    if (!bestE) return null;
    if (w > bestAtReps) return { kind: 'weight', prev: bestAtReps };
    if (e1rm(w, r) > bestE) return { kind: 'e1rm', prev: bestE };
    return null;
  }

  /* ---------------------------- Statistieken --------------------------- */

  const volumeOf = sets => sets.reduce((t, s) => t + s.w * s.r, 0);

  function overview() {
    return memo('ov', () => {
      const dates = Store.idx.dates;
      const last = dates[dates.length - 1];
      const y = new Date().getFullYear();

      let volAll = 0, volYear = 0, sessionsYear = 0;
      for (const s of Store.state.sets) {
        if (s.del) continue;
        const v = s.w * s.r;
        volAll += v;
        if (s.d.startsWith(y)) volYear += v;
      }
      for (const d of dates) if (d.startsWith(y)) sessionsYear++;

      // Trainingen per week over de laatste 8 weken.
      const cut = toISO(new Date(Date.now() - 56 * DAY));
      const recent = dates.filter(d => d >= cut);
      const perWeek = recent.length / 8;

      return {
        sessions: dates.length,
        sessionsYear,
        volAll,
        volYear,
        last,
        since: last ? daysAgo(last) : null,
        perWeek,
        first: dates[0],
        streak: weekStreak(dates),
      };
    });
  }

  /** Aantal aaneengesloten weken met minstens één training. */
  function weekStreak(dates) {
    if (!dates.length) return 0;
    const weekOf = iso => {
      const d = parse(iso);
      const day = (d.getDay() + 6) % 7;           // maandag = 0
      d.setDate(d.getDate() - day);
      return toISO(d);
    };
    const weeks = new Set(dates.map(weekOf));
    let cur = weekOf(today());
    // Loopt de huidige week nog leeg, dan telt vanaf vorige week.
    if (!weeks.has(cur)) {
      const d = parse(cur); d.setDate(d.getDate() - 7); cur = toISO(d);
      if (!weeks.has(cur)) return 0;
    }
    let n = 0;
    while (weeks.has(cur)) {
      n++;
      const d = parse(cur); d.setDate(d.getDate() - 7); cur = toISO(d);
    }
    return n;
  }

  /** Verdeling over spiergroepen in een periode, voor de balansbalken. */
  function balance(days = 90) {
    const cut = toISO(new Date(Date.now() - days * DAY));
    const per = new Map();
    for (const s of Store.state.sets) {
      if (s.del || s.d < cut) continue;
      const e = Store.ex(s.ex);
      if (!e) continue;
      per.set(e.cat, (per.get(e.cat) || 0) + 1);
    }
    const total = [...per.values()].reduce((a, b) => a + b, 0) || 1;
    return [...per.entries()]
      .map(([id, n]) => ({ cat: Store.cat(id), n, pct: n / total * 100 }))
      .sort((a, b) => b.n - a.n);
  }

  /** Reeks per sessie voor de grafieken: topgewicht, geschat 1RM en volume. */
  function series(exId) {
    return sessions(exId).map(({ d, sets }) => {
      const work = workingSets(sets);
      const top = Math.max(...work.map(s => s.w));
      const best = work.reduce((a, s) => e1rm(s.w, s.r) > e1rm(a.w, a.r) ? s : a, work[0]);
      return { d, top, e1rm: e1rm(best.w, best.r), vol: volumeOf(sets), reps: best.r, sets: sets.length };
    });
  }

  /** Volume per maand over de laatste n maanden. */
  function monthly(n = 12) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      out.push({ key, label: d.toLocaleDateString('nl-NL', { month: 'short' }), vol: 0, days: new Set() });
    }
    const map = new Map(out.map(o => [o.key, o]));
    for (const s of Store.state.sets) {
      if (s.del) continue;
      const m = map.get(s.d.slice(0, 7));
      if (m) { m.vol += s.w * s.r; m.days.add(s.d); }
    }
    return out.map(o => ({ ...o, days: o.days.size }));
  }

  /* -------------------------- Schijvenrekenaar ------------------------- */

  /** Welke schijven per kant voor een doelgewicht. */
  function plates(target, bar = Store.state.gear.bar) {
    const avail = [...(Store.state.gear.plates || [])].sort((a, b) => b - a);
    let side = (target - bar) / 2;
    if (side < 0) return { ok: false, side: [], rest: 0, bar };
    const out = [];
    for (const p of avail) {
      while (side >= p - 0.001) { out.push(p); side = Math.round((side - p) * 100) / 100; }
    }
    return { ok: side < 0.001, side: out, rest: side, bar };
  }

  const fmt = n => (Math.round(n * 100) / 100).toString().replace('.', ',');

  return {
    today, toISO, parse, daysAgo, daysBetween, fmt, clear,
    sessions, lastSession, workingSets,
    ladder, stepOf, stepWeight, targetReps, targetSets,
    suggest, rotation, suggestSession, planFor, catStats,
    e1rm, records, checkPR,
    overview, balance, series, monthly, volumeOf, plates,
  };
})();
