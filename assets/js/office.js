/* =============================================================================
   Divine Office — client-side engine (1962 Roman Breviary, Gallican psalter).
   Consumes: window.PSALTER (from data/psalter.json), window.ORDINARY
   (data/office_ordinary.json), window.SCHEME (data/ferial_psalter.json).
   Computes the liturgical day and assembles the Hours dynamically.
   ============================================================================ */
(function () {
  "use strict";

  // Immediate proof-of-execution: if this inline script runs at all, the
  // "Loading…" fallback becomes "Office script running…" right away.
  try {
    var _mk = document.getElementById("office-view");
    if (_mk) _mk.innerHTML = '<p class="muted">Office script running…</p>';
  } catch (_e) {}

  // Catch-all: surface any uncaught error on the page so it's diagnosable.
  window.onerror = function (msg, src, line) {
    var a = document.getElementById("office-view") || document.getElementById("office-app");
    if (a) a.innerHTML = '<p class="office-todo">Office JS error: ' + msg + ' (line ' + line + ')</p>';
    return false;
  };

  // Hugo may serialize the psalter data file as either an array or an
  // index-keyed object; accept both.
  // Hugo/jsonify serializes some arrays as index-keyed objects ({"0":..,"1":..}).
  // Recursively convert those back into real arrays so array methods work everywhere.
  function dearray(x) {
    if (Array.isArray(x)) return x.map(dearray);
    if (x && typeof x === "object") {
      var keys = Object.keys(x);
      var seq = keys.length > 0 && keys.every(function (k, i) { return k === String(i); });
      if (seq) return keys.map(function (k) { return dearray(x[k]); });
      var o = {}; keys.forEach(function (k) { o[k] = dearray(x[k]); }); return o;
    }
    return x;
  }
  // Coerce any value to a real array (belt-and-suspenders at every array site).
  function A(x) { return Array.isArray(x) ? x : (x && typeof x === "object" ? Object.keys(x).map(function (k) { return x[k]; }) : []); }

  // Sanitize the psalm-link base (same double-quote hazard as DATA_BASE).
  window.PSALTER_BASE = String(window.PSALTER_BASE || "/psalmi/").replace(/["'\s]/g, "") || "/psalmi/";

  // The Office data (psalter text, pointing, ordinary, ferial scheme) is fetched
  // as separate JSON files rather than inlined. Inlining ~420 KB of JSON into the
  // page was fragile; fetch + JSON.parse handles the large payloads cleanly.
  var PSALTER = [], PT = {}, ORD = {}, SCHEME = {}, PS = {}, VESP = {}, LAUD = {}, CANT = {}, LITTLE = {}, SANCT = {}, TEMPORAL = {}, HYMNS = {}, SUNDAY_G = {}, SANCT_O = {}, SANCT_G = {}, COMMONS = {}, CHANT_IDX = {}, FESTAL = {}, LITTLEHR = {}, PRECES = {}, FIRSTVESP = {}, COMM = {}, MARIANC = {}, HYMNC = {}, RESPC = {}, MOVPROP = {};
  // Ferial psalm-antiphon data per Hour (each: weekday → [{n|cant, d?, a}]).
  var FERIAL = {};
  function buildData(d) {
    d = d || {};
    PSALTER = A(dearray(d.PSALTER != null ? d.PSALTER : window.PSALTER));
    PT = dearray(d.POINTED != null ? d.POINTED : window.POINTED) || {};
    ORD = dearray(d.ORDINARY != null ? d.ORDINARY : window.ORDINARY) || {};
    SCHEME = dearray(d.SCHEME != null ? d.SCHEME : window.SCHEME) || {};
    VESP = dearray(d.VESPERS != null ? d.VESPERS : window.VESPERS) || {};
    LAUD = dearray(d.LAUDS != null ? d.LAUDS : window.LAUDS) || {};
    CANT = dearray(d.CANTICLES != null ? d.CANTICLES : window.CANTICLES) || {};
    LITTLE = dearray(d.HOURS != null ? d.HOURS : window.HOURS_ANT) || {};
    SANCT = dearray(d.SANCTORAL != null ? d.SANCTORAL : window.SANCTORAL) || {};
    TEMPORAL = dearray(d.TEMPORAL != null ? d.TEMPORAL : window.TEMPORAL) || {};
    HYMNS = dearray(d.HYMNS != null ? d.HYMNS : window.HYMNS) || {};
    SUNDAY_G = dearray(d.SUNDAYGOSPEL != null ? d.SUNDAYGOSPEL : window.SUNDAYGOSPEL) || {};
    SANCT_O = dearray(d.SANCTCOLLECTS != null ? d.SANCTCOLLECTS : window.SANCTCOLLECTS) || {};
    SANCT_G = dearray(d.SANCTGOSPEL != null ? d.SANCTGOSPEL : window.SANCTGOSPEL) || {};
    COMMONS = dearray(d.COMMONS != null ? d.COMMONS : window.COMMONS) || {};
    CHANT_IDX = dearray(d.CHANT != null ? d.CHANT : window.CHANT) || {};
    FESTAL = dearray(d.FESTAL != null ? d.FESTAL : window.FESTAL) || {};
    LITTLEHR = dearray(d.LITTLEHR != null ? d.LITTLEHR : window.LITTLEHR) || {};
    PRECES = dearray(d.PRECES != null ? d.PRECES : window.PRECES) || {};
    FIRSTVESP = dearray(d.FIRSTVESP != null ? d.FIRSTVESP : window.FIRSTVESP) || {};
    COMM = dearray(d.COMM != null ? d.COMM : window.COMM) || {};
    MARIANC = dearray(d.MARIANC != null ? d.MARIANC : window.MARIANC) || {};
    HYMNC = dearray(d.HYMNC != null ? d.HYMNC : window.HYMNC) || {};
    RESPC = dearray(d.RESPC != null ? d.RESPC : window.RESPC) || {};
    MOVPROP = dearray(d.MOVPROP != null ? d.MOVPROP : window.MOVPROP) || {};
    FERIAL = { vesperae: VESP, laudes: LAUD };
    PS = {};
    PSALTER.forEach(function (p) { if (p && p.n != null) PS[p.n] = p.verses; });
  }
  var DIAG = [];
  function loadData(cb) {
    var base = String(window.DATA_BASE || "/data/").replace(/["'\s]/g, "");
    if (!base) base = "/data/";
    // Force a same-origin, root-relative path so an absolute (possibly http://)
    // base can't trigger a mixed-content block on the https page.
    try { base = new URL(base, location.href).pathname; } catch (e) {}
    if (base.charAt(base.length - 1) !== "/") base += "/";
    var names = { PSALTER: "psalter.json", POINTED: "psalter_pointed.json", ORDINARY: "office_ordinary.json", SCHEME: "ferial_psalter.json", VESPERS: "ferial_vespers.json", LAUDS: "ferial_lauds.json", CANTICLES: "canticles.json", HOURS: "ferial_hours.json", SANCTORAL: "sanctoral.json", TEMPORAL: "temporal.json", HYMNS: "ferial_hymns.json", SUNDAYGOSPEL: "sunday_gospel.json", SANCTCOLLECTS: "sanctoral_collects.json", SANCTGOSPEL: "sanctoral_gospel.json", COMMONS: "commons.json", CHANT: "chant.json", FESTAL: "festal_psalms.json", LITTLEHR: "little_hours.json", PRECES: "preces.json", FIRSTVESP: "first_vespers.json", COMM: "commemorations.json", MARIANC: "marian_chant.json", HYMNC: "hymn_chant.json", RESPC: "resp_chant.json", MOVPROP: "movable_propers.json" };
    var keys = Object.keys(names), left = keys.length, out = {};
    if (!window.fetch) { DIAG.push("no window.fetch"); cb(out); return; }
    keys.forEach(function (k) {
      var url = base + names[k];
      fetch(url)
        .then(function (r) {
          DIAG.push(k + ": HTTP " + r.status + " (" + url + ")");
          return r.ok ? r.json() : null;
        })
        .then(function (j) { out[k] = j; }, function (err) {
          DIAG.push(k + ": FAILED " + (err && err.message ? err.message : err) + " (" + url + ")");
          out[k] = null;
        })
        .then(function () { if (--left === 0) cb(out); });
    });
  }

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

    // Count the Sunday/week within the season (e.g. "Dominica VI post Pentecosten").
    var dow = d.getDay();
    var curSun = addDays(d, -dow);                 // Sunday that begins this week
    function wk(a) { return Math.round((curSun - a) / 6048e5); }
    function roman(n) {
      if (n <= 0) return "";
      var t = [["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]], s = "";
      t.forEach(function (p) { while (n >= p[1]) { s += p[0]; n -= p[1]; } });
      return s;
    }
    var week = 0, weekPhrase = "";
    if (season === "Adventus") { week = wk(advStart) + 1; weekPhrase = "Adventus"; }
    else if (season === "Post Epiphaniam") { week = wk(addDays(epiphany, ((7 - epiphany.getDay()) % 7) || 7)) + 1; weekPhrase = "post Epiphaniam"; }
    else if (season === "Septuagesima") { week = wk(septua) + 1; weekPhrase = "Septuagesimae"; }
    else if (season === "Quadragesima") { week = wk(addDays(ash, 4)) + 1; weekPhrase = "Quadragesimae"; }
    else if (season === "Tempus Passionis") { week = wk(passion) + 1; weekPhrase = "Passionis"; }
    else if (season === "Tempus Paschale") { week = wk(E); weekPhrase = "post Pascha"; }
    else if (season === "Post Pentecosten") { week = wk(pent); weekPhrase = "post Pentecosten"; }
    var wr = roman(week);
    var title = dow === 0
      ? "Dominica" + (wr ? " " + wr : "") + (weekPhrase ? " " + weekPhrase : (season ? " · " + season : ""))
      : WD_LAT[dow] + " · " + (wr ? "hebd. " + wr + " " + weekPhrase : season);

    // Principal movable feasts (computed from Easter). The fixed sanctoral (feasts
    // on set calendar dates) is a separate data layer, ingested next.
    var octLast = new Date(d.getFullYear(), 9, 31);
    var christKing = addDays(octLast, -octLast.getDay());
    // Holy Name of Jesus: the Sunday falling 2–5 Jan; if none, 2 Jan.
    var yy = d.getFullYear(), holyName = null;
    for (var hn = 2; hn <= 5; hn++) { var hnd = new Date(yy, 0, hn); if (hnd.getDay() === 0) { holyName = hnd; break; } }
    if (!holyName) holyName = new Date(yy, 0, 2);
    // Holy Family: the Sunday within the octave of the Epiphany (first Sunday after 6 Jan).
    var epiph6 = new Date(yy, 0, 6);
    var holyFamily = addDays(epiph6, ((7 - epiph6.getDay()) % 7) || 7);
    var movable = [
      [addDays(E, -7), "Dominica in Palmis", "Palm Sunday", "violet"],
      [addDays(E, -3), "Feria V in Cena Dómini", "Maundy Thursday", "white"],
      [addDays(E, -2), "Feria VI in Passióne Dómini", "Good Friday", "black"],
      [addDays(E, -1), "Sábbato Sancto", "Holy Saturday", "violet"],
      [E, "Dominica Resurrectiónis", "Easter Sunday", "white"],
      [addDays(E, 39), "Ascénsio Dómini", "Ascension", "white"],
      [pent, "Dominica Pentecóstes", "Pentecost", "red"],
      [addDays(E, 56), "Sanctíssima Trínitas", "Trinity Sunday", "white", "trinity"],
      [addDays(E, 60), "Corpus Christi", "Corpus Christi", "white", "corpus"],
      [addDays(E, 68), "Sacratíssimum Cor Iesu", "Sacred Heart", "white", "sacredheart"],
      [christKing, "D. N. Iesu Christi Regis", "Christ the King", "white", "christking"],
      [holyName, "Ss.mi Nóminis Iesu", "Holy Name of Jesus", "white", "holyname", 2],
      [holyFamily, "S. Famíliæ Iesu, Maríæ, Ioseph", "Holy Family", "white", "holyfamily", 2]
    ];
    var feast = null, feastEn = null, feastRank = null;
    // Fixed sanctoral (simplified precedence: I class always takes the day; II class
    // yields to a Sunday, on which it would be commemorated).
    var mmdd = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var s = SANCT[mmdd];
    var feastCollect = null;
    var feastKey = null;
    var feastCommon = null;
    // I class always takes the day; II and III class yield to a Sunday (on which they
    // would be commemorated) but take an ordinary weekday.
    if (s && s.n && (s.r === 1 || ((s.r === 2 || s.r === 3) && dow !== 0))) { feast = s.n; feastRank = s.r; color = s.c || color; feastCollect = (SANCT_O && SANCT_O[mmdd]) || null; feastKey = mmdd; feastCommon = s.co || null; }
    // Principal movable feasts override the fixed sanctoral.
    for (var fi = 0; fi < movable.length; fi++) {
      if (movable[fi][0].getTime() === d.getTime()) {
        feast = movable[fi][1]; feastEn = movable[fi][2]; color = movable[fi][3]; feastRank = movable[fi][5] || 1;
        var mvk = movable[fi][4];
        if (mvk && MOVPROP[mvk]) { feastKey = mvk; feastCollect = MOVPROP[mvk].o || null; }
        break;
      }
    }
    if (feast) { title = feast; wr = ""; }

    // Per-day collect key: on a feria the collect is that of the preceding Sunday.
    // Post-Pentecost is complete (I-XXIV); weeks past 24 (resumed Sundays) clamp to XXIV.
    // Seasons whose ferias take the preceding Sunday's collect. Lent/Passiontide are
    // omitted — their ferias have daily proper collects (a separate layer, to come).
    var collectKey = null;
    if (season === "Post Pentecosten" && week >= 1) collectKey = "pent-" + Math.min(week, 24);
    else if (season === "Adventus" && week >= 1) collectKey = "adv-" + Math.min(week, 4);
    else if (season === "Post Epiphaniam" && week >= 1) collectKey = "epi-" + Math.min(week, 6);
    else if (season === "Septuagesima" && week >= 1) collectKey = "quadp-" + Math.min(week, 3);
    else if (season === "Tempus Paschale" && week >= 1) collectKey = "pasc-" + Math.min(week, 6);
    // Lent/Passiontide ferias have their own proper daily collect (week + weekday).
    else if (season === "Quadragesima") collectKey = "lent-" + week + "-" + dow;
    else if (season === "Tempus Passionis") collectKey = "pass-" + week + "-" + dow;
    else if (season === "Tempus Nativitatis") collectKey = "nat-" + (dow === 0 ? "sun" : "fer");

    // Per-Sunday key for the proper gospel-canticle antiphons (Sundays only).
    var sundayKey = null;
    if (dow === 0 && week >= 1) {
      if (season === "Post Pentecosten") sundayKey = "pent-" + Math.min(week, 24);
      else if (season === "Adventus") sundayKey = "adv-" + Math.min(week, 4);
      else if (season === "Post Epiphaniam") sundayKey = "epi-" + Math.min(week, 6);
      else if (season === "Septuagesima") sundayKey = "quadp-" + Math.min(week, 3);
      else if (season === "Tempus Paschale") sundayKey = "pasc-" + Math.min(week, 6);
      else if (season === "Quadragesima") sundayKey = "quad-" + Math.min(week, 4);
      else if (season === "Tempus Passionis") sundayKey = "pass-" + Math.min(week, 2);
    }

    return {
      collectKey: collectKey, sundayKey: sundayKey, feastCollect: feastCollect, feastKey: feastKey, feastCommon: feastCommon,
      feast: feast, feastEn: feastEn, feastRank: feastRank,
      date: d, iso: fmtISO(d),
      englishDate: WD_EN[dow] + ", " + MONTHS[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear(),
      weekdayIndex: dow, weekdayLat: WD_LAT[dow], weekdayEn: WD_EN[dow], weekdayKey: WD_KEY[dow],
      season: season, seasonEn: seasonEn, color: color, paschal: paschal, marian: marian,
      title: title, week: week, weekRoman: wr,
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

  // Rubrication: set directions, citations, and the versicle/response markers in
  // red — the traditional way of distinguishing what is *done/indicated* from the
  // words actually said or sung. Input is trusted HTML from our own data files.
  function rubricate(html) {
    if (html == null) return "";
    var s = String(html);
    // Sign-of-the-cross glyph.
    s = s.replace(/✠/g, '<span class="off-cross" aria-hidden="true">✠</span>');
    // Parenthetical directions/citations and rubric lead-words.
    s = s.replace(/\(([^)]*)\)/g, '<span class="rub">($1)</span>');
    s = s.replace(/\b(Benedictio|Absolutio|Oremus|Lectio brevis)\b/g, '<span class="rub">$1</span>');
    // Mediant/repetenda asterisk in gold, glued to the preceding word so it never wraps alone.
    s = s.replace(/\s\*(?=\s|<|$)/g, '&nbsp;<span class="off-med">*</span>');
    // Give every versicle/response its own line for readability.
    s = s.replace(/([^>\n])\s+(?=[VR]\.\s)/g, "$1<br>");
    // Line by line: style ℣/℟; bold what all say together — a response that answers
    // a versicle, or that repeats the previous response (the responsory repetendum).
    // The opening intonation, said once by the cantor alone, stays unbolded.
    var out = [], prevV = false, prevR = null;
    s.split(/<br>/).forEach(function (ln) {
      if (/^\s*V\.\s/.test(ln)) {
        ln = ln.replace(/^(\s*)V\.\s/, '$1<span class="rub-vr">℣</span> ');
        prevV = true; prevR = null;
      } else if (/^\s*R\.\s/.test(ln)) {
        var rawR = ln.replace(/^\s*R\.\s*/, "").replace(/<[^>]*>/g, "")
                     .replace(/&nbsp;|&hellip;/g, " ").replace(/\s+/g, " ").trim();
        var bold = prevV || (prevR !== null && rawR === prevR);
        ln = ln.replace(/^(\s*)R\.\s/, '$1<span class="rub-vr">℟</span> ');
        if (bold) ln = ln.replace(/(<span class="rub-vr">℟<\/span>\s*)([\s\S]+)$/, '$1<strong class="off-resp">$2</strong>');
        prevV = false; prevR = rawR;
      } else {
        ln = ln.replace(/\bV\.(?=\s|<|$)/g, '<span class="rub-vr">℣</span>')
               .replace(/\bR\.(?=\s|<|$)/g, '<span class="rub-vr">℟</span>');
        if (ln.replace(/<[^>]*>/g, "").trim()) { prevV = false; prevR = null; }
      }
      out.push(ln);
    });
    return out.join("<br>");
  }

  // Priest vs. non-priest recitation. When a priest (or deacon) presides,
  // "Dominus vobiscum / Et cum spiritu tuo" is used; laypeople and private
  // recitation substitute "Domine, exaudi orationem meam / Et clamor meus...".
  var ROLE = "lay";   // default: no ordained minister presiding
  var SUNG = true;    // default: sung (chant notation) vs said (pointed text)
  // Choose the Hour whose traditional time of day is closest to now.
  function currentHourKey(d) {
    var h = d.getHours();
    if (h < 4) return "matutinum";
    if (h < 7) return "laudes";
    if (h < 9) return "prima";
    if (h < 11) return "tertia";
    if (h < 14) return "sexta";
    if (h < 16) return "nona";
    if (h < 20) return "vesperae";
    return "completorium";
  }
  var CHANT_W = 660;  // available px width for chant flow (set from the view width)
  function roleize(html) {
    if (ROLE !== "lay") return html;
    return String(html)
      .replace(/V\.\s*Dominus vobiscum\.\s*R\.\s*Et cum spiritu tuo\./gi,
               "V. Domine, exaudi orationem meam. R. Et clamor meus ad te veniat.")
      .replace(/V\.\s*Dóminus vobíscum\.\s*R\.\s*Et cum spíritu tuo\./gi,
               "V. Dómine, exáudi oratiónem meam. R. Et clamor meus ad te véniat.");
  }
  // A structural section heading (Latin + English) within an Hour.
  function section(lat, en) {
    return el("h3", "off-section", "<span>" + lat + "</span>" + (en ? '<span class="en">' + en + "</span>" : ""));
  }
  // A red italic direction: tells the person what to do; never said aloud.
  function direction(text) { return el("p", "off-direction", text); }
  // An antiphon line: the "Ant." marker set apart from the antiphon text itself.
  function prepAntGabc(g) {
    g = String(g); var i = g.indexOf("%%"); if (i >= 0) g = g.slice(i + 2);
    // Safety net: the data is pre-sanitised, but strip tags/annotations and (critically)
    // any empty neumes "()", which throw Exsurge into a synchronous freeze.
    return g.replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "")
      .replace(/[\r\n]+/g, " ").replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
  }
  function antLine(text) {
    // In sung mode, if we have the antiphon's own Gregorian melody (GregoBase), draw it.
    if (SUNG && CHANT_IDX) {
      var c = chantFor(text);
      if (c && c.gabc) {
        var wrap = el("div", "off-ant");
        wrap.appendChild(el("span", "off-ant-label", "Ant."));
        var cont = el("div", "off-exsurge off-ant-chant");
        cont.innerHTML = '<span class="muted">…</span>';
        wrap.appendChild(cont);
        renderExsurge(cont, prepAntGabc(c.gabc), CHANT_W);
        return wrap;
      }
    }
    return el("p", "off-ant", '<span class="off-ant-label">Ant.</span> ' + text);
  }
  // The psalm tone for a psalm/canticle governed by an antiphon = that antiphon's mode.
  function modeOf(antText) { var c = antText && chantFor(antText); return c ? c.mode : undefined; }
  // The exact ending (differentia), parsed from the antiphon's own EUOUAE, when available.
  function diffOf(antText) { var c = antText && chantFor(antText); return c && c.diff && c.diff.length ? c.diff : null; }
  function toneWith(mode, diff) {
    var T = toneForMode(mode);
    return diff ? { intonation: T.intonation, tenor: T.tenor, tenor2: T.tenor2, mediant: T.mediant, termination: diff } : T;
  }
  // The doxology, pointed as two verses, with the seasonal Alleluia appended.
  function gloriaBlock(li) {
    var wrap = el("div", "off-verses off-verses--pointed");
    var gv = GLORIA2.slice();
    gv[gv.length - 1] += " " + alleluiaTag(li);
    gv.forEach(function (g) { wrap.appendChild(el("p", "off-pverse off-gloria", pointedHtml(g))); });
    return wrap;
  }
  // Wrap the first letter of a text as a decorative initial (drop cap).
  function dropCap(s) {
    var m = String(s).match(/^(\s*)([A-Za-zÆŒÁÉÍÓÚÝ])([\s\S]*)$/);
    return m ? m[1] + '<span class="off-dropcap">' + m[2] + "</span>" + m[3] : String(s);
  }
  // Hymn: in sung mode render its GregoBase melody (chant) if we have it; else the text.
  function normIncipitHy(h) {
    return String(h).split("<br>")[0].replace(/<[^>]+>/g, " ").toLowerCase()
      .replace(/æ/g, "ae").replace(/œ/g, "oe").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function hymnChant(h) {
    var k = normIncipitHy(h);
    if (HYMNC[k] && HYMNC[k].g) return HYMNC[k];
    var best = null;
    for (var kk in HYMNC) { if (kk.length > 6 && k.indexOf(kk + " ") === 0 && (!best || kk.length > best.length)) best = kk; }
    return best ? HYMNC[best] : null;
  }
  // Count stanzas a hymn's GABC covers (stanza markers "2." "3." … before a note/word).
  function chantStanzaCount(g) {
    var m = String(g).match(/[\s)]\d{1,2}\.[\s(]/g);
    return (m ? m.length : 0) + 1;
  }
  function hymnBlock(h) {
    var c = SUNG ? hymnChant(h) : null;
    if (c && c.g) {
      // GregoBase usually gives only the first stanza's melody; sing that, then show
      // the remaining stanzas as text (they are sung to the same melody).
      var wrap = el("div", "off-hymn-wrap");
      var cont = el("div", "off-exsurge off-hymn-chant");
      cont.innerHTML = '<span class="muted">…</span>';
      wrap.appendChild(cont);
      renderExsurge(cont, prepAntGabc(c.g), CHANT_W);
      var stanzas = String(h).split(/<br>\s*<br>/);
      var rest = stanzas.slice(chantStanzaCount(c.g)).filter(function (s) { return s.replace(/<[^>]*>/g, "").trim(); });
      if (rest.length) wrap.appendChild(block(null, '<div class="off-hymn off-hymn-rest">' + rest.join("<br><br>") + "</div>"));
      return wrap;
    }
    return block(null, '<div class="off-hymn">' + dropCap(h) + "</div>");
  }
  // Brief responsory: in sung mode render its GregoBase melody (chant) if we have it.
  function normIncipitResp(t) {
    return String(t).split("<br>")[0].replace(/<[^>]+>/g, " ").replace(/R\.?\s*br\.?/gi, " ")
      .replace(/^\s*[RVrv]\.\s*/, " ").replace(/\*.*$/, " ").toLowerCase()
      .replace(/æ/g, "ae").replace(/œ/g, "oe").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  }
  function respChant(t) {
    var k = normIncipitResp(t), best = null;
    for (var kk in RESPC) { if (kk.length > 6 && (k === kk || k.indexOf(kk + " ") === 0) && (!best || kk.length > best.length)) best = kk; }
    return best ? RESPC[best] : null;
  }
  function respBlock(t) {
    var c = SUNG ? respChant(t) : null;
    if (c && c.g) {
      var cont = el("div", "off-exsurge off-resp-chant");
      cont.innerHTML = '<span class="muted">…</span>';
      renderExsurge(cont, prepAntGabc(c.g), CHANT_W);
      return cont;
    }
    return block(null, rubricate(t));
  }
  // Prayers said silently: a "secreto" marker plus the text in a quiet style.
  function secretoBlock(html) {
    var b = el("div", "off-block off-secreto");
    b.appendChild(el("p", "off-secreto-label", "dicitur secreto · said silently"));
    b.appendChild(el("div", "off-text", html));
    return b;
  }

  // --- Gregorian notation via Exsurge (GABC -> SVG). Fails silently to text. ---
  function renderChant(gabc, container, width) {
    try {
      if (typeof exsurge === "undefined" || !exsurge.Gabc) return false;
      var ctxt = new exsurge.ChantContext();
      var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, gabc);
      var score = new exsurge.ChantScore(ctxt, mappings, false);
      score.performLayoutAsync(ctxt, function () {
        try {
          score.layoutChantLines(ctxt, width || 520, function () {
            try { container.innerHTML = score.createSvg(ctxt); }
            catch (e) { var p = container.parentNode; if (p) p.parentNode && p.parentNode.removeChild(p); }
          });
        } catch (e) {}
      });
      return true;
    } catch (e) { return false; }
  }
  function chantBlock(gabc, label) {
    var c = el("div", "off-chant");
    if (!renderChant(gabc, c, 520)) return null;
    var b = el("div", "off-block");
    if (label) b.appendChild(el("p", "off-label", label));
    b.appendChild(c);
    return b;
  }
  // Provisional psalm-tone example (Tone VIII, ending G) shown as the traditional
  // E-u-o-u-a-e cadence. Real per-mode tones + antiphon melodies come next.
  var TONE_DEMO = "(c4) E(h) u(h) o(h) u(g) a(h) e.(g) (::)";

  function pointMarks(v) {
    // style the mediant (*) and flex (‡) marks in pointed text
    return esc(v).replace(/\s\*/g, ' <span class="off-med">*</span>')
                 .replace(/‡/g, '<span class="off-med">‡</span>');
  }
  // Escape a hemistich and style any flex (‡) inline, glued to the preceding word.
  function pointFlex(s) { return esc(s).replace(/\s*‡/g, '&nbsp;<span class="off-med">‡</span>'); }
  // Render a pointed verse as hemistichs: split at the mediant (*), the first half
  // ending with the gold asterisk (glued on with a non-breaking space so it never
  // wraps alone), the later half on its own indented line.
  function pointedHtml(v) {
    var parts = String(v).split(/\s*\*\s*/);
    if (parts.length < 2) return '<span class="off-stich">' + pointFlex(parts[0] || "") + "</span>";
    var out = '<span class="off-stich">' + pointFlex(parts[0]) + '&nbsp;<span class="off-med">*</span></span>';
    for (var i = 1; i < parts.length; i++) {
      out += '<span class="off-stich off-stich2">' + pointFlex(parts[i]) + "</span>";
    }
    return out;
  }
  // The doxology is two verses, each pointed at its own mediant.
  var GLORIA2 = [
    "Glória Patri, et Fílio, * et Spirítui Sancto.",
    "Sicut erat in princípio, et nunc, et semper, * et in sæcula sæculórum. Amen."
  ];

  /* ---------- psalm-tone engine (said ⇄ sung) ---------- */
  // Sets a pointed verse to a Gregorian psalm tone as GABC, which Exsurge renders
  // to notation. The accents already in the text place the recitation; the tone's
  // cadence formulas fall on the closing syllables. Tones are provisional (a clean
  // Tone VIII shape) — accent-exact cadences and all eight tones come next.
  var VOWELS = "aeiouyáéíóúýæœ";
  function isVowelCh(c) { return VOWELS.indexOf(c.toLowerCase()) >= 0; }
  function isAccentCh(c) { return "áéíóúýǽ".indexOf(c.toLowerCase()) >= 0; }
  function syllabify(word) {
    var w = word;
    if (w.length < 2) return [w];
    var nuclei = [];
    for (var i = 0; i < w.length; i++) {
      if (isVowelCh(w[i])) {
        var start = i, pair = w.substr(i, 2).toLowerCase();
        if (["ae", "oe", "au"].indexOf(pair) >= 0 && !isAccentCh(w[i])) i++;
        nuclei.push([start, i]);
      }
    }
    if (nuclei.length <= 1) return [w];
    var cuts = [];
    for (var n = 0; n < nuclei.length - 1; n++) {
      var endV = nuclei[n][1], nextV = nuclei[n + 1][0];
      var cons = w.substring(endV + 1, nextV), cut;
      if (cons.length === 0) cut = nextV;
      else if (cons.length === 1) cut = nextV - 1;
      else {
        var l2 = cons.slice(-2).toLowerCase();
        cut = (/^[bcdgpt][lr]$/.test(l2) || ["ph", "ch", "th", "gn"].indexOf(l2) >= 0) ? nextV - 2 : nextV - 1;
      }
      cuts.push(cut);
    }
    var parts = [], prev = 0;
    cuts.forEach(function (ci) { parts.push(w.substring(prev, ci)); prev = ci; });
    parts.push(w.substring(prev));
    return parts.filter(function (s) { return s.length; });
  }
  // The eight Gregorian psalm tones (+ tonus peregrinus), c4 clef, do = "h".
  // The reciting note (tenor) is the mode's; a representative intonation/mediant/
  // termination is used. The tone is chosen from the antiphon's mode (GregoBase data).
  var PTONES = {
    1: { intonation: ["e", "f"], tenor: "f", mediant: ["g", "f"], termination: ["f", "e", "d"] },
    2: { intonation: ["c", "d"], tenor: "d", mediant: ["e", "d"], termination: ["d", "c", "b"] },
    3: { intonation: ["g", "h"], tenor: "h", mediant: ["i", "h"], termination: ["h", "g", "h"] },
    4: { intonation: ["e", "f"], tenor: "f", mediant: ["f", "e"], termination: ["e", "d", "e"] },
    5: { intonation: ["f", "h"], tenor: "h", mediant: ["i", "h"], termination: ["h", "g", "f"] },
    6: { intonation: ["d", "f"], tenor: "f", mediant: ["g", "f"], termination: ["f", "e", "d"] },
    7: { intonation: ["h", "i"], tenor: "i", mediant: ["j", "i"], termination: ["i", "h", "g"] },
    8: { intonation: ["g", "h"], tenor: "h", mediant: ["g", "h"], termination: ["h", "g", "g"] },
    peregrinus: { intonation: ["e", "f"], tenor: "f", tenor2: "e", mediant: ["g", "f"], termination: ["e", "d", "c"] }
  };
  function toneForMode(m) { return PTONES[m] || PTONES[8]; }
  var ROMAN8 = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", peregrinus: "Per." };
  function romanTone(m) { return ROMAN8[m] || "VIII"; }
  // Normalise antiphon text the same way the GregoBase index keys were built.
  function normAnt(s) {
    return String(s).replace(/<[^>]+>/g, "").toLowerCase().normalize("NFD")
      .replace(/[̀-ͯ]/g, "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  }
  // Longest-prefix match of an antiphon against the GregoBase chant index → {mode, gabc}.
  function chantFor(text) {
    if (!CHANT_IDX) return null;
    var w = normAnt(text).split(" ");
    for (var n = Math.min(w.length, 9); n >= 2; n--) {
      var k = w.slice(0, n).join(" ");
      if (CHANT_IDX[k]) return CHANT_IDX[k];
    }
    return null;
  }
  // Build GABC (Gregorio/Exsurge notation) for a pointed hemistich: the intonation
  // and cadence syllables carry the tone's notes; the middle recites on the tenor.
  function gabcHemi(text, opts, T) {
    T = T || PTONES[8];
    var tenor = opts.tenor2 && T.tenor2 ? T.tenor2 : T.tenor;
    var words = String(text).replace(/[*‡]/g, "").trim().split(/\s+/).filter(Boolean), syls = [];
    words.forEach(function (w) { syllabify(w).forEach(function (s, si) { syls.push({ t: s, ws: si === 0 }); }); });
    var N = syls.length; if (!N) return "";
    var inC = opts.intone ? Math.min(T.intonation.length, N) : 0;
    var caC = Math.min((opts.final ? T.termination : T.mediant).length, N - inC);
    var reEnd = N - caC;
    var cad = opts.final ? T.termination : T.mediant;
    // Recitation words stay whole on a single reciting note (one note per word, no
    // per-syllable chopping); only the intonation and cadence are notated by syllable.
    var toks = [], i = 0;
    while (i < N) {
      if (i < inC) { toks.push({ t: syls[i].t, ws: syls[i].ws, n: T.intonation[i] }); i++; }
      else if (i >= reEnd) { toks.push({ t: syls[i].t, ws: syls[i].ws, n: cad[i - reEnd] }); i++; }
      else { var t = syls[i].t, ws = syls[i].ws, j = i + 1; while (j < reEnd && !syls[j].ws) { t += syls[j].t; j++; } toks.push({ t: t, ws: ws, n: tenor }); i = j; }
    }
    return toks.map(function (tk, k) { return (k > 0 && tk.ws ? " " : "") + tk.t.replace(/[()]/g, "") + "(" + tk.n + ")"; }).join("");
  }
  function gabcVerse(v, intone, T) {
    var h = String(v).split(/\s*\*\s*/);
    return gabcHemi(h[0], { intone: intone }, T) + " *(;) " + gabcHemi(h.slice(1).join(" "), { final: true, tenor2: true }, T);
  }
  function gabcForPsalm(verses, T) {
    T = T || PTONES[8];
    return "(c4) " + verses.map(function (v, i) { return gabcVerse(v, i === 0, T) + (i < verses.length - 1 ? " (:) " : " (::)"); }).join("");
  }
  // Render GABC with Exsurge into a container (async; recolored for dark mode via CSS).
  function whenExsurge(cb) {
    if (window.exsurge && window.exsurge.Gabc) return cb();
    var n = 0, t = setInterval(function () { if (window.exsurge && window.exsurge.Gabc) { clearInterval(t); cb(); } else if (++n > 160) clearInterval(t); }, 60);
  }
  function renderExsurge(container, gabc, width) {
    whenExsurge(function () {
      try {
        var ctxt = new exsurge.ChantContext();
        var score = exsurge.Gabc.loadChantScore(ctxt, gabc, true);
        // NB: in this Exsurge build performLayout / layoutChantLines do NOT invoke their
        // completion callbacks, so we run them synchronously and draw immediately after.
        score.performLayout(ctxt, function () {});
        score.layoutChantLines(ctxt, Math.max(280, width || 640), function () {});
        var svg = score.createDrawable(ctxt);
        // Exsurge omits a viewBox, so max-width:100% clips instead of scaling.
        // Inject one from the width/height so the staff scales down to fit.
        svg = svg.replace(/<svg\b([^>]*)>/, function (m, at) {
          if (/viewBox/.test(at)) return m;
          var w = (at.match(/width="([\d.]+)"/) || [])[1], h = (at.match(/height="([\d.]+)"/) || [])[1];
          return (w && h) ? "<svg" + at + ' viewBox="0 0 ' + w + " " + h + '">' : m;
        });
        container.innerHTML = svg;
      } catch (e) { container.innerHTML = '<p class="muted">(chant could not render)</p>'; }
    });
  }

  function renderPsalm(num, antiphonHtml, gloria, mode, diff) {
    var pointed = A(PT[num]);              // accented, mediant-marked (verified) verses
    var isPointed = pointed.length > 0;
    var verses = isPointed ? pointed : A(PS[num]);  // fall back to plain text
    var wrap = el("div", "off-psalm");
    wrap.appendChild(el("p", "off-psalm__title", "Psalmus " + num +
      (isPointed ? ' <span class="off-pointed">pointed</span>' : '') +
      ' <a class="off-psalm__link" href="' + (window.PSALTER_BASE || "/psalmi/") + num + '/">full &rsaquo;</a>'));
    if (antiphonHtml) wrap.appendChild(antLine(antiphonHtml));
    if (!verses.length) { wrap.appendChild(el("p", "muted", "(psalm text not loaded)")); return wrap; }

    // Sung mode: render the psalm to Gregorian notation (Exsurge), dark-recolored.
    if (SUNG && isPointed) {
      var many = verses.length > 20;
      var sungVerses = many ? verses.slice(0, 14) : verses.slice();
      if (!many && gloria !== false) sungVerses = sungVerses.concat(GLORIA2);
      wrap.appendChild(el("p", "off-tone-label", "Tonus " + romanTone(mode)));
      var cont = el("div", "off-exsurge");
      cont.innerHTML = '<p class="muted">Setting the tone…</p>';
      wrap.appendChild(cont);
      renderExsurge(cont, gabcForPsalm(sungVerses, toneWith(mode, diff)), CHANT_W);
      if (many) wrap.appendChild(el("p", "muted off-chant-more",
        "… " + verses.length + " verses; first 14 shown sung — " +
        '<a href="' + (window.PSALTER_BASE || "/psalmi/") + num + '/">full psalm ›</a>'));
      return wrap;
    }

    var body = el("div", "off-verses" + (isPointed ? " off-verses--pointed" : ""));
    var shown = verses.length > 30 ? verses.slice(0, 3) : verses;
    shown.forEach(function (v, i) {
      if (isPointed) {
        body.appendChild(el("p", "off-pverse",
          '<span class="off-vn">' + (i + 1) + "</span>" + pointedHtml(v)));
      } else {
        body.appendChild(el("p", "psalm-verse",
          '<span class="v-num">' + (i + 1) + '</span><span class="v-text">' + esc(v) + "</span>"));
      }
    });
    if (verses.length > 30) {
      body.appendChild(el("p", isPointed ? "off-pverse muted" : "psalm-verse",
        (isPointed ? '' : '<span class="v-num"></span>') + '<span class="v-text muted">… (' + verses.length +
        ' verses; prayed here in portions) — <a href="' + (window.PSALTER_BASE || "/psalmi/") + num + '/">full psalm ›</a></span>'));
      gloria = false;
    }
    if (gloria !== false) {
      GLORIA2.forEach(function (g) {
        body.appendChild(isPointed
          ? el("p", "off-pverse off-gloria", '<span class="off-vn"></span>' + pointedHtml(g))
          : el("p", "psalm-verse off-gloria", '<span class="v-num"></span><span class="v-text">' + esc(g) + "</span>"));
      });
    }
    wrap.appendChild(body);
    return wrap;
  }

  // Render an OT canticle (ad-hoc pointed verse array) in said or sung mode.
  function renderCanticle(name, ref, verses, noGloria, mode, diff) {
    var wrap = el("div", "off-psalm");
    wrap.appendChild(el("p", "off-psalm__title", "Cánticum " + name + (ref ? " · " + ref : "")));
    var vv = A(verses);
    if (!vv.length) { wrap.appendChild(el("p", "muted", "(canticle text to be added)")); return wrap; }
    if (SUNG) {
      var cont = el("div", "off-exsurge");
      cont.innerHTML = '<p class="muted">Setting the tone…</p>';
      wrap.appendChild(cont);
      renderExsurge(cont, gabcForPsalm(noGloria ? vv : vv.concat(GLORIA2), toneWith(mode, diff)), CHANT_W);
    } else {
      var body = el("div", "off-verses off-verses--pointed");
      vv.forEach(function (v, i) { body.appendChild(el("p", "off-pverse", '<span class="off-vn">' + (i + 1) + "</span>" + pointedHtml(v))); });
      if (!noGloria) GLORIA2.forEach(function (g) { body.appendChild(el("p", "off-pverse off-gloria", '<span class="off-vn"></span>' + pointedHtml(g))); });
      wrap.appendChild(body);
    }
    return wrap;
  }
  function block(label, html) {
    var b = el("div", "off-block");
    if (label) b.appendChild(el("p", "off-label", label));
    if (html) b.appendChild(el("div", "off-text", html));
    return b;
  }
  // Little chapter at Lauds/Vespers: per annum has a distinct Sunday/ferial Lauds
  // chapter and one Vespers chapter; the penitential and Paschal seasons each have one.
  function chapterFor(li, hourKey) {
    // A feast uses its Common's chapter (or none, if it has no mapped Common).
    if (li.feast) {
      if (li.feastCommon && COMMONS[li.feastCommon] && COMMONS[li.feastCommon].chap) return COMMONS[li.feastCommon].chap;
      return null;
    }
    var C = TEMPORAL.chapters; if (!C) return null;
    var isL = hourKey === "laudes";
    if (li.color === "green" || li.season === "Septuagesima") {
      if (!C.pa) return null;
      return isL ? (li.isSunday ? C.pa.laudesSun : C.pa.laudesFer) : C.pa.vespera;
    }
    var sk = li.season === "Adventus" ? "adv" : li.season === "Quadragesima" ? "quad" :
      li.season === "Tempus Passionis" ? "quad5" : li.season === "Tempus Paschale" ? "pasch" : null;
    if (sk && C[sk]) return isL ? C[sk].laudes : C[sk].vespera;
    return null;
  }
  // Brief versicle after the hymn at Lauds/Vespers (temporal; feasts use the Common, to come).
  function versicleFor(li, hourKey) {
    var V = TEMPORAL.versicles; if (!V || li.feast) return null;
    var isL = hourKey === "laudes";
    if (li.color === "green" || li.season === "Septuagesima") {
      if (!V.pa) return null;
      return isL ? (li.isSunday ? V.pa.laudesSun : V.pa.laudesFer) : (li.isSunday ? V.pa.vesperaSun : V.pa.vesperaFer);
    }
    var sk = li.season === "Adventus" ? "adv" : li.season === "Quadragesima" ? "quad" :
      li.season === "Tempus Passionis" ? "quad5" : li.season === "Tempus Paschale" ? "pasch" : null;
    if (sk && V[sk]) return isL ? V[sk].laudes : V[sk].vespera;
    return null;
  }
  // Season key for the Little Hours brief responsory data.
  function lhSeason(li) {
    if (li.season === "Adventus") return "adv";
    if (li.season === "Quadragesima" || li.season === "Tempus Passionis") return "quad";
    if (li.season === "Tempus Paschale") return "pasch";
    return "pa";
  }
  // First Vespers: under Rubrics 1960 proper to I-class feasts (and I-class Sundays) only;
  // II-class feasts have Second Vespers alone. Celebrated on the eve when it outranks the day.
  function hasFirstVespers(t) { return !!(t.feast && t.feastRank === 1); }
  function firstVespersFor(li) {
    if (!li || !li.date) return null;
    var t = liturgical(addDays(li.date, 1));
    if (!hasFirstVespers(t)) return null;
    var priv = li.season === "Adventus" || li.season === "Quadragesima" || li.season === "Tempus Passionis";
    var dignity = li.feast ? li.feastRank : (li.weekdayIndex === 0 ? (priv ? 1 : 2) : 4);
    return (t.feastRank < dignity) ? t : null;
  }
  function fvLi(li, t) {
    var o = {}; for (var k in li) o[k] = li[k];
    o.feast = t.feast; o.feastEn = t.feastEn; o.feastRank = t.feastRank;
    o.feastCommon = t.feastCommon; o.feastCollect = t.feastCollect;
    o.feastKey = t.feastKey; o.color = t.color; o.firstVespers = true;
    return o;
  }
  // Ferial preces: at Lauds & Vespers on ferias (no feast) of Advent, Lent, Passiontide.
  function precesApply(li, hourKey) {
    if (hourKey !== "laudes" && hourKey !== "vesperae") return false;
    if (li.feast || li.weekdayIndex === 0) return false;
    return li.season === "Adventus" || li.season === "Quadragesima" || li.season === "Tempus Passionis";
  }
  // "Alleluia" is said all year EXCEPT Septuagesima through Holy Saturday.
  function alleluiaTag(li) {
    var pen = li.season === "Septuagesima" || li.season === "Quadragesima" || li.season === "Tempus Passionis";
    return pen ? "Laus tibi, Dómine, Rex ætérnæ glóriæ." : "Allelúia.";
  }

  /* ---------- Compline (fully assembled) ---------- */
  function buildCompline(li) {
    var c = ORD.compline || {};
    var view = el("div", "office-hour");
    view.appendChild(el("h2", "office-hour__title", "Completorium <span class='muted'>· Compline</span>"));

    view.appendChild(el("p", "off-hour-note", "The Church's night prayer, said before sleep."));

    // — Introduction —
    view.appendChild(section("Introductio", "Opening"));
    view.appendChild(direction("The reader asks a blessing; if a priest presides, he gives it."));
    if (c.opening) view.appendChild(block(null, rubricate(c.opening)));

    // — Examination & Confiteor —
    view.appendChild(section("Confíteor", "Examination of Conscience"));
    view.appendChild(direction("A short examination of conscience is made in silence; then the Confiteor is said."));
    view.appendChild(secretoBlock("Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo, et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris: et ne nos indúcas in tentatiónem: sed líbera nos a malo. Amen."));
    if (c.examen) {
      var exRest = c.examen.split("<br>").slice(1).join("<br>");
      if (exRest) view.appendChild(block(null, rubricate(exRest)));
    }

    // — Opening versicles —
    view.appendChild(section("Versus", "Opening Versicles"));
    view.appendChild(direction("At ✠ Deus, in adiutórium, all make the sign of the cross."));
    view.appendChild(block(null, rubricate(
      "V. Converte nos, Deus, salutaris noster.<br>R. Et averte iram tuam a nobis.<br>" +
      "V. ✠ Deus, in adiutorium meum intende.<br>R. Domine, ad adiuvandum me festina.")));
    view.appendChild(gloriaBlock(li));

    // — Psalmody —
    view.appendChild(section("Psalmódia", "Psalms"));
    view.appendChild(direction("The psalms are sung under a single antiphon, repeated at the end."));
    var ant = li.paschal ? "Alleluia, alleluia, alleluia."
      : ((c.antiphons && c.antiphons[li.weekdayKey]) || c.antiphon || "Miserere mihi, Domine, et exaudi orationem meam.");
    var psSection = el("div", "off-psalms");
    var cm = modeOf(ant), cd = diffOf(ant);
    psSection.appendChild(antLine(ant));
    // Compline psalms follow the weekly cycle (Pius X), not a fixed set.
    var psalms = A(SCHEME.completorium && SCHEME.completorium[li.weekdayKey]);
    if (!psalms.length) psalms = [4, 90, 133];
    psalms.forEach(function (n) { psSection.appendChild(renderPsalm(n, null, true, cm, cd)); });
    psSection.appendChild(el("p", "off-ant", "Ant. " + ant));
    view.appendChild(psSection);

    // — Hymn —
    view.appendChild(section("Hymnus", "Hymn — Te lucis ante términum"));
    if (c.hymn) view.appendChild(hymnBlock(c.hymn));

    // — Little chapter —
    view.appendChild(section("Capítulum", "Little Chapter — Ier. 14, 9"));
    if (c.chapter) view.appendChild(block(null, rubricate(c.chapter + "<br>R. Deo gratias.")));

    // — Short responsory —
    view.appendChild(section("Responsórium breve", "Short Responsory"));
    view.appendChild(direction("The cantor intones the response; all repeat it. Responses said by all are in bold."));
    if (c.responsory) view.appendChild(respBlock(c.responsory));

    // — Nunc dimittis —
    view.appendChild(section("Canticum Simeónis", "Nunc dimittis — Luc. 2"));
    view.appendChild(direction("Said standing; the sign of the cross is made at the opening words."));
    if (c.nunc_dimittis) {
      var nd = el("div", "off-canticle");
      var ndAnt = li.paschal ? (c.nunc_ant + " Alleluia.") : c.nunc_ant;
      var ndMode = modeOf(ndAnt), ndDiff = diffOf(ndAnt);
      nd.appendChild(antLine(ndAnt));
      var ndv = A(c.nunc_dimittis);
      // The stored final line is the doxology; render the Gloria as its two verses.
      if (ndv.length && /^Gloria Patri/i.test(String(ndv[ndv.length - 1]))) ndv = ndv.slice(0, -1);
      if (SUNG) {
        // Sung to its psalm tone (from the antiphon's mode), like the other canticles.
        nd.appendChild(el("p", "off-tone-label", "Tonus " + romanTone(ndMode)));
        var ndc = el("div", "off-exsurge");
        ndc.innerHTML = '<p class="muted">Setting the tone…</p>';
        nd.appendChild(ndc);
        renderExsurge(ndc, gabcForPsalm(ndv.concat(GLORIA2), toneWith(ndMode, ndDiff)), CHANT_W);
      } else {
        var body = el("div", "off-verses off-verses--pointed");
        ndv.forEach(function (v, i) {
          var cross = i === 0 ? '<span class="off-cross" aria-hidden="true">✠</span> ' : "";
          body.appendChild(el("p", "off-pverse", '<span class="off-vn">' + (i + 1) + "</span>" + cross + pointedHtml(v)));
        });
        GLORIA2.forEach(function (g) {
          body.appendChild(el("p", "off-pverse off-gloria", '<span class="off-vn"></span>' + pointedHtml(g)));
        });
        nd.appendChild(body);
      }
      nd.appendChild(antLine(ndAnt));
      view.appendChild(nd);
    }

    // — Collect —
    view.appendChild(section("Oratio", "Collect"));
    view.appendChild(direction(ROLE === "lay"
      ? "Said without a priest: “Dominus vobiscum” is replaced by “Domine, exaudi orationem meam.”"
      : "The priest sings “Dominus vobiscum”; all answer “Et cum spiritu tuo.”"));
    if (c.collect) view.appendChild(block(null, rubricate(roleize(c.collect))));

    // — Blessing —
    view.appendChild(section("Benedíctio", "Blessing"));
    view.appendChild(direction(ROLE === "lay"
      ? "Said by all, each signing himself with the sign of the cross."
      : "The priest gives the blessing, making the sign of the cross over those present."));
    if (c.blessing) view.appendChild(block(null, rubricate(
      c.blessing.replace(/Dominus, Pater/, "Dominus, ✠ Pater"))));

    // — Marian antiphon —
    var m = (ORD.marian || {})[li.marian];
    if (m) {
      view.appendChild(section("Antíphona finális B.M.V.", m.title));
      view.appendChild(direction("The seasonal antiphon of the Blessed Virgin Mary concludes the day."));
      var mc = MARIANC[li.marian];
      if (SUNG && mc && mc.g) {
        var mcont = el("div", "off-exsurge");
        mcont.innerHTML = '<span class="muted">…</span>';
        view.appendChild(mcont);
        renderExsurge(mcont, prepAntGabc(mc.g), CHANT_W);
      } else {
        view.appendChild(block(null, '<div class="off-hymn">' + dropCap(m.text) + "</div>"));
      }
    }

    return view;
  }

  /* ---------- generic Hour (from ferial scheme, lights up as data is filled) ---------- */
  function buildGenericHour(hourKey, li) {
    // First Vespers of a feast falls on the preceding evening — swap in the feast's office.
    if (hourKey === "vesperae") { var _fv = firstVespersFor(li); if (_fv) li = fvLi(li, _fv); }
    var meta = HOURS[hourKey];
    var view = el("div", "office-hour");
    view.appendChild(el("h2", "office-hour__title", meta.lat + " <span class='muted'>· " + meta.en + "</span>"));
    if (li.firstVespers) view.appendChild(direction("First Vespers of tomorrow's feast — " + li.feast + " (" + ({ 1: "First", 2: "Second" }[li.feastRank] || "") + " class). Its proper collect and Magnificat antiphon are shown; where the feast has no Common, the psalms shown are ferial."));
    var scheme = SCHEME[hourKey];
    var psalms = A(scheme ? (scheme[li.weekdayKey] || scheme.all) : null);
    if (psalms.length) {
      view.appendChild(section("Introductio", "Opening"));
      view.appendChild(direction("The Pater noster and Ave Maria are said silently; then the versicle aloud."));
      view.appendChild(secretoBlock(
        "Pater noster, qui es in cælis, sanctificétur nomen tuum: advéniat regnum tuum: fiat volúntas tua, sicut in cælo, et in terra. Panem nostrum cotidiánum da nobis hódie: et dimítte nobis débita nostra, sicut et nos dimíttimus debitóribus nostris: et ne nos indúcas in tentatiónem: sed líbera nos a malo. Amen.<br>" +
        "Ave María, grátia plena, Dóminus tecum: benedícta tu in muliéribus, et benedíctus fructus ventris tui Iesus. Sancta María, Mater Dei, ora pro nobis peccatóribus, nunc et in hora mortis nostræ. Amen."));
      view.appendChild(block(null, rubricate(
        "V. ✠ Deus, in adiutórium meum inténde.<br>R. Dómine, ad adiuvándum me festína.")));
      view.appendChild(gloriaBlock(li));
      var hy = (ORD.hours || {})[hourKey];
      if (hy && hy.hymn) {
        view.appendChild(section("Hymnus", "Hymn — " + hy.hymnName));
        view.appendChild(hymnBlock(hy.hymn));
      }
      // On a feast, use the festal psalm scheme + the Common's psalm antiphons.
      var fp = (li.feast && li.feastCommon && (hourKey === "laudes" || hourKey === "vesperae")) ? FESTAL[li.feastCommon] : null;
      var fpAnts = fp ? (hourKey === "laudes" ? fp.lAnts : fp.vAnts) : null;
      var fpPs = fp ? (hourKey === "laudes" ? fp.lPs : fp.vPs) : null;
      var useFestal = fpAnts && fpAnts.length && fpPs && fpPs.length;
      view.appendChild(section("Psalmódia", useFestal ? "Psalms — festal, of the Common" : "Psalms — 1960 ferial cycle, " + li.weekdayLat));
      var sec = el("div", "off-psalms");
      var fer = A((FERIAL[hourKey] || {})[li.weekdayKey]);
      if (useFestal) {
        // Festal Lauds/Vespers: the Sunday psalms (or proper) under the Common's antiphons.
        fpPs.forEach(function (pn, i) {
          var a = fpAnts[i], am = modeOf(a), ad = diffOf(a);
          sec.appendChild(antLine(a));
          if (pn === "cant") sec.appendChild(renderCanticle("Trium Puerorum", "Dan. 3, 57-88", CANT["Trium Puerorum"], true, am, ad));
          else sec.appendChild(renderPsalm(parseInt(pn, 10), null, true, am, ad));
        });
      } else if (fer.length) {
        // Ferial Lauds/Vespers: each psalm has its own proper antiphon (validated vs DO).
        var seen = {};
        fer.forEach(function (e) {
          var em = modeOf(e.a), ed = diffOf(e.a);
          sec.appendChild(antLine(e.a));
          if (e.cant) {
            sec.appendChild(renderCanticle(e.cant, e.ref, CANT[e.cant], e.cant === "Trium Puerorum", em, ed));
          } else if (seen[e.n]) {
            sec.appendChild(el("p", "off-psalm__title", "Psalmus " + e.n + (e.d ? " · vv. " + e.d : "") +
              ' <a class="off-psalm__link" href="' + (window.PSALTER_BASE || "/psalmi/") + e.n + '/">full &rsaquo;</a>'));
          } else {
            sec.appendChild(renderPsalm(parseInt(e.n, 10), null, true, em, ed));
            seen[e.n] = true;
          }
        });
      } else {
        // Little Hours: a single ferial antiphon over the Hour's psalms.
        var lAnt = (LITTLE[hourKey] || {})[li.weekdayKey];
        var lm = modeOf(lAnt), ld = diffOf(lAnt);
        if (lAnt) sec.appendChild(antLine(lAnt));
        psalms.forEach(function (n) { sec.appendChild(renderPsalm(parseInt(n, 10), null, true, lm, ld)); });
        if (lAnt) sec.appendChild(antLine(lAnt));
      }
      view.appendChild(sec);
      // Athanasian Creed (Symbolum "Quicúmque") at Prime — under Rubrics 1960 only on Trinity Sunday
      // (the First Sunday after Pentecost), said after the psalmody before the little chapter.
      if (hourKey === "prima" && li.collectKey === "pent-1" && li.weekdayIndex === 0 && hy && hy.athanasian) {
        view.appendChild(section("Symbolum Athanasianum", "Athanasian Creed"));
        view.appendChild(direction("Said only today, the feast of the Most Holy Trinity."));
        view.appendChild(block(null, rubricate(hy.athanasian)));
      }
      view.appendChild(section("Capítulum · Responsórium breve", "Little chapter · responsory"));
      var lvChap = (hourKey === "laudes" || hourKey === "vesperae") ? chapterFor(li, hourKey) : null;
      if (hourKey === "prima" && hy && hy.chapter) {
        // Prime: fixed chapter (Regi sæculórum) + short responsory (Christe Fili Dei vivi) + versicle.
        view.appendChild(block(hy.chapterRef ? "Capitulum — " + hy.chapterRef : null, rubricate(hy.chapter + "<br>R. Deo grátias.")));
        if (hy.responsory) view.appendChild(respBlock(hy.responsory));
        if (hy.versicle) view.appendChild(block(null, rubricate(hy.versicle)));
      } else if (hy && hy.chapter && !li.feast) {
        // Little Hour (Terce/Sext/None) on a non-feast day: chapter (seasonal when we have
        // it, else per annum), brief responsory, versicle.
        var lhr = LITTLEHR[hourKey] && LITTLEHR[hourKey][lhSeason(li)];
        var lhChap = lhr && lhr.chap;
        if (lhChap) view.appendChild(block(lhChap.ref ? "Capitulum — " + lhChap.ref : null, rubricate(lhChap.text + "<br>R. Deo grátias.")));
        else view.appendChild(block(hy.chapterRef ? "Capitulum — " + hy.chapterRef : null, rubricate(hy.chapter + "<br>R. Deo grátias.")));
        if (lhr && lhr.resp) view.appendChild(respBlock(lhr.resp));
        if (lhr && lhr.vers) view.appendChild(block(null, rubricate(lhr.vers)));
        else if (hy.versicle) view.appendChild(block(null, rubricate(hy.versicle)));
      } else if (lvChap && lvChap.text) {
        // Little chapter at Lauds/Vespers, temporal (per annum or seasonal).
        view.appendChild(block(lvChap.ref ? "Capitulum — " + lvChap.ref : null, rubricate(lvChap.text + "<br>R. Deo grátias.")));
      } else {
        view.appendChild(direction("The little chapter and brief responsory for this Hour are proper — they change with the day and season, and are being wired in from the propers next."));
      }
      // Ferial hymn (Lauds/Vespers, per annum): after the little chapter, before the
      // gospel canticle. Roman "alme" forms; on Sundays/feasts the hymn is proper (to come).
      if (hourKey === "laudes" || hourKey === "vesperae") {
        var hk = hourKey === "laudes" ? "laudes" : "vespera";
        var htext = null, satNote = false;
        if (li.feast) {
          // A feast draws its hymn from its Common (Apostles, Martyr, BVM, …).
          if (li.feastCommon && COMMONS[li.feastCommon]) htext = COMMONS[li.feastCommon][hk === "laudes" ? "hymnL" : "hymnV"];
        } else {
          // Green time and Septuagesima use the per-weekday cycle; the penitential and
          // Paschal seasons use a single seasonal hymn.
          var perAnnumH = li.color === "green" || li.season === "Septuagesima";
          if (perAnnumH) {
            htext = HYMNS[hk] && HYMNS[hk][li.weekdayKey];
            if (hourKey === "vesperae" && li.weekdayKey === "sat") satNote = true;
          } else {
            var sk = li.season === "Adventus" ? "adv" : li.season === "Quadragesima" ? "quad" :
              li.season === "Tempus Passionis" ? "quad5" : li.season === "Tempus Paschale" ? "pasch" : null;
            if (sk && HYMNS.seasonal && HYMNS.seasonal[sk]) htext = HYMNS.seasonal[sk][hk];
          }
        }
        if (htext) {
          view.appendChild(section("Hymnus", "Hymn"));
          if (satNote) view.appendChild(direction("Saturday Vespers is the First Vespers of the coming Sunday."));
          view.appendChild(hymnBlock(htext));
        }
      }
      // Brief versicle after the hymn (temporal Lauds/Vespers).
      var lvVers = versicleFor(li, hourKey);
      if (lvVers) view.appendChild(block(null, rubricate(lvVers)));
      // Gospel canticle: Benedictus at Lauds, Magnificat at Vespers.
      var gospel = hourKey === "laudes" ? "Benedictus" : hourKey === "vesperae" ? "Magnificat" : null;
      if (gospel && A(CANT[gospel]).length) {
        view.appendChild(section(gospel === "Benedictus" ? "Canticum Zacharíæ" : "Canticum B. Maríæ Vírginis",
          gospel === "Benedictus" ? "Benedictus — Luc. 1" : "Magnificat — Luc. 1"));
        // Ferial gospel-canticle antiphon (per annum weekdays). On Sundays and feasts
        // the antiphon is proper (from the day itself) and is supplied by the calendar layer.
        var gAnt = null;
        if (li.firstVespers && FIRSTVESP && FIRSTVESP[li.feastKey] && FIRSTVESP[li.feastKey].mag) {
          // Proper First Vespers Magnificat antiphon.
          gAnt = FIRSTVESP[li.feastKey].mag;
        } else if (li.feast && li.feastKey && MOVPROP[li.feastKey]) {
          // Movable feast of the Lord (Trinity, Corpus Christi, Sacred Heart, Christ the King).
          gAnt = MOVPROP[li.feastKey][gospel === "Benedictus" ? "b" : "mg"];
        } else if (li.feast && li.feastKey && SANCT_G.antiphons && SANCT_G.antiphons[li.feastKey]) {
          // Proper gospel antiphon of the feast (major feasts).
          gAnt = SANCT_G.antiphons[li.feastKey][gospel === "Benedictus" ? "b" : "mg"];
        } else if (li.feast && li.feastCommon && COMMONS[li.feastCommon] && COMMONS[li.feastCommon].ben) {
          // Lesser feast: gospel antiphon from its Common.
          gAnt = COMMONS[li.feastCommon][gospel === "Benedictus" ? "ben" : "mag"];
        } else if (!li.feast) {
          if (li.isSunday && li.sundayKey && SUNDAY_G.antiphons && SUNDAY_G.antiphons[li.sundayKey]) {
            // Proper Sunday antiphon, from the day's own Gospel.
            gAnt = SUNDAY_G.antiphons[li.sundayKey][gospel === "Benedictus" ? "b" : "mg"];
          } else if ((li.color === "green" || li.season === "Septuagesima") && !li.isSunday && TEMPORAL.ferialGospel) {
            var gset = gospel === "Benedictus" ? TEMPORAL.ferialGospel.benedictus : TEMPORAL.ferialGospel.magnificat;
            if (gset) gAnt = gset[li.weekdayKey];
          }
        }
        if (gAnt) {
          view.appendChild(direction("The sign of the cross is made at the opening words; the antiphon is said before and, doubled, after the canticle."));
          view.appendChild(antLine(gAnt));
          view.appendChild(renderCanticle(gospel, gospel === "Benedictus" ? "Luc. 1, 68-79" : "Luc. 1, 46-55", CANT[gospel], false, modeOf(gAnt), diffOf(gAnt)));
          view.appendChild(antLine(gAnt));
        } else {
          view.appendChild(direction("Its antiphon is proper to the day (from the Sunday or feast) — supplied by the calendar layer, to come. The sign of the cross is made at the opening words."));
          view.appendChild(renderCanticle(gospel, gospel === "Benedictus" ? "Luc. 1, 68-79" : "Luc. 1, 46-55", CANT[gospel]));
        }
      }
      // Ferial preces (kneeling) before the collect, on penitential ferias.
      if (precesApply(li, hourKey) && PRECES.feriales) {
        view.appendChild(section("Preces feriales", "Ferial Preces"));
        view.appendChild(direction("Said kneeling. The collect of the day follows."));
        view.appendChild(block(null, rubricate(PRECES.feriales)));
      }
      view.appendChild(section("Oratio · Conclusio", "Collect · Conclusion"));
      var col = null, primeColl = hourKey === "prima" && hy && hy.collect;
      if (primeColl) {
        col = hy.collect;                     // Prime's own fixed collect
      } else if (li.feastCollect) {
        col = li.feastCollect;
      } else if (li.collectKey && TEMPORAL.collects) {
        var ck = li.collectKey.split("-"), cg = TEMPORAL.collects[ck[0]];
        if (cg) col = cg[ck.slice(1).join("-")];
      }
      var conclusion = "V. Dominus vobiscum. R. Et cum spiritu tuo.<br>" +
        "V. Benedicámus Dómino. R. Deo grátias.<br>" +
        "V. Fidélium ánimæ per misericórdiam Dei requiéscant in pace. R. Amen.";
      if (col) {
        if (!primeColl && li.feast) view.appendChild(direction("The proper collect of the feast."));
        else if (!primeColl && !li.isSunday) view.appendChild(direction(
          (li.season === "Quadragesima" || li.season === "Tempus Passionis")
            ? "In Lent and Passiontide each weekday has its own proper collect."
            : "On a feria the collect is that of the preceding Sunday."));
        view.appendChild(block(null, rubricate(roleize(
          "V. Dominus vobiscum. R. Et cum spiritu tuo.<br>Orémus.<br>" + col + "<br>" +
          (TEMPORAL.conclusion || "Per Dóminum nostrum Iesum Christum. R. Amen.")))));
      }
      // Commemoration of a IV-class feast (former Simplex) — at Lauds only, on a free feria.
      if (hourKey === "laudes" && !li.feast && !li.isSunday && !li.paschal) {
        var cm = COMM[li.iso.slice(5)];
        if (cm && cm.o) {
          view.appendChild(section("Commemoratio", "Commemoration — at Lauds only"));
          view.appendChild(direction("Commemoration of " + cm.n + " (a IV-class feast, kept as a commemoration): its antiphon and versicle from the Common, then its collect."));
          var cset = cm.c && COMM._ant && COMM._ant[cm.c];
          var cbody = "";
          if (cset) cbody += "Ant. " + cset.a + "<br>V. " + cset.v + "<br>R. " + cset.r + "<br>";
          cbody += "Orémus.<br>" + cm.o + "<br>" + (TEMPORAL.conclusion || "Per Dóminum nostrum Iesum Christum. R. Amen.");
          view.appendChild(block(null, rubricate(roleize(cbody))));
        }
      }
      view.appendChild(block(null, rubricate(roleize(conclusion))));
      if (primeColl && hy.pretiosa) {
        // The little chapter-office (Pretiosa) that follows Prime in choir.
        view.appendChild(section("Pretiósa", "Martyrology & blessing"));
        view.appendChild(direction("In choir the Martyrology of the day is read here, then:"));
        view.appendChild(block(null, rubricate(hy.pretiosa)));
      }
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
    var activeHour = currentHourKey(new Date());   // open to the Hour for the current time

    dateEl.innerHTML =
      '<div class="office-date__pill office-color--' + li.color + '">' + li.color + '</div>' +
      '<div><div class="office-date__lat">' + li.title + "</div>" +
      '<div class="office-date__en">' + li.englishDate + " &mdash; " +
      (li.feast ? (li.feastEn || ({ 1: "First", 2: "Second", 3: "Third" }[li.feastRank] || "Third") + " class feast · " + li.seasonEn)
        : li.seasonEn + (li.weekRoman ? " · week " + li.weekRoman : "") + (li.paschal ? " (Paschaltide)" : "")) +
      "</div></div>";

    // Date picker — browse the office for any day (not just today).
    var pick = el("div", "office-datepick");
    pick.innerHTML =
      '<button class="office-datenav" data-nav="-1" title="Previous day" aria-label="Previous day">&lsaquo;</button>' +
      '<input type="date" class="office-dateinput" value="' + li.iso + '">' +
      '<button class="office-datenav" data-nav="1" title="Next day" aria-label="Next day">&rsaquo;</button>' +
      '<button class="office-datenav office-datenav--today" data-nav="today">Today</button>';
    pick.querySelector(".office-dateinput").onchange = function () {
      if (this.value) location.href = location.pathname + "?date=" + this.value;
    };
    Array.prototype.forEach.call(pick.querySelectorAll(".office-datenav"), function (b) {
      b.onclick = function () {
        var nav = b.getAttribute("data-nav");
        if (nav === "today") { location.href = location.pathname; return; }
        var d = new Date(current.getTime()); d.setDate(d.getDate() + parseInt(nav, 10));
        location.href = location.pathname + "?date=" + fmtISO(d);
      };
    });
    if (navEl && navEl.parentNode) navEl.parentNode.insertBefore(pick, navEl);

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
        renderHour(true);
      };
      navEl.appendChild(a);
    });

    // Priest / lay recitation toggle — changes forms like Dominus vobiscum.
    var roleEl = el("div", "office-roles");
    function paintRoles() {
      roleEl.innerHTML =
        '<span class="office-roles__label">Led by</span>' +
        '<button class="office-role-btn' + (ROLE === "priest" ? " is-active" : "") + '" data-role="priest">A priest or deacon</button>' +
        '<button class="office-role-btn' + (ROLE === "lay" ? " is-active" : "") + '" data-role="lay">No ordained minister</button>';
      Array.prototype.forEach.call(roleEl.querySelectorAll("button"), function (b) {
        b.onclick = function () { ROLE = b.getAttribute("data-role"); paintRoles(); renderHour(false); };
      });
    }
    paintRoles();
    if (viewEl && viewEl.parentNode) viewEl.parentNode.insertBefore(roleEl, viewEl);

    // Said / Sung toggle — text-and-pointing vs. chant notation.
    var modeEl = el("div", "office-roles");
    function paintMode() {
      modeEl.innerHTML =
        '<span class="office-roles__label">Mode</span>' +
        '<button class="office-role-btn' + (!SUNG ? " is-active" : "") + '" data-mode="said">Said · pointed text</button>' +
        '<button class="office-role-btn' + (SUNG ? " is-active" : "") + '" data-mode="sung">Sung · chant</button>';
      Array.prototype.forEach.call(modeEl.querySelectorAll("button"), function (b) {
        b.onclick = function () { SUNG = b.getAttribute("data-mode") === "sung"; paintMode(); renderHour(false); };
      });
    }
    paintMode();
    if (viewEl && viewEl.parentNode) viewEl.parentNode.insertBefore(modeEl, viewEl);

    function renderHour(scroll) {
      CHANT_W = Math.max(280, Math.min(viewEl.clientWidth || 660, 680)) - 6;
      viewEl.innerHTML = "";
      // On a feast we can name the day, but its proper office isn't assembled yet.
      if (li.feast) viewEl.appendChild(el("p", "office-todo",
        li.feastCommon
          ? ("Today is a feast — <strong>" + li.feast + "</strong>. Its proper <strong>collect</strong> and <strong>gospel antiphons</strong>, and the <strong>hymn and chapter</strong> from its Common, are shown below; the proper psalm antiphons and lessons are not yet assembled, so the ferial psalms are shown beneath the proper parts.")
          : ("Today is a feast — <strong>" + li.feast + "</strong>. Its proper <strong>collect</strong> and <strong>gospel-canticle antiphons</strong> are shown below" +
            (li.feastCollect || (li.feastKey && SANCT_G.antiphons && SANCT_G.antiphons[li.feastKey]) ? "" : " where available") +
            "; the fuller proper office (hymn, chapter, proper psalm antiphons, lessons) is not yet assembled, so the ferial framework is shown for the rest.")));
      try {
        viewEl.appendChild(activeHour === "completorium" ? buildCompline(li) : buildGenericHour(activeHour, li));
      } catch (err) {
        viewEl.appendChild(el("p", "office-todo",
          "This Hour failed to render: " + (err && err.message ? err.message : String(err))));
      }
      if (scroll) viewEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Re-flow the chant when the width changes.
    var rzTimer;
    window.addEventListener("resize", function () {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(function () { if (SUNG) renderHour(false); }, 200);
    });
    renderHour(false);
  }

  function safeInit() {
    // Marker: if office.js executes at all, "Loading…" becomes "Rendering…".
    var v0 = document.getElementById("office-view");
    if (v0) v0.innerHTML = '<p class="muted">Rendering the Office…</p>';
    try { init(); }
    catch (e) {
      var a = document.getElementById("office-app");
      if (a) a.innerHTML = '<p class="office-todo">The Office failed to load: ' +
        (e && e.message ? e.message : String(e)) + "</p>";
      if (window.console) console.error("office init error", e);
    }
  }
  function start() {
    var v0 = document.getElementById("office-view");
    if (v0) v0.innerHTML = '<p class="muted">Fetching the Office…</p>';
    loadData(function (d) {
      buildData(d);
      if (!PSALTER.length) {
        var app = document.getElementById("office-app");
        if (app) app.insertAdjacentHTML("afterbegin",
          '<p class="office-todo">Office data did not load. Diagnostics:<br>' +
          DIAG.map(esc).join("<br>") + '</p>');
      }
      safeInit();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
