// Split-text hover: wrap each letter of the nav links in its own span
(function () {
  const targets = ".nav-item > a, .nav-item > .nav-button, .split-target, .project-title > span";
  document.querySelectorAll(targets).forEach((link) => {
    const text = link.textContent.trim();
    link.classList.add("split");
    link.textContent = "";
    // Keep the words readable for screen readers: links and buttons get a
    // label; plain text gets a hidden copy. (EMAIL's button has its own label.)
    if (link.matches("a, button")) {
      link.setAttribute("aria-label", text);
    } else if (!link.matches(".copy-label")) {
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = text;
      link.appendChild(sr);
    }
    Array.from(text).forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "char";
      span.setAttribute("aria-hidden", "true");
      span.style.setProperty("--i", i);
      span.textContent = ch;
      link.appendChild(span);
    });
  });
})();

// Jumping to a project (Projects dropdown, or arriving at index.html#play):
// line the project up at the left of the carousel, or the top when stacked.
// The browser's own anchor jump only scrolls sideways "just enough", which
// the carousel's snapping can then pull back to the first card.
(function () {
  const carousel = document.querySelector(".carousel");
  if (!carousel) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function reveal(id, smooth) {
    const project = document.getElementById(id);
    if (!project || !project.classList.contains("project")) return false;
    const behavior = smooth && !reduceMotion ? "smooth" : "auto";
    const stacked = getComputedStyle(carousel).flexDirection === "column";

    if (stacked) {
      // Land just below the fixed header, not underneath it
      const header = document.querySelector(".site-header");
      const offset = header ? header.offsetHeight : 0;
      window.scrollTo({ top: project.getBoundingClientRect().top + window.scrollY - offset, behavior });
    } else {
      // Scroll the carousel itself to the exact spot. Snapping is paused
      // during the glide, otherwise it catches a long scroll on the first
      // card it passes and stops there.
      const padLeft = parseFloat(getComputedStyle(carousel).paddingLeft) || 0;
      const maxLeft = carousel.scrollWidth - carousel.clientWidth;
      const target = Math.min(
        maxLeft,
        project.getBoundingClientRect().left -
          carousel.getBoundingClientRect().left +
          carousel.scrollLeft -
          padLeft
      );

      // Turning snapping back on mid-glide makes the browser snap to the
      // nearest card instead, so wait until the carousel actually arrives.
      carousel.style.scrollSnapType = "none";
      let fallback;
      const restoreSnap = () => {
        carousel.removeEventListener("scroll", onScroll);
        clearTimeout(fallback);
        carousel.style.scrollSnapType = "";
      };
      const onScroll = () => {
        if (Math.abs(carousel.scrollLeft - target) < 1) restoreSnap();
      };
      carousel.addEventListener("scroll", onScroll);
      fallback = setTimeout(restoreSnap, 2000);
      carousel.scrollTo({ left: target, behavior });
      onScroll(); // already there (or no animation)
      // Make sure the row itself is on screen
      const rect = carousel.getBoundingClientRect();
      if (rect.bottom > window.innerHeight) {
        window.scrollBy({ top: rect.bottom - window.innerHeight, behavior });
      }
    }
    return true;
  }

  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute("href").slice(1);
    if (reveal(id, true)) {
      e.preventDefault();
      history.replaceState(null, "", "#" + id);
    }
  });

  if (location.hash) {
    const id = decodeURIComponent(location.hash.slice(1));
    // Wait for layout and images so the position is final
    window.addEventListener("load", () => reveal(id, true));
  }
})();

// Project hover: a [VIEW] label (or the tile's data-cursor-label, e.g. [ENTER])
// replaces the cursor, and the image drifts against it.
// Only on devices with a real hover (not touch screens).
(function () {
  if (!window.matchMedia("(hover: hover)").matches) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll(".project-image").forEach((tile) => {
    const label = document.createElement("span");
    label.className = "project-cursor";
    label.setAttribute("aria-hidden", "true");
    label.textContent = tile.dataset.cursorLabel || "[VIEW]"; // e.g. Play says [ENTER]
    tile.appendChild(label);

    tile.addEventListener("pointermove", (e) => {
      const r = tile.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      tile.style.setProperty("--mx", x + "px");
      tile.style.setProperty("--my", y + "px");
      if (!reduceMotion) {
        tile.style.setProperty("--px", ((x / r.width) * 2 - 1).toFixed(3));
        tile.style.setProperty("--py", ((y / r.height) * 2 - 1).toFixed(3));
      }
    });

    tile.addEventListener("pointerleave", () => {
      tile.style.setProperty("--px", 0);
      tile.style.setProperty("--py", 0);
    });
  });
})();

