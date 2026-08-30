/* Kronos - lógica de la interfaz.
   Dos modos:
   - ESTÁTICO (publicado en GitHub Pages): si existe data/days.json, carga el
     índice de días (ayer/hoy/mañana), renderiza el seleccionado y las
     estadísticas globales. Los deportes sin contenido se ocultan.
   - EN VIVO: si no, usa el gateway (/api/predict) con selectores interactivos.
*/
(function () {
  "use strict";

  const state = { sports: [], currentSport: null, currentLeague: null, loading: false };

  const $ = (id) => document.getElementById(id);

  const els = {
    sportPills: $("sportPills"), leagueSelect: $("leagueSelect"), dateInput: $("dateInput"),
    btnPredict: $("btnPredict"), btnPredictLabel: $("btnPredictLabel"), btnRefresh: $("btnRefresh"),
    healthDot: $("healthDot"), healthText: $("healthText"),
    loadingSection: $("loadingSection"), loadingText: $("loadingText"),
    errorSection: $("errorSection"), errorText: $("errorText"),
    resultsSection: $("resultsSection"), picksGrid: $("picksGrid"), picksCount: $("picksCount"),
    gamesList: $("gamesList"), gamesCount: $("gamesCount"), elapsedText: $("elapsedText"),
    emptyState: $("emptyState"), dateHint: $("dateHint"),
    staticRoot: $("staticRoot"), controlBar: $("controlBar"),
  };

  /* ── utilidades ─────────────────────────────────────── */

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function shiftDate(days) {
    const d = new Date(); d.setDate(d.getDate() + days); return fmtDate(d);
  }
  function initials(name) {
    if (!name) return "?";
    const parts = String(name).split(/[\s\-]/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function fmtDateLong(dateStr) {
    try {
      return new Date(dateStr + (dateStr.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    } catch (e) { return dateStr; }
  }
  async function api(path, body) {
    const opts = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method: "GET" };
    const resp = await fetch(path, opts);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || data.ok === false) throw new Error(data.error || `HTTP ${resp.status}`);
    return data;
  }

  /* ── animaciones ────────────────────────────────────── */

  function countUp(el, target, dur = 900) {
    if (target === null || target === undefined) { el.textContent = "-"; return; }
    const t0 = performance.now();
    function step(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target * 100) + "%";
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function animateIn(container) {
    container.querySelectorAll(".pick-card").forEach((c, i) => {
      c.style.animationDelay = `${i * 0.07}s`;
      c.classList.add("visible");
    });
  }
  function countUpAll(scope) {
    scope.querySelectorAll(".prob-big, .m-prob").forEach((el) => {
      if (el.dataset.counted) return;
      el.dataset.counted = "1";
      const t = parseFloat(el.dataset.target || "");
      countUp(el, isNaN(t) ? null : t);
    });
  }

  /* ── builders compartidos ───────────────────────────── */

  function tierClass(tier) {
    const t = (tier || "").toUpperCase();
    if (t.includes("TOP")) return "tier-top";
    if (t.includes("MUY")) return "tier-muy";
    if (t.includes("BUENO")) return "tier-bueno";
    return "tier-destacado";
  }
  function tierBadge(tier) {
    const t = (tier || "").toUpperCase();
    let cls = "tier-bueno-badge";
    if (t.includes("TOP")) cls = "tier-top-badge";
    else if (t.includes("MUY")) cls = "tier-muy-badge";
    else if (t.includes("DESTACADO")) cls = "tier-destacado-badge";
    return `<span class="tier-badge ${cls}">${esc(tier)}</span>`;
  }
  function pickCardHTML(p) {
    const isTop = (p.tier || "").toUpperCase().includes("TOP");
    return `
      <div class="flex justify-between items-start mb-3">
        <span class="font-mono text-xs text-text-muted uppercase tracking-wider">${esc(p.market)}</span>
        <span class="flex items-center gap-2">${tierBadge(p.tier)}
          <span class="strong-dot ${isTop ? "gold" : ""}"></span>
        </span>
      </div>
      <h3 class="font-headline font-semibold text-base text-on-surface mb-1 leading-snug">${esc(p.match)}</h3>
      <p class="font-headline text-sm text-text-muted mb-4">Pick: <span class="text-on-surface font-semibold">${esc(p.pick)}</span></p>
      <div class="flex justify-between items-end">
        <div>
          <span class="font-mono text-xs text-text-muted block mb-1">Probabilidad</span>
          <span class="prob-big" data-target="${p.prob ?? ""}">0%</span>
        </div>
        <div class="text-right">
          <span class="font-mono text-xs text-text-muted block mb-1">Unidades</span>
          <span class="font-mono text-sm text-on-surface">${esc(p.units || "—")}</span>
        </div>
      </div>
      ${p.note ? `<p class="font-mono text-[0.7rem] text-text-muted mt-3">${esc(p.note)}</p>` : ""}`;
  }
  function gameRowHTML(g) {
    const conv = g.convergence === true;
    return `
      <div class="flex items-center justify-between px-4 py-3.5">
        <div class="flex items-center gap-3 min-w-0">
          <span class="team-icon">${esc(g.home_abbrev || initials(g.home))}</span>
          <div class="min-w-0">
            <div class="font-headline font-semibold text-sm text-on-surface truncate">
              ${esc(g.home)} <span class="text-text-muted font-normal mx-1">vs</span> ${esc(g.away)}
            </div>
            <div class="flex items-center gap-2 mt-1">
              ${g.league_label ? `<span class="league-tag">${esc(g.league_label)}</span>` : ""}
              ${g.context ? `<span class="font-mono text-[0.7rem] text-text-muted truncate">${esc(g.context)}</span>` : ""}
              ${conv ? `<span class="font-mono text-[0.7rem] text-emerald font-semibold">✓ conv.</span>` : ""}
            </div>
          </div>
        </div>
        <span class="material-symbols-outlined chevron text-text-muted text-lg ml-3">expand_more</span>
      </div>
      <div class="markets-panel bg-surface/50">
        <div class="px-2 pb-2">
          ${g.extra ? `<div class="market-row" style="border-top:0"><span class="m-label">Alineación</span><span class="m-pick" style="grid-column: span 3">${esc(g.extra)}</span></div>` : ""}
          ${(g.markets || []).map((m) => `
            <div class="market-row ${m.strong ? "strong" : ""}">
              <span class="m-label">${esc(m.label)}</span>
              <span class="m-pick">${esc(m.pick)}</span>
              <span class="m-prob" data-target="${m.prob ?? ""}">${m.prob != null ? "0%" : "-"}</span>
              <span class="m-detail">${esc(m.detail)}</span>
            </div>`).join("")}
        </div>
      </div>`;
  }
  function gameRowBind(row) {
    row.addEventListener("click", () => {
      const panel = row.querySelector(".markets-panel");
      const open = row.classList.toggle("open");
      panel.classList.toggle("open", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
      if (open) countUpAll(panel);
    });
  }
  function renderGames(predictions, container) {
    container.innerHTML = "";
    if (!predictions || !predictions.length) return 0;
    predictions.forEach((g) => {
      const row = document.createElement("div");
      row.className = "game-row border-b border-border-subtle last:border-b-0";
      row.innerHTML = gameRowHTML(g);
      gameRowBind(row);
      container.appendChild(row);
    });
    return predictions.length;
  }
  function renderPicks(picks, container, countEl) {
    container.innerHTML = "";
    if (!picks || !picks.length) {
      if (countEl) countEl.textContent = "";
      return 0;
    }
    picks.sort((a, b) => (b.prob || 0) - (a.prob || 0));
    const shown = picks.slice(0, 12);
    if (countEl) countEl.textContent = `(${shown.length})`;
    shown.forEach((p) => {
      const card = document.createElement("div");
      card.className = `pick-card ${tierClass(p.tier)}`;
      card.innerHTML = pickCardHTML(p);
      container.appendChild(card);
    });
    animateIn(container);
    countUpAll(container);
    return shown.length;
  }
  function setBtnLoading(on) {
    state.loading = on;
    els.btnPredict.disabled = on;
    els.btnPredict.classList.toggle("spinning", on);
    els.btnPredictLabel.textContent = on ? "Calculando…" : "Predecir";
  }
  function showError(msg) { els.errorText.textContent = msg; els.errorSection.classList.remove("hidden"); }
  function hideError() { els.errorSection.classList.add("hidden"); }

  /* ═══════════ MODO EN VIVO ═══════════ */

  function renderSportPills() {
    els.sportPills.innerHTML = "";
    state.sports.forEach((s) => {
      const btn = document.createElement("button");
      btn.className = "pill";
      btn.dataset.key = s.key;
      btn.innerHTML = `<span class="material-symbols-outlined">${esc(s.icon)}</span>${esc(s.name)}`;
      btn.addEventListener("click", () => selectSport(s.key));
      els.sportPills.appendChild(btn);
    });
    if (state.sports.length) selectSport(state.sports[0].key, true);
  }
  function selectSport(key, force = false) {
    if (!force && key === state.currentSport) return;
    const sport = state.sports.find((s) => s.key === key);
    if (!sport) return;
    state.currentSport = sport;
    document.querySelectorAll(".pill").forEach((p) => p.classList.toggle("active", p.dataset.key === key));
    els.leagueSelect.innerHTML = "";
    const opts = [];
    if (sport.leagues.length > 1) opts.push(new Option("Todas las ligas", "ALL"));
    sport.leagues.forEach((lg) => opts.push(new Option(lg.name, lg.code)));
    opts.forEach((o) => els.leagueSelect.add(o));
    state.currentLeague = opts[0].value;
    if (!els.dateInput.value) els.dateInput.value = shiftDate(0);
  }
  async function predict(force = false) {
    if (state.loading) return;
    if (!state.currentSport || !state.currentLeague) { showError("Selecciona deporte y liga."); return; }
    hideError();
    els.resultsSection.classList.add("hidden");
    els.loadingSection.classList.remove("hidden");
    els.loadingText.textContent = `Consultando al modelo de ${state.currentSport.name} (${state.currentLeague})… puede tardar unos segundos`;
    setBtnLoading(true);
    try {
      const data = await api("/api/predict", {
        sport: state.currentSport.key, league: state.currentLeague,
        date: els.dateInput.value, refresh: force ? 1 : 0,
      });
      els.loadingSection.classList.add("hidden");
      els.resultsSection.classList.remove("hidden");
      renderPicks(data.picks || [], els.picksGrid, els.picksCount);
      const n = renderGames(data.predictions || [], els.gamesList);
      if (n === 0) els.emptyState.classList.remove("hidden"); else els.emptyState.classList.add("hidden");
      els.gamesCount.textContent = n ? `(${n})` : "";
      if (data.elapsed_s) els.elapsedText.textContent = `modelo ${data.sport_name || ""} · ${data.elapsed_s}s`;
      if (data.message) els.dateHint.textContent = data.message;
      renderLeagueFilter(data);
    } catch (err) {
      els.loadingSection.classList.add("hidden");
      els.resultsSection.classList.add("hidden");
      showError(err.message || "Error desconocido");
    } finally {
      setBtnLoading(false);
    }
  }
  function renderLeagueFilter(data) {
    const prev = document.getElementById("leagueFilterBar");
    if (prev) prev.remove();
    if (!data.all_leagues || !data.predictions || !data.predictions.length) return;
    const codes = [...new Set(data.predictions.map((g) => g.league_code).filter(Boolean))];
    if (codes.length < 2) return;
    const bar = document.createElement("div");
    bar.id = "leagueFilterBar";
    bar.className = "flex flex-wrap items-center gap-2 mb-4";
    bar.innerHTML = `<span class="font-mono text-xs text-text-muted uppercase tracking-wider">Liga:</span>`;
    const pills = [];
    const make = (label, code) => {
      const b = document.createElement("button");
      b.className = "chip" + (code === "" ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        pills.forEach((x) => x.classList.remove("on")); b.classList.add("on");
        const preds = (data.predictions || []).filter((g) => !code || g.league_code === code);
        const pks = (data.picks || []).filter((p) => !code || p.league_code === code);
        renderGames(preds, els.gamesList);
        renderPicks(pks, els.picksGrid, els.picksCount);
        els.gamesCount.textContent = preds.length ? `(${preds.length})` : "";
        if (preds.length === 0) els.emptyState.classList.remove("hidden"); else els.emptyState.classList.add("hidden");
      });
      return b;
    };
    pills.push(make("Todas", ""));
    codes.forEach((c) => pills.push(make(c, c)));
    pills.forEach((b) => bar.appendChild(b));
    els.resultsSection.insertBefore(bar, els.resultsSection.firstChild);
  }

  let healthTimer = null;
  function scheduleHealth(ms) { if (healthTimer) clearInterval(healthTimer); healthTimer = setInterval(refreshHealth, ms); }
  async function refreshHealth() {
    try {
      const data = await api("/api/health");
      const workers = data.workers || [];
      const ready = workers.filter((w) => w.ready);
      const all = ready.length === workers.length && workers.length > 0;
      els.healthDot.className = "status-dot " + (all ? "ok" : "err");
      if (all) {
        els.healthText.textContent = `${ready.length}/${workers.length} modelos listos`;
        scheduleHealth(30000);
      } else {
        const bad = workers.filter((w) => !w.ready);
        els.healthText.textContent = `${ready.length}/${workers.length} listos · cargando: ${bad.map((b) => b.sport).join(", ")}`;
        scheduleHealth(5000);
      }
    } catch (err) {
      els.healthDot.className = "status-dot err";
      els.healthText.textContent = "gateway sin conexión";
      scheduleHealth(5000);
    }
  }
  function initLive() {
    els.controlBar.classList.remove("hidden");
    els.dateInput.value = shiftDate(0);
    document.querySelectorAll(".chip").forEach((c) => {
      if (c.dataset.offset === "0") c.classList.add("on");
      c.addEventListener("click", () => {
        els.dateInput.value = shiftDate(parseInt(c.dataset.offset, 10));
        document.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
        c.classList.add("on");
      });
    });
    els.btnPredict.addEventListener("click", () => predict(false));
    els.btnRefresh.addEventListener("click", () => predict(true));
    els.leagueSelect.addEventListener("change", () => { state.currentLeague = els.leagueSelect.value; });
    document.querySelectorAll(".nav-link").forEach((n) => {
      n.addEventListener("click", () => {
        if (n.dataset.nav === "dashboard") return;
        const sport = state.sports.find((s) => s.key === n.dataset.nav);
        if (sport) selectSport(sport.key);
      });
    });
    window.addEventListener("scroll", () => {
      document.querySelector(".nav-blur").classList.toggle("scrolled", window.scrollY > 8);
    }, { passive: true });
    refreshHealth();
    api("/api/sports").then((data) => {
      state.sports = data.sports || [];
      renderSportPills();
    }).catch((err) => showError("No se pudo cargar el catálogo de deportes: " + err.message));
  }

  /* ═══════════ MODO ESTÁTICO (publicado) ═══════════ */

  const chartInstances = {};

  function dayLabel(d, today) {
    if (d === today) return "Hoy";
    const t = new Date(today + "T12:00:00");
    const dt = new Date(d + "T12:00:00");
    const diff = Math.round((dt - t) / 86400000);
    if (diff === -1) return "Ayer";
    if (diff === 1) return "Mañana";
    return d;
  }
  function orderDays(dates, today) {
    const set = new Set(dates);
    const t = new Date(today + "T12:00:00");
    const want = [-1, 0, 1].map((off) => {
      const d = new Date(t); d.setDate(t.getDate() + off); return fmtDate(d);
    });
    const ordered = want.filter((d) => set.has(d));
    dates.forEach((d) => { if (!ordered.includes(d)) ordered.push(d); });
    return ordered;
  }

  function emptyNote(msg) {
    return `<div class="text-center py-20 reveal">
      <span class="material-symbols-outlined text-5xl text-text-muted/40 block mb-4">event_busy</span>
      <p class="font-headline text-sm text-text-muted">${esc(msg)}</p>
    </div>`;
  }

  async function initStatic() {
    els.controlBar.classList.add("hidden");
    const healthWrap = document.querySelector(".flex.items-center.gap-2.pl-3.border-l.border-border-subtle");
    if (healthWrap) healthWrap.style.display = "none";
    els.staticRoot.classList.remove("hidden");

    let daysData = null;
    try { const r = await fetch("data/days.json"); if (r.ok) daysData = await r.json(); } catch (e) {}
    if (!daysData || !(daysData.days || []).length) {
      els.staticRoot.innerHTML = emptyNote("Aún no hay predicciones publicadas.");
      return;
    }
    const dates = daysData.days.map((d) => d.date).filter(Boolean);
    const today = fmtDate(new Date());
    const ordered = orderDays(dates, today);
    const labels = ordered.map((d) => ({ date: d, label: dayLabel(d, today) }));

    els.staticRoot.innerHTML = `
      <header class="mb-6 reveal">
        <div class="flex items-center gap-3 mb-2">
          <span class="material-symbols-outlined text-primary text-2xl">bolt</span>
          <h1 class="font-headline font-bold text-3xl md:text-4xl tracking-tight text-on-surface">Predicciones del Día</h1>
        </div>
        <p class="font-headline text-sm text-text-muted">Publicadas automáticamente · selecciona el día</p>
      </header>
      <div class="flex flex-wrap items-center gap-2 mb-3" id="staticDayTabs"></div>
      <div class="font-mono text-xs text-text-muted mb-6" id="staticDayInfo"></div>
      <div id="staticPanels"></div>
      <div id="staticEmpty" class="hidden"></div>
      <section class="mt-12 reveal" id="staticStats"></section>`;

    const tabs = $("staticDayTabs");
    const defaultDate = ordered.includes(today) ? today : ordered[0];
    labels.forEach((l, i) => {
      const b = document.createElement("button");
      b.className = "chip" + (l.date === defaultDate ? " on" : "");
      b.textContent = l.label;
      b.dataset.date = l.date;
      b.addEventListener("click", () => {
        tabs.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        loadDayAndRender(l.date);
      });
      tabs.appendChild(b);
    });

    loadDayAndRender(defaultDate);

    try {
      const r = await fetch("data/stats.json");
      if (r.ok) renderStatsSection(await r.json());
    } catch (e) {}
  }

  function sportInfo(sports, key) {
    return (sports || []).find((s) => s.key === key) || { name: key, icon: "sports" };
  }

  async function loadDayAndRender(date) {
    let day = null;
    try { const r = await fetch(`data/picks-${date}.json`); if (r.ok) day = await r.json(); } catch (e) {}
    const info = $("staticDayInfo");
    const panels = $("staticPanels");
    const empty = $("staticEmpty");

    if (!day) {
      panels.innerHTML = "";
      empty.innerHTML = emptyNote("No hay datos para esta fecha.");
      empty.classList.remove("hidden");
      if (info) info.textContent = `Fecha ${date}`;
      return;
    }
    const res = day.results || {};
    const sports = day.sports || [];
    const keys = Object.keys(res).filter((k) => {
      const r = res[k] || {};
      return (r.predictions && r.predictions.length) || (r.picks && r.picks.length);
    });

    if (info) {
      info.textContent = `${fmtDateLong(date)} · ${day.sports_total || "0 partidos"} · generado ${(day.generated_at || "").replace("T", " ")}`;
    }

    if (!keys.length) {
      panels.innerHTML = "";
      empty.innerHTML = emptyNote("No hay predicciones para este día.");
      empty.classList.remove("hidden");
      return;
    }
    empty.classList.add("hidden");

    panels.innerHTML = keys.map((k) => {
      const infoSport = sportInfo(sports, k);
      return `
        <div class="static-panel hidden" data-panel="${k}">
          <div class="flex items-center gap-2 mb-5">
            <span class="material-symbols-outlined text-primary">${esc(infoSport.icon)}</span>
            <h2 class="font-headline font-semibold text-xl tracking-tight">${esc(infoSport.name)}</h2>
          </div>
          <div class="mb-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-headline font-semibold text-lg tracking-tight flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">star</span> Top Picks
                <span class="font-mono text-xs text-text-muted font-normal" data-pickcount="${k}"></span>
              </h3>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-picks="${k}"></div>
          </div>
          <div>
            <div class="flex items-center justify-between mb-4">
              <h3 class="font-headline font-semibold text-lg tracking-tight flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">calendar_month</span> Cartelera
                <span class="font-mono text-xs text-text-muted font-normal" data-gamecount="${k}"></span>
              </h3>
            </div>
            <div class="bg-surface-pure rounded-lg border border-border-subtle overflow-hidden" data-games="${k}"></div>
          </div>
        </div>`;
    }).join("");

    keys.forEach((k) => {
      const r = res[k] || {};
      renderPicks(r.picks || [], panels.querySelector(`[data-picks="${k}"]`), panels.querySelector(`[data-pickcount="${k}"]`));
      const n = renderGames(r.predictions || [], panels.querySelector(`[data-games="${k}"]`));
      panels.querySelector(`[data-gamecount="${k}"]`).textContent = n ? `(${n})` : "(sin partidos)";
    });

    // Tabs por deporte (solo los que tienen contenido)
    const sportTabs = document.createElement("div");
    sportTabs.className = "flex flex-wrap gap-2 mb-6";
    keys.forEach((k, i) => {
      const infoSport = sportInfo(sports, k);
      const b = document.createElement("button");
      b.className = "pill" + (i === 0 ? " active" : "");
      b.innerHTML = `<span class="material-symbols-outlined">${esc(infoSport.icon)}</span>${esc(infoSport.name)}`;
      b.addEventListener("click", () => {
        sportTabs.querySelectorAll(".pill").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        panels.querySelectorAll(".static-panel").forEach((p) => p.classList.add("hidden"));
        panels.querySelector(`[data-panel="${k}"]`).classList.remove("hidden");
      });
      sportTabs.appendChild(b);
    });
    panels.insertBefore(sportTabs, panels.firstChild);
    panels.querySelector(".static-panel").classList.remove("hidden");

    // Sub-menú de ligas en fútbol (todas las ligas)
    const fut = res.futbol;
    if (fut && fut.all_leagues && fut.predictions && fut.predictions.length) {
      const codes = [...new Set(fut.predictions.map((g) => g.league_code).filter(Boolean))];
      if (codes.length > 1) {
        const box = panels.querySelector('[data-panel="futbol"]');
        if (box) {
          const bar = document.createElement("div");
          bar.className = "flex flex-wrap items-center gap-2 mb-4";
          bar.innerHTML = `<span class="font-mono text-xs text-text-muted uppercase tracking-wider">Liga:</span>`;
          const mk = (label, code) => {
            const b = document.createElement("button");
            b.className = "chip" + (code === "" ? " on" : "");
            b.textContent = label;
            b.addEventListener("click", () => {
              bar.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
              b.classList.add("on");
              const preds = fut.predictions.filter((g) => !code || g.league_code === code);
              const pks = (fut.picks || []).filter((p) => !code || p.league_code === code);
              renderGames(preds, box.querySelector('[data-games="futbol"]'));
              renderPicks(pks, box.querySelector('[data-picks="futbol"]'), box.querySelector('[data-pickcount="futbol"]'));
              box.querySelector('[data-gamecount="futbol"]').textContent = preds.length ? `(${preds.length})` : "(sin partidos)";
            });
            return b;
          };
          bar.appendChild(mk("Todas", ""));
          codes.forEach((c) => bar.appendChild(mk(c, c)));
          box.insertBefore(bar, box.firstChild);
        }
      }
    }
  }

  function renderStatsSection(s) {
    const root = $("staticStats");
    if (!root) return;
    root.innerHTML = `
      <div class="flex items-center gap-2 mb-4">
        <span class="material-symbols-outlined text-primary text-xl">monitoring</span>
        <h2 class="font-headline font-semibold text-xl tracking-tight">Rendimiento de los picks</h2>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${statCard("Picks resueltos", s.total || 0, "")}
        ${statCard("Aciertos", `${s.hits || 0}`, `tasa ${s.tasa || 0}%`)}
        ${statCard("Unidades", fmtUnits(s.profit), profitClass(s.profit))}
        ${statCard("ROI", (s.roi != null ? s.roi : 0) + "%", profitClass(s.roi))}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-surface-pure border border-border-subtle rounded-lg p-4">
          <h3 class="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">Tasa de acierto por calidad</h3>
          <canvas id="chartTier" height="200"></canvas>
        </div>
        <div class="bg-surface-pure border border-border-subtle rounded-lg p-4">
          <h3 class="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">Tasa por rango de probabilidad</h3>
          <canvas id="chartProb" height="200"></canvas>
        </div>
        <div class="bg-surface-pure border border-border-subtle rounded-lg p-4">
          <h3 class="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">Unidades acumuladas por día</h3>
          <canvas id="chartCum" height="200"></canvas>
        </div>
        <div class="bg-surface-pure border border-border-subtle rounded-lg p-4">
          <h3 class="font-mono text-xs text-text-muted uppercase tracking-wider mb-3">Picks por día (aciertos / errores)</h3>
          <canvas id="chartDaily" height="200"></canvas>
        </div>
      </div>`;
    const EM = "#059669", CR = "#B91C1C", GR = "#6B7280", BK = "#191c1d";
    if (!window.Chart) {
      root.innerHTML += '<p class="font-headline text-sm text-text-muted">Gráficas no disponibles (Chart.js no cargó).</p>';
      return;
    }
    const tier = s.by_tier || [];
    new Chart($("chartTier"), { type: "bar", data: { labels: tier.map((t) => t.tier), datasets: [{ label: "Tasa %", data: tier.map((t) => t.tasa), backgroundColor: EM, borderRadius: 4 }] }, options: chartOpts() });
    const prob = s.by_prob || [];
    new Chart($("chartProb"), { type: "bar", data: { labels: prob.map((p) => p.bucket), datasets: [{ label: "Tasa %", data: prob.map((p) => p.tasa), backgroundColor: GR, borderRadius: 4 }] }, options: chartOpts() });
    const daily = s.daily || [];
    new Chart($("chartCum"), { type: "line", data: { labels: daily.map((d) => d.date.slice(5)), datasets: [{ label: "Unidades", data: daily.map((d) => d.cumulative), borderColor: BK, backgroundColor: "rgba(25,28,29,0.08)", fill: true, tension: 0.3, pointRadius: 3 }] }, options: chartOpts() });
    new Chart($("chartDaily"), {
      type: "bar",
      data: {
        labels: daily.map((d) => d.date.slice(5)),
        datasets: [
          { label: "Aciertos", data: daily.map((d) => d.hits), backgroundColor: EM, borderRadius: 4 },
          { label: "Errores", data: daily.map((d) => d.n - d.hits), backgroundColor: CR, borderRadius: 4 },
        ],
      },
      options: chartOpts(true),
    });
  }
  function statCard(label, value, sub) {
    return `<div class="bg-surface-pure border border-border-subtle rounded-lg p-4">
      <span class="font-mono text-xs text-text-muted uppercase tracking-wider block mb-1">${esc(label)}</span>
      <span class="font-mono text-2xl font-semibold text-on-surface ${sub ? profitClass(sub) : ""}">${esc(value)}</span>
      ${sub ? `<span class="font-mono text-xs block mt-1 ${profitClass(sub)}">${esc(sub)}</span>` : ""}
    </div>`;
  }
  function fmtUnits(v) { return (v > 0 ? "+" : "") + (Math.round(v * 100) / 100); }
  function profitClass(v) { return (v || 0) >= 0 ? "text-emerald" : "text-crimson"; }
  function chartOpts(stacked) {
    return {
      responsive: true,
      plugins: {
        legend: { labels: { font: { family: "JetBrains Mono", size: 10 }, color: "#6B7280" }, display: !!stacked },
        tooltip: { backgroundColor: "#191c1d" },
      },
      scales: {
        x: { ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#6B7280" } },
        y: { beginAtZero: true, stacked: !!stacked, ticks: { font: { family: "JetBrains Mono", size: 10 }, color: "#6B7280" } },
      },
    };
  }

  /* ═══════════ init ═══════════ */

  async function init() {
    // Modo estático: si existe data/days.json renderizamos desde ahí.
    try {
      const resp = await fetch("data/days.json", { method: "GET" });
      if (resp.ok) { initStatic(); return; }
    } catch (e) { /* sin red -> modo en vivo */ }
    initLive();
  }

  document.addEventListener("DOMContentLoaded", init);
})();