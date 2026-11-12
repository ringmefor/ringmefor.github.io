// Light and dark. The page follows the system setting until the visitor picks Light or Dark: with
// the button in the header (it switches to the other one) or the Appearance choice in the footer,
// which can also go back to System. The choice is kept in this browser's localStorage under
// "ringmefor-theme" and sent nowhere. The inline script in each page's <head> applies a kept
// choice before the page draws, so it doesn't flash; this file keeps the controls in step.
(function () {
  "use strict";
  var KEY = "ringmefor-theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : "system";
    } catch (error) {
      return "system";
    }
  }

  function store(choice) {
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch (error) {
      // Private browsing or blocked storage: the choice lasts for this page only.
    }
  }

  // The look on screen: the choice, or the system's for System.
  function shown(choice) {
    if (choice !== "system") return choice;
    return media && media.matches ? "dark" : "light";
  }

  var current = stored();

  function apply(choice) {
    current = choice;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    var dark = shown(choice) === "dark";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute("content", dark ? "#000000" : "#f2f2f7");
    var toggles = document.querySelectorAll(".theme-toggle");
    for (var j = 0; j < toggles.length; j++) {
      toggles[j].setAttribute("aria-pressed", dark ? "true" : "false");
      toggles[j].setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
    }
    var radios = document.querySelectorAll('.appearance input[name="appearance"]');
    for (var k = 0; k < radios.length; k++) radios[k].checked = radios[k].value === choice;
  }

  function choose(choice) {
    store(choice);
    apply(choice);
  }

  document.addEventListener("click", function (event) {
    var toggle = event.target.closest && event.target.closest(".theme-toggle");
    if (!toggle) return;
    choose(shown(current) === "dark" ? "light" : "dark");
  });

  document.addEventListener("change", function (event) {
    var input = event.target;
    if (input && input.name === "appearance") choose(input.value);
  });

  // The system switching to dark at sunset, while the page follows it.
  if (media) {
    var follow = function () { if (current === "system") apply("system"); };
    if (media.addEventListener) media.addEventListener("change", follow);
    else if (media.addListener) media.addListener(follow);
  }

  // A choice made in another tab of this site.
  window.addEventListener("storage", function (event) {
    if (event.key === KEY || event.key === null) apply(stored());
  });

  apply(current);
})();
