(function () {
  "use strict";

  var d = document;
  var w = window;
  var prefersReducedMotion = w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DATA = Object.create(null);

  var graphData, link, node, label, simulation, svg, scroller;
  var graphWidth, graphHeight;

  var colorMap = {
    'Core': 'var(--color-core)',
    'Offensive': 'var(--color-offensive)',
    'Defensive': 'var(--color-defensive)',
    'Cloud': 'var(--color-cloud)',
    'Dim': 'var(--color-dim)'
  };

  function drag(sim) {
    function dragstarted(event, d) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x; d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) sim.alphaTarget(0);
      d.fx = null; d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }

  function qs(sel, root) { return (root || d).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function create(el, cls) { var n = d.createElement(el); if (cls) n.className = cls; return n; }
  function setText(el, txt) { if (el) el.textContent = txt; }
  function setHTML(el, html) { if (el) el.innerHTML = html; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function copyToClipboard(text) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)["catch"](function () {});
    } else {
      var ta = create("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      d.body.appendChild(ta); ta.select();
      try { d.execCommand("copy"); } catch (e) {}
      d.body.removeChild(ta);
    }
  }
  function isString(x) { return typeof x === "string"; }
  function isArray(x) { return Array.isArray(x); }
  function isObject(x) { return x && typeof x === "object" ? x : {}; }

  var State = { activeStage: "", filter: "all", hashLock: false, currentTheme: "auto", navOpen: false };
  var ioFade = null, ioHighlight = null;

  function getSystemThemeByTime() {
    var prefersDark = w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches;
    var hour = (new Date()).getHours();
    var isDarkHours = (hour >= 19 || hour < 7);
    return (prefersDark || isDarkHours) ? "dark" : "light";
  }

  function initHeader() {
    var themeToggle = qs("#theme-toggle");
    var navToggle = qs("#nav-toggle");
    var navDropdown = qs("#nav-dropdown");
    var navLinks = qsa(".nav-dropdown__link");

    if (themeToggle) {
      var savedTheme = null;
      try { savedTheme = localStorage.getItem("cybersec-theme"); } catch (e) {}
      var themeToApply = "auto";
      if (savedTheme && savedTheme !== "auto") {
        State.currentTheme = savedTheme;
        themeToApply = savedTheme;
      } else {
        State.currentTheme = "auto";
        themeToApply = getSystemThemeByTime();
      }
      applyTheme(themeToApply);
      themeToggle.addEventListener("click", function () { toggleTheme(); });
      themeToggle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTheme(); }
      });
    }

    if (navToggle && navDropdown) {
      navToggle.addEventListener("click", function () { toggleNavigation(); });
      navToggle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleNavigation(); }
      });
      navLinks.forEach(function (link) { link.addEventListener("click", function () { closeNavigation(); }); });
      d.addEventListener("click", function (e) {
        if (State.navOpen && !navDropdown.contains(e.target) && !navToggle.contains(e.target)) { closeNavigation(); }
      });
      d.addEventListener("keydown", function (e) { if (e.key === "Escape" && State.navOpen) { closeNavigation(); } });
    }
  }

  function toggleTheme() {
    var newTheme;
    if (State.currentTheme === "auto") {
      var determined = getSystemThemeByTime();
      newTheme = determined === "dark" ? "light" : "dark";
    } else if (State.currentTheme === "dark") {
      newTheme = "light";
    } else if (State.currentTheme === "light") {
      newTheme = "auto";
    } else {
      newTheme = "dark";
    }
    State.currentTheme = newTheme;
    try { localStorage.setItem("cybersec-theme", newTheme); } catch (e) {}
    if (newTheme === "auto") { applyTheme(getSystemThemeByTime()); }
    else { applyTheme(newTheme); }
  }

  function applyTheme(themeToApply) {
    var html = d.documentElement;
    html.removeAttribute("data-theme");
    if (State.currentTheme !== "auto") {
      if (themeToApply === "dark") html.setAttribute("data-theme", "dark");
      else if (themeToApply === "light") html.setAttribute("data-theme", "light");
    }
  }

  function toggleNavigation() {
    if (State.navOpen) closeNavigation(); else openNavigation();
  }
  function openNavigation() {
    var navToggle = qs("#nav-toggle");
    var navDropdown = qs("#nav-dropdown");
    State.navOpen = true;
    if (navToggle) navToggle.setAttribute("aria-expanded", "true");
    if (navDropdown) { navDropdown.setAttribute("aria-hidden", "false"); trapFocus(navDropdown); }
  }
  function closeNavigation() {
    var navToggle = qs("#nav-toggle");
    var navDropdown = qs("#nav-dropdown");
    State.navOpen = false;
    if (navToggle) { navToggle.setAttribute("aria-expanded", "false"); navToggle.focus(); }
    if (navDropdown) navDropdown.setAttribute("aria-hidden", "true");
  }

  function trapFocus(element) {
    var focusableElements = element.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    var firstElement = focusableElements[0];
    var lastElement = focusableElements[focusableElements.length - 1];
    function trapKeydown(e) {
      if (e.key === "Tab") {
        if (e.shiftKey) { if (d.activeElement === firstElement) { e.preventDefault(); lastElement && lastElement.focus(); } }
        else { if (d.activeElement === lastElement) { e.preventDefault(); firstElement && firstElement.focus(); } }
      } else if (e.key === "Escape") {
        closeNavigation(); element.removeEventListener("keydown", trapKeydown);
      }
    }
    if (firstElement && lastElement) element.addEventListener("keydown", trapKeydown);
    else element.addEventListener("keydown", trapKeydown);
  }

  function safeArray(arr) { return Array.isArray(arr) ? arr : []; }
  function safeObject(obj) { return obj && typeof obj === "object" ? obj : {}; }

  var RECON, EXPLOIT, DETECT, RESPOND, FORENSICS, LESSONS, CREDS, PROJECTS, CONTACT, BLOG_POSTS;

  function initD3Graph(data) {
    if (typeof d3 === "undefined") return;
    graphData = (data && data.skills_network) ? data.skills_network : { nodes: [], links: [] };
    var container = qs("#skill-network");
    if (!container) return;
    graphWidth = container.clientWidth;
    graphHeight = container.clientHeight;
    svg = d3.select("#skill-network").attr("width", graphWidth).attr("height", graphHeight);
    svg.selectAll("*").remove();

    simulation = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.links).id(function (x) { return x.id; }).distance(function (d) { return 50 + (10 - d.value) * 10; }))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));

    link = svg.append("g").attr("class", "links").selectAll("line")
      .data(graphData.links).enter().append("line").attr("class", "link");

    node = svg.append("g").attr("class", "nodes").selectAll("circle")
      .data(graphData.nodes).enter().append("circle")
      .attr("class", function (d) { return "node " + String(d.group || "").toLowerCase(); })
      .attr("r", function (d) { return d.level * 8; })
      .call(drag(simulation));

    label = svg.append("g").attr("class", "labels").selectAll("text")
      .data(graphData.nodes).enter().append("text")
      .attr("class", "node-label")
      .text(function (d) { return d.id; });

    simulation.on("tick", function () {
      link.attr("x1", function (d) { return d.source.x; })
          .attr("y1", function (d) { return d.source.y; })
          .attr("x2", function (d) { return d.target.x; })
          .attr("y2", function (d) { return d.target.y; });
      node.attr("cx", function (d) { return d.x; }).attr("cy", function (d) { return d.y; });
      label.attr("x", function (d) { return d.x + d.level * 8 + 5; }).attr("y", function (d) { return d.y + 4; });
    });

    w.addEventListener("resize", function () {
      if (!container) return;
      graphWidth = container.clientWidth;
      graphHeight = container.clientHeight;
      svg.attr("width", graphWidth).attr("height", graphHeight);
      simulation.force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));
      simulation.alpha(0.3).restart();
      if (scroller && scroller.resize) scroller.resize();
    });

    simulation.alpha(1).restart();
  }

  function renderBlog() {
    var grid = qs("#article-grid");
    if (!grid) return;
    setHTML(grid, "");
    safeArray(BLOG_POSTS).forEach(function (article) {
      var card = create("article", "article-card");
      var inner = create("div");
      var h = create("h3", "article-title"); setText(h, article.title || "");
      var p = create("p", "article-summary"); setText(p, article.summary || "");
      var tagWrap = create("div", "article-tags");
      safeArray(article.tags).forEach(function (t) { var tag = create("span", "tag"); setText(tag, t); tagWrap.appendChild(tag); });
      var linkBtn = create("a", "btn btn-ghost article-link");
      linkBtn.href = article.link || "#"; linkBtn.target = "_blank"; linkBtn.rel = "noopener";
      setText(linkBtn, (article.link && article.link.indexOf("github.com") > -1) ? "View Code" : "Read Report");
      inner.appendChild(h); inner.appendChild(p); inner.appendChild(tagWrap);
      card.appendChild(inner); card.appendChild(linkBtn); grid.appendChild(card);
    });
  }

  function renderRecon() {
    var cards = qs("#intel-cards");
    var badges = qs("#recon-tools");
    var points = qs("#recon-points");
    if (!cards || !badges || !points) return;

    setHTML(cards, "");
    safeArray(RECON.intel).forEach(function (item) {
      if (!item) return;
      var card = create("div", "intel-card");
      var h = create("h3", "intel-card__title"); setText(h, item.title || "");
      var p = create("p", "intel-card__detail"); setText(p, item.detail || "");
      var tagWrap = create("div", "intel-card__tags");
      safeArray(item.tags).forEach(function (t) { var tag = create("span", "tag"); setText(tag, t); tagWrap.appendChild(tag); });
      card.appendChild(h); card.appendChild(p); card.appendChild(tagWrap); cards.appendChild(card);
    });

    setHTML(badges, "");
    safeArray(RECON.tools).forEach(function (tool) { var b = create("span", "badge"); setText(b, tool); badges.appendChild(b); });

    setHTML(points, "");
    safeArray(RECON.points).forEach(function (pt) { var li = create("li"); setText(li, pt); points.appendChild(li); });
  }

  function renderExploit() {
    var chain = qs("#attack-chain");
    var points = qs("#exploit-points");
    if (!chain || !points) return;

    setHTML(chain, "");
    var svgEl = d.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("viewBox", "0 0 400 300");
    svgEl.setAttribute("aria-hidden", "true");
    var path = d.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M50 50 L150 150 L250 50 L350 150");
    path.setAttribute("stroke", "var(--accent)");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("fill", "none");
    var length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    svgEl.appendChild(path);

    var io = w.IntersectionObserver ? new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        if (path.animate) path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 2000, fill: "forwards" });
        else path.style.strokeDashoffset = "0";
      }
    }) : null;
    if (io) io.observe(chain);

    safeArray(EXPLOIT.chain).forEach(function (step, i) {
      var circle = d.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", 50 + i * 100);
      circle.setAttribute("cy", i % 2 ? 150 : 50);
      circle.setAttribute("r", 20);
      circle.setAttribute("fill", "var(--surface)");
      svgEl.appendChild(circle);
      var text = d.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", 50 + i * 100);
      text.setAttribute("y", (i % 2 ? 150 : 50) + 5);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "middle");
      setText(text, step.id); svgEl.appendChild(text);
    });
    chain.appendChild(svgEl);

    setHTML(points, "");
    safeArray(EXPLOIT.points).forEach(function (pt) { var li = create("li"); setText(li, pt); points.appendChild(li); });
  }

  var consoleFeed, filterButtons, copyBtn, packetView;
  var consoleIndex = 0, consoleRAF = 0, consoleRunning = false;

  function renderDetect() {
    consoleFeed = qs("#console-feed");
    filterButtons = qsa('.console__filters [role="tab"]');
    copyBtn = qs("#copy-iocs");
    packetView = qs("#packet-view");

    if (consoleFeed) setHTML(consoleFeed, "");
    if (packetView) setHTML(packetView, "");

    filterButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterButtons.forEach(function (b) { b.setAttribute("aria-selected", "false"); });
        btn.setAttribute("aria-selected", "true");
        State.filter = btn.getAttribute("data-filter") || "all";
        resetConsole(); runConsole();
      });
      btn.addEventListener("keydown", function (e) {
        var idx = filterButtons.indexOf(btn);
        if (e.key === "ArrowRight") { e.preventDefault(); var next = filterButtons[clamp(idx + 1, 0, filterButtons.length - 1)]; next && next.focus(); next && next.click(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); var prev = filterButtons[clamp(idx - 1, 0, filterButtons.length - 1)]; prev && prev.focus(); prev && prev.click(); }
      });
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = safeArray(DETECT.iocs).map(function (x) { return (x.type || "") + ": " + (x.value || ""); }).join("\n");
        copyToClipboard(text);
        copyBtn.textContent = "IOCs Copied";
        setTimeout(function () { copyBtn.textContent = "Copy IOCs"; }, 1600);
      });
    }

    buildPacketView();
    resetConsole();
  }

  function buildPacketView() {
    if (!packetView) return;
    var list = create("div", "packet-list");
    safeArray(DETECT.packets).forEach(function (pkt, i) {
      var row = create("button", "packet-row");
      row.type = "button"; row.setAttribute("data-index", String(i));
      row.setAttribute("aria-label", "Packet " + String(i + 1));
      setText(row, pkt.summary || "");
      row.addEventListener("click", function () {
        var idx = Number(row.getAttribute("data-index") || "0");
        var detail = safeArray(DETECT.packets)[idx];
        if (!detail) return;
        var pane = qs(".packet-detail", packetView);
        if (!pane) { pane = create("div", "packet-detail"); packetView.appendChild(pane); }
        setHTML(pane, "");
        var h = create("h4", "packet-detail__title"); setText(h, detail.summary || "");
        var p = create("pre", "packet-detail__body"); setText(p, detail.detail || "");
        pane.appendChild(h); pane.appendChild(p);
      });
      list.appendChild(row);
    });
    packetView.appendChild(list);
  }

  function resetConsole() {
    consoleIndex = 0; consoleRunning = false;
    if (consoleFeed) setHTML(consoleFeed, "");
    if (consoleRAF) { if (w.cancelAnimationFrame) cancelAnimationFrame(consoleRAF); consoleRAF = 0; }
  }

  function runConsole() {
    if (!consoleFeed) return;
    var logs = safeArray(DETECT.logs).filter(function (l) { if (!State.filter || State.filter === "all") return true; return (l.tag === State.filter); });
    if (consoleRunning || logs.length === 0) return;
    consoleRunning = true;

    function step() {
      if (consoleIndex >= logs.length) { consoleRunning = false; return; }
      var item = logs[consoleIndex++];
      var line = create("div", "log-line");
      var level = (item.level || "info").toLowerCase();
      var kind = (item.kind || "plain").toLowerCase();
      var cls = ["log", "lvl-" + level, (kind === "alert" ? "alert" : ""), (kind === "success" ? "success" : ""), (kind === "accent" ? "accent" : "")].join(" ").replace(/\s+/g, " ").trim();
      line.className = cls;
      var ts = create("span", "log-ts"); setText(ts, item.ts || "");
      var txt = create("span", "log-text");
      line.appendChild(ts); line.appendChild(txt); consoleFeed.appendChild(line);
      consoleFeed.scrollTop = consoleFeed.scrollHeight;

      var charIndex = 0;
      var text = item.text || "";
      var interval = setInterval(function () {
        if (charIndex < text.length) { txt.textContent += text.charAt(charIndex++); }
        else {
          clearInterval(interval);
          if (prefersReducedMotion) step();
          else {
            if (w.requestAnimationFrame) consoleRAF = requestAnimationFrame(step);
            else setTimeout(step, 16);
          }
        }
      }, 50);
    }
    step();
  }

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
        var strong = create("strong"); setText(strong, t.step || "");
        var p = create("p"); setText(p, t.detail || "");
        li.appendChild(strong); li.appendChild(p);
        if (isString(t.state)) li.setAttribute("data-state", t.state);
        list.appendChild(li);
      });
    }
    if (points) {
      setHTML(points, "");
      safeArray(RESPOND.points).forEach(function (pt) { var li = create("li"); setText(li, pt); points.appendChild(li); });
    }

    function openDrawer() {
      if (!drawer) return;
      drawer.hidden = false; d.body.style.overflow = "hidden";
      if (content) {
        setHTML(content, "");
        safeArray(RESPOND.playbook).forEach(function (pb) {
          var block = create("section", "playbook-block");
          var h = create("h4"); setText(h, pb.title || ""); block.appendChild(h);
          var ul = create("ul");
          safeArray(pb.steps).forEach(function (st) { var li = create("li"); setText(li, st); ul.appendChild(li); });
          block.appendChild(ul);
          var refs = safeArray(pb.refs);
          if (refs.length) {
            var refp = create("p", "refs"); setText(refp, "References:"); block.appendChild(refp);
            var rlist = create("ul", "refs-list");
            refs.forEach(function (r) { var li2 = create("li"); if (isString(r)) setText(li2, r); rlist.appendChild(li2); });
            block.appendChild(rlist);
          }
          content.appendChild(block);
        });
      }
      setTimeout(function () { if (closeBtn) closeBtn.focus(); }, 50);
    }
    function closeDrawer() {
      if (!drawer) return;
      drawer.hidden = true; d.body.style.overflow = "";
      if (openBtn) openBtn.focus();
    }

    if (openBtn) openBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    d.addEventListener("keydown", function (e) { if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer(); });
  }

  function renderForensics() {
    var grid = qs("#evidence-grid");
    var points = qs("#forensics-points");
    if (!grid || !points) return;

    setHTML(grid, "");
    safeArray(FORENSICS.evidence).forEach(function (box) {
      var card = create("div", "evidence-card");
      var h = create("h4"); setText(h, box.title || "");
      var ul = create("ul");
      safeArray(box.bullets).forEach(function (b) { var li = create("li"); setText(li, b); ul.appendChild(li); });
      card.appendChild(h); card.appendChild(ul); grid.appendChild(card);
    });

    setHTML(points, "");
    safeArray(FORENSICS.points).forEach(function (pt) { var li = create("li"); setText(li, pt); points.appendChild(li); });
  }

  function renderLessons() {
    var heatmap = qs("#control-heatmap");
    var points = qs("#lessons-points");
    if (!heatmap || !points) return;

    setHTML(heatmap, "");
    safeArray(LESSONS.heatmap).forEach(function (cell) {
      var div = create("div");
      var labelTxt = cell.label || cell.id || "";
      div.setAttribute("data-state", cell.state || "");
      div.setAttribute("title", labelTxt);
      heatmap.appendChild(div);
    });

    setHTML(points, "");
    safeArray(LESSONS.points).forEach(function (pt) { var li = create("li"); setText(li, pt); points.appendChild(li); });
  }

  function renderCredsProjects() {
    var strip = qs("#cred-strip");
    var cases = qs("#case-grid");
    if (strip) {
      setHTML(strip, "");
      safeArray(CREDS).forEach(function (c) {
        var item = create("div", "cred-item");
        var a = create("a");
        a.href = isString(c.link) ? c.link : "#"; a.target = "_blank"; a.rel = "noopener"; a.className = "cred-link";
        var t = (c.when ? c.when + " — " : "") + (c.title || "");
        setText(a, t);
        var meta = create("div", "cred-meta"); setText(meta, c.org || "");
        item.appendChild(a); item.appendChild(meta); strip.appendChild(item);
      });
    }
    if (cases) {
      setHTML(cases, "");
      safeArray(PROJECTS).forEach(function (p) {
        var card = create("article", "case-card");
        var h = create("h3"); setText(h, p.title || "");
        var ctx = create("p", "case-ctx"); setText(ctx, p.context || "");
        var out = create("p", "case-out"); setText(out, p.outcome || "");
        var a = null;
        if (isString(p.link) && p.link.length) {
          a = create("a"); a.href = p.link; a.target = "_blank"; a.rel = "noopener"; a.className = "btn btn-ghost"; setText(a, "Open");
        }
        card.appendChild(h); card.appendChild(ctx); card.appendChild(out); if (a) card.appendChild(a);
        cases.appendChild(card);
      });
    }
  }

  function updateGraph(stepIndex) {
    if (!node || prefersReducedMotion || typeof d3 === "undefined") return;
    var t = d3.transition().duration(750);
    label.classed("active", false);
    node.transition(t).style("fill-opacity", 0.3).attr("r", function (d) { return d.level * 8; }).style("fill", colorMap.Dim);
    link.transition(t).style("stroke-opacity", 0.1).style("stroke-width", 1).style("stroke", colorMap.Dim);
    label.transition(t).style("fill-opacity", 0.3);

    var targetGroup, targetColor;
    if (stepIndex === 1) { targetGroup = "Offensive"; targetColor = colorMap.Offensive; }
    else if (stepIndex === 2) { targetGroup = "Defensive"; targetColor = colorMap.Defensive; }
    else if (stepIndex === 3) { targetGroup = "Cloud"; targetColor = colorMap.Cloud; }

    if (stepIndex === 0) {
      node.filter(function (d) { return d.group === "Core"; })
        .transition(t).style("fill-opacity", 1).attr("r", 30).style("fill", colorMap.Core);
      label.filter(function (d) { return d.group === "Core"; }).classed("active", true).transition(t).style("fill-opacity", 1);
    } else if (stepIndex >= 1 && stepIndex <= 3) {
      node.filter(function (d) { return d.group === targetGroup || d.group === "Core"; })
        .transition(t).style("fill-opacity", 1).style("fill", function (d) { return d.group === "Core" ? colorMap.Core : targetColor; });
      link.filter(function (d) { return d.source.group === targetGroup || d.target.group === targetGroup; })
        .transition(t).style("stroke-opacity", 0.7).style("stroke", targetColor).style("stroke-width", 2);
      label.filter(function (d) { return d.group === targetGroup || d.group === "Core"; }).classed("active", true).transition(t).style("fill-opacity", 1);
    } else if (stepIndex === 4) {
      label.classed("active", true);
      node.transition(t).style("fill-opacity", 1).attr("r", function (d) { return d.level * 10; })
          .style("fill", function (d) { return colorMap[d.group] || colorMap.Dim; });
      link.transition(t).style("stroke-opacity", 1).style("stroke-width", 2)
          .style("stroke", function (d) { return colorMap[d.source.group] || colorMap.Dim; });
      label.transition(t).style("fill-opacity", 1);
    }
  }

  function handleStepEnter(response) {
    qsa(".step").forEach(function (el) { el.classList.remove("is-active"); });
    response.element.classList.add("is-active");
    var idx = parseInt(response.element.getAttribute("data-step"), 10);
    updateGraph(isNaN(idx) ? 0 : idx);
  }

  function setupScrollama() {
    if (typeof scrollama === "undefined" || prefersReducedMotion) {
      var graphSection = qs("#skills-graph");
      var graphSteps = qs("#graph-steps");
      if (graphSection) graphSection.style.minHeight = "auto";
      if (graphSteps) graphSteps.style.display = "none";
      if (node) updateGraph(4);
      return;
    }
    scroller = scrollama();
    scroller.setup({ step: "#skills-graph .step", offset: 0.5 }).onStepEnter(handleStepEnter);
    w.addEventListener("resize", scroller.resize);
    if (node) updateGraph(0);
  }

  function buildObservers() {
    var fadeTargets = qsa(".story__lead, .key-points li");
    if (fadeTargets.length && w.IntersectionObserver) {
      ioFade = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("visible"); ioFade.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
      fadeTargets.forEach(function (t) { ioFade.observe(t); });
    }

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

    var stages = qsa(".stage");
    var navLinks = qsa(".stage-nav a");
    var progressBar = create("div", "global-progress");
    d.body.appendChild(progressBar);

    if (w.IntersectionObserver) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            navLinks.forEach(function (lnk) { lnk.classList.remove("active"); });
            var targetLink = qs('.stage-nav a[href="#' + e.target.id + '"]');
            if (targetLink) targetLink.classList.add("active");
          }
        });
      }, { threshold: 0.5 });
      stages.forEach(function (s) { obs.observe(s); });
    }

    var lastScroll = 0;
    w.addEventListener("scroll", function () {
      if (Math.abs(w.scrollY - lastScroll) < 50) return;
      lastScroll = w.scrollY;
      qsa(".parallax-layer").forEach(function (layer) {
        layer.style.transform = "translateY(" + (w.scrollY * 0.3) + "px)";
      });
      var denom = (d.documentElement.scrollHeight - w.innerHeight);
      var percent = denom > 0 ? (w.scrollY / denom) * 100 : 0;
      progressBar.style.width = percent + "%";
    });
  }

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
        if (target.indexOf("#") === 0) {
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

  function wirePrint() {
    var btn = qs("#print-cv");
    if (!btn) return;
    btn.addEventListener("click", function () {
      d.documentElement.classList.add("print-mode");
      setTimeout(function () {
        if (w.print) w.print();
        d.documentElement.classList.remove("print-mode");
      }, 50);
    });
  }

  function initMatrix() {
    var canvas = qs("#matrix-bg");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    function size() { canvas.width = w.innerWidth; canvas.height = w.innerHeight; }
    size();
    var chars = "01".split("");
    var fontSize = 16;
    var columns = Math.floor(canvas.width / fontSize);
    var drops = Array.from ? Array.from({ length: columns }, function () { return Math.random() * canvas.height / fontSize; })
                           : new Array(columns).fill(0).map(function () { return Math.random() * canvas.height / fontSize; });
    function draw() {
      ctx.fillStyle = "rgba(18,18,18,0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = getComputedStyle(d.documentElement).getPropertyValue("--success") || "#28a745";
      ctx.font = fontSize + "px monospace";
      for (var i = 0; i < drops.length; i++) {
        var text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        drops[i] = drops[i] > canvas.height / fontSize ? 0 : drops[i] + 1;
      }
      if (!prefersReducedMotion) { if (w.requestAnimationFrame) requestAnimationFrame(draw); else setTimeout(draw, 16); }
    }
    draw();
    w.addEventListener("resize", function () {
      size();
      columns = Math.floor(canvas.width / fontSize);
      drops = new Array(columns).fill(0).map(function () { return Math.random() * canvas.height / fontSize; });
    });
  }

  function startWithData(data) {
    DATA = data || {};
    RECON = safeObject(DATA.recon);
    EXPLOIT = safeObject(DATA.exploit);
    DETECT = safeObject(DATA.detect);
    RESPOND = safeObject(DATA.respond);
    FORENSICS = safeObject(DATA.forensics);
    LESSONS = safeObject(DATA.lessons);
    CREDS = safeArray(DATA.credentials);
    PROJECTS = safeArray(DATA.projects);
    CONTACT = safeObject(DATA.contact);
    BLOG_POSTS = safeArray(DATA.blog_posts);

    initHeader();
    initD3Graph(DATA);
    setupScrollama();

    renderBlog();
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

    var detectSection = qs("#detect");
    if (detectSection && w.IntersectionObserver) {
      var once = false;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !once) { once = true; runConsole(); io.disconnect(); }
        });
      }, { threshold: 0.2 });
      io.observe(detectSection);
    }

    handleHashChange();
    w.addEventListener("hashchange", handleHashChange);
  }

  function fetchJSON(url, done) {
    if (w.fetch) {
      fetch(url).then(function (res) { return res.json(); }).then(function (json) { done(null, json); })["catch"](function (err) { done(err); });
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { done(null, JSON.parse(xhr.responseText)); } catch (e) { done(e); }
          } else { done(new Error("HTTP " + xhr.status)); }
        }
      };
      xhr.send();
    }
  }

  function start() {
    fetchJSON("/assets/json/cybersec.json", function (err, data) {
      if (err) { startWithData({}); return; }
      startWithData(data);
    });
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start); else start();

  (function () {
    var wrap = qs("#intel-cards");
    if (!wrap) return;
    wrap.addEventListener("click", function () {});
  })();

  (function () {
    qsa("section.stage").forEach(function (s) {
      var h = qsa("h2, h3, .panel__title", s)[0];
      if (h && !s.getAttribute("aria-labelledby")) {
        var id = h.id || (s.id ? s.id + "-title" : "");
        if (!h.id) h.id = id || ("title-" + Math.random().toString(36).slice(2));
        s.setAttribute("aria-labelledby", h.id);
      }
    });
  })();

})();
