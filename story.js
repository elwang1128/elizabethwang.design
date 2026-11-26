// Case study pages (Teams Events App, Teams Q&A): scroll-driven and in-view
// motion, plus the interactive Q&A settings demo.
// Styles live in styles.css under "Case study story". Without this script
// everything simply shows in its final state.
(function () {
  const story = document.querySelector(".story");
  if (!story) return;
  document.documentElement.classList.add("story-js");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- Reveal on scroll: [data-reveal] gets .is-in once it's in view ----------
  const revealed = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in");
        revealed.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -15% 0px", threshold: 0.15 }
  );
  story.querySelectorAll("[data-reveal]").forEach((el) => revealed.observe(el));

  // ---------- 01 The problem: five beats while the stage is pinned ----------
  const problem = story.querySelector(".problem");
  if (problem) {
    const stage = problem.querySelector(".problem-stage");
    const tools = problem.querySelector(".tools");
    const circles = Array.from(problem.querySelectorAll(".tool"));
    const beats = Array.from(problem.querySelectorAll(".beats li"));
    const count = beats.length;

    // Beat 1 shows the circles without captions: lower them by half the
    // caption space so they sit centered, then they rise when captions appear
    function measureDrop() {
      let drop = 0;
      circles.forEach((c) => {
        const ring = c.querySelector(".tool-circle") || c;
        drop = Math.max(drop, (c.offsetHeight - ring.offsetHeight) / 2);
      });
      tools.style.setProperty("--drop", drop.toFixed(1) + "px");
    }

    // How far each circle travels to reach the middle when they merge
    function measureMerge() {
      // Target: the middle of the area, where the merged circle appears
      const cx = tools.clientWidth / 2;
      const cy = tools.clientHeight / 2;
      circles.forEach((c) => {
        // Aim the circle (top of each tool, full width), not circle + caption
        const ring = c.querySelector(".tool-circle") || c;
        const x = c.offsetLeft + c.offsetWidth / 2;
        const y = c.offsetTop + ring.offsetHeight / 2;
        c.style.setProperty("--mx", (cx - x).toFixed(1) + "px");
        c.style.setProperty("--my", (cy - y).toFixed(1) + "px");
      });
    }

    let current = -1;
    function update() {
      const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
      const rect = problem.getBoundingClientRect();
      const travel = rect.height - stage.offsetHeight;
      const progress = travel > 0 ? Math.min(1, Math.max(0, (headerH - rect.top) / travel)) : 1;
      const beat = Math.min(count - 1, Math.floor(progress * count));
      if (beat === current) return;
      current = beat;
      problem.dataset.beat = String(beat);
      beats.forEach((li, i) => li.classList.toggle("is-active", i === beat));
    }

    // Circles pop in when the stage first comes into view
    const appear = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          problem.classList.add("is-in");
          appear.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    appear.observe(stage);

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          update();
        });
      },
      { passive: true }
    );
    window.addEventListener("resize", () => {
      measureDrop();
      measureMerge();
      update();
    });
    measureDrop();
    measureMerge();
    update();
  }

  // ---------- 04 Draft mode: draft → preview → branding → publish, on a loop ----------
  const demo = story.querySelector(".draft-demo");
  if (demo) {
    const STEP_MS = 1800;
    const STEPS = 4;
    let timer = null;
    let step = 0;
    const show = (n) => (demo.dataset.step = String(n));

    function start() {
      if (timer || reduceMotion.matches) return;
      timer = setInterval(() => {
        step = (step + 1) % STEPS;
        show(step);
      }, STEP_MS);
    }
    function stop() {
      clearInterval(timer);
      timer = null;
    }

    if (reduceMotion.matches) {
      show(STEPS - 1); // just show the finished, published page
    } else {
      // Only run while it's on screen
      new IntersectionObserver((entries) => {
        entries.forEach((e) => (e.isIntersecting ? start() : stop()));
      }).observe(demo);
    }
  }

  // ---------- Q&A settings demo (teams-qa.html) ----------
  // Each organizer switch flips a data attribute on the demo; the CSS shows
  // what attendees would see with that setting on or off.
  const demo2 = story.querySelector(".qa-demo");
  if (demo2) {
    demo2.querySelectorAll(".qa-switch").forEach((btn) => {
      btn.addEventListener("click", () => {
        const on = btn.getAttribute("aria-pressed") !== "true";
        btn.setAttribute("aria-pressed", String(on));
        demo2.dataset[btn.dataset.setting] = on ? "on" : "off";
      });
    });
  }
})();

