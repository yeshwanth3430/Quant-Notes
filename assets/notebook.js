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

// Every Plotly graph is drawn in a labelled frame:
//  3D: a cube (aspectmode "cube", no shaded walls), the cube's 12 edges, x/y/z axis lines through the origin,
//      axis names at the positive ends ("x-axis · 19,900"), and the coordinates written at all 8 corners.
//  2D: a square frame (mirrored axis lines), axis names "x-axis · …" / "y-axis · …", and the coordinates
//      written at all 4 corners (read from the final ranges after drawing).
// Hooks Plotly as soon as it loads, so page plots and the replication lab all get it without changes.
(function () {
  var TAG = "__frame";
  function css(v, d) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || d; }
  function fmt(v) { var r = Math.round(v * 100) / 100; return (r < 0 ? "−" : "") + Math.abs(r); }
  function titleText(a) { var t = a && a.title; if (!t) return ""; return typeof t === "string" ? t : (t.text || ""); }
  function named(a, letter) {
    var t = titleText(a), pre = letter + "-axis";
    if (t.indexOf(pre) === 0) return t;
    return (!t || t === letter) ? pre : pre + " · " + t;
  }
  function setTitle(a, text) {
    if (!a) return;
    if (a.title && typeof a.title === "object") a.title.text = text;
    else a.title = { text: text };
  }

  // ---------- 3D ----------
  function frame3d(sceneKey, sc) {
    var xr = sc.xaxis && sc.xaxis.range, yr = sc.yaxis && sc.yaxis.range, zr = sc.zaxis && sc.zaxis.range;
    if (!xr || !yr || !zr) return [];
    var ink = css("--ink", "#333"), soft = css("--ink-soft", "#777");
    var X = [xr[0], xr[1]], Y = [yr[0], yr[1]], Z = [zr[0], zr[1]];
    var ex = [], ey = [], ez = [];
    function seg(a, b) { ex.push(a[0], b[0], null); ey.push(a[1], b[1], null); ez.push(a[2], b[2], null); }
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
      seg([X[0], Y[i], Z[j]], [X[1], Y[i], Z[j]]);
      seg([X[i], Y[0], Z[j]], [X[i], Y[1], Z[j]]);
      seg([X[i], Y[j], Z[0]], [X[i], Y[j], Z[1]]);
    }
    var edges = { type: "scatter3d", mode: "lines", name: TAG, x: ex, y: ey, z: ez, connectgaps: false,
      line: { color: ink, width: 3 }, opacity: 0.45, hoverinfo: "skip", showlegend: false };
    function mid(r) { return (r[0] <= 0 && 0 <= r[1]) ? 0 : r[0]; }
    var o = [mid(xr), mid(yr), mid(zr)];
    var axes = { type: "scatter3d", mode: "lines+text", name: TAG, connectgaps: false,
      x: [xr[0], xr[1], null, o[0], o[0], null, o[0], o[0]],
      y: [o[1], o[1], null, yr[0], yr[1], null, o[1], o[1]],
      z: [o[2], o[2], null, o[2], o[2], null, zr[0], zr[1]],
      line: { color: ink, width: 5 }, hoverinfo: "skip", showlegend: false };
    axes.mode = "lines";
    // axis names sit 85% of the way to the positive end, so they don't sit on top of a corner label
    function at(r, c) { return c + 0.85 * (r[1] - c); }
    var names = { type: "scatter3d", mode: "text", name: TAG,
      x: [at(xr, o[0]), o[0], o[0]], y: [o[1], at(yr, o[1]), o[1]], z: [o[2], o[2], at(zr, o[2])],
      text: [named(sc.xaxis, "x"), named(sc.yaxis, "y"), named(sc.zaxis, "z")],
      textposition: "top center", textfont: { color: ink, size: 13 }, hoverinfo: "skip", showlegend: false };
    var cx = [], cy = [], cz = [], ct = [], cp = [];
    X.forEach(function (x) { Y.forEach(function (y) { Z.forEach(function (z) {
      cx.push(x); cy.push(y); cz.push(z);
      ct.push("(" + fmt(x) + ", " + fmt(y) + ", " + fmt(z) + ")");
      cp.push(z === Z[1] ? "top center" : "bottom center");
    }); }); });
    var corners = { type: "scatter3d", mode: "markers+text", name: TAG, x: cx, y: cy, z: cz, text: ct, textposition: cp,
      marker: { size: 3, color: soft }, textfont: { color: soft, size: 11 }, hoverinfo: "skip", showlegend: false };
    var out = [edges, axes, names, corners];
    if (sceneKey !== "scene") out.forEach(function (t) { t.scene = sceneKey; });
    return out;
  }

  function prepare(data, layout) {
    if (!Array.isArray(data) || !layout) return { data: data, is2d: false };
    if (layout.meta && layout.meta.noFrame) return { data: data, is2d: false };   // bar charts / multi-panel figures opt out
    var out = data.filter(function (t) { return !t || t.name !== TAG; });
    var has3d = false;
    Object.keys(layout).forEach(function (k) {
      if (!/^scene\d*$/.test(k) || !layout[k]) return;
      has3d = true;
      var sc = layout[k];
      sc.aspectmode = "cube";
      delete sc.aspectratio;
      ["x", "y", "z"].forEach(function (l) {
        var a = sc[l + "axis"]; if (!a) return;
        a.showbackground = false;
        a.zeroline = false;
      });
      out.push.apply(out, frame3d(k, sc));
      // the inner axis lines carry the full names; the wall titles just say which letter
      ["x", "y", "z"].forEach(function (l) { var a = sc[l + "axis"]; if (a) setTitle(a, l); });
    });
    var is2d = !has3d && (layout.xaxis || layout.yaxis) && !out.some(function (t) { return t && /3d|mesh|surface|pie/.test(t.type || ""); });
    if (is2d) {
      var ink = css("--ink", "#333");
      ["x", "y"].forEach(function (l) {
        var a = layout[l + "axis"] = layout[l + "axis"] || {};
        a.showline = true; a.mirror = true; a.linecolor = ink; a.linewidth = 1.5;
        if (a.range) a.constrain = "domain";   // keep the given range, so the corners show clean numbers
        setTitle(a, named(a, l));
      });
      if (Array.isArray(layout.annotations)) layout.annotations = layout.annotations.filter(function (n) { return !n || n.name !== TAG; });
    }
    return { data: out, is2d: is2d };
  }

  // 2D corners: written after drawing, from the ranges Plotly actually used.
  function corners2d(P, gd) {
    try {
      var el = typeof gd === "string" ? document.getElementById(gd) : gd;
      var fl = el && el._fullLayout; if (!fl || !fl.xaxis || !fl.yaxis) return;
      var xr = fl.xaxis.range, yr = fl.yaxis.range, soft = css("--ink-soft", "#777");
      var anns = (el.layout.annotations || []).filter(function (n) { return !n || n.name !== TAG; });
      [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (c) {
        anns.push({ name: TAG, xref: "x", yref: "y", x: xr[c[0]], y: yr[c[1]], showarrow: false,
          text: "(" + fmt(xr[c[0]]) + ", " + fmt(yr[c[1]]) + ")", font: { size: 11, color: soft },
          xanchor: c[0] ? "right" : "left", yanchor: c[1] ? "top" : "bottom", xshift: c[0] ? -3 : 3, yshift: c[1] ? -2 : 2 });
      });
      P.relayout(el, { annotations: anns });
    } catch (e) {}
  }

  function wrap(P) {
    if (!P || P.__frameWrapped) return P;
    ["newPlot", "react"].forEach(function (fn) {
      var orig = P[fn];
      if (typeof orig !== "function") return;
      P[fn] = function (gd, data, layout, config) {
        var r = prepare(data, layout);
        var res = orig.call(this, gd, r.data, layout, config);
        if (r.is2d && res && res.then) res.then(function () { corners2d(P, gd); });
        return res;
      };
    });
    P.__frameWrapped = true;
    return P;
  }
  var stored = window.Plotly ? wrap(window.Plotly) : undefined;
  try {
    Object.defineProperty(window, "Plotly", {
      configurable: true,
      get: function () { return stored; },
      set: function (v) { stored = wrap(v); }
    });
  } catch (e) {}
})();
