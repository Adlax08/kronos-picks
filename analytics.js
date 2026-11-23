/* Kronos · Google Analytics 4 (gtag.js)
 * -----------------------------------------------------------------------------
 * Un solo archivo para las dos webs publicadas. El ID de medicion NO va aqui:
 * cada index.html lo declara en el atributo data-ga de la etiqueta <script>.
 *
 *   v2 oscura  -> https://adlax08.github.io/kronos-picks/      G-EQKTSJ2WYD
 *   v1 blanca  -> https://adlax08.github.io/kronos-picks-web/  G-V1ZQNRPE72
 *
 * Lo copian publish.py (a public/) y publish2.py (a public2/), asi que para
 * cambiar un ID basta editar el index.html correspondiente y republicar.
 *
 * Reglas de seguridad (para no ensuciar las estadisticas):
 *   - En local (localhost / 127.0.0.1 / file://) no se envia nada.
 *   - Si el ID falta o no tiene formato G-XXXXXXX no se envia nada.
 * -----------------------------------------------------------------------------
 */
(function () {
  "use strict";

  // Respaldos, por si el HTML no trae el atributo data-ga.
  var ID_OSCURA = "G-EQKTSJ2WYD"; // v2 oscura (kronos-picks)
  var ID_BLANCA = "G-V1ZQNRPE72"; // v1 blanca (kronos-picks-web)

  function idDelSitio() {
    var etiqueta = document.querySelector("script[data-ga]");
    var declarado = etiqueta ? (etiqueta.getAttribute("data-ga") || "").trim() : "";
    if (declarado) return declarado;
    // Respaldo: deducir por la ruta en GitHub Pages.
    return /kronos-picks-web/.test(location.pathname) ? ID_BLANCA : ID_OSCURA;
  }

  var GA_ID = idDelSitio();

  var host = location.hostname || "";
  var esLocal =
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    location.protocol === "file:";
  var idValido = /^G-[A-Z0-9]{6,}$/.test(GA_ID);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  if (typeof window.gtag !== "function") {
    window.gtag = gtag;
  }

  /* Medir una accion concreta desde app.js / extras.js:
   *   window.gaEvent("ver_pick", { deporte: "nba" });
   * Nunca lanza: si Analytics no esta activo simplemente no hace nada.
   */
  window.gaEvent = function (nombre, params) {
    if (esLocal || !idValido) return;
    if (typeof nombre !== "string" || !nombre) return;
    try {
      window.gtag("event", nombre, params || {});
    } catch (e) {
      /* ignorado a proposito */
    }
  };

  if (esLocal || !idValido) {
    console.info(
      "[Kronos] Google Analytics desactivado (" +
        (esLocal ? "entorno local" : "falta el ID de medicion") +
        ")."
    );
    return;
  }

  var s = document.createElement("script");
  s.async = true;
  s.src =
    "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
  document.head.appendChild(s);

  window.gtag("js", new Date());
  window.gtag("config", GA_ID, {
    // Solo analitica agregada: sin senales publicitarias ni remarketing.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
})();
