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
  document.querySelectorAll(".role-tabs").forEach((list) => {
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
