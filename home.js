// The first screen: three notifications stay quiet, the one with the word in it rings, and the
// whole screen rings until Stop. It plays once on load, then only when the visitor types a word.
(function () {
  "use strict";

  var first = document.querySelector(".first");
  if (!first) return;

  var box = first.querySelector(".sentence-box");
  var sentence = first.querySelector(".sentence");
  var input = first.querySelector("#word");
  var field = first.querySelector(".word-field");
  var ringWord = first.querySelector(".word-ring");
  var stack = first.querySelector(".stack");
  var row = first.querySelector(".alarm-row");
  var stopButton = row.querySelector(".stop");
  var snoozeButton = row.querySelector(".snooze");
  var hearButton = row.querySelector(".hear");
  var invite = row.querySelector(".invite");
  var status = first.querySelector("[role=status]");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  // One example per visit, in turn. [tile letter, app and sender, message]
  var EXAMPLES = [
    { word: "outage",
      quiet: [["S", "Slack, #random", "Anyone up for lunch?"], ["G", "Gmail", "Weekly digest: your top stories"], ["O", "Outlook", "Room booking confirmed"]],
      ring: ["S", "Slack, #incidents", "Checkout outage, paging on call"] },
    { word: "Priya",
      quiet: [["S", "Slack, #design", "New mockups are up for review"], ["G", "Gmail", "Your receipt for October"], ["T", "Microsoft Teams, #general", "Holiday rota posted"]],
      ring: ["S", "Slack, Priya Shah", "Are you around? Need you on the checkout fix"] },
    { word: "moved up",
      quiet: [["S", "Slack, #random", "Cake in the kitchen"], ["O", "Outlook", "Your weekly report is ready"], ["G", "Gmail", "Webinar starts Thursday"]],
      ring: ["T", "Microsoft Teams, Alex Morgan", "Client call moved up. Join ASAP?"] },
    { word: "gate change",
      quiet: [["G", "Gmail", "Check-in is open for your flight"], ["S", "Slack, #travel", "Safe travels!"], ["O", "Outlook", "Out of office until Monday"]],
      ring: ["G", "Gmail, Trip update", "Gate change: your flight now boards at B12"] },
    { word: "price alert",
      quiet: [["G", "Gmail", "Your monthly statement is ready"], ["S", "Slack, #trading", "Morning, all"], ["O", "Outlook", "Compliance training due Friday"]],
      ring: ["T", "TradingView", "Price alert: EUR/USD crossed 1.1000"] }
  ];

  function pickExample() {
    var asked = /[?&]example=(\d)/.exec(location.search);
    if (asked && EXAMPLES[+asked[1]]) return EXAMPLES[+asked[1]];
    var index = 0;
    try {
      var last = parseInt(localStorage.getItem("ringmefor.example"), 10);
      index = isNaN(last) ? 0 : (last + 1) % EXAMPLES.length;
      localStorage.setItem("ringmefor.example", String(index));
    } catch (e) {
      index = 0;
    }
    return EXAMPLES[index];
  }

  var example = pickExample();
  var word = example.word;
  var state = "intro"; // intro, ringing, snoozed, stopped
  var current = null; // the slab that rings
  var timers = [];
  var commitTimer = null;
  var audio = null;

  function after(ms, fn) {
    timers.push(window.setTimeout(fn, ms));
  }

  function cancelTimers() {
    timers.forEach(window.clearTimeout);
    timers = [];
  }

  // ----- The sentence -----

  var measure = document.createElement("span");
  measure.className = "measure";
  measure.setAttribute("aria-hidden", "true");
  sentence.appendChild(measure);

  function sizeInput() {
    measure.textContent = input.value || " ";
    input.style.width = Math.ceil(measure.getBoundingClientRect().width) + 2 + "px";
  }

  // Keeps the sentence inside the height reserved for it: a long word makes it smaller, not taller.
  function fit() {
    sentence.style.fontSize = "";
    if (!field.hidden) sizeInput();
    var size = parseFloat(window.getComputedStyle(sentence).fontSize);
    var limit = box.clientHeight;
    var guard = 0;
    while (guard++ < 80 && size > 28 &&
           (sentence.offsetHeight > limit + 1 || sentence.scrollWidth > sentence.clientWidth + 1)) {
      size -= 2;
      sentence.style.fontSize = size + "px";
      if (!field.hidden) sizeInput();
    }
  }

  function showField(show) {
    if (!show) ringWord.textContent = "“" + word + "”";
    field.hidden = !show;
    ringWord.hidden = show;
  }

  // ----- The stack -----

  function makeSlab(spec) {
    var li = document.createElement("li");
    li.className = "slab";
    [["tile", spec[0]], ["app", spec[1]], ["note", ""], ["msg", spec[2]]].forEach(function (part) {
      var span = document.createElement("span");
      span.className = part[0];
      span.textContent = part[1];
      li.appendChild(span);
    });
    return li;
  }

  function arrive(li) {
    while (stack.children.length >= 4) stack.removeChild(stack.firstElementChild);
    stack.appendChild(li);
    li.getBoundingClientRect();
    li.classList.add("in");
  }

  function note(li, text) {
    li.querySelector(".note").textContent = text;
  }

  // ----- Ringing -----

  function setGround(ringing) {
    first.setAttribute("data-state", ringing ? "ringing" : "quiet");
  }

  function showControls(on) {
    row.hidden = false;
    stopButton.hidden = !on;
    snoozeButton.hidden = !on;
    hearButton.hidden = !on;
    invite.hidden = on;
  }

  function ring(li) {
    var hadFocus = document.activeElement === input;
    if (hadFocus) stopButton.hidden = false;
    current = li;
    state = "ringing";
    li.classList.add("ringing");
    note(li, "");
    showControls(true);
    if (hadFocus) stopButton.focus();
    showField(false);
    setGround(true);
    fit();
    status.textContent = "Ringing for “" + word + "”.";
  }

  function snooze() {
    stopSound();
    cancelTimers();
    state = "snoozed";
    current.classList.remove("ringing");
    note(current, "snoozed");
    setGround(false);
    fit();
    status.textContent = "Snoozed. It rings again in 5 seconds.";
    after(5000, function () {
      if (state === "snoozed") ring(current);
    });
  }

  function stop() {
    var focusWasInRow = row.contains(document.activeElement);
    stopSound();
    cancelTimers();
    state = "stopped";
    if (current) {
      current.classList.remove("ringing");
      note(current, "stopped");
    }
    setGround(false);
    showField(true);
    fit();
    invite.textContent = "Stopped. Change “" + word + "” to a word of yours, and the next notification will have it.";
    showControls(false);
    status.textContent = focusWasInRow ? "" : "Stopped.";
    if (focusWasInRow) invite.focus();
  }

  // ----- The visitor's word -----

  function commit() {
    window.clearTimeout(commitTimer);
    var typed = input.value.replace(/\s+/g, " ").trim();
    if (!typed || state === "ringing" || state === "snoozed") return;
    word = typed;
    invite.hidden = true;
    var li = makeSlab(["S", "Slack, #team", "Heads-up: " + typed]);
    arrive(li);
    after(reduced.matches ? 0 : 260, function () { ring(li); });
  }

  input.addEventListener("input", function () {
    if (state === "intro") {
      // The visitor started before the example rang: the example stops where it is.
      cancelTimers();
      Array.prototype.forEach.call(stack.children, function (li) {
        if (!li.querySelector(".note").textContent) note(li, "stayed quiet");
      });
      state = "stopped";
    }
    fit();
    window.clearTimeout(commitTimer);
    commitTimer = window.setTimeout(commit, 1200);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  });

  input.addEventListener("blur", function () {
    if (!input.value.trim()) {
      input.value = word;
      fit();
    }
  });

  // ----- Hear it: the app's default alarm sound, only after a press -----

  function stopSound() {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    hearButton.setAttribute("aria-pressed", "false");
  }

  hearButton.addEventListener("click", function () {
    if (audio && !audio.paused) {
      stopSound();
      return;
    }
    if (!audio) {
      audio = new Audio("sounds/ringmefor.mp3");
      audio.addEventListener("ended", function () { hearButton.setAttribute("aria-pressed", "false"); });
    }
    audio.currentTime = 0;
    var playing = audio.play();
    if (playing && playing.catch) playing.catch(function () { hearButton.setAttribute("aria-pressed", "false"); });
    hearButton.setAttribute("aria-pressed", "true");
  });

  stopButton.addEventListener("click", stop);
  snoozeButton.addEventListener("click", snooze);

  // ----- Start -----

  function intro() {
    Array.prototype.slice.call(stack.querySelectorAll(".static")).forEach(function (li) { li.remove(); });
    var step = 750;
    example.quiet.forEach(function (spec, i) {
      after(450 + i * step, function () {
        var li = makeSlab(spec);
        arrive(li);
        after(420, function () { note(li, "stayed quiet"); });
      });
    });
    after(450 + 3 * step + 250, function () {
      var li = makeSlab(example.ring);
      arrive(li);
      ring(li);
    });
  }

  input.value = word;
  sizeInput();
  fit();
  intro();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fit);
  }

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(fit, 100);
  });
})();