// Dark mode toggle: the circle next to the clock becomes a crescent moon
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll(".theme-toggle");

  function sync() {
    const dark = root.dataset.theme === "dark";
    buttons.forEach((b) => {
      b.setAttribute("aria-pressed", String(dark));
      b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    });
  }

  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      const dark = root.dataset.theme !== "dark";
      if (dark) root.dataset.theme = "dark";
      else delete root.dataset.theme;
      try {
        localStorage.setItem("theme", dark ? "dark" : "light");
      } catch (e) {}
      sync();
    })
  );

  sync();
})();

// Mobile menu: [MENU] opens the panel and becomes [CLOSE]
(function () {
  const button = document.querySelector(".menu-toggle");
  const menu = document.getElementById("mobile-menu");
  if (!button || !menu) return;

  function setOpen(open) {
    if (open) window.scrollTo(0, 0); // keep the panel lined up under the name row
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "[CLOSE]" : "[MENU]";
    document.body.classList.toggle("menu-open", open);
  }

  button.addEventListener("click", () => setOpen(menu.hidden));
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  // Close if the window grows wide enough for the full header row
  // (keep in sync with the max-width: 839px block in styles.css)
  const NAV_COLLAPSE = "(max-width: 839px)";
  window.matchMedia(NAV_COLLAPSE).addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
})();

// Header dropdowns (desktop): hovering PROJECTS or CONTACT shows its list.
// CSS handles hover and keyboard focus; touch screens (no hover) tap to toggle.
(function () {
  const canHover = window.matchMedia("(hover: hover)").matches;

  document.querySelectorAll(".nav-dropdown").forEach((item) => {
    const toggle = item.querySelector(".nav-button");

    function setOpen(open) {
      item.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    }

    // Keep aria-expanded in step with the hover state for screen readers
    item.addEventListener("mouseenter", () => toggle.setAttribute("aria-expanded", "true"));
    item.addEventListener("mouseleave", () => {
      if (!item.classList.contains("is-open")) toggle.setAttribute("aria-expanded", "false");
    });

    toggle.addEventListener("click", () => {
      if (!canHover) setOpen(!item.classList.contains("is-open"));
    });
    // Close on a click elsewhere, on Escape, or after following a link in it
    document.addEventListener("click", (e) => {
      if (!item.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && item.classList.contains("is-open")) {
        setOpen(false);
        toggle.focus();
      }
    });
    item.querySelectorAll(".dropdown-menu a").forEach((a) =>
      a.addEventListener("click", () => {
        setOpen(false);
        // Drop keyboard focus so the list doesn't stay open after jumping
        if (canHover) a.blur();
      })
    );
  });
})();

// EMAIL: copy the address, roll in "COPIED EMAIL", then roll back
(function () {
  const status = document.querySelector("[data-copy-status]");
  const HOLD_MS = 1600;

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // Fallback for browsers without the async clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  document.querySelectorAll(".copy-email").forEach((button) => {
    let timer;
    button.addEventListener("click", async () => {
      const email = button.dataset.email;
      if (!(await copyText(email))) {
        // Couldn't copy: open the visitor's mail app instead
        window.location.href = "mailto:" + email;
        return;
      }
      button.classList.add("is-copied");
      if (status) status.textContent = "Copied email address";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.classList.remove("is-copied");
        if (status) status.textContent = "";
      }, HOLD_MS);
    });
  });
})();