// Reels (Events App): play each slide in turn, then slide it out to the left
// as the next one slides in from the right, and repeat. A video plays to its
// end; a still stays for its data-hold (ms). Callouts (.callout) point at
// parts of the screen: on a video, each has data-at (seconds) and the video
// pauses there while its callouts draw out; on a still they draw out one by
// one. Everything waits while the reel is off screen.
(function () {
  const SLIDE_MS = 1000; // matches the CSS transition
  const STAGGER_MS = 700; // between callouts that appear together
  const READ_MS = 2200; // how long callouts stay once all are out
  const GAP_MS = 400; // after callouts retract, before the video moves on
  const POP_MS = 450; // a popover opening, before its callouts start

  document.querySelectorAll("[data-reel]").forEach((reel) => {
    const slides = Array.from(reel.querySelectorAll(".hero-slide"));
    // How long a change of slide takes (a reel that swaps in place is quick)
    const slideMs = Number(reel.dataset.slideMs || SLIDE_MS);
    let index = 0;
    let visible = false;
    let frame = null;
    let last = 0;
    // phase: "play" (video running), "hold" (waiting), "slide" (moving)
    let phase = "slide";
    let remaining = 0;
    let after = null; // what to do when a hold or slide finishes
    let stops = [];

    const videoOf = (slide) => slide.querySelector("video");

    // Show callouts one after another. A popover (.reel-pop) opens first
    // and its own callouts draw out once it is up. Returns how long to hold.
    function showCallouts(list) {
      let delay = 0;
      list.forEach((el) => {
        if (el.classList.contains("reel-pop")) {
          el.classList.add("is-on");
          delay += POP_MS;
          el.querySelectorAll(".callout").forEach((c) => {
            c.style.setProperty("--delay", delay + "ms");
            c.classList.add("is-on");
            delay += STAGGER_MS;
          });
        } else {
          el.style.setProperty("--delay", delay + "ms");
          el.classList.add("is-on");
          delay += STAGGER_MS;
        }
      });
      return delay - STAGGER_MS + 600 + READ_MS;
    }

    function hideCallouts(slide) {
      slide.querySelectorAll(".callout.is-on, .reel-pop.is-on").forEach((c) => {
        c.style.setProperty("--delay", "0ms");
        c.classList.remove("is-on");
      });
    }

    // Stops on a video: each distinct data-at + data-step, in order
    const stopOf = (el) => Math.round(Number(el.dataset.at) * 100) * 10 + Number(el.dataset.step || 0);
    const timeOf = (stop) => Math.floor(stop / 10) / 100;

    function wait(ms, then) {
      phase = "hold";
      remaining = ms;
      after = then;
    }

    function startSlide(i) {
      const slide = slides[i];
      const video = videoOf(slide);
      const callouts = Array.from(slide.querySelectorAll(".reel-media > .callout, .reel-pop"));
      if (video) {
        stops = Array.from(new Set(callouts.map(stopOf))).sort((a, b) => a - b);
        video.currentTime = 0;
        phase = "play";
      } else if (callouts.length) {
        // On a still, callouts come in groups by data-step (all together if
        // none): each group draws out, holds, and retracts before the next
        const stepOf = (c) => Number(c.dataset.step || 0);
        const groups = Array.from(new Set(callouts.map(stepOf))).sort((a, b) => a - b);
        const run = (k) => {
          if (k === groups.length) return next();
          wait(showCallouts(callouts.filter((c) => stepOf(c) === groups[k])), () => {
            hideCallouts(slide);
            wait(GAP_MS, () => run(k + 1));
          });
        };
        wait(400, () => run(0));
      } else {
        wait(Number(slide.dataset.hold) || 4000, next);
      }
    }

    function next() {
      const from = slides[index];
      const fromVideo = videoOf(from);
      if (fromVideo) fromVideo.pause();
      index = (index + 1) % slides.length;
      reel.dispatchEvent(new CustomEvent("reel:change", { detail: { index } }));
      const to = slides[index];
      const toVideo = videoOf(to);
      if (toVideo) {
        toVideo.pause();
        toVideo.currentTime = 0;
      }
      hideCallouts(to);

      // Park the next slide on the right without animating, then move both
      to.classList.add("is-parked");
      to.classList.remove("is-leaving", "is-active");
      void to.offsetWidth;
      to.classList.remove("is-parked");
      from.classList.remove("is-active");
      from.classList.add("is-leaving");
      to.classList.add("is-active");

      phase = "slide";
      remaining = slideMs;
      after = () => {
        from.classList.remove("is-leaving");
        from.classList.add("is-parked");
        void from.offsetWidth;
        from.classList.remove("is-parked");
        startSlide(index);
      };
    }

    function tick(now) {
      frame = null;
      if (!visible) return;
      const dt = Math.min(100, now - last);
      last = now;
      const slide = slides[index];
      const video = videoOf(slide);

      if (phase === "play" && video) {
        if (stops.length && video.currentTime >= timeOf(stops[0]) - 0.02) {
          // Stop exactly on the frame the callouts were placed against
          const stop = stops.shift();
          const at = timeOf(stop);
          video.pause();
          if (Math.abs(video.currentTime - at) > 0.001) video.currentTime = at;
          const list = Array.from(slide.querySelectorAll(".reel-media > .callout, .reel-pop")).filter((c) => stopOf(c) === stop);
          wait(showCallouts(list), () => {
            hideCallouts(slide);
            wait(GAP_MS, () => {
              phase = "play";
            });
          });
        } else if (video.ended) {
          next();
        } else if (video.paused) {
          video.play().catch(() => {});
        }
      } else {
        remaining -= dt;
        if (remaining <= 0 && after) {
          const fn = after;
          after = null;
          fn();
        }
      }
      frame = requestAnimationFrame(tick);
    }

    // Jump straight to a slide (the step labels in section 04 ask for this)
    reel.addEventListener("reel:goto", (e) => {
      const i = e.detail.index;
      slides.forEach((slide) => {
        hideCallouts(slide);
        const v = videoOf(slide);
        if (v) v.pause();
        slide.classList.remove("is-active", "is-leaving");
      });
      index = i;
      slides[i].classList.add("is-active");
      reel.dispatchEvent(new CustomEvent("reel:change", { detail: { index } }));
      started = true;
      phase = "slide";
      remaining = slideMs;
      after = () => startSlide(i);
      last = performance.now();
      if (visible && !frame) frame = requestAnimationFrame(tick);
    });

    let started = false;
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      const video = videoOf(slides[index]);
      if (visible) {
        if (!started) {
          started = true;
          startSlide(0);
        }
        last = performance.now();
        if (!frame) frame = requestAnimationFrame(tick);
      } else if (video) {
        video.pause();
      }
    }).observe(reel);
  });
})();

