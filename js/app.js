/* =========================================================================
   app.js — schermen, navigatie en interactie.

   Rendering is bewust simpel gehouden: elk scherm bouwt een string en zet die
   in de container. Klikken lopen via event-delegatie op één listener, zodat er
   na een herteken niets opnieuw gekoppeld hoeft te worden.
   ========================================================================= */

(() => {
  const app = document.getElementById('app');
  const tabbar = document.getElementById('tabbar');
  const sheet = document.getElementById('sheet');
  const sheetBody = document.getElementById('sheet-body');
  const scrim = document.getElementById('sheet-scrim');
  const toastEl = document.getElementById('toast');

  let view = { tab: 'today', exId: null, metric: 'top', period: 'all' };
  let sheetState = null;

  /* ------------------------------ Iconen ------------------------------- */

  const I = {
    today: '<path d="M4 7h3M17 7h3M7 4v6M17 4v6M7 7h10M6 14h12M9 17h6"/>',
    hist:  '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    prog:  '<path d="M4 18l5-5 3 3 7-8"/><path d="M15 8h4v4"/>',
    dumb:  '<path d="M6 8v8M4 10v4M18 8v8M20 10v4M8 12h8"/>',
    more:  '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    x:     '<path d="M6 6l12 12M18 6L6 18"/>',
    bulb:  '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.6 10.8c.6.5.9 1.1 1 1.7l.1.5h5l.1-.5c.1-.6.4-1.2 1-1.7A6 6 0 0012 3z"/>',
    up:    '<path d="M12 19V5M5 12l7-7 7 7"/>',
    swap:  '<path d="M7 4L3 8l4 4M3 8h13a4 4 0 014 4M17 20l4-4-4-4M21 16H8a4 4 0 01-4-4"/>',
    down:  '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    upload:'<path d="M12 19V5M5 12l7-7 7 7"/>',
    save:  '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    disc:  '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    list:  '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    trophy:'<path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M10 17h4M9 21h6M12 13v4"/>',
    back:  '<path d="M15 5l-7 7 7 7"/>',
    chev:  '<path d="M9 5l7 7-7 7"/>',
    pencil:'<path d="M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16v4z"/><path d="M14.5 6.5l3 3"/>',
  };

  const svg = (d, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  /* ------------------------------ Helpers ------------------------------ */

  const esc = s => String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const nf = n => n.toLocaleString('nl-NL');
  const fmtW = n => Engine.fmt(n);

  /* Eén training is leesbaarder in kilo's, een jaar in tonnen. */
  function fmtVol(kg) {
    if (kg >= 1e6) return { v: (kg / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.'), u: 'ton' };
    if (kg >= 1e4) return { v: (kg / 1000).toFixed(1).replace('.', ','), u: 'ton' };
    return { v: nf(Math.round(kg)), u: 'kg' };
  }

  const WD = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const MO = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function dateLabel(iso, long = false) {
    const d = Engine.parse(iso);
    const ago = Engine.daysAgo(iso);
    if (ago === 0) return 'Vandaag';
    if (ago === 1) return 'Gisteren';
    if (ago < 7) return WD[d.getDay()].replace(/^./, c => c.toUpperCase());
    const base = `${d.getDate()} ${MO[d.getMonth()]}`;
    return long || d.getFullYear() !== new Date().getFullYear() ? `${base} ${d.getFullYear()}` : base;
  }

  const agoLabel = n =>
    n === 0 ? 'vandaag' : n === 1 ? 'gisteren'
    : n < 14 ? `${n} dagen geleden`
    : n < 60 ? `${Math.round(n / 7)} weken geleden`
    : n < 730 ? `${Math.round(n / 30)} maanden geleden`
    : `${Math.round(n / 365)} jaar geleden`;

  let toastTimer;
  let toastAction = null;

  /** `action` = { label, run } zet er een knop naast, bijvoorbeeld om te herstellen. */
  function toast(msg, ms = 2100, action = null) {
    clearTimeout(toastTimer);
    toastAction = action;
    toastEl.innerHTML = `<span>${esc(msg)}</span>`
      + (action ? `<button class="toast-act" data-act="toast-act">${esc(action.label)}</button>` : '');
    toastEl.hidden = false;
    toastEl.classList.remove('out');
    toastTimer = setTimeout(hideToast, ms);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toastAction = null;
    toastEl.classList.add('out');
    setTimeout(() => { toastEl.hidden = true; }, 280);
  }

  const buzz = ms => { try { navigator.vibrate?.(ms); } catch {} };

  function celebrate() {
    const f = document.createElement('div');
    f.className = 'pr-flash';
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1500);
    buzz([18, 60, 30]);
  }

  /* ------------------------------- Sheet -------------------------------- */

  function openSheet(render, state) {
    sheetState = { render, ...state };
    drawSheet();
    if (sheet.hidden) {
      sheet.hidden = false;
      scrim.hidden = false;
      sheet.classList.remove('closing');
      history.pushState({ sheet: true }, '');   // Android-terugknop sluit het paneel
    }
  }

  function drawSheet() {
    if (!sheetState) return;
    sheetBody.innerHTML = sheetState.render(sheetState);
  }

  function closeSheet(fromPop) {
    if (sheet.hidden) return;
    sheet.classList.add('closing');
    setTimeout(() => { sheet.hidden = true; scrim.hidden = true; sheetState = null; }, 250);
    if (!fromPop && history.state?.sheet) history.back();
  }

  scrim.addEventListener('click', () => closeSheet());
  window.addEventListener('popstate', () => { if (!sheet.hidden) closeSheet(true); });

  /* Naar beneden slepen sluit het paneel — verwacht gedrag op mobiel. */
  (() => {
    let y0 = null, dy = 0;
    const grip = document.querySelector('.sheet-grip');
    const start = e => { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; };
    const move = e => {
      if (y0 === null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      sheet.style.transform = `translate(-50%, ${dy}px)`;
    };
    const end = () => {
      if (y0 === null) return;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 90) closeSheet();
      y0 = null;
    };
    for (const el of [grip, sheet]) {
      el.addEventListener('touchstart', e => {
        // Alleen slepen vanaf de greep of wanneer de inhoud bovenaan staat.
        if (el === grip || sheetBody.scrollTop <= 0) start(e);
      }, { passive: true });
      el.addEventListener('touchmove', move, { passive: true });
      el.addEventListener('touchend', end);
    }
  })();

  /* ============================== Vandaag =============================== */

  /** Het dagplan: een gestarte routine gaat voor, anders het voorstel. */
  function todayPlan(d = Engine.today()) {
    const r = Store.activeRoutine(d);
    return r ? Engine.planFor(r.items, d) : Engine.suggestSession(d);
  }

  function viewToday() {
    const d = Engine.today();
    const routine = Store.activeRoutine(d);
    const plan = todayPlan(d);
    const ov = Engine.overview();
    const todaySets = Store.setsOn(d);
    const started = todaySets.length > 0;
    const vol = fmtVol(Engine.volumeOf(todaySets));

    const now = new Date();
    const greet = now.getHours() < 6 ? 'Nachtdienst' : now.getHours() < 12 ? 'Goedemorgen'
                : now.getHours() < 18 ? 'Goedemiddag' : 'Goedenavond';

    // Verse installatie zonder meegeleverde geschiedenis: eerst de back-up erin.
    if (!Store.idx.dates.length) {
      return `<div class="view">
        <div class="head"><h1>Welkom</h1><p>Nog geen trainingen op dit toestel</p></div>
        <div class="glass hero">
          <div class="kicker">Eerste keer</div>
          <h2>Lees je back-up in</h2>
          <div class="sub">Kies het bestand dat je vanuit deze app hebt opgeslagen —
            uit Bestanden, iCloud Drive of Google Drive. Je hele geschiedenis,
            records en oefeningen komen er in één keer bij.</div>
          <button class="btn primary block" data-act="import">${svg(I.upload)} Bestand kiezen</button>
        </div>
        <div class="sec"><h2>Of begin gewoon</h2></div>
        <button class="pane set-item" data-act="new-ex" data-cat="">
          <span class="set-ico">${svg(I.plus)}</span>
          <span class="grow"><div class="t">Oefening toevoegen</div>
            <div class="d">En meteen je eerste set loggen</div></span>
        </button>
      </div>`;
    }

    const doneCats = plan.filter(p => p.logged.length >= p.plan.sets).length;

    // De knop wijst naar de eerstvolgende onafgeronde oefening, en zegt of je
    // ergens verdergaat of aan iets nieuws begint.
    const next = plan.find(p => p.logged.length < p.plan.sets);
    const nextName = next ? Store.ex(next.exId)?.name || '' : '';
    const nextText = !next ? 'Training afgerond'
      : next.logged.length ? `Verder met ${nextName}`
      : `Volgende: ${nextName}`;

    const hero = started ? `
      <div class="glass hero">
        <div class="kicker">Bezig · ${dateLabel(d)}</div>
        <h2>${todaySets.length} ${todaySets.length === 1 ? 'set' : 'sets'} gelogd</h2>
        <div class="sub">${doneCats} van ${plan.length} spiergroepen afgerond · ${vol.v} ${vol.u} verzet</div>
        <button class="btn primary block" data-act="next-ex">
          ${svg(next ? I.plus : I.check)}<span class="trunc">${esc(nextText)}</span>
        </button>
      </div>`
      : `
      <div class="glass hero">
        <div class="kicker">${greet}</div>
        <h2>Klaar voor je training?</h2>
        <div class="sub">${ov.since === 0 ? 'Vandaag al getraind.'
          : ov.since == null ? 'Nog geen trainingen gelogd.'
          : `Laatste training ${agoLabel(ov.since)}.`} Hieronder staat wat aan de beurt is.</div>
        <button class="btn primary block" data-act="start">${svg(I.dumb)} Start training</button>
      </div>`;

    const stats = `
      <div class="stats">
        <div class="glass stat"><span class="stat-v">${ov.perWeek.toFixed(1).replace('.', ',')}</span><span class="stat-l">per week</span></div>
        <div class="glass stat"><span class="stat-v">${ov.streak}</span><span class="stat-l">weken op rij</span></div>
        <div class="glass stat"><span class="stat-v">${nf(ov.sessionsYear)}</span><span class="stat-l">dit jaar</span></div>
      </div>`;

    const items = plan.map(p => {
      const ex = Store.ex(p.exId);
      const done = p.logged.length >= p.plan.sets;
      const c = p.cat.colour;
      // Zonder gewicht (dips, leg raises) zegt "0 kg" niets — dan telt het aantal.
      const bodyweight = !p.plan.fresh && p.plan.w === 0;
      const target = p.plan.fresh ? '—'
        : bodyweight ? `${p.plan.r}<span class="dim" style="font-weight:500"> reps</span>`
        : `${fmtW(p.plan.w)}<span class="dim" style="font-weight:500"> kg</span>`;

      const hint = p.logged.length
        ? p.logged.map(s => `${fmtW(s.w)}×${s.r}`).join('  ')
        : p.plan.fresh ? 'nog niet eerder gedaan'
        : `${p.plan.sets}×${p.plan.r}${p.plan.up ? ' · zwaarder dan vorige keer' : ''}`;

      return `
        <button class="pane plan-item${done ? ' done' : ''}" style="--c:${c}" data-act="log" data-ex="${p.exId}">
          <span class="dot"></span>
          <span class="grow">
            <span class="plan-cat">${esc(p.cat.name)}${p.since != null ? ` · ${agoLabel(p.since)}` : ''}</span>
            <div class="plan-ex trunc">${esc(ex?.name || '?')}</div>
            <div class="plan-hint trunc">${esc(hint)}</div>
          </span>
          ${done
            ? `<span class="tick on">${svg(I.check)}</span>`
            : p.logged.length
              ? `<span class="plan-target">${p.logged.length}<span class="dim" style="font-weight:500">/${p.plan.sets}</span><small>sets</small></span>`
              : `<span class="plan-target">${target}<small>${bodyweight ? `${p.plan.sets} sets` : `${p.plan.sets}×${p.plan.r}`}</small></span>`}
        </button>`;
    }).join('');

    return `<div class="view">
      <div class="head"><h1>Vandaag</h1><p>${dateLabel(d)}, ${Engine.parse(d).getDate()} ${MO[Engine.parse(d).getMonth()]}</p></div>
      ${hero}
      <div class="sec"><h2>Je ritme</h2></div>
      ${stats}
      <div class="sec">
        <h2>${routine ? esc(routine.name) : 'Voorstel voor vandaag'}</h2>
        ${routine
          ? '<button class="link" data-act="stop-routine">Terug naar voorstel</button>'
          : '<button class="link" data-act="tab" data-tab="exercises">Alles</button>'}
      </div>
      <div class="stack">${items || '<div class="glass empty"><p>Nog geen geschiedenis om een voorstel op te baseren.</p></div>'}</div>
    </div>`;
  }

  /* ========================== Sets loggen (sheet) ======================== */

  function sheetLog(st) {
    const ex = Store.ex(st.exId);
    const cat = Store.cat(ex.cat);
    const logged = Store.setsOn(st.date).filter(s => s.ex === st.exId);
    const last = Engine.sessions(st.exId).filter(s => s.d !== st.date).pop();
    const plan = st.plan;
    const ladder = Engine.ladder(st.exId);
    const canDown = st.w > (ladder[0] ?? 0);

    const prevLine = last ? `
      <div class="prev-line">
        <span class="dim">${dateLabel(last.d)}</span>
        <b class="grow trunc">${last.sets.map(s => `${fmtW(s.w)}×${s.r}`).join('  ')}</b>
      </div>` : '';

    // Blijft staan zodra er gelogd is: als het advies zou verdwijnen schuift de
    // logknop omhoog, precies waar de duim al onderweg is naar de volgende set.
    const advice = plan?.reason ? `
      <div class="advice${adviceKind(plan)}">${svg(adviceIcon(plan))}<span>${esc(plan.reason)}</span></div>` : '';

    const rows = logged.map((s, i) => `
      <div class="set-row${s.id === st.editId ? ' editing' : ''}">
        <span class="set-n">${i + 1}</span>
        <span class="grow"><span class="set-w">${fmtW(s.w)} kg × ${s.r}</span>
          ${s.pr ? ' <span class="badge gold">record</span>' : ''}
          ${s.n ? `<div class="tiny dim">${esc(s.n)}</div>` : ''}</span>
        <button class="icon-btn" data-act="set-edit" data-id="${s.id}" aria-label="Aanpassen">${svg(I.pencil)}</button>
        <button class="icon-btn" data-act="set-del" data-id="${s.id}" aria-label="Verwijderen">${svg(I.trash)}</button>
      </div>`).join('');

    const n = logged.length + 1;
    const target = plan?.sets || 3;
    const editing = st.editId && logged.some(s => s.id === st.editId);
    const nr = editing ? logged.findIndex(s => s.id === st.editId) + 1 : n;

    return `
      <div class="sheet-head">
        <h3>${esc(ex.name)}</h3>
        <p>${esc(cat.name)}${logged.length ? ` · ${logged.length}/${target} sets` : ''}</p>
        <label class="date-pick">
          ${svg(I.today)}
          <span>${st.date === Engine.today() ? 'Vandaag' : dateLabel(st.date, true)}</span>
          <input type="date" value="${st.date}" max="${Engine.today()}" data-act="date-in" aria-label="Datum van deze training">
        </label>
      </div>

      ${editing ? '' : advice}

      <div class="stepper" style="margin-top:14px">
        <span class="lab">Gewicht</span>
        <button class="step-btn" data-act="w" data-d="-1" ${canDown ? '' : 'disabled'} aria-label="Lichter">−</button>
        <span class="val-box">
          <input class="w-val" type="number" inputmode="decimal" step="0.25" min="0" value="${st.w}" data-act="w-in" aria-label="Gewicht in kilogram">
          <span class="val-u">kg</span>
        </span>
        <button class="step-btn" data-act="w" data-d="1" aria-label="Zwaarder">+</button>
      </div>

      <div class="stepper">
        <span class="lab">Reps</span>
        <button class="step-btn" data-act="r" data-d="-1" ${st.r > 1 ? '' : 'disabled'} aria-label="Minder">−</button>
        <span class="val-box">
          <input class="w-val r-val" type="number" inputmode="numeric" step="1" min="1" max="100" value="${st.r}" data-act="r-in" aria-label="Aantal herhalingen">
          <span class="val-u">reps</span>
        </span>
        <button class="step-btn" data-act="r" data-d="1" aria-label="Meer">+</button>
      </div>

      <button class="btn primary block log-btn" data-act="save-set">
        ${editing
          ? `${svg(I.check)} Set ${nr} bijwerken`
          : `${svg(I.plus)} Log set ${n}${n > target ? '' : ` van ${target}`}`}
      </button>
      ${editing ? `<button class="btn ghost block sm" style="margin-top:8px" data-act="edit-cancel">Annuleren</button>` : ''}

      ${logged.length ? `<div class="sec" style="margin:20px 0 8px"><h2>Gelogd</h2>
        <span class="tiny dim">${fmtVol(Engine.volumeOf(logged)).v} ${fmtVol(Engine.volumeOf(logged)).u}</span></div>
        <div class="stack">${rows}</div>` : ''}

      ${prevLine ? `<div class="sec" style="margin:20px 0 8px"><h2>Vorige keer</h2></div>${prevLine}` : ''}

      <div class="row" style="margin-top:18px;gap:8px">
        <button class="btn ghost grow sm" data-act="swap-ex" data-cat="${ex.cat}">${svg(I.swap)} Andere oefening</button>
        <button class="btn ghost sm" data-act="note">Notitie</button>
      </div>
      <button class="btn ghost block sm" style="margin-top:8px" data-act="view-ex" data-ex="${st.exId}">
        ${svg(I.prog)} Bekijk progressie
      </button>`;
  }

  function openLog(exId, date = Engine.today()) {
    const plan = Engine.suggest(exId, date);
    const logged = Store.setsOn(date).filter(s => s.ex === exId);
    // Al bezig? Dan is het laatste gelogde gewicht het startpunt.
    const base = logged.length ? logged[logged.length - 1] : null;
    openSheet(sheetLog, {
      kind: 'log',
      exId, date, plan,
      w: base ? base.w : (plan.fresh ? 20 : plan.w),
      r: base ? base.r : plan.r,
    });
  }

  function saveSet() {
    const st = sheetState;
    if (!st || st.kind !== 'log') return;
    const w = +st.w, r = +st.r;
    if (!(r > 0)) { toast('Vul een aantal herhalingen in'); return; }

    // Bewerken past de bestaande rij aan in plaats van hem te wissen en
    // opnieuw te loggen — anders verschuift de volgorde en verdwijnt de notitie.
    if (st.editId) {
      const pr = Engine.checkPR(st.exId, w, r, st.editId);
      Store.updateSet(st.editId, { w, r, pr: pr ? 1 : 0 });
      st.editId = null;
      Engine.clear();
      drawSheet();
      render();
      toast(`Set bijgewerkt — ${fmtW(w)} kg × ${r}`, 1500);
      return;
    }

    const pr = Engine.checkPR(st.exId, w, r);
    const s = Store.addSet({ ex: st.exId, d: st.date, w, r, n: st.note });
    if (pr) Store.updateSet(s.id, { pr: 1 });
    st.note = '';   // een notitie hoort bij één set, niet bij de hele sessie

    Engine.clear();
    drawSheet();
    render();

    if (pr) {
      celebrate();
      toast(pr.kind === 'weight'
        ? `Record! ${fmtW(w)} kg × ${r}`
        : `Record! Sterkste set tot nu toe`, 2600);
    } else {
      buzz(14);
      toast(`Set gelogd — ${fmtW(w)} kg × ${r}`, 1400);
    }
  }

  /* ---------------------- Oefening kiezen (sheet) ---------------------- */

  function sheetPick(st) {
    const q = (st.q || '').toLowerCase().trim();
    const cats = st.cat ? [Store.cat(st.cat)] : Store.state.categories;

    let body = '';
    for (const cat of cats) {
      const { all } = Engine.rotation(cat.id);
      const extra = Store.state.exercises.filter(e =>
        !e.del && e.cat === cat.id && !all.some(a => a.ex.id === e.id)).map(e => ({ ex: e, uses: 0, since: null }));

      const list = [...all, ...extra].filter(o => !q || o.ex.name.toLowerCase().includes(q));
      if (!list.length) continue;

      body += `<div class="sec"><h2 style="color:${cat.colour}">${esc(cat.name)}</h2></div><div>`;
      for (const o of list) {
        const s = Engine.suggest(o.ex.id);
        body += `
          <button class="pick${o.ex.id === st.current ? ' on' : ''}" data-act="pick-ex" data-ex="${o.ex.id}">
            <span class="dot" style="--c:${cat.colour}"></span>
            <span class="grow">
              <div class="pick-n trunc">${esc(o.ex.name)}</div>
              <div class="pick-m">${o.since == null ? 'nog niet gedaan'
                : `${agoLabel(o.since)} · ${o.uses}× dit jaar`}</div>
            </span>
            ${s.fresh ? '' : `<span class="plan-target">${fmtW(s.w)}<small>kg</small></span>`}
          </button>`;
      }
      body += '</div>';
    }

    return `
      <div class="sheet-head"><h3>${st.title || 'Kies een oefening'}</h3>
        <p>Gesorteerd op wat het langst geleden is</p></div>
      <input class="search" type="search" placeholder="Zoeken…" value="${esc(st.q || '')}" data-act="pick-q" autocomplete="off">
      ${body || '<div class="empty"><p>Niets gevonden</p></div>'}
      <button class="btn ghost block sm" style="margin-top:16px" data-act="new-ex" data-cat="${st.cat || ''}">
        ${svg(I.plus)} Nieuwe oefening
      </button>`;
  }

  /* ============================ Geschiedenis ============================ */

  /** Scherm zonder data — voorkomt rekenen op een niet-bestaande eerste datum. */
  const emptyView = (title, msg) => `<div class="view">
    <div class="head"><h1>${title}</h1></div>
    <div class="glass empty">
      ${svg(I.dumb)}
      <p>${msg}</p>
      <button class="btn ghost sm" style="margin-top:16px" data-act="import">
        ${svg(I.upload)} Back-up inlezen
      </button>
    </div></div>`;

  function viewHistory() {
    if (!Store.idx.dates.length) return emptyView('Historie', 'Nog geen trainingen gelogd.');
    const dates = [...Store.idx.dates].reverse();
    const shown = dates.slice(0, view.histN || 25);

    const days = shown.map(d => {
      const sets = Store.setsOn(d);
      const byEx = new Map();
      for (const s of sets) {
        if (!byEx.has(s.ex)) byEx.set(s.ex, []);
        byEx.get(s.ex).push(s);
      }
      const vol = fmtVol(Engine.volumeOf(sets));
      const prs = sets.filter(s => s.pr).length;

      const rows = [...byEx.entries()].map(([exId, ss]) => {
        const ex = Store.ex(exId);
        const cat = ex ? Store.cat(ex.cat) : null;
        return `
          <button class="day-ex" data-act="log-date" data-ex="${exId}" data-date="${d}" style="width:100%;text-align:left">
            <span class="dot" style="--c:${cat?.colour || '#888'};width:8px;height:8px"></span>
            <span class="grow">
              <div class="n trunc">${esc(ex?.name || 'Onbekend')}</div>
              <div class="s">${ss.map(s => `${fmtW(s.w)}×${s.r}`).join('  ')}</div>
            </span>
          </button>`;
      }).join('');

      return `
        <div class="glass day">
          <div class="day-h">
            <span class="day-d">${dateLabel(d, true)}</span>
            <span class="day-m">${sets.length} sets · ${vol.v} ${vol.u}${prs ? ` · ${prs} record${prs > 1 ? 's' : ''}` : ''}</span>
          </div>
          ${rows}
        </div>`;
    }).join('');

    const more = dates.length > shown.length
      ? `<button class="btn ghost block" style="margin-top:14px" data-act="more-hist">Nog ${Math.min(25, dates.length - shown.length)} tonen (${dates.length - shown.length} over)</button>` : '';

    return `<div class="view">
      <div class="head"><h1>Historie</h1><p>${nf(dates.length)} trainingsdagen sinds ${dateLabel(Store.idx.dates[0], true)}</p></div>
      <div class="glass chart-card">
        <div class="chart-t">Trainingsdichtheid</div>
        <div class="chart-s">Laatste half jaar</div>
        ${Charts.heatmap(Store.idx.byDate)}
      </div>
      <div class="sec"><h2>Trainingen</h2></div>
      <div class="stack">${days || '<div class="glass empty"><p>Nog niets gelogd.</p></div>'}</div>
      ${more}
    </div>`;
  }

  /* ============================= Progressie ============================= */

  function viewProgress() {
    if (!Store.idx.dates.length) return emptyView('Progressie', 'Log je eerste sets, dan verschijnen hier je grafieken.');
    const ov = Engine.overview();
    const volAll = fmtVol(ov.volAll);
    const volYear = fmtVol(ov.volYear);
    const prs = Store.state.sets.filter(s => !s.del && s.pr).length;

    const mon = Engine.monthly(12);
    const bars = mon.map((m, i) => ({ label: m.label, v: m.vol, now: i === mon.length - 1 }));

    const bal = Engine.balance(90);
    const maxBal = Math.max(...bal.map(b => b.n), 1);

    // Oefeningen met de meeste vooruitgang in het laatste jaar.
    const movers = topMovers();

    return `<div class="view">
      <div class="head"><h1>Progressie</h1><p>Sinds ${dateLabel(ov.first, true)}</p></div>

      <div class="stats">
        <div class="glass stat"><span class="stat-v">${nf(ov.sessions)}</span><span class="stat-l">trainingen</span></div>
        <div class="glass stat"><span class="stat-v">${volAll.v}<span class="stat-u">${volAll.u}</span></span><span class="stat-l">totaal verzet</span></div>
        <div class="glass stat"><span class="stat-v">${nf(prs)}</span><span class="stat-l">records</span></div>
      </div>

      <div class="sec"><h2>Volume per maand</h2><span class="tiny dim">${volYear.v} ${volYear.u} dit jaar</span></div>
      <div class="glass chart-card">
        ${Charts.bars(bars, { alt: 'Volume per maand' })}
        <div class="row tiny dim" style="padding:2px 4px 6px;justify-content:space-between">
          <span>${mon[0].label} — ${mon[mon.length - 1].label}</span>
          <span>${nf(mon.reduce((t, m) => t + m.days, 0))} trainingen</span>
        </div>
      </div>

      <div class="sec"><h2>Sterkste stijgers</h2><span class="tiny dim">12 maanden</span></div>
      <div class="stack">
        ${movers.length ? movers.map(m => `
          <button class="pane plan-item" style="--c:${m.cat.colour}" data-act="view-ex" data-ex="${m.ex.id}">
            <span class="dot"></span>
            <span class="grow">
              <span class="plan-cat">${esc(m.cat.name)}</span>
              <div class="plan-ex trunc">${esc(m.ex.name)}</div>
              <div class="plan-hint">${fmtW(m.from)} → ${fmtW(m.to)} kg</div>
            </span>
            ${Charts.spark(m.vals, m.cat.colour)}
            <span class="badge ${m.pct >= 0 ? 'up' : 'down'}">${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(0)}%</span>
          </button>`).join('')
          : '<div class="glass empty"><p>Nog te weinig data.</p></div>'}
      </div>

      <div class="sec"><h2>Balans per spiergroep</h2><span class="tiny dim">90 dagen</span></div>
      <div class="glass chart-card">
        <div class="bal">
          ${bal.map(b => `
            <div class="bal-r" style="--c:${b.cat.colour}">
              <span class="bal-n">${esc(b.cat.name)}</span>
              <span class="bal-t"><span class="bal-f" style="width:${b.n / maxBal * 100}%"></span></span>
              <span class="bal-v">${b.pct.toFixed(0)}%</span>
            </div>`).join('') || '<p class="dim tiny">Nog geen data.</p>'}
        </div>
      </div>

      <div class="sec"><h2>Per oefening</h2></div>
      <button class="btn ghost block" data-act="pick-progress">${svg(I.search)} Kies een oefening</button>
    </div>`;
  }

  /**
   * Vergelijkt het gemiddelde topgewicht van het eerste en het laatste kwart
   * van het afgelopen jaar. Alleen oefeningen die nog in de rotatie zitten,
   * en hoogstens twee per spiergroep — anders vult één spiergroep de lijst.
   */
  function topMovers(limit = 4) {
    const out = [];
    for (const e of Store.state.exercises) {
      if (e.del) continue;
      const ser = Engine.series(e.id).filter(s => Engine.daysAgo(s.d) <= 365);
      if (ser.length < 5) continue;
      if (Engine.daysAgo(ser[ser.length - 1].d) > 120) continue;   // niet meer actueel

      const k = Math.max(1, Math.floor(ser.length / 4));
      const from = ser.slice(0, k).reduce((t, s) => t + s.top, 0) / k;
      const lastK = ser.slice(-k);
      const to = lastK.reduce((t, s) => t + s.top, 0) / lastK.length;
      if (!from) continue;

      out.push({
        ex: e, cat: Store.cat(e.cat),
        from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10,
        pct: (to - from) / from * 100,
        vals: ser.map(s => s.top),
      });
    }

    const perCat = new Map();
    return out
      .filter(m => m.pct > 0.5)
      .sort((a, b) => b.pct - a.pct)
      .filter(m => {
        const n = perCat.get(m.cat.id) || 0;
        if (n >= 2) return false;
        perCat.set(m.cat.id, n + 1);
        return true;
      })
      .slice(0, limit);
  }

  /* ------------------------ Detail van één oefening --------------------- */

  /* Het advies krijgt een kleur naar zijn strekking: groen vooruit, oranje als
     je terugmoet naar wat je al kon, en neutraal voor de rest. */
  const adviceKind = p => p.deload ? ' warn' : p.recover ? ' back' : p.up ? ' up' : '';
  const adviceIcon = p => p.deload ? I.down : p.recover ? I.up : p.up ? I.up : I.bulb;

  /**
   * Je beste schone sessie tegenover waar je nu staat. Het logboek laat zien
   * dat wegzakken vaker gebeurt dan falen, en dat zie je alleen als je piek
   * ergens in beeld staat.
   */
  function peakLine(exId) {
    const p = Engine.peak(exId);
    if (!p || p.w <= 0) return '';
    const best = `${p.sets}×${p.reps} op <b>${fmtW(p.w)} kg</b>`;
    if (p.behind < 2) {
      return `<div class="peak ok">${svg(I.trophy)}<span>
        Je beste is ${best} — daar zit je nu ook.</span></div>`;
    }
    return `<div class="peak">${svg(I.trophy)}<span>
      Je beste: ${best} op ${esc(Engine.dutchDate(p.d))} ·
      nu <b>${fmtW(p.now)} kg</b>, <b class="warnc">${p.behind.toFixed(0)}% eronder</b></span></div>`;
  }

  function viewExercise(exId) {
    const ex = Store.ex(exId);
    if (!ex) return '<div class="empty"><p>Oefening niet gevonden.</p></div>';
    const cat = Store.cat(ex.cat);
    const all = Engine.series(exId);
    const rec = Engine.records(exId);

    const cut = { '3m': 90, '1j': 365, all: 99999 }[view.period] ?? 99999;
    const ser = all.filter(s => Engine.daysAgo(s.d) <= cut);
    const use = ser.length >= 2 ? ser : all;

    const key = view.metric;
    const val = s => key === 'top' ? s.top : key === 'e1rm' ? s.e1rm : s.vol;
    const unit = key === 'top' ? 'topgewicht in kg' : key === 'e1rm' ? 'geschat 1RM in kg' : 'volume in kg';

    let best = -Infinity;
    const points = use.map(s => {
      const v = val(s);
      const hi = v > best;
      if (hi) best = v;
      return { y: v, hi, d: s.d };
    });

    const labels = use.length > 1
      ? [{ i: 0, t: dateLabel(use[0].d, true) }, { i: use.length - 1, t: dateLabel(use[use.length - 1].d) }]
      : [];

    const plan = Engine.suggest(exId);
    const ladder = Engine.ladder(exId);
    const lastS = use[use.length - 1];
    const firstS = use[0];
    const delta = firstS && lastS && val(firstS) ? (val(lastS) - val(firstS)) / val(firstS) * 100 : 0;

    const perRep = [...rec.perRep.entries()].sort((a, b) => a[0] - b[0]).filter(([r]) => r <= 15).slice(0, 8);

    return `<div class="view">
      <div class="row" style="padding:6px 0 2px">
        <button class="icon-btn" data-act="back">${svg(I.back)}</button>
        <span class="grow"></span>
        <button class="icon-btn" data-act="edit-ex" data-ex="${exId}" aria-label="Naam of spiergroep aanpassen">${svg(I.pencil)}</button>
        <button class="btn sm ghost" data-act="log" data-ex="${exId}">${svg(I.plus)} Loggen</button>
      </div>
      <div class="head" style="padding-top:6px">
        <h1 style="font-size:25px">${esc(ex.name)}</h1>
        <p><span style="color:${cat.colour}">●</span> ${esc(cat.name)} ·
           ${all.length} sessies · ${nf(Store.setsFor(exId).length)} sets</p>
      </div>

      <div class="glass hero" style="padding:18px">
        <div class="row" style="align-items:flex-end;gap:16px">
          <div>
            <div class="kicker">Volgende keer</div>
            <div style="font-size:32px;font-weight:700;letter-spacing:-.035em;line-height:1.1;margin-top:4px">
              ${plan.fresh ? '—'
                : plan.w === 0 ? `${plan.r}<span class="stat-u" style="font-size:16px"> reps</span>`
                : `${fmtW(plan.w)}<span class="stat-u" style="font-size:16px"> kg</span>`}
            </div>
            <div class="tiny dim">${plan.w === 0 && !plan.fresh ? `${plan.sets} sets · eigen gewicht` : `${plan.sets}×${plan.r}`}${plan.up ? ' · omhoog' : ''}</div>
          </div>
          <div class="grow"></div>
          <button class="btn primary sm" data-act="log" data-ex="${exId}">Loggen</button>
        </div>
        ${plan.reason ? `<div class="advice${adviceKind(plan)}" style="margin-top:14px">
          ${svg(adviceIcon(plan))}<span>${esc(plan.reason)}</span></div>` : ''}
        ${peakLine(exId)}
      </div>

      <div class="sec"><h2>Verloop</h2>
        <span class="badge ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%</span></div>

      <div class="seg">
        <button data-act="metric" data-v="top" aria-pressed="${key === 'top'}">Topgewicht</button>
        <button data-act="metric" data-v="e1rm" aria-pressed="${key === 'e1rm'}">Geschat 1RM</button>
        <button data-act="metric" data-v="vol" aria-pressed="${key === 'vol'}">Volume</button>
      </div>
      <div class="seg" style="margin:8px 0 10px">
        <button data-act="period" data-v="3m" aria-pressed="${view.period === '3m'}">3 maanden</button>
        <button data-act="period" data-v="1j" aria-pressed="${view.period === '1j'}">1 jaar</button>
        <button data-act="period" data-v="all" aria-pressed="${view.period === 'all'}">Alles</button>
      </div>

      <div class="glass chart-card">
        ${Charts.line(points, { colour: cat.colour, colour2: '#5ad0e6', height: 165, labels, alt: `${ex.name} verloop` })}
        <div class="row tiny dim" style="justify-content:space-between;padding:4px 4px 8px">
          <span>${use.length} sessies · ${unit}</span>
          <span>${points.filter(p => p.hi).length} records ●</span>
        </div>
      </div>

      <div class="sec"><h2>Records</h2></div>
      <div class="glass chart-card">
        <table class="recs">
          <tr><th>Reps</th><th>Beste</th><th>Wanneer</th></tr>
          ${perRep.map(([r, s]) => `<tr><td>${r}×</td><td><b>${fmtW(s.w)} kg</b></td><td>${dateLabel(s.d, true)}</td></tr>`).join('')}
          ${rec.bestE ? `<tr><td colspan="3" style="padding-top:12px" class="tiny dim">
            Geschat 1RM: <b style="color:var(--warn)">${fmtW(Math.round(Engine.e1rm(rec.bestE.w, rec.bestE.r) * 10) / 10)} kg</b>
            uit ${fmtW(rec.bestE.w)}×${rec.bestE.r} op ${dateLabel(rec.bestE.d, true)}</td></tr>` : ''}
        </table>
      </div>

      ${ladder.length > 2 ? `
      <div class="sec"><h2>Gewichten van deze machine</h2></div>
      <div class="glass chart-card"><div class="chips" style="padding:2px 2px 10px">
        ${ladder.map(w => `<span class="chip${plan.w === w ? ' pr' : ''}">${fmtW(w)}</span>`).join('')}
      </div>
      <p class="tiny dim" style="padding:0 2px 6px;margin:0">Afgeleid uit je logboek — de + knop springt naar de volgende pen.</p>
      </div>` : ''}

      <div class="sec"><h2>Laatste sessies</h2></div>
      <div class="stack">
        ${[...all].reverse().slice(0, 8).map(s => {
          const sets = Store.setsFor(exId).filter(x => x.d === s.d);
          return `<button class="pane plan-item" data-act="log-date" data-ex="${exId}" data-date="${s.d}">
            <span class="grow">
              <span class="plan-cat">${dateLabel(s.d, true)}</span>
              <div class="plan-hint" style="font-size:13.5px;color:var(--ink)">${sets.map(x => `${fmtW(x.w)}×${x.r}`).join('   ')}</div>
            </span>
            <span class="plan-target" style="font-size:13px">${fmtVol(s.vol).v}<small>${fmtVol(s.vol).u}</small></span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  /* ============================= Oefeningen ============================= */

  /** Alle oefeningen van een spiergroep, inclusief de nooit gebruikte. */
  function exercisesIn(catId) {
    const { all } = Engine.rotation(catId);
    const rest = Store.state.exercises
      .filter(e => !e.del && e.cat === catId && !all.some(a => a.ex.id === e.id))
      .map(e => ({ ex: e, uses: 0, since: null, total: 0 }));
    return [...all, ...rest];
  }

  /** Eén regel in een oefeninglijst. */
  function exerciseRow(o, colour) {
    const ser = o.total ? Engine.series(o.ex.id) : [];
    const s = Engine.suggest(o.ex.id);
    return `
      <button class="pane plan-item" style="--c:${colour}" data-act="view-ex" data-ex="${o.ex.id}">
        <span class="dot"></span>
        <span class="grow">
          <div class="plan-ex trunc">${esc(o.ex.name)}</div>
          <div class="plan-hint">${o.since == null ? 'nog niet gedaan'
            : `${agoLabel(o.since)} · ${o.total} ${o.total === 1 ? 'sessie' : 'sessies'}`}</div>
        </span>
        ${ser.length > 2 ? Charts.spark(ser.slice(-14).map(x => x.top), colour) : ''}
        ${s.fresh ? '' : `<span class="plan-target">${fmtW(s.w)}<small>kg</small></span>`}
      </button>`;
  }

  /**
   * Oefeningen: eerst de spiergroepen als mapjes, daarin pas de oefeningen.
   * Zoeken springt over de mapjes heen en doorzoekt alles tegelijk.
   */
  function viewExercises() {
    const q = (view.q || '').toLowerCase().trim();
    const total = Store.state.exercises.filter(e => !e.del).length;
    const search = `<input class="search" type="search" placeholder="Zoeken in alle oefeningen…"
      value="${esc(view.q || '')}" data-act="ex-q" autocomplete="off">`;

    /* --- Zoeken: platte lijst over alle spiergroepen heen --- */
    if (q) {
      const hits = [];
      for (const cat of Store.state.categories) {
        for (const o of exercisesIn(cat.id)) {
          if (o.ex.name.toLowerCase().includes(q)) hits.push({ o, cat });
        }
      }
      return `<div class="view">
        <div class="head"><h1>Oefeningen</h1><p>${hits.length} van ${total} gevonden</p></div>
        ${search}
        <div class="stack" style="margin-top:14px">
          ${hits.map(h => exerciseRow(h.o, h.cat.colour)).join('')
            || '<div class="glass empty"><p>Niets gevonden</p></div>'}
        </div>
      </div>`;
    }

    /* --- In een mapje --- */
    if (view.exCat) {
      const cat = Store.cat(view.exCat);
      const list = exercisesIn(view.exCat);
      return `<div class="view">
        <div class="row" style="padding:6px 0 2px">
          <button class="icon-btn" data-act="back-cat" aria-label="Terug">${svg(I.back)}</button>
          <span class="grow"></span>
          <button class="btn sm ghost" data-act="new-ex" data-cat="${cat.id}">${svg(I.plus)} Nieuw</button>
        </div>
        <div class="head" style="padding-top:6px">
          <h1><span style="color:${cat.colour}">●</span> ${esc(cat.name)}</h1>
          <p>${list.length} ${list.length === 1 ? 'oefening' : 'oefeningen'} · meest gebruikte eerst</p>
        </div>
        ${search}
        <div class="stack" style="margin-top:14px">${list.map(o => exerciseRow(o, cat.colour)).join('')}</div>
      </div>`;
    }

    /* --- Overzicht van de mapjes --- */
    const folders = Store.state.categories.map(cat => {
      const list = exercisesIn(cat.id);
      const done = list.filter(o => o.since != null);
      return {
        cat,
        n: list.length,
        last: done.length ? Math.min(...done.map(o => o.since)) : null,
      };
    }).filter(f => f.n);

    return `<div class="view">
      <div class="head"><h1>Oefeningen</h1><p>${total} in je logboek, verdeeld over ${folders.length} spiergroepen</p></div>
      ${search}
      <div class="stack" style="margin-top:14px">
        ${folders.map(f => `
          <button class="pane plan-item" style="--c:${f.cat.colour}" data-act="ex-cat" data-cat="${f.cat.id}">
            <span class="dot"></span>
            <span class="grow">
              <div class="plan-ex">${esc(f.cat.name)}</div>
              <div class="plan-hint trunc">${f.n} ${f.n === 1 ? 'oefening' : 'oefeningen'}${
                f.last != null ? ` · ${agoLabel(f.last)}` : ''}</div>
            </span>
            <span class="chev">${svg(I.chev)}</span>
          </button>`).join('')}
      </div>
      <button class="btn ghost block" style="margin-top:20px" data-act="new-ex" data-cat="">
        ${svg(I.plus)} Nieuwe oefening
      </button>
    </div>`;
  }

  /* ============================== Meer ================================== */

  /**
   * Of de browser de opslag als blijvend behandelt. Relevant in browsers die
   * streng opruimen (Brave, Safari): staat dit uit, dan is een export je enige
   * vangnet en zeggen we dat er ook bij.
   */
  function storageLine() {
    const { persisted, usage } = Store.storage;
    if (persisted === null) return '';
    const mb = usage ? ` · ${(usage / 1048576).toFixed(1).replace('.', ',')} MB` : '';
    return persisted
      ? `<p class="tiny dim" style="padding:8px 6px 0;margin:0">
           <span style="color:var(--good)">●</span> Opslag is blijvend${mb} — je browser ruimt deze data niet zomaar op.
         </p>`
      : `<p class="tiny" style="padding:8px 6px 0;margin:0;color:var(--warn)">
           ● Je browser heeft blijvende opslag geweigerd${mb}. Installeer de app op je beginscherm,
           of maak regelmatig een back-up naar een bestand.
         </p>`;
  }

  function viewMore() {
    const ov = Engine.overview();
    const n = Store.state.sets.filter(s => !s.del).length;
    const routines = Store.state.routines.filter(r => !r.del);
    const fsa = 'showSaveFilePicker' in window;

    return `<div class="view">
      <div class="head"><h1>Meer</h1><p>${nf(n)} sets · ${nf(ov.sessions)} trainingen</p></div>

      <div class="sec"><h2>Back-up en sync</h2></div>
      <div class="stack">
        <button class="pane set-item" data-act="sync">
          <span class="set-ico">${svg(I.save)}</span>
          <span class="grow"><div class="t">Opslaan naar bestand</div>
            <div class="d">${fsa ? 'Schrijft naar hetzelfde bestand in je Drive-map' : 'Deel of bewaar in Bestanden / iCloud Drive'}</div></span>
        </button>
        <button class="pane set-item" data-act="import">
          <span class="set-ico">${svg(I.upload)}</span>
          <span class="grow"><div class="t">Inlezen van bestand</div>
            <div class="d">Voegt samen met wat er al staat, niets gaat verloren</div></span>
        </button>
      </div>
      <p class="tiny dim" style="padding:10px 6px 0;margin:0">
        Je data staat op dit toestel. Bewaar het exportbestand in iCloud Drive of Google Drive
        en lees het op je andere telefoon in om beide bij te werken.
      </p>
      ${storageLine()}

      <div class="sec"><h2>Routines</h2>
        <button class="link" data-act="new-routine">Nieuw</button></div>
      <div class="stack">
        ${routines.length ? routines.map(r => `
          <button class="pane set-item" data-act="run-routine" data-id="${r.id}">
            <span class="set-ico">${svg(I.list)}</span>
            <span class="grow"><div class="t">${esc(r.name)}</div>
              <div class="d">${r.items.length} oefeningen</div></span>
            <span class="icon-btn" data-act="del-routine" data-id="${r.id}">${svg(I.trash)}</span>
          </button>`).join('')
        : `<button class="pane set-item" data-act="new-routine">
            <span class="set-ico">${svg(I.plus)}</span>
            <span class="grow"><div class="t">Maak een routine</div>
              <div class="d">Zet je vaste dag klaar en start met één tik</div></span>
          </button>`}
      </div>

      <div class="sec"><h2>Gereedschap</h2></div>
      <div class="stack">
        <button class="pane set-item" data-act="plates">
          <span class="set-ico">${svg(I.disc)}</span>
          <span class="grow"><div class="t">Schijvenrekenaar</div>
            <div class="d">Welke schijven op de stang, ${Store.state.gear.bar} kg stang</div></span>
        </button>
        <button class="pane set-item" data-act="stats-all">
          <span class="set-ico">${svg(I.trophy)}</span>
          <span class="grow"><div class="t">Alle records</div>
            <div class="d">Je beste set per oefening</div></span>
        </button>
      </div>

      <div class="sec"><h2>Over</h2></div>
      <div class="glass chart-card">
        <p class="tiny dim" style="margin:0;line-height:1.6">
          Geschiedenis geïmporteerd uit FitNotes: ${nf(n)} sets vanaf ${dateLabel(ov.first, true)}.<br>
          Werkt offline. Zet de app op je beginscherm via het deelmenu → “Zet op beginscherm”.
        </p>
      </div>
    </div>`;
  }

  /* --------------------------- Sheets: overig -------------------------- */

  function sheetPlates(st) {
    const t = st.target;
    const p = Engine.plates(t);
    const colours = { 20: '#2f6fdb', 15: '#e0a52b', 10: '#3a9b46', 5: '#d33', 2.5: '#bbb', 1.25: '#888' };
    const half = p.side.map(w =>
      `<span class="plate" style="background:${colours[w] || '#777'};height:${Math.max(22, Math.min(62, 18 + w * 2.2))}px">${fmtW(w)}</span>`);

    return `
      <div class="sheet-head"><h3>Schijvenrekenaar</h3><p>Stang van ${Store.state.gear.bar} kg</p></div>
      <div class="stepper" style="margin-top:8px">
        <span class="lab">Doel</span>
        <button class="step-btn" data-act="pl" data-d="-1">−</button>
        <span class="val-box"><input class="w-val" type="number" inputmode="decimal" step="2.5" value="${t}" data-act="pl-in"><span class="val-u">kg</span></span>
        <button class="step-btn" data-act="pl" data-d="1">+</button>
      </div>
      <div class="pane plate-vis" style="margin-top:14px">
        ${[...half].reverse().join('')}<span class="bar-vis"></span>${half.join('')}
      </div>
      <div class="prev-line" style="margin-top:10px">
        ${p.ok
          ? `<span class="grow">Per kant: <b>${p.side.length ? p.side.map(fmtW).join(' + ') : 'niets, alleen de stang'}</b></span>`
          : `<span class="grow">Niet precies te maken — <b>${fmtW(p.rest * 2)} kg te veel</b></span>`}
      </div>
      <p class="tiny dim" style="padding:10px 4px 0">
        Beschikbaar: ${Store.state.gear.plates.map(fmtW).join(', ')} kg
      </p>`;
  }

  function sheetRecords() {
    const rows = [];
    for (const e of Store.state.exercises) {
      if (e.del) continue;
      const sets = Store.setsFor(e.id);
      if (sets.length < 3) continue;
      const rec = Engine.records(e.id);
      if (!rec.heaviest) continue;
      rows.push({ ex: e, cat: Store.cat(e.cat), h: rec.heaviest, e1: Engine.e1rm(rec.bestE.w, rec.bestE.r) });
    }
    rows.sort((a, b) => b.e1 - a.e1);

    return `
      <div class="sheet-head"><h3>Alle records</h3><p>Beste set per oefening, op geschat 1RM</p></div>
      ${rows.map(r => `
        <button class="pick" data-act="view-ex" data-ex="${r.ex.id}">
          <span class="dot" style="--c:${r.cat.colour}"></span>
          <span class="grow"><div class="pick-n trunc">${esc(r.ex.name)}</div>
            <div class="pick-m">${fmtW(r.h.w)} kg × ${r.h.r} · ${dateLabel(r.h.d, true)}</div></span>
          <span class="plan-target">${fmtW(Math.round(r.e1))}<small>1RM</small></span>
        </button>`).join('') || '<div class="empty"><p>Nog geen records.</p></div>'}`;
  }

  function sheetRoutine(st) {
    const sel = st.sel || [];
    const cats = Store.state.categories;
    return `
      <div class="sheet-head"><h3>${st.id ? 'Routine aanpassen' : 'Nieuwe routine'}</h3>
        <p>${sel.length} oefeningen gekozen</p></div>
      <input class="search" placeholder="Naam, bijv. Push dag" value="${esc(st.name || '')}" data-act="rt-name">
      ${sel.length ? `<div class="chips" style="margin:12px 2px">
        ${sel.map(id => `<button class="chip pr" data-act="rt-del" data-ex="${id}">${esc(Store.ex(id)?.name || '?')} ✕</button>`).join('')}
      </div>` : ''}
      <button class="btn primary block" style="margin:12px 0" data-act="rt-save" ${sel.length && (st.name || '').trim() ? '' : 'disabled'}>
        ${svg(I.check)} Opslaan
      </button>
      ${cats.map(c => {
        const list = Engine.rotation(c.id).all;
        if (!list.length) return '';
        return `<div class="sec"><h2 style="color:${c.colour}">${esc(c.name)}</h2></div>
          ${list.slice(0, 6).map(o => `
            <button class="pick${sel.includes(o.ex.id) ? ' on' : ''}" data-act="rt-add" data-ex="${o.ex.id}">
              <span class="dot" style="--c:${c.colour}"></span>
              <span class="grow"><div class="pick-n trunc">${esc(o.ex.name)}</div>
                <div class="pick-m">${o.total} sessies</div></span>
              ${sel.includes(o.ex.id) ? svg(I.check, 'tick-i') : ''}
            </button>`).join('')}`;
      }).join('')}`;
  }

  /** Zelfde formulier voor een nieuwe oefening en voor het aanpassen van een bestaande. */
  function sheetNewEx(st) {
    const edit = !!st.exId;
    const n = edit ? Store.setsFor(st.exId).length : 0;
    return `
      <div class="sheet-head">
        <h3>${edit ? 'Oefening aanpassen' : 'Nieuwe oefening'}</h3>
        <p>${edit
          ? `${nf(n)} ${n === 1 ? 'set' : 'sets'} blijven eraan hangen`
          : 'Kies een spiergroep'}</p>
      </div>
      <input class="search" placeholder="Naam van de oefening" value="${esc(st.name || '')}" data-act="nx-name" autocomplete="off">
      <div class="stack" style="margin-top:14px">
        ${Store.state.categories.map(c => `
          <button class="pane plan-item" style="--c:${c.colour}" data-act="nx-cat" data-cat="${c.id}">
            <span class="dot"></span>
            <span class="grow"><div class="plan-ex">${esc(c.name)}</div></span>
            ${st.cat === c.id ? `<span class="tick on">${svg(I.check)}</span>` : ''}
          </button>`).join('')}
      </div>
      <button class="btn primary block" style="margin-top:16px" data-act="nx-save"
        ${(st.name || '').trim() && st.cat ? '' : 'disabled'}>
        ${svg(edit ? I.check : I.plus)} ${edit ? 'Opslaan' : 'Toevoegen'}
      </button>`;
  }

  function sheetNote(st) {
    return `
      <div class="sheet-head"><h3>Notitie</h3><p>Komt bij de volgende set die je logt</p></div>
      <input class="search" placeholder="Bijv. zwaar, schouderpijn, andere machine" value="${esc(st.note || '')}" data-act="note-in" autocomplete="off">
      <button class="btn primary block" style="margin-top:14px" data-act="note-save">Bewaren</button>`;
  }

  /* ============================== Render ================================ */

  const VIEWS = {
    today: viewToday, history: viewHistory, progress: viewProgress,
    exercises: viewExercises, more: viewMore,
  };

  const TABS = [
    { id: 'today', label: 'Vandaag', icon: I.today },
    { id: 'history', label: 'Historie', icon: I.hist },
    { id: 'progress', label: 'Progressie', icon: I.prog },
    { id: 'exercises', label: 'Oefeningen', icon: I.dumb },
    { id: 'more', label: 'Meer', icon: I.more },
  ];

  function render() {
    Engine.clear();
    app.innerHTML = view.exId ? viewExercise(view.exId) : (VIEWS[view.tab] || viewToday)();
    tabbar.innerHTML = TABS.map(t => `
      <button class="tab" data-act="tab" data-tab="${t.id}"
        ${view.tab === t.id && !view.exId ? 'aria-current="page"' : ''}>
        ${svg(t.icon)}<span>${t.label}</span>
      </button>`).join('');
    if (!view.keepScroll) window.scrollTo(0, 0);
    view.keepScroll = false;
  }

  function go(tab) {
    view.tab = tab;
    view.exId = null;
    view.exCat = null;
    view.q = '';
    view.histN = 25;
    render();
  }

  /* ============================== Acties ================================ */

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;
    const inSheet = !!el.closest('#sheet');

    switch (a) {
      /* -- navigatie -- */
      case 'tab': go(el.dataset.tab); break;
      case 'back': view.exId = null; render(); break;

      case 'ex-cat': view.exCat = el.dataset.cat; view.q = ''; render(); break;
      case 'back-cat': view.exCat = null; view.q = ''; render(); break;

      case 'view-ex':
        if (inSheet) closeSheet();
        view.exId = el.dataset.ex;
        view.period = 'all';
        view.metric = 'top';
        render();
        break;

      case 'metric': view.metric = el.dataset.v; view.keepScroll = true; render(); break;
      case 'period': view.period = el.dataset.v; view.keepScroll = true; render(); break;
      case 'more-hist': view.histN = (view.histN || 25) + 25; view.keepScroll = true; render(); break;

      /* -- loggen -- */
      case 'start': {
        const p = todayPlan()[0];
        if (p) openLog(p.exId); else toast('Voeg eerst een oefening toe');
        break;
      }
      case 'next-ex': {
        const next = todayPlan().find(p => p.logged.length < p.plan.sets);
        if (next) openLog(next.exId);
        else { toast('Alles afgerond. Sterk gedaan.'); buzz(20); }
        break;
      }
      case 'log': openLog(el.dataset.ex); break;
      case 'log-date': openLog(el.dataset.ex, el.dataset.date); break;

      case 'w': case 'r': {
        const st = sheetState;
        const d = +el.dataset.d;
        if (a === 'w') st.w = Engine.stepWeight(st.exId, st.w, d);
        else st.r = Math.max(1, st.r + d);
        buzz(8);
        drawSheet();
        break;
      }

      case 'save-set': saveSet(); break;

      case 'set-del': {
        const id = el.dataset.id;
        const s = Store.state.sets.find(x => x.id === id);
        Store.removeSet(id);
        if (sheetState?.editId === id) sheetState.editId = null;
        Engine.clear();
        drawSheet();
        render();
        toast(s ? `${fmtW(s.w)} kg × ${s.r} verwijderd` : 'Set verwijderd', 5000, {
          label: 'Ongedaan maken',
          run: () => {
            Store.restoreSet(id);
            Engine.clear();
            drawSheet();
            render();
            toast('Terug');
          },
        });
        break;
      }

      case 'set-edit': {
        const s = Store.state.sets.find(x => x.id === el.dataset.id);
        if (!s) break;
        sheetState.editId = s.id;
        sheetState.w = s.w;
        sheetState.r = s.r;
        drawSheet();
        break;
      }

      case 'edit-cancel': {
        const plan = sheetState.plan;
        sheetState.editId = null;
        sheetState.w = plan.fresh ? 20 : plan.w;
        sheetState.r = plan.r;
        drawSheet();
        break;
      }

      case 'toast-act': {
        const a = toastAction;
        hideToast();
        a?.run();
        break;
      }

      case 'swap-ex':
        openSheet(sheetPick, {
          kind: 'pick', cat: el.dataset.cat, current: sheetState?.exId,
          date: sheetState?.date, title: 'Andere oefening',
        });
        break;

      case 'pick-ex': {
        const forProgress = sheetState?.kind === 'pick-prog';
        const date = sheetState?.date || Engine.today();
        closeSheet();
        if (forProgress) {
          view.exId = el.dataset.ex;
          view.period = 'all';
          view.metric = 'top';
          render();
        } else {
          setTimeout(() => openLog(el.dataset.ex, date), 60);
        }
        break;
      }

      case 'pick-progress':
        openSheet(sheetPick, { kind: 'pick-prog', title: 'Kies een oefening' });
        break;

      case 'note':
        openSheet(sheetNote, { kind: 'note', back: { ...sheetState }, note: '' });
        break;

      case 'note-save': {
        const back = sheetState.back;
        const note = sheetState.note;
        openSheet(sheetLog, { ...back, note });
        if (note) toast('Notitie komt bij je volgende set');
        break;
      }

      /* -- oefeningen -- */
      case 'new-ex':
        openSheet(sheetNewEx, { kind: 'newex', cat: el.dataset.cat || null, name: '' });
        break;

      case 'edit-ex': {
        const ex = Store.ex(el.dataset.ex);
        if (ex) openSheet(sheetNewEx, { kind: 'newex', exId: ex.id, name: ex.name, cat: ex.cat });
        break;
      }

      case 'nx-cat': sheetState.cat = el.dataset.cat; drawSheet(); break;

      case 'nx-save': {
        const { name, cat, exId } = sheetState;
        if (exId) {
          Store.updateExercise(exId, { name: name.trim(), cat });
          toast('Opgeslagen');
        } else {
          toast(`${Store.addExercise(name, cat).name} toegevoegd`);
        }
        Engine.clear();
        closeSheet();
        render();
        break;
      }

      /* -- routines -- */
      case 'new-routine': openSheet(sheetRoutine, { kind: 'routine', sel: [], name: '' }); break;
      case 'rt-add': {
        const id = el.dataset.ex;
        const s = sheetState;
        s.sel = s.sel.includes(id) ? s.sel.filter(x => x !== id) : [...s.sel, id];
        drawSheet();
        break;
      }
      case 'rt-del': sheetState.sel = sheetState.sel.filter(x => x !== el.dataset.ex); drawSheet(); break;
      case 'rt-save':
        Store.saveRoutine(sheetState.name.trim(), sheetState.sel, sheetState.id);
        closeSheet();
        toast('Routine opgeslagen');
        render();
        break;
      case 'del-routine':
        e.stopPropagation();
        Store.removeRoutine(el.dataset.id);
        render();
        toast('Routine verwijderd');
        break;
      case 'run-routine': {
        const r = Store.state.routines.find(x => x.id === el.dataset.id);
        if (!r?.items.length) break;
        Store.startRoutine(r.id, Engine.today());
        Engine.clear();
        go('today');
        toast(`${r.name} gestart`);
        break;
      }

      case 'stop-routine':
        Store.startRoutine(null);
        Engine.clear();
        render();
        break;

      /* -- gereedschap -- */
      case 'plates': openSheet(sheetPlates, { kind: 'plates', target: 60 }); break;
      case 'pl':
        sheetState.target = Math.max(Store.state.gear.bar, sheetState.target + (+el.dataset.d) * 2.5);
        drawSheet();
        break;
      case 'stats-all': openSheet(sheetRecords, { kind: 'recs' }); break;

      /* -- sync -- */
      case 'sync': doExport(); break;
      case 'import': doImport(); break;
    }
  });

  /* Invoervelden */
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = el.dataset.act;

    if (a === 'ex-q') { view.q = el.value; view.keepScroll = true; const p = el.selectionStart; render(); const n = app.querySelector('[data-act="ex-q"]'); if (n) { n.focus(); n.setSelectionRange(p, p); } }
    else if (a === 'pick-q') { sheetState.q = el.value; const p = el.selectionStart; drawSheet(); const n = sheetBody.querySelector('[data-act="pick-q"]'); if (n) { n.focus(); n.setSelectionRange(p, p); } }
    else if (a === 'w-in') sheetState.w = Math.max(0, +el.value || 0);
    else if (a === 'r-in') sheetState.r = Math.max(1, Math.round(+el.value) || 1);
    else if (a === 'date-in') {
      // Een andere dag betekent een ander voorstel en een andere setlijst.
      if (!el.value) return;
      const st = sheetState;
      st.date = el.value;
      st.editId = null;
      st.plan = Engine.suggest(st.exId, st.date);
      const logged = Store.setsOn(st.date).filter(s => s.ex === st.exId);
      const base = logged[logged.length - 1];
      st.w = base ? base.w : (st.plan.fresh ? 20 : st.plan.w);
      st.r = base ? base.r : st.plan.r;
      drawSheet();
    }
    else if (a === 'pl-in') { sheetState.target = +el.value || 0; clearTimeout(sheetState._t); sheetState._t = setTimeout(drawSheet, 500); }
    else if (a === 'rt-name') { sheetState.name = el.value; const b = sheetBody.querySelector('[data-act="rt-save"]'); if (b) b.disabled = !(el.value.trim() && sheetState.sel.length); }
    else if (a === 'nx-name') { sheetState.name = el.value; const b = sheetBody.querySelector('[data-act="nx-save"]'); if (b) b.disabled = !(el.value.trim() && sheetState.cat); }
    else if (a === 'note-in') sheetState.note = el.value;
  });

  /* ============================ Sync met bestand ======================== */

  async function doExport() {
    const blob = Store.exportBlob();
    const name = Store.fileName();

    // Chrome/Android/desktop: onthoudt het bestand, dus daarna één tik.
    if ('showSaveFilePicker' in window) {
      try {
        let h = await Store.getHandle();
        if (!h || !(await Store.handleReady(h, 'readwrite'))) {
          h = await window.showSaveFilePicker({
            suggestedName: name,
            types: [{ description: 'Kracht back-up', accept: { 'application/json': ['.json'] } }],
          });
          await Store.setHandle(h);
        }
        const w = await h.createWritable();
        await w.write(blob);
        await w.close();
        toast(`Opgeslagen in ${h.name}`);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('bestandshandle mislukt', err);
      }
    }

    // iOS: het deelmenu geeft toegang tot “Bewaar in Bestanden” → iCloud Drive.
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Kracht back-up' });
        toast('Gedeeld');
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Bestand gedownload');
  }

  function doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const r = Store.merge(data);
        Engine.clear();
        render();
        toast(r.sets || r.setsUpdated
          ? `${r.sets} nieuwe sets, ${r.setsUpdated} bijgewerkt — nu ${nf(r.total)} totaal`
          : 'Alles stond er al in', 3200);
      } catch (err) {
        console.error(err);
        toast('Kon dit bestand niet lezen');
      }
    };
    input.click();
  }

  /* =============================== Start ================================ */

  Store.init().then(() => {
    Engine.clear();
    render();

    // Snelkoppeling uit het manifest: direct het logscherm van de eerste
    // voorgestelde oefening, zodat je vanaf je beginscherm meteen kunt loggen.
    if (new URLSearchParams(location.search).get('a') === 'log') {
      history.replaceState(null, '', location.pathname);
      const p = todayPlan()[0];
      if (p) openLog(p.exId);
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('sw', e));
    }
  }).catch(err => {
    console.error(err);
    app.innerHTML = `<div class="glass empty" style="margin-top:60px">
      <p>De app kon niet starten.<br><span class="tiny">${esc(err.message)}</span></p></div>`;
  });
})();
