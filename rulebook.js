// The Rulebook (rulebook.html): rules for common jobs that people can change, test with a message
// and add to RingMeFor. One file does both halves. tools/make_rulebook.js uses its functions to
// write every rule into the page's HTML, so the page reads the same without JavaScript; in the
// browser it makes the rule's parts editable, answers the tester, and keeps the Add link, the QR
// code and the by-hand steps in step with the edits. Matching is rule-engine.js, the app's own
// logic, so the tester answers as the app would.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./rule-engine.js"));
  } else {
    root.Rulebook = factory(root.RuleEngine);
    if (typeof document !== "undefined") root.Rulebook.start(document);
  }
})(typeof self !== "undefined" ? self : this, function (Engine) {
  "use strict";

  var EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
  var DAY_SETS = { every: [1, 2, 3, 4, 5, 6, 7], weekdays: [2, 3, 4, 5, 6], weekends: [1, 7] };
  // The app's names for them, under When → Days.
  var DAY_LABELS = { every: "Every day", weekdays: "Weekdays", weekends: "Weekends" };
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var PRO = '<span class="mark">Pro</span>';

  function esc(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // "a", "a or b", "a, b or c"
  function joined(items, last) {
    if (items.length < 2) return items.join("");
    return items.slice(0, -1).join(", ") + " " + last + " " + items[items.length - 1];
  }

  function quoted(word) {
    return "“" + word + "”";
  }

  function byNumber(a, b) {
    return a - b;
  }

  function clean(list) {
    return (Array.isArray(list) ? list : []).filter(function (item) {
      return typeof item === "string" && item.trim() !== "";
    });
  }

  function pad(number) {
    return (number < 10 ? "0" : "") + number;
  }

  // A rule's time: 9 AM, 6:30 PM, 12 PM for noon.
  function clock(minute) {
    var hour = Math.floor(minute / 60) % 24;
    var rest = minute % 60;
    var twelve = hour % 12 === 0 ? 12 : hour % 12;
    return twelve + (rest ? ":" + pad(rest) : "") + (hour < 12 ? " AM" : " PM");
  }

  // The time now, always with its minutes: 10:40 PM.
  function clockAt(date) {
    var hour = date.getHours();
    var twelve = hour % 12 === 0 ? 12 : hour % 12;
    return twelve + ":" + pad(date.getMinutes()) + (hour < 12 ? " AM" : " PM");
  }

  // A minute of the day from a link, or the app's default when it isn't one.
  function minuteOfDay(value, fallback) {
    return typeof value === "number" && value === Math.floor(value) && value >= 0 && value < 24 * 60 ? value : fallback;
  }

  // The rule's hours, with the app's defaults for anything missing.
  function hours(rule) {
    var h = rule.activeHours || {};
    return {
      enabled: !!h.enabled,
      startMinute: minuteOfDay(h.startMinute, 22 * 60),
      endMinute: minuteOfDay(h.endMinute, 7 * 60),
      weekdays: (function () {
        var days = (Array.isArray(h.weekdays) ? h.weekdays : []).filter(function (day) {
          return day === Math.floor(day) && day >= 1 && day <= 7;
        });
        return (days.length ? days : EVERY_DAY).slice().sort(byNumber);
      })(),
    };
  }

  function daysKey(weekdays) {
    var list = weekdays.slice().sort(byNumber).join();
    for (var key in DAY_SETS) {
      if (DAY_SETS[key].join() === list) return key;
    }
    return "";
  }

  function shortDays(weekdays) {
    return joined(weekdays.map(function (day) { return DAY_SHORT[day - 1]; }), "and");
  }

  // As the sentence says it: "on weekdays", "every day".
  function daysPhrase(weekdays) {
    var key = daysKey(weekdays);
    if (key === "every") return "every day";
    return "on " + (key || shortDays(weekdays));
  }

  // "9 AM to 6 PM on weekdays"
  function span(h) {
    return clock(h.startMinute) + " to " + clock(h.endMinute) + " " + daysPhrase(h.weekdays);
  }

  // Counted repeats (the app's Repeats: Only when it comes again), or null.
  function threshold(rule) {
    var t = rule.threshold;
    if (!t || typeof t !== "object") return null;
    return {
      count: Math.max(2, Math.min(10, +t.count || 3)),
      minutes: Math.max(1, Math.min(60, +t.minutes || 5)),
      samePerson: t.samePerson !== false,
    };
  }

  var REPEAT_MINUTES = [1, 2, 5, 10, 15, 30, 60];

  function times(count) {
    return count === 2 ? "twice" : count + " times";
  }

  function minutesText(minutes) {
    return minutes === 1 ? "1 minute" : minutes + " minutes";
  }

  // What the same person does in the sentence: texts in Messages, calls in Phone.
  function repeatVerb(rule) {
    if (rule.appID === "phone") return "calls";
    if (rule.appID === "messages") return "texts";
    return "writes";
  }

  // Hours and Ring again need RingMeFor Pro.
  function isPro(rule) {
    return hours(rule).enabled || !!rule.repeatUntilStopped ||
      (!!rule.sound && rule.sound !== "siren") || (!!rule.boost && rule.boost !== "off");
  }

  // The app's names for its alarm sounds (AlarmSound.displayName) and Boost levels.
  var SOUNDS = { standard: "Standard alarm", signature: "RingMeFor", siren: "Hi-Lo", klaxon: "Reactor", buzzer: "Hornet",
    beep: "Bedside", pulse: "On Call", oldPhone: "Rotary", eightBit: "Arcade", rise: "Liftoff", melody: "Kalimba",
    chime: "Intercom", clean: "Boardroom", birds: "Dawn Chorus", silent: "Vibrate only" };
  var BOOSTS = { loud: "Loud", louder: "Louder", loudest: "Loudest" };

  // Which parts the sentence has. It's set by the rule as written, so emptying a part while
  // editing leaves it in place to fill again.
  function shapeOf(rule) {
    var everything = rule.mode === "everything";
    var keywords = clean(rule.keywords);
    var people = clean(rule.people);
    return {
      keywords: !everything && (keywords.length > 0 || (people.length === 0 && !clean(rule.patterns).length)),
      patterns: !everything && clean(rule.patterns).length > 0,
      people: !everything && people.length > 0,
      exclusions: clean(rule.exclusions).length > 0,
      hours: hours(rule).enabled,
      repeats: !!threshold(rule),
    };
  }

  // A message can change the answer, so the rule gets a test field. A rule that counts repeats
  // of every notification gets a button that sends test notifications instead.
  // Patterns are regular expressions, and JavaScript's aren't the app's, so a rule with them
  // gets no test here.
  function hasTester(shape) {
    return (shape.keywords || shape.people || shape.exclusions) && !shape.patterns;
  }

  function hasCounter(rule, shape) {
    return rule.mode === "everything" && shape.repeats && !shape.exclusions;
  }

  // ---------- The sentence ----------

  function part(kind, inner, label, options) {
    if (options.editing === kind && options.field) return options.field;
    if (!options.editable) return '<span class="part">' + inner + "</span>";
    return '<span class="part" role="button" tabindex="0" data-part="' + kind + '" aria-label="' + esc(label) + '">' + inner + "</span>";
  }

  function terms(items, quote, placeholder) {
    if (!items.length) return placeholder;
    return joined(items.map(function (item) {
      return '<span class="term" data-term="' + esc(item) + '">' + esc(quote ? quoted(item) : item) + "</span>";
    }), "or");
  }

  // "Ring me for Slack when it says “outage”, “sev1” or “down”." as HTML. With editable, each
  // part someone would change is a button; with editing, that part is the field in options.field.
  function sentence(rule, options) {
    var o = options || {};
    var shape = rule.shape || shapeOf(rule);
    var keywords = clean(rule.keywords);
    var people = clean(rule.people);
    var exclusions = clean(rule.exclusions);
    var h = hours(rule);
    var app = part("app", esc(rule.appName), "App: " + rule.appName + ". Change it", o);
    var t = threshold(rule);
    var count = t ? part("count", times(t.count), "How many times: " + times(t.count) + ". Change it", o) : "";
    var within = t ? part("minutes", minutesText(t.minutes), "Within " + minutesText(t.minutes) + ". Change it", o) : "";
    var html = "Ring me for ";
    if (rule.mode === "everything" && t) {
      html += app + (t.samePerson
        ? " when the same person " + repeatVerb(rule) + " " + count + " within " + within
        : " when it comes " + count + " within " + within);
    } else if (rule.mode === "everything") {
      html += '<span class="term" data-term="' + esc(Engine.EVERY) + '">every notification</span> from ' + app;
    } else {
      html += app;
      var says = part("keywords", terms(keywords, true, "“…”"), "Words: " + (keywords.join(", ") || "none") + ". Change them", o);
      var from = part("people", terms(people, false, "…"), "People: " + (people.join(", ") || "none") + ". Change them", o);
      var matches = shape.patterns ? " matches its patterns" : "";
      if (shape.people && shape.keywords) html += " when it's from " + from + " or says " + says + (matches ? " or" + matches : "");
      else if (shape.people) html += " when it's from " + from + (matches ? " or" + matches : "");
      else if (shape.keywords) html += " when it says " + says + (matches ? " or" + matches : "");
      else if (matches) html += " when it" + matches;
    }
    if (t && rule.mode !== "everything") {
      html += ", " + count + " within " + within + (t.samePerson ? " from the same person" : "");
    }
    if (shape.exclusions) {
      html += ", unless it says " + part("exclusions", terms(exclusions, true, "“…”"), "Unless it says: " + (exclusions.join(", ") || "nothing") + ". Change it", o);
    }
    if (shape.hours) {
      var start = part("start", clock(h.startMinute), "From " + clock(h.startMinute) + ". Change it", o);
      var end = part("end", clock(h.endMinute), "Until " + clock(h.endMinute) + ". Change it", o);
      var days = part("days", daysPhrase(h.weekdays), "Days: " + daysPhrase(h.weekdays) + ". Change them", o);
      html += rule.phrase === "shift"
        ? " during my shift, " + start + " to " + end + " " + days
        : ", " + days + " from " + start + " to " + end;
    }
    if (rule.sound && rule.sound !== "siren") {
      html += rule.sound === "silent" ? ", with no sound, just vibration"
        : SOUNDS[rule.sound] ? ", with the " + SOUNDS[rule.sound] + " sound" : ", with a sound of its own";
    }
    if (rule.boost && BOOSTS[rule.boost]) html += ", at " + BOOSTS[rule.boost] + " loudness";
    if (rule.repeatUntilStopped) html += ", and ring again until I stop it";
    html += ".";
    // The mark stays on the line with the sentence's last word.
    if (isPro(rule)) html += "&nbsp;" + PRO;
    return html;
  }

  // ---------- The tester ----------

  // What the app would do with a notification that says `message`, at `now`:
  // { ring, now (quiet only because of the hours), hit (what matched), reason }, or null for an
  // empty message.
  function verdict(rule, message, now) {
    var text = String(message || "");
    if (!text.trim()) return null;
    var content = { text: text };
    var checked = {
      mode: rule.mode,
      keywords: clean(rule.keywords),
      people: clean(rule.people),
      exclusions: clean(rule.exclusions),
      wholeWords: rule.wholeWords !== false,
    };
    var excluded = Engine.excludedBy(checked, content);
    if (excluded !== null) return { ring: false, hit: null, reason: "it says " + quoted(excluded) + "." };
    var found = Engine.match(checked, content);
    if (!found) {
      var keywords = checked.keywords;
      var people = checked.people;
      var mentioned = people.filter(function (person) { return Engine.contains(text, person, true); });
      var reason;
      if (mentioned.length) reason = mentioned[0] + " is mentioned, not the sender.";
      else if (!keywords.length && !people.length) reason = "the rule has nothing to look for yet.";
      else if (!people.length) reason = "none of its words are in the message.";
      else if (!keywords.length) reason = "it isn't from " + joined(people, "or") + ".";
      else reason = "none of its words are in the message, and it isn't from " + joined(people, "or") + ".";
      return { ring: false, hit: null, reason: reason };
    }
    var h = hours(rule);
    if (h.enabled && !Engine.hoursContainDate(h, now)) {
      return {
        ring: false,
        now: true,
        hit: found.value,
        reason: "it's " + clockAt(now) + " on " + DAY_NAMES[now.getDay()] + ", outside " + span(h) + ".",
      };
    }
    var t = threshold(rule);
    if (t && rule.mode !== "everything") {
      return {
        ring: false,
        hit: null,
        reason: (found.kind === "word" ? "it says " + quoted(found.value) : "it matches") + ", which counts: it rings when that happens " +
          times(t.count) + " within " + minutesText(t.minutes) + (t.samePerson ? " from the same person." : "."),
      };
    }
    var because;
    if (found.kind === "word") because = "it says " + quoted(found.value) + ".";
    else if (found.kind === "person") because = "it's from " + found.value + ".";
    else if (checked.exclusions.length) because = "it doesn't say " + joined(checked.exclusions.map(quoted), "or") + ".";
    else because = "every notification does.";
    return { ring: true, hit: found.value, reason: because };
  }

  // For a rule that rings for every notification during its hours: the answer right now.
  function liveLine(rule, now) {
    var h = hours(rule);
    var at = "Right now, " + clockAt(now) + " on " + DAY_NAMES[now.getDay()] + ", it ";
    if (Engine.hoursContainDate(h, now)) return { ring: true, html: esc(at) + '<span class="verdict">would ring</span>.' };
    return { ring: false, html: esc(at) + '<span class="verdict">would stay quiet</span>: that\'s outside ' + esc(span(h)) + "." };
  }

  function answerHTML(result) {
    var label = result.ring ? "would ring" : result.now ? "would stay quiet now" : "would stay quiet";
    return '<span class="verdict">' + label + "</span>: " + esc(result.reason);
  }

  // ---------- Setting it up by hand ----------

  function sameWords(a, b) {
    var x = clean(a).map(Engine.fold).sort().join("\n");
    var y = clean(b).map(Engine.fold).sort().join("\n");
    return x === y;
  }

  // The rule as written in the app's own labels. When the app's ready-made rule already is this
  // rule (but for hours or Ring again), the steps change that one instead of adding another.
  function steps(rule, catalog) {
    var app = esc(rule.appName);
    var ready = catalog && catalog.ready ? catalog.ready[rule.appID] : null;
    var keywords = clean(rule.keywords);
    var people = clean(rule.people);
    var exclusions = clean(rule.exclusions);
    var h = hours(rule);
    var extras = [];
    if (h.enabled) {
      extras.push("Under <strong>When</strong>, turn on <strong>Only at certain times and days</strong>, then set <strong>From</strong> to " +
        clock(h.startMinute) + ", <strong>Until</strong> to " + clock(h.endMinute) + " and <strong>Days</strong> to " +
        esc(daysKey(h.weekdays) ? DAY_LABELS[daysKey(h.weekdays)] : shortDays(h.weekdays)) + ". " + PRO);
    }
    if (rule.repeatUntilStopped) extras.push("Turn on <strong>Ring again</strong>, below the Alarm settings. " + PRO);
    var t = threshold(rule);
    var repeats = t
      ? "Under <strong>Repeats</strong>, turn on <strong>Only when it comes again</strong>, then set it to " + t.count + " times and <strong>Within</strong> to " +
        minutesText(t.minutes) + ", and " + (t.samePerson ? "leave <strong>From the same person</strong> on." : "turn off <strong>From the same person</strong>.")
      : "";
    var list = ["In RingMeFor, open " + app + " from the Home screen. If it isn't there, tap <strong>Add Apps</strong> and add it: RingMeFor then shows how to add it to the RingMeFor shortcut."];
    var note = "";
    var readyT = ready && ready.threshold ? ready.threshold : null;
    var same = ready && ready.mode === rule.mode && !people.length &&
      sameWords(ready.keywords, keywords) && sameWords(ready.exclusions, exclusions) &&
      JSON.stringify(readyT) === JSON.stringify(t);
    if (same && !extras.length) {
      list.push("That's all: its ready-made rule, " + esc(ready.name) + ", already does this.");
    } else if (same) {
      list.push("Tap its ready-made rule, " + esc(ready.name) + ".");
      list = list.concat(extras, ["Tap <strong>Save</strong>."]);
    } else {
      list.push("Tap <strong>Add a Rule</strong>, and name it " + esc(rule.name || "New rule") + ".");
      if (rule.mode === "everything") list.push("Set <strong>Ring for</strong> to <strong>Every notification</strong>.");
      if (keywords.length) list.push("Under <strong>Words</strong>, add " + esc(joined(keywords, "and")) + ".");
      if (people.length) list.push("Under <strong>People</strong>, add " + esc(joined(people, "and")) + ".");
      if (exclusions.length) list.push("Under <strong>Never ring if it mentions</strong>, add " + esc(joined(exclusions, "and")) + ".");
      if (repeats) list.push(repeats);
      list = list.concat(extras, ["Tap <strong>Save</strong>."]);
      if (ready && !isPro(rule)) {
        note = "On the free version, an app rings only for its first rule. Before you add this one, open the app's ready-made rule, " +
          esc(ready.name) + ", and tap <strong>Delete Rule</strong>.";
      }
    }
    return "<h3>Set it up in RingMeFor</h3>" +
      '<ol class="fix">' + list.map(function (line) { return "<li><span>" + line + "</span></li>"; }).join("") + "</ol>" +
      (note ? '<p class="note">' + note + "</p>" : "");
  }

  // ---------- The link ----------

  // The rule as the app's SharedRule reads it (RuleLink.swift), keys sorted as the app writes
  // them. What's left out takes the app's default (no hours, whole words, no Ring again), which
  // keeps the link and its QR code short.
  function shared(rule) {
    var h = hours(rule);
    var result = {};
    if (h.enabled) result.activeHours = { enabled: true, endMinute: h.endMinute, startMinute: h.startMinute, weekdays: h.weekdays };
    result.appID = rule.appID;
    result.appName = rule.appName;
    if (clean(rule.exclusions).length) result.exclusions = clean(rule.exclusions);
    if (clean(rule.keywords).length) result.keywords = clean(rule.keywords);
    if (rule.mode === "everything") result.mode = "everything";
    result.name = rule.name || "Shared rule";
    if (clean(rule.people).length) result.people = clean(rule.people);
    if (rule.repeatUntilStopped) result.repeatUntilStopped = true;
    var t = threshold(rule);
    if (t) result.threshold = { count: t.count, minutes: t.minutes, samePerson: t.samePerson };
    return result;
  }

  function base64url(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function payload(rule) {
    return base64url(JSON.stringify(shared(rule)));
  }

  // Opens RingMeFor 1.0.1 or later with the rule, in its Shared Rule sheet.
  function appLink(rule) {
    return "ringmefor://rule?d=" + payload(rule);
  }

  // ---------- One rule's slab ----------

  function slab(rule, catalog, options) {
    var o = options || {};
    var id = "rule-" + rule.id;
    return '<article class="rule-slab" id="' + esc(id) + '" data-rule="' + esc(rule.id) + '">' +
      '<p class="rule-sentence">' + sentence(rule) + "</p>" +
      '<div class="rule-test"></div>' +
      '<div class="rule-actions">' +
        '<a class="button rule-add" href="' + esc(appLink(rule)) + '" aria-controls="' + esc(id) + '-qr">Add this rule</a>' +
        '<figure class="rule-qr" id="' + esc(id) + '-qr" hidden></figure>' +
        '<p class="rule-fallback" hidden>Nothing opened? <a data-config="store-link" href="' + esc(o.storeURL || "") + '">Get RingMeFor</a>, or update it, then tap Add again.</p>' +
        '<button type="button" class="rule-toggle" aria-expanded="false" aria-controls="' + esc(id) + '-steps">Set it up by hand</button>' +
      "</div>" +
      '<div class="rule-steps" id="' + esc(id) + '-steps">' + steps(rule, catalog) + "</div>" +
      "</article>";
  }

  // ---------- A shared rule (rule.html) ----------

  // What a shared rule does besides its sentence, in the app's words.
  function details(rule) {
    var lines = [];
    var patterns = clean(rule.patterns);
    if (patterns.length && rule.mode !== "everything") {
      lines.push("Its patterns: " + patterns.map(function (pattern) { return "<code>" + esc(pattern) + "</code>"; }).join(", ") +
        ". They can't be tested here; RingMeFor checks them.");
    }
    if (rule.wholeWords === false && rule.mode !== "everything") lines.push("Its words also match inside longer words.");
    if (+rule.cooldownMinutes > 0) lines.push("After an alarm, it stays quiet for " + minutesText(Math.round(+rule.cooldownMinutes)) + ".");
    if (+rule.countdownSeconds > 0) lines.push("It counts down " + Math.round(+rule.countdownSeconds) + " seconds before it rings.");
    if (rule.vibrateFirst === true) lines.push("It vibrates first.");
    return lines;
  }

  function sharedSlab(rule, link, options) {
    var o = options || {};
    var lines = details(rule);
    return '<article class="rule-slab" id="rule-shared">' +
      '<p class="rule-sentence">' + sentence(rule) + "</p>" +
      (lines.length ? '<ul class="rule-details">' + lines.map(function (line) { return "<li>" + line + "</li>"; }).join("") + "</ul>" : "") +
      '<div class="rule-test"></div>' +
      '<div class="rule-actions">' +
        '<a class="button rule-add" href="' + esc(link) + '" aria-controls="rule-shared-qr">Add to RingMeFor</a>' +
        '<figure class="rule-qr" id="rule-shared-qr" hidden></figure>' +
        '<p class="rule-fallback" hidden>Nothing opened? <a href="' + esc(o.storeURL || "./") + '">Get RingMeFor</a>, or update it, then tap Add again.</p>' +
      "</div>" +
      "</article>";
  }

  // Shows a rule from a link in `container`, with its test. Add opens the rule exactly as it was
  // shared (`encoded`, the link's base64url data); on a computer it shows this page's QR code.
  function showShared(container, rule, encoded, options) {
    var o = options || {};
    container.innerHTML = sharedSlab(rule, "ringmefor://rule?d=" + encoded, o);
    var computer = typeof matchMedia === "function" ? matchMedia("(hover: hover) and (pointer: fine)") : null;
    setUp(container.querySelector(".rule-slab"), rule, null, true, computer, document, { editable: false, qrLink: location.href });
  }

  // ---------- In the browser ----------

  function splitList(value) {
    var seen = {};
    return String(value).split(/[,，、\n]/).map(function (item) {
      return item.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, "");
    }).filter(function (item) {
      var key = Engine.fold(item);
      if (!item || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function start(doc) {
    var main = doc.getElementById("rulebook");
    var dataNode = doc.getElementById("rulebook-data");
    if (!main || !dataNode) return;
    var data;
    try {
      data = JSON.parse(dataNode.textContent);
    } catch (error) {
      return;
    }
    var catalog = data.catalog;
    var addOn = main.getAttribute("data-add") === "on";
    // A computer with a mouse or trackpad, where the ringmefor: link can't open anything.
    var computer = typeof matchMedia === "function" ? matchMedia("(hover: hover) and (pointer: fine)") : null;
    var byID = {};
    data.rules.forEach(function (rule) { byID[rule.id] = rule; });
    Array.prototype.forEach.call(main.querySelectorAll(".rule-slab"), function (node) {
      var rule = byID[node.getAttribute("data-rule")];
      if (rule) setUp(node, rule, catalog, addOn, computer, doc);
    });
  }

  function setUp(node, rule, catalog, addOn, computer, doc, options) {
    var o = options || {};
    var editable = o.editable !== false;
    var shape = rule.shape || shapeOf(rule);
    var sentenceNode = node.querySelector(".rule-sentence");
    var testNode = node.querySelector(".rule-test");
    var stepsNode = node.querySelector(".rule-steps");
    var add = node.querySelector(".rule-add");
    var toggle = node.querySelector(".rule-toggle");
    var fallback = node.querySelector(".rule-fallback");
    var qr = node.querySelector(".rule-qr");
    var input = null;
    var answerNode = null;
    var editing = null;
    var sent = [];
    var fallbackTimer = null;
    var qrTimer = null;

    function drawSentence(focusPart) {
      sentenceNode.innerHTML = sentence(rule, { editable: editable });
      if (focusPart) {
        var button = sentenceNode.querySelector('[data-part="' + focusPart + '"]');
        if (button) button.focus();
      }
      refresh();
    }

    // The QR code of the rule page's link with this rule, for a computer: the iPhone's camera
    // opens it in Safari, whose Add button opens RingMeFor.
    function drawQR() {
      if (!qr || qr.hidden || typeof QR === "undefined") return;
      var link = o.qrLink || new URL("rule.html#d=" + payload(rule), location.href).href;
      qr.innerHTML = QR.svg(link, "QR code that opens this rule on your iPhone") +
        "<figcaption>Scan this with your iPhone's camera to open the rule there, then tap Add.</figcaption>";
    }

    function drawLinks() {
      if (add) add.href = appLink(rule);
      if (stepsNode) stepsNode.innerHTML = steps(rule, catalog);
      clearTimeout(qrTimer);
      qrTimer = setTimeout(drawQR, 250);
    }

    // The answer, the ringing slab and the word that made it ring.
    function refresh() {
      var ring = false;
      var hit = null;
      if (input && answerNode) {
        var result = verdict(rule, input.value, new Date());
        answerNode.innerHTML = result ? answerHTML(result) : "";
        if (result && result.ring) {
          ring = true;
          hit = result.hit;
        }
      } else if (answerNode && hasCounter(rule, shape)) {
        var t = threshold(rule);
        var now = Date.now();
        sent = sent.filter(function (time) { return now - time < t.minutes * 60000; });
        if (!sent.length) {
          answerNode.innerHTML = "";
        } else if (sent.length >= t.count) {
          ring = true;
          answerNode.innerHTML = '<span class="verdict">would ring</span>: that\'s ' + sent.length + " within " + esc(minutesText(t.minutes)) + ".";
        } else {
          answerNode.innerHTML = '<span class="verdict">would stay quiet</span>: that\'s ' + sent.length + " of " + t.count + " within " + esc(minutesText(t.minutes)) + ".";
        }
      } else if (answerNode) {
        answerNode.innerHTML = liveLine(rule, new Date()).html;
      }
      node.classList.toggle("ringing", ring);
      Array.prototype.forEach.call(sentenceNode.querySelectorAll(".term"), function (term) {
        term.classList.toggle("hit", hit !== null && term.getAttribute("data-term") === hit);
      });
    }

    function fieldFor(kind) {
      var h = hours(rule);
      if (kind === "app") {
        var html = '<select class="field" aria-label="App">';
        catalog.categories.forEach(function (category) {
          html += '<optgroup label="' + esc(category.title) + '">';
          catalog.apps.forEach(function (app) {
            if (app.category !== category.id) return;
            html += '<option value="' + esc(app.id) + '"' + (app.id === rule.appID ? " selected" : "") + ">" + esc(app.name) + "</option>";
          });
          html += "</optgroup>";
        });
        return html + "</select>";
      }
      if (kind === "keywords" || kind === "people" || kind === "exclusions") {
        var value = clean(rule[kind]).join(", ");
        var label = kind === "people" ? "Names, separated by commas" : "Words, separated by commas";
        return '<input class="field" type="text" value="' + esc(value) + '" aria-label="' + label + '" size="' +
          Math.max(6, Math.min(36, value.length + 1)) + '" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">';
      }
      if (kind === "start" || kind === "end") {
        var minute = kind === "start" ? h.startMinute : h.endMinute;
        return '<input class="field" type="time" value="' + pad(Math.floor(minute / 60)) + ":" + pad(minute % 60) +
          '" aria-label="' + (kind === "start" ? "From" : "Until") + '">';
      }
      if (kind === "count" || kind === "minutes") {
        var t = threshold(rule) || { count: 3, minutes: 5 };
        var choices = kind === "count" ? [2, 3, 4, 5, 6, 7, 8, 9, 10] : REPEAT_MINUTES;
        var currentValue = kind === "count" ? t.count : t.minutes;
        return '<select class="field" aria-label="' + (kind === "count" ? "How many times" : "Within") + '">' + choices.map(function (choice) {
          return '<option value="' + choice + '"' + (choice === currentValue ? " selected" : "") + ">" +
            (kind === "count" ? times(choice) : minutesText(choice)) + "</option>";
        }).join("") + "</select>";
      }
      if (kind === "days") {
        var current = daysKey(h.weekdays) || "every";
        return '<select class="field" aria-label="Days">' + ["every", "weekdays", "weekends"].map(function (key) {
          return '<option value="' + key + '"' + (key === current ? " selected" : "") + ">" + DAY_LABELS[key] + "</option>";
        }).join("") + "</select>";
      }
      return "";
    }

    function apply(kind, value) {
      if (kind === "app") {
        var app = catalog.apps.filter(function (item) { return item.id === value; })[0];
        if (app) {
          rule.appID = app.id;
          rule.appName = app.name;
          sent = [];
        }
      } else if (kind === "keywords" || kind === "people" || kind === "exclusions") {
        rule[kind] = splitList(value);
      } else if (kind === "start" || kind === "end") {
        var time = /^(\d{1,2}):(\d{2})/.exec(value);
        if (time) {
          rule.activeHours = hours(rule);
          rule.activeHours[kind === "start" ? "startMinute" : "endMinute"] = Math.min(23, +time[1]) * 60 + Math.min(59, +time[2]);
        }
      } else if ((kind === "count" || kind === "minutes") && threshold(rule)) {
        rule.threshold = threshold(rule);
        rule.threshold[kind] = +value;
        sent = [];
      } else if (kind === "days" && DAY_SETS[value]) {
        rule.activeHours = hours(rule);
        rule.activeHours.weekdays = DAY_SETS[value].slice();
      }
    }

    function edit(kind) {
      if (editing) return;
      editing = kind;
      sentenceNode.innerHTML = sentence(rule, { editable: true, editing: kind, field: fieldFor(kind) });
      var field = sentenceNode.querySelector(".field");
      if (!field) {
        editing = null;
        drawSentence();
        return;
      }
      var done = false;
      var before = field.value;
      function finish(save) {
        if (done) return;
        done = true;
        var changed = save && field.value !== before;
        if (changed) apply(kind, field.value);
        editing = null;
        drawSentence(kind);
        if (changed) drawLinks();
      }
      field.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      });
      if (field.tagName === "SELECT") field.addEventListener("change", function () { finish(true); });
      field.addEventListener("blur", function () { finish(true); });
      field.focus();
      if (field.type === "text") field.select();
    }

    sentenceNode.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest("[data-part]") : null;
      if (target && sentenceNode.contains(target)) edit(target.getAttribute("data-part"));
    });
    sentenceNode.addEventListener("keydown", function (event) {
      var target = event.target;
      if ((event.key === "Enter" || event.key === " ") && target.getAttribute && target.getAttribute("data-part")) {
        event.preventDefault();
        edit(target.getAttribute("data-part"));
      }
    });

    // The tester, or for a rule that rings for every notification in its hours, a live line.
    if (hasTester(shape)) {
      var samples = (rule.samples || []).map(function (sample, index) {
        return '<button type="button" class="sample" data-sample="' + index + '">' + esc(quoted(sample.text)) + "</button>";
      }).join("");
      var fieldID = "test-" + rule.id;
      testNode.innerHTML = '<label class="sr-only" for="' + esc(fieldID) + '">Type a message to test it</label>' +
        '<input class="tester" id="' + esc(fieldID) + '" type="text" placeholder="Type a message to test it" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done">' +
        (samples ? '<div class="try"><span>Try</span><div class="samples">' + samples + "</div></div>" : "") +
        '<p class="answer" aria-live="polite"></p>';
      input = testNode.querySelector("input");
      answerNode = testNode.querySelector(".answer");
      input.addEventListener("input", refresh);
      testNode.addEventListener("click", function (event) {
        var button = event.target.closest ? event.target.closest("[data-sample]") : null;
        if (!button) return;
        input.value = rule.samples[+button.getAttribute("data-sample")].text;
        refresh();
      });
    } else if (hasCounter(rule, shape)) {
      var verb = repeatVerb(rule);
      var label = verb === "calls" ? "Make a test call" : verb === "texts" ? "Send a test text" : "Send a test notification";
      testNode.innerHTML = '<button type="button" class="test-send">' + label + "</button>" +
        '<p class="answer" aria-live="polite"></p>';
      answerNode = testNode.querySelector(".answer");
      testNode.querySelector(".test-send").addEventListener("click", function () {
        sent.push(Date.now());
        refresh();
      });
    } else if (rule.mode === "everything" && shape.hours) {
      testNode.innerHTML = '<p class="answer live"></p>';
      answerNode = testNode.querySelector(".answer");
      setInterval(refresh, 30000);
    }

    // Add: on a computer, the QR code; on the iPhone, RingMeFor. If the page is still in front
    // two seconds later, nothing opened it.
    if (add) {
      add.addEventListener("click", function (event) {
        if (computer && computer.matches && qr && typeof QR !== "undefined") {
          event.preventDefault();
          qr.hidden = !qr.hidden;
          add.setAttribute("aria-expanded", String(!qr.hidden));
          drawQR();
          return;
        }
        clearTimeout(fallbackTimer);
        fallback.hidden = true;
        fallbackTimer = setTimeout(function () {
          if (doc.visibilityState === "visible") fallback.hidden = false;
        }, 2000);
      });
      doc.addEventListener("visibilitychange", function () {
        if (doc.visibilityState === "hidden") {
          clearTimeout(fallbackTimer);
          fallback.hidden = true;
        }
      });
    }

    // With the Add button, the by-hand steps open on request; without it, they're the way in.
    if (addOn && toggle) {
      stepsNode.hidden = true;
      toggle.addEventListener("click", function () {
        var open = stepsNode.hidden;
        stepsNode.hidden = !open;
        toggle.setAttribute("aria-expanded", String(open));
      });
    }

    drawSentence();
  }

  return {
    clock: clock,
    daysPhrase: daysPhrase,
    shapeOf: shapeOf,
    hasTester: hasTester,
    hasCounter: hasCounter,
    threshold: threshold,
    isPro: isPro,
    sentence: sentence,
    verdict: verdict,
    liveLine: liveLine,
    steps: steps,
    shared: shared,
    payload: payload,
    appLink: appLink,
    slab: slab,
    splitList: splitList,
    start: start,
    details: details,
    showShared: showShared,
  };
});
