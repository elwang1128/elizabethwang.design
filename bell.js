// Live bell demo (bell.plus page): a working recreation of the redesigned
// timer. A simulated school day runs at the chosen speed; the wedge empties
// as the period runs down, and when it hits zero the next period (or passing
// period) takes over. The speed pills on top and the theme dots below change
// it live. Pauses while off screen; starts at real speed for reduced motion.
(function () {
  const demo = document.querySelector("[data-bell-demo]");
  if (!demo) return;

  // Westside High School, B Schedule: 55-minute classes, 5-minute passing
  // periods, and lunch, like a typical school day
  const t = (h, m) => (h * 60 + m) * 60;
  const blocks = [];
  [
    ["English", 8, 0, 8, 55],
    ["PE", 9, 0, 9, 55],
    ["Math", 10, 0, 10, 55],
    ["Lunch & Advisory", 11, 0, 11, 45],
    ["Chemistry", 11, 50, 12, 45],
    ["Social Studies", 12, 50, 13, 45],
    ["Science", 13, 50, 14, 40],
  ].forEach(([name, h1, m1, h2, m2], i, all) => {
    if (i > 0) {
      const prev = all[i - 1];
      blocks.push({ name: "Passing to " + name, start: t(prev[3], prev[4]), end: t(h1, m1), passing: true });
    }
    blocks.push({ name, start: t(h1, m1), end: t(h2, m2) });
  });
  const DAY_START = blocks[0].start;
  const DAY_END = blocks[blocks.length - 1].end;

  const mmEl = demo.querySelector(".bell-mm");
  const ssEl = demo.querySelector(".bell-ss");
  const nameEl = demo.querySelector(".bell-name");
  const subEl = demo.querySelector(".bell-sub");
  const clockEl = demo.querySelector(".bell-clock");
  const pie = demo.querySelector(".bell-pie");
  const speedBtns = Array.from(demo.querySelectorAll("[data-speed]"));
  const themeBtns = Array.from(demo.querySelectorAll("[data-theme-color]"));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let sim = t(11, 17) + 44; // 27:16 left in Lunch & Advisory, like the mockup
  let speed = reduce ? 1 : 60;
  let last = 0;
  let raf = 0;
  let visible = false;

  const pad = (n) => String(n).padStart(2, "0");

  function clockText(s) {
    const h24 = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const h = ((h24 + 11) % 12) + 1;
    return `September 22, 2025 | ${h}:${pad(m)} ${h24 < 12 ? "AM" : "PM"}`;
  }

  function render() {
    const b = blocks.find((x) => sim >= x.start && sim < x.end) || blocks[0];
    const left = Math.max(0, b.end - sim);
    const hrs = Math.floor(left / 3600);
    const mins = Math.floor((left % 3600) / 60);
    const secs = Math.floor(left % 60);
    // Minutes and seconds either side of a colon that sits on the circle's
    // center (hours fold into the minutes for a period over an hour)
    mmEl.textContent = hrs ? `${hrs}:${pad(mins)}` : pad(mins);
    ssEl.textContent = pad(secs);
    nameEl.textContent = b.name;
    subEl.textContent = b.passing ? "Passing period" : "B Schedule";
    clockEl.textContent = clockText(sim);
    pie.style.setProperty("--done", ((sim - b.start) / (b.end - b.start)).toFixed(4));
    demo.classList.toggle("is-passing", !!b.passing);
  }

  function loop(now) {
    raf = 0;
    if (!visible) return;
    if (last) sim += ((now - last) / 1000) * speed;
    last = now;
    if (sim >= DAY_END) sim = DAY_START; // the school day starts over
    render();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (!raf) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  speedBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      speed = Number(btn.dataset.speed);
      speedBtns.forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
    })
  );
  speedBtns.forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.speed) === speed ? "true" : "false"));

  themeBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      demo.style.setProperty("--bell-color", btn.dataset.themeColor);
      themeBtns.forEach((b) => b.setAttribute("aria-pressed", b === btn ? "true" : "false"));
    })
  );

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) start();
  }).observe(demo);

  render();
})();
