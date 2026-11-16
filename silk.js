// Silk: a looping, softly lit animation for the Play tile, drawn live in
// WebGL. Smoky grey folds drift and churn while thin streaks of light run
// down them, like light through moving water, matching the Play image.
//
//   const silk = Silk.create(canvas);  // null if WebGL isn't available
//   Silk.create(canvas, { subtle: true }) // a slow, faint version that sits
//                                         // close to the tile color behind it
//   Silk.create(canvas, { subtle: true, variant: 1 }) // the same look from a
//                       // different patch of the pattern, a touch cooler and
//                       // slower, so two subtle tiles never move in step
//
// It loops seamlessly every LOOP_SECONDS (the noise travels in a circle, so
// the last frame meets the first), pauses while off screen, and holds still
// for people who prefer reduced motion.
(function () {
  const LOOP_SECONDS = 12; // one full loop
  const RESOLUTION = 0.75; // render scale (the look is soft, so it can be lower than the screen)

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  const FRAG = `
    precision highp float;
    uniform float uPhase;   // 0..2π over one loop
    uniform float uAspect;
    uniform float uSubtle;  // 0 = full look, 1 = faint and close to uBg
    uniform vec3 uBg;       // the tile color the subtle version blends into
    uniform vec2 uSeed;     // where in the pattern this tile starts
    uniform vec3 uTint;     // the subtle version's color cast
    uniform float uCentered; // 1 = keep the subtle version at the tile's own grey
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p = p * 2.03 + vec2(1.7, 9.2);
        a *= 0.5;
      }
      return v;
    }
    // Fewer octaves: soft, blurry folds without smoky fine detail
    float soft(vec2 p) {
      float v = 0.0;
      float a = 0.55;
      for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p = p * 2.01 + vec2(3.1, 7.7);
        a *= 0.45;
      }
      return v;
    }
    // Moving in a circle through the noise makes the animation loop exactly
    vec2 orbit(float r, float k) {
      return vec2(cos(uPhase + k), sin(uPhase + k)) * r;
    }

    // Thin vertical streaks of light: ridges of a noise field that is
    // squeezed horizontally and stretched tall
    float streaks(vec2 p, float shift) {
      vec2 q = vec2(p.x * 6.0 + shift, p.y * 0.35);
      // A slow, smooth sway (not jagged), so streaks bend like light in water
      q.x += soft(p * vec2(0.8, 0.5) + orbit(0.6, 1.0)) * 1.6;
      float n = noise(q + orbit(0.9, 2.0));
      float ridge = 1.0 - abs(n * 2.0 - 1.0);
      // A thin bright core with a soft glow around it
      return pow(ridge, 26.0) + pow(ridge, 7.0) * 0.12;
    }

    void main() {
      vec2 p = vec2(vUv.x * uAspect, vUv.y) * 2.8 + uSeed;

      // Soft folds: domain-warped noise, stretched a little taller than wide
      vec2 sp = p * vec2(1.25, 0.75);
      vec2 w = vec2(soft(sp + orbit(0.7, 0.0)), soft(sp + vec2(5.2, 1.3) + orbit(0.7, 1.7)));
      float h = soft(sp + 1.6 * w + orbit(0.4, 3.1));

      // Light the folds as a surface, so they read as 3D
      float e = 0.02;
      float hx = soft(sp + vec2(e, 0.0) + 1.6 * w + orbit(0.4, 3.1)) - h;
      float hy = soft(sp + vec2(0.0, e) + 1.6 * w + orbit(0.4, 3.1)) - h;
      vec3 n = normalize(vec3(-hx * 14.0, -hy * 14.0, 1.0));
      float light = clamp(dot(n, normalize(vec3(-0.3, 0.6, 0.75))), 0.0, 1.0);

      float base = mix(0.2, 0.62, smoothstep(0.3, 0.68, h));
      base *= 0.9 + 0.18 * light;

      // Streaks come and go in patches, with a faint color fringe
      float patch = smoothstep(0.32, 0.6, fbm(p * 0.8 + orbit(0.5, 4.2)));
      vec3 glint = vec3(
        streaks(p, 0.0),
        streaks(p, 0.008),
        streaks(p, 0.016)
      ) * patch * 1.15;

      vec3 color = vec3(base) * vec3(1.0, 0.985, 0.96) + glint;

      // A gentle vignette and a touch of grain, like the photo
      vec2 c = vUv - 0.5;
      color *= 1.0 - dot(c, c) * 0.35;
      color += (hash(vUv * 900.0 + uPhase) - 0.5) * 0.025;

      // Subtle: almost no light streaks, and only a hint of the folds over
      // the tile color
      vec3 subtle = mix(uBg, vec3(base) * uTint + glint * 0.12, 0.2);
      // Variant 1 (the Teams Q&A card) keeps its folds close to the tile
      // color instead of pulling it darker, with only soft highlights
      vec3 centered = uBg + (vec3(base) * uTint - 0.5) * 0.16 + glint * 0.01;
      subtle = mix(subtle, centered, uCentered);
      color = mix(color, subtle, uSubtle);

      gl_FragColor = vec4(color, 1.0);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function create(canvas, options) {
    const subtle = !!(options && options.subtle);
    const variant = (options && options.variant) || 0;
    const loopSeconds = subtle ? (variant ? 38 : 30) : LOOP_SECONDS;
    // preserveDrawingBuffer lets the ripple read each frame as a texture
    const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    } catch (e) {
      return null;
    }
    gl.useProgram(program);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const uPhase = gl.getUniformLocation(program, "uPhase");
    const uAspect = gl.getUniformLocation(program, "uAspect");
    const uSubtle = gl.getUniformLocation(program, "uSubtle");
    const uBg = gl.getUniformLocation(program, "uBg");
    gl.uniform1f(uSubtle, subtle ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(program, "uSeed"), variant ? 7.3 : 0, variant ? 2.9 : 0);
    gl.uniform1f(gl.getUniformLocation(program, "uCentered"), variant ? 1 : 0);
    if (variant) gl.uniform3f(gl.getUniformLocation(program, "uTint"), 0.97, 0.985, 1.0);
    else gl.uniform3f(gl.getUniformLocation(program, "uTint"), 1.0, 0.985, 0.96);

    // The subtle version takes its tile color from the page, and follows
    // the theme (light or dark) when it changes
    function readBg() {
      const m = getComputedStyle(canvas.parentElement).backgroundColor.match(/[\d.]+/g);
      if (!m) return;
      gl.uniform3f(uBg, m[0] / 255, m[1] / 255, m[2] / 255);
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let frame = null;
    const start = performance.now();

    function resize() {
      const w = Math.max(1, Math.round(canvas.clientWidth * RESOLUTION));
      const h = Math.max(1, Math.round(canvas.clientHeight * RESOLUTION));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform1f(uAspect, w / h);
    }

    function draw(now) {
      const phase = reduceMotion ? 0.8 : (((now - start) / 1000) % loopSeconds) / loopSeconds * Math.PI * 2;
      gl.uniform1f(uPhase, phase);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop(now) {
      frame = null;
      draw(now);
      if (visible && !reduceMotion) frame = requestAnimationFrame(loop);
    }

    // Only animate while the tile is on screen
    new IntersectionObserver((entries) => {
      visible = entries.some((e) => e.isIntersecting);
      if (visible && !frame) frame = requestAnimationFrame(loop);
    }).observe(canvas);

    window.addEventListener("resize", () => {
      resize();
      draw(performance.now());
    });
    if (subtle) {
      readBg();
      new MutationObserver(() => {
        // Wait for the theme's color transition to finish
        setTimeout(() => {
          readBg();
          draw(performance.now());
        }, 450);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
    resize();
    draw(performance.now());

    return { canvas };
  }

  window.Silk = { create };
})();
