(function () {
  "use strict";

  var d = document;
  var w = window;

  var prefersReducedMotion =
    w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var DATA = Object.create(null);

  var graphData, link, node, label, simulation, svg;
  var graphWidth = 0, graphHeight = 0;
  var scrollers = {};

  var colorMap = {
    Core: "var(--color-core)",
    Offensive: "var(--color-offensive)",
    Defensive: "var(--color-defensive)",
    Cloud: "var(--color-cloud)",
    Dim: "var(--color-dim)"
  };

  function qs(sel, root) { return (root || d).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || d).querySelectorAll(sel)); }
  function create(el, cls) { var n = d.createElement(el); if (cls) n.className = cls; return n; }
  function setText(el, txt) { if (el) el.textContent = txt; }
  function setHTML(el, html) { if (el) el.innerHTML = html; }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function isString(x) { return typeof x === "string"; }
  function safeArray(arr) { return Array.isArray(arr) ? arr : []; }
  function safeObject(obj) { return obj && typeof obj === "object" ? obj : {}; }

  function stripHtml(html) {
    var tmp = d.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || tmp.innerText || "";
  }

  function truncate(text, max) {
    if (!text) return "";
    if (text.length <= max) return text;
    return text.slice(0, max).trim() + "...";
  }

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

  var State = {
    activeStage: "",
    filter: "all",
    hashLock: false,
    currentTheme: "auto",
    navOpen: false
  };

  var ioFade = null, ioHighlight = null;

  var RECON, EXPLOIT, DETECT, RESPOND, FORENSICS, LESSONS, CREDS, PROJECTS, CONTACT, BLOG_POSTS;

  function getSystemThemeByTime() {
    var prefersDark = w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches;
    var hour = (new Date()).getHours();
    var isDarkHours = (hour >= 19 || hour < 7);
    return (prefersDark || isDarkHours) ? "dark" : "light";
  }

  function applyTheme(themeToApply) {
    var html = d.documentElement;
    html.removeAttribute("data-theme");
    if (themeToApply === "dark") html.setAttribute("data-theme", "dark");
    if (themeToApply === "light") html.setAttribute("data-theme", "light");
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
    if (newTheme === "auto") applyTheme(getSystemThemeByTime());
    else applyTheme(newTheme);
  }

  function trapFocus(element, onEscape) {
    var focusable = element.querySelectorAll("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])");
    focusable = Array.prototype.slice.call(focusable);
    if (!focusable.length) return;

    var first = focusable[0];
    var last = focusable[focusable.length - 1];

    function onKeydown(e) {
      if (e.key === "Escape") {
        element.removeEventListener("keydown", onKeydown);
        if (onEscape) onEscape();
        return;
      }
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (d.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (d.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    element.addEventListener("keydown", onKeydown);
  }

  function initHeader() {
    var themeToggle = qs("#theme-toggle");
    var navToggle = qs("#nav-toggle");
    var navDropdown = qs("#nav-dropdown");
    var navLinks = qsa(".nav-dropdown__link");

    if (themeToggle) {
      var savedTheme = null;
      try { savedTheme = localStorage.getItem("cybersec-theme"); } catch (e) {}
      if (savedTheme && savedTheme !== "auto") {
        State.currentTheme = savedTheme;
        applyTheme(savedTheme);
      } else {
        State.currentTheme = "auto";
        applyTheme(getSystemThemeByTime());
      }

      themeToggle.addEventListener("click", toggleTheme);
      themeToggle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTheme();
        }
      });
    }

    function openNavigation() {
      State.navOpen = true;
      if (navToggle) navToggle.setAttribute("aria-expanded", "true");
      if (navDropdown) {
        navDropdown.setAttribute("aria-hidden", "false");
        trapFocus(navDropdown, closeNavigation);
        var firstLink = qs(".nav-dropdown__link", navDropdown);
        if (firstLink) firstLink.focus();
      }
    }

    function closeNavigation() {
      State.navOpen = false;
      if (navToggle) {
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.focus();
      }
      if (navDropdown) navDropdown.setAttribute("aria-hidden", "true");
    }

    function toggleNavigation() {
      if (State.navOpen) closeNavigation();
      else openNavigation();
    }

    if (navToggle && navDropdown) {
      navToggle.addEventListener("click", toggleNavigation);
      navToggle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleNavigation();
        }
      });

      navLinks.forEach(function (a) { a.addEventListener("click", closeNavigation); });

      d.addEventListener("click", function (e) {
        if (!State.navOpen) return;
        if (!navDropdown.contains(e.target) && !navToggle.contains(e.target)) closeNavigation();
      });

      d.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && State.navOpen) closeNavigation();
      });
    }
  }

  function drag(sim) {
    function dragstarted(event, d2) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      d2.fx = d2.x;
      d2.fy = d2.y;
    }
    function dragged(event, d2) {
      d2.fx = event.x;
      d2.fy = event.y;
    }
    function dragended(event, d2) {
      if (!event.active) sim.alphaTarget(0);
      d2.fx = null;
      d2.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }

  function initD3Graph(data) {
    if (typeof d3 === "undefined") return;

    graphData = safeObject(data && data.skills_network);
    graphData.nodes = safeArray(graphData.nodes);
    graphData.links = safeArray(graphData.links);

    var container = qs("#skill-network");
    if (!container) return;

    graphWidth = Math.max(container.clientWidth || 0, 300);
    graphHeight = Math.max(container.clientHeight || 0, 400);

    svg = d3.select("#skill-network").attr("width", graphWidth).attr("height", graphHeight);
    svg.selectAll("*").remove();

    simulation = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.links).id(function (x) { return x.id; }).distance(80))
      .force("charge", d3.forceManyBody().strength(-320))
      .force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));

    link = svg.append("g").attr("class", "links").selectAll("line")
      .data(graphData.links).enter().append("line").attr("class", "link");

    node = svg.append("g").attr("class", "nodes").selectAll("circle")
      .data(graphData.nodes).enter().append("circle")
      .attr("class", function (d2) { return "node " + String(d2.group || "").toLowerCase(); })
      .attr("r", function (d2) { return (Number(d2.level) || 1) * 8; })
      .call(drag(simulation));

    label = svg.append("g").attr("class", "labels").selectAll("text")
      .data(graphData.nodes).enter().append("text")
      .attr("class", "node-label")
      .text(function (d2) { return d2.id; });

    simulation.on("tick", function () {
      link.attr("x1", function (d2) { return d2.source.x; })
        .attr("y1", function (d2) { return d2.source.y; })
        .attr("x2", function (d2) { return d2.target.x; })
        .attr("y2", function (d2) { return d2.target.y; });

      node.attr("cx", function (d2) { return d2.x; }).attr("cy", function (d2) { return d2.y; });
      label.attr("x", function (d2) { return d2.x + ((Number(d2.level) || 1) * 8) + 6; })
        .attr("y", function (d2) { return d2.y + 4; });
    });

    w.addEventListener("resize", function () {
      if (!container) return;
      graphWidth = Math.max(container.clientWidth || 0, 300);
      graphHeight = Math.max(container.clientHeight || 0, 400);
      svg.attr("width", graphWidth).attr("height", graphHeight);
      simulation.force("center", d3.forceCenter(graphWidth / 2, graphHeight / 2));
      simulation.alpha(0.35).restart();
      Object.values(scrollers).forEach(function (scroller) {
        if (scroller && scroller.resize) scroller.resize();
      });
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
      var h = create("h3", "article-title");
      setText(h, article.title || "");

      var p = create("p", "article-summary");
      setText(p, article.summary || "");

      var tagWrap = create("div", "article-tags");
      safeArray(article.tags).forEach(function (t) {
        var tag = create("span", "tag");
        setText(tag, t);
        tagWrap.appendChild(tag);
      });

      var linkBtn = create("a", "btn btn-ghost article-link");
      linkBtn.href = article.link || "#";
      linkBtn.target = "_blank";
      linkBtn.rel = "noopener";
      setText(linkBtn, (article.link && article.link.indexOf("github.com") > -1) ? "View Code" : "Read Report");

      inner.appendChild(h);
      inner.appendChild(p);
      inner.appendChild(tagWrap);

      card.appendChild(inner);
      card.appendChild(linkBtn);
      grid.appendChild(card);
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

  var exploitRendered = false;
  var exploitAnimated = false;

  function renderExploit() {
    var chain = qs("#attack-chain");
    var points = qs("#exploit-points");
    if (!chain || !points) return;

    setHTML(chain, "");

    if (typeof d3 === "undefined") return;

    var width = Math.max(chain.clientWidth || 0, 320);
    var height = Math.max(chain.clientHeight || 0, 360);

    var exploitSvg = d3.select("#attack-chain")
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height]);

    var chainData = safeArray(EXPLOIT.chain);

    var nodes = chainData.map(function (step, i) {
      var x = chainData.length > 1 ? (i * (width / (chainData.length - 1))) : (width / 2);
      var y = (i % 2 === 0) ? (height * 0.35) : (height * 0.7);
      return {
        id: step.id || String(i + 1),
        title: step.title || "",
        detail: step.detail || "",
        mitre: step.mitre || "",
        x: x,
        y: y
      };
    });

    var links = [];
    for (var i = 0; i < nodes.length - 1; i++) {
      links.push({ source: nodes[i], target: nodes[i + 1] });
    }

    var paths = exploitSvg.selectAll(".attack-chain-link")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "attack-chain-link")
      .attr("d", function (d2) {
        var c1x = d2.source.x + Math.min(120, width * 0.2);
        var c2x = d2.target.x - Math.min(120, width * 0.2);
        return "M" + d2.source.x + "," + d2.source.y +
          " C" + c1x + "," + d2.source.y +
          " " + c2x + "," + d2.target.y +
          " " + d2.target.x + "," + d2.target.y;
      })
      .attr("stroke-dasharray", "10,5")
      .attr("stroke-dashoffset", 1000);

    var nodeGroups = exploitSvg.selectAll(".attack-chain-node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "attack-chain-node")
      .attr("transform", function (d2) { return "translate(" + d2.x + "," + d2.y + ")"; })
      .style("cursor", "pointer");

    nodeGroups.append("circle")
      .attr("r", 25)
      .attr("class", "attack-chain-node-circle")
      .style("fill", "var(--surface)")
      .style("stroke", "var(--accent)")
      .style("stroke-width", 2);

    nodeGroups.append("text")
      .attr("class", "attack-chain-label")
      .attr("y", 4)
      .text(function (d2) { return d2.id; });

    nodeGroups.append("title")
      .text(function (d2) {
        var mitre = d2.mitre ? (" | " + d2.mitre) : "";
        return (d2.title || "") + mitre + ": " + (d2.detail || "");
      });

    nodeGroups.on("mouseenter", function () {
      d3.select(this).select("circle")
        .transition().duration(160)
        .attr("r", 29)
        .style("fill", "var(--accent)");
    });

    nodeGroups.on("mouseleave", function () {
      d3.select(this).select("circle")
        .transition().duration(160)
        .attr("r", 25)
        .style("fill", "var(--surface)");
    });

    nodeGroups.on("click", function (event, d2) {
      var detailBox = qs("#attack-chain-detail") || create("div", "attack-chain-detail");
      detailBox.id = "attack-chain-detail";
      var mitre = d2.mitre ? ("<p><strong>MITRE:</strong> " + d2.mitre + "</p>") : "";
      setHTML(detailBox, "<h4>" + (d2.title || "") + " (" + (d2.id || "") + ")</h4><p>" + (d2.detail || "") + "</p>" + mitre);
      if (!qs("#attack-chain-detail", chain)) chain.appendChild(detailBox);
    });

    setHTML(points, "");
    safeArray(EXPLOIT.points).forEach(function (pt) {
      var li = create("li");
      setText(li, pt);
      points.appendChild(li);
    });

    exploitRendered = true;

    function animateOnce() {
      if (exploitAnimated || prefersReducedMotion) return;
      exploitAnimated = true;

      paths
        .transition()
        .duration(1400)
        .ease(d3.easeCubicInOut)
        .attr("stroke-dashoffset", 0);
    }

    w.setTimeout(animateOnce, 50);
  }

  var consoleFeed, filterButtons, copyBtn, packetView;
  var consoleIndex = 0;
  var consoleRAF = 0;
  var consoleRunning = false;
  var consoleTypingTimer = 0;

  function clearConsoleTimers() {
    if (consoleTypingTimer) {
      clearInterval(consoleTypingTimer);
      consoleTypingTimer = 0;
    }
    if (consoleRAF && w.cancelAnimationFrame) {
      w.cancelAnimationFrame(consoleRAF);
      consoleRAF = 0;
    }
  }

  function resetConsole() {
    consoleIndex = 0;
    consoleRunning = false;
    clearConsoleTimers();
    if (consoleFeed) setHTML(consoleFeed, "");
  }

  function buildPacketView() {
    if (!packetView) return;
    setHTML(packetView, "");

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
        var h = create("h4", "packet-detail__title"); setText(h, detail.summary || "");
        var p = create("pre", "packet-detail__body"); setText(p, detail.detail || "");

        pane.appendChild(h);
        pane.appendChild(p);
      });

      list.appendChild(row);
    });

    packetView.appendChild(list);
  }

  function runConsole() {
    if (!consoleFeed) return;

    var logs = safeArray(DETECT.logs).filter(function (l) {
      if (!State.filter || State.filter === "all") return true;
      return (l.tag === State.filter);
    });

    if (consoleRunning || logs.length === 0) return;
    consoleRunning = true;

    function pushLine(item) {
      var line = create("div", "log-line");

      var level = (item.level || "info").toLowerCase();
      var kind = (item.kind || "plain").toLowerCase();

      var cls = [
        "log",
        "lvl-" + level,
        (kind === "alert" ? "alert" : ""),
        (kind === "success" ? "success" : ""),
        (kind === "accent" ? "accent" : "")
      ].join(" ").replace(/\s+/g, " ").trim();

      line.className = cls;

      var ts = create("span", "log-ts");
      setText(ts, item.ts || "");

      var txt = create("span", "log-text");
      setText(txt, "");

      line.appendChild(ts);
      line.appendChild(txt);
      consoleFeed.appendChild(line);
      consoleFeed.scrollTop = consoleFeed.scrollHeight;

      return txt;
    }

    function step() {
      if (consoleIndex >= logs.length) {
        consoleRunning = false;
        clearConsoleTimers();
        return;
      }

      var item = logs[consoleIndex++];
      var txtNode = pushLine(item);
      var text = item.text || "";
      var charIndex = 0;

      clearConsoleTimers();

      consoleTypingTimer = setInterval(function () {
        if (charIndex < text.length) {
          txtNode.textContent += text.charAt(charIndex++);
          consoleFeed.scrollTop = consoleFeed.scrollHeight;
        } else {
          clearConsoleTimers();
          if (prefersReducedMotion) {
            step();
          } else {
            if (w.requestAnimationFrame) consoleRAF = w.requestAnimationFrame(step);
            else consoleRAF = w.setTimeout(step, 20);
          }
        }
      }, 26);
    }

    step();
  }

  function renderDetect() {
    consoleFeed = qs("#console-feed");
    filterButtons = qsa(".console__filters [role='tab']");
    copyBtn = qs("#copy-iocs");
    packetView = qs("#packet-view");

    if (consoleFeed) setHTML(consoleFeed, "");
    if (packetView) setHTML(packetView, "");

    filterButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        filterButtons.forEach(function (b) { b.setAttribute("aria-selected", "false"); });
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
          if (next) { next.focus(); next.click(); }
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          var prev = filterButtons[clamp(idx - 1, 0, filterButtons.length - 1)];
          if (prev) { prev.focus(); prev.click(); }
        }
      });
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var text = safeArray(DETECT.iocs).map(function (x) {
          return (x.type || "") + ": " + (x.value || "");
        }).join("\n");
        copyToClipboard(text);
        copyBtn.textContent = "IOCs Copied";
        w.setTimeout(function () { copyBtn.textContent = "Copy IOCs"; }, 1600);
      });
    }

    buildPacketView();
    resetConsole();
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
        li.appendChild(strong);
        li.appendChild(p);
        if (isString(t.state)) li.setAttribute("data-state", t.state);
        list.appendChild(li);
      });
    }

    if (points) {
      setHTML(points, "");
      safeArray(RESPOND.points).forEach(function (pt) {
        var li2 = create("li");
        setText(li2, pt);
        points.appendChild(li2);
      });
    }

    function createResponseDashboard() {
        const dashboard = document.createElement('div');
        dashboard.className = 'custom-response-dashboard';
        
        // Use your actual JSON data
        const timeline = safeArray(RESPOND.timeline);
        const timelineHTML = timeline.map(step => `
            <div class="timeline-step ${step.state === 'complete' ? 'active' : ''}">
                <div class="step-time">${step.step}</div>
                <div class="step-desc">${step.detail}</div>
            </div>
        `).join('');
        
        dashboard.innerHTML = `
            <div class="dashboard-header">
                <h4>🚨 Incident Response Dashboard</h4>
                <div class="status-badge status-contained">RESPONSE ACTIVE</div>
            </div>
            <div class="timeline-visual">${timelineHTML}</div>
            <div class="dashboard-footer">
                <strong>Framework:</strong> NIST SP 800-61 | <strong>SLA:</strong> 99.9%
            </div>
        `;
        
        return dashboard;
    }
    
    // Then insert it in the story
    const story = document.querySelector('[data-story="respond"]');
    const lead = story.querySelector('.story__lead');
    story.insertBefore(createResponseDashboard(), story.querySelector('#respond-points'));

    function openDrawer() {
      if (!drawer) return;
      drawer.hidden = false;
      d.body.classList.add("drawer-open");

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
              setText(li2, isString(r) ? r : "");
              rlist.appendChild(li2);
            });
            block.appendChild(rlist);
          }

          content.appendChild(block);
        });
      }

      trapFocus(drawer, closeDrawer);

      w.setTimeout(function () {
        if (closeBtn) closeBtn.focus();
      }, 30);
    }

    function closeDrawer() {
      if (!drawer) return;
      drawer.hidden = true;
      d.body.classList.remove("drawer-open");
      if (openBtn) openBtn.focus();
    }

    if (openBtn) openBtn.addEventListener("click", openDrawer);
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);

    d.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer && !drawer.hidden) closeDrawer();
    });
  }

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
      var li2 = create("li");
      setText(li2, pt);
      points.appendChild(li2);
    });
  }

  function renderLessons() {
    var heatmap = qs("#control-heatmap");
    var points = qs("#lessons-points");
    if (!heatmap || !points) return;

    setHTML(heatmap, "");
    safeArray(LESSONS.heatmap).forEach(function (cell) {
      var div = create("div");
      div.setAttribute("data-state", cell.state || "");
      div.setAttribute("title", cell.label || cell.id || "");
      setText(div, cell.id || "");
      heatmap.appendChild(div);
    });

    setHTML(points, "");
    safeArray(LESSONS.points).forEach(function (pt) {
      var li2 = create("li");
      setText(li2, pt);
      points.appendChild(li2);
    });
  }

  function renderCredsProjects() {
    var strip = qs("#cred-strip");
    var cases = qs("#case-grid");

    if (strip) {
      setHTML(strip, "");
      safeArray(CREDS).forEach(function (c) {
        var item = create("div", "cred-item");

        var a = create("a");
        a.href = isString(c.link) && c.link.length ? c.link : "#";
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "cred-link";

        var t = (c.when ? (c.when + " - ") : "") + (c.title || "");
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
      safeArray(PROJECTS).forEach(function (p) {
        var card = create("article", "case-card");

        var h = create("h3");
        setText(h, p.title || "");

        var ctx = create("p", "case-ctx");
        setText(ctx, p.context || "");

        var out = create("p", "case-out");
        setText(out, p.outcome || "");

        card.appendChild(h);
        card.appendChild(ctx);
        card.appendChild(out);

        if (isString(p.link) && p.link.length) {
          var a2 = create("a");
          a2.href = p.link;
          a2.target = "_blank";
          a2.rel = "noopener";
          a2.className = "btn btn-ghost";
          setText(a2, "Open");
          card.appendChild(a2);
        }

        cases.appendChild(card);
      });
    }
  }

  function updateGraph(stepIndex) {
    if (!node || prefersReducedMotion || typeof d3 === "undefined") return;

    var t = d3.transition().duration(750);

    label.classed("active", false);

    node.transition(t)
      .style("fill-opacity", 0.3)
      .attr("r", function (d2) { return (Number(d2.level) || 1) * 8; })
      .style("fill", colorMap.Dim);

    link.transition(t)
      .style("stroke-opacity", 0.1)
      .style("stroke-width", 1)
      .style("stroke", colorMap.Dim);

    label.transition(t).style("fill-opacity", 0.3);

    var targetGroup = "";
    var targetColor = "";

    if (stepIndex === 1) { targetGroup = "Offensive"; targetColor = colorMap.Offensive; }
    else if (stepIndex === 2) { targetGroup = "Defensive"; targetColor = colorMap.Defensive; }
    else if (stepIndex === 3) { targetGroup = "Cloud"; targetColor = colorMap.Cloud; }

    if (stepIndex === 0) {
      node.filter(function (d2) { return d2.group === "Core"; })
        .transition(t)
        .style("fill-opacity", 1)
        .attr("r", 30)
        .style("fill", colorMap.Core);

      label.filter(function (d2) { return d2.group === "Core"; })
        .classed("active", true)
        .transition(t)
        .style("fill-opacity", 1);

    } else if (stepIndex >= 1 && stepIndex <= 3) {
      node.filter(function (d2) { return d2.group === targetGroup || d2.group === "Core"; })
        .transition(t)
        .style("fill-opacity", 1)
        .style("fill", function (d2) { return d2.group === "Core" ? colorMap.Core : targetColor; });

      link.filter(function (d2) { return d2.source.group === targetGroup || d2.target.group === targetGroup; })
        .transition(t)
        .style("stroke-opacity", 0.7)
        .style("stroke", targetColor)
        .style("stroke-width", 2);

      label.filter(function (d2) { return d2.group === targetGroup || d2.group === "Core"; })
        .classed("active", true)
        .transition(t)
        .style("fill-opacity", 1);

    } else if (stepIndex === 4) {
      label.classed("active", true);

      node.transition(t)
        .style("fill-opacity", 1)
        .attr("r", function (d2) { return (Number(d2.level) || 1) * 10; })
        .style("fill", function (d2) { return colorMap[d2.group] || colorMap.Dim; });

      link.transition(t)
        .style("stroke-opacity", 1)
        .style("stroke-width", 2)
        .style("stroke", function (d2) { return colorMap[d2.source.group] || colorMap.Dim; });

      label.transition(t).style("fill-opacity", 1);
    }
  }

  function setupScrollama() {
    if (typeof scrollama === "undefined" || prefersReducedMotion) {
      if (node) updateGraph(4);
      return;
    }

    function ensureScroller(key) {
      if (!scrollers[key]) scrollers[key] = scrollama();
      return scrollers[key];
    }

    ensureScroller("skills").setup({
      step: "#skills-graph .step",
      offset: 0.55,
      progress: true
    }).onStepEnter(function (response) {
      qsa("#skills-graph .step").forEach(function (el) { el.classList.remove("is-active"); });
      response.element.classList.add("is-active");
      var idx = parseInt(response.element.getAttribute("data-step"), 10);
      updateGraph(isNaN(idx) ? 0 : idx);
    });

    var stageKeys = ["recon", "exploit", "detect", "respond", "forensics", "lessons"];
    stageKeys.forEach(function (id) {
      ensureScroller(id).setup({
        step: "#" + id + " .story",
        offset: 0.45
      }).onStepEnter(function () {
        var panel = qs('[data-panel="' + id + '"]');
        if (panel) panel.classList.add("active");

        if (id === "detect") {
          if (!consoleRunning) runConsole();
        }

        if (id === "exploit") {
          if (exploitRendered && !exploitAnimated && !prefersReducedMotion && typeof d3 !== "undefined") {
            exploitAnimated = true;
            d3.selectAll("#attack-chain svg .attack-chain-link")
              .transition()
              .duration(1400)
              .ease(d3.easeCubicInOut)
              .attr("stroke-dashoffset", 0);
          }
        }
      });
    });

    w.addEventListener("resize", function () {
      Object.values(scrollers).forEach(function (scroller) {
        if (scroller && scroller.resize) scroller.resize();
      });
    });

    updateGraph(0);
  }

  function buildObservers() {
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
    var progressBar = qs(".global-progress") || create("div", "global-progress");
    if (!qs(".global-progress")) d.body.appendChild(progressBar);

    if (w.IntersectionObserver && stages.length) {
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
      if (Math.abs(w.scrollY - lastScroll) < 20) return;
      lastScroll = w.scrollY;

      var denom = (d.documentElement.scrollHeight - w.innerHeight);
      var percent = denom > 0 ? (w.scrollY / denom) * 100 : 0;
      progressBar.style.width = percent + "%";
    });
  }

  function stageNavSetup() {
    var links = qsa(".stage-nav a");
    links.forEach(function (a) {
      a.addEventListener("click", function (e) {
        var target = a.getAttribute("href") || "";
        if (target.indexOf("#") !== 0) return;

        e.preventDefault();
        var id = target.slice(1);

        State.hashLock = true;
        w.location.hash = id;
        handleHashChange();
        w.setTimeout(function () { State.hashLock = false; }, 220);
      });
    });
  }

  function handleHashChange() {
    if (State.hashLock) return;

    var id = (w.location.hash || "").replace("#", "");
    if (!id) return;

    var el = d.getElementById(id);
    if (!el) return;

    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
  }

  function wirePrint() {
    var btn = qs("#print-cv");
    if (!btn) return;

    btn.addEventListener("click", function () {
      d.documentElement.classList.add("print-mode");
      w.setTimeout(function () {
        if (w.print) w.print();
        d.documentElement.classList.remove("print-mode");
      }, 60);
    });
  }

  function initMatrix() {
    var canvas = qs("#matrix-bg");
    if (!canvas) return;

    canvas.style.pointerEvents = "none";

    var ctx = canvas.getContext("2d");

    function size() {
      canvas.width = w.innerWidth;
      canvas.height = w.innerHeight;
    }
    size();

    var chars = ["0", "1"];
    var fontSize = 16;
    var columns = Math.max(1, Math.floor(canvas.width / fontSize));
    var drops = new Array(columns).fill(0).map(function () {
      return Math.random() * canvas.height / fontSize;
    });

    function draw() {
      ctx.fillStyle = "rgba(18,18,18,0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      var s = getComputedStyle(d.documentElement).getPropertyValue("--success");
      ctx.fillStyle = (s && s.trim()) ? s.trim() : "#28a745";
      ctx.font = fontSize + "px monospace";

      for (var i = 0; i < drops.length; i++) {
        var text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        drops[i] = drops[i] > canvas.height / fontSize ? 0 : drops[i] + 1;
      }

      if (!prefersReducedMotion) {
        if (w.requestAnimationFrame) w.requestAnimationFrame(draw);
        else w.setTimeout(draw, 50);
      }
    }

    draw();

    w.addEventListener("resize", function () {
      size();
      columns = Math.max(1, Math.floor(canvas.width / fontSize));
      drops = new Array(columns).fill(0).map(function () {
        return Math.random() * canvas.height / fontSize;
      });
    });
  }

  function fetchTechReviewRSS() {
    if (!w.fetch) return;

    var grid = qs("#article-grid");
    if (!grid) return;

    var FEED_URL = "https://www.technologyreview.com/feed/";
    var PROXY_URL = "https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent(FEED_URL);

    fetch(PROXY_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        var items = safeArray(payload && payload.items);
        if (!items.length) return;

        BLOG_POSTS = items.slice(0, 6).map(function (item) {
          return {
            title: item.title || "",
            summary: truncate(stripHtml(item.description), 260),
            tags: safeArray(item.categories),
            link: item.link || ""
          };
        });

        renderBlog();
      })
      .catch(function () {});
  }

  function normalizeAriaLabels() {
    qsa("section.stage").forEach(function (s) {
      var h = qsa("h2, h3, .panel__title", s)[0];
      if (h && !s.getAttribute("aria-labelledby")) {
        var id = h.id || (s.id ? s.id + "-title" : "");
        if (!h.id) h.id = id || ("title-" + Math.random().toString(36).slice(2));
        s.setAttribute("aria-labelledby", h.id);
      }
    });
  }

  function startWithData(data) {
    DATA = safeObject(data || {});

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

    setupScrollama();

    var detectSection = qs("#detect");
    if (detectSection && w.IntersectionObserver) {
      var once = false;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting && !once) {
            once = true;
            runConsole();
            io.disconnect();
          }
        });
      }, { threshold: 0.2 });
      io.observe(detectSection);
    }

    handleHashChange();
    w.addEventListener("hashchange", handleHashChange);

    fetchTechReviewRSS();
    normalizeAriaLabels();
  }

  function fetchJSON(url, done) {
    if (w.fetch) {
      fetch(url)
        .then(function (res) { return res.json(); })
        .then(function (json) { done(null, json); })
        .catch(function (err) { done(err); });
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { done(null, JSON.parse(xhr.responseText)); } catch (e) { done(e); }
          } else {
            done(new Error("HTTP " + xhr.status));
          }
        }
      };
      xhr.send();
    }
  }

  function start() {
    fetchJSON("/assets/json/cybersec.json", function (err, data) {
      if (err) {
        startWithData({});
        return;
      }
      startWithData(data);
    });
  }

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", start);
  else start();
})();
