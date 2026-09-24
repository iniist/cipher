/*!
 * cipher — Skript fuer den Rundgang (rundgang.html)
 *
 * Nur Bewegung, keine Inhalte: ohne dieses Skript steht alles sofort und
 * vollstaendig da. Es laeuft synchron im Kopf, setzt dort die Klasse "js"
 * (damit das Einblenden ohne Aufblitzen beginnt) und erledigt den Rest,
 * sobald das Dokument steht. Keine Anfragen, kein Speicher.
 */
(function (window, document) {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Elemente beim Hineinscrollen einblenden, Geschwister leicht versetzt. */
  function reveal() {
    var items = document.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("in"); });
      return;
    }
    // Versatz je Position unter Geschwistern, damit Karten nacheinander kommen.
    items.forEach(function (item) {
      var siblings = Array.prototype.filter.call(item.parentNode.children, function (el) {
        return el.classList.contains("reveal");
      });
      var index = siblings.indexOf(item);
      if (index > 0) item.style.setProperty("--delay", Math.min(index, 6) * 0.08 + "s");
    });
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
        var number = entry.target.querySelector("[data-count]");
        if (number) countUp(number);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (item) { observer.observe(item); });
  }

  /** Eine Zahl von 0 hochzaehlen. */
  function countUp(element) {
    var target = Number(element.dataset.count);
    if (!target) return;
    var start = null;
    var duration = 1100;
    function frame(time) {
      if (start === null) start = time;
      var t = Math.min(1, (time - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      element.textContent = String(Math.round(target * eased));
      if (t < 1) window.requestAnimationFrame(frame);
    }
    element.textContent = "0";
    window.requestAnimationFrame(frame);
  }

  /** Glutfunken, die vom unteren Rand aufsteigen. */
  function embers() {
    var box = document.getElementById("embers");
    if (!box || reduce) return;
    var count = window.innerWidth < 600 ? 14 : 26;
    for (var i = 0; i < count; i++) {
      var span = document.createElement("span");
      span.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "%");
      span.style.setProperty("--s", (2 + Math.random() * 4).toFixed(1) + "px");
      span.style.setProperty("--t", (9 + Math.random() * 10).toFixed(1) + "s");
      span.style.setProperty("--d", (-Math.random() * 18).toFixed(1) + "s");
      span.style.setProperty("--drift", (Math.random() * 120 - 60).toFixed(0) + "px");
      box.appendChild(span);
    }
  }

  /** Balken oben: wie weit gelesen. */
  function progress() {
    var bar = document.getElementById("progress");
    if (!bar) return;
    var pending = false;
    function update() {
      pending = false;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      bar.style.transform = "scaleX(" + ratio.toFixed(4) + ")";
    }
    window.addEventListener("scroll", function () {
      if (!pending) { pending = true; window.requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /** Telefonbilder kippen leicht zum Zeiger hin — nur mit Maus. */
  function tilt() {
    if (reduce || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.querySelectorAll(".tilt").forEach(function (element) {
      element.addEventListener("pointermove", function (event) {
        var rect = element.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width - 0.5;
        var y = (event.clientY - rect.top) / rect.height - 0.5;
        element.style.setProperty("--ry", (x * 10).toFixed(2) + "deg");
        element.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg");
      });
      element.addEventListener("pointerleave", function () {
        element.style.setProperty("--ry", "0deg");
        element.style.setProperty("--rx", "0deg");
      });
    });
  }

  /**
   * Foerderplan: zwischen „Sichern“ und „Summe“ wechseln. Von selbst im
   * Takt, solange der Plan zu sehen ist; ein Klick uebernimmt die Wahl
   * und haelt den Takt an.
   */
  function planSwap() {
    var box = document.getElementById("planSwap");
    if (!box) return;
    var buttons = box.querySelectorAll("[data-plan]");
    var images = box.querySelectorAll("[data-plan-img]");
    var current = "sichern";
    var timer = null;

    function show(which) {
      current = which;
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.plan === which));
      });
      images.forEach(function (image) {
        image.classList.toggle("is-on", image.dataset.planImg === which);
      });
    }
    function stop() { if (timer) { window.clearInterval(timer); timer = null; } }
    function start() {
      if (reduce || timer) return;
      timer = window.setInterval(function () {
        show(current === "sichern" ? "summe" : "sichern");
      }, 3200);
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        stop();
        box.dataset.manual = "1";
        show(button.dataset.plan);
      });
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (box.dataset.manual) return;
          if (entry.isIntersecting) start(); else stop();
        });
      }, { threshold: 0.4 }).observe(box);
    }
  }

  /** Themes-Faecher: der Reihe nach je eines hervorheben, solange sichtbar. */
  function fan() {
    var box = document.getElementById("fan");
    if (!box || reduce) return;
    var cards = box.querySelectorAll("figure");
    var index = -1;
    var timer = null;
    var hovering = false;

    function step() {
      if (hovering) return;
      cards.forEach(function (card) { card.classList.remove("lit"); });
      index = (index + 1) % cards.length;
      cards[index].classList.add("lit");
    }
    box.addEventListener("pointerenter", function () {
      hovering = true;
      cards.forEach(function (card) { card.classList.remove("lit"); });
    });
    box.addEventListener("pointerleave", function () { hovering = false; });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !timer) {
            timer = window.setInterval(step, 1500);
          } else if (!entry.isIntersecting && timer) {
            window.clearInterval(timer);
            timer = null;
          }
        });
      }, { threshold: 0.5 }).observe(box);
    }
  }

  function init() {
    reveal();
    embers();
    progress();
    tilt();
    planSwap();
    fan();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window, document);
