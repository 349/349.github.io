/* =============================================================================
   Divine Office — client-side engine (1962 Roman Breviary, Gallican psalter).
   Consumes: window.PSALTER (from data/psalter.json), window.ORDINARY
   (data/office_ordinary.json), window.SCHEME (data/ferial_psalter.json).
   Computes the liturgical day and assembles the Hours dynamically.
   ============================================================================ */
(function () {
  "use strict";

  var PS = {};
  (window.PSALTER || []).forEach(function (p) { PS[p.n] = p.verses; });
  var ORD = window.ORDINARY || {};
  var SCHEME = window.SCHEME || {};

  /* ---------- calendar ---------- */
  function dateOnly(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function fmtISO(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  // Gregorian Easter (Meeus/Butcher).
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100,
        d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
        g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
        i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7,
        m = Math.floor((a + 11 * h + 22 * l) / 451),
        mo = Math.floor((h + l - 7 * m + 114) / 31),
        da = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mo - 1, da);
  }
  // Advent Sunday of civil year y (4th Sunday before Christmas).
  function adventSunday(y) {
    var x = new Date(y, 11, 25), dow = x.getDay(), toPrevSun = dow === 0 ? 7 : dow;
    return addDays(addDays(x, -toPrevSun), -21);
  }

  var WD_LAT = ["Dominica", "Feria II", "Feria III", "Feria IV", "Feria V", "Feria VI", "Sabbato"];
  var WD_EN  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var WD_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function liturgical(d) {
    d = dateOnly(d);
    var Y = d.getFullYear();
    var adv = adventSunday(Y), advPrev = adventSunday(Y - 1);
    var xmasYear, E;
    if (d >= adv) { xmasYear = Y; E = easter(Y + 1); }
    else { xmasYear = Y - 1; E = easter(Y); }
    var advStart = d >= adv ? adv : advPrev;
    var christmas = new Date(xmasYear, 11, 25);
    var epiphany = new Date(xmasYear + 1, 0, 6);
    var septua = addDays(E, -63), ash = addDays(E, -46), passion = addDays(E, -14), pent = addDays(E, 49);

    var season, seasonEn, color;
    if (d >= advStart && d < christmas) { season = "Adventus"; seasonEn = "Advent"; color = "violet"; }
    else if (d >= christmas && d < epiphany) { season = "Tempus Nativitatis"; seasonEn = "Christmastide"; color = "white"; }
    else if (d >= epiphany && d < septua) { season = "Post Epiphaniam"; seasonEn = "Time after Epiphany"; color = "green"; }
    else if (d >= septua && d < ash) { season = "Septuagesima"; seasonEn = "Septuagesima"; color = "violet"; }
    else if (d >= ash && d < passion) { season = "Quadragesima"; seasonEn = "Lent"; color = "violet"; }
    else if (d >= passion && d < E) { season = "Tempus Passionis"; seasonEn = "Passiontide"; color = "violet"; }
    else if (d >= E && d < pent) { season = "Tempus Paschale"; seasonEn = "Eastertide"; color = "white"; }
    else { season = "Post Pentecosten"; seasonEn = "Time after Pentecost"; color = "green"; }

    var paschal = d >= E && d < pent;

    // Seasonal Marian antiphon at Compline (approximate boundaries).
    var feb2 = new Date(xmasYear + 1, 1, 2);
    var marian;
    if (paschal) marian = "regina_caeli";
    else if (d >= advStart && d <= feb2) marian = "alma";
    else if (d > feb2 && d < E) marian = "ave_regina";
    else marian = "salve";

    var dow = d.getDay();
    return {
      date: d, iso: fmtISO(d),
      englishDate: WD_EN[dow] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(),
      weekdayIndex: dow, weekdayLat: WD_LAT[dow], weekdayEn: WD_EN[dow], weekdayKey: WD_KEY[dow],
      season: season, seasonEn: seasonEn, color: color, paschal: paschal, marian: marian,
      isSunday: dow === 0
    };
  }

  /* ---------- rendering helpers ---------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function renderPsalm(num, antiphonHtml, gloria) {
    var verses = PS[num];
    var wrap = el("div", "off-psalm");
    var head = el("p", "off-psalm__title", "Psalmus " + num +
      ' <a class="off-psalm__link" href="' + (window.PSALTER_BASE || "/psalmi/") + num + '/">full &rsaquo;</a>');
    wrap.appendChild(head);
    if (antiphonHtml) wrap.appendChild(el("p", "off-ant", "Ant. " + antiphonHtml));
    if (!verses) { wrap.appendChild(el("p", "muted", "(psalm text not loaded)")); return wrap; }
    var body = el("div", "off-verses");
    // Long psalms (esp. 118, prayed in portions) show an incipit + link, not all verses.
    var shown = verses.length > 30 ? verses.slice(0, 3) : verses;
    shown.forEach(function (v, i) {
      body.appendChild(el("p", "psalm-verse",
        '<span class="v-num">' + (i + 1) + '</span><span class="v-text">' + esc(v) + "</span>"));
    });
    if (verses.length > 30) {
      body.appendChild(el("p", "psalm-verse",
        '<span class="v-num"></span><span class="v-text muted">… (' + verses.length +
        ' verses; prayed here in portions) — <a href="' + (window.PSALTER_BASE || "/psalmi/") + num + '/">full psalm ›</a></span>'));
      gloria = false;
    }
    if (gloria !== false) {
      body.appendChild(el("p", "psalm-verse off-gloria",
        '<span class="v-num"></span><span class="v-text">Gloria Patri, et Filio, et Spiritui Sancto. * Sicut erat in principio, et nunc, et semper, et in saecula saeculorum. Amen.</span>'));
    }
    wrap.appendChild(body);
    return wrap;
  }

  function block(label, html) {
    var b = el("div", "off-block");
    if (label) b.appendChild(el("p", "off-label", label));
    if (html) b.appendChild(el("div", "off-text", html));
    return b;
  }

  /* ---------- Compline (fully assembled) ---------- */
  function buildCompline(li) {
    var c = ORD.compline || {};
    var view = el("div", "office-hour");
    view.appendChild(el("h2", "office-hour__title", "Completorium <span class='muted'>· Compline</span>"));

    if (c.opening) view.appendChild(block(null, c.opening));
    if (c.examen) view.appendChild(block("Confession", c.examen));
    view.appendChild(block(null,
      "V. Converte nos, Deus, salutaris noster.<br>R. Et averte iram tuam a nobis.<br>" +
      "V. Deus, in adiutorium meum intende.<br>R. Domine, ad adiuvandum me festina.<br>" +
      "Gloria Patri&hellip; " + (li.paschal ? "Alleluia." : "")));

    // Psalms under one antiphon
    var ant = li.paschal ? "Alleluia, alleluia, alleluia." : (c.antiphon || "Miserere mihi, Domine, et exaudi orationem meam.");
    var psSection = el("div", "off-psalms");
    psSection.appendChild(el("p", "off-ant", "Ant. " + ant));
    // Compline psalms follow the weekly cycle (Pius X), not a fixed set.
    var psalms = (SCHEME.completorium && SCHEME.completorium[li.weekdayKey]) || [4, 90, 133];
    psalms.forEach(function (n) { psSection.appendChild(renderPsalm(n, null, true)); });
    psSection.appendChild(el("p", "off-ant", "Ant. " + ant));
    view.appendChild(psSection);

    if (c.hymn) view.appendChild(block("Hymnus — Te lucis ante terminum", '<div class="off-hymn">' + c.hymn + "</div>"));
    if (c.chapter) view.appendChild(block("Capitulum (Ier. 14, 9)", c.chapter + "<br>R. Deo gratias."));
    if (c.responsory) view.appendChild(block("Responsorium breve", c.responsory));

    // Nunc dimittis
    if (c.nunc_dimittis) {
      var nd = el("div", "off-canticle");
      nd.appendChild(el("p", "off-ant", "Ant. " + (li.paschal ? (c.nunc_ant + " Alleluia.") : c.nunc_ant)));
      var body = el("div", "off-verses");
      c.nunc_dimittis.forEach(function (v) {
        body.appendChild(el("p", "psalm-verse", '<span class="v-num"></span><span class="v-text">' + esc(v) + "</span>"));
      });
      nd.appendChild(body);
      nd.appendChild(el("p", "off-ant", "Ant. " + (li.paschal ? (c.nunc_ant + " Alleluia.") : c.nunc_ant)));
      view.appendChild(block("Canticum Simeonis — Nunc dimittis (Luc. 2)", ""));
      view.appendChild(nd);
    }

    if (c.collect) view.appendChild(block("Oratio", c.collect));
    if (c.blessing) view.appendChild(block(null, c.blessing));

    // Seasonal Marian antiphon
    var m = (ORD.marian || {})[li.marian];
    if (m) view.appendChild(block("Antiphona finalis B. Mariae Virginis — " + m.title,
      '<div class="off-hymn">' + m.text + "</div>"));

    return view;
  }

  /* ---------- generic Hour (from ferial scheme, lights up as data is filled) ---------- */
  function buildGenericHour(hourKey, li) {
    var meta = HOURS[hourKey];
    var view = el("div", "office-hour");
    view.appendChild(el("h2", "office-hour__title", meta.lat + " <span class='muted'>· " + meta.en + "</span>"));
    var scheme = SCHEME[hourKey];
    var psalms = scheme ? (scheme[li.weekdayKey] || scheme.all) : null;
    if (psalms && psalms.length) {
      view.appendChild(block(null,
        "V. Deus, in adiutorium meum intende.<br>R. Domine, ad adiuvandum me festina.<br>Gloria Patri&hellip; " +
        (li.paschal ? "Alleluia." : "")));
      var sec = el("div", "off-psalms");
      psalms.forEach(function (n) { sec.appendChild(renderPsalm(parseInt(n, 10), null, true)); });
      view.appendChild(sec);
      view.appendChild(el("p", "office-todo",
        "Psalms shown are the ferial distribution for " + li.weekdayLat + " from the Breviarium Romanum (1960). " +
        "The proper antiphons, chapter, hymn, and collect for this Hour are being wired in next; Compline is complete."));
    } else {
      view.appendChild(el("p", "office-todo",
        "No psalter data yet for " + meta.en + " on " + li.weekdayLat + "."));
    }
    return view;
  }

  var HOURS = {
    matutinum: { lat: "Matutinum", en: "Matins" },
    laudes:    { lat: "Laudes", en: "Lauds" },
    prima:     { lat: "Prima", en: "Prime" },
    tertia:    { lat: "Tertia", en: "Terce" },
    sexta:     { lat: "Sexta", en: "Sext" },
    nona:      { lat: "Nona", en: "None" },
    vesperae:  { lat: "Vesperae", en: "Vespers" },
    completorium: { lat: "Completorium", en: "Compline" }
  };
  var HOUR_ORDER = ["matutinum", "laudes", "prima", "tertia", "sexta", "nona", "vesperae", "completorium"];

  /* ---------- app ---------- */
  function init() {
    var root = document.getElementById("office-app");
    if (!root) return;
    var dateEl = document.getElementById("office-date");
    var navEl = document.getElementById("office-hours");
    var viewEl = document.getElementById("office-view");

    var current = new Date();
    // allow ?date=YYYY-MM-DD override
    var m = location.search.match(/date=(\d{4})-(\d{2})-(\d{2})/);
    if (m) current = new Date(+m[1], +m[2] - 1, +m[3]);

    var li = liturgical(current);
    var activeHour = "completorium";

    dateEl.innerHTML =
      '<div class="office-date__pill office-color--' + li.color + '">' + li.color + '</div>' +
      '<div><div class="office-date__lat">' + li.weekdayLat + " &middot; " + li.season + "</div>" +
      '<div class="office-date__en">' + li.englishDate + " &mdash; " + li.seasonEn +
      (li.paschal ? " (Paschaltide)" : "") + "</div></div>";

    // hour nav
    navEl.innerHTML = "";
    HOUR_ORDER.forEach(function (k) {
      var a = el("button", "office-hour-btn" + (k === activeHour ? " is-active" : ""), HOURS[k].en);
      a.setAttribute("data-hour", k);
      var hasPs = k === "completorium" || (SCHEME[k] && SCHEME[k][li.weekdayKey] && SCHEME[k][li.weekdayKey].length);
      if (hasPs) a.className += " is-ready";
      a.onclick = function () {
        activeHour = k;
        Array.prototype.forEach.call(navEl.children, function (c) { c.classList.remove("is-active"); });
        a.classList.add("is-active");
        renderHour();
      };
      navEl.appendChild(a);
    });

    function renderHour() {
      viewEl.innerHTML = "";
      viewEl.appendChild(activeHour === "completorium" ? buildCompline(li) : buildGenericHour(activeHour, li));
      viewEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    renderHour();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
