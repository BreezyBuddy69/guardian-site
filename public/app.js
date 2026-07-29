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

// ── Hero dither ──────────────────────────────────────────────────────────
// Animated, mouse-reactive ordered-dither FLOWERS replacing the static hero
// glow. Plain WebGL (no library) — a full-screen triangle + fragment shader
// drawing rose-curve petal shapes (signed-distance-ish, not a noise field),
// quantized through a hardcoded 4x4 Bayer matrix so the petal edges read as
// a proper dithered/halftone silhouette. Two flowers drift ambiently, a
// third tracks the cursor. Degrades gracefully: if WebGL isn't available the
// static .hero-glow CSS gradient stays visible (untouched), and
// prefers-reduced-motion hides the canvas via CSS.
(function initHeroDither() {
  const canvas = document.getElementById("ditherCanvas");
  const heroEl = canvas && canvas.closest(".hero");
  if (!canvas || !heroEl) return;
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

    // Rounded rose-curve petal silhouette: soft 0..1 mask, 1 deep inside the
    // flower, smooth falloff to 0 at the petal edge. "petals" controls lobe
    // count, "rot" spins it, "wob" softly breathes the size (never a static
    // drawing). The 0.82 floor keeps a small round core so it never pinches
    // to a bare point between petals.
    float flower(vec2 p, vec2 center, float radius, float petals, float rot, float wob) {
      vec2 q = p - center;
      float d = length(q);
      float a = atan(q.y, q.x);
      float lobe = pow(max(cos(petals * (a - rot)), 0.0), 0.55);
      float shapeR = radius * wob * (0.4 + 0.6 * lobe);
      return 1.0 - smoothstep(shapeR * 0.8, shapeR, d);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;    // 0..1, y=1 at the top
      vec2 p = gl_FragCoord.xy / u_resolution.y;       // aspect-normalized
      float aspect = u_resolution.x / u_resolution.y;
      vec2 mp = u_mouse / u_resolution.y;

      float t = u_time;
      float wob = 1.0;

      // Two ambient flowers drifting slowly on either side, one flower that
      // follows the cursor (the "interactive" one) — never dead-centered
      // behind the headline.
      float f1 = flower(p, vec2(aspect * 0.14, 0.78) + 0.04 * vec2(sin(t * 0.17), cos(t * 0.13)),
                         0.30, 6.0, t * 0.22, 0.94 + 0.06 * sin(t * 0.6));
      float f2 = flower(p, vec2(aspect * 0.88, 0.62) + 0.05 * vec2(cos(t * 0.15), sin(t * 0.11)),
                         0.36, 5.0, -t * 0.18, 0.94 + 0.06 * sin(t * 0.5 + 1.7));
      float f3 = flower(p, mp, 0.22, 7.0, t * 0.7, 1.0);

      float mask = max(max(f1, f2), f3);

      // Gentle inner shimmer so petals aren't flat-filled, just textured.
      float shimmer = 0.8 + 0.2 * sin(p.x * 6.0 + t) * sin(p.y * 6.0 - t * 0.8);
      float n = mask * shimmer;

      // Top-weighted falloff so this reads as a hero glow, not a solid block.
      float vfade = pow(clamp(uv.y, 0.0, 1.0), 0.55);

      float on = step(bayer4x4(gl_FragCoord.xy), n);
      float alpha = on * vfade * 0.42;
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
  gl.uniform3f(u_color, 217 / 255, 119 / 255, 87 / 255); // --accent #D97757

  let mouseX = 0, mouseY = 0, haveMouse = false;
  let running = document.visibilityState === "visible";

  function resize() {
    const rect = heroEl.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // dot pattern reads fine below native DPR — keeps GPU cost down
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  heroEl.addEventListener("pointermove", (e) => {
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
    // the hero — ambient motion instead of a dead spot mid-canvas.
    const mx = haveMouse ? mouseX : canvas.width * (0.5 + 0.15 * Math.sin(t * 0.3));
    const my = haveMouse ? mouseY : canvas.height * (0.6 + 0.1 * Math.cos(t * 0.25));
    gl.uniform2f(u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u_time, t);
    gl.uniform2f(u_mouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  requestAnimationFrame(frame);

  heroEl.classList.add("has-dither");
})();
