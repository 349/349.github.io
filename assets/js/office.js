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
  var PSALTER = [], PT = {}, ORD = {}, SCHEME = {}, PS = {}, VESP = {}, LAUD = {}, CANT = {}, LITTLE = {}, SANCT = {}, TEMPORAL = {}, HYMNS = {}, SUNDAY_G = {};
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
    var names = { PSALTER: "psalter.json", POINTED: "psalter_pointed.json", ORDINARY: "office_ordinary.json", SCHEME: "ferial_psalter.json", VESPERS: "ferial_vespers.json", LAUDS: "ferial_lauds.json", CANTICLES: "canticles.json", HOURS: "ferial_hours.json", SANCTORAL: "sanctoral.json", TEMPORAL: "temporal.json", HYMNS: "ferial_hymns.json", SUNDAYGOSPEL: "sunday_gospel.json" };
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
    var movable = [
      [addDays(E, -7), "Dominica in Palmis", "Palm Sunday", "violet"],
      [addDays(E, -3), "Feria V in Cena Dómini", "Maundy Thursday", "white"],
      [addDays(E, -2), "Feria VI in Passióne Dómini", "Good Friday", "black"],
      [addDays(E, -1), "Sábbato Sancto", "Holy Saturday", "violet"],
      [E, "Dominica Resurrectiónis", "Easter Sunday", "white"],
      [addDays(E, 39), "Ascénsio Dómini", "Ascension", "white"],
      [pent, "Dominica Pentecóstes", "Pentecost", "red"],
      [addDays(E, 56), "Sanctíssima Trínitas", "Trinity Sunday", "white"],
      [addDays(E, 60), "Corpus Christi", "Corpus Christi", "white"],
      [addDays(E, 68), "Sacratíssimum Cor Iesu", "Sacred Heart", "white"],
      [christKing, "D. N. Iesu Christi Regis", "Christ the King", "white"]
    ];
    var feast = null, feastEn = null, feastRank = null;
    // Fixed sanctoral (simplified precedence: I class always takes the day; II class
    // yields to a Sunday, on which it would be commemorated).
    var mmdd = String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var s = SANCT[mmdd];
    if (s && s.n && (s.r === 1 || (s.r === 2 && dow !== 0))) { feast = s.n; feastRank = s.r; color = s.c || color; }
    // Principal movable feasts override the fixed sanctoral.
    for (var fi = 0; fi < movable.length; fi++) {
      if (movable[fi][0].getTime() === d.getTime()) { feast = movable[fi][1]; feastEn = movable[fi][2]; color = movable[fi][3]; feastRank = 1; break; }
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
      collectKey: collectKey, sundayKey: sundayKey,
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
  function antLine(text) { return el("p", "off-ant", '<span class="off-ant-label">Ant.</span> ' + text); }
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
  var PTONE = { tenor: "h", intonation: ["g", "h"], mediant: ["g", "h"], termination: ["h", "g", "g"] };
  // Build GABC (Gregorio/Exsurge notation) for a pointed hemistich: the intonation
  // and cadence syllables carry the tone's notes; the middle recites on the tenor.
  function gabcHemi(text, opts) {
    var words = String(text).replace(/[*‡]/g, "").trim().split(/\s+/).filter(Boolean), syls = [];
    words.forEach(function (w) { syllabify(w).forEach(function (s, si) { syls.push({ t: s, ws: si === 0 }); }); });
    var N = syls.length; if (!N) return "";
    var inC = opts.intone ? Math.min(PTONE.intonation.length, N) : 0;
    var caC = Math.min((opts.final ? PTONE.termination : PTONE.mediant).length, N - inC);
    var reEnd = N - caC;
    var cad = opts.final ? PTONE.termination : PTONE.mediant;
    // Recitation words stay whole on a single reciting note (one note per word, no
    // per-syllable chopping); only the intonation and cadence are notated by syllable.
    var toks = [], i = 0;
    while (i < N) {
      if (i < inC) { toks.push({ t: syls[i].t, ws: syls[i].ws, n: PTONE.intonation[i] }); i++; }
      else if (i >= reEnd) { toks.push({ t: syls[i].t, ws: syls[i].ws, n: cad[i - reEnd] }); i++; }
      else { var t = syls[i].t, ws = syls[i].ws, j = i + 1; while (j < reEnd && !syls[j].ws) { t += syls[j].t; j++; } toks.push({ t: t, ws: ws, n: PTONE.tenor }); i = j; }
    }
    return toks.map(function (tk, k) { return (k > 0 && tk.ws ? " " : "") + tk.t.replace(/[()]/g, "") + "(" + tk.n + ")"; }).join("");
  }
  function gabcVerse(v, intone) {
    var h = String(v).split(/\s*\*\s*/);
    return gabcHemi(h[0], { intone: intone }) + " *(;) " + gabcHemi(h.slice(1).join(" "), { final: true });
  }
  function gabcForPsalm(verses) {
    return "(c4) " + verses.map(function (v, i) { return gabcVerse(v, i === 0) + (i < verses.length - 1 ? " (:) " : " (::)"); }).join("");
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
        score.performLayout(ctxt, function () {
          score.layoutChantLines(ctxt, Math.max(280, width || 640), function () {
            try {
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
        });
      } catch (e) { container.innerHTML = '<p class="muted">(chant unavailable)</p>'; }
    });
  }

  function renderPsalm(num, antiphonHtml, gloria) {
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
      wrap.appendChild(el("p", "off-tone-label", "Tonus VIII"));
      var cont = el("div", "off-exsurge");
      cont.innerHTML = '<p class="muted">Setting the tone…</p>';
      wrap.appendChild(cont);
      renderExsurge(cont, gabcForPsalm(sungVerses), CHANT_W);
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
  function renderCanticle(name, ref, verses, noGloria) {
    var wrap = el("div", "off-psalm");
    wrap.appendChild(el("p", "off-psalm__title", "Cánticum " + name + (ref ? " · " + ref : "")));
    var vv = A(verses);
    if (!vv.length) { wrap.appendChild(el("p", "muted", "(canticle text to be added)")); return wrap; }
    if (SUNG) {
      var cont = el("div", "off-exsurge");
      cont.innerHTML = '<p class="muted">Setting the tone…</p>';
      wrap.appendChild(cont);
      renderExsurge(cont, gabcForPsalm(noGloria ? vv : vv.concat(GLORIA2)), CHANT_W);
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
    psSection.appendChild(antLine(ant));
    // Compline psalms follow the weekly cycle (Pius X), not a fixed set.
    var psalms = A(SCHEME.completorium && SCHEME.completorium[li.weekdayKey]);
    if (!psalms.length) psalms = [4, 90, 133];
    psalms.forEach(function (n) { psSection.appendChild(renderPsalm(n, null, true)); });
    psSection.appendChild(el("p", "off-ant", "Ant. " + ant));
    view.appendChild(psSection);

    // — Hymn —
    view.appendChild(section("Hymnus", "Hymn — Te lucis ante términum"));
    if (c.hymn) view.appendChild(block(null, '<div class="off-hymn">' + dropCap(c.hymn) + "</div>"));

    // — Little chapter —
    view.appendChild(section("Capítulum", "Little Chapter — Ier. 14, 9"));
    if (c.chapter) view.appendChild(block(null, rubricate(c.chapter + "<br>R. Deo gratias.")));

    // — Short responsory —
    view.appendChild(section("Responsórium breve", "Short Responsory"));
    view.appendChild(direction("The cantor intones the response; all repeat it. Responses said by all are in bold."));
    if (c.responsory) view.appendChild(block(null, rubricate(c.responsory)));

    // — Nunc dimittis —
    view.appendChild(section("Canticum Simeónis", "Nunc dimittis — Luc. 2"));
    view.appendChild(direction("Said standing; the sign of the cross is made at the opening words."));
    if (c.nunc_dimittis) {
      var nd = el("div", "off-canticle");
      var ndAnt = li.paschal ? (c.nunc_ant + " Alleluia.") : c.nunc_ant;
      nd.appendChild(antLine(ndAnt));
      var body = el("div", "off-verses off-verses--pointed");
      var ndv = A(c.nunc_dimittis);
      // The stored final line is the doxology; render the Gloria as its two verses.
      if (ndv.length && /^Gloria Patri/i.test(String(ndv[ndv.length - 1]))) ndv = ndv.slice(0, -1);
      ndv.forEach(function (v, i) {
        var cross = i === 0 ? '<span class="off-cross" aria-hidden="true">✠</span> ' : "";
        body.appendChild(el("p", "off-pverse", '<span class="off-vn">' + (i + 1) + "</span>" + cross + pointedHtml(v)));
      });
      GLORIA2.forEach(function (g) {
        body.appendChild(el("p", "off-pverse off-gloria", '<span class="off-vn"></span>' + pointedHtml(g)));
      });
      nd.appendChild(body);
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
      view.appendChild(block(null, '<div class="off-hymn">' + dropCap(m.text) + "</div>"));
    }

    return view;
  }

  /* ---------- generic Hour (from ferial scheme, lights up as data is filled) ---------- */
  function buildGenericHour(hourKey, li) {
    var meta = HOURS[hourKey];
    var view = el("div", "office-hour");
    view.appendChild(el("h2", "office-hour__title", meta.lat + " <span class='muted'>· " + meta.en + "</span>"));
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
        view.appendChild(block(null, '<div class="off-hymn">' + dropCap(hy.hymn) + "</div>"));
      }
      view.appendChild(section("Psalmódia", "Psalms — 1960 ferial cycle, " + li.weekdayLat));
      var sec = el("div", "off-psalms");
      var fer = A((FERIAL[hourKey] || {})[li.weekdayKey]);
      if (fer.length) {
        // Ferial Lauds/Vespers: each psalm has its own proper antiphon (validated vs DO).
        var seen = {};
        fer.forEach(function (e) {
          sec.appendChild(antLine(e.a));
          if (e.cant) {
            sec.appendChild(renderCanticle(e.cant, e.ref, CANT[e.cant], e.cant === "Trium Puerorum"));
          } else if (seen[e.n]) {
            sec.appendChild(el("p", "off-psalm__title", "Psalmus " + e.n + (e.d ? " · vv. " + e.d : "") +
              ' <a class="off-psalm__link" href="' + (window.PSALTER_BASE || "/psalmi/") + e.n + '/">full &rsaquo;</a>'));
          } else {
            sec.appendChild(renderPsalm(parseInt(e.n, 10), null, true));
            seen[e.n] = true;
          }
        });
      } else {
        // Little Hours: a single ferial antiphon over the Hour's psalms.
        var lAnt = (LITTLE[hourKey] || {})[li.weekdayKey];
        if (lAnt) sec.appendChild(antLine(lAnt));
        psalms.forEach(function (n) { sec.appendChild(renderPsalm(parseInt(n, 10), null, true)); });
        if (lAnt) sec.appendChild(antLine(lAnt));
      }
      view.appendChild(sec);
      view.appendChild(section("Capítulum · Responsórium breve", "Little chapter · responsory"));
      if (hy && hy.chapter && li.color === "green") {
        // Little-Hour chapter + versicle, per annum (validated vs Divinum Officium).
        view.appendChild(block(hy.chapterRef ? "Capitulum — " + hy.chapterRef : null, rubricate(hy.chapter + "<br>R. Deo gratias.")));
        if (hy.versicle) view.appendChild(block(null, rubricate(hy.versicle)));
      } else {
        view.appendChild(direction("The little chapter and brief responsory for this Hour are proper — they change with the day and season, and are being wired in from the propers next."));
      }
      // Ferial hymn (Lauds/Vespers, per annum): after the little chapter, before the
      // gospel canticle. Roman "alme" forms; on Sundays/feasts the hymn is proper (to come).
      if ((hourKey === "laudes" || hourKey === "vesperae") && !li.feast) {
        var hk = hourKey === "laudes" ? "laudes" : "vespera";
        // Green time and Septuagesima use the per-weekday cycle; the penitential and
        // Paschal seasons use a single seasonal hymn.
        var perAnnumH = li.color === "green" || li.season === "Septuagesima";
        var htext = null, satNote = false;
        if (perAnnumH) {
          htext = HYMNS[hk] && HYMNS[hk][li.weekdayKey];
          if (hourKey === "vesperae" && li.weekdayKey === "sat") satNote = true;
        } else {
          var sk = li.season === "Adventus" ? "adv" : li.season === "Quadragesima" ? "quad" :
            li.season === "Tempus Passionis" ? "quad5" : li.season === "Tempus Paschale" ? "pasch" : null;
          if (sk && HYMNS.seasonal && HYMNS.seasonal[sk]) htext = HYMNS.seasonal[sk][hk];
        }
        if (htext) {
          view.appendChild(section("Hymnus", "Hymn"));
          if (satNote) view.appendChild(direction("Saturday Vespers is the First Vespers of the coming Sunday."));
          view.appendChild(block(null, '<div class="off-hymn">' + dropCap(htext) + "</div>"));
        }
      }
      // Gospel canticle: Benedictus at Lauds, Magnificat at Vespers.
      var gospel = hourKey === "laudes" ? "Benedictus" : hourKey === "vesperae" ? "Magnificat" : null;
      if (gospel && A(CANT[gospel]).length) {
        view.appendChild(section(gospel === "Benedictus" ? "Canticum Zacharíæ" : "Canticum B. Maríæ Vírginis",
          gospel === "Benedictus" ? "Benedictus — Luc. 1" : "Magnificat — Luc. 1"));
        // Ferial gospel-canticle antiphon (per annum weekdays). On Sundays and feasts
        // the antiphon is proper (from the day itself) and is supplied by the calendar layer.
        var gAnt = null;
        if (!li.feast) {
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
          view.appendChild(renderCanticle(gospel, gospel === "Benedictus" ? "Luc. 1, 68-79" : "Luc. 1, 46-55", CANT[gospel]));
          view.appendChild(antLine(gAnt));
        } else {
          view.appendChild(direction("Its antiphon is proper to the day (from the Sunday or feast) — supplied by the calendar layer, to come. The sign of the cross is made at the opening words."));
          view.appendChild(renderCanticle(gospel, gospel === "Benedictus" ? "Luc. 1, 68-79" : "Luc. 1, 46-55", CANT[gospel]));
        }
      }
      view.appendChild(section("Oratio · Conclusio", "Collect · Conclusion"));
      var col = null;
      if (li.collectKey && TEMPORAL.collects) {
        var ck = li.collectKey.split("-"), cg = TEMPORAL.collects[ck[0]];
        if (cg) col = cg[ck.slice(1).join("-")];
      }
      var conclusion = "V. Dominus vobiscum. R. Et cum spiritu tuo.<br>" +
        "V. Benedicámus Dómino. R. Deo grátias.<br>" +
        "V. Fidélium ánimæ per misericórdiam Dei requiéscant in pace. R. Amen.";
      if (col) {
        if (!li.isSunday) view.appendChild(direction(
          (li.season === "Quadragesima" || li.season === "Tempus Passionis")
            ? "In Lent and Passiontide each weekday has its own proper collect."
            : "On a feria the collect is that of the preceding Sunday."));
        view.appendChild(block(null, rubricate(roleize(
          "V. Dominus vobiscum. R. Et cum spiritu tuo.<br>Orémus.<br>" + col + "<br>" +
          (TEMPORAL.conclusion || "Per Dóminum nostrum Iesum Christum. R. Amen.")))));
      }
      view.appendChild(block(null, rubricate(roleize(conclusion))));
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
      (li.feast ? (li.feastEn || (li.feastRank === 1 ? "First class feast" : "Second class feast") + " · " + li.seasonEn)
        : li.seasonEn + (li.weekRoman ? " · week " + li.weekRoman : "") + (li.paschal ? " (Paschaltide)" : "")) +
      "</div></div>";

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
        "Today is a feast — <strong>" + li.feast + "</strong>. Its proper office (proper psalms, antiphons, lessons, and collect) is not yet assembled; the ferial framework is shown below for reference."));
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
