// Creative toolbox (homepage only; desktop with a mouse — hidden on phones/touch).
//
// [CREATIVE TOOLBOX] opens four tools:
//   [BRUSH]      press and drag anywhere to paint
//   [FLOWERS]    click anywhere and a flower grows up from that spot and blooms
//   [FEED FISH]  five fish swim in; clicks sprinkle food that they chase and eat
//   [RESET]      everything on the page falls to the bottom and piles up, then
//                floats back into place; brush marks, flowers and fish are cleared
//
// While a tool is on, clicks on the page go to the tool instead of links.
// The toolbox itself and the header's links/buttons keep working.
(function () {
  const toolbox = document.querySelector(".toolbox");
  if (!toolbox) return;

  const toggle = toolbox.querySelector(".toolbox-toggle");
  const tools = toolbox.querySelector(".toolbox-tools");
  const toolButtons = [...tools.querySelectorAll("[data-tool]")];
  const resetButton = tools.querySelector('[data-action="reset"]');
  const enabled = window.matchMedia("(min-width: 840px) and (hover: hover) and (pointer: fine)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mode = null; // "brush" | "flowers" | "fish" | null
  let resetting = false;

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const ink = () => getComputedStyle(document.body).color;
  const paper = () => getComputedStyle(document.body).backgroundColor;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
  };

  // Clicks on the toolbox, or on the header's own links and buttons, aren't tool clicks
  const isExempt = (target) =>
    !!(target.closest(".toolbox") || target.closest(".site-header a, .site-header button"));

  // ---------- drawing layers (created on first use) ----------
  let brushCanvas, brushCtx, fishCanvas, fishCtx, flowerLayer;

  function sizeCanvas(canvas, keepDrawing) {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    let snapshot = null;
    if (keepDrawing && canvas.width) {
      snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext("2d").drawImage(canvas, 0, 0);
    }
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (snapshot) ctx.drawImage(snapshot, 0, 0, snapshot.width / dpr, snapshot.height / dpr);
    return ctx;
  }

  function ensureLayers() {
    if (flowerLayer) return;
    flowerLayer = document.createElement("div");
    flowerLayer.className = FLOWER_STYLE === "doodle" ? "fx-flowers is-doodle" : "fx-flowers";
    flowerLayer.setAttribute("aria-hidden", "true");

    fishCanvas = document.createElement("canvas");
    fishCanvas.className = FISH_STYLE === "doodle" ? "fx-canvas fx-fish is-doodle" : "fx-canvas fx-fish";
    fishCanvas.setAttribute("aria-hidden", "true");

    brushCanvas = document.createElement("canvas");
    brushCanvas.className = "fx-canvas fx-brush";
    brushCanvas.setAttribute("aria-hidden", "true");

    document.body.append(flowerLayer, fishCanvas, brushCanvas);
    brushCtx = sizeCanvas(brushCanvas, false);
    fishCtx = sizeCanvas(fishCanvas, false);

    window.addEventListener("resize", () => {
      brushCtx = sizeCanvas(brushCanvas, true);
      fishCtx = sizeCanvas(fishCanvas, false);
    });
  }

  // ---------- toolbox UI ----------
  function setOpen(open) {
    tools.hidden = !open;
    toggle.textContent = open ? "[CLOSE TOOLBOX]" : "[CREATIVE TOOLBOX]";
    toggle.setAttribute("aria-expanded", String(open));
    if (open) ensureLayers();
    else setMode(null);
  }

  function setMode(next) {
    mode = next;
    toolButtons.forEach((b) => {
      const on = b.dataset.tool === mode;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (mode) document.body.dataset.tool = mode;
    else delete document.body.dataset.tool;
    if (mode === "fish") spawnFish();
  }

  toggle.addEventListener("click", () => setOpen(tools.hidden));
  toolButtons.forEach((b) =>
    b.addEventListener("click", () => setMode(mode === b.dataset.tool ? null : b.dataset.tool))
  );
  resetButton.addEventListener("click", () => gravityReset());

  // Phone-sized window, or no mouse: put the toolbox away
  enabled.addEventListener("change", (e) => {
    if (!e.matches) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && mode) setMode(null);
  });

  // While a tool is on, page clicks go to the tool (and don't follow links)
  document.addEventListener(
    "click",
    (e) => {
      if (resetting || !mode || isExempt(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      if (mode === "flowers") plantFlower(e.clientX, e.clientY);
      else if (mode === "fish") dropFood(e.clientX, e.clientY);
    },
    true
  );

  // ---------- [BRUSH] ----------
  // Ink is thicker when the stroke is slow and thinner when it's quick
  let painting = false;
  let last = null;

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (mode !== "brush" || resetting || e.button !== 0 || isExempt(e.target)) return;
      e.preventDefault(); // no text selection or image dragging while painting
      painting = true;
      last = { x: e.clientX, y: e.clientY, t: e.timeStamp, w: 5 };
      brushCtx.fillStyle = ink();
      brushCtx.beginPath();
      brushCtx.arc(last.x, last.y, last.w / 2, 0, Math.PI * 2);
      brushCtx.fill();
    },
    true
  );

  document.addEventListener("pointermove", (e) => {
    if (!painting) return;
    const points = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    brushCtx.strokeStyle = ink();
    brushCtx.lineCap = "round";
    brushCtx.lineJoin = "round";
    for (const p of points.length ? points : [e]) {
      const x = p.clientX;
      const y = p.clientY;
      const dist = Math.hypot(x - last.x, y - last.y);
      if (dist < 0.5) continue;
      const speed = dist / Math.max(1, p.timeStamp - last.t); // px per ms
      const target = Math.max(1.8, Math.min(7, 7 - speed * 2));
      const w = last.w + (target - last.w) * 0.3;
      brushCtx.lineWidth = w;
      brushCtx.beginPath();
      brushCtx.moveTo(last.x, last.y);
      brushCtx.lineTo(x, y);
      brushCtx.stroke();
      last = { x, y, t: p.timeStamp, w };
    }
  });

  const stopPainting = () => (painting = false);
  document.addEventListener("pointerup", stopPainting);
  document.addEventListener("pointercancel", stopPainting);

  // ---------- [FLOWERS] ----------
  // Petal colours. Each petal gets a gentle gradient made from its one colour:
  // a touch deeper at the base, a touch lighter at the tip.
  const DAISY_COLORS = ["#F2A7B5", "#F6D06F", "#C7B5EE", "#F29A7A", "#A9D4EE", "#F7B38A"];
  const TULIP_COLORS = ["#E2647A", "#EE8FB0", "#F2C14E", "#F0935A", "#A887DD"];
  const GRADIENT_DEEPEN = 0.1; // how much darker the base is (0–1)
  const GRADIENT_LIGHTEN = 0.18; // how much lighter the tip is (0–1)

  // Blend a hex colour toward another by t (0–1)
  function mix(hex, toward, t) {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(toward.slice(1), 16);
    const ch = (n, s) => (n >> s) & 255;
    const c = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
    return "#" + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }
  const shades = (color, extraDeep = 0) => [
    mix(color, "#000000", GRADIENT_DEEPEN + extraDeep),
    mix(color, "#ffffff", GRADIENT_LIGHTEN - extraDeep),
  ];
  const TULIP_SHARE = 0.35; // about a third of the flowers are tulips

  // "doodle": black line art that draws itself in, with a hand-drawn wobble.
  // "color":  filled petals with soft gradients.
  const FLOWER_STYLE = "doodle";
  const DOODLE_WOBBLE = 2; // how far the doodle lines wander, in px (0 = perfectly smooth)
  const DOODLE_SHIMMER = "1.2s"; // how long one cycle of the line shimmer takes (longer = calmer)
  const STEM = "#5E8F5B";
  const flowers = [];
  let gradientCount = 0;

  // A linear gradient that runs across a shape's own box, from (x1,y1) to (x2,y2) in 0–1
  function gradient(svg, [deep, pale], x1, y1, x2, y2) {
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = svgEl("defs", {});
      svg.prepend(defs);
    }
    const id = "fx-grad-" + gradientCount++;
    const g = svgEl("linearGradient", { id, x1, y1, x2, y2 });
    g.append(
      svgEl("stop", { offset: "0", "stop-color": deep }),
      svgEl("stop", { offset: "1", "stop-color": pale })
    );
    defs.append(g);
    return `url(#${id})`;
  }

  // Point on a cubic Bézier, for placing leaves along the stem
  function bezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  }

  function plantFlower(x, y) {
    if (FLOWER_STYLE === "doodle") return plantDoodle(x, y);
    const tulip = Math.random() < TULIP_SHARE;
    const h = tulip ? rand(60, 110) : rand(55, 115); // stem height
    const tipX = tulip ? rand(-8, 8) : rand(-16, 16); // where the bloom ends up, sideways

    const W = 160;
    const top = h + 40;
    const svg = svgEl("svg", {
      class: "flower",
      width: W,
      height: top + 4,
      viewBox: `${-W / 2} ${-top} ${W} ${top + 4}`,
    });
    svg.style.left = x - W / 2 + "px";
    svg.style.top = y - top + "px";

    // Stem: a gentle S-curve from the click point up to the bloom
    const c1x = -tipX * 0.6;
    const c1y = -h * 0.35;
    const c2x = tipX * 1.4;
    const c2y = -h * 0.65;
    svg.append(
      svgEl("path", {
        class: "fl-stem",
        d: `M0 0 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tipX} ${-h}`,
        pathLength: 1,
        fill: "none",
        stroke: STEM,
        "stroke-width": tulip ? 2.4 : 2,
        "stroke-linecap": "round",
      })
    );

    if (tulip) {
      // Two long, blade-like leaves rising from near the base
      const bx = bezier(0.06, 0, c1x, c2x, tipX);
      const by = bezier(0.06, 0, c1y, c2y, -h);
      [
        [1, rand(4, 14), "0.3s"],
        [-1, rand(4, 14), "0.42s"],
      ].forEach(([side, lean, delay]) => {
        const bl = h * rand(0.4, 0.55); // blade length
        const g = svgEl("g", {
          transform: `translate(${bx} ${by}) scale(${side} 1) rotate(${lean})`,
        });
        const blade = svgEl("path", {
          class: "fl-blade",
          d: `M0 0 Q${bl * 0.32} ${-bl * 0.42} ${bl * 0.2} ${-bl} Q${bl * 0.05} ${-bl * 0.5} 0 0`,
          fill: STEM,
        });
        blade.style.setProperty("--d", delay);
        g.append(blade);
        svg.append(g);
      });
    } else {
      // Two small leaves partway up, one on each side
      [
        [0.32, -150, "0.35s"],
        [0.52, -30, "0.5s"],
      ].forEach(([t, angle, delay]) => {
        const lx = bezier(t, 0, c1x, c2x, tipX);
        const ly = bezier(t, 0, c1y, c2y, -h);
        const g = svgEl("g", { transform: `translate(${lx} ${ly}) rotate(${angle + rand(-12, 12)})` });
        const leaf = svgEl("path", { class: "fl-leaf", d: "M0 0 Q7 -7 15 -1 Q8 4 0 0", fill: STEM });
        leaf.style.setProperty("--d", delay);
        g.append(leaf);
        svg.append(g);
      });
    }

    const bloom = svgEl("g", { transform: `translate(${tipX} ${-h})` });
    if (tulip) addTulip(svg, bloom);
    else addDaisy(svg, bloom);
    svg.append(bloom);

    flowerLayer.append(svg);
    flowers.push(svg);
    if (flowers.length > 80) flowers.shift().remove(); // keep the garden from getting heavy
  }

  // ---------- Doodle flowers: line art that draws itself in ----------
  // Every line is one stroke in the text colour (black, or white in dark mode)
  // drawn on like a pen, in order: stem, leaves, then the bloom. A small
  // displacement filter gives the lines a hand-drawn wobble that gently "boils".
  let doodleCount = 0;

  function line(d, delay, duration, extraClass = "") {
    const p = svgEl("path", { class: `dd-line ${extraClass}`.trim(), d, pathLength: 1 });
    p.style.setProperty("--d", delay + "s");
    p.style.setProperty("--t", duration + "s");
    return p;
  }

  function plantDoodle(x, y) {
    const tulip = Math.random() < TULIP_SHARE;
    const h = tulip ? rand(60, 110) : rand(55, 115);
    const tipX = tulip ? rand(-8, 8) : rand(-16, 16);
    const W = 160;
    const top = h + 44;

    const svg = svgEl("svg", {
      class: "flower flower-doodle",
      width: W,
      height: top + 6,
      viewBox: `${-W / 2} ${-top} ${W} ${top + 6}`,
    });
    svg.style.left = x - W / 2 + "px";
    svg.style.top = y - top + "px";

    // Hand-drawn wobble
    const id = "dd-wobble-" + doodleCount++;
    const defs = svgEl("defs", {});
    const filter = svgEl("filter", {
      id,
      filterUnits: "userSpaceOnUse",
      x: -W / 2,
      y: -top,
      width: W,
      height: top + 6,
    });
    const seed = randInt(1, 900);
    const noise = svgEl("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.04",
      numOctaves: "2",
      seed,
    });
    if (!reduceMotion.matches) {
      // Swap the noise a few times a second so the lines shimmer like a hand-drawn animation
      noise.append(
        svgEl("animate", {
          attributeName: "seed",
          values: `${seed};${seed + 1};${seed + 2}`,
          dur: DOODLE_SHIMMER,
          calcMode: "discrete",
          repeatCount: "indefinite",
        })
      );
    }
    filter.append(noise, svgEl("feDisplacementMap", { in: "SourceGraphic", scale: DOODLE_WOBBLE }));
    defs.append(filter);
    svg.append(defs);
    const art = svgEl("g", { filter: `url(#${id})` });
    svg.append(art);

    // Stem
    const c1x = -tipX * 0.6;
    const c1y = -h * 0.35;
    const c2x = tipX * 1.4;
    const c2y = -h * 0.65;
    art.append(line(`M0 0 C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tipX} ${-h}`, 0, 0.7));

    if (tulip) {
      // Two long blade leaves from near the base
      const bx = bezier(0.06, 0, c1x, c2x, tipX);
      const by = bezier(0.06, 0, c1y, c2y, -h);
      [
        [1, rand(4, 14), 0.3],
        [-1, rand(4, 14), 0.42],
      ].forEach(([side, lean, delay]) => {
        const bl = h * rand(0.4, 0.55);
        const g = svgEl("g", { transform: `translate(${bx} ${by}) scale(${side} 1) rotate(${lean})` });
        g.append(
          line(`M0 0 Q${bl * 0.32} ${-bl * 0.42} ${bl * 0.2} ${-bl} Q${bl * 0.05} ${-bl * 0.5} 0 0`, delay, 0.45)
        );
        art.append(g);
      });
    } else {
      // Two leaves with a vein down the middle
      [
        [0.32, -150, 0.35],
        [0.52, -30, 0.5],
      ].forEach(([t, angle, delay]) => {
        const lx = bezier(t, 0, c1x, c2x, tipX);
        const ly = bezier(t, 0, c1y, c2y, -h);
        const g = svgEl("g", { transform: `translate(${lx} ${ly}) rotate(${angle + rand(-12, 12)}) scale(1.25)` });
        g.append(line("M0 0 Q7 -7 15 -1 Q8 4 0 0", delay, 0.35), line("M1.5 -0.5 Q7 -2 12.5 -1.2", delay + 0.2, 0.2));
        art.append(g);
      });
    }

    const bloom = svgEl("g", { transform: `translate(${tipX} ${-h})` });
    if (tulip) doodleTulip(bloom);
    else doodleDaisy(bloom);
    art.append(bloom);

    flowerLayer.append(svg);
    flowers.push(svg);
    if (flowers.length > 80) flowers.shift().remove();
  }

  // Daisy: an empty centre ring, then looping petals drawn one after another
  function doodleDaisy(bloom) {
    const petals = randInt(5, 8);
    const len = rand(11, 17);
    const w = len * rand(0.32, 0.42);
    const r0 = rand(3.5, 5); // centre ring
    const turn = rand(0, 360);
    // Centre ring, filled with the page colour so the top of the stem doesn't show through it
    bloom.append(
      svgEl("circle", { class: "dd-line dd-solid", cx: 0, cy: 0, r: r0, pathLength: 1, style: "--d: 0.68s; --t: 0.25s" })
    );
    for (let i = 0; i < petals; i++) {
      const g = svgEl("g", { transform: `rotate(${turn + (i * 360) / petals + rand(-6, 6)})` });
      const l = len * rand(0.88, 1.08);
      g.append(
        line(
          `M${r0} -0.6 C ${r0 + l * 0.3} ${-w}, ${r0 + l} ${-w * 0.9}, ${r0 + l} 0 C ${r0 + l} ${w * 0.9}, ${r0 + l * 0.3} ${w}, ${r0} 0.6`,
          0.85 + i * 0.07,
          0.22
        )
      );
      bloom.append(g);
    }
  }

  // Tulip: two outer petals, and a front petal that covers their lower lines
  function doodleTulip(bloom) {
    const tw = rand(16, 21);
    const th = rand(20, 26);
    bloom.append(
      line(
        `M-1 1 C ${-tw * 0.62} ${-th * 0.05}, ${-tw * 0.72} ${-th * 0.7}, ${-tw * 0.4} ${-th * 1.02} C ${-tw * 0.22} ${-th * 0.7}, ${-tw * 0.08} ${-th * 0.35}, -1 1`,
        0.75,
        0.35
      ),
      line(
        `M1 1 C ${tw * 0.62} ${-th * 0.05}, ${tw * 0.72} ${-th * 0.7}, ${tw * 0.4} ${-th * 1.02} C ${tw * 0.22} ${-th * 0.7}, ${tw * 0.08} ${-th * 0.35}, 1 1`,
        0.85,
        0.35
      ),
      line(
        `M0 2 C ${-tw * 0.52} 1, ${-tw * 0.52} ${-th * 0.7}, ${-tw * 0.2} ${-th * 0.97} C ${-tw * 0.08} ${-th * 1.05}, ${tw * 0.08} ${-th * 1.05}, ${tw * 0.2} ${-th * 0.97} C ${tw * 0.52} ${-th * 0.7}, ${tw * 0.52} 1, 0 2`,
        1.0,
        0.45,
        "dd-solid"
      )
    );
  }

  // Daisy-style bloom: petals open from the centre one after another, then the centre pops
  function addDaisy(svg, bloom) {
    const petals = randInt(5, 8);
    const petalLen = rand(12, 19);
    const petalW = petalLen * rand(0.5, 0.66);
    const color = pick(DAISY_COLORS);
    const fill = gradient(svg, shades(color), 0, 0, 1, 0); // deeper at the centre, lighter at the tip
    const center = color === "#F6D06F" ? "#7A5A3A" : "#E8B53C";
    const turn = rand(0, 360);
    for (let i = 0; i < petals; i++) {
      const g = svgEl("g", { transform: `rotate(${turn + (i * 360) / petals})` });
      const petal = svgEl("ellipse", {
        class: "fl-petal",
        cx: petalLen / 2,
        cy: 0,
        rx: petalLen / 2,
        ry: petalW / 2,
        fill,
      });
      petal.style.setProperty("--i", i);
      g.append(petal);
      bloom.append(g);
    }
    const dot = svgEl("circle", { class: "fl-center", cx: 0, cy: 0, r: petalLen * 0.28, fill: center });
    dot.style.setProperty("--d", `${0.72 + petals * 0.045 + 0.15}s`);
    bloom.append(dot);
  }

  // Tulip: a closed cup that swells up from the stem, then its outer petals ease open
  function addTulip(svg, bloom) {
    const tw = rand(16, 21); // cup width
    const th = rand(20, 26); // cup height
    const color = pick(TULIP_COLORS);
    // Deeper at the base, lighter at the rim. The two back petals are a shade
    // deeper than the front one, which is what separates them (no outlines).
    const fill = gradient(svg, shades(color), 0, 1, 0, 0);
    const backFill = gradient(svg, shades(color, 0.08), 0, 1, 0, 0);

    const cup = svgEl("g", { class: "tl-cup" });
    const left = svgEl("path", {
      class: "tl-side tl-side-l",
      d: `M-1 1 C ${-tw * 0.62} ${-th * 0.05}, ${-tw * 0.72} ${-th * 0.7}, ${-tw * 0.4} ${-th * 1.02} C ${-tw * 0.22} ${-th * 0.7}, ${-tw * 0.08} ${-th * 0.35}, -1 1 Z`,
      fill: backFill,
    });
    const right = svgEl("path", {
      class: "tl-side tl-side-r",
      d: `M1 1 C ${tw * 0.62} ${-th * 0.05}, ${tw * 0.72} ${-th * 0.7}, ${tw * 0.4} ${-th * 1.02} C ${tw * 0.22} ${-th * 0.7}, ${tw * 0.08} ${-th * 0.35}, 1 1 Z`,
      fill: backFill,
    });
    // Front petal: a smooth rounded dome across the top
    const front = svgEl("path", {
      class: "tl-front",
      d: `M0 2 C ${-tw * 0.52} 1, ${-tw * 0.52} ${-th * 0.7}, ${-tw * 0.2} ${-th * 0.97} C ${-tw * 0.08} ${-th * 1.05}, ${tw * 0.08} ${-th * 1.05}, ${tw * 0.2} ${-th * 0.97} C ${tw * 0.52} ${-th * 0.7}, ${tw * 0.52} 1, 0 2 Z`,
      fill,
    });
    cup.append(left, right, front);
    bloom.append(cup);
  }

  // ---------- [FEED FISH] ----------
  // "doodle": outlined, sketchy line art to match the doodle flowers.
  // "solid": filled silhouettes in the text colour.
  const FISH_STYLE = "doodle";
  const FISH_WOBBLE = 0.9; // how far the doodle outline wanders, in px (0 = perfectly smooth)
  const FISH_DRAW_MS = 700; // how long a fish takes to draw itself in
  const fish = [];
  const food = [];
  let fishFrame = null;
  let fishFalling = false;
  let lastTick = 0;

  // ---------- Fish chat bubbles ----------
  // Now and then, a fish that just ate says thanks. Only one bubble shows at a
  // time, and there's a quiet spell after each one so they don't pile up.
  const SAYINGS = [
    "TANKS SO MUCH",
    "TANK YOU VERY MUCH",
    "NOM NOM",
    "FISH FRIENDS FOR LIFE",
    "YOU'RE FIN-TASTIC",
    "O-FISH-ALLY FULL",
  ];
  const BUBBLE_CHANCE = 0.75; // chance that a bite makes a fish speak
  const BUBBLE_SHOW_MS = 2800; // how long a bubble stays up
  const BUBBLE_QUIET_MS = 3000; // wait after a bubble leaves before another can appear
  let bubble = null; // { el, fish, until }
  let quietUntil = 0;
  let lastSaying = "";

  function maybeSpeak(f, now) {
    if (bubble || now < quietUntil || Math.random() > BUBBLE_CHANCE) return;
    let text = pick(SAYINGS);
    while (text === lastSaying) text = pick(SAYINGS); // don't repeat back to back
    lastSaying = text;
    const el = document.createElement("div");
    el.className = "fish-bubble";
    el.setAttribute("aria-hidden", "true");
    const body = document.createElement("span");
    body.className = "fish-bubble-body";
    body.textContent = text;
    el.append(body);
    document.body.append(el);
    bubble = { el, fish: f, until: now + BUBBLE_SHOW_MS };
    placeBubble();
  }

  // Keep the bubble just above its fish (and on screen)
  function placeBubble() {
    if (!bubble) return;
    const f = bubble.fish;
    const half = bubble.el.offsetWidth / 2;
    const x = Math.max(half + 8, Math.min(window.innerWidth - half - 8, f.x));
    const y = Math.max(bubble.el.offsetHeight + 8, f.y - f.len * 0.45 - 8);
    bubble.el.style.left = x + "px";
    bubble.el.style.top = y + "px";
  }

  function dismissBubble(now, instant) {
    if (!bubble) return;
    const el = bubble.el;
    bubble = null;
    quietUntil = now + BUBBLE_QUIET_MS;
    if (instant) return el.remove();
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 300);
  }

  function spawnFish() {
    if (fish.length) return; // already swimming
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < 5; i++) {
      const angle = rand(0, Math.PI * 2);
      fish.push({
        x: rand(w * 0.15, w * 0.85),
        y: rand(h * 0.35, h * 0.85),
        vx: Math.cos(angle) * 0.8,
        vy: Math.sin(angle) * 0.4,
        angle,
        len: rand(20, 30),
        phase: rand(0, Math.PI * 2),
        born: performance.now() + i * 120,
        tx: 0,
        ty: 0,
        retarget: 0,
        gulp: 0,
        spin: 0,
        effort: 0, // 0 = cruising, 1 = rushing to food; drives the tail beat
        seed: rand(0, 100), // gives each fish its own hand-drawn wobble
      });
    }
    startFishLoop();
  }

  function dropFood(x, y) {
    if (!fish.length) spawnFish();
    const n = randInt(7, 11);
    for (let i = 0; i < n; i++) {
      food.push({
        x: x + rand(-18, 18),
        y: y + rand(-6, 6),
        vy: rand(0.1, 0.45),
        r: rand(1.6, 2.5),
        seed: rand(0, 1000),
        landed: false,
      });
    }
    startFishLoop();
  }

  function startFishLoop() {
    if (fishFrame) return;
    lastTick = performance.now();
    fishFrame = requestAnimationFrame(tickFish);
  }

  function tickFish(now) {
    const dt = Math.min(3, (now - lastTick) / 16.67); // in 60fps frames
    lastTick = now;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const floor = h - 18; // food settles just above the bottom, within the fish's reach

    // Food sinks slowly with a little side-to-side drift, then rests on the bottom
    for (const p of food) {
      if (fishFalling) {
        p.vy += 0.5 * dt;
        p.y += p.vy * dt;
      } else if (!p.landed) {
        p.vy = Math.min(p.vy + 0.012 * dt, 0.7);
        p.y += p.vy * dt;
        p.x += Math.sin(now / 400 + p.seed) * 0.15 * dt;
        if (p.y >= floor) {
          p.y = floor;
          p.landed = true;
          p.landedAt = now;
        }
      }
    }
    // Leftovers on the bottom dissolve after a while
    for (let i = food.length - 1; i >= 0; i--) {
      if (!fishFalling && food[i].landed && now - food[i].landedAt > 8000) food.splice(i, 1);
    }

    for (const f of fish) {
      if (fishFalling) {
        // Reset: tumble down off the bottom of the screen
        f.vy += 0.45 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.angle += f.spin * dt;
        continue;
      }

      // Chase the nearest food, otherwise wander
      let tx;
      let ty;
      let maxSpeed = 1.2;
      let steer = 0.04;
      // Stick with the flake already being chased (so the fish doesn't dither
      // between two equally close ones); otherwise pick the nearest
      let nearest = food.includes(f.target) ? f.target : null;
      if (!nearest) {
        let best = Infinity;
        for (const p of food) {
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          if (d < best) {
            best = d;
            nearest = p;
          }
        }
      }
      f.target = nearest;
      if (nearest) {
        tx = nearest.x;
        ty = nearest.y;
        steer = 0.11;
        // Ease off when close, so it glides onto the flake instead of overshooting
        const away = Math.hypot(nearest.x - f.x, nearest.y - f.y);
        maxSpeed = 2.7 * Math.max(0.35, Math.min(1, away / 45));
        // A bite lands if the flake touches the mouth or the head
        const mouthX = f.x + Math.cos(f.angle) * f.len * 0.42;
        const mouthY = f.y + Math.sin(f.angle) * f.len * 0.42;
        if (Math.hypot(nearest.x - mouthX, nearest.y - mouthY) < 9 || away < f.len * 0.45) {
          food.splice(food.indexOf(nearest), 1); // nom
          f.target = null;
          f.gulp = 1;
          maybeSpeak(f, now);
        }
      } else {
        if (now > f.retarget || Math.hypot(f.tx - f.x, f.ty - f.y) < 30) {
          f.tx = rand(w * 0.1, w * 0.9);
          f.ty = rand(h * 0.3, h * 0.9);
          f.retarget = now + rand(2000, 5000);
        }
        tx = f.tx;
        ty = f.ty;
      }

      const dx = tx - f.x;
      const dy = ty - f.y;
      const d = Math.hypot(dx, dy) || 1;
      f.vx += ((dx / d) * maxSpeed - f.vx) * steer * dt;
      f.vy += ((dy / d) * maxSpeed - f.vy) * steer * dt;

      // A little personal space, so a crowd at the food doesn't merge into one blob
      for (const o of fish) {
        if (o === f) continue;
        const sx = f.x - o.x;
        const sy = f.y - o.y;
        const sd = Math.hypot(sx, sy);
        const room = (f.len + o.len) * 0.45;
        if (sd > 0 && sd < room) {
          const push = ((room - sd) / room) * 0.25 * dt;
          f.vx += (sx / sd) * push;
          f.vy += (sy / sd) * push;
        }
      }

      // Stay on screen
      const m = 24;
      if (f.x < m) f.vx += 0.15 * dt;
      if (f.x > w - m) f.vx -= 0.15 * dt;
      if (f.y < m) f.vy += 0.15 * dt;
      if (f.y > h - 10) f.vy -= 0.15 * dt;

      const speed = Math.hypot(f.vx, f.vy);
      if (speed > maxSpeed) {
        f.vx = (f.vx / speed) * maxSpeed;
        f.vy = (f.vy / speed) * maxSpeed;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Turn smoothly toward the direction of travel (only when actually moving,
      // so tiny drifts near a flake can't make it spin on the spot)
      if (speed > 0.25) {
        let diff = Math.atan2(f.vy, f.vx) - f.angle;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        f.angle += diff * Math.min(1, 0.12 * dt);
      }
      // Tail beat: a slow, lazy sweep while cruising (under 1 beat a second),
      // quickening to almost 3 a second when rushing toward food
      f.effort += ((nearest ? 1 : 0) - f.effort) * Math.min(1, 0.05 * dt);
      const beat = 0.035 + speed * 0.035 + f.effort * (0.07 + speed * 0.04);
      f.phase += beat * dt;
      f.gulp = Math.max(0, f.gulp - 0.05 * dt);
    }

    drawFish(now);

    if (bubble) {
      if (fishFalling || now > bubble.until) dismissBubble(now, fishFalling);
      else placeBubble();
    }

    if (fishFalling) {
      const gone = (o) => o.y > h + 80;
      if (fish.every(gone) && food.every(gone)) {
        fish.length = 0;
        food.length = 0;
        fishFalling = false;
        fishCtx.clearRect(0, 0, w, h);
      }
    }

    if (fish.length || food.length) fishFrame = requestAnimationFrame(tickFish);
    else fishFrame = null;
  }

  function drawFish(now) {
    const ctx = fishCtx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const color = ink();
    const eye = paper();

    // A faint hairline in the page colour keeps fish and food findable when they
    // pass over something the same colour as them (e.g. a white screenshot).
    // It's drawn under the fill, so only half its width shows, at low opacity.
    const OUTLINE_WIDTH = 1.2;
    const OUTLINE_OPACITY = 0.3;
    ctx.fillStyle = color;
    ctx.strokeStyle = eye;
    ctx.lineWidth = OUTLINE_WIDTH;
    for (const p of food) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.globalAlpha = OUTLINE_OPACITY;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fill();
    }

    if (FISH_STYLE === "doodle") {
      for (const f of fish) drawDoodleFish(ctx, f, now, color, eye);
      return;
    }

    for (const f of fish) {
      const appear = Math.max(0, Math.min(1, (now - f.born) / 450)); // fade/scale in
      if (!appear) continue;
      const L = f.len * (0.4 + 0.6 * appear);
      // Tail swings wider when rushing than when cruising
      const swing = Math.sin(f.phase) * (0.28 + f.effort * 0.14);
      const bh = L * 0.24 * (1 + f.gulp * 0.18); // body half-height (puffs out after a bite)
      ctx.save();
      ctx.globalAlpha = appear;
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      // Silhouette: tail, top (dorsal) fin, belly fin, body.
      // Drawn twice: a thin outline in the page colour, then the fill.
      const silhouette = (paint) => {
        // Tail: a broad, rounded fan with a soft notch, sized to the round body
        ctx.save();
        ctx.translate(-L * 0.42, 0);
        ctx.rotate(swing);
        ctx.beginPath();
        ctx.moveTo(L * 0.04, 0);
        ctx.quadraticCurveTo(-L * 0.12, -L * 0.1, -L * 0.42, -L * 0.3);
        ctx.quadraticCurveTo(-L * 0.36, -L * 0.08, -L * 0.3, 0);
        ctx.quadraticCurveTo(-L * 0.36, L * 0.08, -L * 0.42, L * 0.3);
        ctx.quadraticCurveTo(-L * 0.12, L * 0.1, L * 0.04, 0);
        ctx.closePath();
        paint();
        ctx.restore();

        // Top fin: low and swept back with a rounded crest, trailing a little with the tail
        const trail = swing * L * 0.05;
        ctx.beginPath();
        ctx.moveTo(L * 0.14, -bh * 0.9);
        ctx.bezierCurveTo(L * 0.04, -bh - L * 0.11, -L * 0.13, -bh - L * 0.13, -L * 0.25 + trail, -bh - L * 0.06);
        ctx.quadraticCurveTo(-L * 0.21, -bh * 0.92, -L * 0.32, -bh * 0.58);
        ctx.closePath();
        paint();

        // Belly fin: smaller, also swept back with a rounded edge
        ctx.beginPath();
        ctx.moveTo(L * 0.02, bh * 0.9);
        ctx.bezierCurveTo(-L * 0.04, bh + L * 0.08, -L * 0.14, bh + L * 0.1, -L * 0.23 + trail, bh + L * 0.05);
        ctx.quadraticCurveTo(-L * 0.19, bh * 0.92, -L * 0.29, bh * 0.58);
        ctx.closePath();
        paint();

        ctx.beginPath();
        ctx.ellipse(0, 0, L * 0.5, bh, 0, 0, Math.PI * 2);
        paint();
      };
      ctx.strokeStyle = eye;
      ctx.lineWidth = OUTLINE_WIDTH;
      ctx.lineJoin = "round";
      ctx.globalAlpha = appear * OUTLINE_OPACITY;
      silhouette(() => ctx.stroke());
      ctx.globalAlpha = appear;
      ctx.fillStyle = color;
      silhouette(() => ctx.fill());

      // Eye
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(L * 0.27, -L * 0.05, Math.max(1.3, L * 0.055), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ---------- Doodle fish: outlined line art that draws itself in ----------
  // Each part (tail, fins, body) is sampled into points, nudged by a smooth
  // per-fish wiggle so the line looks hand drawn, then filled with the page
  // colour and outlined in the text colour. The wiggle swaps between three
  // variations, like the flowers' shimmer, so the lines gently "boil".
  function sketchPoints() {
    const pts = [];
    let cx = 0;
    let cy = 0;
    const api = {
      move(x, y) {
        pts.push([x, y]);
        cx = x;
        cy = y;
        return api;
      },
      quad(qx, qy, x, y) {
        for (let i = 1; i <= 8; i++) {
          const t = i / 8;
          const u = 1 - t;
          pts.push([u * u * cx + 2 * u * t * qx + t * t * x, u * u * cy + 2 * u * t * qy + t * t * y]);
        }
        cx = x;
        cy = y;
        return api;
      },
      cubic(ax, ay, bx, by, x, y) {
        for (let i = 1; i <= 10; i++) {
          const t = i / 10;
          pts.push([bezier(t, cx, ax, bx, x), bezier(t, cy, ay, by, y)]);
        }
        cx = x;
        cy = y;
        return api;
      },
      ellipse(rx, ry) {
        for (let i = 0; i <= 40; i++) {
          const a = Math.PI + (i / 40) * Math.PI * 2; // start at the tail end
          pts.push([Math.cos(a) * rx, Math.sin(a) * ry]);
        }
        return api;
      },
      pts,
    };
    return api;
  }

  // Draw one part: fill it with the page colour, then outline the first
  // `progress` of it, so it draws on like a pen
  function sketch(ctx, pts, phase, progress, filled) {
    let s = 0;
    const wob = pts.map(([x, y], i) => {
      if (i) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
      const w = (k) =>
        FISH_WOBBLE * (Math.sin(s * 0.35 + phase + k) * 0.6 + Math.sin(s * 0.9 + phase * 1.7 + k * 2) * 0.4);
      return [x + w(0), y + w(5)];
    });
    const path = (count) => {
      ctx.beginPath();
      ctx.moveTo(wob[0][0], wob[0][1]);
      for (let i = 1; i < count; i++) ctx.lineTo(wob[i][0], wob[i][1]);
    };
    if (filled) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * progress;
      path(wob.length);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = a;
    }
    const count = Math.max(2, Math.ceil(wob.length * progress));
    path(count);
    if (filled && count === wob.length) ctx.closePath();
    ctx.stroke();
  }

  function drawDoodleFish(ctx, f, now, color, page) {
    const t = (now - f.born) / FISH_DRAW_MS;
    if (t <= 0) return;
    // Parts draw on one after another: body, tail, fins, then gill and eye
    const step = (start, len) => Math.max(0, Math.min(1, (t - start) / len));
    const L = f.len;
    const swing = Math.sin(f.phase) * (0.28 + f.effort * 0.14);
    const bh = L * 0.24 * (1 + f.gulp * 0.18); // body half-height (puffs out after a bite)
    const trail = swing * L * 0.05;
    const boil = reduceMotion.matches ? 0 : Math.floor(now / 400) % 3;
    const ph = (part) => f.seed + part * 7.3 + boil * 2.1;

    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.angle);
    ctx.fillStyle = page;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Tail (drawn before the body so the body covers its base)
    const pTail = step(0.35, 0.3);
    if (pTail) {
      ctx.save();
      ctx.translate(-L * 0.42, 0);
      ctx.rotate(swing);
      const tail = sketchPoints()
        .move(L * 0.04, 0)
        .quad(-L * 0.12, -L * 0.1, -L * 0.42, -L * 0.3)
        .quad(-L * 0.36, -L * 0.08, -L * 0.3, 0)
        .quad(-L * 0.36, L * 0.08, -L * 0.42, L * 0.3)
        .quad(-L * 0.12, L * 0.1, L * 0.04, 0).pts;
      sketch(ctx, tail, ph(1), pTail, true);
      ctx.restore();
    }

    // Top fin and belly fin, swept back
    const pFins = step(0.55, 0.3);
    if (pFins) {
      const top = sketchPoints()
        .move(L * 0.14, -bh * 0.9)
        .cubic(L * 0.04, -bh - L * 0.11, -L * 0.13, -bh - L * 0.13, -L * 0.25 + trail, -bh - L * 0.06)
        .quad(-L * 0.21, -bh * 0.92, -L * 0.32, -bh * 0.58).pts;
      const belly = sketchPoints()
        .move(L * 0.02, bh * 0.9)
        .cubic(-L * 0.04, bh + L * 0.08, -L * 0.14, bh + L * 0.1, -L * 0.23 + trail, bh + L * 0.05)
        .quad(-L * 0.19, bh * 0.92, -L * 0.29, bh * 0.58).pts;
      sketch(ctx, top, ph(2), pFins, true);
      sketch(ctx, belly, ph(3), pFins, true);
    }

    // Body, on top of the tail and fin bases
    sketch(ctx, sketchPoints().ellipse(L * 0.5, bh).pts, ph(4), step(0, 0.45), true);

    // Gill: a short open curve behind the head
    const pGill = step(0.8, 0.2);
    if (pGill) {
      const gill = sketchPoints()
        .move(L * 0.17, -bh * 0.6)
        .quad(L * 0.06, 0, L * 0.17, bh * 0.6).pts;
      sketch(ctx, gill, ph(5), pGill, false);
    }

    // Eye: a small inked dot that pops in last
    const pEye = step(0.95, 0.15);
    if (pEye) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(L * 0.3, -L * 0.05, Math.max(1.2, L * 0.045) * pEye, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- [RESET] ----------
  // Pieces that fall: header text, rules and controls, project titles and tiles
  const PIECES = [
    ".site-header .nav-item > a",
    ".site-header .nav-item > .nav-button",
    ".site-header .rule",
    ".site-header .nav-meta > *",
    ".toolbox .tool-btn",
    ".project-title > span",
    ".project-image",
  ].join(",");

  function visiblePieces() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return [...document.querySelectorAll(PIECES)]
      .filter((el) => !el.closest(".dropdown-menu, #mobile-menu, [hidden]"))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .filter(({ el, rect }) => {
        if (rect.width < 1 || rect.height < 1) return false;
        if (rect.right <= 0 || rect.left >= w || rect.bottom <= 0 || rect.top >= h) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== "hidden" && cs.display !== "none";
      });
  }

  // A fixed-position copy that looks the same as the original, outside any clipping
  function copyOf(el, rect) {
    const c = el.cloneNode(true);
    c.removeAttribute("id");
    c.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    c.querySelectorAll(".project-cursor, .sr-only").forEach((n) => n.remove());
    c.setAttribute("aria-hidden", "true");
    const cs = getComputedStyle(el);
    Object.assign(c.style, {
      position: "fixed",
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
      margin: "0",
      boxSizing: "border-box",
      display: cs.display === "inline" ? "inline-block" : cs.display,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      textTransform: cs.textTransform,
      whiteSpace: cs.whiteSpace,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      pointerEvents: "none",
      transformOrigin: "50% 100%",
      animation: "none",
    });
    return c;
  }

  function gravityReset() {
    if (resetting) return;
    resetting = true;
    setMode(null);
    ensureLayers();

    const w = window.innerWidth;
    const h = window.innerHeight;
    const motion = !reduceMotion.matches;

    // Brush marks, flowers and fish all fall off the bottom of the screen
    if (motion) {
      const fall = brushCanvas.animate(
        [
          { transform: "translateY(0px)", opacity: 1, easing: "cubic-bezier(.5,0,.9,.6)" },
          { transform: `translateY(${h}px)`, opacity: 1, offset: 0.85 },
          { transform: `translateY(${h + 40}px)`, opacity: 0 },
        ],
        { duration: 1100, delay: rand(0, 120), fill: "forwards" }
      );
      // Clear the strokes while still off-screen, then put the empty canvas back
      fall.finished.then(() => {
        brushCtx.clearRect(0, 0, w, h);
        fall.cancel();
      });
    } else {
      brushCtx.clearRect(0, 0, w, h);
    }

    flowers.splice(0).forEach((svg) => {
      if (!motion) return svg.remove();
      const r = svg.getBoundingClientRect();
      svg
        .animate(
          [
            { transform: "translate(0, 0) rotate(0deg)", easing: "cubic-bezier(.5,0,.9,.6)" },
            { transform: `translate(${rand(-30, 30)}px, ${h - r.top + 60}px) rotate(${rand(-120, 120)}deg)` },
          ],
          { duration: rand(800, 1200), delay: rand(0, 150), fill: "forwards" }
        )
        .finished.then(() => svg.remove());
    });

    if (fish.length || food.length) {
      if (motion) {
        fishFalling = true;
        fish.forEach((f) => {
          f.vy = rand(-3, -1.5); // a little hop first
          f.spin = rand(-0.15, 0.15);
        });
        startFishLoop();
      } else {
        dismissBubble(performance.now(), true);
        fish.length = 0;
        food.length = 0;
        fishCtx.clearRect(0, 0, w, h);
      }
    }

    if (!motion) {
      resetting = false;
      return;
    }

    // Copies of every visible piece go on a layer above the page; originals hide
    const layer = document.createElement("div");
    layer.className = "reset-layer";
    layer.setAttribute("aria-hidden", "true");
    const pieces = visiblePieces();
    pieces.forEach((p) => {
      p.copy = copyOf(p.el, p.rect);
      p.prevVisibility = p.el.style.visibility;
      layer.append(p.copy);
    });
    document.body.append(layer);
    pieces.forEach((p) => (p.el.style.visibility = "hidden"));

    // Work out where each piece lands. Lowest pieces land first; anything above
    // stacks on whatever is already piled up under it (a height map in 2px columns).
    const COL = 2;
    const pile = new Float32Array(Math.ceil(w / COL) + 1);
    const order = [...pieces].sort((a, b) => b.rect.bottom - a.rect.bottom);
    order.forEach((p) => {
      const c0 = Math.max(0, Math.floor(p.rect.left / COL));
      const c1 = Math.min(pile.length - 1, Math.floor((p.rect.right - 1) / COL));
      let height = 0;
      for (let c = c0; c <= c1; c++) height = Math.max(height, pile[c]);
      const drop = Math.max(0, h - height - p.rect.bottom);
      const newTop = h - (p.rect.top + drop);
      for (let c = c0; c <= c1; c++) pile[c] = Math.max(pile[c], newTop);
      p.drop = drop;
      // Small pieces can tip more; wide ones barely, so neither end digs into
      // the piece below or pokes into the one above (about 3px of lift at most)
      const maxTilt = Math.min(6, (Math.asin(Math.min(1, 3 / p.rect.width)) * 180) / Math.PI);
      p.tilt = rand(-1, 1) * maxTilt;
      p.fallen = `translate(0px, ${drop}px) rotate(${p.tilt}deg)`;
    });

    // Fall: speeds up like gravity, lands with a small bounce
    let fallEnd = 0;
    order.forEach((p) => {
      const duration = 420 + Math.sqrt(p.drop) * 30;
      const delay = rand(0, 140);
      const bounce = Math.min(12, p.drop * 0.05);
      fallEnd = Math.max(fallEnd, duration + delay);
      p.copy.animate(
        [
          { transform: "translate(0px, 0px) rotate(0deg)", easing: "cubic-bezier(.5,0,.9,.5)" },
          { transform: p.fallen, offset: 0.78, easing: "cubic-bezier(.2,.6,.4,1)" },
          {
            transform: `translate(0px, ${p.drop - bounce}px) rotate(${p.tilt * 0.85}deg)`,
            offset: 0.89,
            easing: "cubic-bezier(.6,0,.8,.4)",
          },
          { transform: p.fallen },
        ],
        { duration, delay, fill: "forwards" }
      );
    });

    // Rest a moment, then float back into place over about five seconds,
    // top of each pile first
    const RETURN = 3000;
    const STAGGER = 1800;
    setTimeout(() => {
      const n = order.length;
      const returns = order.map((p, i) => {
        const delay = n > 1 ? ((n - 1 - i) / (n - 1)) * STAGGER : 0;
        return p.copy.animate(
          [{ transform: p.fallen }, { transform: "translate(0px, 0px) rotate(0deg)" }],
          { duration: RETURN, delay, easing: "cubic-bezier(.45,0,.15,1)", fill: "forwards" }
        ).finished;
      });
      Promise.all(returns).then(() => {
        pieces.forEach((p) => (p.el.style.visibility = p.prevVisibility));
        layer.remove();
        resetting = false;
      });
    }, fallEnd + 1000);
  }
})();
