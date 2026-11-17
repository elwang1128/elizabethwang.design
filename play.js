// Play gallery: an endless, draggable wall of pieces.
// - Drag with the mouse or a finger, or scroll with a trackpad / wheel, in any
//   direction. The wall wraps around, so it never runs out.
// - The wall is seen through a big fish-eye lens that follows the cursor
//   (wall-lens.js): pieces near it swell and their edges curve.
// - Pieces are black and white; clicking one opens it large and in color, and
//   it stays in color on the wall after.
// - Videos (.mp4) play muted on a loop on the wall, and with sound when opened.
// - A piece with a `back` image opens as a card: click it to flip it over,
//   and again to flip it back.
//
// To add a piece: put the file in assets/play/ and add a line to PIECES.
(function () {
  const PIECES = [
    { src: "fish-friend-poster.jpg", alt: "Fish Friend poster taped to a street pole, with a photo of a small pufferfish and a QR code to friend.fish" },
    { src: "ikebana-chrysanthemum.jpg", alt: "Ikebana of green chrysanthemums, white alstroemeria and pink waxflower in a black bowl" },
    { src: "tote.mp4", alt: "Tote animation" },
    // A two-sided piece: once opened, clicking it flips it over like a card
    {
      src: "engage-merch.webp",
      alt: "Viva Engage merch: two black T-shirts with Follow and Following buttons printed on them, a cap and socks, floating over a green hill and blue sky",
      back: "engage-merch-back.jpg",
      backAlt: "Four teammates wearing the black Follow T-shirts, smiling together in an office",
      rounded: true, // the front has rounded corners, so the back photo gets them too
    },
    { src: "golden-gate.jpg", alt: "Golden Gate Bridge seen from the beach as waves roll in" },
    { src: "design-posters.webp", alt: "Twelve blue, green and white posters about design, with warped type, collaged photos and retro computer windows, laid out in two rows on black" },
    { src: "aquarium-large.jpg", alt: "Planted aquarium with driftwood, java moss and tall grasses, small fish swimming near the surface" },
    { src: "poppies-door.jpg", alt: "Coral ranunculus in a twisted white vase against white paneling" },
    { src: "portfolio-browser.mp4", silent: true, alt: "Illustration of a portfolio site in a browser window floating in a blue sky, beside folders for work and memes and a trash can labeled regrets" },
    // Light mode on the front, dark mode on the back
    {
      src: "illustrations-light.webp",
      alt: "Twelve soft 3D illustrations in light mode: a chat check mark, folders, warning signs, devices, a cat with headphones at a laptop, a desk lamp, a paper plane, clouds and leaves, a social feed, a video call and a potted plant",
      back: "illustrations-dark.webp",
      backAlt: "The same twelve 3D illustrations in dark mode, on a near-black background",
    },
    { src: "sea-cave.jpg", alt: "Waves seen through a narrow opening in a dark sea cave" },
    { src: "pendant-lamp.jpg", alt: "White ranunculus and a red peony in a paper-bag vase under a white pendant lamp" },
    { src: "soft-rains.jpg", alt: "Three illustrated pages of Sara Teasdale's poem There Will Come Soft Rains: a puddle reflecting a power line in blue, two birds on a billboard in green, and a window at sunset in coral" },
    { src: "fire-and-ice.mp4", alt: "Fire and Ice animation" },
    { src: "puzzle.mp4", alt: "Puzzle animation" },
    { src: "ikebana-protea.jpg", alt: "Ikebana with a red protea and a curly branch, beside a black bird figurine and a gilded frame" },
    { src: "waxflower-niche.jpg", alt: "Pink waxflower in a white gourd vase in a wall niche beside an antique brass intercom" },
    { src: "living-room.jpg", alt: "Sunlit living room with a paper lantern, sling chairs and cream curtains" },
    { src: "trash-smile.webp", alt: "A headless white figure pats a smiling blue ball sitting in a trash can, against a blue sky with clouds" },
    { src: "apple-poster-ikebana.jpg", alt: "Ikebana of white hydrangea and orange chrysanthemums in front of a poster of a drawn face with an apple on its head" },
    { src: "comp-loop.mp4", alt: "Motion design loop" },
    { src: "clip-1297.mp4", alt: "Video clip" },
    { src: "sunset-birds.jpg", alt: "Two birds on a power line against an orange and blue sunset" },
    { src: "poppies-painting.jpg", alt: "Pink ranunculus in a white vase on a round table, below a framed street painting" },
    { src: "orange-tree.jpg", alt: "Someone on a step ladder picking oranges from a tree" },
    { src: "house-couch.webp", alt: "A small house under a big blue sky thinking a scribble, beside a black and white person slumped on a couch with a scribble for a head, dreaming of birds on a wire" },
    { src: "aquarium-cube.jpg", alt: "Small cube aquarium with mossy rocks and carpet plants, lit by a lamp in a dark kitchen" },
    { src: "clip-4287.mp4", alt: "Video clip" },
    { src: "ikebana-bells.jpg", alt: "Ikebana of pink waxflower and bells of Ireland in a black bowl on a wood floor" },
    { src: "hallway-vase.jpg", alt: "Waxflower in a tall white vase on a round white cabinet, seen through a doorway" },
    { src: "rainbow-coit-tower.jpg", alt: "Rainbow over Telegraph Hill and Coit Tower above San Francisco rooftops" },
    { src: "bridge-geese.jpg", alt: "Two geese crossing a wet parking lot in front of a yellow arch bridge" },
    { src: "peonies-miffy.jpg", alt: "Pink peonies in a glass vase, with a Miffy plush wearing headphones on a chair behind" },
  ];

  const world = document.getElementById("play-world");
  const lightbox = document.getElementById("play-lightbox");
  if (!world) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHover = window.matchMedia("(hover: hover)").matches;

  // Same scatter every visit
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // ---------- Build the pieces ----------
  const items = PIECES.map((p, i) => {
    const isVideo = /\.mp4$/i.test(p.src);
    const el = document.createElement("div");
    el.className = "play-item";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", p.alt);
    let media;
    if (isVideo) {
      media = document.createElement("video");
      media.muted = true;
      media.disablePictureInPicture = true;
      media.loop = true;
      media.autoplay = true;
      media.playsInline = true;
      media.preload = "auto";
      media.setAttribute("muted", "");
      media.setAttribute("playsinline", "");
    } else {
      media = document.createElement("img");
      media.alt = "";
      media.decoding = "async";
      media.draggable = false;
    }
    media.className = "play-media";
    media.src = "assets/play/" + p.src;
    el.appendChild(media);
    world.appendChild(el);
    return {
      el,
      media,
      piece: p,
      isVideo,
      // Layout jitter, fixed per piece: size, offset in its cell, tilt
      size: 0.56 + rand() * 0.22,
      jx: rand(),
      jy: rand(),
      tilt: (rand() * 2 - 1) * 3.5,
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      sx: 0,
      sy: 0,
      seen: false,
    };
  });
  // Heights come from the media once it knows its size
  items.forEach((it) => {
    const measure = () => (it.h = it.el.offsetHeight);
    it.media.addEventListener(it.isVideo ? "loadedmetadata" : "load", measure);
  });

  // ---------- Layout: a grid of cells, each piece scattered within its cell ----------
  let cols, rows, cellW, cellH, W, H;
  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    cols = vw < 700 ? 3 : 5;
    rows = Math.ceil(items.length / cols);
    // Cells must be big enough that the wrapped wall is wider and taller than
    // the screen, so a piece never shows up twice at once
    cellW = Math.max(vw < 700 ? 200 : 300, Math.ceil(vw / (cols - 1)) + 1);
    cellH = Math.max(cellW * 1.3, Math.ceil(vh / (rows - 1.6)) + 1);
    W = cols * cellW;
    H = rows * cellH;
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      it.w = Math.round(cellW * it.size);
      it.x = col * cellW + (cellW - it.w) * it.jx;
      // Every other column sits lower, so the wall reads as staggered
      it.y = row * cellH + (col % 2) * cellH * 0.38 + cellH * 0.12 * it.jy;
      it.el.style.width = it.w + "px";
      it.h = it.el.offsetHeight;
    });
  }

  // ---------- Panning ----------
  let px = 0;
  let py = 0;
  let vx = 0;
  let vy = 0;
  const wrap = (v, size, lead) => {
    let m = (((v + lead) % size) + size) % size;
    return m - lead;
  };
  function render() {
    for (const it of items) {
      const x = wrap(it.x + px, W, cellW);
      const y = wrap(it.y + py, H, cellH * 1.6);
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${it.tilt.toFixed(2)}deg)`;
      it.sx = x; // where it is on screen, for the fish-eye wall
      it.sy = y;
    }
  }

  let raf = null;
  function tick() {
    raf = null;
    if (!dragging && (Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05)) {
      px += vx;
      py += vy;
      vx *= 0.94;
      vy *= 0.94;
      schedule();
    }
    render();
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // Drag (mouse, pen, touch)
  let dragging = false;
  let captured = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  world.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = 0;
    vx = vy = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = performance.now();
    captured = false;
  });
  world.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    const now = performance.now();
    const dt = Math.max(8, now - lastT);
    px += dx;
    py += dy;
    moved += Math.abs(dx) + Math.abs(dy);
    // Only take over the pointer once it's really a drag, so a plain click
    // still reaches the piece underneath
    if (!captured && moved > 6) {
      captured = true;
      world.setPointerCapture(e.pointerId);
      world.classList.add("is-dragging");
    }
    // Fling speed, in px per frame (capped so a quick flick doesn't fly off)
    const MAX_FLING = 45;
    vx = Math.max(-MAX_FLING, Math.min(MAX_FLING, (dx / dt) * 16));
    vy = Math.max(-MAX_FLING, Math.min(MAX_FLING, (dy / dt) * 16));
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    schedule();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    world.classList.remove("is-dragging");
    if (performance.now() - lastT > 80 || reduceMotion) vx = vy = 0; // held still before letting go
    schedule();
    // A real drag shouldn't also open the piece under the pointer
    if (moved > 6) {
      const block = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", block, true), 0);
    }
  };
  world.addEventListener("pointerup", endDrag);
  world.addEventListener("pointercancel", endDrag);

  // Trackpad / wheel scrolling, both directions
  window.addEventListener(
    "wheel",
    (e) => {
      if (!lightbox.hidden) return;
      e.preventDefault();
      const scale = e.deltaMode === 1 ? 32 : 1; // lines → px
      px -= e.deltaX * scale;
      py -= e.deltaY * scale;
      vx = vy = 0;
      schedule();
    },
    { passive: false }
  );

  // Arrow keys pan too
  window.addEventListener("keydown", (e) => {
    if (!lightbox.hidden) return;
    const step = 120;
    const k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!k) return;
    e.preventDefault();
    vx = k[0] * 0.06;
    vy = k[1] * 0.06;
    schedule();
  });

  // ---------- Fish-eye wall (wall-lens.js) ----------
  // A full-screen canvas draws every piece through a lens that follows the
  // cursor. The real pieces stay in place, invisible, for clicks and keys.
  let wall = null;
  if (window.WallLens) {
    const canvas = document.createElement("canvas");
    canvas.className = "play-wall";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, world);
    wall = WallLens.create(canvas, items);
    if (wall) document.documentElement.classList.add("play-gl");
    else canvas.remove();
  }

  items.forEach((it) => {
    it.el.addEventListener("click", () => open(it));
    it.el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(it);
      }
    });
  });

  // ---------- Opening a piece ----------
  const lbMedia = lightbox.querySelector(".play-lightbox-media");
  const soundBtn = lightbox.querySelector(".play-sound");
  let opener = null;
  // [MUTE] / [SOUND ON] for an opened video
  function syncSound() {
    const v = lbMedia.querySelector("video");
    if (!v) return;
    soundBtn.textContent = v.muted ? "[Sound on]" : "[Mute]";
    soundBtn.setAttribute("aria-pressed", String(!v.muted));
  }
  soundBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const v = lbMedia.querySelector("video");
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.play().catch(() => {});
    syncSound();
  });
  function open(it) {
    // Opening a piece brings it into color, here and on the wall
    it.seen = true;
    it.el.classList.add("is-seen");
    if (wall) wall.setEnabled(false); // let the wall settle flat behind it
    opener = it.el;
    lbMedia.textContent = "";
    if (it.piece.back) {
      openCard(it);
      return;
    }
    const big = it.isVideo ? document.createElement("video") : document.createElement("img");
    if (it.isVideo) {
      // Opened videos play from the beginning, with sound (the click lets
      // the browser allow it)
      Object.assign(big, { loop: true, playsInline: true, muted: false, volume: 1 });
      big.setAttribute("playsinline", "");
    }
    big.src = it.media.currentSrc || it.media.src;
    if (it.isVideo) {
      // Start right away, inside the click, so the browser allows the sound
      const p = big.play();
      if (p && p.catch) {
        p.catch((err) => {
          // Sound blocked: play muted, and [SOUND ON] can turn it on
          if (err && err.name === "NotAllowedError") {
            big.muted = true;
            big.play().catch(() => {});
            syncSound();
          }
        });
      }
    }
    big.alt = it.piece.alt;
    if (it.isVideo) big.setAttribute("aria-label", it.piece.alt);
    lbMedia.appendChild(big);
    soundBtn.hidden = !it.isVideo || !!it.piece.silent; // silent: a converted GIF with no audio
    syncSound();
    lightbox.hidden = false;
    requestAnimationFrame(() => lightbox.classList.add("is-open"));
    lightbox.querySelector(".play-close").focus();
  }
  // Two-sided piece: a card that flips between its front and back
  function openCard(it) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = it.piece.rounded ? "play-card play-card--rounded" : "play-card";
    // The card takes the front image's shape
    const fw = it.media.naturalWidth || 4;
    const fh = it.media.naturalHeight || 3;
    card.style.setProperty("--ar", (fw / fh).toFixed(4));
    card.setAttribute("aria-pressed", "false");
    card.setAttribute("aria-label", it.piece.alt + ". Select to flip and see the other side.");
    const inner = document.createElement("span");
    inner.className = "play-card-inner";
    const front = document.createElement("img");
    front.className = "play-card-face";
    front.src = it.media.currentSrc || it.media.src;
    front.alt = "";
    const back = document.createElement("img");
    back.className = "play-card-face play-card-back";
    back.src = "assets/play/" + it.piece.back;
    back.alt = "";
    inner.append(front, back);
    card.appendChild(inner);
    // [FLIP OVER] takes the cursor's place over the card (mouse/trackpad)
    const label = document.createElement("span");
    label.className = "play-flip-cursor";
    label.setAttribute("aria-hidden", "true");
    label.textContent = "[Flip over]";
    card.appendChild(label);
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      label.style.setProperty("--mx", e.clientX - r.left + "px");
      label.style.setProperty("--my", e.clientY - r.top + "px");
    });
    const hint = document.createElement("p");
    hint.className = "play-flip-hint";
    hint.setAttribute("aria-hidden", "true");
    hint.textContent = "[Click to flip]";
    card.addEventListener("click", () => {
      const flipped = card.getAttribute("aria-pressed") !== "true";
      card.setAttribute("aria-pressed", String(flipped));
      card.setAttribute("aria-label", (flipped ? it.piece.backAlt : it.piece.alt) + ". Select to flip and see the other side.");
    });
    lbMedia.append(card, hint);
    soundBtn.hidden = true;
    lightbox.hidden = false;
    requestAnimationFrame(() => lightbox.classList.add("is-open"));
    card.focus();
  }

  function close() {
    if (lightbox.hidden) return;
    lightbox.classList.remove("is-open");
    const v = lbMedia.querySelector("video");
    if (v) v.pause(); // stop the sound right away
    if (wall) wall.setEnabled(true);
    setTimeout(() => {
      lightbox.hidden = true;
      lbMedia.textContent = "";
    }, reduceMotion ? 0 : 300);
    if (opener) opener.focus({ preventScroll: true });
  }
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target.closest(".play-close") || e.target === lbMedia) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // ---------- Start ----------
  // Begin centered on the wall, so there's something in every direction
  function centerStart() {
    px = -(W - window.innerWidth) / 2;
    py = -cellH * 0.3;
  }
  layout();
  centerStart();
  render();
  window.addEventListener("resize", () => {
    layout();
    render();
  });
  // Keep videos looping even if the browser paused autoplay
  items.forEach((it) => {
    if (it.isVideo) {
      const p = it.media.play();
      if (p && p.catch) p.catch(() => {});
    }
  });
})();
