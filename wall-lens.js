// Fish-eye wall: draws every piece of the Play gallery into one full-screen
// WebGL canvas, then bends the whole picture through a big round lens
// centered on the cursor, so pieces near the cursor swell and their edges
// curve, like looking through a magnifying glass. Used by play.js.
//
//   const lens = WallLens.create(canvas, items);  // null if WebGL isn't available
//   items: [{ media, sx, sy, w, h, tilt, seen }]  // play.js keeps these up to date
//   lens.setEnabled(true | false);                // e.g. off while a piece is open
//
// The real pieces stay in the page (invisible) for clicking and keyboard use;
// this canvas only draws them, and never catches the pointer.
(function () {
  const STRENGTH = 0.3; // how much the middle of the lens magnifies (0 = flat)
  const RADIUS = 0.62; // lens size, as a share of the larger screen side
  const FOLLOW = 0.14; // how quickly the lens glides after the cursor (0–1)
  const COLOR_FADE = 0.06; // how quickly an opened piece fades into color

  const SCENE_VERT = `
    attribute vec2 aPos;
    uniform vec2 uCenter;
    uniform vec2 uSize;
    uniform float uAngle;
    uniform vec2 uView;
    varying vec2 vUv;
    void main() {
      vec2 p = aPos * uSize;
      float c = cos(uAngle);
      float s = sin(uAngle);
      p = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + uCenter;
      vec2 clip = p / uView * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      vUv = aPos + 0.5;
    }`;

  const SCENE_FRAG = `
    precision mediump float;
    uniform sampler2D uTex;
    uniform float uGray;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(uTex, vUv);
      float g = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      gl_FragColor = vec4(mix(c.rgb, vec3(g), uGray), 1.0);
    }`;

  const POST_VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos + 0.5;
      gl_Position = vec4(aPos * 2.0, 0.0, 1.0);
    }`;

  const POST_FRAG = `
    precision mediump float;
    uniform sampler2D uScene;
    uniform vec2 uView;
    uniform vec2 uMouse;
    uniform float uRadius;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uView;
      vec2 d = p - uMouse;
      float r = length(d) / uRadius;
      vec2 src = p;
      if (r < 1.0) {
        // Pull samples toward the cursor: magnified there, easing back to
        // normal at the lens edge, which bends straight edges into curves
        float k = 1.0 - uStrength * pow(1.0 - r * r, 2.0);
        src = uMouse + d * k;
      }
      gl_FragColor = texture2D(uScene, vec2(src.x / uView.x, 1.0 - src.y / uView.y));
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function texture(gl) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // Page background as 0–1 RGB, for clearing the canvas
  function pageColor() {
    const m = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [255, 255, 255];
    return [m[0] / 255, m[1] / 255, m[2] / 255];
  }

  function create(canvas, items) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true });
    if (!gl) return null;
    let scene, post;
    try {
      scene = program(gl, SCENE_VERT, SCENE_FRAG);
      post = program(gl, POST_VERT, POST_FRAG);
    } catch (e) {
      return null;
    }

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    const bindQuad = (prog) => {
      const a = gl.getAttribLocation(prog, "aPos");
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    };
    const S = (n) => gl.getUniformLocation(scene, n);
    const P = (n) => gl.getUniformLocation(post, n);
    const su = { center: S("uCenter"), size: S("uSize"), angle: S("uAngle"), view: S("uView"), gray: S("uGray"), tex: S("uTex") };
    const pu = { scene: P("uScene"), view: P("uView"), mouse: P("uMouse"), radius: P("uRadius"), strength: P("uStrength") };

    // The flat wall is drawn into this texture first, then bent on screen
    const sceneTex = texture(gl);
    const fbo = gl.createFramebuffer();

    // One texture per piece, uploaded once for images, every frame for videos
    items.forEach((it) => {
      it.tex = texture(gl);
      it.loaded = false;
      it.gray = it.seen ? 0 : 1;
      const m = it.media;
      const upload = () => {
        gl.bindTexture(gl.TEXTURE_2D, it.tex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, m);
          it.loaded = true;
        } catch (e) {}
      };
      it.upload = upload;
      if (m.tagName === "VIDEO") return;
      if (m.complete && m.naturalWidth) upload();
      else m.addEventListener("load", upload, { once: true });
    });

    let w = 0;
    let h = 0;
    let dpr = 1;
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(window.innerWidth * dpr);
      const ch = Math.round(window.innerHeight * dpr);
      if (cw === w && ch === h) return;
      w = canvas.width = cw;
      h = canvas.height = ch;
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Lens position and strength, easing toward the cursor
    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let tx = mx;
    let ty = my;
    let strength = 0;
    let target = 0;
    let enabled = true;
    let inside = false;

    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      tx = e.clientX;
      ty = e.clientY;
      if (!inside) {
        // Start the lens right where the cursor came in
        mx = tx;
        my = ty;
      }
      inside = true;
    });
    document.documentElement.addEventListener("mouseleave", () => (inside = false));
    window.addEventListener("blur", () => (inside = false));

    const bg = pageColor();

    function frame() {
      requestAnimationFrame(frame);
      if (document.hidden) return;
      resize();

      mx += (tx - mx) * FOLLOW;
      my += (ty - my) * FOLLOW;
      target = enabled && inside ? STRENGTH : 0;
      strength += (target - strength) * 0.08;

      // 1. The flat wall, into the scene texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(scene);
      bindQuad(scene);
      gl.uniform2f(su.view, w, h);
      gl.uniform1i(su.tex, 0);
      gl.activeTexture(gl.TEXTURE0);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (const it of items) {
        // Skip pieces well off screen
        if (it.sx > vw + 40 || it.sy > vh + 40 || it.sx + it.w < -40 || it.sy + it.h < -40) continue;
        if (it.media.tagName === "VIDEO" && it.media.readyState >= 2) it.upload();
        if (!it.loaded) continue;
        it.gray += ((it.seen ? 0 : 1) - it.gray) * COLOR_FADE;
        gl.bindTexture(gl.TEXTURE_2D, it.tex);
        gl.uniform2f(su.center, (it.sx + it.w / 2) * dpr, (it.sy + it.h / 2) * dpr);
        gl.uniform2f(su.size, it.w * dpr, it.h * dpr);
        gl.uniform1f(su.angle, (it.tilt * Math.PI) / 180);
        gl.uniform1f(su.gray, it.gray);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      // 2. Bend it through the lens, onto the screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.useProgram(post);
      bindQuad(post);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(pu.scene, 0);
      gl.uniform2f(pu.view, w, h);
      gl.uniform2f(pu.mouse, mx * dpr, my * dpr);
      gl.uniform1f(pu.radius, Math.max(w, h) * RADIUS);
      gl.uniform1f(pu.strength, strength);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    resize();
    requestAnimationFrame(frame);

    return {
      setEnabled(on) {
        enabled = on;
      },
    };
  }

  window.WallLens = { create };
})();
