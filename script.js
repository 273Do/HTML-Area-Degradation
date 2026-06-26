(function () {
  const PARAMS = {
    downscale: 0.5, // 0.01(超ガビガビ) 〜 1.0(原寸). ダウンスケール率
    jpegQuality: 0.1, // 0.01(最低画質) 〜 1.0(最高). JPEG圧縮品質
    loops: 3, // 1〜20. JPEG圧縮→展開を繰り返す回数
    rectBaseW: 200, // rectの基準幅(px)
    rectRatioVariance: 0.2, // 16:9からの比率ゆらぎ幅 (±)
    interval: 200, // rect生成間隔(ms)
    maxRects: 4, // 画面上に残す最大rect数
  };
  const DEFAULTS = { ...PARAMS };

  const pageEl = document.getElementById("page");
  const layer = document.getElementById("rect-layer");
  const cur = document.getElementById("cur");

  let W = window.innerWidth;
  let H = window.innerHeight;
  let mx = W / 2,
    my = H / 2;
  let moved = false;
  let isMoving = false;
  let moveStopTimer = null;
  let snapCanvas = null;
  let isCapturing = false;
  let intervalId = null;

  // --- スナップショット ---
  function captureScene() {
    if (isCapturing) return Promise.resolve();
    isCapturing = true;
    W = window.innerWidth;
    H = window.innerHeight;
    return html2canvas(pageEl, {
      backgroundColor: null,
      scale: 1,
      width: W,
      height: H,
      windowWidth: W,
      windowHeight: H,
      scrollX: 0,
      scrollY: 0,
      logging: false,
      useCORS: true,
    }).then((c) => {
      snapCanvas = c;
      isCapturing = false;
    });
  }

  // --- JPEG 劣化ループ ---
  function makeGlitchAsync(sx, sy, sw, sh) {
    return new Promise((resolve) => {
      if (!snapCanvas) {
        resolve(null);
        return;
      }

      const src = document.createElement("canvas");
      src.width = sw;
      src.height = sh;
      src.getContext("2d").drawImage(snapCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const dw = Math.max(2, Math.round(sw * PARAMS.downscale));
      const dh = Math.max(2, Math.round(sh * PARAMS.downscale));

      function runLoop(canvas, count) {
        if (count <= 0) {
          const out = document.createElement("canvas");
          out.width = sw;
          out.height = sh;
          const oc = out.getContext("2d");
          oc.imageSmoothingEnabled = false;
          oc.drawImage(canvas, 0, 0, dw, dh, 0, 0, sw, sh);
          resolve(out);
          return;
        }
        const small = document.createElement("canvas");
        small.width = dw;
        small.height = dh;
        const sc = small.getContext("2d");
        sc.imageSmoothingEnabled = false;
        sc.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, dw, dh);

        const url = small.toDataURL("image/jpeg", PARAMS.jpegQuality);
        const img = new Image();
        img.onload = () => {
          const dec = document.createElement("canvas");
          dec.width = dw;
          dec.height = dh;
          dec.getContext("2d").drawImage(img, 0, 0);
          runLoop(dec, count - 1);
        };
        img.src = url;
      }
      runLoop(src, PARAMS.loops);
    });
  }

  // --- Rect 生成 ---
  function spawnRect(cx, cy) {
    captureScene().then(() => {
      if (!snapCanvas) return;
      _spawnRect(cx, cy);
    });
  }

  function _spawnRect(cx, cy) {
    const baseW = PARAMS.rectBaseW + (Math.random() - 0.5) * 60;
    const variance = 1 + (Math.random() - 0.5) * PARAMS.rectRatioVariance * 2;
    const rw = Math.round(baseW);
    const rh = Math.round(baseW / ((16 / 9) * variance));
    const sx = Math.max(0, Math.min(W - rw, Math.round(cx - rw / 2)));
    const sy = Math.max(0, Math.min(H - rh, Math.round(cy - rh / 2)));

    makeGlitchAsync(sx, sy, rw, rh).then((gc) => {
      if (!gc) return;
      Object.assign(gc.style, {
        position: "absolute",
        left: sx + "px",
        top: sy + "px",
        width: rw + "px",
        height: rh + "px",
        imageRendering: "pixelated",
        display: "block",
      });
      layer.appendChild(gc);
      while (layer.children.length > PARAMS.maxRects) {
        layer.removeChild(layer.firstChild);
      }
      document.getElementById("stat-rects").textContent =
        "Rects: " + layer.children.length;

      setTimeout(() => {
        gc.remove();
        document.getElementById("stat-rects").textContent =
          "Rects: " + layer.children.length;
      }, 7000);
    });
  }

  // --- マウス ---
  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    cur.style.left = mx + "px";
    cur.style.top = my + "px";
    document.getElementById("stat-pos").textContent = "X: " + mx + "  Y: " + my;
    if (!moved) moved = true;
    isMoving = true;
    clearTimeout(moveStopTimer);
    moveStopTimer = setTimeout(() => {
      isMoving = false;
    }, 150);
  });

  // --- インターバル ---
  function startInterval() {
    clearInterval(intervalId);
    intervalId = setInterval(() => {
      if (isMoving) spawnRect(mx, my);
    }, PARAMS.interval);
  }
  startInterval();

  // --- コントロール配線 ---
  function wire(ctrlId, lblId, dispId, key, parse, fmt) {
    const el = document.getElementById(ctrlId);
    const lbl = document.getElementById(lblId);
    const disp = dispId ? document.getElementById(dispId) : null;
    el.addEventListener("input", () => {
      PARAMS[key] = parse(el.value);
      const text = fmt ? fmt(PARAMS[key]) : String(PARAMS[key]);
      lbl.textContent = text;
      if (disp) disp.textContent = text;
      if (key === "interval") startInterval();
    });
  }

  wire("ctrl-ds", "lbl-ds", "disp-ds", "downscale", parseFloat, (v) =>
    v.toFixed(2),
  );
  wire("ctrl-q", "lbl-q", "disp-q", "jpegQuality", parseFloat, (v) =>
    v.toFixed(2),
  );
  wire("ctrl-loops", "lbl-loops", "disp-loops", "loops", parseInt, null);
  wire("ctrl-w", "lbl-w", null, "rectBaseW", parseInt, null);
  wire("ctrl-max", "lbl-max", null, "maxRects", parseInt, null);
  wire("ctrl-iv", "lbl-iv", null, "interval", parseInt, null);

  document.getElementById("btn-reset").addEventListener("click", () => {
    Object.assign(PARAMS, DEFAULTS);
    [
      ["ctrl-ds", "lbl-ds", "disp-ds", DEFAULTS.downscale.toFixed(2)],
      ["ctrl-q", "lbl-q", "disp-q", DEFAULTS.jpegQuality.toFixed(2)],
      ["ctrl-loops", "lbl-loops", "disp-loops", String(DEFAULTS.loops)],
      ["ctrl-w", "lbl-w", null, String(DEFAULTS.rectBaseW)],
      ["ctrl-max", "lbl-max", null, String(DEFAULTS.maxRects)],
      ["ctrl-iv", "lbl-iv", null, String(DEFAULTS.interval)],
    ].forEach(([cid, lid, did, v]) => {
      document.getElementById(cid).value = v;
      document.getElementById(lid).textContent = v;
      if (did) document.getElementById(did).textContent = v;
    });
    startInterval();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    while (layer.firstChild) layer.removeChild(layer.firstChild);
    document.getElementById("stat-rects").textContent = "Rects: 0";
  });

  // --- 時計 ---
  function updateClock() {
    const d = new Date();
    document.getElementById("clock").textContent =
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0");
  }
  updateClock();
  setInterval(updateClock, 10000);
})();
