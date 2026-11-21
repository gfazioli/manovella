/* Manovella docs: shared chrome (sidebar + topbar) and interactions.
   The nav is defined once here and injected, so every page stays in sync.
   Each page declares <body data-page="..." data-title="..."> to drive the
   active state and the breadcrumb. The pager at the foot of each page is
   written by hand: a new page goes in NAV and at both ends of the chain. */

(function () {
  var NAV = [
    { group: "Guide", items: [
      { id: "start",    label: "Getting started", href: "index.html" },
      { id: "studio",   label: "The Studio",      href: "studio.html" },
      { id: "films",    label: "Making a film",   href: "films.html" },
      { id: "release",  label: "Release films",   href: "release-films.html" },
      { id: "sound",    label: "Sound",           href: "sound.html" },
      { id: "settings", label: "Settings",        href: "settings.html" }
    ]},
    { group: "Catalogue", items: [
      { id: "looks",   label: "Looks",               href: "looks.html" },
      { id: "formats", label: "Formats",             href: "formats.html" },
      { id: "type",    label: "Type",                href: "type.html" },
      { id: "motion",  label: "Motion",              href: "motion.html" },
      { id: "parts",   label: "Parts and tutorials", href: "parts.html" }
    ]},
    { group: "Reference", items: [
      { id: "rendering", label: "Rendering",     href: "rendering.html" },
      { id: "byhand",    label: "By hand",       href: "by-hand.html" },
      { id: "releases",  label: "Release notes", href: "releases.html" }
    ]}
  ];

  var GITHUB = "https://github.com/gfazioli/manovella";
  var DISCORD = "https://discord.gg/rdWu5yFCR6";
  var SPONSOR = "https://github.com/sponsors/gfazioli";

  var page = document.body.dataset.page || "start";
  var title = document.body.dataset.title || "Docs";

  // ---- sidebar ----
  var sb = document.getElementById("sidebar");
  if (sb) {
    var html = '' +
      '<a class="brand" href="../index.html" title="Back to the Manovella home page">' +
      '<img src="../logo-mark.svg" width="28" height="28" alt="" /><b>Manovella</b>' +
      '<span class="ver" id="guide-ver">v%%VERSION%%</span></a><nav class="side" aria-label="Guide">';
    NAV.forEach(function (g) {
      html += '<div class="navgroup"><div class="label">' + g.group + '</div>';
      g.items.forEach(function (it) {
        var on = it.id === page;
        html += '<a class="navlink' + (on ? " active" : "") + '" href="' + it.href + '"' +
                (on ? ' aria-current="page"' : "") + '><span class="dot"></span>' + it.label + '</a>';
      });
      html += '</div>';
    });
    html += '</nav><div class="sidebar-foot">' +
      '<a href="../index.html">&larr; Home</a>' +
      '<a href="' + GITHUB + '">GitHub</a>' +
      '<a href="' + DISCORD + '" target="_blank" rel="noopener noreferrer">Discord</a>' +
      '<a href="' + SPONSOR + '">Sponsor</a></div>';
    sb.innerHTML = html;
  }

  // ---- picture gallery ----
  // The stills are 1600px wide in a ~700px column, so a sheet of twenty-three
  // looks is too small to read in place. Click one and it fills the window;
  // arrow keys walk the page's pictures. Promoted here rather than in the
  // markup: the behaviour is JS-only, so static HTML claiming role="button"
  // would promise what a page without script cannot do.
  (function () {
    var shots = [].slice.call(document.querySelectorAll(".frame img"));
    if (!shots.length) return;

    shots.forEach(function (img, i) {
      var frame = img.closest(".frame");
      if (!frame) return;
      frame.classList.add("zoomable");
      frame.setAttribute("role", "button");
      frame.setAttribute("tabindex", "0");
      frame.setAttribute("aria-label", "Enlarge picture: " + (img.alt || "picture " + (i + 1)));
      frame.addEventListener("click", function () { open(i); });
      frame.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(i); }
      });
    });

    var lb = document.createElement("div");
    lb.className = "lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "Picture viewer");
    lb.innerHTML =
      '<div class="lb-bar">' +
        '<span class="lb-count"></span>' +
        '<span class="lb-cap"></span>' +
        '<button class="lb-btn lb-prev" aria-label="Previous picture">&larr;</button>' +
        '<button class="lb-btn lb-next" aria-label="Next picture">&rarr;</button>' +
        '<button class="lb-btn lb-zoom"></button>' +
        '<button class="lb-btn lb-close" aria-label="Close viewer">esc</button>' +
      '</div><div class="lb-stage"><img alt=""></div>';
    document.body.appendChild(lb);

    var img   = lb.querySelector(".lb-stage img");
    var stage = lb.querySelector(".lb-stage");
    var cap   = lb.querySelector(".lb-cap");
    var count = lb.querySelector(".lb-count");
    var zoomB = lb.querySelector(".lb-zoom");
    var at = 0, opener = null;

    // 1:1 is offered only when it would show more than the fitted view.
    function canZoom() {
      return img.naturalWidth > stage.clientWidth - 36 ||
             img.naturalHeight > stage.clientHeight - 36;
    }
    function paintZoom() {
      zoomB.hidden = !canZoom();
      zoomB.textContent = lb.classList.contains("zoomed") ? "fit" : "1:1";
    }
    function show(i) {
      at = (i + shots.length) % shots.length;
      lb.classList.remove("zoomed");
      img.src = shots[at].currentSrc || shots[at].src;
      img.alt = shots[at].alt || "";
      cap.textContent = shots[at].alt || "";
      count.textContent = (at + 1) + " / " + shots.length;
      lb.querySelector(".lb-prev").hidden = shots.length < 2;
      lb.querySelector(".lb-next").hidden = shots.length < 2;
      if (img.complete) paintZoom(); else img.onload = paintZoom;
    }
    function open(i) {
      opener = document.activeElement;
      show(i);
      lb.classList.add("open");
      document.body.classList.add("lb-lock");
      // The page behind is inert while the picture is open: Tab stays in the viewer.
      var page = document.querySelector(".layout"); if (page) page.inert = true;
      lb.querySelector(".lb-close").focus();
    }
    function close() {
      lb.classList.remove("open", "zoomed");
      document.body.classList.remove("lb-lock");
      var page = document.querySelector(".layout"); if (page) page.inert = false;
      if (opener && opener.focus) opener.focus();
    }

    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function () { show(at - 1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { show(at + 1); });
    zoomB.addEventListener("click", function () { lb.classList.toggle("zoomed"); paintZoom(); });
    img.addEventListener("click", function () {
      if (canZoom()) { lb.classList.toggle("zoomed"); paintZoom(); }
    });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === stage) close(); });

    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("open")) return;
      if (e.key === "Escape")          { close(); }
      else if (e.key === "ArrowLeft")  { show(at - 1); }
      else if (e.key === "ArrowRight") { show(at + 1); }
      else if (e.key === "Home")       { show(0); }
      else if (e.key === "End")        { show(shots.length - 1); }
      else return;
      e.preventDefault();
    });
  })();

  // ---- version badge: scripts/site.mjs writes the version from plugin.json at build time ----

  // ---- topbar ----
  var tb = document.getElementById("topbar");
  if (tb) {
    tb.innerHTML = '' +
      '<button class="iconbtn menu-btn" id="menuBtn" aria-label="Menu" aria-controls="sidebar" aria-expanded="false">&#9776;</button>' +
      '<span class="crumbs">Docs / <b>' + title + '</b></span>' +
      '<span class="spacer"></span>' +
      '<a class="iconbtn" href="../index.html">&larr; Home</a>' +
      '<a class="iconbtn" href="' + GITHUB + '">GitHub &#8599;</a>' +
      '<a class="iconbtn tb-extra" href="' + DISCORD + '" target="_blank" rel="noopener noreferrer">Discord &#8599;</a>' +
      '<a class="iconbtn tb-extra" href="' + SPONSOR + '">&#9829; Sponsor</a>';
  }

  // ---- publisher line ----
  // Who publishes the site, under every page. <wbr>: the separators touch the
  // words, so without it the line from "Fazioli" to "Privacy" could not wrap
  // and widened the page on a phone.
  var col = document.querySelector(".main");
  if (col) {
    var foot = document.createElement("footer");
    foot.className = "legal-foot";
    foot.innerHTML =
      '&copy; <span data-year>2026</span> Undolog &mdash; Giovambattista&nbsp;Fazioli<span class="dot" aria-hidden="true">&middot;</span><wbr>P.IVA&nbsp;12343751009<span class="dot" aria-hidden="true">&middot;</span><wbr><a href="legal.html">Legal</a><span class="dot" aria-hidden="true">&middot;</span><wbr><a href="privacy.html">Privacy</a>' +
      '<p class="made">Made with &hearts; by <a href="https://gfazioli.github.io/">Undolog</a></p>';
    col.appendChild(foot);
    var yr = foot.querySelector("[data-year]");
    if (yr) yr.textContent = new Date().getFullYear();
  }

  // ---- menu button and copy buttons ----
  document.addEventListener("click", function (e) {
    if (e.target.closest("#menuBtn")) {
      var open = sb && sb.classList.toggle("open");
      e.target.closest("#menuBtn").setAttribute("aria-expanded", open ? "true" : "false");
    } else if (sb && sb.classList.contains("open") && !e.target.closest("#sidebar")) {
      sb.classList.remove("open");
      var mb = document.getElementById("menuBtn");
      if (mb) mb.setAttribute("aria-expanded", "false");
    }
    var c = e.target.closest(".copy");
    if (c) {
      var pre = c.parentElement.querySelector("pre");
      if (pre && navigator.clipboard) {
        navigator.clipboard.writeText(pre.innerText).then(function () {
          c.textContent = "copied"; setTimeout(function () { c.textContent = "copy"; }, 1200);
        });
      }
    }
  });
})();
