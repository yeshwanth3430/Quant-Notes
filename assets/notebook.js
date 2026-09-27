// Quant Notes — shared behaviour: theme toggle + KaTeX auto-render.

(function () {
  var KEY = "qn-theme";
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  var t = saved();
  if (t) document.documentElement.setAttribute("data-theme", t);

  window.toggleTheme = function () {
    var cur = document.documentElement.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    save(next);
  };

  // Render $...$ inline and $$...$$ display math once KaTeX has loaded.
  window.addEventListener("load", function () {
    if (window.renderMathInElement) {
      renderMathInElement(document.body, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "\\[", right: "\\]", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false }
        ],
        throwOnError: false
      });
    }
  });
})();

// Notes / Examples tabs. Markup: .tabs button[data-tab] + .tab-panel[data-panel].
// The open tab is kept in the URL hash (#examples) so it survives reloads and can be linked.
(function () {
  function init() {
    var btns = document.querySelectorAll(".tabs button[data-tab]");
    if (!btns.length) return;
    function show(name, scroll) {
      var found = false;
      btns.forEach(function (b) { if (b.dataset.tab === name) found = true; });
      if (!found) name = btns[0].dataset.tab;
      btns.forEach(function (b) { b.setAttribute("aria-selected", b.dataset.tab === name ? "true" : "false"); });
      document.querySelectorAll(".tab-panel").forEach(function (p) { p.hidden = p.dataset.panel !== name; });
      document.querySelectorAll(".tabs .subnav").forEach(function (n) { n.hidden = n.dataset.for !== name; });
      if (scroll) window.scrollTo({ top: 0 });
    }
    // Copy each panel's Contents list into the sidebar, right under its tab button.
    btns.forEach(function (b) {
      var panel = document.querySelector('.tab-panel[data-panel="' + b.dataset.tab + '"]');
      var list = panel && panel.querySelector(".contents ol");
      if (!list) return;
      var sub = document.createElement("div");
      sub.className = "subnav"; sub.dataset.for = b.dataset.tab;
      sub.appendChild(list.cloneNode(true));
      b.insertAdjacentElement("afterend", sub);
    });

    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        history.replaceState(null, "", "#" + b.dataset.tab);
        show(b.dataset.tab, true);
      });
    });
    // A section link (#s3) belongs to the Notes tab; anything else is a tab name.
    var h = location.hash.slice(1);
    var target = h && document.getElementById(h);
    var owner = target && target.closest(".tab-panel");
    show(owner ? owner.dataset.panel : h, false);

    // Highlight the section currently being read.
    var links = document.querySelectorAll(".tabs .subnav a");
    function spy() {
      var current = null;
      links.forEach(function (a) {
        var el = document.getElementById(a.getAttribute("href").slice(1));
        if (el && el.offsetParent !== null && el.getBoundingClientRect().top < 140) current = a;
      });
      links.forEach(function (a) { a.classList.toggle("active", a === current); });
    }
    if (links.length) { window.addEventListener("scroll", spy, { passive: true }); spy(); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