// Live San Francisco clock, e.g. "12:00:00 PM PST UTC−08"
(function () {
  const TZ = "America/Los_Angeles";
  const els = document.querySelectorAll("[data-clock]");
  if (!els.length) return;

  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const abbrFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    timeZoneName: "short",
  });

  function offsetLabel(date) {
    // Offset in minutes between LA wall time and UTC
    const la = new Date(date.toLocaleString("en-US", { timeZone: TZ }));
    const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const mins = Math.round((la - utc) / 60000);
    const sign = mins < 0 ? "−" : "+";
    const h = String(Math.floor(Math.abs(mins) / 60)).padStart(2, "0");
    const m = Math.abs(mins) % 60;
    return `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
  }

  function tick() {
    const now = new Date();
    const abbr =
      abbrFmt.formatToParts(now).find((p) => p.type === "timeZoneName")
        ?.value ?? "PT";
    const text = `${timeFmt.format(now)} ${abbr} ${offsetLabel(now)}`;
    els.forEach((el) => (el.textContent = text));
  }

  tick();
  setInterval(tick, 1000);
})();

// Project pages: keep the left column just under the fixed header, and make
// sure the reel keeps playing like a GIF (some browsers pause muted autoplay)
(function () {
  const header = document.querySelector(".page-case .site-header");
  if (header) {
    const setHeight = () =>
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    setHeight();
    window.addEventListener("resize", setHeight);
  }

  document.querySelectorAll(".case-reel video").forEach((video) => {
    video.muted = true; // required for autoplay
    const play = () => {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    play();
    video.addEventListener("pause", () => {
      if (!document.hidden) play();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) play();
    });
  });
})();

// Page transition: links marked data-transition blur the page away before
// leaving (Play → gallery, gallery → [← GO BACK]). Pages that start with
// html.is-entering (set in their <head>) blur back in.
(function () {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LEAVE_MS = 650;

  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-transition]");
    if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const href = link.href;
    if (reduceMotion) {
      location.href = href;
      return;
    }
    root.classList.add("is-leaving");
    setTimeout(() => (location.href = href), LEAVE_MS);
  });

  // Coming back with the browser's back button can restore the blurred page
  window.addEventListener("pageshow", () => root.classList.remove("is-leaving"));

  if (root.classList.contains("is-entering")) {
    const reveal = () => {
      root.classList.add("is-entered");
      root.classList.remove("is-entering");
    };
    requestAnimationFrame(() => requestAnimationFrame(reveal));
    setTimeout(reveal, 400); // in case animation frames are held back (e.g. a background tab)
  }
})();

// Play tile: a looping silk animation (silk.js, tiles marked data-silk)
// replaces the still image, and water ripples follow the cursor across it
// (ripple.js). The image stays underneath as the fallback. Ripples are
// mouse/trackpad only; touch screens just see the animation.
(function () {
  document.querySelectorAll("[data-ripple]").forEach((tile) => {
    const img = tile.querySelector("img.cover");
    if (!img) return;

    // 1. The animation, on top of the still image
    let source = img;
    if (tile.hasAttribute("data-silk") && window.Silk) {
      const silkCanvas = document.createElement("canvas");
      silkCanvas.className = "cover silk-canvas";
      silkCanvas.setAttribute("aria-hidden", "true");
      tile.insertBefore(silkCanvas, img.nextSibling);
      if (Silk.create(silkCanvas)) source = silkCanvas;
      else silkCanvas.remove();
    }

    // 2. The ripple layer, drawn from whatever is showing
    if (!window.Ripple || !window.matchMedia("(hover: hover)").matches) return;
    const canvas = document.createElement("canvas");
    canvas.className = "cover ripple-canvas";
    canvas.setAttribute("aria-hidden", "true");
    tile.insertBefore(canvas, (source === img ? img : source).nextSibling);
    const ripple = Ripple.create(canvas);
    if (!ripple) {
      canvas.remove();
      return;
    }
    ripple.setSource(source);
    ripple.resize();
    window.addEventListener("resize", () => ripple.resize());

    // Over the animation, the ripple layer only shows while there are waves,
    // so the animation itself plays the rest of the time
    const live = source !== img;
    if (live) {
      canvas.classList.add("is-idle");
      ripple.onIdle = () => canvas.classList.add("is-idle");
    }

    let last = null;
    tile.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      // Faster movement makes bigger waves
      const speed = last ? Math.hypot(e.clientX - last.x, e.clientY - last.y) : 0;
      last = { x: e.clientX, y: e.clientY };
      if (live) canvas.classList.remove("is-idle");
      ripple.drop(x, y, Math.min(1.6, 0.35 + speed * 0.05));
    });
    tile.addEventListener("pointerenter", () => {
      last = null;
      if (live) ripple.setKeepAlive(true);
    });
    tile.addEventListener("pointerleave", () => {
      if (live) ripple.setKeepAlive(false);
    });
  });
})();

// Under construction tile (project 02): a slow, faint silk animation that
// sits just above the grey tile (silk.js subtle mode). No ripples.
(function () {
  if (!window.Silk) return;
  document.querySelectorAll('[data-silk="subtle"]').forEach((tile) => {
    const canvas = document.createElement("canvas");
    canvas.className = "cover silk-canvas";
    canvas.setAttribute("aria-hidden", "true");
    tile.insertBefore(canvas, tile.firstChild);
    const variant = Number(tile.dataset.silkVariant || 0);
    if (!Silk.create(canvas, { subtle: true, variant })) canvas.remove();
  });
})();

// Hover video: links with data-hover-video swap the cursor for a small looping
// video that follows the pointer (about page: "pet fish" → the fish).
// Mouse/trackpad only; the video starts downloading once the page has loaded.
(function () {
  if (!window.matchMedia("(hover: hover)").matches) return;
  document.querySelectorAll("a[data-hover-video]").forEach((link) => {
    const video = document.createElement("video");
    video.className = "hover-video";
    video.disablePictureInPicture = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.src = link.dataset.hoverVideo;
    document.body.appendChild(video);

    const startLoading = () => {
      video.preload = "auto";
      video.load();
    };
    if (document.readyState === "complete") startLoading();
    else window.addEventListener("load", startLoading, { once: true });

    const move = (e) => {
      video.style.setProperty("--x", e.clientX + "px");
      video.style.setProperty("--y", e.clientY + "px");
    };
    link.addEventListener("pointerenter", (e) => {
      if (e.pointerType === "touch") return;
      move(e);
      video.classList.add("is-visible");
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    });
    link.addEventListener("pointermove", move);
    link.addEventListener("pointerleave", () => {
      video.classList.remove("is-visible");
      video.pause();
    });
  });
})();

// Homepage carousel: a mouse wheel (up/down) scrolls the projects sideways.
// Trackpad side swipes are left alone (they already scroll sideways), and
// at either end the wheel goes back to scrolling the page. The movement
// eases toward where the wheel asked, so notched mouse wheels glide.
(function () {
  const carousel = document.querySelector(".carousel");
  if (!carousel) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let target = null;
  let frame = null;
  let settle = null;

  function release() {
    // Wait for the glide to land before handing back to snapping
    if (frame) {
      settle = setTimeout(release, 100);
      return;
    }
    carousel.style.scrollSnapType = "";
    carousel.style.scrollBehavior = "";
    target = null;
  }

  function glide() {
    frame = null;
    const diff = target - carousel.scrollLeft;
    // The browser rounds scroll positions, so finish once within 2px
    // (smaller steps would round away and never arrive)
    if (Math.abs(diff) < 2) {
      carousel.scrollLeft = target;
      return;
    }
    carousel.scrollLeft += Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.2);
    frame = requestAnimationFrame(glide);
  }

  carousel.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) return; // pinch zoom
      if (getComputedStyle(carousel).flexDirection === "column") return; // stacked on phones
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // already sideways
      const max = carousel.scrollWidth - carousel.clientWidth;
      if (max <= 0) return;
      // Lines or pages (some mice) to pixels
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? carousel.clientWidth : 1;
      const delta = e.deltaY * unit;
      const from = target == null ? carousel.scrollLeft : target;
      // At an end: let the page scroll instead
      if ((delta < 0 && from <= 0) || (delta > 0 && from >= max - 1)) return;
      e.preventDefault();

      // Snapping and smooth-scroll would fight the glide, so pause them,
      // then let snapping settle the cards once the wheel stops
      carousel.style.scrollSnapType = "none";
      carousel.style.scrollBehavior = "auto";
      target = Math.max(0, Math.min(max, from + delta));
      if (reduceMotion) carousel.scrollLeft = target;
      else if (!frame) frame = requestAnimationFrame(glide);
      clearTimeout(settle);
      settle = setTimeout(release, 250);
    },
    { passive: false }
  );
})();

