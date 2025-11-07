/* ============================================================================
   CYBERSEC.JS — Single-file scrollytelling logic for khristos.github.io
   Author: Favour Iloba
   Origin: the1807.xyz
   Purpose: Data-driven rendering, scroll orchestration, console simulation,
            accessibility, and utilities. No frameworks. No placeholders.
   ============================================================================ */

(function () {
  "use strict";

  /* -------------------------------------------------------------------------
     0) FEATURE GUARDS AND GLOBALS
     ------------------------------------------------------------------------- */
  var d = document;
  var w = window;
  var prefersReducedMotion = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Data contract. The page expects a global object named CYBERSEC_DATA that you own and populate.
  // This script never injects example content. It renders only what you provide.
  // Shape:
  // {
  //   recon: { intel: [{title, detail, tags[]}], tools: [string], points: [string] },
  //   exploit: { chain: [{id, title, detail, mitre}], points: [string] },
  //   detect: {
  //     logs: [{ts, level, tag, text, kind}],   // kind: "alert" | "success" | "accent" | "plain"
  //     iocs: [{type, value}],
  //     packets: [{summary, detail}]
  //   },
  //   respond: { timeline: [{step, detail, state}], playbook: [{title, steps: [string], refs: [string]}], points: [string] },
  //   forensics: { evidence: [{title, bullets: [string]}], points: [string] },
  //   lessons: { heatmap: [{id, state, label}], points: [string] },
  //   credentials: [{when, title, org, link}],
  //   projects: [{title, context, outcome, link}],
  //   contact: { email, phone, linkedin, github, portfolio },
  // }
  var DATA = Object.create(null);

  /* -------------------------------------------------------------------------
     1) UTILITIES
     ------------------------------------------------------------------------- */
  function qs(sel, root) { return (root || d).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function create(el, cls) {
    var node = d.createElement(el);
    if (cls) node.className = cls;
    return node;
  }
  function setText(el, txt) { if (el) el.textContent = txt; }
  function setHTML(el, html) { if (el) el.innerHTML = html; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
    } else {
      var ta = create("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      d.body.appendChild(ta);
      ta.select();
      try { d.execCommand("copy"); } catch (e) {}
      d.body.removeChild(ta);
    }
  }
  function isString(x) { return typeof x === "string"; }
  function isArray(x) { return Array.isArray(x); }
  function isObject(x) { return x && typeof x === "object"; }

  // Simple state store
  var State = {
    activeStage: "",
    filter: "all",
    hashLock: false,
    currentTheme: 'auto',
    navOpen: false
  };

  // Observer helpers
  var ioFade = null;
  var ioHighlight = null;

  /* -------------------------------------------------------------------------
     2) HEADER FUNCTIONALITY - THEME TOGGLE AND NAVIGATION
     ------------------------------------------------------------------------- */
  function initHeader() {
    var themeToggle = qs('#theme-toggle');
    var navToggle = qs('#nav-toggle');
    var navDropdown = qs('#nav-dropdown');
    var navLinks = qsa('.nav-dropdown__link');

    // Theme toggle functionality
    if (themeToggle) {
      // Check for saved theme preference or use OS preference
      var savedTheme = localStorage.getItem('cybersec-theme');
      if (savedTheme) {
        State.currentTheme = savedTheme;
        applyTheme(savedTheme);
      }

      themeToggle.addEventListener('click', function() {
        toggleTheme();
      });

      themeToggle.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleTheme();
        }
      });
    }

    // Navigation dropdown functionality
    if (navToggle && navDropdown) {
      navToggle.addEventListener('click', function() {
        toggleNavigation();
      });

      navToggle.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleNavigation();
        }
      });

      // Close dropdown when clicking on links
      navLinks.forEach(function(link) {
        link.addEventListener('click', function() {
          closeNavigation();
        });
      });

      // Close dropdown when clicking outside
      d.addEventListener('click', function(e) {
        if (State.navOpen && 
            !navDropdown.contains(e.target) && 
            !navToggle.contains(e.target)) {
          closeNavigation();
        }
      });

      // Close dropdown with Escape key
      d.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && State.navOpen) {
          closeNavigation();
        }
      });
    }
  }

  function toggleTheme() {
    var newTheme;
    if (State.currentTheme === 'auto') {
      // Check if OS prefers dark mode
      var prefersDark = w.matchMedia('(prefers-color-scheme: dark)').matches;
      newTheme = prefersDark ? 'light' : 'dark';
    } else if (State.currentTheme === 'dark') {
      newTheme = 'light';
    } else {
      newTheme = 'auto';
    }

    State.currentTheme = newTheme;
    localStorage.setItem('cybersec-theme', newTheme);
    applyTheme(newTheme);
  }

  function applyTheme(theme) {
    var html = d.documentElement;
    
    if (theme === 'dark') {
      html.style.setProperty('--bg', '#121212');
      html.style.setProperty('--text', '#E0E0E0');
      html.style.setProperty('--accent', '#3399FF');
      html.style.setProperty('--alert', '#FF7043');
      html.style.setProperty('--success', '#66BB6A');
      html.style.setProperty('--surface', '#1C1C1C');
      html.style.setProperty('--code-bg', '#1C1926');
      html.style.setProperty('--shadow', '0 4px 24px rgba(0, 0, 0, .45)');
    } else if (theme === 'light') {
      html.style.setProperty('--bg', '#F7F7F7');
      html.style.setProperty('--text', '#1A1A1A');
      html.style.setProperty('--accent', '#007BFF');
      html.style.setProperty('--alert', '#FF4500');
      html.style.setProperty('--success', '#28A745');
      html.style.setProperty('--surface', '#EFEFEF');
      html.style.setProperty('--code-bg', '#EEEEFF');
      html.style.setProperty('--shadow', '0 4px 20px rgba(0, 0, 0, .08)');
    } else {
      // Auto - let CSS media queries handle it
      html.style.removeProperty('--bg');
      html.style.removeProperty('--text');
      html.style.removeProperty('--accent');
      html.style.removeProperty('--alert');
      html.style.removeProperty('--success');
      html.style.removeProperty('--surface');
      html.style.removeProperty('--code-bg');
      html.style.removeProperty('--shadow');
    }
  }

  function toggleNavigation() {
    var navToggle = qs('#nav-toggle');
    var navDropdown = qs('#nav-dropdown');
    
    if (State.navOpen) {
      closeNavigation();
    } else {
      openNavigation();
    }
  }

  function openNavigation() {
    var navToggle = qs('#nav-toggle');
    var navDropdown = qs('#nav-dropdown');
    
    State.navOpen = true;
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'true');
    }
    if (navDropdown) {
      navDropdown.setAttribute('aria-hidden', 'false');
    }
    
    // Trap focus inside dropdown when open
    trapFocus(navDropdown);
  }

  function closeNavigation() {
    var navToggle = qs('#nav-toggle');
    var navDropdown = qs('#nav-dropdown');
    
    State.navOpen = false;
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.focus();
    }
    if (navDropdown) {
      navDropdown.setAttribute('aria-hidden', 'true');
    }
  }

  function trapFocus(element) {
    var focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    var firstElement = focusableElements[0];
    var lastElement = focusableElements[focusableElements.length - 1];

    element.addEventListener('keydown', function trapKeydown(e) {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (d.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (d.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      } else if (e.key === 'Escape') {
        closeNavigation();
        element.removeEventListener('keydown', trapKeydown);
      }
    });
  }

  /* -------------------------------------------------------------------------
     3) DATA VALIDATION (SOFT)
     ------------------------------------------------------------------------- */
  function safeArray(arr) { return Array.isArray(arr) ? arr : []; }
  function safeObject(obj) { return obj && typeof obj === "object" ? obj : {}; }

  var RECON = safeObject(DATA.recon);
  var EXPLOIT = safeObject(DATA.exploit);
  var DETECT = safeObject(DATA.detect);
  var RESPOND = safeObject(DATA.respond);
  var FORENSICS = safeObject(DATA.forensics);
  var LESSONS = safeObject(DATA.lessons);
  var CREDS = safeArray(DATA.credentials);
  var PROJECTS = safeArray(DATA.projects);
  var CONTACT = safeObject(DATA.contact);

  /* -------------------------------------------------------------------------
     4) RENDERERS
     ------------------------------------------------------------------------- */

  // 4.1 Recon
  function renderRecon() {
    var cards = qs("#intel-cards");
    var badges = qs("#recon-tools");
    var points = qs("#recon-points");
    if (!cards || !badges || !points) return;

    setHTML(cards, "");
    safeArray(RECON.intel).forEach(function (item) {
      if (!item) return;
      var card = create("div", "intel-card");
      var h = create("h3", "intel-card__title");
      setText(h, item.title || "");
      var p = create("p", "intel-card__detail");
      setText(p, item.detail || "");
      var tagWrap = create("div", "intel-card__tags");
      safeArray(item.tags).forEach(function (t) {
        var tag = create("span", "tag");
        setText(tag, t);
        tagWrap.appendChild(tag);
      });
      card.appendChild(h);
      card.appendChild(p);
      card.appendChild(tagWrap);
      cards.appendChild(card);
    });

    setHTML(badges, "");
    safeArray(RECON.tools).forEach(function (tool) {
      var b = create("span", "badge");
      setText(b, tool);
      badges.appendChild(b);
    });

    setHTML(points, "");
    safeArray(RECON.points).forEach(function (pt) {
      var li = create("li");
      setText(li, pt);
      points.appendChild(li);
    });
  }

  // 4.2 Exploit
  function renderExploit() {
    var chain = qs("#attack-chain");
    var points = qs("#exploit-points");
    if (!chain || !points) return;

    setHTML(chain, "");
    const svg = create('svg');
    svg.setAttribute('viewBox', '0 0 400 300');
    svg.setAttribute('aria-hidden', 'true'); // Since role="img"
    // Add paths/lines
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M50 50 L150 150 L250 50 L350 150');
    path.setAttribute('stroke', 'var(--accent)');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    svg.appendChild(path);
    // Animate on viewport
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) path.animate({ strokeDashoffset: 0 }, { duration: 2000 });
    });
    obs.observe(chain);
    // Add nodes for steps
    safeArray(EXPLOIT.chain).forEach((step, i) => {
      const circle = create('circle');
      circle.setAttribute('cx', 50 + i * 100);
      circle.setAttribute('cy', i % 2 ? 150 : 50);
      circle.setAttribute('r', 20);
      circle.setAttribute('fill', 'var(--surface)');
      svg.appendChild(circle);
      const text = create('text');
      text.setAttribute('x', 50 + i * 100);
      text.setAttribute('y', (i % 2 ? 150 : 50) + 5);
      text.textContent = step.id;
      svg.appendChild(text);
    });
    chain.appendChild(svg);

    setHTML(points, "");
    safeArray(EXPLOIT.points).forEach(function (pt) {
      var li = create("li");
      setText(li, pt);
      points.appendChild(li);
    });
  }

  // 4.3 Detection: console, filters, packets
  var consoleFeed, filterButtons, copyBtn, packetView;
  var consoleIndex = 0;
  var consoleRAF = 0;
  var consoleRunning = false;

  function renderDetect() {
    consoleFeed = qs("#console-feed");
    filterButtons = qsa('.console__filters [role="tab"]');
    copyBtn = qs("#copy-iocs");
    packetView = qs("#packet-view");

    if (consoleFeed) setHTML(consoleFeed, "");
    if (packetView) setHTML(packetView, "");

    // Filters
    filterButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterButtons.forEach(function (b) {
          b.setAttribute("aria-selected", "false");
        });
        btn.setAttribute("aria-selected", "true");
        State.filter = btn.getAttribute("data-filter") || "all";
        resetConsole();
        runConsole();
      });
      btn.addEventListener("keydown", function (e) {
        var idx = filterButtons.indexOf(btn);
        if (e.key === "ArrowRight") {
          e.preventDefault();
          var next = filterButtons[clamp(idx + 1, 0, filterButtons.length - 1)];
          next.focus();
          next.click();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          var prev = filterButtons[clamp(idx - 1, 0, filterButtons.length - 1)];
          prev.focus();
          prev.click();
        }
      });
    });

    // Copy IOCs
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = safeArray(DETECT.iocs).map(function (x) {
          return x.type + ": " + x.value;
        }).join("\n");
        copyToClipboard(text);
        copyBtn.textContent = "IOCs Copied";
        setTimeout(function () { copyBtn.textContent = "Copy IOCs"; }, 1600);
      });
    }

    // Packets
    buildPacketView();
    resetConsole();
  }

  function buildPacketView() {
    if (!packetView) return;
    var list = create("div", "packet-list");
    safeArray(DETECT.packets).forEach(function (pkt, i) {
      var row = create("button", "packet-row");
      row.type = "button";
      row.setAttribute("data-index", String(i));
      row.setAttribute("aria-label", "Packet " + String(i + 1));
      setText(row, pkt.summary || "");
      row.addEventListener("click", function () {
        var idx = Number(row.getAttribute("data-index") || "0");
        var detail = safeArray(DETECT.packets)[idx];
        if (!detail) return;
        var pane = qs(".packet-detail", packetView);
        if (!pane) {
          pane = create("div", "packet-detail");
          packetView.appendChild(pane);
        }
        setHTML(pane, "");
        var h = create("h4", "packet-detail__title");
        setText(h, detail.summary || "");
        var p = create("pre", "packet-detail__body");
        setText(p, detail.detail || "");
        pane.appendChild(h);
        pane.appendChild(p);
      });
      list.appendChild(row);
    });
    packetView.appendChild(list);
  }

  function resetConsole() {
    consoleIndex = 0;
    consoleRunning = false;
    if (consoleFeed) setHTML(consoleFeed, "");
    if (consoleRAF) cancelAnimationFrame(consoleRAF);
  }

  function runConsole() {
    if (!consoleFeed) return;
    var logs = safeArray(DETECT.logs).filter(function (l) {
      if (!State.filter || State.filter === "all") return true;
      return (l.tag === State.filter);
    });

    if (consoleRunning || logs.length === 0) return;
    consoleRunning = true;

    function step() {
      if (consoleIndex >= logs.length) { consoleRunning = false; return; }
      var item = logs[consoleIndex++];
      var line = create("div", "log-line");
      var level = (item.level || "info").toLowerCase();
      var kind = (item.kind || "plain").toLowerCase();
      var cls = ["log", "lvl-" + level, kind === "alert" ? "alert" : "", kind === "success" ? "success" : "", kind === "accent" ? "accent" : ""].join(" ").trim();
      line.className = cls;

      var ts = create("span", "log-ts");
      setText(ts, item.ts || "");
      var txt = create("span", "log-text");
      line.appendChild(ts);
      line.appendChild(txt);
      consoleFeed.appendChild(line);
      consoleFeed.scrollTop = consoleFeed.scrollHeight;

      let charIndex = 0;
      const text = item.text || "";
      const typeInterval = setInterval(() => {
        if (charIndex < text.length) {
          txt.textContent += text.charAt(charIndex++);
        } else {
          clearInterval(typeInterval);
          if (prefersReducedMotion) {
            step();
          } else {
            consoleRAF = requestAnimationFrame(step);
          }
        }
      }, 50); // Adjust typing speed
    }

    step();
  }

  // 4.4 Response
  function renderRespond() {
    var list = qs("#response-timeline");
    var points = qs("#respond-points");
    var openBtn = qs("#open-playbook");
    var drawer = qs("#playbook-drawer");
    var closeBtn = qs("#close-playbook");
    var backdrop = qs("#playbook-backdrop");
    var content = qs("#playbook-content");

    if (list) {
      setHTML(list, "");
      safeArray(RESPOND.timeline).forEach(function (t) {
        var li = create("li");
        var strong = create("strong");
        setText(strong, t.step || "");
        var p = create("p");
        setText(p, t.detail || "");
        li.appendChild(strong);
        li.appendChild(p);
        if (isString(t.state)) li.setAttribute("data-state", t.state);
        list.appendChild(li);
      });
    }

    if (points) {
      setHTML(points, "");
      safeArray(RESPOND.points).forEach(function (pt) {
        var li = create("li");
        setText(li, pt);
        points.appendChild(li);
      });
    }

    // Drawer wiring
    function openDrawer() {
      if (!drawer) return;
      drawer.hidden = false;
      d.body.style.overflow = "hidden";
      if (content) {
        setHTML(content, "");
        safeArray(RESPOND.playbook).forEach(function (pb) {
          var block = create("section", "playbook-block");
          var h = create("h4");
          setText(h, pb.title || "");
          block.appendChild(h);

          var ul = create("ul");
          safeArray(pb.steps).forEach(function (st) {
            var li = create("li");
            setText(li, st);
            ul.appendChild(li);
          });
          block.appendChild(ul);

          var refs = safeArray(pb.refs);
          if (refs.length) {
            var refp = create("p", "refs");
            setText(refp, "References:");
            block.appendChild(refp);
            var rlist = create("ul", "refs-list");
            refs.forEach(function (r) {
              var li2 = create("li");
              if (isString(r)) setText(li2, r);
              rlist.appendChild(li2);
            });
            block.appendChild(rlist);
          }

          content.appendChild(block);
        });
      }
      setTimeout(function () { if (closeBtn) closeBtn.focus(); }, 50);
    }
    function closeDrawer() {
      if (!drawer) return;
      drawer.hidden = true;
      d.body.style.overflow = "";
      if (openBtn) openBtn.focus();
    }

    if (openBtn) openBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    d.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
    });
  }

  // 4.5 Forensics
  function renderForensics() {
    var grid = qs("#evidence-grid");
    var points = qs("#forensics-points");
    if (!grid || !points) return;

    setHTML(grid, "");
    safeArray(FORENSICS.evidence).forEach(function (box) {
      var card = create("div", "evidence-card");
      var h = create("h4");
      setText(h, box.title || "");
      var ul = create("ul");
      safeArray(box.bullets).forEach(function (b) {
        var li = create("li");
        setText(li, b);
        ul.appendChild(li);
      });
      card.appendChild(h);
      card.appendChild(ul);
      grid.appendChild(card);
    });

    setHTML(points, "");
    safeArray(FORENSICS.points).forEach(function (pt) {
      var li = create("li");
      setText(li, pt);
      points.appendChild(li);
    });
  }

  // 4.6 Lessons
  function renderLessons() {
    var heatmap = qs("#control-heatmap");
    var points = qs("#lessons-points");
    if (!heatmap || !points) return;

    setHTML(heatmap, "");
    safeArray(LESSONS.heatmap).forEach(function (cell) {
      var div = create("div");
      var label = cell.label || cell.id || "";
      div.setAttribute("data-state", cell.state || "");
      div.setAttribute("title", label);
      heatmap.appendChild(div);
    });

    setHTML(points, "");
    safeArray(LESSONS.points).forEach(function (pt) {
      var li = create("li");
      setText(li, pt);
      points.appendChild(li);
    });
  }

  // 4.7 Credentials and Projects
  function renderCredsProjects() {
    var strip = qs("#cred-strip");
    var cases = qs("#case-grid");
    if (strip) {
      setHTML(strip, "");
      CREDS.forEach(function (c) {
        var item = create("div", "cred-item");
        var a = create("a");
        a.href = isString(c.link) ? c.link : "#";
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "cred-link";
        var t = (c.when ? c.when + " — " : "") + (c.title || "");
        setText(a, t);
        var meta = create("div", "cred-meta");
        setText(meta, c.org || "");
        item.appendChild(a);
        item.appendChild(meta);
        strip.appendChild(item);
      });
    }
    if (cases) {
      setHTML(cases, "");
      PROJECTS.forEach(function (p) {
        var card = create("article", "case-card");
        var h = create("h3");
        setText(h, p.title || "");
        var ctx = create("p", "case-ctx");
        setText(ctx, p.context || "");
        var out = create("p", "case-out");
        setText(out, p.outcome || "");
        var a = null;
        if (isString(p.link) && p.link.length) {
          a = create("a");
          a.href = p.link;
          a.target = "_blank";
          a.rel = "noopener";
          a.className = "btn btn-ghost";
          setText(a, "Open");
        }
        card.appendChild(h);
        card.appendChild(ctx);
        card.appendChild(out);
        if (a) card.appendChild(a);
        cases.appendChild(card);
      });
    }
  }

  /* -------------------------------------------------------------------------
     5) SCROLL ORCHESTRATION AND HIGHLIGHTING
     ------------------------------------------------------------------------- */
  function buildObservers() {
    // Fade-in observer for .story__lead and .key-points li
    var fadeTargets = qsa(".story__lead, .key-points li");
    if (fadeTargets.length && w.IntersectionObserver) {
      ioFade = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("visible");
            ioFade.unobserve(e.target);
          }
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
      fadeTargets.forEach(function (t) { ioFade.observe(t); });
    }

    // Highlight observer for currently focused story line
    var hlTargets = qsa(".story__lead, .key-points li");
    if (hlTargets.length && w.IntersectionObserver) {
      ioHighlight = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            qsa(".highlight").forEach(function (x) { x.classList.remove("highlight"); });
            e.target.classList.add("highlight");
          }
        });
      }, { rootMargin: "-40% 0px -40% 0px", threshold: 0.01 });
      hlTargets.forEach(function (t) { ioHighlight.observe(t); });
    }

    // Active nav and progress
    const stages = qsa('.stage');
    const navLinks = qsa('.stage-nav a');
    const progressBar = create('div', 'global-progress');
    d.body.appendChild(progressBar);
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          navLinks.forEach(link => link.classList.remove('active'));
          qs(`.stage-nav a[href="#${e.target.id}"]`).classList.add('active');
        }
      });
    }, { threshold: 0.5 });
    stages.forEach(s => obs.observe(s));

    let lastScroll = 0;
    w.addEventListener('scroll', () => {
      if (Math.abs(w.scrollY - lastScroll) < 50) return;
      lastScroll = w.scrollY;
      qsa('.parallax-layer').forEach(layer => {
        layer.style.transform = `translateY(${w.scrollY * 0.3}px)`;
      });
      const percent = (w.scrollY / (d.documentElement.scrollHeight - w.innerHeight)) * 100;
      progressBar.style.width = `${percent}%`;
    });
  }

  // Stage hash routing
  function handleHashChange() {
    if (State.hashLock) return;
    var id = (w.location.hash || "").replace("#", "");
    if (!id) return;
    var el = qs('[data-stage="' + id + '"]');
    if (el) {
      State.activeStage = id;
      el.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    }
  }

  function stageNavSetup() {
    var links = qsa(".stage-nav a");
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = a.getAttribute("href") || "";
        if (target.startsWith("#")) {
          e.preventDefault();
          var id = target.slice(1);
          State.hashLock = true;
          w.location.hash = id;
          handleHashChange();
          setTimeout(function () { State.hashLock = false; }, 200);
        }
      });
    });
  }

  /* -------------------------------------------------------------------------
     6) COMMANDS AND ACTION BUTTONS
     ------------------------------------------------------------------------- */
  function wirePrint() {
    var btn = qs("#print-cv");
    if (!btn) return;
    btn.addEventListener("click", function () {
      // Add a class that lets CSS switch to print layout if needed
      d.documentElement.classList.add("print-mode");
      setTimeout(function () {
        w.print();
        d.documentElement.classList.remove("print-mode");
      }, 50);
    });
  }

  function initMatrix() {
    const canvas = qs('#matrix-bg');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      canvas.width = w.innerWidth;
      canvas.height = w.innerHeight;
      const chars = '01'.split('');
      const fontSize = 16;
      const columns = canvas.width / fontSize;
      const drops = Array.from({ length: columns }, () => Math.random() * canvas.height / fontSize);
      function draw() {
        ctx.fillStyle = 'rgba(18, 18, 18, 0.05)'; // Fade trail
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'var(--success)';
        ctx.font = `${fontSize}px monospace`;
        drops.forEach((y, i) => {
          const text = chars[Math.floor(Math.random() * chars.length)];
          ctx.fillText(text, i * fontSize, y * fontSize);
          drops[i] = y > canvas.height / fontSize ? 0 : y + 1;
        });
        requestAnimationFrame(draw);
      }
      draw();
      w.addEventListener('resize', () => {
        canvas.width = w.innerWidth;
        canvas.height = w.innerHeight;
      });
    }
  }

  /* -------------------------------------------------------------------------
     7) STARTUP SEQUENCE
     ------------------------------------------------------------------------- */
  function start() {
    fetch('/assets/json/cybersec.json')
      .then(res => res.json())
      .then(data => {
        DATA = data;
        // Initialize header functionality first
        initHeader();

        // Then render all content sections
        renderRecon();
        renderExploit();
        renderDetect();
        renderRespond();
        renderForensics();
        renderLessons();
        renderCredsProjects();

        buildObservers();
        stageNavSetup();
        wirePrint();
        initMatrix();

        // Kick the console as soon as detection panel is in view
        var detectSection = qs('#detect');
        if (detectSection && w.IntersectionObserver) {
          var once = false;
          var obs = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting && !once) {
                once = true;
                runConsole();
                obs.disconnect();
              }
            });
          }, { threshold: 0.2 });
          obs.observe(detectSection);
        }

        // Hash on load
        handleHashChange();
        w.addEventListener("hashchange", handleHashChange);
      })
      .catch(err => console.error('Data fetch error:', err));
  }

  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  /* -------------------------------------------------------------------------
     8) MINIMAL STYLES HOOKS (OPTIONAL ENHANCERS)
     These add semantic classes where useful if author provided no class.
     ------------------------------------------------------------------------- */
  // Tag and badge rendering classes for recon cards
  (function enhanceReconStyles() {
    var wrap = qs("#intel-cards");
    if (!wrap) return;
    wrap.addEventListener("click", function (e) {
      // future affordances, no-op for now
    });
  })();

  // Accessibility helper for stage anchors
  (function enhanceA11y() {
    qsa("section.stage").forEach(function (s) {
      var h = qsa("h2, h3, .panel__title", s)[0];
      if (h && !s.getAttribute("aria-labelledby")) {
        var id = h.id || s.id + "-title";
        if (!h.id) h.id = id;
        s.setAttribute("aria-labelledby", id);
      }
    });
  })();

})();