// Tabs (Events App, section 03): "For attendees" / "For organizers" switch
// the screen above them. Arrow keys move between tabs.
(function () {
  document.querySelectorAll(".role-tabs:not([data-lifecycle-tabs])").forEach((list) => {
    const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab));
      tab.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        select(next);
        next.focus();
      });
    });
  });
})();

// Step labels that follow a reel (Events App, section 04): the label for
// the slide on screen is lit
(function () {
  document.querySelectorAll("[data-reel-steps]").forEach((list) => {
    const reel = document.getElementById(list.dataset.reelSteps);
    if (!reel) return;
    const items = Array.from(list.children);
    reel.addEventListener("reel:change", (e) => {
      items.forEach((li, i) => {
        const on = i === e.detail.index;
        li.classList.toggle("is-current", on);
        const btn = li.querySelector("button");
        if (btn) {
          if (on) btn.setAttribute("aria-current", "step");
          else btn.removeAttribute("aria-current");
        }
      });
    });
    // Clicking a label jumps the reel to that step
    items.forEach((li, i) => {
      const btn = li.querySelector("button");
      if (btn) btn.addEventListener("click", () => reel.dispatchEvent(new CustomEvent("reel:goto", { detail: { index: i } })));
    });
  });
})();

// Opening hero (Events App, wide screens): the top reel opens larger, grown
// up and to the left from its bottom-right corner into the empty space
// beside the title, never over the text, and settles back to the column
// width over the first half screen of scrolling.
(function () {
  const hero = document.querySelector(".hero-reel--top");
  if (!hero) return;
  const wide = window.matchMedia("(min-width: 900px) and (min-height: 560px)");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const MAX_SCALE = 1.6;
  let maxScale = 1;

  function measure() {
    hero.style.setProperty("--hero-scale", 1);
    if (!wide.matches || reduce.matches) {
      maxScale = 1;
      return;
    }
    const box = hero.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-gap")) || 24;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    // Right edge of the text on the left (title, details, description)
    let textRight = 0;
    document.querySelectorAll(".case-title, .case-meta > div, .case-desc").forEach((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      textRight = Math.max(textRight, range.getBoundingClientRect().right);
    });
    const byWidth = (box.right - textRight - gap * 2) / box.width;
    // Top of the page (scrollY 0): keep below the header with a gap
    const top0 = box.top + window.scrollY;
    const bottom0 = top0 + box.height;
    const byHeight = (bottom0 - headerH - gap) / box.height;
    maxScale = Math.max(1, Math.min(MAX_SCALE, byWidth, byHeight));
  }

  // The size trails the scroll: each frame it closes part of the distance to
  // where the scroll says it should be, so it glides and settles softly
  // instead of locking to the scrollbar.
  let current = null;
  let raf = 0;

  function target() {
    const p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.6)));
    const eased = p * p * (3 - 2 * p); // ease in and out
    return maxScale - (maxScale - 1) * eased;
  }

  function step() {
    const goal = target();
    if (current === null) current = goal;
    current += (goal - current) * 0.08;
    if (Math.abs(goal - current) < 0.0005) current = goal;
    hero.style.setProperty("--hero-scale", current.toFixed(4));
    raf = current === goal ? 0 : requestAnimationFrame(step);
  }

  function apply() {
    if (!raf) raf = requestAnimationFrame(step);
  }

  function refresh() {
    measure();
    current = null;
    apply();
  }

  window.addEventListener("scroll", apply, { passive: true });
  window.addEventListener("resize", refresh);
  wide.addEventListener("change", refresh);
  reduce.addEventListener("change", refresh);

  // Grow in on arrival: start at the column width and glide up to size
  measure();
  current = 1;
  setTimeout(apply, 150);
})();

