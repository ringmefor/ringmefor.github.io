// Links within the page: an eased scroll instead of a jump, then the section's heading is
// underlined in indigo for a moment, the way the first screen underlines the word it rings for.
// With less motion asked for, the page jumps as before. Help's questions open when linked to.
(function () {
  "use strict";
  var lessMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var running = null;

  // Eases in, then settles gently (easeInOutCubic).
  function ease(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function targetFor(link) {
    if (link.target && link.target !== "_self") return null;
    var url = new URL(link.href, location.href);
    if (!url.hash || url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return null;
    var id = decodeURIComponent(url.hash.slice(1));
    return id ? document.getElementById(id) : null;
  }

  function headingOf(target) {
    if (/^H[1-3]$/.test(target.tagName)) return target;
    if (target.tagName === "DETAILS") return null;
    return target.querySelector("h2, h3");
  }

  function mark(target) {
    var heading = headingOf(target);
    if (!heading || lessMotion.matches) return;
    heading.classList.remove("arrived");
    void heading.offsetWidth;
    heading.classList.add("arrived");
    setTimeout(function () { heading.classList.remove("arrived"); }, 2400);
  }

  function arrive(target) {
    if (target.tagName === "DETAILS") target.open = true;
    if (!target.hasAttribute("tabindex") && !/^(A|BUTTON|INPUT|SUMMARY|DETAILS)$/.test(target.tagName)) {
      target.setAttribute("tabindex", "-1");
    }
    target.focus({ preventScroll: true });
    mark(target);
  }

  function scrollTo(target) {
    var margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    var start = window.scrollY;
    var end = Math.max(0, Math.min(target.getBoundingClientRect().top + start - margin,
      document.documentElement.scrollHeight - window.innerHeight));
    var distance = end - start;
    if (running) cancelAnimationFrame(running.frame);
    if (lessMotion.matches || Math.abs(distance) < 2) {
      window.scrollTo(0, end);
      arrive(target);
      return;
    }
    // Longer trips take a little longer, never more than about a second.
    var duration = Math.min(1050, 420 + Math.sqrt(Math.abs(distance)) * 9);
    var began = null;
    running = { frame: 0 };
    var stop = function () { if (running) { cancelAnimationFrame(running.frame); running = null; } };
    // A wheel or touch from the visitor takes over at once.
    window.addEventListener("wheel", stop, { once: true, passive: true });
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    function step(now) {
      if (!running) return;
      if (began === null) began = now;
      var t = Math.min(1, (now - began) / duration);
      window.scrollTo(0, start + distance * ease(t));
      if (t < 1) {
        running.frame = requestAnimationFrame(step);
      } else {
        running = null;
        window.removeEventListener("wheel", stop);
        window.removeEventListener("touchstart", stop);
        arrive(target);
      }
    }
    running.frame = requestAnimationFrame(step);
  }

  document.addEventListener("click", function (event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var link = event.target.closest && event.target.closest("a[href*='#']");
    if (!link) return;
    var target = targetFor(link);
    if (!target) return;
    event.preventDefault();
    if (location.hash !== "#" + target.id) history.pushState(null, "", "#" + target.id);
    scrollTo(target);
  });

  // Arriving from another page (index.html#price): the browser has already scrolled there.
  if (location.hash) {
    var first = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (first) window.addEventListener("load", function () { mark(first); }, { once: true });
  }
})();
