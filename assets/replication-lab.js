// Options Replication Lab
// Choose expiry levels, products (CE / PE / future / bond) and a target payoff.
// The lab writes the question, builds the payoff table and equations, runs elimination
// step by step (exact fractions), gives the answer in trading words, draws the row and
// column pictures (2D or 3D), prices the target and checks for arbitrage.
(function () {
  "use strict";

  // ---------- exact fractions ----------
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function Fr(n, d) {
    if (d === undefined) d = 1;
    if (!Number.isInteger(n) || !Number.isInteger(d) || Math.abs(n) > 1e12 || Math.abs(d) > 1e12) {
      this.n = n / d; this.d = 1; this.f = true; return;   // decimal mode (Black-Scholes values)
    }
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d); this.n = n / g; this.d = d / g;
  }
  function fmtDec(v) { var r = +v.toFixed(4); return String(Math.abs(r) < 1e-9 ? 0 : r); }
  Fr.prototype.add = function (o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); };
  Fr.prototype.sub = function (o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); };
  Fr.prototype.mul = function (o) { return new Fr(this.n * o.n, this.d * o.d); };
  Fr.prototype.div = function (o) { return new Fr(this.n * o.d, this.d * o.n); };
  Fr.prototype.neg = function () { return new Fr(-this.n, this.d); };
  Fr.prototype.isZero = function () { return this.f ? Math.abs(this.n) < 1e-9 : this.n === 0; };
  Fr.prototype.num = function () { return this.n / this.d; };
  Fr.prototype.tex = function () {
    if (this.f) return fmtDec(this.n);
    if (this.d === 1) return String(this.n);
    return (this.n < 0 ? "-" : "") + "\\tfrac{" + Math.abs(this.n) + "}{" + this.d + "}";
  };
  Fr.prototype.txt = function () {
    if (this.f) return fmtDec(this.n);
    if (this.d === 1) return String(this.n);
    var dec = +(this.n / this.d).toFixed(3);
    return this.n + "/" + this.d + " (≈ " + dec + ")";
  };
  var ZERO = new Fr(0), ONE = new Fr(1);
  function parseFr(s) {
    s = String(s).trim().replace(/,/g, "");
    if (s === "" || s === "-") return null;
    if (s.indexOf("/") >= 0) {
      var p = s.split("/"); var a = parseInt(p[0], 10), b = parseInt(p[1], 10);
      if (isNaN(a) || isNaN(b) || b === 0) return null; return new Fr(a, b);
    }
    var v = parseFloat(s); if (isNaN(v)) return null;
    var k = (s.split(".")[1] || "").length; var d = Math.pow(10, Math.min(k, 6));
    return new Fr(Math.round(v * d), d);
  }

  // ---------- helpers ----------
  var VARS = ["x", "y", "z"], NAMES = ["A", "B", "C"];
  function fmtLvl(v) { return Number(v).toLocaleString("en-IN"); }
  // rupees for a value in lab units (1 unit = 100 points on 1 quantity), on ONE real lot of `lot` quantities
  function rupees(units) { var v = units * 100 * (state.mkt.lot || 65); return (v < 0 ? "−₹" : "₹") + Math.round(Math.abs(v)).toLocaleString("en-IN"); }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  function cssv(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function nice(span) {
    var raw = span / 6, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }

  // ---------- market presets ----------
  var PRESETS = {
    ex2: { label: "Lecture example: 20,100 PE, 19,900 CE, 20,000 PE (3 levels)", n: 3, levels: [19900, 20000, 20100],
      products: [{ side: "buy", type: "PE", k: 20100, p: "" }, { side: "buy", type: "CE", k: 19900, p: "" }, { side: "buy", type: "PE", k: 20000, p: "" }],
      target: ["3", "2", "2"], auto: true },
    fly: { label: "Build a butterfly from three calls", n: 3, levels: [19900, 20000, 20100],
      products: [{ side: "buy", type: "CE", k: 19800, p: "230" }, { side: "buy", type: "CE", k: 19900, p: "150" }, { side: "buy", type: "CE", k: 20000, p: "60" }],
      target: ["0", "1", "0"] },
    parity: { label: "Put–call parity: CE, PE, future (many answers, arbitrage check)", n: 3, levels: [19900, 20000, 20100],
      products: [{ side: "buy", type: "CE", k: 20000, p: "60" }, { side: "buy", type: "PE", k: 20000, p: "50" }, { side: "buy", type: "FUT", k: 20000, p: "0" }],
      target: ["1", "0", "1"] },
    incomplete: { label: "Incomplete market: bond, future, 19,900 CE (can't build a butterfly)", n: 3, levels: [19900, 20000, 20100],
      products: [{ side: "buy", type: "BOND", k: 0, p: "100" }, { side: "buy", type: "FUT", k: 20000, p: "0" }, { side: "buy", type: "CE", k: 19900, p: "130" }],
      target: ["0", "1", "0"] },
    two: { label: "Two levels: 20,100 PE and 19,800 CE", n: 2, levels: [19900, 20000],
      products: [{ side: "buy", type: "PE", k: 20100, p: "210" }, { side: "buy", type: "CE", k: 19800, p: "190" }],
      target: ["3", "3"] }
  };

  var state = { n: 3, levels: [19900, 20000, 20100], products: [], target: [], challenge: false, revealed: false,
    mkt: { S0: 20000, T0: 7, iv: 13, r: 6.5, auto: true, Tn: 0, lot: 65 } };

  // ---------- Black-Scholes ----------
  function ncdf(x) {
    var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  function bs(type, S, K, days) {
    var T = days / 365, iv = state.mkt.iv / 100, r = state.mkt.r / 100;
    if (T <= 0) return type === "CE" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    var sd = iv * Math.sqrt(T), d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / sd, d2 = d1 - sd, df = Math.exp(-r * T);
    return type === "CE" ? S * ncdf(d1) - K * df * ncdf(d2) : K * df * ncdf(-d2) - S * ncdf(-d1);
  }
  // value in Nifty points of one lot, when Nifty = S and `days` are left to expiry
  function valuePts(pr, S, days) {
    var T = days / 365, r = state.mkt.r / 100, v;
    if (pr.type === "CE" || pr.type === "PE") v = bs(pr.type, S, pr.k, days);
    else if (pr.type === "FUT") v = S - pr.k * Math.exp(-r * T);
    else v = 100 * Math.exp(-r * T);
    if (days <= 0) v = Math.round(v * 1e6) / 1e6;
    return pr.side === "sell" ? -v : v;
  }
  function toFr(pts) { return Number.isInteger(pts) ? new Fr(pts, 100) : new Fr(pts / 100); }
  function premAuto(pr) { return valuePts(pr, state.mkt.S0, state.mkt.T0); }

  // ---------- payoffs ----------
  function payoffPts(pr, S) {
    var v;
    if (pr.type === "CE") v = Math.max(S - pr.k, 0);
    else if (pr.type === "PE") v = Math.max(pr.k - S, 0);
    else if (pr.type === "FUT") v = S - pr.k;
    else v = 100;
    return pr.side === "sell" ? -v : v;
  }
  function prodLabel(pr) {
    var s = pr.side === "buy" ? "Buy" : "Sell";
    if (pr.type === "CE" || pr.type === "PE") return s + " " + fmtLvl(pr.k) + " " + pr.type;
    if (pr.type === "FUT") return s + " Nifty future @ " + fmtLvl(pr.k);
    return s + " bond (pays 100 points)";
  }
  function formulaTxt(pr, S) {
    var Tn = state.mkt.Tn;
    if (Tn > 0) {
      var v = valuePts(pr, S, Tn), sg = pr.side === "sell" ? -1 : 1, base = sg * v, txtv;
      if (pr.type === "CE" || pr.type === "PE") {
        var intr = pr.type === "CE" ? Math.max(S - pr.k, 0) : Math.max(pr.k - S, 0);
        txtv = "BS " + base.toFixed(1) + " = payoff " + intr + " + time value " + (base - intr).toFixed(1);
      } else if (pr.type === "FUT") txtv = fmtLvl(S) + " − " + fmtLvl(pr.k) + "·e^(−rT) = " + base.toFixed(1);
      else txtv = "100·e^(−rT) = " + base.toFixed(2);
      return (sg < 0 ? "−(" + txtv + ")" : txtv) + " → " + fmtDec(v / 100);
    }
    var raw;
    if (pr.type === "CE") raw = "max(" + fmtLvl(S) + " − " + fmtLvl(pr.k) + ", 0) = " + Math.max(S - pr.k, 0);
    else if (pr.type === "PE") raw = "max(" + fmtLvl(pr.k) + " − " + fmtLvl(S) + ", 0) = " + Math.max(pr.k - S, 0);
    else if (pr.type === "FUT") raw = fmtLvl(S) + " − " + fmtLvl(pr.k) + " = " + (S - pr.k);
    else raw = "100";
    var pts = payoffPts(pr, S);
    return (pr.side === "sell" ? "−(" + raw + ")" : raw) + " → " + new Fr(pts, 100).txt();
  }

  // ---------- elimination (exact) ----------
  function solve(A, b) {
    var n = A.length, m = A[0].length;
    var M = A.map(function (row, i) { return row.concat([b[i]]); });
    var steps = [], pivots = [], r = 0;
    function eye() { return A.map(function (_, i) { return A.map(function (_, j) { return i === j ? ONE : ZERO; }); }); }
    var Et = eye(); // running product of all step matrices (E so that E·A = U)
    function snap() { return M.map(function (row) { return row.slice(); }); }
    for (var c = 0; c < m && r < n; c++) {
      if (M[r][c].isZero()) {
        var k = -1;
        for (var i = r + 1; i < n; i++) if (!M[i][c].isZero()) { k = i; break; }
        if (k < 0) { steps.push({ kind: "nopivot", col: c, row: r, mat: snap() }); continue; }
        var t = M[r]; M[r] = M[k]; M[k] = t;
        var tE = Et[r]; Et[r] = Et[k]; Et[k] = tE;
        var Pm = eye(), tp = Pm[r]; Pm[r] = Pm[k]; Pm[k] = tp;
        steps.push({ kind: "swap", r1: r, r2: k, col: c, mat: snap(), E: Pm });
      }
      var piv = M[r][c];
      for (var i2 = r + 1; i2 < n; i2++) {
        if (M[i2][c].isZero()) { steps.push({ kind: "zero", row: i2, col: c, prow: r }); continue; }
        var mult = M[i2][c].div(piv);
        var before = M[i2].slice(), sub = M[r].map(function (v) { return v.mul(mult); });
        M[i2] = M[i2].map(function (v, j) { return v.sub(sub[j]); });
        var Erow = Et[r];
        Et[i2] = Et[i2].map(function (v, j) { return v.sub(Erow[j].mul(mult)); });
        var Em = eye(); Em[i2][r] = mult.neg();
        steps.push({ E: Em, kind: "elim", row: i2, prow: r, col: c, piv: piv, remove: before[c], mult: mult, before: before, sub: sub, after: M[i2].slice(), mat: snap() });
      }
      pivots.push(c); r++;
    }
    var rank = pivots.length, bad = [];
    for (var z = rank; z < n; z++) if (!M[z][m].isZero()) bad.push(z);
    var free = []; for (var fc = 0; fc < m; fc++) if (pivots.indexOf(fc) < 0) free.push(fc);
    function back(rhsZero, freeVals) {
      var x = []; for (var j = 0; j < m; j++) x.push(ZERO);
      free.forEach(function (f, i) { x[f] = freeVals[i]; });
      var bs = [];
      for (var i = rank - 1; i >= 0; i--) {
        var pc = pivots[i], rhs = rhsZero ? ZERO : M[i][m], sum = rhs, known = [];
        for (var j2 = pc + 1; j2 < m; j2++) if (!M[i][j2].isZero()) { sum = sum.sub(M[i][j2].mul(x[j2])); known.push(j2); }
        x[pc] = sum.div(M[i][pc]);
        bs.push({ row: i, pc: pc, coefs: M[i].slice(0, m), rhs: rhs, known: known, xsnap: x.slice(), val: x[pc], sum: sum });
      }
      return { x: x, bs: bs };
    }
    var res = { Et: Et, M: M, steps: steps, pivots: pivots, rank: rank, bad: bad, free: free, n: n, m: m };
    if (!bad.length) {
      var part = back(false, free.map(function () { return ZERO; }));
      res.x = part.x; res.bs = part.bs;
      res.nulls = free.map(function (f, i) { return back(true, free.map(function (_, j) { return j === i ? ONE : ZERO; })).x; });
    }
    return res;
  }

  // ---------- LaTeX builders ----------
  function augTex(M, m, hi) {
    var cols = "", i; for (i = 0; i < m; i++) cols += "c";
    var rows = M.map(function (row, ri) {
      return row.map(function (v, j) {
        var t = v.tex();
        if (hi && hi.row === ri && hi.col === j) t = "\\color{#b42318}{" + t + "}";
        return t;
      }).join(" & ");
    });
    return "\\left[\\begin{array}{" + cols + "|c}" + rows.join(" \\\\ ") + "\\end{array}\\right]";
  }
  function eqTex(coefs, rhs, n) {
    var s = "", first = true;
    coefs.forEach(function (c, j) {
      if (c.isZero()) return;
      var abs = c.n < 0 ? c.neg() : c, cs = (abs.n === 1 && abs.d === 1) ? "" : abs.tex();
      if (first) s += (c.n < 0 ? "-" : "") + cs + VARS[j];
      else s += (c.n < 0 ? " - " : " + ") + cs + VARS[j];
      first = false;
    });
    if (first) s = "0";
    return s + " = " + rhs.tex();
  }
  function vecTex(v) { return "\\begin{bmatrix}" + v.map(function (x) { return x.tex(); }).join("\\\\") + "\\end{bmatrix}"; }


  // ---------- "how each plane is built" (Lecture 01 lab only) ----------
  function planeGuide(A, tgt, L, n, vars, names, R) {
    var sheet = n === 2 ? "line" : "plane", Sheet = n === 2 ? "Line" : "Plane", h = [];
    function pt(p) { return "(" + p.map(function (v) { return v.txt(); }).join(", ") + ")"; }
    function dot(row, p) { return row.reduce(function (s, a, j) { return s.add(a.mul(p[j])); }, ZERO); }
    h.push('<h4>7b. How each ' + sheet + ' in the row picture is built</h4>');
    h.push('<p>The row picture has one ' + sheet + ' per Nifty level (named "at 19,900" etc. in the graph\'s legend). ' +
      'A point in it is a mix of lots ' + "(" + vars.join(", ") + ")" + '. The ' + sheet + ' holds <b>every</b> mix that pays exactly what the client wants at that one level. Here is how each one is made, point by point.</p>');
    A.forEach(function (row, i) {
      var lvl = fmtLvl(L[i]), b = tgt[i];
      h.push('<div class="box example"><span class="label">' + Sheet + ' ' + (i + 1) + ': Nifty at ' + lvl + '</span><ol class="step-list kid-step">');
      // 1. where it comes from
      h.push('<li><p class="k"><span class="kl">Where it comes from</span> The ' + lvl + ' row of the payoff table: 1 lot of ' +
        names.map(function (nm, j) { return nm + ' pays ' + row[j].txt(); }).join(", ") + '. The client wants <b>' + b.txt() + '</b> at ' + lvl + '.</p>' +
        '<p class="k"><span class="kl">The equation</span> $' + eqTex(row, b, n) + '$</p>' +
        '<p class="k"><span class="kl">In words</span> Any mix of lots that makes this true pays exactly ' + b.txt() + ' if Nifty ends at ' + lvl + '. Each such mix is one point of the ' + sheet + '.</p></li>');
      var nz = row.map(function (a, j) { return a.isZero() ? -1 : j; }).filter(function (j) { return j >= 0; });
      if (!nz.length) {
        h.push('<li><p class="k"><span class="kl">Special case</span> Every product pays 0 at ' + lvl + ', so the equation says $0 = ' + b.tex() + '$. ' +
          (b.isZero() ? 'That is always true: <b>every</b> point works, so this ' + sheet + ' is the whole space and puts no limit on the answer.' :
            'That is never true: <b>no</b> point works, so there is no ' + sheet + ' at all and the client\'s payoff cannot be built.') + '</p></li></ol></div>');
        return;
      }
      // 2. where it crosses the axes
      function cv(a, v) { var t = a.tex(); return t === "1" ? v : t === "-1" ? "-" + v : t + v; }
      function lots(v) { return v.txt() + (v.num() === 1 ? ' lot' : ' lots'); }
      var origin = pt(vars.map(function () { return ZERO; }));
      var cross = vars.map(function (v, j) {
        if (row[j].isZero()) return b.isZero()
          ? '<li>' + v + '-axis: the <b>whole axis</b> lies in the ' + sheet + '. ' + names[j] + ' pays 0 at ' + lvl + ' and the client wants 0 there, so any number of ' + names[j] + ' lots works.</li>'
          : '<li>' + v + '-axis: <b>never</b>. ' + names[j] + ' pays 0 at ' + lvl + ', so changing ' + v + ' does not change the payoff here. The ' + sheet + ' runs parallel to the ' + v + '-axis.</li>';
        if (b.isZero()) return '<li>' + v + '-axis: only at the origin ' + origin + '. With only ' + names[j] + ', the payoff here is $' + cv(row[j], v) + '$, which is 0 only when ' + v + ' = 0.</li>';
        var val = b.div(row[j]), p = vars.map(function (w, k) { return k === j ? val : ZERO; });
        return '<li>' + v + '-axis at <b>' + pt(p) + '</b>: set the other lots to 0, then $' + cv(row[j], v) + ' = ' + b.tex() + '$, so $' + v + ' = ' + b.tex() + ' \\div ' + (row[j].num() < 0 ? '(' + row[j].tex() + ')' : row[j].tex()) + ' = ' + val.tex() + '$. ' +
          'Only ' + names[j] + ': ' + lots(val) + '.</li>';
      });
      if (b.isZero()) cross.unshift('<li>The client wants 0 here, so buying nothing works: the ' + sheet + ' passes through the origin ' + origin + '.</li>');
      h.push('<li><p class="k"><span class="kl">Where it crosses the axes</span> Keep only one product at a time.</p><ul>' + cross.join("") + '</ul></li>');
      // 3. sample points
      var k = nz[nz.length - 1], others = vars.map(function (v, j) { return j; }).filter(function (j) { return j !== k; });
      var picks = n === 2 ? [[0], [1], [2], [-1]] : [[0, 0], [1, 0], [0, 1], [1, 1], [2, -1]];
      var pts = picks.map(function (pk) {
        var p = vars.map(function () { return ZERO; }), rest = b;
        others.forEach(function (j, t) { p[j] = new Fr(pk[t]); rest = rest.sub(row[j].mul(p[j])); });
        p[k] = rest.div(row[k]); return { p: p, pk: pk };
      });
      if (R && !R.bad.length && !R.free.length && R.x) {
        var ans = R.x, dup = pts.some(function (q) { return q.p.every(function (v, j) { return v.sub(ans[j]).isZero(); }); });
        if (!dup) pts.push({ p: ans, pk: others.map(function (j) { return ans[j].num(); }), isAns: true });
      }
      var rows = pts.map(function (q) {
        var pick = others.map(function (j) { return vars[j] + ' = ' + q.p[j].txt(); }).join(", ");
        var here = dot(row, q.p);
        var elsewhere = A.map(function (r2, i2) {
          if (i2 === i) return null;
          var v = dot(r2, q.p), ok = v.sub(tgt[i2]).isZero();
          return fmtLvl(L[i2]) + ': ' + v.txt() + (ok ? ' ✓' : ' ✗ (wants ' + tgt[i2].txt() + ')');
        }).filter(Boolean).join("<br>");
        var all = A.every(function (r2, i2) { return dot(r2, q.p).sub(tgt[i2]).isZero(); });
        return '<tr><td>' + pick + '</td><td>' + vars[k] + ' = ' + q.p[k].txt() + '</td><td><b>' + pt(q.p) + '</b></td><td>' + here.txt() + ' ✓</td><td>' + elsewhere + '</td><td>' + (all ? '<b>yes: the answer</b>' : 'no') + '</td></tr>';
      });
      var ex = pts[1] || pts[0], exSum = others.map(function (j) { return row[j].txt() + ' × ' + ex.p[j].txt(); });
      h.push('<li><p class="k"><span class="kl">Find more points</span> Choose ' + others.map(function (j) { return vars[j]; }).join(" and ") + ' freely, then work out ' + vars[k] + ' from the equation.</p>' +
        '<p class="k"><span class="kl">Example</span> Pick ' + others.map(function (j) { return vars[j] + ' = ' + ex.p[j].txt(); }).join(", ") + '. Then ' + exSum.join(" + ") + ' + ' + row[k].txt() + ' × ' + vars[k] + ' = ' + b.txt() +
        ', so ' + vars[k] + ' = ' + ex.p[k].txt() + '. Point ' + pt(ex.p) + '.</p>' +
        '<table><tr><th>Pick</th><th>Then</th><th>Point</th><th>Pays at ' + lvl + '</th><th>Pays at the other levels</th><th>On every ' + sheet + '?</th></tr>' + rows.join("") + '</table></li>');
      // 4. why it is a plane / line
      h.push('<li><p class="k"><span class="kl">Why it is a ' + sheet + '</span> ' + (n === 2 ? 'One lot can be chosen freely and the other is then fixed. One free choice = a straight line.' :
        'Two lots can be chosen freely and the third is then fixed. Two free choices = a flat sheet, a plane.') + ' Every point you can make this way lies on it, and nothing else does.</p>' +
        '<p class="k"><span class="kl">In market words</span> Every point here is a mix that is correct at ' + lvl + ' only. Look at the last column: most points pay the wrong amount at the other levels. Being on one ' + sheet + ' is not enough.</p></li>');
      h.push('</ol></div>');
    });
    var meet = R.bad.length ? 'No point is on every ' + sheet + ', so no mix works at every level.' :
      R.free.length ? 'A whole line of points is on every ' + sheet + ': many mixes work.' :
      'Only one point is on every ' + sheet + ': ' + pt(R.x) + '. That mix pays the right amount at every level, so it is the answer.';
    h.push('<p class="answer">Putting the ' + sheet + 's together: ' + meet + '</p>');
    return h.join("");
  }


  // ---------- inverse mode (Lecture 04 lab: <div id="replab" data-inv>) ----------
  function eyeN(n) { var I = []; for (var i = 0; i < n; i++) { I.push([]); for (var j = 0; j < n; j++) I[i].push(i === j ? ONE : ZERO); } return I; }
  function mTex(Mx) { return "\\begin{bmatrix}" + Mx.map(function (r) { return r.map(function (v) { return v.tex(); }).join(" & "); }).join(" \\\\ ") + "\\end{bmatrix}"; }
  function augI(M, I) {
    var c = ""; for (var i = 0; i < M.length; i++) c += "c";
    return "\\left[\\begin{array}{" + c + "|" + c + "}" + M.map(function (r, i) { return r.concat(I[i]).map(function (v) { return v.tex(); }).join(" & "); }).join(" \\\\ ") + "\\end{array}\\right]";
  }
  function matMul(X, Y) { return X.map(function (r) { return Y[0].map(function (_, j) { return r.reduce(function (s, a, k) { return s.add(a.mul(Y[k][j])); }, ZERO); }); }); }
  function gaussJordan(A) {
    var n = A.length, M = A.map(function (r) { return r.slice(); }), I = eyeN(n), steps = [];
    function snap() { return { M: M.map(function (r) { return r.slice(); }), I: I.map(function (r) { return r.slice(); }) }; }
    for (var c = 0; c < n; c++) {
      if (M[c][c].isZero()) {
        var k = -1; for (var i = c + 1; i < n; i++) if (!M[i][c].isZero()) { k = i; break; }
        if (k < 0) return { steps: steps, singular: true, col: c };
        var t = M[c]; M[c] = M[k]; M[k] = t; t = I[c]; I[c] = I[k]; I[k] = t;
        steps.push(Object.assign({ kind: "swap", r1: c, r2: k, col: c }, snap()));
      }
      var piv = M[c][c];
      if (!piv.sub(ONE).isZero()) {
        M[c] = M[c].map(function (v) { return v.div(piv); }); I[c] = I[c].map(function (v) { return v.div(piv); });
        steps.push(Object.assign({ kind: "scale", row: c, piv: piv }, snap()));
      }
      for (var r = 0; r < n; r++) {
        if (r === c || M[r][c].isZero()) continue;
        var mult = M[r][c];
        M[r] = M[r].map(function (v, j) { return v.sub(M[c][j].mul(mult)); });
        I[r] = I[r].map(function (v, j) { return v.sub(I[c][j].mul(mult)); });
        steps.push(Object.assign({ kind: "elim", row: r, prow: c, col: c, mult: mult }, snap()));
      }
    }
    return { steps: steps, inv: I };
  }

  function invSections(A, tgt, L, n, vars, names, R, tradeTxt) {
    var h = [], lv = L.map(fmtLvl);
    function vtx(v) { return "\\begin{bmatrix}" + v.map(function (x) { return x.tex(); }).join("\\\\") + "\\end{bmatrix}"; }
    function col(Mx, j) { return Mx.map(function (r) { return r[j]; }); }
    function mulV(Mx, v) { return Mx.map(function (r) { return r.reduce(function (s, a, k) { return s.add(a.mul(v[k])); }, ZERO); }); }
    function paren(v) { return v.num() < 0 ? "(" + v.tex() + ")" : v.tex(); }

    // 4. multiplication
    var useAns = R.x && !R.bad.length && !R.free.length, xs = useAns ? R.x : vars.map(function () { return ONE; });
    var got = mulV(A, xs);
    h.push('<h4>4. Multiplication: lots in, payoffs out</h4>');
    h.push('<p>Multiplying the payoff matrix $A$ by a list of lots $x$ gives what the whole position pays at every level. Take ' + (useAns ? 'the answer' : 'a test position') + ' $x = ' + vtx(xs) + '$ (' + esc(tradeTxt(xs)) + ').</p>');
    h.push('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Way 1: by rows</span> One Nifty level at a time: row of $A$ times $x$ (multiply matching numbers, then add).</p><ul>' +
      A.map(function (r, i) { return '<li>At ' + lv[i] + ': $' + r.map(function (a, k) { return paren(a) + '\\times' + paren(xs[k]); }).join(" + ") + ' = ' + got[i].tex() + '$</li>'; }).join("") + '</ul></li>');
    h.push('<li><p class="k"><span class="kl">Way 2: by columns</span> One product at a time: lots × that product\'s payoff column, then add the columns.</p>' +
      '$$' + xs.map(function (v, j) { return paren(v) + vtx(col(A, j)); }).join(" + ") + ' = ' + vtx(got) + '$$' +
      '<p class="k"><span class="kl">Same answer</span> Both ways give (' + got.map(function (v) { return v.txt(); }).join(", ") + ')' + (useAns ? ', exactly what the client wants.' : '.') + '</p>' +
      '<p class="k"><span class="kl">Market meaning</span> Rows = "what do I get if Nifty ends here?". Columns = "add up what each product contributes".</p></li></ol>');

    // 5. Gauss-Jordan
    var G = gaussJordan(A);
    h.push('<h4>5. The inverse $A^{-1}$ by Gauss–Jordan</h4><p>Put the identity $I$ next to $A$ and do row moves until the left side becomes $I$. Whatever the right side has become is $A^{-1}$.</p>$$' + augI(A, eyeN(n)) + '$$');
    var sn = 1;
    G.steps.forEach(function (s) {
      var txt;
      if (s.kind === "swap") txt = 'The pivot spot (row ' + (s.r1 + 1) + ', column ' + (s.col + 1) + ') is 0. Swap rows ' + (s.r1 + 1) + ' and ' + (s.r2 + 1) + ' on both sides.';
      else if (s.kind === "scale") txt = 'Make the pivot 1: divide row ' + (s.row + 1) + ' by $' + s.piv.tex() + '$ on both sides. (At the end the left side must be $I$, which has 1s on the diagonal.)';
      else txt = 'Clear column ' + (s.col + 1) + ' in row ' + (s.row + 1) + ' (' + (s.row < s.prow ? 'above' : 'below') + ' the pivot): row ' + (s.row + 1) + ' $-\\,' + paren(s.mult) + '\\times$ row ' + (s.prow + 1) + ', on both sides. (In $I$, everything off the diagonal is 0.)';
      h.push('<p><b>Step ' + (sn++) + '.</b> ' + txt + '</p>$$' + augI(s.M, s.I) + '$$');
    });
    if (G.singular) {
      h.push('<div class="box pitfall"><span class="label">No inverse</span><p>Column ' + (G.col + 1) + ' (product ' + names[G.col] + ') has no pivot: after clearing, every number from row ' + (G.col + 1) + ' down is 0. So $A$ is <b>singular</b>: some product is a mix of the others, or the products can\'t reach every level on their own. ' +
        '$A^{-1}$ does not exist, so there is no one-shot recipe for every client. Use elimination (Lecture 03) and the nullspace (Lecture 08) instead. Try a ready-made market with independent products, e.g. the Lecture example or the butterfly.</p></div>');
      return h.join("");
    }
    var Ai = G.inv;
    h.push('<p class="answer">The left side is $I$, so $A^{-1} = ' + mTex(Ai) + '$.</p>');

    // 6. meaning of A^-1: it swaps the roles of levels and products
    function payLine(c) {   // what the trade c pays, level by level, with the arithmetic
      return A.map(function (r, i) {
        var v = r.reduce(function (sm, a, k) { return sm.add(a.mul(c[k])); }, ZERO);
        return '<li>At ' + lv[i] + ': $' + r.map(function (a, k) { return paren(c[k]) + '\\times' + paren(a); }).join(" + ") + ' = ' + v.tex() + '$</li>';
      }).join("");
    }
    h.push('<h4>6. What $A^{-1}$ means: one ticket per Nifty level</h4><ol class="step-list kid-step">');
    h.push('<li><p class="k"><span class="kl">$A$ and $A^{-1}$ swap jobs</span> $A$ turns <b>lots into payoffs</b>. $A^{-1}$ does the opposite: it turns <b>payoffs into lots</b>. So the labels swap too:</p>' +
      '<table><tr><th></th><th>Rows are</th><th>Columns are</th><th>Job</th></tr>' +
      '<tr><td>$A$</td><td>Nifty levels (' + lv.join(", ") + ')</td><td>products (' + names.join(", ") + ')</td><td>lots → payoffs</td></tr>' +
      '<tr><td>$A^{-1}$</td><td>products (' + names.join(", ") + ')</td><td>Nifty levels (' + lv.join(", ") + ')</td><td>payoffs → lots</td></tr></table></li>');
    h.push('<li><p class="k"><span class="kl">Read it with labels</span> Each <b>column</b> belongs to one Nifty level. Read it top to bottom: it is a list of lots of ' + names.join(", ") + '.</p>' +
      '<table><tr><th></th>' + lv.map(function (x) { return '<th>column for ' + x + '</th>'; }).join("") + '</tr>' +
      names.map(function (nm, k) { return '<tr><td>lots of ' + nm + '</td>' + L.map(function (_, j) { return '<td>$' + Ai[k][j].tex() + '$</td>'; }).join("") + '</tr>'; }).join("") + '</table>' +
      '<p class="k"><span class="kl">Careful</span> Use the columns. A row of $A^{-1}$ is not a trade by itself.</p></li>');
    L.forEach(function (S, j) {
      var c = col(Ai, j);
      h.push('<li><p class="k"><span class="kl">Column for ' + lv[j] + '</span> Lots $' + vtx(c) + '$: ' + esc(tradeTxt(c)) + '.</p>' +
        '<p class="k"><span class="kl">What it pays</span> Lots × what each product pays at that level, added up:</p><ul>' + payLine(c) + '</ul>' +
        '<p class="k"><span class="kl">What we have now</span> It pays <b>1 at ' + lv[j] + '</b> and 0 at the other level' + (n > 2 ? 's' : '') + '. This trade is <b>ticket T' + (j + 1) + '</b>: "1 unit if Nifty ends at ' + lv[j] + '".</p></li>');
    });
    h.push('<li><p class="k"><span class="kl">Why this always works</span> $A \\times A^{-1} = I$. Column $j$ of that product is $A \\times$ (column $j$ of $A^{-1}$) = what column $j$\'s trade pays, and column $j$ of $I$ is "1 in spot $j$, 0 elsewhere". So every column of $A^{-1}$ must be a ticket.</p></li></ol>');

    // 7. build the client from tickets: x = A^-1 b
    var xi = mulV(Ai, tgt);
    h.push('<h4>7. Build the client from tickets: $x = A^{-1} b$</h4><ol class="step-list kid-step">');
    h.push('<li><p class="k"><span class="kl">Read the wish as tickets</span> The client wants ' + tgt.map(function (t, i) { return t.txt() + ' at ' + lv[i]; }).join(", ") + '. Each ticket pays 1 at its level, so take ' +
      tgt.map(function (t, i) { return '<b>' + t.txt() + ' × T' + (i + 1) + '</b>'; }).join(" + ") + '.</p>' +
      '<p class="k"><span class="kl">Units</span> Here "1" = 100 Nifty points per quantity. With a lot size of ' + state.mkt.lot + ', "1" on 1 lot = ' + rupees(1) + ', so ' + tgt.map(function (t) { return t.txt(); }).join(" / ") + ' means ' + tgt.map(function (t) { return rupees(t.num()); }).join(" / ") + ' per lot. If the client gives rupees, first divide by (100 × lot size).</p></li>');
    h.push('<li><p class="k"><span class="kl">Add up the lots</span> One product at a time: (tickets wanted) × (that ticket\'s lots of the product), then add across.</p>' +
      '<table><tr><th>Product</th>' + tgt.map(function (t, j) { return '<th>' + t.txt() + ' × T' + (j + 1) + '</th>'; }).join("") + '<th>Total lots</th></tr>' +
      names.map(function (nm, k) {
        return '<tr><td>' + nm + '</td>' + tgt.map(function (t, j) { return '<td>$' + paren(t) + '\\times' + paren(Ai[k][j]) + ' = ' + t.mul(Ai[k][j]).tex() + '$</td>'; }).join("") + '<td><b>$' + xi[k].tex() + '$</b></td></tr>';
      }).join("") + '</table>' +
      '<p class="k"><span class="kl">What we have now</span> ' + esc(tradeTxt(xi)) + '.</p></li>');
    h.push('<li><p class="k"><span class="kl">This is $A^{-1}b$</span> Each row of that table is one row of $A^{-1}$ times the client\'s list $b$. For ' + names[0] + ': $(' + Ai[0].map(function (v) { return v.tex(); }).join(", ") + ') \\cdot (' + tgt.map(function (t) { return t.tex(); }).join(", ") + ') = ' + xi[0].tex() + '$.</p>' +
      '$$x = A^{-1}b = ' + mTex(Ai) + vtx(tgt) + ' = ' + vtx(xi) + '$$</li>');
    h.push('<li><p class="k"><span class="kl">Check</span> What these lots pay, level by level:</p><ul>' + payLine(xi) + '</ul><p class="k"><span class="kl">Result</span> Exactly (' + tgt.map(function (t) { return t.txt(); }).join(", ") + '), what the client wanted ✓.</p></li></ol>');

    // 8. check A A^-1 = I
    var AAi = matMul(A, Ai);
    h.push('<h4>8. Check: $A\\,A^{-1} = I$ (row times column)</h4><p>Entry (row $i$, column $j$) of the product = row $i$ of $A$ times column $j$ of $A^{-1}$. It must be 1 on the diagonal and 0 elsewhere.</p><table><tr><th>Entry</th><th>Row of $A$ × column of $A^{-1}$</th><th>Result</th></tr>' +
      A.map(function (r, i) { return Ai[0].map(function (_, j) {
        var c = col(Ai, j), v = AAi[i][j], want = i === j ? 1 : 0;
        return '<tr><td>(' + (i + 1) + ', ' + (j + 1) + ')</td><td>$' + r.map(function (a, k) { return paren(a) + '\\times' + paren(c[k]); }).join(" + ") + '$</td><td>$' + v.tex() + '$ ' + (Math.abs(v.num() - want) < 1e-9 ? '✓' : '✗') + '</td></tr>';
      }).join(""); }).join("") + '</table>');

    // 9. many clients: AX = B
    var shapes = n === 3 ? [tgt, [new Fr(2), ZERO, new Fr(2)], [ZERO, ONE, new Fr(3)]] : [tgt, [new Fr(2), ZERO], [ZERO, new Fr(2)]];
    var labels = n === 3 ? ["your client", "straddle shape", "rally bet"] : ["your client", "down bet", "up bet"];
    var B = tgt.map(function (_, i) { return shapes.map(function (sh) { return sh[i]; }); }), X = matMul(Ai, B);
    h.push('<h4>9. Many clients at once: $X = A^{-1} B$</h4><p>Put several clients\' wishes side by side as the columns of $B$. One matrix multiplication gives every recipe at once: column $k$ of $X$ is the recipe for client $k$.</p>' +
      '$$X = A^{-1}B = ' + mTex(Ai) + mTex(B) + ' = ' + mTex(X) + '$$' +
      '<table><tr><th>Client</th><th>Wants at ' + lv.join(" / ") + '</th><th>Recipe (column of $X$)</th></tr>' +
      shapes.map(function (sh, k) { return '<tr><td>' + labels[k] + '</td><td>' + sh.map(function (v) { return v.txt(); }).join(" / ") + '</td><td>' + esc(tradeTxt(col(X, k))) + '</td></tr>'; }).join("") + '</table>' +
      '<p>This is why desks like $A^{-1}$: work it out once, then every new client is just a multiplication.</p>');
    return h.join("");
  }

  function statePrices(Ai, prem, tgt, L, names, P) {
    var lv = L.map(fmtLvl), n = L.length, h = [];
    var q = L.map(function (_, j) { return prem.reduce(function (s, p, k) { return s.add(p.mul(Ai[k][j])); }, ZERO); });
    h.push('<h4>12. State prices: what each ticket costs today</h4><p>Ticket $j$ (column $j$ of $A^{-1}$) pays 1 only if Nifty ends at level $j$. Its price today = its lots × the premiums, added up. These prices are called <b>state prices</b> $q$.</p>' +
      '<table><tr><th>Ticket</th><th>Lots × premiums</th><th>Price today $q$</th></tr>' +
      L.map(function (S, j) {
        return '<tr><td>pays 1 at ' + lv[j] + '</td><td>$' + prem.map(function (p, k) { var a = Ai[k][j]; return (a.num() < 0 ? '(' + a.tex() + ')' : a.tex()) + '\\times' + p.tex(); }).join(" + ") + '$</td><td><b>$' + q[j].tex() + '$</b></td></tr>';
      }).join("") + '</table>');
    var neg = q.map(function (v, j) { return v.num() <= 0 ? j : -1; }).filter(function (j) { return j >= 0; });
    // a ticket only pays 1-or-0 at the chosen levels; check what it pays just outside them before calling it arbitrage
    var gap = n > 1 ? L[1] - L[0] : 100, outside = [L[0] - gap, L[n - 1] + gap];
    function ticketPays(j, S) { return P.reduce(function (sm, pr, k) { return sm + Ai[k][j].num() * valuePts(pr, S, 0) / 100; }, 0); }
    neg.forEach(function (j) {
      var losses = outside.map(function (S) { return { S: S, v: ticketPays(j, S) }; }).filter(function (o) { return o.v < -1e-9; });
      if (!losses.length) h.push('<div class="box pitfall"><span class="label">Arbitrage!</span><p>The ticket for ' + lv[j] + ' pays 1 or 0 at the chosen levels, and nothing negative just outside them either, yet it costs ' + q[j].txt() + ' today (zero or negative). Buy it: free money. The premiums are inconsistent.</p></div>');
      else h.push('<div class="box intuition"><span class="label">Negative price, but not free money</span><p>The ticket for ' + lv[j] + ' costs ' + q[j].txt() + ' today, which looks like free money. But it only pays "1 or 0" if Nifty ends <b>exactly</b> at ' + lv.join(", ") + '. ' +
        losses.map(function (o) { return 'If Nifty ends at ' + fmtLvl(o.S) + ' it pays ' + (+o.v.toFixed(2)) + ' (' + Math.round(o.v * 100) + ' points): a loss'; }).join('; ') + '. ' +
        'Real Nifty can end anywhere, so this is <b>not</b> an arbitrage. The negative price shows that a model with only ' + n + ' levels is too simple for these ' + (state.mkt.auto ? 'Black–Scholes' : '') + ' premiums. Real desks read state prices from butterflies on closely spaced strikes, where the "just outside" losses are tiny.</p></div>');
    });
    if (!neg.length) h.push('<p>All state prices are positive: no arbitrage from these tickets.</p>');
    var price = tgt.reduce(function (s, b, i) { return s.add(b.mul(q[i])); }, ZERO);
    h.push('<p class="answer">Any payoff\'s price = (what it pays at each level) × (that level\'s state price), added up. Your client: $' + tgt.map(function (b, i) { return (b.num() < 0 ? '(' + b.tex() + ')' : b.tex()) + '\\times' + (q[i].num() < 0 ? '(' + q[i].tex() + ')' : q[i].tex()); }).join(" + ") + ' = ' + price.tex() + '$ points, the same as the recipe\'s cost in section 11.</p>');
    return h.join("");
  }


  // ---------- LU mode (Lecture 05 lab: <div id="replab" data-lu>) ----------
  function luFactor(A) {
    var n = A.length, M = A.map(function (r) { return r.slice(); }), Lm = [], perm = [], steps = [], swaps = 0, zeroPiv = -1;
    for (var i = 0; i < n; i++) { Lm.push([]); perm.push(i); for (var j = 0; j < n; j++) Lm[i].push(ZERO); }
    for (var c = 0; c < n; c++) {
      if (M[c][c].isZero()) {
        var k = -1; for (var r = c + 1; r < n; r++) if (!M[r][c].isZero()) { k = r; break; }
        if (k < 0) { steps.push({ kind: "nopivot", col: c }); if (zeroPiv < 0) zeroPiv = c; continue; }
        var t = M[c]; M[c] = M[k]; M[k] = t; t = perm[c]; perm[c] = perm[k]; perm[k] = t;
        for (var q = 0; q < c; q++) { t = Lm[c][q]; Lm[c][q] = Lm[k][q]; Lm[k][q] = t; }
        swaps++; steps.push({ kind: "swap", r1: c, r2: k, col: c, U: M.map(function (x) { return x.slice(); }) });
      }
      for (var r2 = c + 1; r2 < n; r2++) {
        var mult = M[r2][c].div(M[c][c]), before = M[r2].slice();
        Lm[r2][c] = mult;
        if (mult.isZero()) { steps.push({ kind: "zero", row: r2, prow: c, col: c }); continue; }
        M[r2] = M[r2].map(function (v, j) { return v.sub(M[c][j].mul(mult)); });
        steps.push({ kind: "elim", row: r2, prow: c, col: c, piv: M[c][c], remove: before[c], mult: mult, before: before, after: M[r2].slice() });
      }
    }
    for (var d = 0; d < n; d++) Lm[d][d] = ONE;
    return { L: Lm, U: M, perm: perm, steps: steps, swaps: swaps, zeroPiv: zeroPiv };
  }


  var luPics = null;
  function drawLuPics(D) {
    if (!window.Plotly) { setTimeout(function () { drawLuPics(D); }, 300); return; }
    function cssv(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
    var col = [cssv("--accent"), cssv("--ex-b"), cssv("--thm-b")], red = cssv("--warn-b"), ink = cssv("--ink"), soft = cssv("--ink-soft"), rule = cssv("--rule"), paper2 = cssv("--paper-2");
    var vcol = [cssv("--def-b"), cssv("--int-b"), red];
    var cfg = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] };
    var n = D.n, Lv = D.Lv, gap = n > 1 ? Lv[1] - Lv[0] : 100, lo = Lv[0] - gap, hi = Lv[n - 1] + gap, xs = [];
    for (var S = lo; S <= hi + 1e-9; S += Math.max(1, gap / 20)) xs.push(Math.round(S));
    function payS(j, S) { return valuePts(D.P[j], S, D.Tn) / 100; }
    function num(v) { return v.num(); }
    function ax(t, r, dt) { var o = { title: { text: t, font: { color: ink, size: 13 } }, tickfont: { color: soft, size: 11 }, gridcolor: rule, zeroline: true, zerolinecolor: soft, fixedrange: true, tickformat: ",d" }; if (r) { o.range = r; o.autorange = false; } if (dt) { o.tickmode = "linear"; o.dtick = dt; } return o; }
    var base = { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: paper2, margin: { l: 60, r: 20, t: 20, b: 70 }, legend: { orientation: "h", y: -0.25, font: { color: ink } } };
    function yr(vals) { var mn = Math.min.apply(null, vals.concat([0])), mx = Math.max.apply(null, vals.concat([0])); return [Math.floor(mn) - 0.5, Math.ceil(mx) + 0.5]; }
    // 1
    var t1 = [], all1 = [];
    D.names.forEach(function (nm, j) {
      var ys = xs.map(function (S) { return payS(j, S); }); all1 = all1.concat(ys);
      t1.push({ type: "scatter", mode: "lines", name: nm + ": " + prodLabel(D.P[j]), x: xs, y: ys, line: { color: col[j], width: 3 } });
      t1.push({ type: "scatter", mode: "markers", showlegend: false, x: Lv, y: D.A.map(function (r) { return num(r[j]); }), marker: { color: col[j], size: 10 } });
    });
    Plotly.newPlot("lablu1", t1, Object.assign({}, base, { xaxis: ax("Nifty", [lo, hi], gap), yaxis: ax("payoff (points ÷ 100)", yr(all1), 1) }), cfg);
    // 2
    if (D.bend && document.getElementById("lablu2")) {
      var t2 = [], ann2 = [], lay2 = Object.assign({}, base, { meta: { noFrame: true }, showlegend: false, annotations: ann2, margin: { l: 40, r: 10, t: 90, b: 50 } }), allv = [];
      D.A.forEach(function (r) { r.forEach(function (v) { allv.push(num(v)); }); });
      D.names.forEach(function (nm, j) {
        var v = D.A.map(function (r) { return num(r[j]); }), mid = (v[0] + v[2]) / 2, bend = v[0] - 2 * v[1] + v[2], xa = "x" + (j ? j + 1 : ""), ya = "y" + (j ? j + 1 : ""), dom = [j / 3 + 0.03, (j + 1) / 3 - 0.03];
        t2.push({ type: "scatter", mode: "lines+markers", x: Lv, y: v, xaxis: xa, yaxis: ya, line: { color: col[j], width: 3 }, marker: { size: 10, color: col[j] } });
        t2.push({ type: "scatter", mode: "lines", x: [Lv[0], Lv[2]], y: [v[0], v[2]], xaxis: xa, yaxis: ya, line: { color: soft, width: 2, dash: "dash" } });
        if (Math.abs(mid - v[1]) > 1e-9) t2.push({ type: "scatter", mode: "lines", x: [Lv[1], Lv[1]], y: [v[1], mid], xaxis: xa, yaxis: ya, line: { color: red, width: 6 } });
        lay2["xaxis" + (j ? j + 1 : "")] = Object.assign(ax("", [Lv[0] - gap / 2, Lv[2] + gap / 2]), { domain: dom, anchor: ya, tickvals: Lv, ticktext: D.lv });
        lay2["yaxis" + (j ? j + 1 : "")] = Object.assign(ax("", yr(allv), 1), { anchor: xa });
        ann2.push({ xref: "paper", yref: "paper", x: (dom[0] + dom[1]) / 2, y: 1.22, showarrow: false, text: "<b>" + nm + "</b><br>" + (+v[0].toFixed(2)) + " − 2×" + (+v[1].toFixed(2)) + " + " + (+v[2].toFixed(2)) + "<br>bend = <b>" + (+bend.toFixed(2)) + "</b>", font: { color: col[j], size: 11 } });
      });
      Plotly.newPlot("lablu2", t2, lay2, cfg);
    }
    // 3
    var Un = D.U.map(function (r) { return r.map(num); }), vnames = Un.map(function (_, i) { return "Eq. " + (i + 1) + " of U"; }), all3 = [];
    Un.forEach(function (r) { all3 = all3.concat(r); });
    Plotly.newPlot("lablu3", D.names.map(function (nm, j) {
      return { type: "bar", name: nm, x: vnames, y: Un.map(function (r) { return r[j]; }), marker: { color: col[j] }, text: Un.map(function (r, i) { return Math.abs(r[j]) < 1e-9 ? (j < i ? "0 (gone)" : "0") : String(+r[j].toFixed(2)); }), textposition: "outside" };
    }), Object.assign({}, base, { meta: { noFrame: true }, barmode: "group", xaxis: { tickfont: { color: ink, size: 12 } }, yaxis: ax("what the product shows", yr(all3), 1) }), cfg);
    // 4
    var Lmn = D.Lm.map(function (r) { return r.map(num); }), cats = [], pieces = Un.map(function () { return []; }), real = [];
    D.perm.forEach(function (pi, i) {
      D.names.forEach(function (nm, j) {
        cats.push(nm + " at " + D.lv[pi]);
        for (var v = 0; v < n; v++) pieces[v].push(Lmn[i][v] * Un[v][j]);
        real.push(num(D.A[pi][j]));
      });
    });
    var t4 = pieces.map(function (pc, v) { return { type: "bar", name: "from eq. " + (v + 1) + " of U", x: cats, y: pc, marker: { color: vcol[v % 3], opacity: 0.75 } }; });
    t4.push({ type: "scatter", mode: "markers", name: "real payoff", x: cats, y: real, marker: { color: ink, size: 10 } });
    var all4 = real.slice(); pieces.forEach(function (pc) { all4 = all4.concat(pc); });
    Plotly.newPlot("lablu4", t4, Object.assign({}, base, { meta: { noFrame: true }, barmode: "relative", xaxis: { tickfont: { color: ink, size: 11 }, tickangle: -30 }, yaxis: ax("payoff (points ÷ 100)", yr(all4), 1), legend: { orientation: "h", y: -0.45, font: { color: ink } }, margin: { l: 60, r: 20, t: 20, b: 120 } }), cfg);
    // 5
    var tg = D.tgt.map(num), t5 = [], all5 = tg.slice();
    if (D.x) { var rec = xs.map(function (S) { return D.x.reduce(function (sm, xv, j) { return sm + num(xv) * payS(j, S); }, 0); }); all5 = all5.concat(rec); t5.push({ type: "scatter", mode: "lines", name: "recipe", x: xs, y: rec, line: { color: col[1], width: 3 } }); }
    if (D.bend) {
      var m5 = (tg[0] + tg[2]) / 2;
      t5.push({ type: "scatter", mode: "lines", name: "ruler", x: [Lv[0], Lv[2]], y: [tg[0], tg[2]], line: { color: soft, width: 2, dash: "dash" } });
      if (Math.abs(m5 - tg[1]) > 1e-9) t5.push({ type: "scatter", mode: "lines", name: "gap → bend " + (+(tg[0] - 2 * tg[1] + tg[2]).toFixed(2)), x: [Lv[1], Lv[1]], y: [tg[1], m5], line: { color: red, width: 6 } });
    }
    t5.push({ type: "scatter", mode: "markers+text", name: "client wants", x: Lv, y: tg, marker: { color: red, size: 12 }, text: tg.map(function (v) { return String(+v.toFixed(2)); }), textposition: "top center", textfont: { color: red } });
    Plotly.newPlot("lablu5", t5, Object.assign({}, base, { xaxis: ax("Nifty", [lo, hi], gap), yaxis: ax("payoff (points ÷ 100)", yr(all5), 1) }), cfg);
  }

  function luSections(A, tgt, Lv, n, vars, names, R, tradeTxt) {
    var h = [], lv = Lv.map(fmtLvl), F = luFactor(A), Lm = F.L, U = F.U, hU = [], hUv = [], hL = [], hChk = [], pic = {};
    function paren(v) { return v.num() < 0 ? "(" + v.tex() + ")" : v.tex(); }
    function vtx(v) { return "\\begin{bmatrix}" + v.map(function (x) { return x.tex(); }).join("\\\\") + "\\end{bmatrix}"; }
    function rowTxt(r) { return "(" + r.map(function (v) { return v.txt(); }).join(", ") + ")"; }
    var rowName = F.perm.map(function (pi) { return "the " + lv[pi] + " row"; });

    // 4. build U, record multipliers
    hU.push('<p>Same elimination as Lecture 03, with one extra habit: every multiplier $\\ell$ gets written into $L$. Start from $A$ (rows = ' + lv.join(", ") + '):</p>$$A = ' + mTex(A) + '$$<ol class="step-list kid-step">');
    F.steps.forEach(function (s) {
      if (s.kind === "swap") hU.push('<li><p class="k"><span class="kl">Swap</span> The pivot spot (row ' + (s.r1 + 1) + ', column ' + (s.col + 1) + ') is 0. Swap rows ' + (s.r1 + 1) + ' and ' + (s.r2 + 1) + '. This reorders the Nifty levels; a permutation $P$ records it, and we factor $PA$ instead of $A$.</p></li>');
      else if (s.kind === "nopivot") hU.push('<li><p class="k"><span class="kl">No pivot</span> Column ' + (s.col + 1) + ' has 0 in the pivot spot and nothing below to swap in. $U$ will have a 0 on its diagonal: product ' + names[s.col] + ' adds no new direction.</p></li>');
      else if (s.kind === "zero") hU.push('<li><p class="k"><span class="kl">Row ' + (s.row + 1) + ', column ' + (s.col + 1) + '</span> Already 0. Multiplier $\\ell_{' + (s.row + 1) + (s.col + 1) + '} = 0$: nothing to do, write 0 into $L$.</p></li>');
      else hU.push('<li><p class="k"><span class="kl">Row ' + (s.row + 1) + ', column ' + (s.col + 1) + '</span> Pivot $' + s.piv.tex() + '$, number to remove $' + s.remove.tex() + '$, multiplier $\\ell_{' + (s.row + 1) + (s.col + 1) + '} = ' + s.remove.tex() + ' \\div ' + paren(s.piv) + ' = ' + s.mult.tex() + '$.</p>' +
        '<p class="k"><span class="kl">How</span> Row ' + (s.row + 1) + ' $-\\,' + paren(s.mult) + ' \\times$ row ' + (s.prow + 1) + ': ' + rowTxt(s.before) + ' → <b>' + rowTxt(s.after) + '</b>.</p>' +
        '<p class="k"><span class="kl">Write it down</span> $\\ell_{' + (s.row + 1) + (s.col + 1) + '} = ' + s.mult.tex() + '$ goes into $L$ at row ' + (s.row + 1) + ', column ' + (s.col + 1) + ' (same number, plus sign).</p></li>');
    });
    hU.push('</ol><p class="answer">What is left is the staircase $U = ' + mTex(U) + '$.</p>');

    // 5. each factor on its own
    var P = F.perm.map(function (pi) { return Lv.map(function (_, j) { return j === pi ? ONE : ZERO; }); });
    var PA = F.perm.map(function (pi) { return A[pi]; }), LU = matMul(Lm, U);
    // views: row i of U = (row i of L^-1) applied to the (reordered) Nifty levels
    var Linv = Lv.map(function (_, j) { var e = Lv.map(function (_, i) { return i === j ? ONE : ZERO; }), y = []; e.forEach(function (ei, i) { var v = ei; for (var k = 0; k < i; k++) v = v.sub(Lm[i][k].mul(y[k])); y.push(v); }); return y; });
    Linv = Lv.map(function (_, i) { return Lv.map(function (_, j) { return Linv[j][i]; }); });   // transpose back: Linv[i][j]
    var W = Linv.map(function (row) { var w = Lv.map(function () { return ZERO; }); row.forEach(function (v, k) { w[F.perm[k]] = v; }); return w; });  // weights per real level
    function mixTxt(w) {
      var parts = [];
      var order = w.map(function (v, i) { return i; }).sort(function (p1, p2) { return (w[p2].num() > 0) - (w[p1].num() > 0) || p1 - p2; });
      order.forEach(function (i) { var v = w[i]; if (v.isZero()) return; var a = v.num(), mag = v.num() < 0 ? v.neg() : v, coef = mag.sub(ONE).isZero() ? "" : (mag.f ? mag.txt() : (mag.d === 1 ? String(mag.n) : mag.n + "/" + mag.d)) + " × ";
        parts.push((parts.length ? (a < 0 ? " − " : " + ") : (a < 0 ? "−" : "")) + coef + "(at " + lv[i] + ")"); });
      return parts.join("") || "0";
    }
    function isBend(w) { if (n !== 3 || Lv[1] - Lv[0] !== Lv[2] - Lv[1] || w[0].isZero()) return false; var r1 = w[1].div(w[0]), r2 = w[2].div(w[0]); return r1.sub(new Fr(-2)).isZero() && r2.sub(ONE).isZero(); }
    hUv.push('<li><p class="k"><span class="kl">$U$, the staircase</span> $U = ' + mTex(U) + '$. Zeros below the diagonal, so the bottom row has only the last product and the lots come out bottom-up.</p></li>');
    hUv.push('<li><p class="k"><span class="kl">What $U$ tells you</span> Each row of $U$ is a <b>view</b> of your payoff graph: a mix of Nifty levels chosen so that one more product <b>disappears</b>.</p>' +
      '<table><tr><th>View (row of $U$)</th><th>Mix of Nifty levels</th>' + names.map(function (nm) { return '<th>' + nm + ' shows</th>'; }).join("") + '<th>Gone</th></tr>' +
      U.map(function (r, i) {
        var gone = names.filter(function (_, j) { return j < i && r[j].isZero(); });   // products this view cancels out
        return '<tr><td>' + (i + 1) + '</td><td>' + mixTxt(W[i]) + (isBend(W[i]) ? '<br><i>= the bend of the graph at ' + lv[1] + '</i>' : '') + '</td>' + r.map(function (v) { return '<td>$' + v.tex() + '$</td>'; }).join("") + '<td>' + (gone.length ? gone.join(", ") : '—') + '</td></tr>';
      }).join("") + '</table>' +
      '<p class="k"><span class="kl">How to read a view</span> Take the products\' payoffs at those Nifty levels and mix them the same way. E.g. view ' + n + ' for product ' + names[n - 1] + ': ' +
        W[n - 1].map(function (w, i) { return w.isZero() ? null : paren(w) + ' × ' + A[i][n - 1].txt(); }).filter(Boolean).join(" + ") + ' = ' + U[n - 1][n - 1].txt() + '.</p>' +
      '<p class="k"><span class="kl">Why it helps</span> The last view shows only ' + names[n - 1] + ', so it gives ' + names[n - 1] + '\'s lots straight away. The view above adds one more product, and so on up. ' +
        (isBend(W[n - 1]) ? 'Here the last view is the <b>bend</b> of the graph at ' + lv[1] + ': the products that are straight lines across the three levels have no bend and vanish; only the one with a kink at ' + lv[1] + ' remains.' : '') + '</p></li>');
    hL.push('<li><p class="k"><span class="kl">What $L$ tells you</span> $L = ' + mTex(Lm) + '$ is the <b>translation</b> back: how each real Nifty level is made from the views (the rows of $U$). Its numbers are the multipliers you subtracted.</p><ul>' +
      Lm.map(function (lr, i) {
        var parts = [], sum = U[0].map(function () { return ZERO; });
        lr.forEach(function (l, j) { if (!l.isZero()) { parts.push((l.sub(ONE).isZero() ? '' : paren(l) + '\\times') + '\\text{view ' + (j + 1) + '}'); sum = sum.map(function (v, k) { return v.add(l.mul(U[j][k])); }); } });
        return '<li>' + rowName[i].charAt(0).toUpperCase() + rowName[i].slice(1) + ' = $' + parts.join(" + ") + ' = (' + sum.map(function (v) { return v.tex(); }).join(", ") + ')$ ✓</li>';
      }).join("") + '</ul>' +
      '<p class="k"><span class="kl">In graph words</span> The real graph at each Nifty level = some of the views added back together. Used the other way (section 7, top down), $L$ turns the client\'s graph into the same views.</p></li>');
    if (F.swaps) hL.push('<li><p class="k"><span class="kl">$P$, the reorder</span> $P = ' + mTex(P) + '$ puts the Nifty levels in the order used: ' + F.perm.map(function (pi) { return lv[pi]; }).join(", ") + '. So the factorization is $PA = LU$.</p></li>');
    var ok = LU.every(function (r, i) { return r.every(function (v, j) { return v.sub(PA[i][j]).isZero(); }); });
    hChk.push('<li><p class="k"><span class="kl">Check</span> $L \\times U = ' + mTex(LU) + '$, which is ' + (F.swaps ? '$PA$' : '$A$') + ' ' + (ok ? '✓' : '✗') + '. $L$ and $U$ together give back exactly the payoff table we started with.</p></li>');

    // 5b. pictures of U and L, drawn from the live inputs
    function ft(v) { var t = v.f ? String(+v.num().toFixed(3)) : (v.d === 1 ? String(v.n) : v.n + '/' + v.d); return t.replace('-', '−'); }
    function fp(v) { return v.num() < 0 ? '(' + ft(v) + ')' : ft(v); }
    var bendLast = isBend(W[n - 1]), xs5 = (R.x && !R.bad.length && !R.free.length) ? R.x : null;
    // pic 1
    var kinks = state.products.map(function (pr, j) { return (pr.type === "CE" || pr.type === "PE") ? names[j] + ' at ' + fmtLvl(pr.k) : names[j] + ': no kink (a straight line)'; });
    pic.p1 = ('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Picture 1</span> What each of your products pays across Nifty (points ÷ 100' + (state.mkt.Tn > 0 ? ', valued with ' + state.mkt.Tn + ' days left' : '') + '). The dots are your Nifty levels ' + lv.join(", ") + '.</p>' +
      '<p class="k"><span class="kl">What to see</span> Where each graph bends (its kink): ' + kinks.join("; ") + '.</p></li></ol>' +
      '<figure class="fig plot3d"><div id="lablu1" class="plot3d-box" style="height:420px"></div><figcaption>Your products\' payoff graphs. Dots = your Nifty levels.</figcaption></figure>');
    // pic 2
    if (bendLast) {
      pic.p2 = ('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Picture 2: the last view is the bend</span> Your bottom row of $U$ mixes the levels as ' + mixTxt(W[n - 1]) + ': that is the <b>bend</b> of a graph at ' + lv[1] + '. Lay a straight ruler from the dot at ' + lv[0] + ' to the dot at ' + lv[2] + ' and look at the gap at ' + lv[1] + '. Bend = 2 × gap.</p>' +
        names.map(function (nm, j) {
          var v0 = A[0][j], v1 = A[1][j], v2 = A[2][j], mid = v0.add(v2).div(new Fr(2)), gap = mid.sub(v1), bend = v0.sub(v1.mul(new Fr(2))).add(v2);
          return '<p class="k"><span class="kl">' + nm + '</span> Dots ' + ft(v0) + ', ' + ft(v1) + ', ' + ft(v2) + '. Ruler at ' + lv[1] + ' = (' + ft(v0) + ' + ' + ft(v2) + ') ÷ 2 = ' + ft(mid) + '. Gap = ' + ft(gap) + '. Bend = <b>' + ft(bend) + '</b>' + (bend.isZero() ? ': straight here, so it vanishes.' : ': it bends, so it shows.') + '</p>';
        }).join("") + '</li></ol>' +
        '<figure class="fig plot3d"><div id="lablu2" class="plot3d-box" style="height:360px"></div><figcaption>The bottom view drawn. Dashed = the ruler; red bar = the gap at ' + lv[1] + '. When the ruler lies on the line there is no gap: bend 0.</figcaption></figure>');
    } else {
      pic.p2 = ('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Picture 2</span> Your bottom view is ' + mixTxt(W[n - 1]) + '. ' + (n === 3 ? 'It is not a plain "bend" here (the levels are not equally spaced, or a row swap happened), but it works the same way: ' : '') + 'products that show 0 in it vanish: ' +
        (names.filter(function (_, j) { return U[n - 1][j].isZero(); }).join(", ") || 'none') + '. (No ruler picture for this case; see picture 3.)</p></li></ol>');
    }
    // pic 3
    pic.p3 = ('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Picture 3: $U$ as a staircase</span> One group of bars per view (row of $U$).</p><ul>' +
      U.map(function (r, i) { var gone = names.filter(function (_, j) { return j < i && r[j].isZero(); }); return '<li>View ' + (i + 1) + ' = ' + mixTxt(W[i]) + ': ' + names.map(function (nm, j) { return nm + ' ' + ft(r[j]); }).join(", ") + (gone.length ? ' (gone: ' + gone.join(", ") + ')' : '') + '</li>'; }).join("") +
      '</ul><p class="k"><span class="kl">What to see</span> Each view has one fewer product than the one above, so the bottom view gives the last product\'s lots first.</p></li></ol>' +
      '<figure class="fig plot3d"><div id="lablu3" class="plot3d-box" style="height:360px"></div><figcaption>Rows of $U$ as bars: products drop out one view at a time.</figcaption></figure>');
    // pic 4
    var ex4 = Lm.map(function (lr, i) {
      var j = 0; for (var q = 0; q < n; q++) if (lr.some(function (l, v) { return !l.isZero() && !U[v][q].isZero(); })) { j = q; }
      var parts = lr.map(function (l, v) { return l.isZero() ? null : fp(l) + ' × ' + fp(U[v][j]) + ' (view ' + (v + 1) + ')'; }).filter(Boolean);
      var tot = lr.reduce(function (sm, l, v) { return sm.add(l.mul(U[v][j])); }, ZERO);
      return '<li>' + names[j] + ' at ' + lv[F.perm[i]] + ': ' + parts.join(" + ") + ' = <b>' + ft(tot) + '</b> ✓</li>';
    });
    pic.p4 = ('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Picture 4: $L$ rebuilds the real levels</span> Each real Nifty level = the views mixed with $L$\'s numbers. The bars stack those pieces; the black dot is the real payoff.</p><ul>' + ex4.join("") + '</ul></li></ol>' +
      '<figure class="fig plot3d"><div id="lablu4" class="plot3d-box" style="height:380px"></div><figcaption>Each bar = one product at one real Nifty level, built from pieces of the views (colours). Black dot = the real payoff: they match, $LU = ' + (F.swaps ? 'PA' : 'A') + '$.</figcaption></figure>');
    // pic 5
    var cLast = W[n - 1].reduce(function (sm, w, i) { return sm.add(w.mul(tgt[i])); }, ZERO);
    var shows = names.filter(function (_, j) { return !U[n - 1][j].isZero(); });
    pic.p5 = ('<ol class="step-list kid-step"><li><p class="k"><span class="kl">Picture 5: your client</span> The client\'s dots are ' + tgt.map(function (t) { return ft(t); }).join(", ") + '. Seen through the bottom view (' + mixTxt(W[n - 1]) + '), the client shows <b>' + ft(cLast) + '</b>' + (bendLast ? ' (the client\'s bend at ' + lv[1] + ')' : '') + '.</p>' +
      (xs5 ? '<p class="k"><span class="kl">Why that gives the lots</span> In the bottom view only ' + shows.join(", ") + ' show' + (shows.length === 1 ? 's' : '') + ', so ' + names[n - 1] + '\'s lots = ' + ft(cLast) + ' ÷ ' + ft(U[n - 1][n - 1]) + ' = <b>' + ft(xs5[n - 1]) + '</b>. Then the views above give the rest: ' + esc(tradeTxt(xs5)) + '.</p>' +
        '<p class="k"><span class="kl">What to see</span> The recipe\'s graph (green) passes through every client dot.</p>' : '<p class="k"><span class="kl">No single recipe</span> This market has no unique answer, so only the client\'s dots are drawn.</p>') +
      '</li></ol><figure class="fig plot3d"><div id="lablu5" class="plot3d-box" style="height:420px"></div><figcaption>The client\'s wanted payoff (red dots)' + (bendLast ? ', its ruler and bend' : '') + (xs5 ? ', and the recipe\'s payoff graph (green)' : '') + '.</figcaption></figure>');
    luPics = { A: A, U: U, Lm: Lm, W: W, perm: F.perm, Lv: Lv, lv: lv, names: names, P: state.products.slice(), Tn: state.mkt.Tn, tgt: tgt, x: xs5, bend: bendLast, n: n };
    var lSteps = F.steps.filter(function (st) { return st.kind === "elim" || st.kind === "zero"; }).map(function (st) {
      var val = st.kind === "zero" ? ZERO : st.mult;
      return '<li>$\\ell_{' + (st.row + 1) + (st.prow + 1) + '} = ' + val.tex() + '$ (from 4b: ' + (st.kind === "zero" ? 'row ' + (st.row + 1) + ' already had 0' : 'we took ' + ft(val) + ' × row ' + (st.prow + 1) + ' away from row ' + (st.row + 1)) + ') → row ' + (st.row + 1) + ', column ' + (st.prow + 1) + ' of $L$</li>';
    });
    var buildLtxt = '<ol class="step-list kid-step"><li><p class="k"><span class="kl">Start</span> Begin with the identity: 1s on the diagonal, 0s everywhere else.</p></li>' +
      '<li><p class="k"><span class="kl">Fill in the multipliers</span> Every number we subtracted with in 4b goes below the diagonal, in the spot (row we changed, row we used):</p><ul>' + lSteps.join("") + '</ul></li>' +
      '<li><p class="k"><span class="kl">What we have now</span> $L = ' + mTex(Lm) + '$.</p>' +
      '<p class="k"><span class="kl">Why only below the diagonal</span> Elimination only ever takes an upper row away from a lower row, so every multiplier sits below the diagonal. That is why $L$ is <b>lower</b> triangular.</p></li></ol>';
    // ---- compact Part 1 (U) and Part 2 (L) ----
    function vec(r) { return '(' + r.map(ft).join(', ') + ')'; }
    function aug(r, c) { return '(' + r.map(ft).join(', ') + ' | ' + ft(c) + ')'; }
    // replay elimination on [A | client] to show the client's numbers moving too
    var M = A.map(function (r) { return r.slice(); }), rhs = tgt.slice(), elimRows = [], sn = 0;
    F.steps.forEach(function (st) {
      if (st.kind === "swap") {
        var t = M[st.r1]; M[st.r1] = M[st.r2]; M[st.r2] = t; t = rhs[st.r1]; rhs[st.r1] = rhs[st.r2]; rhs[st.r2] = t;
        elimRows.push('<tr><td>' + (++sn) + '</td><td>Swap rows ' + (st.r1 + 1) + ' and ' + (st.r2 + 1) + ' (the pivot spot was 0)</td><td colspan="2">rows reordered</td><td>—</td></tr>');
      } else if (st.kind === "nopivot") {
        elimRows.push('<tr><td>' + (++sn) + '</td><td>Column ' + (st.col + 1) + ' has no pivot</td><td colspan="2">' + names[st.col] + ' adds nothing new</td><td>—</td></tr>');
      } else if (st.kind === "zero") {
        elimRows.push('<tr><td>' + (++sn) + '</td><td>Row ' + (st.row + 1) + ' already has 0 in column ' + (st.col + 1) + '</td><td>' + aug(M[st.row], rhs[st.row]) + '</td><td>unchanged</td><td>$\\ell_{' + (st.row + 1) + (st.prow + 1) + '} = 0$</td></tr>');
      } else {
        var before = aug(M[st.row], rhs[st.row]);
        M[st.row] = M[st.row].map(function (v, j) { return v.sub(M[st.prow][j].mul(st.mult)); });
        rhs[st.row] = rhs[st.row].sub(rhs[st.prow].mul(st.mult));
        elimRows.push('<tr><td>' + (++sn) + '</td><td>Row ' + (st.row + 1) + ' − ' + fp(st.mult) + ' × row ' + (st.prow + 1) + '<br><small>(' + ft(st.remove) + ' ÷ pivot ' + ft(st.piv) + ' = ' + ft(st.mult) + ')</small></td><td>' + before + '</td><td><b>' + aug(M[st.row], rhs[st.row]) + '</b></td><td>$\\ell_{' + (st.row + 1) + (st.prow + 1) + '} = ' + st.mult.tex() + '$</td></tr>');
      }
    });
    var c0 = rhs;
    var part1 = [];
    part1.push('<h4>4. Part 1: $U$</h4>');
    part1.push('<p><b>Your products</b> (the starting point):</p>' + pic.p1);
    part1.push('<h4>4a. Eliminate (the client\'s numbers come along)</h4><p>Each row is one Nifty level: (what A, B, … pay | what the client wants). Start: ' + A.map(function (r, i) { return aug(r, tgt[i]); }).join(", ") + '.</p>' +
      '<table><tr><th>Step</th><th>Move</th><th>Row before</th><th>Row after</th><th>Multiplier</th></tr>' + elimRows.join("") + '</table>');
    var eqs = U.map(function (r, i) { var z = r.every(function (v) { return v.isZero(); }); return z ? '0 = ' + c0[i].tex() : eqTex(r, c0[i], n); });
    part1.push('<h4>4b. $U$ = the simplified equations</h4>$$\\begin{aligned}' + eqs.map(function (e) { return e.replace(" = ", " &= "); }).join(" \\\\ ") + '\\end{aligned}$$' +
      '<p>The last equation has only ' + names[n - 1] + ' (lots $' + vars[n - 1] + '$). Each equation above it adds one more product. So we solve from the bottom.</p>');
    if (F.zeroPiv < 0) {
      var bw0 = backward(c0), srows = [];
      for (var ii = n - 1; ii >= 0; ii--) {
        var counted = ZERO, parts = [];
        for (var jj = ii + 1; jj < n; jj++) if (!U[ii][jj].isZero()) { var cnt = U[ii][jj].mul(bw0.x[jj]); parts.push(names[jj] + ': ' + fp(U[ii][jj]) + ' × ' + ft(bw0.x[jj]) + ' = ' + ft(cnt)); counted = counted.add(cnt); }
        var left = c0[ii].sub(counted);
        srows.push('<tr><td>' + (ii + 1) + '</td><td>' + names[ii] + ': ' + ft(U[ii][ii]) + '</td><td>' + ft(c0[ii]) + '</td><td>' + (parts.length ? parts.join('<br>') : '—') + '</td><td>' + (parts.length ? ft(c0[ii]) + ' − ' + fp(counted) + ' = ' : '') + ft(left) + '</td><td><b>' + ft(left) + ' ÷ ' + ft(U[ii][ii]) + ' = ' + ft(bw0.x[ii]) + '</b></td></tr>');
      }
      part1.push('<h4>4c. Solve from the bottom, per 1 lot</h4><table><tr><th>Equation</th><th>1 lot counts</th><th>Client needs</th><th>Already found</th><th>Left</th><th>Lots</th></tr>' + srows.join("") + '</table>' +
        '<p class="answer">' + esc(tradeTxt(bw0.x)) + '. $U$ turns one hard problem into easy ones: one product at a time.</p>');
    } else part1.push('<h4>4c. Solve from the bottom</h4><p class="lab-warn">One equation has 0 in front of its product, so it can\'t be solved for that product: no single recipe.</p>');
    var viewRows = U.map(function (r, i) {
      var gone = names.filter(function (_, j) { return j < i && r[j].isZero(); });
      var meaning = i === 0 ? 'the graph at ' + lv[F.perm[0]] : (isBend(W[i]) ? 'the <b>bend</b> of the graph at ' + lv[1] + ': straight products cancel' : gone.join(", ") + ' cancel' + (gone.length === 1 ? 's' : '') + ' out');
      return '<tr><td>' + (i + 1) + '</td><td>' + mixTxt(W[i]) + '</td>' + r.map(function (v) { return '<td>' + ft(v) + '</td>'; }).join("") + '<td>' + meaning + '</td></tr>';
    });
    part1.push('<h4>4d. What $U$ means on your payoff graph</h4><p>Each equation of $U$ looks at your graph through a <b>mix of Nifty levels</b>, chosen so that one more product cancels out:</p>' +
      '<table><tr><th>Equation</th><th>Mix of Nifty levels</th>' + names.map(function (nm) { return '<th>' + nm + '</th>'; }).join("") + '<th>What it shows</th></tr>' + viewRows.join("") + '</table>' +
      (bendLast ? pic.p2 : '') +
      '<figure class="fig plot3d"><div id="lablu3" class="plot3d-box" style="height:340px"></div><figcaption>Each group of bars = one equation of $U$. Products drop out one equation at a time: that\'s the staircase.</figcaption></figure>');
    // Part 2
    var part2 = [];
    var lRows = F.steps.filter(function (st) { return st.kind === "elim" || st.kind === "zero"; }).map(function (st) {
      return '<tr><td>' + (st.kind === "zero" ? 'row ' + (st.row + 1) + ' already 0' : 'row ' + (st.row + 1) + ' − ' + fp(st.mult) + ' × row ' + (st.prow + 1)) + '</td><td>$\\ell_{' + (st.row + 1) + (st.prow + 1) + '} = ' + (st.kind === "zero" ? '0' : st.mult.tex()) + '$</td><td>row ' + (st.row + 1) + ', column ' + (st.prow + 1) + '</td></tr>';
    });
    part2.push('<h4>5. Part 2: $L$</h4><h4>5a. $L$ = the multipliers from 4a</h4><p>Start from the identity (1s on the diagonal). Put each multiplier from 4a in its spot:</p>' +
      '<table><tr><th>Move in 4a</th><th>Multiplier</th><th>Spot in $L$</th></tr>' + lRows.join("") + '</table>' +
      '$$L = ' + mTex(Lm) + '$$<p>Only below the diagonal, because we only ever take an upper row away from a lower row.' + (F.swaps ? ' Rows were swapped, so $P = ' + mTex(P) + '$ and $PA = LU$.' : '') + '</p>');
    var undoRows = Lm.map(function (lr, i) {
      var used = lr.map(function (l, j) { return l.isZero() ? null : j; }).filter(function (j) { return j !== null; });
      var coef = U[0].map(function () { return ZERO; }), rr = ZERO;
      used.forEach(function (j) { coef = coef.map(function (v, k) { return v.add(lr[j].mul(U[j][k])); }); rr = rr.add(lr[j].mul(c0[j])); });
      var combo = used.map(function (j) { return (lr[j].sub(ONE).isZero() ? '' : fp(lr[j]) + ' × ') + 'eq. ' + (j + 1); }).join(" + ");
      return '<tr><td>' + lv[F.perm[i]] + '</td><td>' + combo + '</td><td>$' + eqTex(coef, rr, n) + '$</td><td>✓ original</td></tr>';
    });
    part2.push('<h4>5b. What $L$ does: undo the moves</h4><p>Each number in $L$ says how much of a simplified equation to add back. Doing it rebuilds every original equation, right side included:</p>' +
      '<table><tr><th>Nifty level</th><th>= from $U$\'s equations</th><th>Gives</th><th></th></tr>' + undoRows.join("") + '</table>' +
      '<p>So $L$ is the <b>record</b> of the elimination. Read forwards, it turns any client\'s numbers into $U$\'s right side (section 7); read backwards, it turns $U$ back into $A$.</p>' +
      '<figure class="fig plot3d"><div id="lablu4" class="plot3d-box" style="height:360px"></div><figcaption>The same idea as a picture: each bar is one product at one real Nifty level, stacked from pieces of $U$\'s equations (colours). Black dot = the real payoff. They match.</figcaption></figure>');
    part2.push('<h4>5c. Check</h4><p>$L \\times U = ' + mTex(LU) + '$ = ' + (F.swaps ? '$PA$' : '$A$') + ' ' + (LU.every(function (r, i) { return r.every(function (v, j) { return v.sub(PA[i][j]).isZero(); }); }) ? '✓' : '✗') + '</p>');
    h.push(part1.join("") + part2.join(""));

    // 6. D
    var piv = U.map(function (r, i) { return r[i]; });
    if (piv.some(function (v) { return v.isZero(); })) h.push('<h4>6. $D$ (the pivots)</h4><p>$U$ has a 0 on its diagonal, so the pivots can\'t all be pulled out. That 0 is the sign of a <b>singular</b> market.</p>');
    else {
      var D = U.map(function (r, i) { return r.map(function (_, j) { return i === j ? piv[i] : ZERO; }); }), U1 = U.map(function (r, i) { return r.map(function (v) { return v.div(piv[i]); }); });
      h.push('<h4>6. $D$: pull the pivots out ($' + (F.swaps ? 'PA' : 'A') + ' = LDU$)</h4><p>Divide each row of $U$ by its pivot, and keep the pivots in a diagonal matrix $D$. Now $L$ and the new $U$ both have 1s on the diagonal.</p>' +
        '$$' + (F.swaps ? 'PA' : 'A') + ' = ' + mTex(Lm) + mTex(D) + mTex(U1) + '$$<p>The pivots ' + piv.map(function (v) { return v.txt(); }).join(", ") + ' measure how much new payoff each product adds at each step.</p>');
    }

    // 7. solve in two steps
    if (F.zeroPiv >= 0) {
      h.push('<h4>7. Solve with $L$ and $U$</h4><div class="box pitfall"><span class="label">Stuck</span><p>$U$ has a 0 on its diagonal, so back substitution would divide by 0. There is no single answer: the client\'s payoff is either impossible or has many recipes. See the diagnosis in Lectures 08 and 09.</p></div>');
      h.push('<h4>7b. Your client in a picture</h4>' + pic.p5);
      return h.join("");
    }
    function forward(b) { var c = [], lines = []; b.forEach(function (bi, i) { var v = bi, terms = [bi.tex()]; for (var j = 0; j < i; j++) if (!Lm[i][j].isZero()) { v = v.sub(Lm[i][j].mul(c[j])); terms.push('- ' + paren(Lm[i][j]) + '\\times' + paren(c[j])); } c.push(v); lines.push(terms.length === 1 ? '$c_' + (i + 1) + ' = ' + v.tex() + '$ (nothing above it to subtract)' : '$c_' + (i + 1) + ' = ' + terms.join(" ") + ' = ' + v.tex() + '$'); }); return { c: c, lines: lines }; }
    function backward(c) { var x = [], lines = []; for (var i = n - 1; i >= 0; i--) { var v = c[i], terms = [c[i].tex()]; for (var j = i + 1; j < n; j++) if (!U[i][j].isZero()) { v = v.sub(U[i][j].mul(x[j])); terms.push('- ' + paren(U[i][j]) + '\\times' + paren(x[j])); } x[i] = v.div(U[i][i]); lines.unshift('$' + vars[i] + ' = (' + terms.join(" ") + ') \\div ' + paren(U[i][i]) + ' = ' + x[i].tex() + '$'); } return { x: x, lines: lines }; }
    var Pb = F.perm.map(function (pi) { return tgt[pi]; }), fw = forward(Pb), bw = backward(fw.c);
    h.push('<h4>7. Solve the client in two easy steps</h4><ol class="step-list kid-step">' +
      '<li><p class="k"><span class="kl">Step 1: $Lc = ' + (F.swaps ? 'Pb' : 'b') + '$, top down</span> $L$ has zeros above the diagonal, so the first equation has only $c_1$, the second only $c_1, c_2$, and so on.</p><ul>' + fw.lines.map(function (l) { return '<li>' + l + '</li>'; }).join("") + '</ul>' +
      '<p class="k"><span class="kl">What $c$ is</span> The client\'s payoff graph seen through the same views as $U$: ' + fw.c.map(function (cv, i) { return '$c_' + (i + 1) + '$ = ' + mixTxt(W[i]) + ' of the client = ' + cv.txt(); }).join('; ') + '.</p></li>' +
      '<li><p class="k"><span class="kl">Step 2: $Ux = c$, bottom up</span> $U$ has zeros below the diagonal, so start at the bottom row.</p><ul>' + bw.lines.slice().reverse().map(function (l) { return '<li>' + l + '</li>'; }).join("") + '</ul>' +
      '<p class="k"><span class="kl">What we have now</span> ' + esc(tradeTxt(bw.x)) + '.</p></li>' +
      '<li><p class="k"><span class="kl">Check</span> These lots pay ' + A.map(function (r, i) { return lv[i] + ': ' + r.reduce(function (sm, a, k) { return sm.add(a.mul(bw.x[k])); }, ZERO).txt(); }).join(", ") + ', which is what the client wanted ✓.</p></li></ol>');

    h.push('<h4>7b. Your client in a picture</h4>' + pic.p5);

    // 8. many clients
    var shapes = n === 3 ? [tgt, [new Fr(2), ZERO, new Fr(2)], [ZERO, ONE, new Fr(3)]] : [tgt, [new Fr(2), ZERO], [ZERO, new Fr(2)]];
    var labels = n === 3 ? ["your client", "straddle shape", "rally bet"] : ["your client", "down bet", "up bet"];
    h.push('<h4>8. Many clients: factor once, then two quick solves each</h4><p>$L$ and $U$ depend only on the products, not on the client. So factor once, then every new client needs only step 1 (top down) and step 2 (bottom up).</p>' +
      '<table><tr><th>Client</th><th>Wants at ' + lv.join(" / ") + '</th><th>$c$ (top down)</th><th>Lots $x$ (bottom up)</th><th>In trading words</th></tr>' +
      shapes.map(function (b, k) { var f = forward(F.perm.map(function (pi) { return b[pi]; })), g = backward(f.c); return '<tr><td>' + labels[k] + '</td><td>' + b.map(function (v) { return v.txt(); }).join(" / ") + '</td><td>' + rowTxt(f.c) + '</td><td>' + rowTxt(g.x) + '</td><td>' + esc(tradeTxt(g.x)) + '</td></tr>'; }).join("") + '</table>' +
      '<p><b>Why it saves work:</b> factoring costs about $n^3/3$ steps, once. Each client then costs about $n^2$. With 3 levels that is 9 vs 9, but with 100 Nifty levels it is about 333,333 steps once, then only 10,000 per client.</p>');
    return h.join("");
  }


  // ---------- transpose / permutation / vector-space mode (Lecture 06 lab: <div id="replab" data-tpv>) ----------
  // Every part is written as What / How / Why, with the user's own numbers.

  var tpvPics = null;
  function drawTpvPics(D) {
    if (!window.Plotly) { setTimeout(function () { drawTpvPics(D); }, 300); return; }
    function cssv(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
    var col = [cssv("--accent"), cssv("--ex-b"), cssv("--thm-b")], red = cssv("--warn-b"), ink = cssv("--ink"), soft = cssv("--ink-soft"), rule = cssv("--rule"), paper2 = cssv("--paper-2");
    var cfg = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] };
    var idA = D.idA === undefined ? "lab8a" : D.idA, idB = D.idB || "lab8b";
    var n = D.n, cols = D.names.map(function (_, j) { return D.A.map(function (r) { return r[j].num(); }); }), tg = D.tgt.map(function (v) { return v.num(); });
    var a = cols[0], pts = [a, a.map(function (v) { return 2 * v; }), a.map(function (v) { return -v; }), tg].concat(cols); if (n === 2) pts.push(a.map(function (v) { return 3 * v; }));
    var xs = D.x ? D.x.map(function (v) { return v.num(); }) : null, chain = [], cur = cols[0].map(function () { return 0; });
    if (xs) cols.forEach(function (c, j) { var nx = cur.map(function (v, i) { return v + xs[j] * c[i]; }); chain.push([cur, nx, j]); pts.push(nx); cur = nx; });
    var m = 1; pts.forEach(function (p) { p.forEach(function (v) { m = Math.max(m, Math.abs(v)); }); }); m = Math.ceil(m) + 1;
    var dt = m <= 6 ? 1 : (m <= 12 ? 2 : 5);
    function axis(t) { return { title: { text: t, font: { color: ink, size: 13 } }, range: [-m, m], autorange: false, tickmode: "linear", dtick: dt, tickfont: { color: soft, size: 11 }, gridcolor: rule, zeroline: true, zerolinecolor: soft }; }
    var lab = function (i) { return n === 2 ? "payoff at " + D.lv[i] : D.lv[i]; };
    if (n === 2) {
      function arrow(from, to, color, text, dash) {
        return [{ x: to[0], y: to[1], ax: from[0], ay: from[1], xref: "x", yref: "y", axref: "x", ayref: "y", showarrow: true, arrowhead: 3, arrowsize: 1.2, arrowwidth: dash ? 2 : 3, arrowcolor: color, text: "" },
          { x: to[0], y: to[1], xref: "x", yref: "y", showarrow: false, text: text, font: { color: color, size: 13 }, xanchor: to[0] < 0 ? "right" : "left", yanchor: to[1] < 0 ? "top" : "bottom", xshift: to[0] < 0 ? -4 : 4 }];
      }
      var base2 = { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: paper2, margin: { l: 60, r: 20, t: 10, b: 60 }, showlegend: false, xaxis: Object.assign(axis(lab(0)), { scaleanchor: "y", scaleratio: 1 }), yaxis: axis(lab(1)) };
      // picture 1: line of multiples of A
      var L = m * 3, an1 = [].concat(arrow([0, 0], a.map(function (v) { return 2 * v; }), soft, "2×" + D.names[0], true), arrow([0, 0], a.map(function (v) { return -v; }), red, "−1×" + D.names[0] + " (sell)"), arrow([0, 0], a, col[0], D.names[0]),
        cols[1] ? arrow([0, 0], cols[1], soft, D.names[1] + " (off the line)") : []);
      if (idA) Plotly.newPlot(idA, [{ type: "scatter", mode: "lines", x: [-L * a[0], L * a[0]], y: [-L * a[1], L * a[1]], line: { color: col[0], width: 2, dash: "dash" }, hoverinfo: "skip" },
        { type: "scatter", mode: "markers", x: [0, 3 * a[0]], y: [0, 3 * a[1]], marker: { color: [ink, col[0]], size: [7, 9] }, text: ["0", D.names[0] + " + 2×" + D.names[0] + " = 3×" + D.names[0]], hoverinfo: "text" }],
        Object.assign({}, base2, { annotations: an1.concat([{ x: 3 * a[0], y: 3 * a[1], xref: "x", yref: "y", showarrow: false, text: D.names[0] + " + 2×" + D.names[0], font: { color: col[0], size: 12 }, xanchor: "left", yanchor: "top", xshift: 6 }]) }), cfg);
      // picture 2: column space
      var tr2 = [], an2 = [];
      if (D.rank >= 2) tr2.push({ type: "scatter", x: [-m, m, m, -m, -m], y: [-m, -m, m, m, -m], fill: "toself", fillcolor: "rgba(47,93,138,0.10)", line: { width: 0 }, mode: "lines", hoverinfo: "skip" });
      else tr2.push({ type: "scatter", mode: "lines", x: [-L * a[0], L * a[0]], y: [-L * a[1], L * a[1]], line: { color: col[0], width: 8 }, opacity: 0.25, hoverinfo: "skip" });
      cols.forEach(function (c, j) { an2 = an2.concat(arrow([0, 0], c, col[j % 3], D.names[j])); });
      chain.forEach(function (ch) { an2 = an2.concat(arrow(ch[0], ch[1], col[ch[2] % 3], "", true)); });
      tr2.push({ type: "scatter", mode: "markers+text", x: [tg[0]], y: [tg[1]], marker: { color: red, size: 12 }, text: ["client"], textposition: "top right", textfont: { color: red }, hoverinfo: "skip" });
      if (D.rank >= 2) an2.push({ xref: "paper", yref: "paper", x: 0.02, y: 0.98, showarrow: false, xanchor: "left", yanchor: "top", text: "shaded = whole plane: every payoff is buildable", font: { color: soft, size: 12 } });
      Plotly.newPlot(idB, tr2, Object.assign({}, base2, { annotations: an2 }), cfg);
    } else {
      function ax3(t) { var o = axis(t); o.showbackground = false; return o; }
      var scene = { xaxis: ax3(lab(0)), yaxis: ax3(lab(1)), zaxis: ax3(lab(2)), aspectmode: "cube", dragmode: "turntable", camera: { eye: { x: 1.25, y: -1.7, z: 0.75 }, up: { x: 0, y: 0, z: 1 } } };
      function seg(p, q, color, name, w, dash) { return { type: "scatter3d", mode: "lines+text", x: [p[0], q[0]], y: [p[1], q[1]], z: [p[2], q[2]], line: { color: color, width: w || 10, dash: dash ? "dash" : "solid" }, text: ["", name || ""], textposition: "top center", textfont: { color: color, size: 14 }, hoverinfo: "skip" }; }
      var L3 = m * 3, o = [0, 0, 0];
      if (idA) Plotly.newPlot(idA, [seg(a.map(function (v) { return -L3 * v; }), a.map(function (v) { return L3 * v; }), col[0], "", 2, true),
        seg(o, a.map(function (v) { return 2 * v; }), soft, "2×" + D.names[0], 4), seg(o, a.map(function (v) { return -v; }), red, "−1×" + D.names[0] + " (sell)"), seg(o, a, col[0], D.names[0]),
        cols[1] ? seg(o, cols[1], soft, D.names[1] + " (off the line)", 4) : seg(o, o, soft, "")],
        { paper_bgcolor: "rgba(0,0,0,0)", margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, scene: scene }, cfg);
      var tr3 = [];
      if (D.rank === 2) {
        var u = cols[D.piv[0]], w = cols[D.piv[1]], K = m * 2, corner = [[-K, -K], [K, -K], [K, K], [-K, K]].map(function (st) { return u.map(function (v, i) { return st[0] * v + st[1] * w[i]; }); });
        tr3.push({ type: "mesh3d", x: corner.map(function (p) { return p[0]; }), y: corner.map(function (p) { return p[1]; }), z: corner.map(function (p) { return p[2]; }), i: [0, 0], j: [1, 2], k: [2, 3], color: col[0], opacity: 0.18, hoverinfo: "skip" });
      }
      cols.forEach(function (c, j) { tr3.push(seg(o, c, col[j % 3], D.names[j])); });
      chain.forEach(function (ch) { tr3.push(seg(ch[0], ch[1], col[ch[2] % 3], "", 4, true)); });
      tr3.push({ type: "scatter3d", mode: "markers+text", x: [tg[0]], y: [tg[1]], z: [tg[2]], marker: { color: red, size: 7 }, text: ["client"], textposition: "top center", textfont: { color: red }, hoverinfo: "skip" });
      if (D.rank === 2 && !D.x) {   // show the gap from the client to the sheet
        var u2 = cols[D.piv[0]], w2 = cols[D.piv[1]], nrm = [u2[1] * w2[2] - u2[2] * w2[1], u2[2] * w2[0] - u2[0] * w2[2], u2[0] * w2[1] - u2[1] * w2[0]];
        var nn = nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2], k2 = (tg[0] * nrm[0] + tg[1] * nrm[1] + tg[2] * nrm[2]) / nn, foot = tg.map(function (v, i) { return v - k2 * nrm[i]; });
        tr3.push(seg(foot, tg, red, "gap: outside", 8, true));
      }
      Plotly.newPlot(idB, tr3, { paper_bgcolor: "rgba(0,0,0,0)", margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false, scene: JSON.parse(JSON.stringify(scene)) }, cfg);
    }
  }


  // ---------- column space & nullspace mode (Lecture 07 lab: <div id="replab" data-csn>) ----------
  var csnPics = null;
  function drawCsnNull(D) {
    if (!window.Plotly) { setTimeout(function () { drawCsnNull(D); }, 300); return; }
    function cssv(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
    var green = cssv("--ex-b"), purple = cssv("--thm-b"), red = cssv("--warn-b"), ink = cssv("--ink"), soft = cssv("--ink-soft"), rule = cssv("--rule"), paper2 = cssv("--paper-2");
    var cfg = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] };
    var n = D.n, nulls = D.nulls.map(function (z) { return z.map(function (v) { return v.num(); }); }), xp = D.xp ? D.xp.map(function (v) { return v.num(); }) : null;
    var pts = [[0, 0, 0].slice(0, n)].concat(nulls); if (xp) { pts.push(xp); nulls.forEach(function (z) { pts.push(xp.map(function (v, i) { return v + z[i]; })); pts.push(xp.map(function (v, i) { return v - z[i]; })); }); }
    var m = 1; pts.forEach(function (p) { p.forEach(function (v) { m = Math.max(m, Math.abs(v)); }); }); m = Math.ceil(m) + 1;
    var dt = m <= 6 ? 1 : 2, labels = D.names.map(function (nm) { return "lots of " + nm; }), K = m * 3;
    function axis(t) { return { title: { text: t, font: { color: ink, size: 13 } }, range: [-m, m], autorange: false, tickmode: "linear", dtick: dt, tickfont: { color: soft, size: 11 }, gridcolor: rule, zeroline: true, zerolinecolor: soft, showbackground: false }; }
    var tr = [];
    if (n === 2) {
      if (nulls.length === 1) { var z = nulls[0]; tr.push({ type: "scatter", mode: "lines", name: "zero-payoff trades (nullspace)", x: [-K * z[0], K * z[0]], y: [-K * z[1], K * z[1]], line: { color: purple, width: 3, dash: "dash" } });
        if (xp) tr.push({ type: "scatter", mode: "lines", name: "every recipe for the client", x: [xp[0] - K * z[0], xp[0] + K * z[0]], y: [xp[1] - K * z[1], xp[1] + K * z[1]], line: { color: green, width: 3 } }); }
      tr.push({ type: "scatter", mode: "markers+text", name: "no trade (0)", x: [0], y: [0], marker: { color: ink, size: 8 }, text: ["0"], textposition: "bottom left" });
      nulls.forEach(function (z, k) { tr.push({ type: "scatter", mode: "markers+text", name: "zero trade " + (k + 1), x: [z[0]], y: [z[1]], marker: { color: purple, size: 10 }, text: ["zero trade"], textposition: "top right", textfont: { color: purple } }); });
      if (xp) tr.push({ type: "scatter", mode: "markers+text", name: "one recipe", x: [xp[0]], y: [xp[1]], marker: { color: green, size: 11 }, text: ["recipe"], textposition: "top right", textfont: { color: green } });
      Plotly.newPlot(D.id, tr, { paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: paper2, margin: { l: 60, r: 20, t: 10, b: 70 }, legend: { orientation: "h", y: -0.25, font: { color: ink } }, xaxis: Object.assign(axis(labels[0]), { scaleanchor: "y", scaleratio: 1 }), yaxis: axis(labels[1]) }, cfg);
    } else {
      function line3(p, d, color, name, dash) { return { type: "scatter3d", mode: "lines", name: name, x: [p[0] - K * d[0], p[0] + K * d[0]], y: [p[1] - K * d[1], p[1] + K * d[1]], z: [p[2] - K * d[2], p[2] + K * d[2]], line: { color: color, width: 6, dash: dash ? "dash" : "solid" } }; }
      function plane3(p, u, w, color, name) { var c = [[-K, -K], [K, -K], [K, K], [-K, K]].map(function (st) { return p.map(function (v, i) { return v + st[0] * u[i] + st[1] * w[i]; }); }); return { type: "mesh3d", name: name, x: c.map(function (q) { return q[0]; }), y: c.map(function (q) { return q[1]; }), z: c.map(function (q) { return q[2]; }), i: [0, 0], j: [1, 2], k: [2, 3], color: color, opacity: 0.2 }; }
      var o = [0, 0, 0];
      if (nulls.length === 1) { tr.push(line3(o, nulls[0], purple, "zero-payoff trades (nullspace)", true)); if (xp) tr.push(line3(xp, nulls[0], green, "every recipe for the client")); }
      if (nulls.length === 2) { tr.push(plane3(o, nulls[0], nulls[1], purple, "zero-payoff trades (nullspace)")); if (xp) tr.push(plane3(xp, nulls[0], nulls[1], green, "every recipe for the client")); }
      tr.push({ type: "scatter3d", mode: "markers+text", name: "no trade (0)", x: [0], y: [0], z: [0], marker: { color: ink, size: 5 }, text: ["0"], textposition: "bottom center" });
      nulls.forEach(function (z) { tr.push({ type: "scatter3d", mode: "markers+text", name: "zero trade", x: [z[0]], y: [z[1]], z: [z[2]], marker: { color: purple, size: 6 }, text: ["zero trade"], textposition: "top center", textfont: { color: purple } }); });
      if (xp) tr.push({ type: "scatter3d", mode: "markers+text", name: "one recipe", x: [xp[0]], y: [xp[1]], z: [xp[2]], marker: { color: green, size: 7 }, text: ["recipe"], textposition: "top center", textfont: { color: green } });
      Plotly.newPlot(D.id, tr, { paper_bgcolor: "rgba(0,0,0,0)", margin: { l: 0, r: 0, t: 0, b: 0 }, legend: { orientation: "h", y: -0.02, font: { color: ink } },
        scene: { xaxis: axis(labels[0]), yaxis: axis(labels[1]), zaxis: axis(labels[2]), aspectmode: "cube", dragmode: "turntable", camera: { eye: { x: 1.5, y: -1.5, z: 0.9 }, up: { x: 0, y: 0, z: 1 } } } }, cfg);
    }
  }

  function csnSections(A, tgt, Lv, n, vars, names, R, tradeTxt, P) {
    var h = [], lv = Lv.map(fmtLvl);
    function ft(v) { var t = (v.f || Math.abs(v.d) > 12) ? String(+v.num().toFixed(2)) : (v.d === 1 ? String(v.n) : v.n + '/' + v.d); return t.replace('-', '−'); }
    function fp(v) { return v.num() < 0 ? '(' + ft(v) + ')' : ft(v); }
    function vec(r) { return '(' + r.map(ft).join(', ') + ')'; }
    function col(Mx, j) { return Mx.map(function (r) { return r[j]; }); }
    function dot(u, v) { return u.reduce(function (sm, a, k) { return sm.add(a.mul(v[k])); }, ZERO); }
    function payOf(l) { return A.map(function (r) { return dot(r, l); }); }
    function lotsTxt(lots) { var parts = lots.map(function (v, j) { return v.isZero() ? null : (v.num() < 0 ? 'sell ' + ft(v.neg()) : 'buy ' + ft(v)) + ' ' + names[j]; }).filter(Boolean); return parts.length ? parts.join(', ') : 'no trade'; }
    function levelSum(lots, want) { return Lv.map(function (_, i) { var terms = lots.map(function (v, j) { return v.isZero() ? null : fp(v) + '×' + fp(A[i][j]); }).filter(Boolean); var got = dot(A[i], lots); return '<li>At ' + lv[i] + ': ' + (terms.length ? terms.join(' + ') : '0') + ' = <b>' + ft(got) + '</b>' + (want ? (got.sub(want[i]).isZero() ? ' ✓' : ' ✗') : '') + '</li>'; }).join(''); }
    var zero = Lv.map(function () { return ZERO; }), N0 = solve(A, zero), nulls = N0.nulls || [], rk = N0.rank;
    var zeroRows = Lv.map(function (_, i) { return A[i].every(function (v) { return v.isZero(); }) ? i : -1; }).filter(function (i) { return i >= 0; });

    // ---- 4. COLUMN SPACE ----
    var eJ = function (j) { return names.map(function (_, k) { return k === j ? ONE : ZERO; }); };
    var mixes = [eJ(0)]; if (n > 1) { mixes.push(eJ(1)); mixes.push(eJ(0).map(function (v, i) { return v.add(eJ(1)[i]); })); mixes.push(eJ(0).map(function (v, i) { return v.sub(eJ(1)[i]); })); } if (n === 3) mixes.push(names.map(function () { return ONE; }));
    h.push('<h4>4. Column space: which payoffs can you build?</h4>' +
      '<p><b>Definition.</b> The column space $C(A)$ = all combinations of the columns = <b>all the payoffs you can build from your products</b>.</p>' +
      '<div class="box intuition"><span class="label">Remember this</span><p>Column space answers: <b>what outputs can I produce by combining the columns?</b> A target <b>inside</b> it can be built; a target <b>outside</b> cannot.</p></div>' +
      '<p><b>How the diagram is formed, step by step.</b></p><ol>' +
      '<li><b>Draw each product as an arrow</b> from 0 to its payoff (axes = payoffs at ' + lv.join(' / ') + '): ' + names.map(function (nm, j) { return nm + ' → ' + vec(col(A, j)); }).join('; ') + '.</li>' +
      '<li><b>A mix = walking along the arrows.</b> Where you land is that mix\'s payoff:</li></ol>' +
      '<table><tr><th>Mix</th><th>Lands at (payoff)</th></tr>' + mixes.map(function (mx) { return '<tr><td>' + lotsTxt(mx) + '</td><td><b>' + vec(payOf(mx)) + '</b></td></tr>'; }).join('') + '</table>' +
      '<ol start="3"><li><b>Colour every point you can land on.</b> Your products point in <b>' + rk + '</b> different direction' + (rk === 1 ? '' : 's') + ' (the rank), so they fill ' + (rk >= n ? 'the whole ' + (n === 2 ? 'plane' : 'space') : rk === 2 ? 'a flat sheet through 0' : 'a line through 0') + '.' +
        (zeroRows.length ? ' Notice: every product pays 0 at ' + zeroRows.map(function (i) { return lv[i]; }).join(', ') + ', so <b>every</b> buildable payoff is 0 there too.' : '') + '</li>' +
      '<li><b>Put in the client\'s point</b> ' + vec(tgt) + ': ' + (R.bad.length ? '<b>outside</b> (red gap), so it cannot be built.' : '<b>inside</b>, so some mix lands on it.') + '</li></ol>' +
      '<figure class="fig plot3d"><div id="lab7cs" class="plot3d-box" style="height:460px"></div><figcaption>Your column space. Arrows = products; shaded = every payoff you can build; red dot = your client.</figcaption></figure>' +
      (R.bad.length ? '<p><b>Check:</b> elimination ends with a row saying 0 = something non-zero, so no lots pay exactly ' + vec(tgt) + '.' + (zeroRows.length && zeroRows.some(function (i) { return !tgt[i].isZero(); }) ? ' Simple reason: the client wants ' + zeroRows.filter(function (i) { return !tgt[i].isZero(); }).map(function (i) { return ft(tgt[i]) + ' at ' + lv[i]; }).join(', ') + ', but every product pays 0 there.' : '') + '</p>'
        : '<p><b>Check one recipe, level by level</b> (' + lotsTxt(R.x) + '):</p><ul>' + levelSum(R.x, tgt) + '</ul>'));

    // ---- 5. NULLSPACE ----
    h.push('<h4>5. Nullspace: which trades pay nothing at all?</h4>' +
      '<p><b>Definition.</b> The nullspace $N(A)$ = all lots $x$ with $Ax = 0$: every position that pays <b>0 at every Nifty level</b> ("zero-payoff trades"). It always contains "no trade".</p>' +
      '<p><b>How to find it, step by step.</b></p><ol>' +
      '<li><b>Set every level\'s payoff to 0:</b> ' + A.map(function (r, i) { return '$' + eqTex(r, ZERO, n) + '$ (' + lv[i] + ')'; }).join('; ') + '.</li>' +
      '<li><b>Eliminate</b> (as in Lecture 03): pivot columns = ' + (N0.pivots.map(function (c) { return names[c]; }).join(', ') || 'none') + '; free columns = ' + (N0.free.map(function (c) { return names[c]; }).join(', ') || 'none') + '.</li>' +
      (nulls.length ? '<li><b>Set one free product to 1</b> (the others 0) and solve for the rest. That gives the special solution' + (nulls.length > 1 ? 's' : '') + ':</li></ol>' : '<li><b>No free columns</b>, so nothing can be set freely: the only answer is "no trade".</li></ol>'));
    if (nulls.length) {
      var prem = P.map(function (pr) { return parseFr(pr.p); });
      nulls.forEach(function (z, k) {
        var cost = prem.some(function (p) { return p === null; }) ? null : dot(z, prem);
        h.push('<p><b>Zero trade ' + (k + 1) + ': ' + lotsTxt(z) + '</b> (lots ' + vec(z) + '). What it pays:</p><ul>' + levelSum(z, zero) + '</ul>' +
          '<p><b>So what does this tell us?</b> This mix pays nothing in every scenario: the products are not all different, and one is a <b>copy</b> of the others. ' +
          (cost === null ? '' : 'Its price today: ' + z.map(function (v, j) { return fp(v) + ' × ' + ft(prem[j]); }).join(' + ') + ' = <b>' + ft(cost) + '</b>. ' + (cost.isZero() ? 'Zero, as it must be: no arbitrage.' : 'Not zero! Something that pays nothing must cost nothing, so this is <b>arbitrage</b>: ' + (cost.num() > 0 ? 'do the opposite trade and receive ' + ft(cost) + ' today for free.' : 'do this trade and receive ' + ft(cost.neg()) + ' today for free.'))) + '</p>');
      });
      var z0 = nulls[0], two = z0.map(function (v) { return v.mul(new Fr(2)); });
      h.push('<p><b>It is a vector space:</b> 2 × zero trade 1 = ' + lotsTxt(two) + ' still pays ' + vec(payOf(two)) + ', and adding zero trades still pays 0.</p>');
      h.push('<p><b>How the diagram is formed, step by step</b> (axes = <b>lots</b> of ' + names.join(', ') + ', not payoffs):</p><ol>' +
        '<li>Mark "no trade" at 0 and zero trade 1 at ' + vec(z0) + '.</li>' +
        '<li>Scale it (2×, −1×, ½×): all these zero trades lie on ' + (nulls.length === 1 ? 'one line' : 'one flat sheet') + ' through 0 (purple dashed): that is the nullspace.</li>' +
        (R.bad.length ? '' : '<li>Mark one recipe for your client, ' + vec(R.x) + ' (green dot).</li><li>Add any zero trade to it: it still pays the client exactly the same. So <b>every</b> recipe lies on the same ' + (nulls.length === 1 ? 'line' : 'sheet') + ', shifted to pass through the recipe (green).</li>') + '</ol>' +
        '<figure class="fig plot3d"><div id="lab7ns" class="plot3d-box" style="height:440px"></div><figcaption>Lots space. Purple = the nullspace (trades that pay nothing). ' + (R.bad.length ? '' : 'Green = every recipe for your client: one recipe + any zero trade.') + '</figcaption></figure>');
      if (!R.bad.length) {
        var ts = [ONE, ONE.neg(), new Fr(2)];
        h.push('<p><b>Why it matters: many recipes.</b> Recipe + any amount of zero trade 1:</p><table><tr><th>Recipe</th><th>Lots</th><th>In words</th><th>Pays</th></tr>' +
          '<tr><td>the one found</td><td>' + vec(R.x) + '</td><td>' + lotsTxt(R.x) + '</td><td>' + vec(payOf(R.x)) + ' ✓</td></tr>' +
          ts.map(function (t) { var l = R.x.map(function (v, i) { return v.add(z0[i].mul(t)); }); return '<tr><td>+ ' + ft(t) + ' × zero trade</td><td>' + vec(l) + '</td><td>' + lotsTxt(l) + '</td><td>' + vec(payOf(l)) + ' ✓</td></tr>'; }).join('') + '</table>' +
          '<p>All pay the client exactly ' + vec(tgt) + '. If they cost different amounts today, sell the dear one and buy the cheap one: that is the arbitrage above.</p>');
      }
    } else {
      h.push('<p><b>So what does this tell us?</b> Only "no trade" pays 0 everywhere: every product adds something new (no copies). So each buildable payoff has <b>exactly one</b> recipe, and there is no zero-payoff trade to mis-price.</p>' +
        '<figure class="fig plot3d"><div id="lab7ns" class="plot3d-box" style="height:380px"></div><figcaption>Lots space: the nullspace is just the point 0' + (R.bad.length ? '.' : '; your client has exactly one recipe (green).') + '</figcaption></figure>');
    }

    // ---- 6. side by side ----
    h.push('<h4>6. Column space vs nullspace</h4><table><tr><th></th><th>Column space $C(A)$</th><th>Nullspace $N(A)$</th></tr>' +
      '<tr><td>Question</td><td>Which payoffs can I build?</td><td>Which trades pay nothing at all?</td></tr>' +
      '<tr><td>Lives among</td><td>payoffs (one number per Nifty level)</td><td>lots (one number per product)</td></tr>' +
      '<tr><td>Size</td><td>' + rk + ' direction' + (rk === 1 ? '' : 's') + ' (the rank)</td><td>' + nulls.length + ' direction' + (nulls.length === 1 ? '' : 's') + ' (free columns = products − rank = ' + n + ' − ' + rk + ')</td></tr>' +
      '<tr><td>Your market</td><td>' + (rk >= n ? 'every payoff' : 'only some payoffs') + '; your client is ' + (R.bad.length ? '<b>outside</b>' : '<b>inside</b>') + '</td><td>' + (nulls.length ? lotsTxt(nulls[0]) + (nulls.length > 1 ? ' (and more)' : '') : 'only no trade') + '</td></tr>' +
      '<tr><td>Why a trader cares</td><td>can I serve this client?</td><td>are there copies, many recipes, and is there free money?</td></tr></table>');
    csnPics = { cs: { A: A, tgt: tgt, x: (!R.bad.length ? R.x : null), n: n, lv: lv, names: names, rank: rk, piv: N0.pivots, idA: null, idB: "lab7cs" },
      ns: { id: "lab7ns", n: n, names: names, nulls: nulls, xp: (!R.bad.length ? R.x : null) } };
    return h.join("");
  }

  function tpvSections(A, tgt, Lv, n, vars, names, R, tradeTxt, P) {
    var h = [], lv = Lv.map(fmtLvl), lot = state.mkt.lot || 65;
    function ft(v) { var t = (v.f || Math.abs(v.d) > 12) ? String(+v.num().toFixed(2)) : (v.d === 1 ? String(v.n) : v.n + '/' + v.d); return t.replace('-', '−'); }
    function fp(v) { return v.num() < 0 ? '(' + ft(v) + ')' : ft(v); }
    function vec(r) { return '(' + r.map(ft).join(', ') + ')'; }
    function mulV(Mx, v) { return Mx.map(function (r) { return r.reduce(function (sm, a, k) { return sm.add(a.mul(v[k])); }, ZERO); }); }
    function dot(u, v) { return u.reduce(function (sm, a, k) { return sm.add(a.mul(v[k])); }, ZERO); }
    function col(Mx, j) { return Mx.map(function (r) { return r[j]; }); }
    function li(label, text) { return '<p class="k"><span class="kl">' + label + '</span> ' + text + '</p>'; }
    function box(items) { return '<ol class="step-list kid-step">' + items.map(function (it) { return '<li>' + it + '</li>'; }).join("") + '</ol>'; }
    var unique = R.x && !R.bad.length && !R.free.length, x = unique ? R.x : null;
    var AT = A[0].map(function (_, j) { return A.map(function (r) { return r[j]; }); });
    var symA = A.every(function (r, i) { return r.every(function (v, j) { return v.sub(A[j][i]).isZero(); }); });

    // 3b. how to read sections 2 and 3
    var j0 = 0, i0 = 0;
    h.push('<h4>3b. Reading sections 2 and 3 slowly</h4>' + box([
      li('What', 'Section 2 is how much <b>1 lot</b> of each product pays at each Nifty level. Section 3 turns that table into one equation per Nifty level.') +
      li('How (one number)', names[j0] + ' = ' + esc(prodLabel(P[j0])) + ' at ' + lv[i0] + ': ' + formulaTxt(P[j0], Lv[i0]) + '. We count in units of 100 points, so it is <b>' + ft(A[i0][j0]) + '</b>. In rupees on 1 lot: ' + ft(A[i0][j0]) + ' × 100 points × ' + lot + ' = ₹' + Math.round(A[i0][j0].num() * 100 * lot).toLocaleString("en-IN") + '.'),
      li('How (one equation)', 'At ' + lv[0] + ': ' + names.map(function (nm, j) { return '$' + vars[j] + '$ lots of ' + nm + ' pay ' + ft(A[0][j]) + ' each'; }).join(', ') + ', and together they must make what the client wants there, ' + ft(tgt[0]) + '. So $' + eqTex(A[0], tgt[0], n) + '$.') +
      li('Why', 'Each equation says: "if Nifty ends at this level, my position must pay what the client wants." All the maths below uses only this small table.') +
      (x ? li('Answer', vars.map(function (v, j) { return '$' + v + ' = ' + x[j].tex() + '$'; }).join(', ') + '. Check at ' + lv[0] + ': ' + A[0].map(function (a, j) { return fp(a) + ' × ' + fp(x[j]); }).join(' + ') + ' = ' + ft(dot(A[0], x)) + ' ✓.') : '')
    ]));

    // 4. permutations
    var rev = Lv.map(function (_, i) { return n - 1 - i; });
    var Pm = rev.map(function (k) { return Lv.map(function (_, j) { return j === k ? ONE : ZERO; }); });
    var PA = rev.map(function (k) { return A[k]; }), Pb = rev.map(function (k) { return tgt[k]; });
    var F = luFactor(A);
    var sw = [1, 0].concat(Lv.slice(2).map(function (_, i) { return i + 2; })), APc = A.map(function (r) { return sw.map(function (k) { return r[k]; }); });
    h.push('<h4>4. Permutations: changing the order</h4>' + box([
      li('Purpose', 'The purpose of permutations in Gaussian elimination is to <b>rearrange rows when needed</b>, particularly to obtain a <b>nonzero pivot</b>. A pivot of 0 can\'t be used to clear the numbers under it (you can\'t divide by 0), so we swap in a row that has a nonzero number there.'),
      li('What', 'Write the same equations in a different order: ' + rev.map(function (k) { return lv[k]; }).join(', ') + ' instead of ' + lv.join(', ') + '.') +
      li('How', 'A permutation matrix $P$ is the identity with its rows shuffled. $P = ' + mTex(Pm) + '$. $PA = ' + mTex(PA) + '$ is the same rows in the new order, and the client\'s numbers move with them: $Pb = ' + vecTex(Pb) + '$.'),
      li('Why the answer doesn\'t change', 'It is like a shopping list: writing one item before another doesn\'t change what you buy. Each equation is still the same true fact.' + (x ? ' The lots are still ' + vec(x) + '. Check the new first row (' + lv[rev[0]] + '): ' + PA[0].map(function (a, j) { return fp(a) + ' × ' + fp(x[j]); }).join(' + ') + ' = ' + ft(dot(PA[0], x)) + ' ✓.' : '')),
      li('Swapping products', 'Swap ' + names[0] + ' and ' + names[1] + ' (that is $AP$, with $P$ on the right): $AP = ' + mTex(APc) + '$. It only renames who comes first.' + (x ? ' The lots are listed as (' + sw.map(function (k) { return names[k]; }).join(', ') + ') = ' + vec(sw.map(function (k) { return x[k]; })) + ': the same trades.' : '')),
      li('Why we care', 'A computer must swap rows when a pivot spot is 0 (you can\'t divide by 0). $P$ records the swap. ' + (F.swaps ? 'Your market needs one: it factors as $PA = LU$.' : 'Your market doesn\'t need one ($P = I$). Make a product pay 0 at the first level to see a swap.')) +
      li('Undo', 'Swapping twice brings you back, so undoing $P$ = flipping it: $P^{-1} = P^T$. There are ' + (n === 3 ? '3! = 6' : '2! = 2') + ' ways to order ' + n + ' Nifty levels.')
    ]));

    // 5. transpose (kept short on purpose)
    function dec(v) { return String(+v.num().toFixed(2)).replace('-', '−'); }
    function grid(title, rowHead, colHead, cell) {
      return '<table><tr><th>' + title + '</th>' + colHead.map(function (c) { return '<th>' + c + '</th>'; }).join("") + '</tr>' +
        rowHead.map(function (r, i) { return '<tr><th>' + r + '</th>' + colHead.map(function (_, j) { return '<td>' + cell(i, j) + '</td>'; }).join("") + '</tr>'; }).join("") + '</table>';
    }
    h.push('<h4>5. Transpose: flip the table</h4>' +
      '<div class="figs"><div>' + grid('$A$', lv, names, function (i, j) { return ft(A[i][j]); }) + '</div><div>' +
      grid('$A^T$', names, lv, function (i, j) { return ft(A[j][i]); }) + '</div></div>' +
      '<ul><li>Rows become columns. Nothing is calculated.</li>' +
      '<li>$A$: one row per Nifty level. $A^T$: one row per product, e.g. ' + names[0] + ' pays ' + vec(col(A, 0)) + '.</li>' +
      (symA ? '<li>In your market both tables look the same (the table is a mirror). That is a coincidence.</li>' : '') + '</ul>');

    // 6. value two ways: one table with totals on both edges
    var prem = P.map(function (pr) { return parseFr(pr.p); }), G = gaussJordan(A);
    if (x && !G.singular && !prem.some(function (p) { return p === null; })) {
      var q = Lv.map(function (_, j) { return prem.reduce(function (sm, p, k) { return sm.add(p.mul(G.inv[k][j])); }, ZERO); });
      var piece = function (j, i) { return x[j].mul(A[i][j]).mul(q[i]); }, total = dot(x, prem);
      h.push('<h4>6. Price your position two ways</h4>' +
        '<ul><li><b>Price of each Nifty level today</b> (from the premiums): ' + q.map(function (v, i) { return lv[i] + ' ≈ <b>' + dec(v) + '</b>'; }).join(', ') + '. Check ' + names[0] + ': ' + Lv.map(function (_, i) { return ft(A[i][0]) + ' × ' + dec(q[i]); }).join(' + ') + ' = ' + dec(prem[0]) + ' ✓' +
          (q.some(function (v) { return v.num() <= 0; }) ? ' <small>(a price ≤ 0 means ' + n + ' levels is too simple a model; see Lecture 04)</small>' : '') + '</li>' +
        '<li><b>Each cell</b> = lots × what it pays there × that level\'s price.</li></ul>' +
        '<table><tr><th></th>' + lv.map(function (L1) { return '<th>' + L1 + '</th>'; }).join("") + '<th>Add across</th></tr>' +
        names.map(function (nm, j) { var rs = Lv.reduce(function (sm, _, i) { return sm.add(piece(j, i)); }, ZERO); return '<tr><th>' + nm + ' (' + ft(x[j]) + ' lot)</th>' + Lv.map(function (_, i) { return '<td>' + dec(piece(j, i)) + '</td>'; }).join("") + '<td><b>' + dec(rs) + '</b></td></tr>'; }).join("") +
        '<tr><th>Add down</th>' + Lv.map(function (_, i) { var cs = names.reduce(function (sm, _, j) { return sm.add(piece(j, i)); }, ZERO); return '<td><b>' + dec(cs) + '</b></td>'; }).join("") + '<td><b>' + dec(total) + '</b></td></tr></table>' +
        '<ul><li><b>Add across</b> = each product\'s cost (its premium × lots). Total ' + dec(total) + '.</li>' +
        '<li><b>Add down</b> = what each Nifty level is worth. Total ' + dec(total) + '.</li>' +
        '<li>Same cells, so the same total. The transpose just switches which way you add: $x \\cdot (A^Tq) = (Ax) \\cdot q$.</li></ul>');
    } else h.push('<h4>6. Price your position two ways</h4><p>Needs a market with exactly one recipe and a premium for every product.</p>');

    // 7. A^T A, explained one multiplication at a time
    var S = matMul(AT, A), pairs = [];
    for (var jj = 0; jj < n; jj++) for (var kk = jj + 1; kk < n; kk++) pairs.push([jj, kk]);
    function levelLines(j, k) {
      return Lv.map(function (_, i) { return '<li>At ' + lv[i] + ': ' + ft(A[i][j]) + ' × ' + ft(A[i][k]) + ' = <b>' + ft(A[i][j].mul(A[i][k])) + '</b></li>'; }).join('') +
        '<li>Add the results: ' + Lv.map(function (_, i) { return fp(A[i][j].mul(A[i][k])); }).join(' + ') + ' = <b>' + ft(S[j][k]) + '</b></li>';
    }
    var j1 = 0, k1 = n > 1 ? 1 : 0;
    var h7 = [];
    h7.push('<h4>7. $A^TA$: comparing products, one multiplication at a time</h4>');
    // A with A
    h7.push('<p><b>' + names[j1] + ' compared with ' + names[j1] + '.</b> Take product ' + names[j1] + ', which pays ' + Lv.map(function (_, i) { return ft(A[i][j1]); }).join(' and ') + '. Multiply each number by itself:</p><ul>' + levelLines(j1, j1) + '</ul>' +
      '<p><b>So what does ' + ft(S[j1][j1]) + ' tell us?</b> It is a measure of ' + names[j1] + '\'s own payoff pattern: its payoffs multiplied by themselves and added. It is <b>not</b> saying that ' + names[j1] + ' pays ' + ft(S[j1][j1]) + ' points, ₹' + ft(S[j1][j1]) + ', or earns a profit of ' + ft(S[j1][j1]) + '. A product that pays more, or at more levels, gets a bigger number.</p>');
    // A with B
    if (n > 1) {
      h7.push('<p><b>' + names[j1] + ' compared with ' + names[k1] + '.</b> Now multiply ' + names[j1] + '\'s payoff by ' + names[k1] + '\'s payoff at each level:</p><ul>' + levelLines(j1, k1) + '</ul>' +
        '<p><b>So what does ' + ft(S[j1][k1]) + ' tell us?</b> How much ' + names[j1] + '\'s and ' + names[k1] + '\'s payoffs overlap when we compare them level by level. ' +
        Lv.map(function (_, i) { var u = A[i][j1], w = A[i][k1]; return 'At ' + lv[i] + ', ' + names[j1] + ' pays ' + ft(u) + ' and ' + names[k1] + ' pays ' + ft(w) + (u.isZero() || w.isZero() ? ', so this level adds nothing (one of them pays 0).' : ', so their product is ' + ft(u.mul(w)) + '.'); }).join(' ') +
        ' Adding these gives ' + ft(S[j1][k1]) + '.</p>');
      // difference table
      h7.push('<p><b>The difference between ' + ft(S[j1][j1]) + ' and ' + ft(S[j1][k1]) + '.</b></p>' +
        '<table><tr><th></th><th>Calculation</th><th>Result</th></tr>' +
        '<tr><td>' + names[j1] + ' compared with ' + names[j1] + '</td><td>' + Lv.map(function (_, i) { return ft(A[i][j1]) + '×' + ft(A[i][j1]); }).join(' + ') + '</td><td><b>' + ft(S[j1][j1]) + '</b></td></tr>' +
        '<tr><td>' + names[j1] + ' compared with ' + names[k1] + '</td><td>' + Lv.map(function (_, i) { return ft(A[i][j1]) + '×' + ft(A[i][k1]); }).join(' + ') + '</td><td><b>' + ft(S[j1][k1]) + '</b></td></tr></table>' +
        '<p>Think of it this way:</p><ul><li><b>' + ft(S[j1][j1]) + '</b>: how much do ' + names[j1] + '\'s payoffs multiply with ' + names[j1] + '\'s own payoffs?</li>' +
        '<li><b>' + ft(S[j1][k1]) + '</b>: how much do ' + names[j1] + '\'s payoffs multiply with ' + names[k1] + '\'s payoffs?</li>' +
        '<li>' + (S[j1][k1].isZero() ? 'A result of 0 means they never pay at the same level.' : S[j1][k1].num() >= 0.7 * S[j1][j1].num() ? 'The two numbers are close, so ' + names[k1] + ' pays in much the same scenarios as ' + names[j1] + '.' : 'The second number is much smaller, so ' + names[k1] + ' pays in different scenarios from ' + names[j1] + ' most of the time.') + '</li></ul>');
    }
    // remaining pairs and self-products, compactly
    if (n > 2) {
      var rest = [];
      for (var j = 0; j < n; j++) for (var k = j; k < n; k++) if (!((j === j1 && k === j1) || (j === j1 && k === k1))) rest.push([j, k]);
      h7.push('<p><b>The same for every other pair:</b></p><table><tr><th>Compared</th>' + lv.map(function (L1) { return '<th>At ' + L1 + '</th>'; }).join('') + '<th>Add</th></tr>' +
        rest.map(function (pr) { var j = pr[0], k = pr[1]; return '<tr><td>' + names[j] + ' with ' + names[k] + '</td>' + Lv.map(function (_, i) { return '<td>' + ft(A[i][j]) + '×' + ft(A[i][k]) + ' = ' + ft(A[i][j].mul(A[i][k])) + '</td>'; }).join('') + '<td><b>' + ft(S[j][k]) + '</b></td></tr>'; }).join('') + '</table>');
    }
    // the whole table and the mirror
    h7.push('<p><b>All the results in one table</b> (this table is $A^TA$):</p>' + grid('$A^TA$', names, names, function (j, k) { return '<b>' + ft(S[j][k]) + '</b>'; }));
    if (n > 1) h7.push('<p><b>Why the table is a mirror.</b> "' + names[j1] + ' compared with ' + names[k1] + '" and "' + names[k1] + ' compared with ' + names[j1] + '" multiply the same numbers, just the other way round: ' +
      Lv.map(function (_, i) { return ft(A[i][j1]) + '×' + ft(A[i][k1]) + ' = ' + ft(A[i][k1]) + '×' + ft(A[i][j1]); }).join(', ') + '. So both cells are ' + ft(S[j1][k1]) + ', and the table always reads the same on both sides of its diagonal.</p>');
    h.push(h7.join(''));

    // 8. column space first (complete), then vector space (complete)
    var zeroV = Lv.map(function () { return ZERO; });
    function payOf(lots) { return mulV(A, lots); }
    function lotsTxt(lots) { var parts = lots.map(function (v, j) { return v.isZero() ? null : (v.num() < 0 ? 'sell ' + ft(v.neg()) : ft(v)) + ' ' + names[j]; }).filter(Boolean); return parts.length ? parts.join(' + ') : 'no trade'; }
    function levelSum(lots) { return Lv.map(function (_, i) { var terms = lots.map(function (v, j) { return v.isZero() ? null : fp(v) + '×' + fp(A[i][j]); }).filter(Boolean); return '<li>At ' + lv[i] + ': ' + (terms.length ? terms.join(' + ') : '0') + ' = <b>' + ft(dot(A[i], lots)) + '</b></li>'; }).join(''); }
    var eJ = function (j) { return Lv.map(function (_, k) { return k === j ? ONE : ZERO; }); };
    var l1 = eJ(0), l2 = n > 1 ? eJ(1) : eJ(0), lBoth = l1.map(function (v, i) { return v.add(l2[i]); });
    var p1 = payOf(l1), p2 = payOf(l2), pBoth = payOf(lBoth), l3 = l1.map(function (v) { return v.mul(new Fr(3)); }), lNeg = l1.map(function (v) { return v.neg(); });
    var full = !R.bad.length && !R.free.length && F.zeroPiv < 0, rk = R.rank !== undefined ? R.rank : n;
    var h8 = [];
    h8.push('<h4>8. Which payoffs can you build? Column space, then vector space</h4>');

    // ---- 8a. COLUMN SPACE ----
    h8.push('<h4>8a. Column space</h4>' +
      '<p><b>Definition.</b> The column space $C(A)$ is the collection of all possible combinations of the columns of a particular matrix: <b>all the payoffs you can build from your available products</b>.</p>' +
      '<div class="box intuition"><span class="label">Remember this</span><p>Column space answers the question: <b>what outputs can I produce by combining the columns of this matrix?</b></p><p>If a target vector lies <b>inside</b> the column space, it can be created by some combination of the columns. If it lies <b>outside</b>, it cannot.</p></div>');
    var mixes = [l1, l2, lBoth, l1.map(function (v) { return v.mul(new Fr(2)); }), l1.map(function (v, i) { return v.sub(l2[i]); })];
    if (n === 3) mixes.push(Lv.map(function () { return ONE; }));
    h8.push('<p><b>How the diagram is formed, step by step.</b></p><ol>' +
      '<li><b>Draw each product as an arrow</b> from 0 to its payoff. The axes are the payoffs at ' + lv.join(' / ') + '. ' + names.map(function (nm, j) { return nm + ' pays ' + vec(col(A, j)) + ', so its arrow goes to that point'; }).join('; ') + '.</li>' +
      '<li><b>A mix = walking along the arrows.</b> x lots of ' + names[0] + (n > 1 ? ' then y lots of ' + names[1] : '') + ': walk along ' + names[0] + '\'s arrow x times, then along the next arrow. Where you land is the payoff of that mix:</li></ol>' +
      '<table><tr><th>Mix</th><th>Walk</th><th>Lands at (the payoff)</th></tr>' +
      mixes.map(function (mx) { return '<tr><td>' + lotsTxt(mx) + '</td><td>' + mx.map(function (v, j) { return v.isZero() ? null : fp(v) + '×' + vec(col(A, j)); }).filter(Boolean).join(' + ') + '</td><td><b>' + vec(payOf(mx)) + '</b></td></tr>'; }).join('') + '</table>' +
      '<ol start="3"><li><b>Colour every point you can land on</b>, trying every possible number of lots (including fractions and selling). ' +
        (rk >= n ? 'Your ' + n + ' products point in ' + n + ' different directions, so the landing points fill the <b>whole ' + (n === 2 ? 'plane' : 'space') + '</b>: everything is shaded.' : rk === 2 ? 'Your products only reach a <b>flat sheet</b> through 0 (they point in just 2 different directions), so only that sheet is shaded.' : 'Your products all point along <b>one line</b>, so only that line is shaded.') + '</li>' +
      '<li><b>Put in the client\'s point</b> ' + vec(tgt) + '. ' + (R.bad.length ? 'It is <b>off</b> the shaded part (outside), so no mix lands on it. The red dashed line shows the gap.' : 'It is <b>on</b> the shaded part (inside), so some walk lands on it: ' + lotsTxt(R.x) + ' (the dashed coloured path).') + '</li></ol>' +
      '<figure class="fig plot3d"><div id="lab8b" class="plot3d-box" style="height:460px"></div><figcaption><b>Your column space.</b> Arrows = your products. Shaded = every payoff they can build. Red dot = your client ' + vec(tgt) + (R.bad.length ? ': outside, cannot be built.' : ': inside, reached by ' + lotsTxt(R.x) + '.') + '</figcaption></figure>');
    if (!R.bad.length) h8.push('<p><b>Check the client, level by level:</b></p><ul>' + levelSum(R.x) + '</ul><p>' + lotsTxt(R.x) + ' pays exactly ' + vec(tgt) + ' ✓, so the client is <b>inside</b> $C(A)$.' + (full ? ' In fact every payoff is inside: $C(A) = \\mathbb{R}^' + n + '$.' : '') + '</p>');
    else h8.push('<p><b>The client is outside:</b> elimination ended with a row saying 0 = something non-zero, so no mix of lots pays exactly ' + vec(tgt) + '. The closest possible hedge is in the pricing section.</p>');

    // ---- 8b. VECTOR SPACE ----
    var aV = col(A, 0), bV = n > 1 ? col(A, 1) : null;
    var t = null; if (bV) { var k0 = -1; for (var i2 = 0; i2 < n; i2++) if (!aV[i2].isZero()) { k0 = i2; break; } if (k0 >= 0) { t = bV[k0].div(aV[k0]); if (!aV.every(function (v, i) { return v.mul(t).sub(bV[i]).isZero(); })) t = null; } }
    var half = aV.map(function (v) { return v.div(new Fr(2)); }), two = aV.map(function (v) { return v.mul(new Fr(2)); }), neg1 = aV.map(function (v) { return v.neg(); }), three = aV.map(function (v) { return v.mul(new Fr(3)); });
    h8.push('<h4>8b. Vector space</h4>' +
      '<p><b>Definition.</b> A vector space is a collection of vectors where <b>adding them or scaling them doesn\'t take you outside the collection</b>.</p>' +
      '<p><b>How the diagram is formed, step by step.</b> We build the simplest vector space from your market: all positions in <b>one</b> product, ' + names[0] + '.</p><ol>' +
      '<li><b>Start with 1 lot of ' + names[0] + '</b>: it pays ' + vec(aV) + '. Draw it as an arrow.</li>' +
      '<li><b>Scale it</b> (buy more, buy less, or sell): 2 lots pay ' + vec(two) + '; ½ lot pays ' + vec(half) + '; sell 1 lot (−1×) pays ' + vec(neg1) + '; 0 lots pay ' + vec(zeroV) + '.</li>' +
      '<li><b>All these points fall on one straight line through 0</b> (dashed): each one is ' + vec(aV) + ' times some number, so they all point the same way (or exactly the opposite way).</li>' +
      '<li><b>Add two of them</b>: 1 lot + 2 lots = 3 lots, paying ' + vec(aV) + ' + ' + vec(two) + ' = ' + vec(three) + ': still on the line. <b>Adding and scaling never leave the line, so the line is a vector space.</b></li>' +
      (bV ? '<li><b>Where is ' + names[1] + '?</b> ' + names[1] + ' pays ' + vec(bV) + '. ' + (t ? 'That is ' + ft(t) + ' × ' + names[0] + ', so it is <b>on</b> the line (a copy of ' + names[0] + ').' : 'To be on the line it would have to be ' + names[0] + ' × one number at every level' + (function () { var k = -1; for (var i = 0; i < n; i++) if (!aV[i].isZero()) { k = i; break; } if (k < 0) return ''; var tt = bV[k].div(aV[k]); return ' (at ' + lv[k] + ' that number would be ' + ft(bV[k]) + ' ÷ ' + ft(aV[k]) + ' = ' + ft(tt) + ', but ' + ft(tt) + ' × ' + vec(aV) + ' = ' + vec(aV.map(function (v) { return v.mul(tt); })) + ' ≠ ' + vec(bV) + ')'; })() + '. So ' + names[1] + ' is <b>off</b> the line: one product alone can\'t reach it, you need a second product.') + '</li>' : '') + '</ol>' +
      '<figure class="fig plot3d"><div id="lab8a" class="plot3d-box" style="height:420px"></div><figcaption><b>A vector space: the line of ' + names[0] + '.</b> Dashed = every multiple of ' + names[0] + ' ' + vec(aV) + '. ' + names[0] + ', 2×' + names[0] + ' and −1×' + names[0] + ' (red, selling) all lie on it. ' + (bV ? names[1] + ' (grey) ' + (t ? 'is on it too.' : 'is off it.') : '') + '</figcaption></figure>');
    h8.push('<p><b>The three rules, with your products.</b></p><ul>' +
      '<li><b>Add:</b> 1 ' + names[0] + ' ' + vec(p1) + ' + 1 ' + names[1 % n] + ' ' + vec(p2) + ' = ' + vec(pBoth) + ', which is the payoff of ' + lotsTxt(lBoth) + '. Holding two positions together just adds their lots.</li>' +
      '<li><b>Scale:</b> 3 lots of ' + names[0] + ' pay ' + vec(payOf(l3)) + '; selling 1 lot pays ' + vec(payOf(lNeg)) + '.</li>' +
      '<li><b>Zero:</b> no trade pays ' + vec(zeroV) + '.</li></ul>' +
      '<p><b>So what does this tell us?</b> The column space from 8a passes all three rules, so it is a vector space too: <b>the column space is the vector space your products make</b>. It is not saying every payoff can be built; that is the inside / outside question from 8a.</p>');
    if (!R.bad.length) {
      var X = R.x, pX = payOf(X);
      var cases = [
        { what: '10× your client', b: tgt.map(function (v) { return v.mul(new Fr(10)); }), how: 'multiply the lots by 10', lots: X.map(function (v) { return v.mul(new Fr(10)); }) },
        { what: 'your client + 1 lot of ' + names[0], b: tgt.map(function (v, i) { return v.add(p1[i]); }), how: 'add 1 to ' + names[0] + '\'s lots', lots: X.map(function (v, i) { return v.add(l1[i]); }) },
        { what: 'close your client (the opposite)', b: tgt.map(function (v) { return v.neg(); }), how: 'multiply the lots by −1', lots: X.map(function (v) { return v.neg(); }) },
        { what: 'half your client', b: tgt.map(function (v) { return v.div(new Fr(2)); }), how: 'halve the lots', lots: X.map(function (v) { return v.div(new Fr(2)); }) }
      ];
      h8.push('<h4>8c. Reuse your recipes (what the vector space gives you)</h4><p>Your client ' + vec(tgt) + ' = <b>' + lotsTxt(X) + '</b>. New clients made by adding or scaling this payoff need <b>no new solving</b>: do the same to the lots.</p>' +
        '<table><tr><th>New client</th><th>Wants</th><th>Do this with the lots</th><th>Recipe</th><th>Check (what it pays)</th></tr>' +
        cases.map(function (c) { var pay = payOf(c.lots), ok = pay.every(function (v, i) { return v.sub(c.b[i]).isZero(); }); return '<tr><td>' + c.what + '</td><td>' + vec(c.b) + '</td><td>' + c.how + '</td><td><b>' + lotsTxt(c.lots) + '</b></td><td>' + vec(pay) + ' ' + (ok ? '✓' : '✗') + '</td></tr>'; }).join('') + '</table>' +
        '<p><b>Column space</b> told us the client can be built and how. <b>Vector space</b> lets us reuse that recipe: add, scale, reverse or net payoffs by doing the same to the lots.</p>');
    }
    h8.push('<p><b>The catch: "buy only, never sell".</b> Suppose you are only allowed to buy (lots ≥ 0), like many funds.</p>' +
      '<table><tr><th>Rule</th><th>Example with your products</th><th>Buying and selling allowed</th><th>Buy only</th></tr>' +
      '<tr><td>Add</td><td>1 ' + names[0] + ' + 1 ' + names[1 % n] + ' pays ' + vec(pBoth) + '</td><td>✓</td><td>✓</td></tr>' +
      '<tr><td>Scale by 3</td><td>3 ' + names[0] + ' pays ' + vec(payOf(l3)) + '</td><td>✓</td><td>✓</td></tr>' +
      '<tr><td>Scale by −1</td><td>sell 1 ' + names[0] + ' pays ' + vec(payOf(lNeg)) + '</td><td>✓</td><td><b>✗ needs selling</b></td></tr>' +
      '<tr><td>Zero</td><td>no trade pays ' + vec(zeroV) + '</td><td>✓</td><td>✓</td></tr></table>' +
      '<p>With buy only, the "scale by −1" rule breaks, so buy-only payoffs are <b>not</b> a vector space. On the picture: you could only use the half of the line on ' + names[0] + '\'s side of 0.</p>');
    h.push(h8.join(''));
    tpvPics = { A: A, tgt: tgt, x: (!R.bad.length ? R.x : null), n: n, lv: lv, names: names, rank: R.rank !== undefined ? R.rank : (R.pivots ? R.pivots.length : n), piv: R.pivots || [] };
    return h.join("");
  }

  // ---------- UI ----------
  function readUI() {
    state.n = +document.querySelector('input[name="labn"]:checked').value;
    state.levels = []; for (var i = 0; i < state.n; i++) state.levels.push(parseInt(el("lablvl" + i).value, 10) || 0);
    state.products = []; state.target = [];
    for (var j = 0; j < state.n; j++) {
      state.products.push({ side: el("labside" + j).value, type: el("labtype" + j).value, k: parseInt(el("labk" + j).value, 10) || 0, p: el("labp" + j).value });
      state.target.push(el("labt" + j).value);
    }
    var tp = el("labtpre");
    if (tp) for (var o = 0; o < tp.options.length; o++) {
      var ov = tp.options[o].value;
      if (ov.indexOf("ad") === 0) tp.options[o].text = "Pays 1 only at " + fmtLvl(state.levels[+ov.slice(2)]) + " (Arrow–Debreu)";
    }
    state.challenge = el("labchal").checked;
    var mk = state.mkt;
    mk.S0 = parseFloat(el("labS0").value) || 20000; mk.T0 = Math.max(0, parseInt(el("labT0").value, 10) || 0);
    mk.iv = Math.max(0.1, parseFloat(el("labiv").value) || 13); mk.r = parseFloat(el("labr").value) || 0;
    mk.auto = el("labauto").checked;
    mk.lot = Math.max(1, parseInt(el("lablot").value, 10) || 65);
    var sl = el("labTn"); sl.max = mk.T0; mk.Tn = Math.min(parseInt(sl.value, 10) || 0, mk.T0); el("labTnv").textContent = mk.Tn;
    for (var q = 0; q < state.n; q++) {
      var inp = el("labp" + q);
      if (mk.auto) { var pv = premAuto(state.products[q]); state.products[q].p = pv.toFixed(2); inp.value = pv.toFixed(2); inp.disabled = true; }
      else inp.disabled = false;
    }
  }

  function buildControls(root) {
    var n = state.n, h = [];
    h.push('<div class="lab-controls">');
    h.push('<div class="lab-row"><b>Market preset:</b> <select id="labpreset"><option value="">— choose a ready-made market —</option>');
    Object.keys(PRESETS).forEach(function (k) { h.push('<option value="' + k + '">' + esc(PRESETS[k].label) + '</option>'); });
    h.push('</select> <button type="button" id="labrand" class="lab-btn">🎲 Random market</button></div>');
    h.push('<div class="lab-row"><b>Expiry levels:</b> <label><input type="radio" name="labn" value="2"' + (n === 2 ? " checked" : "") + '> 2 (2D)</label> <label><input type="radio" name="labn" value="3"' + (n === 3 ? " checked" : "") + '> 3 (3D)</label>');
    for (var i = 0; i < n; i++) h.push(' <span class="lab-lvl">Nifty level ' + (i + 1) + ': <input id="lablvl' + i + '" type="number" step="50" value="' + state.levels[i] + '"></span>');
    h.push('</div>');
    var mk = state.mkt;
    h.push('<div class="lab-row"><b>Time &amp; market today:</b> <span class="lab-lvl">Nifty spot <input id="labS0" type="number" step="50" value="' + mk.S0 + '"></span>' +
      ' <span class="lab-lvl">Days to expiry <input id="labT0" type="number" min="0" max="365" step="1" value="' + mk.T0 + '"></span>' +
      ' <span class="lab-lvl">IV % <input id="labiv" type="number" min="1" step="0.5" value="' + mk.iv + '"></span>' +
      ' <span class="lab-lvl">Rate % <input id="labr" type="number" step="0.25" value="' + mk.r + '"></span>' +
      ' <span class="lab-lvl">Lot size <input id="lablot" type="number" min="1" step="1" value="' + mk.lot + '" title="Quantity in 1 NSE Nifty lot"></span>' +
      ' <label><input type="checkbox" id="labauto"' + (mk.auto ? " checked" : "") + '> Auto premiums (Black–Scholes)</label></div>');
    h.push('<div class="lab-row"><b>Look at the position with</b> <input type="range" id="labTn" min="0" max="' + mk.T0 + '" step="1" value="' + Math.min(mk.Tn, mk.T0) + '" style="flex:1;min-width:160px;accent-color:var(--accent)"> <b id="labTnv">' + Math.min(mk.Tn, mk.T0) + '</b> days left <span style="color:var(--ink-soft)">(0 = at expiry: plain payoffs)</span></div>');
    h.push('<table class="lab-table"><tr><th>Product</th><th>Buy / sell</th><th>Type</th><th>Strike / entry</th><th>Premium today (points, optional)</th></tr>');
    for (var j = 0; j < n; j++) {
      var p = state.products[j];
      h.push('<tr><td><b>' + NAMES[j] + '</b> (lots = <i>' + VARS[j] + '</i>)</td>' +
        '<td><select id="labside' + j + '"><option value="buy"' + (p.side === "buy" ? " selected" : "") + '>Buy</option><option value="sell"' + (p.side === "sell" ? " selected" : "") + '>Sell</option></select></td>' +
        '<td><select id="labtype' + j + '">' + ["CE", "PE", "FUT", "BOND"].map(function (t) {
          var lbl = t === "FUT" ? "Future" : t === "BOND" ? "Bond" : t;
          return '<option value="' + t + '"' + (p.type === t ? " selected" : "") + '>' + lbl + '</option>';
        }).join("") + '</select></td>' +
        '<td><input id="labk' + j + '" type="number" step="50" value="' + p.k + '"' + (p.type === "BOND" ? " disabled" : "") + '></td>' +
        '<td><input id="labp' + j + '" type="text" placeholder="e.g. 120" value="' + esc(p.p || "") + '"></td></tr>');
    }
    h.push('</table>');
    h.push('<div class="lab-row"><b>Client wants</b> (in units of 100 points): ');
    for (var t = 0; t < n; t++) h.push('<span class="lab-lvl">at Nifty <input id="labtl' + t + '" type="number" step="50" value="' + state.levels[t] + '" title="Nifty level (same as Nifty level ' + (t + 1) + ' above)">: <input id="labt' + t + '" type="text" value="' + esc(state.target[t]) + '" size="5"></span> ');
    h.push(' <select id="labtpre"><option value="">target shapes…</option>');
    for (var q = 0; q < n; q++) h.push('<option value="ad' + q + '">Pays 1 only at ' + fmtLvl(state.levels[q]) + ' (Arrow–Debreu)</option>');
    h.push('<option value="one">Pays 1 everywhere (like a bond)</option>');
    if (n === 3) h.push('<option value="strad">Straddle shape (2, 0, 2)</option><option value="crash">Crash protection (3, 1, 0)</option><option value="rally">Rally bet (0, 1, 3)</option>');
    else h.push('<option value="down">Down bet (2, 0)</option><option value="up">Up bet (0, 2)</option>');
    h.push('</select></div>');
    h.push('<div class="lab-row"><label><input type="checkbox" id="labchal"' + (state.challenge ? " checked" : "") + '> Challenge mode: hide the answer, let me guess first</label></div>');
    h.push('</div><div id="labout"></div>');
    root.innerHTML = h.join("");

    function onChange() { readUI(); render(); }
    root.querySelectorAll("input,select").forEach(function (e) {
      if (e.id === "labpreset" || e.id === "labtpre" || e.name === "labn" || e.id === "labrand" || /^labtl\d/.test(e.id)) return;
      e.addEventListener("input", onChange); e.addEventListener("change", onChange);
    });
    // the level boxes in "Expiry levels" and in "Client wants" are the same numbers: keep them in sync
    for (var lv = 0; lv < n; lv++) (function (i) {
      var top = el("lablvl" + i), low = el("labtl" + i);
      function fromLow() { top.value = low.value; onChange(); }
      low.addEventListener("input", fromLow); low.addEventListener("change", fromLow);
      top.addEventListener("input", function () { low.value = top.value; });
    })(lv);
    root.querySelectorAll('select[id^="labtype"]').forEach(function (s) {
      s.addEventListener("change", function () { var j = s.id.slice(7); el("labk" + j).disabled = s.value === "BOND"; });
    });
    root.querySelectorAll('input[name="labn"]').forEach(function (r) {
      r.addEventListener("change", function () {
        readUI(); var n2 = +r.value;
        if (n2 === 3 && state.levels.length < 3) { state.levels.push(state.levels[state.levels.length - 1] + 100); }
        state.n = n2; loadPreset(n2 === 3 ? "ex2" : "two", true);
      });
    });
    el("labpreset").addEventListener("change", function () { if (this.value) loadPreset(this.value); });
    el("labtpre").addEventListener("change", function () {
      var v = this.value, t = [], i;
      for (i = 0; i < state.n; i++) t.push("0");
      if (v.indexOf("ad") === 0) t[+v.slice(2)] = "1";
      else if (v === "one") t = t.map(function () { return "1"; });
      else if (v === "strad") t = ["2", "0", "2"]; else if (v === "crash") t = ["3", "1", "0"]; else if (v === "rally") t = ["0", "1", "3"];
      else if (v === "down") t = ["2", "0"]; else if (v === "up") t = ["0", "2"];
      else return;
      t.forEach(function (x, i2) { el("labt" + i2).value = x; });
      readUI(); render();
    });
    el("labchal").addEventListener("change", function () { state.revealed = false; });
    el("labrand").addEventListener("click", randomMarket);
  }

  function loadPreset(key, keepLevels) {
    var P = PRESETS[key];
    state.n = P.n; state.levels = P.levels.slice(); state.products = P.products.map(function (p) { return Object.assign({}, p); });
    state.target = P.target.slice(); state.revealed = false; state.mkt.auto = !!P.auto; state.mkt.Tn = 0;
    buildControls(el("replab")); readUI(); render();
  }

  function randomMarket() {
    readUI();
    var n = state.n, L = state.levels, tries = 0, prods, A;
    var types = ["CE", "CE", "PE", "PE", "FUT", "BOND"];
    do {
      prods = [];
      for (var j = 0; j < n; j++) {
        var t = types[Math.floor(Math.random() * types.length)];
        var base = L[Math.floor(Math.random() * n)] + [-100, 0, 100][Math.floor(Math.random() * 3)];
        prods.push({ side: Math.random() < 0.8 ? "buy" : "sell", type: t, k: t === "BOND" ? 0 : base, p: "" });
      }
      A = L.map(function (S) { return prods.map(function (pr) { return toFr(valuePts(pr, S, state.mkt.Tn)); }); });
      tries++;
    } while (solve(A, L.map(function () { return ZERO; })).rank < n && tries < 300);
    var x = prods.map(function () { var v = Math.floor(Math.random() * 5) - 2; return v === 0 ? 1 : v; });
    var b = A.map(function (row) { return row.reduce(function (s, a, j) { return s.add(a.mul(new Fr(x[j]))); }, ZERO); });
    state.products = prods; state.target = b.map(function (f) { return f.f ? fmtDec(f.n) : f.d === 1 ? String(f.n) : f.n + "/" + f.d; });
    state.mkt.auto = true;
    state.challenge = true; state.revealed = false;
    buildControls(el("replab")); readUI(); render();
  }

  // ---------- render ----------
  function render() {
    var out = el("labout"), n = state.n, L = state.levels, P = state.products;
    var tgt = state.target.map(parseFr);
    if (tgt.some(function (t) { return t === null; })) { out.innerHTML = '<p class="lab-warn">Enter a number for every target payoff.</p>'; return; }
    var A = L.map(function (S) { return P.map(function (pr) { return toFr(valuePts(pr, S, state.mkt.Tn)); }); });
    var R = solve(A, tgt);
    var hidden = state.challenge && !state.revealed;
    var h = [], vars = VARS.slice(0, n), names = NAMES.slice(0, n);

    // 1. question
    var mk = state.mkt, Tn = mk.Tn;
    var when = Tn > 0 ? 'with <b>' + Tn + ' day' + (Tn > 1 ? 's' : '') + ' still left to expiry</b>, Nifty could be at' : 'Nifty will expire at';
    h.push('<h4>1. The question</h4><div class="box finance"><span class="label">Generated from your inputs</span><p>Today Nifty is at <b>' + fmtLvl(mk.S0) + '</b> with <b>' + mk.T0 + ' days</b> to expiry (IV ' + mk.iv + '%, rate ' + mk.r + '%). ' +
      'Later, ' + when + ' one of these levels: <b>' + L.map(fmtLvl).join("</b>, <b>") + '</b>. Values are in Nifty points ÷ 100, per 1 quantity; 1 lot = ' + mk.lot + ' quantity, so a value of 1 = 100 points = ' + rupees(1) + ' on 1 lot. You can trade:</p><ul>' +
      P.map(function (pr, j) { return '<li><b>' + names[j] + '</b> = ' + esc(prodLabel(pr)) + '</li>'; }).join("") +
      '</ul><p>A client wants a position ' + (Tn > 0 ? 'worth' : 'that pays') + ' ' + L.map(function (S, i) { return '<b>' + tgt[i].txt() + '</b> (' + Math.round(tgt[i].num() * 100) + ' points = ' + rupees(tgt[i].num()) + ' per lot) if Nifty ' + (Tn > 0 ? 'is at ' : 'expires at ') + fmtLvl(S); }).join(", ") + (Tn > 0 ? ' at that moment' : '') +
      '. <b>How many lots ' + vars.map(function (v) { return "$" + v + "$"; }).join(", ") + ' of ' + names.join(", ") + '</b> should you trade?</p></div>');

    // 2. payoff table
    if (Tn > 0) h.push('<div class="box intuition"><span class="label">Before expiry: payoff + time value</span><p>With ' + Tn + ' days left, an option is worth more than its expiry payoff $\\max(S - K, 0)$: it still has <b>time value</b> (the chance of moving further in the money). Each value below comes from the <b>Black–Scholes</b> formula (spot = that Nifty level, ' + Tn + ' days, IV ' + mk.iv + '%, rate ' + mk.r + '%). So the columns are no longer sharp "hockey sticks" but smooth curves, and the lots that copy the client change as time passes. Drag the <b>days-left</b> slider to watch this (time decay, theta).</p></div>');
    h.push('<h4>2. ' + (Tn > 0 ? 'What each product is worth with ' + Tn + ' days left' : 'Where the payoff numbers come from') + '</h4><table><tr><th>Product</th>' + L.map(function (S) { return '<th>At ' + fmtLvl(S) + '</th>'; }).join("") + '</tr>');
    P.forEach(function (pr, j) { h.push('<tr><td><b>' + names[j] + '</b>: ' + esc(prodLabel(pr)) + '</td>' + L.map(function (S) { return '<td>' + formulaTxt(pr, S) + '</td>'; }).join("") + '</tr>'); });
    h.push('</table>');
    h.push('<p><b>In rupees, per 1 lot (' + mk.lot + ' quantity):</b></p><table><tr><th>Product</th>' + L.map(function (S) { return '<th>At ' + fmtLvl(S) + '</th>'; }).join("") + '</tr>' +
      P.map(function (pr, j) { return '<tr><td>' + names[j] + '</td>' + L.map(function (S, i) { return '<td>' + rupees(A[i][j].num()) + '</td>'; }).join("") + '</tr>'; }).join("") + '</table>');

    // 3. equations
    var eqs = A.map(function (row, i) { return eqTex(row, tgt[i], n) + " &&\\text{(Nifty at " + fmtLvl(L[i]) + (Tn > 0 ? ", " + Tn + "d left" : "") + ")}"; });
    h.push('<h4>3. The equations (one row per ' + (Tn > 0 ? 'Nifty level, ' + Tn + ' days before expiry' : 'expiry level') + ')</h4>$$\\begin{aligned}' + eqs.map(function (e) { return e.replace(" = ", " &= "); }).join(" \\\\ ") + '\\end{aligned}$$');
    h.push('$$\\underbrace{\\begin{bmatrix}' + A.map(function (r) { return r.map(function (v) { return v.tex(); }).join(" & "); }).join(" \\\\ ") +
      '\\end{bmatrix}}_{\\text{columns} = ' + names.join(", ") + '}\\begin{bmatrix}' + vars.join("\\\\") + '\\end{bmatrix} = \\underbrace{' + vecTex(tgt) + '}_{\\text{client}}$$');
    h.push('<table><tr><th>Part</th><th>Market meaning</th></tr><tr><td>row $i$</td><td>' + (Tn > 0 ? 'what every product is worth if Nifty is at level $i$ (with ' + Tn + ' days left)' : 'what every product pays if Nifty expires at level $i$') + '</td></tr><tr><td>column $j$</td><td>product $j$\'s ' + (Tn > 0 ? 'value' : 'payoff') + ' at every level (its "arrow")</td></tr><tr><td>' + vars.map(function (v) { return "$" + v + "$"; }).join(", ") + '</td><td>lots of ' + names.join(", ") + '</td></tr><tr><td>right side</td><td>the client\'s wanted payoff</td></tr></table>');

    // challenge guess box
    if (state.challenge) {
      h.push('<div class="mixer"><b>Your guess:</b> ' + vars.map(function (v, j) { return v + ' = <input id="labg' + j + '" type="text" size="4" placeholder="lots">'; }).join(" ") +
        ' <button type="button" id="labcheck" class="lab-btn">Check my guess</button> <button type="button" id="labreveal" class="lab-btn">' + (state.revealed ? "Hide answer" : "Reveal answer") + '</button><div id="labgout"></div></div>');
    }

    // diagnosis
    var diag;
    if (R.bad.length) diag = '<div class="box pitfall"><span class="label">Diagnosis: can\'t be built exactly</span><p>Elimination leaves a row that says <b>0 = something non-zero</b>. The client\'s payoff is <b>outside the column space</b>: no mix of these products copies it. See the closest possible hedge in step 6.</p></div>';
    else if (R.free.length) diag = '<div class="box intuition"><span class="label">Diagnosis: many ways to build it</span><p>Some product is a <b>copy</b> of the others (a missing pivot). There is a whole family of answers, and a <b>zero-payoff trade</b> (nullspace). See step 8 for the arbitrage check.</p></div>';
    else diag = '<div class="box theorem"><span class="label">Diagnosis: exactly one way to build it</span><p>Every column has a pivot: the products are independent, so there is exactly one recipe.</p></div>';

    luPics = null; tpvPics = null; csnPics = null;
    var hh = [], closest = null, invMode = el("replab").hasAttribute("data-inv"), luMode = el("replab").hasAttribute("data-lu"), tpvMode = el("replab").hasAttribute("data-tpv"), csnMode = el("replab").hasAttribute("data-csn"), hhMain = hh;
    if (invMode || luMode || tpvMode || csnMode) hh = [];   // elimination sections still run (for R, tradeTxt, closest) but are not shown
    hh.push('<h4>4. Elimination, step by step</h4>' + diag + '<p>Start with the augmented matrix (products on the left, client on the right):</p>$$' + augTex(A.map(function (r, i) { return r.concat([tgt[i]]); }), n) + '$$');
    var sn = 1, elimMode = el("replab").hasAttribute("data-elim");
    function matTex(Mx) { return "\\begin{bmatrix}" + Mx.map(function (r) { return r.map(function (v) { return v.tex(); }).join(" & "); }).join(" \\\\ ") + "\\end{bmatrix}"; }
    R.steps.forEach(function (s) {
      if (s.kind === "swap") {
        hh.push('<p><b>Step ' + (sn++) + ' (swap).</b> The pivot spot (row ' + (s.r1 + 1) + ', column ' + (s.col + 1) + ') is 0, but row ' + (s.r2 + 1) + ' has a non-zero number there. Swap rows ' + (s.r1 + 1) + ' and ' + (s.r2 + 1) + ' (just reorder the scenarios):</p>$$' + augTex(s.mat, n) + '$$');
        if (elimMode) hh.push('<p class="lab-emat">As a matrix: the permutation $P_{' + (s.r1 + 1) + (s.r2 + 1) + '} = ' + matTex(s.E) + '$, the identity with rows ' + (s.r1 + 1) + ' and ' + (s.r2 + 1) + ' swapped, multiplying from the left.</p>');
      }
      else if (s.kind === "nopivot") hh.push('<p><b>Step ' + (sn++) + ' (no pivot).</b> Column ' + (s.col + 1) + ' (product ' + names[s.col] + ') has only zeros from row ' + (s.row + 1) + ' down. It adds <b>no new direction</b>: product ' + names[s.col] + ' is a mix of the earlier products. Move on to the next column.</p>');
      else if (s.kind === "zero") hh.push('<p><b>Step ' + (sn++) + '.</b> Row ' + (s.row + 1) + ' already has 0 in column ' + (s.col + 1) + ' (multiplier 0). Nothing to do.</p>');
      else {
        hh.push('<p><b>Step ' + (sn++) + '.</b> Pivot $= ' + s.piv.tex() + '$ (row ' + (s.prow + 1) + '). Number to remove $= ' + s.remove.tex() + '$. Multiplier $= ' + s.remove.tex() + ' \\div ' + s.piv.tex() + ' = ' + s.mult.tex() + '$. Row ' + (s.row + 1) + ' $-\\,' + s.mult.tex() + '\\times$ row ' + (s.prow + 1) + ':</p>');
        hh.push('<table><tr><th></th>' + vars.map(function (v) { return '<th>$' + v + '$</th>'; }).join("") + '<th>client</th></tr>' +
          '<tr><td>Row ' + (s.row + 1) + '</td>' + s.before.map(function (v) { return '<td>$' + v.tex() + '$</td>'; }).join("") + '</tr>' +
          '<tr><td>minus $' + s.mult.tex() + '\\times$ row ' + (s.prow + 1) + '</td>' + s.sub.map(function (v) { return '<td>$' + v.neg().tex() + '$</td>'; }).join("") + '</tr>' +
          '<tr><td><b>New row ' + (s.row + 1) + '</b></td>' + s.after.map(function (v) { return '<td><b>$' + v.tex() + '$</b></td>'; }).join("") + '</tr></table>');
        if (elimMode) hh.push('<p class="lab-emat">As a matrix: $E_{' + (s.row + 1) + (s.prow + 1) + '} = ' + matTex(s.E) + '$: the identity with $' + s.mult.neg().tex() + '$ (minus the multiplier) in row ' + (s.row + 1) + ', column ' + (s.prow + 1) + '. Multiplying by it from the left does exactly this row operation.</p>');
      }
    });
    hh.push('<p>Staircase reached:</p>$$' + augTex(R.M, n) + '$$');
    if (elimMode) {
      var U = R.M.map(function (r) { return r.slice(0, n); });
      var EA = R.Et.map(function (r) { return A[0].map(function (_, j) { return r.reduce(function (sm, v, k) { return sm.add(v.mul(A[k][j])); }, ZERO); }); });
      var okE = EA.every(function (r, i) { return r.every(function (v, j) { return v.sub(U[i][j]).isZero(); }); });
      var stepNames = R.steps.filter(function (st) { return st.E; }).map(function (st) { return st.kind === "swap" ? "P_{" + (st.r1 + 1) + (st.r2 + 1) + "}" : "E_{" + (st.row + 1) + (st.prow + 1) + "}"; });
      hh.push('<div class="box theorem"><span class="label">All the steps as one matrix</span><p>Multiply the step matrices in order (the first step sits closest to $A$):</p>$$E = ' +
        (stepNames.length ? stepNames.slice().reverse().join("\\,") : "I") + ' = ' + matTex(R.Et) + '$$' +
        '<p><b>Check $EA = U$</b> (the staircase):</p>$$' + matTex(R.Et) + matTex(A) + ' = ' + matTex(EA) + (okE ? '\\;✓' : '') + '$$' +
        '<p>The same $E$ also turns the client column $b$ into the new right side: $Eb = ' + vecTex(R.M.map(function (r) { return r[n]; })) + '$.</p></div>');
    }

    // 5. back substitution / answer
    var tradeTxt = function (x) {
      return x.map(function (v, j) {
        if (v.isZero()) return "no " + names[j];
        var lots = v.n < 0 ? v.neg() : v, verb = (v.n < 0) ? (P[j].side === "buy" ? "sell" : "buy") : (P[j].side === "buy" ? "buy" : "sell");
        var inner = P[j].type === "BOND" ? "bond" : P[j].type === "FUT" ? "Nifty future @ " + fmtLvl(P[j].k) : fmtLvl(P[j].k) + " " + P[j].type;
        return verb + " " + lots.txt() + " × " + inner;
      }).join(", ");
    };
    if (R.bad.length) {
      hh.push('<h4>5. What the last row says</h4>');
      R.bad.forEach(function (i) { hh.push('<p>Row ' + (i + 1) + ' reads $0 = ' + R.M[i][n].tex() + '$, which is impossible. The client\'s payoff cannot be built.</p>'); });
      // closest hedge (least squares on pivot columns)
      var cols = R.pivots, An = A.map(function (r) { return r.map(function (v) { return v.num(); }); }), bn = tgt.map(function (v) { return v.num(); });
      var k2 = cols.length, G = [], g = [];
      for (var a = 0; a < k2; a++) { G.push([]); g.push(0); for (var c2 = 0; c2 < k2; c2++) { var sg = 0; for (var r2 = 0; r2 < n; r2++) sg += An[r2][cols[a]] * An[r2][cols[c2]]; G[a].push(sg); } for (var r3 = 0; r3 < n; r3++) g[a] += An[r3][cols[a]] * bn[r3]; }
      for (var p1 = 0; p1 < k2; p1++) { for (var p2 = p1 + 1; p2 < k2; p2++) { var f = G[p2][p1] / G[p1][p1]; for (var q1 = p1; q1 < k2; q1++) G[p2][q1] -= f * G[p1][q1]; g[p2] -= f * g[p1]; } }
      var w = new Array(k2).fill(0); for (var p3 = k2 - 1; p3 >= 0; p3--) { var sm = g[p3]; for (var q2 = p3 + 1; q2 < k2; q2++) sm -= G[p3][q2] * w[q2]; w[p3] = sm / G[p3][p3]; }
      var xf = new Array(n).fill(0); cols.forEach(function (c3, i) { xf[c3] = w[i]; });
      closest = xf;
      var got = An.map(function (r) { return r.reduce(function (s, v, j) { return s + v * xf[j]; }, 0); });
      hh.push('<h4>6. The closest possible hedge</h4><p>Since an exact copy is impossible, find the mix whose payoff is <b>as close as possible</b> to the client\'s (smallest total squared miss, "least squares", coming in Unit II): ' +
        vars.map(function (v, j) { return '$' + v + ' \\approx ' + (+xf[j].toFixed(3)) + '$'; }).join(", ") + '.</p><table><tr><th>Nifty at</th><th>Client wants</th><th>Closest hedge pays</th><th>Miss</th></tr>' +
        L.map(function (S, i) { return '<tr><td>' + fmtLvl(S) + '</td><td>' + (+bn[i].toFixed(3)) + '</td><td>' + (+got[i].toFixed(3)) + '</td><td>' + (+(bn[i] - got[i]).toFixed(3)) + '</td></tr>'; }).join("") + '</table>' +
        '<p>The "miss" is risk the market maker must carry, which is why hard-to-replicate options trade at a premium.</p>');
    } else {
      hh.push('<h4>5. Back substitution (bottom to top)</h4>');
      if (R.free.length) hh.push('<p>Free choice: ' + R.free.map(function (f) { return '$' + vars[f] + '$'; }).join(", ") + ' (no pivot). Set ' + (R.free.length > 1 ? "them" : "it") + ' to $0$ to get one answer.</p>');
      hh.push('<table><tr><th>Row</th><th>Equation</th><th>Result</th></tr>');
      R.bs.forEach(function (b) {
        hh.push('<tr><td>' + (b.row + 1) + '</td><td>$' + eqTex(b.coefs, b.rhs, n) + '$' + (b.known.length ? '<br>put ' + b.known.map(function (j) { return '$' + vars[j] + ' = ' + b.xsnap[j].tex() + '$'; }).join(", ") : "") +
          '</td><td>$' + vars[b.pc] + ' = ' + b.val.tex() + '$</td></tr>');
      });
      hh.push('</table>');
      var x = R.x;
      hh.push('<p class="answer">Answer: ' + vars.map(function (v, j) { return '$' + v + ' = ' + x[j].tex() + '$'; }).join(", ") + '. In trading words: ' + esc(tradeTxt(x)) + '.</p>');
      hh.push('<h4>6. Check, scenario by scenario</h4><table><tr><th>Nifty at</th>' + names.map(function (nm, j) { return '<th>$' + x[j].tex() + '\\times$ ' + nm + '</th>'; }).join("") + '<th>Total</th><th>Client wants</th></tr>');
      A.forEach(function (row, i) {
        var tot = ZERO, cells = row.map(function (a, j) { var v = a.mul(x[j]); tot = tot.add(v); return '<td>$' + v.tex() + '$</td>'; }).join("");
        hh.push('<tr><td>' + fmtLvl(L[i]) + '</td>' + cells + '<td>$' + tot.tex() + '$</td><td>$' + tgt[i].tex() + '$ ✓</td></tr>');
      });
      hh.push('</table>');
      if (R.nulls.length) {
        R.nulls.forEach(function (z) {
          hh.push('<p><b>Zero-payoff trade (nullspace):</b> $' + vecTex(z) + '$, i.e. ' + esc(tradeTxt(z)) + '. It pays 0 at every level, so you can add any multiple of it to the answer and still copy the client\'s payoff.</p>');
        });
      }
    }

    // 7. pictures
    if (invMode) { hh = hhMain; hh.push(invSections(A, tgt, L, n, vars, names, R, tradeTxt)); }
    if (luMode) { hh = hhMain; hh.push(luSections(A, tgt, L, n, vars, names, R, tradeTxt)); }
    if (tpvMode) { hh = hhMain; hh.push(tpvSections(A, tgt, L, n, vars, names, R, tradeTxt, P)); }
    if (csnMode) { hh = hhMain; hh.push(csnSections(A, tgt, L, n, vars, names, R, tradeTxt, P)); }

    // 7. pictures: captions written with the live numbers
    var shape = n === 2 ? "line" : "flat sheet", shapes = n === 2 ? "lines" : "sheets";
    var mixOf = names.join(" and ").replace(/ and (?=.* and )/g, ", ");
    var lotsVec = "(" + vars.join(", ") + ")";
    var meet;
    if (R.bad.length) meet = 'Here the ' + shapes + ' <b>never all meet</b> at one point: no mix of lots pays what the client wants at every level.';
    else if (R.free.length) meet = 'Here they meet along a <b>whole line</b>, not one point: many different mixes work.';
    else meet = 'Here they meet at ' + vars.map(function (v, j) { return '$' + v + ' = ' + R.x[j].tex() + '$'; }).join(", ") + ': that one mix works at <b>every</b> level at once. That point is the answer.';
    var rowCap = '<b>Row picture: one Nifty level at a time.</b><ul>' +
      '<li>The axes are <b>lots</b>: how many of ' + mixOf + ' you buy, ' + lotsVec + '.</li>' +
      '<li>Each ' + shape + ' is one Nifty level. The ' + fmtLvl(L[0]) + ' ' + shape + ' holds every mix of lots that pays exactly <b>' + tgt[0].txt() + '</b> if Nifty ends at ' + fmtLvl(L[0]) + ' (what the client wants there). Same for ' + L.slice(1).map(fmtLvl).join(" and ") + '.</li>' +
      '<li>A mix that works at one level can fail at another. You need a point on <b>all</b> the ' + shapes + '.</li>' +
      '<li>' + meet + '</li></ul>';
    var colCap = '<b>Column picture: one product at a time.</b><ul>' +
      '<li>The axes are <b>payoffs</b>: what you get if Nifty ends at ' + L.map(fmtLvl).join(" / ") + '.</li>' +
      '<li>Each arrow is <b>1 lot</b> of one product. Arrow ' + names[0] + ' points to ' + '(' + A.map(function (r) { return r[0].txt(); }).join(", ") + '): that is what 1 lot of ' + names[0] + ' pays at each level.</li>' +
      '<li>Buying more lots stretches the arrow; selling flips it. Buying two products means walking along one arrow, then the next from where you stopped.</li>' +
      '<li>The red dot is the client\'s payoff (' + tgt.map(function (t) { return t.txt(); }).join(", ") + '). ' +
        (R.bad.length ? 'No walk along these arrows reaches it: the red dot is outside what the products can build.'
          : R.free.length ? 'Several different walks end on the red dot: that is why there are many answers.'
          : 'The recipe is the walk that ends exactly on the red dot: ' + names.map(function (nm, j) { return '$' + R.x[j].tex() + '$ lot' + (R.x[j].num() === 1 ? '' : 's') + ' of ' + nm; }).join(', then ') + '.') + '</li></ul>';
    hh.push('<h4>7. Row picture and column picture</h4><div class="figs"><figure class="fig plot3d" style="margin:0"><div id="labrow" class="plot3d-box"></div><figcaption>' + rowCap + '</figcaption></figure>' +
      '<figure class="fig plot3d" style="margin:0"><div id="labcol" class="plot3d-box"></div><figcaption>' + colCap + '</figcaption></figure></div>');

    if (!el("replab").hasAttribute("data-elim") && !invMode && !luMode && !tpvMode && !csnMode) hh.push(planeGuide(A, tgt, L, n, vars, names, R));

    // 8. pricing
    var prem = P.map(function (pr) { return parseFr(pr.p); });
    hh.push('<h4>8. Price and arbitrage check</h4>');
    if (mk.auto) hh.push('<p>Premiums today come from <b>Black–Scholes</b> (Nifty ' + fmtLvl(mk.S0) + ', ' + mk.T0 + ' days, IV ' + mk.iv + '%, rate ' + mk.r + '%). Black–Scholes prices are consistent with each other, so they never create arbitrage. Untick "Auto premiums" and type real LTPs from the NSE option chain to hunt for real mispricings.</p>');
    if (prem.some(function (p) { return p === null; })) hh.push('<p>Enter a premium (in points) for every product to price the client\'s payoff and check for arbitrage.</p>');
    else {
      if (!R.bad.length) {
        var cost = ZERO; R.x.forEach(function (v, j) { cost = cost.add(v.mul(prem[j])); });
        hh.push('<table><tr><th>Leg</th><th>Lots</th><th>Premium</th><th>Cost</th></tr>' + R.x.map(function (v, j) { return '<tr><td>' + names[j] + ': ' + esc(prodLabel(P[j])) + '</td><td>$' + v.tex() + '$</td><td>' + prem[j].txt() + '</td><td>$' + v.mul(prem[j]).tex() + '$</td></tr>'; }).join("") +
          '<tr><td colspan="3"><b>Total cost today</b></td><td><b>$' + cost.tex() + '$ points</b><br>= ' + rupees(cost.num() / 100) + ' for these lots (' + mk.lot + ' quantity per lot)</td></tr></table><p class="answer">Fair price of the client\'s payoff ≈ ' + (+cost.num().toFixed(2)) + ' points (the cost of the recipe that copies it).</p>');
        var nonneg = tgt.every(function (t) { return t.n >= 0; }), somepos = tgt.some(function (t) { return t.n > 0; });
        if (nonneg && somepos && cost.n <= 0) hh.push('<div class="box pitfall"><span class="label">Arbitrage!</span><p>The client\'s payoff <b>never loses</b> and sometimes pays, yet copying it costs <b>' + (+cost.num().toFixed(2)) + ' points</b> today (zero or negative). Buy the recipe: you are paid (or pay nothing) now and can only gain at expiry. These premiums are inconsistent: a butterfly, for example, must always cost more than zero.</p></div>');
        (R.nulls || []).forEach(function (z) {
          var zc = ZERO; z.forEach(function (v, j) { zc = zc.add(v.mul(prem[j])); });
          if (zc.isZero()) hh.push('<p><b>No arbitrage:</b> the zero-payoff trade costs 0, as it should. The premiums are consistent.</p>');
          else {
            var rev = zc.n > 0 ? z.map(function (v) { return v.neg(); }) : z, gain = zc.n > 0 ? zc : zc.neg();
            hh.push('<div class="box pitfall"><span class="label">Arbitrage!</span><p>The trade ' + esc(tradeTxt(rev)) + ' pays <b>0 in every scenario</b>, but you <b>receive ' + gain.txt() + ' points today</b> for it. Free money: the premiums break the rule "zero payoff ⇒ zero price" (e.g. put–call parity).</p></div>');
          }
        });
      } else {
        var cc = closest.reduce(function (sm, v, j) { return sm + v * prem[j].num(); }, 0);
        hh.push('<p>The payoff can\'t be copied exactly, so these products give it no single "fair" price. The closest hedge costs ≈ <b>' + (+cc.toFixed(2)) + ' points</b>; the miss is unhedgeable risk the seller must charge extra for.</p>');
      }
    }

    if (luMode || tpvMode) hh = hh.map(function (t) { return t.replace('<h4>7. Row picture', '<h4>9. Row picture').replace('<h4>8. Price and arbitrage', '<h4>10. Price and arbitrage'); });
    if (invMode) {
      hh = hh.map(function (t) { return t.replace('<h4>7. Row picture', '<h4>10. Row picture').replace('<h4>8. Price and arbitrage', '<h4>11. Price and arbitrage'); });
      var GJ = gaussJordan(A), premI = P.map(function (pr) { return parseFr(pr.p); });
      if (!GJ.singular && !premI.some(function (p) { return p === null; })) hh.push(statePrices(GJ.inv, premI, tgt, L, names, P));
    }
    h.push('<div id="labreveal-wrap"' + (hidden ? ' hidden' : '') + '>' + hh.join("") + '</div>');
    out.innerHTML = h.join("");

    if (state.challenge) {
      el("labreveal").addEventListener("click", function () { state.revealed = !state.revealed; render(); });
      el("labcheck").addEventListener("click", function () {
        var gs = vars.map(function (_, j) { return parseFr(el("labg" + j).value); });
        if (gs.some(function (g) { return g === null; })) { el("labgout").innerHTML = "<p>Fill in every guess.</p>"; return; }
        var ok = true, rows = A.map(function (row, i) {
          var tot = row.reduce(function (s, a, j) { return s.add(a.mul(gs[j])); }, ZERO), hit = tot.sub(tgt[i]).isZero(); ok = ok && hit;
          return '<tr><td>' + fmtLvl(L[i]) + '</td><td>' + tot.txt() + '</td><td>' + tgt[i].txt() + '</td><td>' + (hit ? "✓" : "✗") + '</td></tr>';
        }).join("");
        el("labgout").innerHTML = '<table><tr><th>Nifty at</th><th>Your mix pays</th><th>Client wants</th><th></th></tr>' + rows + '</table><p class="answer">' + (ok ? "Correct! Your recipe copies the client's payoff." : "Not yet: some scenarios miss. Adjust and try again, or reveal the answer.") + '</p>';
        typeset(el("labgout"));
      });
    }
    typeset(out);
    if (!hidden) drawPlots(A, tgt, R, n);
    if (!hidden && luMode && luPics && document.getElementById("lablu1")) drawLuPics(luPics);
    if (!hidden && tpvMode && tpvPics && document.getElementById("lab8a")) drawTpvPics(tpvPics);
    if (!hidden && csnMode && csnPics && document.getElementById("lab7cs")) { drawTpvPics(csnPics.cs); drawCsnNull(csnPics.ns); }
  }

  function typeset(node) {
    if (window.renderMathInElement) {
      renderMathInElement(node, { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false });
    } else setTimeout(function () { typeset(node); }, 300);
  }

  // ---------- pictures ----------
  function drawPlots(A, tgt, R, n) {
    if (!window.Plotly) { setTimeout(function () { drawPlots(A, tgt, R, n); }, 300); return; }
    var col = ["--def-b", "--ex-b", "--int-b"].map(cssv), red = cssv("--warn-b"), ink = cssv("--ink"), soft = cssv("--ink-soft"), rule = cssv("--rule"), paper2 = cssv("--paper-2");
    var An = A.map(function (r) { return r.map(function (v) { return v.num(); }); }), bn = tgt.map(function (v) { return v.num(); });
    var x = R.x ? R.x.map(function (v) { return v.num(); }) : null;
    var cfg = { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["toImage"] };
    var base = { margin: { l: 50, r: 10, t: 10, b: 60 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", showlegend: true,
      legend: { orientation: "h", x: 0, y: -0.12, yanchor: "top", font: { color: ink, size: 11 } }, font: { color: ink } };
    function ax(t, lo, hi) {
      return { title: { text: t }, range: [lo, hi], autorange: false, tickmode: "linear", tick0: 0, dtick: nice(hi - lo), gridcolor: rule,
        zeroline: true, zerolinecolor: soft, zerolinewidth: 2, fixedrange: true, showbackground: true, backgroundcolor: paper2, color: soft };
    }
    var names = NAMES.slice(0, n), L = state.levels;
    var cx = x || new Array(n).fill(0), R0 = 4;

    if (n === 2) {
      // row picture: lines a1 x + a2 y = b
      var xr = [cx[0] - R0, cx[0] + R0], yr = [cx[1] - R0, cx[1] + R0], rowT = [];
      An.forEach(function (r, i) {
        var t = { type: "scatter", mode: "lines", name: "at " + fmtLvl(L[i]), line: { color: col[i], width: 3 } };
        if (Math.abs(r[1]) > 1e-12) { t.x = xr; t.y = xr.map(function (xx) { return (bn[i] - r[0] * xx) / r[1]; }); }
        else if (Math.abs(r[0]) > 1e-12) { t.x = [bn[i] / r[0], bn[i] / r[0]]; t.y = yr; }
        else { t.x = []; t.y = []; }
        rowT.push(t);
      });
      if (x) rowT.push({ type: "scatter", mode: "markers+text", name: "answer", marker: { color: red, size: 11 }, x: [x[0]], y: [x[1]], text: ["(" + x.map(function (v) { return +v.toFixed(2); }).join(", ") + ")"], textposition: "top right", textfont: { color: red } });
      var l1 = Object.assign({}, base, { xaxis: ax("lots of A (x)", xr[0], xr[1]), yaxis: ax("lots of B (y)", yr[0], yr[1]) });
      Plotly.react("labrow", rowT, l1, cfg);

      // column picture: arrows
      var pts = [[0, 0], [An[0][0], An[1][0]], [An[0][1], An[1][1]], [bn[0], bn[1]]], ann = [], colT = [];
      function arrow(a, b, c, dash) { ann.push({ x: b[0], y: b[1], ax: a[0], ay: a[1], xref: "x", yref: "y", axref: "x", ayref: "y", showarrow: true, arrowhead: 3, arrowsize: 1.3, arrowwidth: 3, arrowcolor: c, opacity: dash ? 0.45 : 1 }); }
      arrow([0, 0], pts[1], col[0], !!x); arrow([0, 0], pts[2], col[1], !!x);
      colT.push({ type: "scatter", mode: "lines", name: "A (column 1)", line: { color: col[0], width: 3 }, x: [null], y: [null] });
      colT.push({ type: "scatter", mode: "lines", name: "B (column 2)", line: { color: col[1], width: 3 }, x: [null], y: [null] });
      if (x) {
        var p1 = [x[0] * An[0][0], x[0] * An[1][0]], p2 = [p1[0] + x[1] * An[0][1], p1[1] + x[1] * An[1][1]];
        arrow([0, 0], p1, col[0]); arrow(p1, p2, col[1]); pts.push(p1, p2);
      } else if (R.rank === 1) {
        var d = R.pivots[0], v = [An[0][d], An[1][d]], s = 10;
        colT.push({ type: "scatter", mode: "lines", name: "everything A, B can reach", line: { color: soft, width: 2, dash: "dot" }, x: [-s * v[0], s * v[0]], y: [-s * v[1], s * v[1]] });
      }
      colT.push({ type: "scatter", mode: "markers+text", name: "client target", marker: { color: red, size: 12 }, x: [bn[0]], y: [bn[1]], text: ["target"], textposition: "bottom right", textfont: { color: red } });
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      var lo = Math.floor(Math.min.apply(null, xs.concat(ys)) - 1), hi = Math.ceil(Math.max.apply(null, xs.concat(ys)) + 1);
      var l2 = Object.assign({}, base, { annotations: ann, xaxis: ax("pays at " + fmtLvl(L[0]), lo, hi), yaxis: ax("pays at " + fmtLvl(L[1]), lo, hi) });
      Plotly.react("labcol", colT, l2, cfg);
    } else {
      var sc = function (t, lo, hi, eye) {
        return { xaxis: ax(t[0], lo[0], hi[0]), yaxis: ax(t[1], lo[1], hi[1]), zaxis: ax(t[2], lo[2], hi[2]), aspectmode: "cube",
          dragmode: "turntable", camera: { eye: eye, up: { x: 0, y: 0, z: 1 } } };
      };
      // row picture: planes
      var lo3 = cx.map(function (v) { return v - R0; }), hi3 = cx.map(function (v) { return v + R0; }), rowP = [];
      An.forEach(function (r, i) {
        var k = [0, 1, 2].reduce(function (bi, j) { return Math.abs(r[j]) > Math.abs(r[bi]) ? j : bi; }, 0);
        if (Math.abs(r[k]) < 1e-12) return;
        var o = [0, 1, 2].filter(function (j) { return j !== k; }), corners = [];
        [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(function (cc) {
          var p = [0, 0, 0]; p[o[0]] = cc[0] ? hi3[o[0]] : lo3[o[0]]; p[o[1]] = cc[1] ? hi3[o[1]] : lo3[o[1]];
          p[k] = (bn[i] - r[o[0]] * p[o[0]] - r[o[1]] * p[o[1]]) / r[k]; corners.push(p);
        });
        rowP.push({ type: "mesh3d", name: "at " + fmtLvl(L[i]), showlegend: true, opacity: 0.35, color: col[i], flatshading: true, hoverinfo: "name",
          x: corners.map(function (p) { return p[0]; }), y: corners.map(function (p) { return p[1]; }), z: corners.map(function (p) { return p[2]; }), i: [0, 0], j: [1, 2], k: [2, 3] });
      });
      if (x) rowP.push({ type: "scatter3d", mode: "markers+text", name: "answer", marker: { color: red, size: 7 }, x: [x[0]], y: [x[1]], z: [x[2]], text: ["(" + x.map(function (v) { return +v.toFixed(2); }).join(", ") + ")"], textposition: "top right", textfont: { color: red, size: 13 } });
      var lr = Object.assign({}, base, { margin: { l: 0, r: 0, t: 0, b: 60 }, scene: sc(["lots A (x)", "lots B (y)", "lots C (z)"], lo3, hi3, { x: 1.6, y: -1.5, z: 0.9 }) });
      Plotly.react("labrow", rowP, lr, cfg);

      // column picture: chained arrows
      var cols3 = [0, 1, 2].map(function (j) { return [An[0][j], An[1][j], An[2][j]]; }), colP = [], allPts = [[0, 0, 0], bn];
      if (x) {
        var cur = [0, 0, 0];
        cols3.forEach(function (c, j) {
          var nxt = [cur[0] + x[j] * c[0], cur[1] + x[j] * c[1], cur[2] + x[j] * c[2]];
          colP.push({ type: "scatter3d", mode: "lines+markers", name: (+x[j].toFixed(2)) + " × " + names[j], line: { color: col[j], width: 8 }, marker: { size: [2, 5], color: col[j] }, x: [cur[0], nxt[0]], y: [cur[1], nxt[1]], z: [cur[2], nxt[2]] });
          allPts.push(nxt); cur = nxt;
        });
      } else {
        cols3.forEach(function (c, j) {
          colP.push({ type: "scatter3d", mode: "lines+markers", name: names[j] + " (column " + (j + 1) + ")", line: { color: col[j], width: 7 }, marker: { size: [2, 5], color: col[j] }, x: [0, c[0]], y: [0, c[1]], z: [0, c[2]] });
          allPts.push(c);
        });
        if (R.rank === 2) {
          var u = cols3[R.pivots[0]], w = cols3[R.pivots[1]], s3 = 3, q = [[-s3, -s3], [s3, -s3], [s3, s3], [-s3, s3]].map(function (ab) { return [ab[0] * u[0] + ab[1] * w[0], ab[0] * u[1] + ab[1] * w[1], ab[0] * u[2] + ab[1] * w[2]]; });
          colP.push({ type: "mesh3d", name: "everything the products can reach", opacity: 0.2, color: soft, hoverinfo: "name", showlegend: true, x: q.map(function (p) { return p[0]; }), y: q.map(function (p) { return p[1]; }), z: q.map(function (p) { return p[2]; }), i: [0, 0], j: [1, 2], k: [2, 3] });
        }
      }
      colP.push({ type: "scatter3d", mode: "markers+text", name: "client target", marker: { color: red, size: 8 }, x: [bn[0]], y: [bn[1]], z: [bn[2]], text: ["target"], textposition: "top center", textfont: { color: red, size: 13 } });
      var flat = [].concat.apply([], allPts), lo = Math.floor(Math.min.apply(null, flat) - 1), hi = Math.ceil(Math.max.apply(null, flat) + 1);
      var lc = Object.assign({}, base, { margin: { l: 0, r: 0, t: 0, b: 60 }, scene: sc(["pays at " + fmtLvl(L[0]), "pays at " + fmtLvl(L[1]), "pays at " + fmtLvl(L[2])], [lo, lo, lo], [hi, hi, hi], { x: 1.6, y: -1.6, z: 0.9 }) });
      Plotly.react("labcol", colP, lc, cfg);
    }
  }

  // ---------- start ----------
  function start() {
    var root = el("replab"); if (!root) return;
    var q = (location.search.match(/labpreset=(\w+)/) || [])[1] || root.getAttribute("data-preset");
    var qd = (location.search.match(/labdays=(\d+)/) || [])[1]; if (qd) state.mkt.Tn = +qd;
    if (q && PRESETS[q]) { var keepTn = state.mkt.Tn; loadPreset(q); if (qd) { state.mkt.Tn = keepTn; buildControls(root); readUI(); render(); } }
    else { var P = PRESETS.ex2; state.products = P.products.map(function (p) { return Object.assign({}, p); }); state.target = P.target.slice(); state.mkt.auto = true; buildControls(root); readUI(); render(); }
    document.querySelectorAll(".tabs button[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { setTimeout(function () { if (window.Plotly) ["labrow", "labcol"].forEach(function (id) { if (el(id)) Plotly.Plots.resize(id); }); }, 0); });
    });
  }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start);
})();