// Event lifecycle viewer (Teams Q&A, section 03). The Before / During /
// After pills pick the stage and the For organizers / For attendees tabs
// pick the view; only that screen shows. It runs only while on screen and
// works like the Events App reels: a video pauses at each data-at time while
// its callouts draw out (data-step groups take turns), a still steps through
// its groups, and when a screen is done the next stage comes up on its own.
(function () {
  const STAGGER_MS = 700;
  const READ_MS = 2200;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function groupsOf(view) {
    const map = new Map();
    view.querySelectorAll(".callout").forEach((c) => {
      const at = c.dataset.at === undefined ? 0 : Number(c.dataset.at);
      const key = Math.round(at * 100) * 10 + Number(c.dataset.step || 0);
      if (!map.has(key)) map.set(key, { time: at, els: [] });
      map.get(key).els.push(c);
    });
    return Array.from(map.keys()).sort((a, b) => a - b).map((k) => map.get(k));
  }

  function hideAll(view) {
    view.querySelectorAll(".callout.is-on").forEach((c) => {
      c.style.setProperty("--delay", "0ms");
      c.classList.remove("is-on");
    });
  }

  document.querySelectorAll("[data-lifecycle]").forEach((box) => {
    const steps = Array.from(box.querySelectorAll(".reel-steps li"));
    const tabs = Array.from(box.querySelectorAll("[data-lifecycle-tabs] [role='tab']"));
    const views = Array.from(box.querySelectorAll(".stage-view"));
    const texts = Array.from(box.querySelectorAll(".stage-text"));
    const groups = new Map(views.map((v) => [v, groupsOf(v)]));
    const stageCount = steps.length;
    let stage = 0;
    const picked = tabs.find((t) => t.getAttribute("aria-selected") === "true");
    let role = picked ? picked.dataset.role : views[0].dataset.role;
    let inView = false;
    let gen = 0; // bumps on every stop/start so old loops quit

    const viewFor = () => views.find((v) => Number(v.dataset.stage) === stage && v.dataset.role === role);

    async function showGroup(els, g) {
      let delay = 0;
      els.forEach((c) => {
        c.style.setProperty("--delay", delay + "ms");
        c.classList.add("is-on");
        delay += STAGGER_MS;
      });
      await sleep(delay - STAGGER_MS + 600 + READ_MS);
      if (g !== gen) return false;
      els.forEach((c) => {
        c.style.setProperty("--delay", "0ms");
        c.classList.remove("is-on");
      });
      await sleep(350);
      return g === gen;
    }

    function stop() {
      gen++;
      views.forEach((v) => {
        const video = v.querySelector("video");
        if (video) video.pause();
        hideAll(v);
      });
    }

    function advance(g) {
      // A single screen (no stage pills) simply plays again from the top
      if (g === gen) show(stageCount > 1 ? (stage + 1) % stageCount : 0, role);
    }

    // from: where to start in the video (the timeline jumps with it)
    function run(from = 0) {
      stop();
      if (!inView) return;
      const g = gen;
      const view = viewFor();
      const list = groups.get(view);
      const video = view.querySelector("video");
      if (video) {
        video.currentTime = from; // from the top, so each callout meets its frame
        let i = 0;
        while (i < list.length && list[i].time < from - 0.001) i++;
        const play = () => {
          const p = video.play();
          if (p) p.catch(() => {});
        };
        video.onended = () => advance(g);
        const tick = async () => {
          if (g !== gen) return;
          if (i < list.length && video.currentTime >= list[i].time) {
            video.pause();
            const time = list[i].time;
            while (i < list.length && list[i].time === time) {
              if (!(await showGroup(list[i].els, g))) return;
              i++;
            }
            play();
          }
          requestAnimationFrame(tick);
        };
        play();
        requestAnimationFrame(tick);
      } else {
        (async () => {
          await sleep(400);
          for (const grp of list) {
            if (!(await showGroup(grp.els, g))) return;
          }
          await sleep(600);
          advance(g);
        })();
      }
    }

    function show(nextStage, nextRole) {
      stage = nextStage;
      role = nextRole;
      views.forEach((v) => (v.hidden = !(Number(v.dataset.stage) === stage && v.dataset.role === role)));
      texts.forEach((t) => (t.hidden = Number(t.dataset.stage) !== stage));
      steps.forEach((li, i) => {
        li.classList.toggle("is-current", i === stage);
        const b = li.querySelector("button");
        if (i === stage) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
      tabs.forEach((t) => {
        const on = t.dataset.role === role;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      run();
    }

    steps.forEach((li, i) => li.querySelector("button").addEventListener("click", () => show(i, role)));
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => {
        if (t.dataset.role !== role) show(stage, t.dataset.role);
      });
      t.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        show(stage, next.dataset.role);
        next.focus();
      });
    });

    new IntersectionObserver((entries) => {
      const now = entries[0].isIntersecting;
      if (now === inView) return;
      inView = now;
      run();
    }, { threshold: 0.25 }).observe(box.querySelector(".stage-shot"));

    // Chapters (bell.plus): pills above the recording name its parts.
    // Choosing one skips the recording there; the part playing is lit.
    const chapters = Array.from(box.querySelectorAll(".rec-chapters button"));
    if (chapters.length) {
      const video = views[0].querySelector("video");
      const times = chapters.map((b) => Number(b.dataset.at));
      chapters.forEach((b, i) =>
        b.addEventListener("click", () => {
          inView = true;
          run(times[i]);
        })
      );
      let lit = -1;
      const paint = () => {
        let i = 0;
        while (i + 1 < times.length && video.currentTime >= times[i + 1] - 0.05) i++;
        if (i !== lit) {
          lit = i;
          chapters.forEach((b, k) => {
            b.parentElement.classList.toggle("is-current", k === i);
            if (k === i) b.setAttribute("aria-current", "step");
            else b.removeAttribute("aria-current");
          });
        }
        requestAnimationFrame(paint);
      };
      requestAnimationFrame(paint);
    }
  });
})();

