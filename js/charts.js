/* =========================================================================
   charts.js — SVG-grafieken, met de hand getekend.

   Geen externe bibliotheek: de app moet volledig offline werken en snel
   starten op een telefoon. Alles is een string met een viewBox, dus het
   schaalt mee met de breedte van het scherm.
   ========================================================================= */

const Charts = (() => {
  const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const r2 = n => Math.round(n * 100) / 100;

  /** Catmull-Rom door de punten, omgezet naar bezier: vloeiend zonder doorschieten. */
  function smooth(pts, tension = 0.34) {
    if (pts.length < 2) return '';
    let d = `M${r2(pts[0][0])},${r2(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) * tension / 2, p1[1] + (p2[1] - p0[1]) * tension / 2];
      const c2 = [p2[0] - (p3[0] - p1[0]) * tension / 2, p2[1] - (p3[1] - p1[1]) * tension / 2];
      d += `C${r2(c1[0])},${r2(c1[1])} ${r2(c2[0])},${r2(c2[1])} ${r2(p2[0])},${r2(p2[1])}`;
    }
    return d;
  }

  /**
   * Lijngrafiek met verloopvlak eronder.
   * points: [{x: getal, y: getal, label, hi}]  — hi markeert een record.
   */
  function line(points, opts = {}) {
    const W = 320, H = opts.height || 150;
    const padL = 30, padR = 8, padT = 12, padB = 20;
    const uid = 'g' + Math.random().toString(36).slice(2, 8);
    const colour = opts.colour || '#8b7dff';
    const colour2 = opts.colour2 || '#5ad0e6';

    if (points.length < 2) {
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#7c7f93" font-size="11">Te weinig data</text></svg>`;
    }

    const ys = points.map(p => p.y);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi === lo) { hi += 1; lo -= 1; }
    const span = hi - lo;
    lo -= span * 0.14;
    hi += span * 0.14;

    const iw = W - padL - padR, ih = H - padT - padB;
    const X = i => padL + (points.length === 1 ? iw / 2 : i / (points.length - 1) * iw);
    const Y = v => padT + ih - (v - lo) / (hi - lo) * ih;

    const pts = points.map((p, i) => [X(i), Y(p.y)]);
    const path = smooth(pts);
    const area = `${path}L${r2(pts[pts.length - 1][0])},${padT + ih}L${r2(pts[0][0])},${padT + ih}Z`;

    // Drie rasterlijnen met een waarde ernaast.
    let grid = '';
    for (let i = 0; i <= 2; i++) {
      const v = lo + (hi - lo) * (i / 2);
      const y = Y(v);
      grid += `<line x1="${padL}" y1="${r2(y)}" x2="${W - padR}" y2="${r2(y)}" stroke="currentColor" stroke-opacity=".07" stroke-width="1"/>`
           +  `<text x="${padL - 6}" y="${r2(y + 3.4)}" text-anchor="end" fill="currentColor" fill-opacity=".38" font-size="9">${Math.round(v)}</text>`;
    }

    // Records als extra ring, laatste punt altijd zichtbaar.
    let dots = '';
    points.forEach((p, i) => {
      const last = i === points.length - 1;
      if (!p.hi && !last) return;
      const x = r2(X(i)), y = r2(Y(p.y));
      if (p.hi) dots += `<circle cx="${x}" cy="${y}" r="5.5" fill="#ffd76e" fill-opacity=".22"/>`;
      dots += `<circle cx="${x}" cy="${y}" r="${last ? 4 : 3}" fill="${p.hi ? '#ffd76e' : colour2}" stroke="#0b0b14" stroke-width="1.5"/>`;
    });

    const labels = (opts.labels || []).map(l =>
      `<text x="${r2(X(l.i))}" y="${H - 5}" text-anchor="${l.i === 0 ? 'start' : l.i === points.length - 1 ? 'end' : 'middle'}" fill="currentColor" fill-opacity=".38" font-size="9">${esc(l.t)}</text>`
    ).join('');

    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.alt || 'Grafiek')}">
      <defs>
        <linearGradient id="${uid}f" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${colour}" stop-opacity=".42"/>
          <stop offset="1" stop-color="${colour}" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="${uid}s" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="${colour2}"/>
        </linearGradient>
        <filter id="${uid}glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${grid}
      <path d="${area}" fill="url(#${uid}f)"/>
      <path d="${path}" fill="none" stroke="url(#${uid}s)" stroke-width="2.4" stroke-linecap="round"
            stroke-linejoin="round" filter="url(#${uid}glow)"/>
      ${dots}${labels}
    </svg>`;
  }

  /** Staafdiagram, gebruikt voor volume per maand. */
  function bars(data, opts = {}) {
    const W = 320, H = opts.height || 130;
    const padT = 10, padB = 22;
    const max = Math.max(...data.map(d => d.v), 1);
    const n = data.length;
    const gap = 4;
    const bw = (W - gap * (n - 1)) / n;
    const ih = H - padT - padB;
    const uid = 'b' + Math.random().toString(36).slice(2, 8);

    const rects = data.map((d, i) => {
      const h = Math.max(d.v > 0 ? 3 : 0, d.v / max * ih);
      const x = r2(i * (bw + gap));
      const y = r2(padT + ih - h);
      const rad = Math.min(bw / 2.4, 6);
      return `<rect x="${x}" y="${y}" width="${r2(bw)}" height="${r2(h)}" rx="${r2(rad)}"
                fill="url(#${uid}g)" opacity="${d.now ? 1 : 0.78}"/>`
        + (d.now ? `<rect x="${x}" y="${y}" width="${r2(bw)}" height="${r2(h)}" rx="${r2(rad)}" fill="none" stroke="#5ad0e6" stroke-opacity=".55"/>` : '');
    }).join('');

    const labels = data.map((d, i) =>
      `<text x="${r2(i * (bw + gap) + bw / 2)}" y="${H - 7}" text-anchor="middle"
         fill="currentColor" fill-opacity="${d.now ? '.75' : '.34'}" font-size="9">${esc(d.label)}</text>`
    ).join('');

    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.alt || 'Staafdiagram')}">
      <defs><linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8b7dff"/><stop offset="1" stop-color="#5ad0e6" stop-opacity=".55"/>
      </linearGradient></defs>
      ${rects}${labels}
    </svg>`;
  }

  /**
   * Jaarkalender: één kolom per week, gekleurd naar het aantal sets.
   * Rendert als HTML in plaats van SVG zodat hij horizontaal kan scrollen.
   */
  function heatmap(byDate, weeks = 27) {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // terug naar maandag

    const cols = [];
    const months = [];
    let cur = new Date(start);
    let lastMonth = -1;

    while (cur <= now) {
      const col = [];
      let monthLabel = '';
      for (let i = 0; i < 7; i++) {
        const iso = Engine.toISO(cur);
        const n = byDate.get(iso)?.length || 0;
        const lvl = n === 0 ? 0 : n <= 8 ? 1 : n <= 14 ? 2 : 3;
        const future = cur > now;
        col.push(future
          ? `<span class="cal-d" style="opacity:.25"></span>`
          : `<span class="cal-d${lvl ? ' l' + lvl : ''}" title="${iso}${n ? ` — ${n} sets` : ''}"></span>`);
        if (i === 0 && cur.getMonth() !== lastMonth) {
          lastMonth = cur.getMonth();
          monthLabel = cur.toLocaleDateString('nl-NL', { month: 'short' });
        }
        cur.setDate(cur.getDate() + 1);
      }
      months.push(`<span style="width:14px;flex:none">${monthLabel}</span>`);
      cols.push(`<span class="cal-w">${col.join('')}</span>`);
    }

    return `<div class="cal-m">${months.join('')}</div><div class="cal">${cols.join('')}</div>`;
  }

  /** Kleine lijn zonder assen, voor in een rij van een lijst. */
  function spark(values, colour = '#5ad0e6', w = 62, h = 22) {
    if (values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
    const lo = Math.min(...values), hi = Math.max(...values);
    const span = hi - lo || 1;
    const pts = values.map((v, i) => [i / (values.length - 1) * (w - 2) + 1, h - 2 - (v - lo) / span * (h - 4)]);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <path d="${smooth(pts)}" fill="none" stroke="${colour}" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>
      <circle cx="${r2(pts[pts.length - 1][0])}" cy="${r2(pts[pts.length - 1][1])}" r="2.2" fill="${colour}"/>
    </svg>`;
  }

  return { line, bars, heatmap, spark };
})();
