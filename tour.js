// Show me the app: the chapter on screen rings, and its screen shows in the phone. While the
// section is in view the tour plays by itself, one chapter every few seconds, until the visitor
// picks one (or asks for less motion). A video can take the screens' place later: its chapters
// then follow its time.
(function () {
  var tour = document.querySelector(".tour");
  if (!tour) return;
  var items = Array.prototype.slice.call(tour.querySelectorAll(".tour-item"));
  var shots = Array.prototype.slice.call(tour.querySelectorAll(".tour-phone .phone-screen img"));
  var phone = tour.querySelector(".tour-phone");
  var STEP = 5000;
  var current = 0, timer = null, inView = false, stopped = false;
  var lessMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var narrow = window.matchMedia("(max-width: 900px)");

  tour.style.setProperty("--tour-step", STEP / 1000 + "s");

  function show(index) {
    current = index;
    items.forEach(function (item, k) { item.setAttribute("aria-pressed", k === index ? "true" : "false"); });
    shots.forEach(function (shot, k) { shot.classList.toggle("is-on", k === index); });
    // The Lock Screen capture shows its own island, with the lock in it.
    phone.classList.toggle("no-island", shots[index].getAttribute("data-island") === "off");
    // Restart the chapter's time bar.
    tour.classList.remove("is-playing");
    void tour.offsetWidth;
    if (playing()) tour.classList.add("is-playing");
  }

  function playing() { return inView && !stopped && !lessMotion.matches && !narrow.matches; }

  function schedule() {
    clearTimeout(timer);
    if (!playing()) { tour.classList.remove("is-playing"); return; }
    tour.classList.add("is-playing");
    timer = setTimeout(function () { show((current + 1) % items.length); schedule(); }, STEP);
  }

  items.forEach(function (item, k) {
    item.addEventListener("click", function () {
      if (narrow.matches) return;
      stopped = true;
      clearTimeout(timer);
      show(k);
      tour.classList.remove("is-playing");
    });
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      schedule();
    }, { threshold: 0.45 }).observe(tour.querySelector(".tour-body"));
  }
  if (lessMotion.addEventListener) lessMotion.addEventListener("change", schedule);
  if (narrow.addEventListener) narrow.addEventListener("change", schedule);
})();