// Live feed (Teams Q&A, section 02): posts take turns at the top of the
// shared feed while the diagram is on screen
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.querySelectorAll("[data-feed-live]").forEach((feed) => {
    const cards = Array.from(feed.querySelectorAll(".feed-card"));
    if (cards.length < 2) return;
    let i = 0;
    let timer = 0;

    // The box hugs the post on screen and eases to the next one's height.
    // The grey panel around it is held at the size it needs for the tallest
    // post, so the page below never moves.
    const panel = feed.closest(".feed-diagram");

    function fit() {
      const h = cards[i].offsetHeight;
      if (h) feed.style.height = h + "px";
    }

    function hold() {
      if (!panel) return;
      const tallest = Math.max(...cards.map((c) => c.offsetHeight));
      if (!tallest) return;
      panel.style.minHeight = "";
      feed.style.transition = "none";
      feed.style.height = tallest + "px";
      panel.style.boxSizing = "border-box";
      panel.style.minHeight = panel.offsetHeight + "px";
      fit();
      feed.offsetHeight; // apply the height before easing comes back
      feed.style.transition = "";
    }

    cards.forEach((c) => c.addEventListener("load", hold));
    window.addEventListener("resize", hold);
    hold();
    fit();

    function next() {
      const out = cards[i];
      i = (i + 1) % cards.length;
      const inn = cards[i];
      out.classList.remove("is-on");
      out.classList.add("is-leaving");
      inn.classList.remove("is-leaving");
      inn.classList.add("is-on");
      fit();
      setTimeout(() => out.classList.remove("is-leaving"), 700);
    }

    function run(on) {
      clearInterval(timer);
      timer = 0;
      if (on && !reduce.matches) timer = setInterval(next, 3200);
    }

    new IntersectionObserver((entries) => run(entries[0].isIntersecting), { threshold: 0.4 }).observe(feed);
  });
})();

