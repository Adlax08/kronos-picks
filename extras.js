/* ═══════════════════════════════════════════════════════════════
   Proyecto Kronos · v2 · extras de interfaz (no toca app.js)
   - Buscador global (filtra tarjetas ya renderizadas)
   - CTA del banner
   - Barra inferior móvil: añade "Cartelera"
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  let query = "";
  let countEl = null;
  let debounce = null;

  /* ── Buscador ─────────────────────────────────────────── */
  function matches(el, q) {
    if (!q) return true;
    return norm(el.textContent).includes(q);
  }

  function applyFilter() {
    const q = norm(query);
    const targets = [];
    const picks = $("picksGrid");
    const games = $("gamesList");
    if (picks) targets.push(...picks.querySelectorAll(".pick-card"));
    if (games) targets.push(...games.querySelectorAll(".match-card"));

    let visible = 0;
    targets.forEach((el) => {
      const ok = matches(el, q);
      el.classList.toggle("is-filtered-out", !ok);
      if (ok) visible += 1;
    });

    if (!countEl) countEl = $("searchCount");
    if (countEl) {
      if (!q) countEl.textContent = "";
      else countEl.textContent = `${visible} resultado${visible === 1 ? "" : "s"}`;
    }
  }

  function scheduleFilter() {
    clearTimeout(debounce);
    debounce = setTimeout(applyFilter, 120);
  }

  function setQuery(value) {
    query = value || "";
    const a = $("globalSearch");
    const b = $("globalSearchMobile");
    if (a && a.value !== query) a.value = query;
    if (b && b.value !== query) b.value = query;
    scheduleFilter();
  }

  function wireSearch() {
    ["globalSearch", "globalSearchMobile"].forEach((id) => {
      const input = $(id);
      if (!input) return;
      input.addEventListener("input", (e) => setQuery(e.target.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          setQuery("");
          input.blur();
        }
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const input = $("globalSearch") || $("globalSearchMobile");
      if (!input) return;
      e.preventDefault();
      input.focus();
    });
  }

  function observeRenders() {
    ["picksGrid", "gamesList"].forEach((id) => {
      const el = $(id);
      if (!el || !window.MutationObserver) return;
      const mo = new MutationObserver(() => { if (query) scheduleFilter(); });
      mo.observe(el, { childList: true });
    });

    // Al cambiar de deporte/día/liga, re-aplicar el filtro vigente.
    ["sportPills", "leagueSelect", "dateInput"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("click", scheduleFilter);
      el.addEventListener("change", scheduleFilter);
    });
  }

  /* ── Banner ───────────────────────────────────────────── */
  function wireHero() {
    const cta = $("heroCta");
    if (!cta) return;
    cta.addEventListener("click", () => {
      const grid = $("picksGrid");
      const target = grid && grid.children.length ? grid : $("controlBar");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  /* ── Navegación inferior ──────────────────────────────── */
  function enhanceBottomNav() {
    const nav = $("bottomNav");
    if (!nav || nav.dataset.enhanced) return;
    nav.dataset.enhanced = "1";
    if (nav.querySelector('[data-act="cartelera"]')) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.act = "cartelera";
    btn.innerHTML =
      '<span class="material-symbols-outlined">stadium</span><span>Cartelera</span>';
    btn.addEventListener("click", () => {
      const sec = $("carteleraSection");
      if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const registro = nav.querySelector('[data-act="registro"]');
    if (registro) nav.insertBefore(btn, registro);
    else nav.appendChild(btn);
  }

  function watchBottomNav() {
    if ($("bottomNav")) { enhanceBottomNav(); return; }
    if (!window.MutationObserver) return;
    const mo = new MutationObserver(() => {
      if ($("bottomNav")) { enhanceBottomNav(); mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true });
  }

  /* ── Arranque ─────────────────────────────────────────── */
  function init() {
    wireSearch();
    wireHero();
    observeRenders();
    watchBottomNav();
    applyFilter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
