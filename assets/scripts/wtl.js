/* ============================================================================
   wtl.js  Webbaby Type Loop runtime
   Purpose: Deterministic, resume-able typewriter for multiple targets.
            External config supported via window.WTL_CONFIG or /assets/wtl.json.
            No examples or sample content included.
   ============================================================================ */

(function () {
  "use strict";

  var d = document;
  var w = window;

  /* -------------------------------------------------------------------------
     Configuration Loading
     ------------------------------------------------------------------------- */

  // Config priority: window.WTL_CONFIG -> fetch('/assets/wtl.json') -> empty
  // Expected shape:
  // {
  //   targets: {
  //     "<key>": {
  //       phrases: [ ... ],
  //       typingSpeed: number,            // chars per second
  //       deleteSpeed: number,            // chars per second
  //       holdMs: number,                 // delay at full line
  //       loop: boolean,
  //       prefix: string,
  //       suffix: string,
  //       punctuationPause: { ".": ms, ",": ms, ":": ms, "/": ms, ")": ms },
  //       protectedTokens: [ ... ],
  //       allowWrap: "soft" | "none",
  //       startThreshold: number,         // 0..1 IntersectionObserver threshold
  //       resume: boolean,                // remember index between enters
  //       hideCursorWhileDelete: boolean,
  //       widthLock: boolean              // reserve min-width to longest phrase
  //     }
  //   }
  // }
  var CONFIG = { targets: {} };

  function assignConfig(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.targets && typeof obj.targets === "object") {
      CONFIG.targets = obj.targets;
    }
  }

  function loadConfig() {
    return new Promise(function (resolve) {
      if (w.WTL_CONFIG && typeof w.WTL_CONFIG === "object") {
        assignConfig(w.WTL_CONFIG);
        resolve();
        return;
      }
      try {
        fetch("/assets/json/wtl.json", { cache: "no-store", credentials: "same-origin" })
          .then(function (r) {
            if (!r.ok) throw new Error("WTL config not found");
            return r.json();
          })
          .then(function (json) { assignConfig(json); })
          .catch(function () { /* silent: external config optional */ })
          .finally(resolve);
      } catch (_) {
        resolve();
      }
    });
  }

  /* -------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------- */
  function qs(sel, root) { return (root || d).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function now() { return performance && performance.now ? performance.now() : Date.now(); }
  function isArray(x) { return Array.isArray(x); }
  function isString(x) { return typeof x === "string"; }
  function isObject(x) { return x && typeof x === "object"; }

  // Reduced motion
  var prefersReducedMotion = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Visibility
  var isHidden = function () { return d.hidden || d.visibilityState === "hidden"; };

  // Measure text width with the element's computed styles
  function measureWidth(el, text) {
    var s = w.getComputedStyle(el);
    var meas = d.createElement("span");
    meas.style.position = "absolute";
    meas.style.left = "-99999px";
    meas.style.top = "0";
    meas.style.whiteSpace = "pre";
    meas.style.visibility = "hidden";
    // Copy relevant text styles
    meas.style.fontFamily = s.fontFamily;
    meas.style.fontSize = s.fontSize;
    meas.style.fontWeight = s.fontWeight;
    meas.style.letterSpacing = s.letterSpacing;
    meas.style.wordSpacing = s.wordSpacing;
    meas.textContent = text;
    d.body.appendChild(meas);
    var wpx = meas.getBoundingClientRect().width;
    d.body.removeChild(meas);
    return wpx;
  }

  // Pause utility based on punctuation map
  function getPunctPause(char, map) {
    if (!map) return 0;
    return map[char] || 0;
  }

  // Token safety: avoid splitting protected tokens across partial render
  function safeSlice(s, end, protectedTokens) {
    if (!protectedTokens || !protectedTokens.length) return s.slice(0, end);
    var out = s.slice(0, end);
    for (var i = 0; i < protectedTokens.length; i++) {
      var tok = protectedTokens[i];
      if (!tok) continue;
      var idx = out.lastIndexOf(tok);
      if (idx !== -1 && idx + tok.length > out.length - 1) {
        // Do not reveal partial token; snap back before token
        out = out.slice(0, idx);
      }
    }
    return out;
  }

  /* -------------------------------------------------------------------------
     Engine
     ------------------------------------------------------------------------- */

  function TypeLoop(el, key, conf) {
    this.el = el;
    this.key = key;
    this.conf = conf || {};
    this.state = {
      phraseIndex: 0,
      charIndex: 0,
      deleting: false,
      holding: false,
      lastTick: 0
    };
    this.running = false;
    this._raf = 0;
    this._observer = null;
    this._connected = false;

    // Defaults
    this.typingSpeed = Number(this.conf.typingSpeed || 16); // chars per second
    this.deleteSpeed = Number(this.conf.deleteSpeed || 22);
    this.holdMs = Number(this.conf.holdMs || 1100);
    this.loop = !!this.conf.loop;
    this.prefix = isString(this.conf.prefix) ? this.conf.prefix : "";
    this.suffix = isString(this.conf.suffix) ? this.conf.suffix : "";
    this.punct = isObject(this.conf.punctuationPause) ? this.conf.punctuationPause : { ".": 220, ",": 120, ":": 220, "/": 180, ")": 180 };
    this.protectedTokens = isArray(this.conf.protectedTokens) ? this.conf.protectedTokens : [];
    this.allowWrap = this.conf.allowWrap === "soft" ? "soft" : "none";
    this.resume = this.conf.resume !== false; // default true
    this.hideCursorWhileDelete = !!this.conf.hideCursorWhileDelete;
    this.widthLock = this.conf.widthLock !== false; // default true

    // Phrases required; no fallback content included
    this.phrases = isArray(this.conf.phrases) ? this.conf.phrases.filter(Boolean) : [];

    // Width lock
    if (this.widthLock && this.phrases.length) {
      var maxWidth = 0;
      for (var i = 0; i < this.phrases.length; i++) {
        var candidate = this.prefix + this.phrases[i] + this.suffix;
        var wpx = measureWidth(this.el, candidate);
        if (wpx > maxWidth) maxWidth = wpx;
      }
      if (maxWidth > 0) {
        this.el.style.minWidth = Math.ceil(maxWidth + 2) + "px";
        this.el.classList.add("wtl--locked");
      }
    }

    // Wrap mode hook
    if (this.allowWrap === "soft") {
      this.el.setAttribute("data-wtl-wrap", "soft");
    } else {
      this.el.removeAttribute("data-wtl-wrap");
    }

    // Cursor initial
    this.el.classList.toggle("wtl--cursor-off", prefersReducedMotion);
  }

  TypeLoop.prototype.connect = function () {
    if (this._connected) return;
    this._connected = true;

    // Intersection threshold
    var threshold = typeof this.conf.startThreshold === "number" ? clamp(this.conf.startThreshold, 0, 1) : 0.25;
    var self = this;
    this._observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          self.start();
        } else {
          self.pause();
        }
      });
    }, { threshold: threshold });

    this._observer.observe(this.el);

    // Visibility handling
    this._visibilityHandler = function () {
      if (isHidden()) self.pause();
      else if (self.running) self._tick(); // nudge
    };
    d.addEventListener("visibilitychange", this._visibilityHandler);

    // Print handling
    this._beforePrint = function () {
      self.renderFull();
      self.el.classList.add("wtl--cursor-off");
    };
    this._afterPrint = function () {
      if (!prefersReducedMotion) self.el.classList.remove("wtl--cursor-off");
    };
    w.addEventListener("beforeprint", this._beforePrint);
    w.addEventListener("afterprint", this._afterPrint);

    // Reduced motion initial
    if (prefersReducedMotion) {
      this.renderFull();
    }
  };

  TypeLoop.prototype.disconnect = function () {
    if (!this._connected) return;
    this._connected = false;
    this.pause();
    if (this._observer) this._observer.disconnect();
    d.removeEventListener("visibilitychange", this._visibilityHandler);
    w.removeEventListener("beforeprint", this._beforePrint);
    w.removeEventListener("afterprint", this._afterPrint);
  };

  TypeLoop.prototype.start = function () {
    if (prefersReducedMotion || this.phrases.length === 0) return;
    if (!this.running) {
      this.running = true;
      this.state.lastTick = now();
      this._tick();
    }
  };

  TypeLoop.prototype.pause = function () {
    this.running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  };

  TypeLoop.prototype._tick = function () {
    if (!this.running) return;

    var t = now();
    var dt = t - this.state.lastTick;
    this.state.lastTick = t;

    var phrase = this.phrases[this.state.phraseIndex] || "";
    var full = this.prefix + phrase + this.suffix;

    // Cursor control
    var cursorOn = !(this.hideCursorWhileDelete && this.state.deleting);
    this.el.classList.toggle("wtl--cursor-on", cursorOn);
    this.el.classList.toggle("wtl--cursor-off", !cursorOn);

    if (this.state.holding) {
      // Hold countdown
      this._holdLeft = (this._holdLeft || this.holdMs) - dt;
      if (this._holdLeft <= 0) {
        this.state.holding = false;
        this.state.deleting = this.loop || (this.state.phraseIndex < this.phrases.length - 1);
      }
      this._raf = requestAnimationFrame(this._tick.bind(this));
      return;
    }

    if (!this.state.deleting) {
      // Typing
      var cps = this.typingSpeed;
      var chars = Math.max(1, Math.floor((dt / 1000) * cps));
      var nextIndex = clamp(this.state.charIndex + chars, 0, full.length);
      var partial = safeSlice(full, nextIndex, this.protectedTokens);
      this.el.textContent = partial;

      // Punctuation pause when revealing specific char
      var revealed = full.charAt(nextIndex - 1);
      var extra = getPunctPause(revealed, this.punct);
      this.state.charIndex = partial.length;

      if (this.state.charIndex >= full.length) {
        this.state.holding = true;
        this._holdLeft = this.holdMs + extra;
      }
    } else {
      // Deleting
      var dps = this.deleteSpeed;
      var dchars = Math.max(1, Math.floor((dt / 1000) * dps));
      var nextDel = clamp(this.state.charIndex - dchars, 0, full.length);
      var partialDel = safeSlice(full, nextDel, this.protectedTokens);
      this.el.textContent = partialDel;
      this.state.charIndex = partialDel.length;

      if (this.state.charIndex === 0) {
        this.state.deleting = false;
        this.state.holding = false;
        // Next phrase or stop
        if (this.state.phraseIndex < this.phrases.length - 1) {
          this.state.phraseIndex += 1;
        } else if (this.loop) {
          this.state.phraseIndex = 0;
        } else {
          this.pause();
          return;
        }
      }
    }

    this._raf = requestAnimationFrame(this._tick.bind(this));
  };

  TypeLoop.prototype.renderFull = function () {
    var phrase = this.phrases[this.state.phraseIndex] || "";
    var full = this.prefix + phrase + this.suffix;
    this.el.textContent = full;
    this.state.charIndex = full.length;
    this.state.holding = false;
    this.state.deleting = false;
  };

  /* -------------------------------------------------------------------------
     Orchestrator
     ------------------------------------------------------------------------- */

  var instances = [];

  function setupTargets() {
    var els = qsa(".wtl[data-wtl-key]");
    if (!els.length) return;

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute("data-wtl-key");
      var conf = CONFIG.targets[key] || {};
      var inst = new TypeLoop(el, key, conf);
      inst.connect();
      instances.push(inst);
    }
  }

  function startAll() {
    if (prefersReducedMotion) return;
    for (var i = 0; i < instances.length; i++) {
      instances[i].start();
    }
  }

  function pauseAll() {
    for (var i = 0; i < instances.length; i++) {
      instances[i].pause();
    }
  }

  // Public API
  w.WTL = {
    setConfig: function (cfg) { assignConfig(cfg); },
    startAll: startAll,
    pauseAll: pauseAll,
    getState: function () {
      return instances.map(function (ins) {
        return {
          key: ins.key,
          running: ins.running,
          phraseIndex: ins.state.phraseIndex,
          charIndex: ins.state.charIndex,
          deleting: ins.state.deleting
        };
      });
    }
  };

  /* -------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------- */
  function boot() {
    loadConfig().then(function () {
      setupTargets();
      // Optional auto start on load
      startAll();
    });
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

})();
