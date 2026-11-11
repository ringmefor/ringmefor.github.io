// Help: the search field filters the page as you type, and a link to a question opens it.
(function () {
  "use strict";
  var main = document.querySelector(".help");
  if (!main) return;

  // A link to a question (help.html#person-rule) opens that question.
  function openTarget() {
    var id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    var target = document.getElementById(id);
    if (target && target.tagName === "DETAILS") {
      target.open = true;
      target.scrollIntoView();
    }
  }
  openTarget();
  window.addEventListener("hashchange", openTarget);

  // Search: hides what doesn't match, opens what does. Accents and capitals don't matter.
  var input = document.getElementById("help-search");
  var empty = main.querySelector(".search-empty");
  var parts = Array.prototype.slice.call(main.querySelectorAll(".help-part"));
  var slabs = Array.prototype.slice.call(main.querySelectorAll("details"));
  var openedBySearch = [];

  function fold(text) {
    return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  slabs.forEach(function (d) { d.dataset.text = fold(d.textContent); });
  parts.forEach(function (p) { p.dataset.text = fold(p.textContent); });

  function show(element, visible) {
    element.hidden = !visible;
  }

  function filter() {
    var query = fold(input.value.trim());
    openedBySearch.forEach(function (d) { d.open = false; });
    openedBySearch = [];
    var found = 0;
    parts.forEach(function (part) {
      var details = Array.prototype.slice.call(part.querySelectorAll("details"));
      if (!query) {
        show(part, true);
        details.forEach(function (d) { show(d, true); });
        part.querySelectorAll(".group, .faq").forEach(function (g) { show(g, true); });
        return;
      }
      if (details.length) {
        var any = false;
        details.forEach(function (d) {
          var match = d.dataset.text.indexOf(query) >= 0;
          show(d, match);
          if (match) {
            any = true;
            found++;
            if (!d.open) { d.open = true; openedBySearch.push(d); }
          }
        });
        // A group heading shows only while one of its questions does.
        part.querySelectorAll(".group").forEach(function (heading) {
          var list = heading.nextElementSibling;
          var visible = list && list.querySelector("details:not([hidden])");
          show(heading, !!visible);
          if (list) show(list, !!visible);
        });
        var headingMatches = fold(part.querySelector("h2").textContent).indexOf(query) >= 0;
        show(part, any || headingMatches);
        if (headingMatches && !any) {
          details.forEach(function (d) { show(d, true); });
          part.querySelectorAll(".group, .faq").forEach(function (g) { show(g, true); });
          found++;
        }
      } else {
        var match = part.dataset.text.indexOf(query) >= 0;
        show(part, match);
        if (match) found++;
      }
    });
    empty.textContent = "";
    if (query && !found) {
      empty.appendChild(document.createTextNode("Nothing here mentions “" + input.value.trim() + "”. "));
      var mail = document.createElement("a");
      mail.href = "mailto:lancemikaelo.enriquez@gmail.com?subject=RingMeFor%20support";
      mail.textContent = "Email me";
      empty.appendChild(mail);
      empty.appendChild(document.createTextNode(" and I'll answer."));
    }
  }

  input.addEventListener("input", filter);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      filter();
    }
  });
})();