// Sections 01 → 02 (Teams Q&A): one diagram, pinned while you scroll. As it
// rises into place the two features come in with their gaps; once pinned,
// scrolling fades the gaps, slides the rows together into one Viva Engage
// events row, draws a thread across it, and brings in section 02's text
// below. Scrolling back up plays it in reverse.
(function () {
  const track = document.querySelector("[data-gaps-scroll]");
  if (!track) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stage = track.querySelector(".gaps-stage");
  const fig = track.querySelector(".gaps");
  const merge = fig.querySelector(".gaps-merge");
  const ama = fig.querySelector(".gaps-row--ama");
  const teams = fig.querySelector(".gaps-row--teams");
  const on = Array.from(fig.querySelectorAll(".gap-cell--on"));
  const tags = Array.from(fig.querySelectorAll(".gap-cell--on small"));
  const gaps = Array.from(fig.querySelectorAll(".gap-cell--missing"));
  const from = Array.from(fig.querySelectorAll(".gaps-from"));
  const to = fig.querySelector(".gaps-to");
  const thread = fig.querySelector(".gaps-thread");
  const after = track.querySelector(".gaps-after");
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const span = (p, a, b) => clamp((p - a) / (b - a));
  const ease = (t) => t * t * (3 - 2 * t);
  let ticking = false;

  // The track is as tall as the stage plus the distance the stage stays pinned
  function size() {
    track.style.height = stage.offsetHeight + window.innerHeight * 1.2 + "px";
  }

  function render() {
    ticking = false;
    const vh = window.innerHeight;
    const stickTop = parseFloat(getComputedStyle(stage).top) || 0;
    const stageTop = stage.getBoundingClientRect().top;
    const trackTop = track.getBoundingClientRect().top;
    const pinned = track.offsetHeight - stage.offsetHeight;
    // pIn: the stage rising into place; q: progress while pinned
    const pIn = reduce.matches ? 1 : clamp((vh * 0.95 - stageTop) / Math.max(1, vh * 0.95 - stickTop));
    const q = reduce.matches ? 1 : clamp((stickTop - trackTop) / Math.max(1, pinned));
    const step = parseFloat(getComputedStyle(merge).paddingBottom) || 0;

    on.forEach((c, i) => {
      const o = ease(span(pIn, i * 0.08, i * 0.08 + 0.35));
      c.style.opacity = o;
      c.style.transform = `translateY(${(1 - o) * 8}px)`;
    });
    gaps.forEach((c, i) => {
      const o = ease(span(pIn, 0.3 + i * 0.08, 0.65 + i * 0.08)) * (1 - ease(span(q, 0.16, 0.3)));
      c.style.opacity = o;
      c.style.transform = `scale(${0.96 + o * 0.04})`;
    });
    const m = ease(span(q, 0.3, 0.52));
    ama.style.transform = `translateY(${(m * step) / 2}px)`;
    teams.style.transform = `translateY(${step - (m * step) / 2}px)`;
    const l = ease(span(q, 0.44, 0.55));
    from.forEach((f) => (f.style.opacity = 1 - l));
    to.style.opacity = l;
    // The "from …" tags grow in from nothing, so each card's text sits centered
    // until its tag appears, then eases up to make room for it
    tags.forEach((t) => {
      t.style.opacity = l;
      t.style.maxHeight = (l * 16).toFixed(2) + "px";
      t.style.marginTop = ((l - 1) * 4).toFixed(2) + "px";
    });
    const t = ease(span(q, 0.52, 0.66));
    thread.style.opacity = t > 0 ? 1 : 0;
    thread.style.transform = `scaleX(${t})`;
    const a = ease(span(q, 0.62, 0.82));
    after.style.opacity = a;
    after.style.transform = `translateY(${(1 - a) * 16}px)`;
  }

  function queue() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  }

  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", () => {
    size();
    queue();
  });
  size();
  render();
})();
