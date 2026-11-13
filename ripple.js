// Water ripple: draws an image or video into a canvas through a rippling
// water surface. Used by the Play tile on the homepage and the Play gallery.
//
//   const ripple = Ripple.create(canvas);   // null if WebGL isn't available
//   ripple.setSource(imgVideoOrCanvas);     // what to draw (fills the canvas, like object-fit: cover)
//   ripple.resize();                        // after the canvas changes size
//   ripple.drop(x, y, strength);            // x, y from 0 to 1, top-left origin
//   ripple.reset();                         // flatten the water
//
// The waves are a small height map simulated on the CPU (cheap at ~128 cells
// across) and uploaded as a texture; the shader bends the image by the
// slope of the water and adds a soft highlight. It only animates while there
// are waves (or a video playing), so it sleeps when calm.
(function () {
  const GRID = 128; // wave cells across; more = finer ripples
  const DAMPING = 0.975; // how quickly waves die out (closer to 1 = longer)
  const REFRACTION = 0.035; // how strongly the water bends the image
  const HIGHLIGHT = 0.28; // brightness of the light catching the ripples

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  const FRAG = `
    precision mediump float;
    uniform sampler2D uImage;
    uniform sampler2D uHeight;
    uniform vec2 uTexel;
    uniform vec2 uScale;
    uniform vec2 uOffset;
    uniform float uAmount;
    uniform float uHighlight;
    varying vec2 vUv;
    void main() {
      float hx = texture2D(uHeight, vUv + vec2(uTexel.x, 0.0)).r - texture2D(uHeight, vUv - vec2(uTexel.x, 0.0)).r;
      float hy = texture2D(uHeight, vUv + vec2(0.0, uTexel.y)).r - texture2D(uHeight, vUv - vec2(0.0, uTexel.y)).r;
      vec2 bend = vec2(hx, hy) * uAmount;
      vec2 uv = clamp((vUv + bend) * uScale + uOffset, 0.0, 1.0);
      vec4 color = texture2D(uImage, uv);
      float light = max(0.0, -(hx + hy)) * 4.0;
      color.rgb += pow(light, 1.4) * uHighlight;
      gl_FragColor = color;
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
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

  function create(canvas) {
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
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
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name) => gl.getUniformLocation(program, name);
    const uni = {
      image: u("uImage"),
      height: u("uHeight"),
      texel: u("uTexel"),
      scale: u("uScale"),
      offset: u("uOffset"),
      amount: u("uAmount"),
      highlight: u("uHighlight"),
    };
    gl.uniform1i(uni.image, 0);
    gl.uniform1i(uni.height, 1);
    gl.uniform1f(uni.amount, REFRACTION);
    gl.uniform1f(uni.highlight, HIGHLIGHT);
    // Images are stored top row first; flip so the top of the picture is on top
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const imageTex = texture(gl);
    const heightTex = texture(gl);

    let gw = GRID;
    let gh = GRID;
    let cur, prev, bytes;
    let source = null;
    let sourceReady = false;
    let frame = null;
    let energy = 0;

    function grid() {
      const aspect = canvas.height / Math.max(1, canvas.width);
      gw = GRID;
      gh = Math.max(24, Math.round(GRID * aspect));
      cur = new Float32Array(gw * gh);
      prev = new Float32Array(gw * gh);
      bytes = new Uint8Array(gw * gh);
      gl.uniform2f(uni.texel, 1 / gw, 1 / gh);
      energy = 0;
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h || !cur) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        grid();
        cover();
      }
      draw();
    }

    // object-fit: cover, so the picture fills the canvas without stretching
    function cover() {
      if (!source) return;
      const mw = source.videoWidth || source.naturalWidth || source.width || 1;
      const mh = source.videoHeight || source.naturalHeight || source.height || 1;
      const ca = canvas.width / canvas.height;
      const ma = mw / mh;
      let sx = 1;
      let sy = 1;
      if (ma > ca) sx = ca / ma;
      else sy = ma / ca;
      gl.uniform2f(uni.scale, sx, sy);
      gl.uniform2f(uni.offset, (1 - sx) / 2, (1 - sy) / 2);
    }

    function isVideo() {
      return source && source.tagName === "VIDEO";
    }

    // Videos and canvases change every frame, so they are re-uploaded each frame
    function isLive() {
      return source && (source.tagName === "VIDEO" || source.tagName === "CANVAS");
    }

    function uploadSource() {
      if (!source) return false;
      if (source.tagName === "CANVAS") {
        if (!source.width) return false;
      } else if (isVideo() ? source.readyState < 2 : !(source.complete && source.naturalWidth)) return false;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, imageTex);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } catch (e) {
        return false;
      }
      return true;
    }

    function setSource(el) {
      source = el;
      sourceReady = false;
      const ready = () => {
        if (source !== el) return;
        sourceReady = uploadSource();
        cover();
        draw();
      };
      if (el.tagName === "CANVAS") ready();
      else if (isVideo()) {
        if (el.readyState >= 2) ready();
        else el.addEventListener("loadeddata", ready, { once: true });
      } else if (el.complete && el.naturalWidth) ready();
      else el.addEventListener("load", ready, { once: true });
      reset();
    }

    function step() {
      energy = 0;
      for (let y = 1; y < gh - 1; y++) {
        for (let x = 1; x < gw - 1; x++) {
          const i = y * gw + x;
          const v = ((cur[i - 1] + cur[i + 1] + cur[i - gw] + cur[i + gw]) * 0.5 - prev[i]) * DAMPING;
          prev[i] = v;
          energy += v < 0 ? -v : v;
        }
      }
      const t = cur;
      cur = prev;
      prev = t;
    }

    function draw() {
      if (!cur) return;
      for (let i = 0; i < cur.length; i++) {
        const v = 128 + cur[i] * 90;
        bytes[i] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, heightTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gw, gh, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
      if (isLive()) sourceReady = uploadSource() || sourceReady;
      if (!sourceReady) return;
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function loop() {
      step();
      draw();
      // Keep going while there are waves, or while a live source needs frames
      const busy = energy > 0.02 * gw || (isLive() && !source.paused && keepAlive);
      frame = busy ? requestAnimationFrame(loop) : null;
      if (!busy) {
        reset(false);
        draw();
        if (api.onIdle) api.onIdle();
      }
    }

    function wake() {
      if (!frame) frame = requestAnimationFrame(loop);
    }

    // While true, a video source keeps redrawing even when the water is calm
    let keepAlive = false;

    function drop(x, y, strength) {
      if (!cur) return;
      const cx = Math.round(x * (gw - 1));
      const cy = Math.round(y * (gh - 1));
      const r = 3;
      const s = strength == null ? 1 : strength;
      for (let j = -r; j <= r; j++) {
        for (let i = -r; i <= r; i++) {
          const px = cx + i;
          const py = cy + j;
          if (px < 1 || py < 1 || px >= gw - 1 || py >= gh - 1) continue;
          const d = Math.sqrt(i * i + j * j) / r;
          if (d > 1) continue;
          cur[py * gw + px] -= s * 0.5 * (1 + Math.cos(Math.PI * d));
        }
      }
      wake();
    }

    function reset(redraw) {
      if (cur) {
        cur.fill(0);
        prev.fill(0);
      }
      energy = 0;
      if (redraw !== false) draw();
    }

    const api = {
      onIdle: null, // called when the water has settled
      canvas,
      setSource,
      resize,
      drop,
      reset,
      setKeepAlive(on) {
        keepAlive = on;
        if (on) wake();
      },
    };
    return api;
  }

  window.Ripple = { create };
})();
