  /* ================= 地图：图片 → 矢量 =================
     两件事：
     ① 板块图：把图片按明暗分成「有内容 / 空白」，再沿着边界走一圈，
        得到每个色块的闭合轮廓（简化后就是一块块可以关联地点的区域）。
     ② 模拟图：把图片量化成一格一格的色块，横向合并同色格子，
        输出成 <rect> 组成的 SVG —— 这就是一份真正的矢量图（不含位图）。 */

  // 图片 → ImageData（按最长边缩放，避免大图算太久）
  function imageToImageData(img, maxSide) {
    const iw = img.naturalWidth || img.width || 0;
    const ih = img.naturalHeight || img.height || 0;
    if (!iw || !ih) return null;
    const k = Math.min(1, (maxSide || 260) / Math.max(iw, ih));
    const w = Math.max(2, Math.round(iw * k));
    const h = Math.max(2, Math.round(ih * k));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    try {
      return { data: ctx.getImageData(0, 0, w, h), w, h, iw, ih };
    } catch (e) {
      // file:// 下同源图片不会触发，保险起见还是兜一下
      return null;
    }
  }

  function readImageFile(file, maxSide) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("读取图片失败"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("这张图片打不开"));
        img.onload = () => {
          const out = imageToImageData(img, maxSide);
          if (!out) reject(new Error("这张图片读不出像素"));
          else resolve(out);
        };
        img.src = String(fr.result || "");
      };
      fr.readAsDataURL(file);
    });
  }

  // Otsu：按灰度直方图自动找「内容 / 空白」的分界
  function otsuThreshold(gray) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) {
        best = between;
        thr = t;
      }
    }
    return thr;
  }

  // 兼容两种传法：真 ImageData（width/height）和 imageToImageData 包出来的一层（w/h）
  function vecSize(img) {
    const w = (img && (img.width || img.w)) || 0;
    const h = (img && (img.height || img.h)) || 0;
    let data = (img && img.data) || null;
    // 再拆一层：img.data 可能本身就是个 ImageData（像素在 img.data.data 里）
    if (data && data.data) {
      return { w: w || data.width || 0, h: h || data.height || 0, data: data.data };
    }
    return { w, h, data };
  }

  // 灰度数组（0-255）
  function grayOf(img) {
    const { w, h, data: d } = vecSize(img);
    const n = w * h;
    const g = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      g[i] = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
    }
    return g;
  }

  // RDP：折线简化（让曲线不要那么多点）
  function simplifyPolygon(pts, eps) {
    if (!pts || pts.length < 4) return (pts || []).slice();
    const keep = new Array(pts.length).fill(false);
    keep[0] = keep[pts.length - 1] = true;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const seg = stack.pop();
      const a = seg[0];
      const b = seg[1];
      if (b - a < 2) continue;
      const ax = pts[a][0];
      const ay = pts[a][1];
      const bx = pts[b][0];
      const by = pts[b][1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      let far = -1;
      let farD = -1;
      for (let i = a + 1; i < b; i++) {
        const px = pts[i][0] - ax;
        const py = pts[i][1] - ay;
        const dist = Math.abs(px * dy - py * dx) / len;
        if (dist > farD) {
          farD = dist;
          far = i;
        }
      }
      if (farD > eps) {
        keep[far] = true;
        stack.push([a, far], [far, b]);
      }
    }
    return pts.filter((p, i) => keep[i]);
  }

  /* 找出所有「有内容」色块的闭合轮廓（沿像素棱走一圈，外圈和洞都会得到）。
     返回 [{ pts:[[x,y]…], area }]，坐标是缩放后的像素坐标。
     做法：把「内容像素与空白像素之间的那条棱」全部收集起来（每条棱带方向，
     内容永远在同一边），再顺着棱首尾相接走成一圈 —— 比 Moore 邻域追踪好写好验证。 */
  function traceInkContours(imageData, minArea) {
    const { w, h } = vecSize(imageData);
    const gray = grayOf(imageData);
    const thr = otsuThreshold(gray);
    // 直方图那个 t 只是「两类分得最开」的位置，落在哪一侧要看两类的均值：
    // 拿两类的均值中点当真正的分界，纯黑白图也不会全被算成背景
    let sumLow = 0;
    let nLow = 0;
    let sumHigh = 0;
    let nHigh = 0;
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] <= thr) {
        sumLow += gray[i];
        nLow++;
      } else {
        sumHigh += gray[i];
        nHigh++;
      }
    }
    const cut = nLow && nHigh ? (sumLow / nLow + sumHigh / nHigh) / 2 : thr;
    let inkCount = 0;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] < cut) {
        mask[i] = 1;
        inkCount++;
      }
    }
    // 全是内容 / 全空：这张图分不出板块
    if (!inkCount || inkCount > w * h * 0.985) return [];
    const ink = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
    // 边界棱：起点（网格角 x,y）→ 终点。绕行方向固定，内容一直在同一侧。
    const edges = new Map();
    const addEdge = (x1, y1, x2, y2) => {
      const k = x1 + "," + y1;
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push([x2, y2]);
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!ink(x, y)) continue;
        if (!ink(x, y - 1)) addEdge(x, y, x + 1, y); // 上边：向右
        if (!ink(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1); // 右边：向下
        if (!ink(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1); // 下边：向左
        if (!ink(x - 1, y)) addEdge(x, y + 1, x, y); // 左边：向上
      }
    }
    const loops = [];
    const guardMax = w * h * 4 + 64;
    edges.forEach((outs, startKey) => {
      const sp = startKey.split(",");
      const sx = Number(sp[0]);
      const sy = Number(sp[1]);
      while (outs.length) {
        let cx = sx;
        let cy = sy;
        const loop = [];
        let guard = 0;
        while (guard++ < guardMax) {
          const list = edges.get(cx + "," + cy);
          if (!list || !list.length) break;
          const nxt = list.shift();
          loop.push([cx, cy]);
          cx = nxt[0];
          cy = nxt[1];
          if (cx === sx && cy === sy && loop.length > 2) break;
        }
        if (loop.length >= 4) loops.push(loop);
      }
    });
    const areaOf = (pts2) => {
      let a = 0;
      for (let i = 0; i < pts2.length; i++) {
        const p1 = pts2[i];
        const p2 = pts2[(i + 1) % pts2.length];
        a += p1[0] * p2[1] - p2[0] * p1[1];
      }
      return Math.abs(a / 2);
    };
    const out = [];
    loops.forEach((pts2) => {
      const area = areaOf(pts2);
      if (area < (minArea || 16)) return;
      out.push({ pts: pts2, area: Math.round(area) });
    });
    // 大的排前面：前端只画前 N 块
    out.sort((a, b) => b.area - a.area);
    return out;
  }

  /* 板块图：图片 → 一组板块区域。
     pts 归一化到 0..1（相对图片本身），渲染时再乘画布尺寸。 */
  function imageToBoardRegions(imageData, maxRegions) {
    const { w, h } = vecSize(imageData);
    const minArea = Math.max(24, Math.round(w * h * 0.0016));
    const contours = traceInkContours(imageData, minArea).slice(0, maxRegions || 36);
    const out = [];
    contours.forEach((c) => {
      const simp = simplifyPolygon(c.pts, Math.max(1, Math.max(w, h) / 320));
      if (simp.length < 3) return;
      // 丢掉几乎贴着整张边界的框（一般都是图片本身的外框）
      const xs = simp.map((p) => p[0]);
      const ys = simp.map((p) => p[1]);
      const bw = Math.max(...xs) - Math.min(...xs);
      const bh = Math.max(...ys) - Math.min(...ys);
      if (bw > w * 0.97 && bh > h * 0.97) return;
      out.push({
        pts: simp.map((p) => [Number((p[0] / w).toFixed(5)), Number((p[1] / h).toFixed(5))]),
        area: c.area / (w * h),
      });
    });
    return out;
  }

  /* 模拟图：图片 → 马赛克矢量（横向合并同色连续格子）。
     返回 { w, h, rects:[{x,y,w,h,color}], cols, rows }，坐标是格子单位。 */
  function imageToMosaic(imageData, cols) {
    const { w: iw, h: ih, data: d } = vecSize(imageData);
    const c = Math.max(24, Math.min(cols || 128, iw));
    const r = Math.max(2, Math.round((ih / iw) * c));
    const cell = (gx, gy) => {
      const x0 = Math.min(iw - 1, Math.floor((gx * iw) / c));
      const y0 = Math.min(ih - 1, Math.floor((gy * ih) / r));
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * iw) / c));
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * ih) / r));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * iw + x) * 4;
          sr += d[p];
          sg += d[p + 1];
          sb += d[p + 2];
          n++;
        }
      }
      n = n || 1;
      // 量化到 5 位色（每通道 32 级），同色格子才能并成一条
      const q = (v) => Math.round(v / n / 8) * 8;
      return "#" + [q(sr), q(sg), q(sb)].map((v) => Math.min(255, v).toString(16).padStart(2, "0")).join("");
    };
    const rects = [];
    for (let gy = 0; gy < r; gy++) {
      let runColor = null;
      let runStart = 0;
      for (let gx = 0; gx <= c; gx++) {
        const color = gx < c ? cell(gx, gy) : null;
        if (color !== runColor) {
          if (runColor && gx > runStart) rects.push({ x: runStart, y: gy, w: gx - runStart, h: 1, color: runColor });
          runColor = color;
          runStart = gx;
        }
      }
    }
    return { w: c, h: r, rects, cols: c, rows: r };
  }

  /* 归一化多边形 → 平滑闭合路径（Catmull-Rom 转三次贝塞尔） */
  /* 一串点 → 平滑的**开**曲线（手绘过程里的预览：不闭合） */
  function smoothOpenPath(pts) {
    const p = (pts || []).filter((q) => q && Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (p.length < 2) return "";
    if (p.length === 2) return `M ${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)} L ${p[1][0].toFixed(2)} ${p[1][1].toFixed(2)}`;
    let d = `M ${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2] || p[i + 1];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d;
  }

  function smoothClosedPath(pts, W, H) {
    const n = pts.length;
    if (n < 3) return "";
    const p = pts.map(([x, y]) => [x * W, y * H]);
    let d = `M ${p[0][0].toFixed(2)} ${p[0][1].toFixed(2)}`;
    for (let i = 0; i < n; i++) {
      const p0 = p[(i - 1 + n) % n];
      const p1 = p[i];
      const p2 = p[(i + 1) % n];
      const p3 = p[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
    }
    return d + " Z";
  }

  // 折线（自由手绘）→ 归一化点集：只做轻去重 + 轻简化（别磨掉手绘的细节，
  // 平滑得太狠会看不出用户画的是什么）
  function normalizeHandDrawn(points, W, H) {
    const raw = (points || [])
      .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .map(([x, y]) => [x / W, y / H]);
    if (raw.length < 3) return [];
    // 相邻太近的点去掉（手绘会有一大堆）
    const dedup = [raw[0]];
    raw.forEach((p) => {
      const last = dedup[dedup.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.0022) dedup.push(p);
    });
    if (dedup.length < 3) return [];
    const simp = simplifyPolygon(dedup, 0.0016);
    return simp.length >= 3 ? simp : dedup;
  }
