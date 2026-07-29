const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.15 },
);

document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ── Ink dither ───────────────────────────────────────────────────────────
// Animated, mouse-reactive dithered ink/smoke cloud replacing the static
// section glows (the "viral dithering effect" look — domain-warped fractal
// noise standing in for the AI-generated smoke plate + video pass, since
// this is plain WebGL with zero external assets/services). A full-screen
// triangle + fragment shader: fbm noise warped through itself (Quilez's
// classic "warp" pattern) for a convincing ink-in-water look, quantized
// through a hardcoded 4x4 Bayer matrix for the dithered/halftone edge, with
// a swirl that follows the cursor. Degrades gracefully: if WebGL isn't
// available the static glow CSS gradients stay visible (untouched), and
// prefers-reduced-motion skips the canvases entirely.
//
// Reused on both the hero (needs a clear zone behind the centered copy) and
// the download section (its card is already a solid-ish surface, so no
// clear zone needed — u_clearStrength just goes to 0 there).
function createInkDither(canvasId, { clearStrength = 1.0 } = {}) {
  const canvas = document.getElementById(canvasId);
  const containerEl = canvas && canvas.parentElement;
  if (!canvas || !containerEl) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
  if (!gl) return;

  const vsSource = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;
  const fsSource = `
    precision mediump float;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform vec3 u_color;
    uniform float u_clearStrength;

    // 4x4 Bayer threshold matrix, hardcoded as an if-ladder — WebGL1/GLSL ES
    // 1.00 disallows dynamic array indexing by a non-constant int reliably
    // across devices, an if-chain on 16 values works everywhere.
    float bayer4x4(vec2 p) {
      int x = int(mod(p.x, 4.0));
      int y = int(mod(p.y, 4.0));
      int idx = x + y * 4;
      if (idx == 0) return 0.0 / 16.0;
      if (idx == 1) return 8.0 / 16.0;
      if (idx == 2) return 2.0 / 16.0;
      if (idx == 3) return 10.0 / 16.0;
      if (idx == 4) return 12.0 / 16.0;
      if (idx == 5) return 4.0 / 16.0;
      if (idx == 6) return 14.0 / 16.0;
      if (idx == 7) return 6.0 / 16.0;
      if (idx == 8) return 3.0 / 16.0;
      if (idx == 9) return 11.0 / 16.0;
      if (idx == 10) return 1.0 / 16.0;
      if (idx == 11) return 9.0 / 16.0;
      if (idx == 12) return 15.0 / 16.0;
      if (idx == 13) return 7.0 / 16.0;
      if (idx == 14) return 13.0 / 16.0;
      return 5.0 / 16.0; // idx == 15
    }

    // Value noise + fbm (fractal Brownian motion) — the standard cheap
    // texture-free stand-in for Perlin noise in a portable GLSL1 shader.
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, amp = 0.5;
      for (int i = 0; i < 5; i++) {
        v += amp * noise(p);
        p *= 2.02;
        amp *= 0.5;
      }
      return v;
    }
    // Domain-warped fbm (Quilez's "warp" pattern): feeding fbm's own output
    // back in as a coordinate offset is what turns generic noise into
    // convincing ink-in-water / smoke — without it you just get clouds.
    float ink(vec2 p, float t) {
      vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t * 0.05), fbm(p + vec2(5.2, 1.3) - t * 0.04));
      vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.035),
                     fbm(p + 4.0 * q + vec2(8.3, 2.8) - t * 0.025));
      return fbm(p + 4.0 * r);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;    // 0..1, y=1 at the top
      vec2 p = gl_FragCoord.xy / u_resolution.y;       // aspect-normalized
      float aspect = u_resolution.x / u_resolution.y;
      vec2 mp = u_mouse / u_resolution.y;

      // Cursor swirl: rotate sample points around the mouse, falling off
      // with distance — the ink visibly stirs where you move the pointer,
      // instead of just a brightness ripple.
      vec2 toMouse = p - mp;
      float distM = length(toMouse);
      float swirl = exp(-distM * 1.4) * 2.2;
      float s = sin(swirl), c = cos(swirl);
      vec2 warped = mat2(c, -s, s, c) * toMouse + mp;

      float v = ink(warped * 1.6 + vec2(2.0, 0.0), u_time);
      v = smoothstep(0.32, 0.72, v); // punch up contrast so it reads as a bold blob, not a haze

      // Mild top-weighted falloff — present but gentle, this is meant to
      // fill most of the hero the way the reference does, not fade to a
      // thin band.
      float vfade = pow(clamp(uv.y, 0.0, 1.0), 0.28);

      // Soft elliptical "clear zone" behind the centered headline/copy
      // column: the reference keeps its ink blob off to the side of the
      // text, not under it. Bold at the edges, backed way off in the
      // middle — never a hard cutout, just enough to keep the copy legible.
      // u_clearStrength lets a caller with its own opaque card (download
      // section) skip this entirely instead of tuning a second ellipse.
      vec2 dd = (uv - vec2(0.5, 0.5));
      dd.x /= 0.34;
      dd.y /= 0.56;
      float clearMask = smoothstep(0.6, 1.15, length(dd));
      float centerAtten = mix(1.0, mix(0.1, 1.0, clearMask), u_clearStrength);

      float on = step(bayer4x4(gl_FragCoord.xy), v);
      float alpha = on * vfade * centerAtten * 0.88;
      gl_FragColor = vec4(u_color, alpha);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[dither]", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[dither]", gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  // One big triangle covering the whole clip space — cheaper than a quad,
  // the standard full-screen-shader trick (no need for two triangles/indices).
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const u_resolution = gl.getUniformLocation(program, "u_resolution");
  const u_time = gl.getUniformLocation(program, "u_time");
  const u_mouse = gl.getUniformLocation(program, "u_mouse");
  const u_color = gl.getUniformLocation(program, "u_color");
  const u_clearStrength = gl.getUniformLocation(program, "u_clearStrength");
  gl.uniform3f(u_color, 108 / 255, 92 / 255, 196 / 255); // rich violet — the reference's "ink" color, distinct from the orange UI accent
  gl.uniform1f(u_clearStrength, clearStrength);

  let mouseX = 0, mouseY = 0, haveMouse = false;
  let running = document.visibilityState === "visible";

  function resize() {
    const rect = containerEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // dot pattern reads fine below native DPR — keeps GPU cost down
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  containerEl.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    mouseX = (e.clientX - rect.left) * dpr;
    mouseY = (rect.height - (e.clientY - rect.top)) * dpr; // flip: DOM y grows down, gl_FragCoord.y grows up
    haveMouse = true;
  });

  document.addEventListener("visibilitychange", () => {
    running = document.visibilityState === "visible";
  });

  const start = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) return;
    const t = (now - start) / 1000;
    // Gentle idle drift for the ripple center before the cursor ever enters
    // the section — ambient motion instead of a dead spot mid-canvas.
    const mx = haveMouse ? mouseX : canvas.width * (0.5 + 0.15 * Math.sin(t * 0.3));
    const my = haveMouse ? mouseY : canvas.height * (0.6 + 0.1 * Math.cos(t * 0.25));
    gl.uniform2f(u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u_time, t);
    gl.uniform2f(u_mouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);

  containerEl.classList.add("has-dither");
}

createInkDither("ditherCanvas", { clearStrength: 1.0 });
createInkDither("downloadDitherCanvas", { clearStrength: 0.0 });
