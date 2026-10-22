  /* ================= 地图（设定档案 → 地点） =================
     两种地图：
     · 板块图 board：一圈闭合曲线围出一个区域，一个区域最多关联一个地点卡。
       可以手绘，也可以导入图片自动认出一块块区域。
     · 模拟图 vector：导入图片转成矢量图，在上面放地点图标（一个图标对一个地点卡）。
     数据都存在 state.maps 里，跟着项目一起导出 / 回退。 */

  const MAP_VB_W = 1000; // 板块图画布宽（高按地图比例算）
  let selectedMapId = "";
  let mapDrawMode = false;
  let mapTool = "pencil"; // 绘制状态下的工具：pencil / eraser
  let mapDrawBackup = null; // 进入绘制前的一份 regions，Esc 时还原
  let mapDrawPts = null;
  let mapDraftAspect = MAP_VB_W / 700;
  let mapStageSig = "";
  // 模拟图上的地点图标：默认不许拖，双击它 / 右键「拖动」之后才进入可拖状态
  let mapIconArmedId = "";
  let mapIconClickTimer = null;
  let mapIconSuppressClick = false; // 拖完那一下 click 不要当成「打开地点卡」
  // 地图上的「坐标 / 比例尺」：同样默认不许拖，双击 / 长按 / 右键「拖动」之后才进入可拖状态
  let mapGizmoArmed = ""; // "" | "coord" | "scale"
  let mapGizmoSuppressClick = false;

  function armMapIcon(id, on) {
    const next = on === false ? "" : id || "";
    if (mapIconArmedId === next) return;
    mapIconArmedId = next;
    mapStageSig = "";
    renderMapStage();
  }

  function disarmMapIcon() {
    if (!mapIconArmedId) return;
    armMapIcon("", false);
  }

  /* 地图按自己的比例完整显示（preserveAspectRatio="xMidYMid meet"）：拖边栏时跟着缩放，
     比例不变，也不会裁掉内容；画布上多出来的部分是底板色。
     地图上的文字 / 图标不用 SVG 画，改成盖在上面的 HTML 图层（.map-overlay），
     它的位置和大小＝地图内容那一块（不含留白），这样字号永远是屏幕像素，也不会被拉变形。 */
  function syncMapOverlay(canvas, vb) {
    const fit = canvas.querySelector(".map-fit");
    const svg = canvas.querySelector(".map-svg");
    const ov = canvas.querySelector(".map-overlay");
    if (!svg || !ov || !fit) return;
    const cr = canvas.getBoundingClientRect();
    const sr = svg.getBoundingClientRect();
    if (!sr.width || !sr.height) return;
    const scale = Math.min(sr.width / vb.w, sr.height / vb.h);
    const cw = vb.w * scale;
    const ch = vb.h * scale;
    // 地图内容那一块＝不含上下 / 左右留白的那部分：底板（.map-fit）和 HTML 图层都摆在这上面
    // 界面缩放（html 上的 zoom）会把 getBoundingClientRect 的坐标放大：
    // 内联的 px 还要除回这个比例，否则底板 / 图层会比 SVG 里真正画出来的地图大一圈，
    // 鼠标落点和看到的图就对不上了（拖边栏时最明显）。
    const z = uiZoomScale(canvas) || 1;
    const box = {
      left: ((sr.width - cw) / 2 / z).toFixed(2) + "px",
      top: ((sr.height - ch) / 2 / z).toFixed(2) + "px",
      width: (cw / z).toFixed(2) + "px",
      height: (ch / z).toFixed(2) + "px",
    };
    [fit, ov].forEach((el) => {
      el.style.left = box.left;
      el.style.top = box.top;
      el.style.width = box.width;
      el.style.height = box.height;
    });
  }

  // 鼠标位置 → 画布内比例（0..1，相对「地图内容」那一块，不是整个画布）
  function mapPctOf(canvas, ev) {
    const ov = canvas.querySelector(".map-overlay");
    const r = ov ? ov.getBoundingClientRect() : canvas.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [0.5, 0.5];
    return [
      Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)),
    ];
  }

  // 「算搭在边缘上」的容差：屏幕上大概 8px 换算成 0..1 的比例
  function mapEdgeTol(canvas) {
    const ov = canvas && canvas.querySelector ? canvas.querySelector(".map-overlay") : null;
    const r = ov ? ov.getBoundingClientRect() : null;
    const px = r && r.width ? r.width : 360;
    return 8 / Math.max(40, px);
  }

  /* 手绘过程中的预览：只是一条「平滑的开曲线」——
     闭合、连接断点这些是松手以后才自动做的，画的时候不提前画出来。
     超出画布的部分照样保留：画布本身会裁着显示（SVG 上就有 clip），
     而「地图边缘」在识别时算作封闭曲线的一段，所以画到外面去的形状也能围出区域。 */
  function draftPreviewPath(rawPts, vb, canvas) {
    if (!rawPts || rawPts.length < 2) return "";
    const unit = normalizeHandDrawn(rawPts, vb.w, vb.h);
    if (unit.length < 2) return "";
    return smoothOpenPath(unit.map((p) => [p[0] * vb.w, p[1] * vb.h]));
  }

  /* 松手：这一笔收进数据 —— 只压薄（去重 + 轻简化）。
     不做平滑收尾、不自动连成封闭曲线（不自动闭合）；
     画到画布外面的点也留着（识别时地图边缘会当边界用），只是别留得太离谱。 */
  function handStrokeOf(rawPts, vb) {
    const unit = normalizeHandDrawn(rawPts || [], vb.w, vb.h);
    if (unit.length < 2) return [];
    const clamp = (v) => Math.max(-0.25, Math.min(1.25, v));
    return unit.map(([x, y]) => [Number(clamp(x).toFixed(5)), Number(clamp(y).toFixed(5))]);
  }

  // 点到线段的最近点（weldStrokeGaps 用）
  /* 多边形 → 直接连线的闭合路径。
     识别出来的轮廓本来就够密（一个像素一个点），再套一层平滑曲线只会把用户笔迹的细节磨掉、
     还可能向外鼓出去，所以这里不用平滑。 */
  function polygonPath(pts, W, H) {
    const p = (pts || []).filter((q) => q && Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (p.length < 3) return "";
    let d = `M ${(p[0][0] * W).toFixed(2)} ${(p[0][1] * H).toFixed(2)}`;
    for (let i = 1; i < p.length; i++) d += ` L ${(p[i][0] * W).toFixed(2)} ${(p[i][1] * H).toFixed(2)}`;
    return d + " Z";
  }

  function closestOnSegment(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (!len2) return [a[0], a[1]];
    let u = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    u = Math.max(0, Math.min(1, u));
    return [a[0] + dx * u, a[1] + dy * u];
  }

  // 线段 [a,b] 落在圆（圆心 c，半径 r）里的参数区间 [t0,t1]；完全不相交就返回 null
  function segCircleSpan(a, b, c, r) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const fx = a[0] - c[0];
    const fy = a[1] - c[1];
    const A = dx * dx + dy * dy;
    if (A < 1e-12) return null;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    let t0 = (-B - sq) / (2 * A);
    let t1 = (-B + sq) / (2 * A);
    if (t1 < 0 || t0 > 1) return null;
    t0 = Math.max(0, t0);
    t1 = Math.min(1, t1);
    return t0 <= t1 ? [t0, t1] : null;
  }

  /* 橡皮擦一条线：只把「经过的那一段」切掉，不是擦掉整条线。
     返回剩下的几段（可能 0 段＝整条都被划掉了）；一点没碰到就返回 null。 */
  function cutStrokeByBrush(pts, at, rad) {
    const p = (pts || []).filter((q) => q && Number.isFinite(q[0]) && Number.isFinite(q[1]));
    if (p.length < 2) return null;
    const inside = (q) => Math.hypot(q[0] - at[0], q[1] - at[1]) <= rad;
    const pieces = [];
    let cur = [];
    let hit = false;
    const flush = () => {
      if (cur.length >= 2) pieces.push(cur);
      cur = [];
    };
    if (inside(p[0])) hit = true;
    else cur.push(p[0]);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1];
      const b = p[i];
      const span = segCircleSpan(a, b, at, rad);
      if (!span) {
        if (!cur.length) cur.push(a);
        cur.push(b);
        continue;
      }
      hit = true;
      const cutIn = [a[0] + (b[0] - a[0]) * span[0], a[1] + (b[1] - a[1]) * span[0]];
      const cutOut = [a[0] + (b[0] - a[0]) * span[1], a[1] + (b[1] - a[1]) * span[1]];
      if (span[0] > 0.002) {
        if (!cur.length) cur.push(a);
        cur.push(cutIn);
      }
      flush();
      if (span[1] < 0.998) cur = [cutOut];
    }
    flush();
    return hit ? pieces : null;
  }

  // 橡皮的笔头半径（单位：0..1 的地图比例）；屏幕上大概 9px
  function mapBrushUnit(canvas) {
    const ov = canvas && canvas.querySelector ? canvas.querySelector(".map-overlay") : null;
    const r = ov ? ov.getBoundingClientRect() : null;
    return r && r.width ? 9 / Math.max(60, r.width) : 0.02;
  }

  /* 「完成 / Enter」时把断口接起来（只在识别封闭区域时用，不改用户画的那几笔本身）：
     ① 端点离画布边缘近 → 贴到边缘上（画布边缘本身相当于封闭曲线的一段）；
     ② 一笔自己的首尾快接上 → 直接当成闭合；
     ③ 两个端点离得近、端点离别的线的中段近 → 补一小段线把它们接起来。
     容差按地图短边算，放宽一点：手绘总差那么一点点，不该因为几像素的缝就认不出封闭区域。 */
  function weldStrokeGaps(strokes, vb, tolScale) {
    const list = (strokes || [])
      .filter((p) => p && p.length >= 2)
      .map((p) => p.map((q) => [q[0], q[1]]));
    if (!list.length) return list;
    const minSide = Math.max(1, Math.min(vb.w, vb.h));
    const t = minSide * (tolScale == null ? 0.05 : tolScale);
    const tx = t / vb.w;
    const ty = t / vb.h;
    const gap = (a, b) => Math.hypot((a[0] - b[0]) / tx, (a[1] - b[1]) / ty);
    const snapEdge = (p) => {
      const q = [p[0], p[1]];
      if (p[0] <= tx) q[0] = 0;
      else if (p[0] >= 1 - tx) q[0] = 1;
      if (p[1] <= ty) q[1] = 0;
      else if (p[1] >= 1 - ty) q[1] = 1;
      return q;
    };
    const welded = list.map((p) => {
      const q = p.map((pt, i) => (i === 0 || i === p.length - 1 ? snapEdge(pt) : pt));
      if (q.length > 2 && gap(q[0], q[q.length - 1]) <= 1) q.push([q[0][0], q[0][1]]);
      return q;
    });
    const ends = [];
    welded.forEach((p, si) => {
      ends.push({ s: si, head: true, p: p[0] });
      ends.push({ s: si, head: false, p: p[p.length - 1] });
    });
    const extra = [];
    ends.forEach((ea) => {
      let best = null;
      ends.forEach((eb) => {
        if (eb.s === ea.s) return; // 自己那一笔：首尾要不要闭，② 里已经按容差判断过
        const d = gap(ea.p, eb.p);
        if (d <= 1 && (!best || d < best.d)) best = { d, to: eb.p };
      });
      welded.forEach((p, si) => {
        for (let k = 0; k < p.length - 1; k++) {
          if (si === ea.s) continue; // 不接到自己那一笔上
          const cp = closestOnSegment(ea.p, p[k], p[k + 1]);
          const d = gap(ea.p, cp);
          if (d <= 1 && (!best || d < best.d)) best = { d, to: cp };
        }
      });
      if (best) extra.push([ea.p, best.to]);
    });
    return welded.concat(extra);
  }

  // 鼠标位置 → viewBox 单位（板块图手绘用）
  function mapUnitOf(canvas, vb, ev) {
    const ov = canvas.querySelector(".map-overlay");
    const r = ov ? ov.getBoundingClientRect() : canvas.getBoundingClientRect();
    if (!r || !r.width || !r.height) return [vb.w / 2, vb.h / 2];
    return [((ev.clientX - r.left) / r.width) * vb.w, ((ev.clientY - r.top) / r.height) * vb.h];
  }

  /* 把多边形裁到「地图范围」这个矩形里（Sutherland–Hodgman）：
     画到界外的部分自动切掉，剩下的一圈自然还是封闭曲线。
     w / h 是矩形尺寸，坐标系随便（像素或 0..1 都行）。 */
  // 折线裁到矩形里（逐段 Liang–Barsky），返回裁完后最长的那一段
  function clipPolylineToRect(points, w, h) {
    const seg = (a, b) => {
      let t0 = 0;
      let t1 = 1;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const clip = (p, q) => {
        if (Math.abs(p) < 1e-12) return q >= 0;
        const r = q / p;
        if (p < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
        return true;
      };
      if (!clip(-dx, a[0]) || !clip(dx, w - a[0]) || !clip(-dy, a[1]) || !clip(dy, h - a[1])) return null;
      return [
        [a[0] + t0 * dx, a[1] + t0 * dy],
        [a[0] + t1 * dx, a[1] + t1 * dy],
      ];
    };
    const out = [];
    let cur = [];
    for (let i = 0; i + 1 < points.length; i++) {
      const c = seg(points[i], points[i + 1]);
      if (!c) {
        if (cur.length > 1) out.push(cur);
        cur = [];
        continue;
      }
      if (!cur.length) cur.push(c[0]);
      else {
        const last = cur[cur.length - 1];
        const gap = (c[0][0] - last[0]) * (c[0][0] - last[0]) + (c[0][1] - last[1]) * (c[0][1] - last[1]);
        if (gap > 1e-12) {
          if (cur.length > 1) out.push(cur);
          cur = [c[0]];
        }
      }
      cur.push(c[1]);
    }
    if (cur.length > 1) out.push(cur);
    out.sort((a, b) => Math.abs(polyArea(b)) - Math.abs(polyArea(a)));
    return out[0] || [];
  }

  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      a += p1[0] * p2[1] - p2[0] * p1[1];
    }
    return a / 2;
  }

  // 矩形边界上的参数化（顺时针：上 → 右 → 下 → 左），用来让笔迹沿画布边缘接回起点
  function rectParam(p, w, h) {
    const eps = 1e-6;
    if (Math.abs(p[1]) < eps) return Math.max(0, Math.min(w, p[0]));
    if (Math.abs(p[0] - w) < eps) return w + Math.max(0, Math.min(h, p[1]));
    if (Math.abs(p[1] - h) < eps) return w + h + (w - Math.max(0, Math.min(w, p[0])));
    return 2 * w + h + (h - Math.max(0, Math.min(h, p[1])));
  }

  function rectPointAt(t, w, h) {
    const P = 2 * (w + h);
    let s = ((t % P) + P) % P;
    if (s <= w) return [s, 0];
    s -= w;
    if (s <= h) return [w, s];
    s -= h;
    if (s <= w) return [w - s, h];
    s -= w;
    return [0, h - s];
  }

  // 沿矩形边界从 tFrom 正向走到 tTo，途中经过的角点（不含两端）
  function boundaryArc(tFrom, tTo, w, h) {
    const P = 2 * (w + h);
    const span = (((tTo - tFrom) % P) + P) % P;
    const corners = [0, w, w + h, 2 * w + h];
    return corners
      .map((c) => (((c - tFrom) % P) + P) % P)
      .filter((d) => d > 1e-9 && d < span - 1e-9)
      .sort((a, b) => a - b)
      .map((d) => rectPointAt(tFrom + d, w, h));
  }

  /* 手绘收尾：把笔迹裁到画布范围内，再让两端沿画布边缘接回去形成封闭区域。
     画布边缘本身相当于封闭曲线 —— 比如只画一条弧线、两端搭在边缘上，也能成一块区域。 */
  function closeDrawnRegion(stroke, w, h, tol) {
    const pts = (stroke || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (pts.length < 3) return [];
    const piece = clipPolylineToRect(pts, w, h);
    if (piece.length < 3) return [];
    // 端点离边缘很近（手不可能点得刚刚好）就当搭在边缘上，先吸过去
    const near = Math.max(1e-6, Number(tol) || 0);
    const snap = (p) => {
      if (Math.abs(p[0]) <= near) return [0, p[1]];
      if (Math.abs(p[0] - w) <= near) return [w, p[1]];
      if (Math.abs(p[1]) <= near) return [p[0], 0];
      if (Math.abs(p[1] - h) <= near) return [p[0], h];
      return p;
    };
    const a = snap(piece[0]);
    const b = snap(piece[piece.length - 1]);
    piece[0] = a;
    piece[piece.length - 1] = b;
    const eps = 1e-6;
    const onEdge = (p) =>
      Math.abs(p[0]) < eps || Math.abs(p[0] - w) < eps || Math.abs(p[1]) < eps || Math.abs(p[1] - h) < eps;
    if (!onEdge(a) || !onEdge(b)) return piece; // 整条都在画布里面画成了一圈
    const tA = rectParam(a, w, h);
    const tB = rectParam(b, w, h);
    // 从末点沿边缘走回起点：两个方向都试，取围起来更小的那个（就是用户想圈的那块）
    const cand1 = piece.concat(boundaryArc(tB, tA, w, h));
    const cand2 = piece.concat(boundaryArc(tA, tB, w, h).reverse());
    return Math.abs(polyArea(cand1)) <= Math.abs(polyArea(cand2)) ? cand1 : cand2;
  }

  function clipPolyToRect(points, w, h) {
    const src = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [];
    if (src.length < 3) return [];
    const side = (p, i) => (i === 0 ? p[0] >= 0 : i === 1 ? p[0] <= w : i === 2 ? p[1] >= 0 : p[1] <= h);
    const cut = (a, b, i) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      if (i === 0) return [0, a[1] + (dy * (0 - a[0])) / dx];
      if (i === 1) return [w, a[1] + (dy * (w - a[0])) / dx];
      if (i === 2) return [a[0] + (dx * (0 - a[1])) / dy, 0];
      return [a[0] + (dx * (h - a[1])) / dy, h];
    };
    let poly = src.slice();
    for (let i = 0; i < 4; i++) {
      const out = [];
      for (let j = 0; j < poly.length; j++) {
        const cur = poly[j];
        const prev = poly[(j - 1 + poly.length) % poly.length];
        const curIn = side(cur, i);
        const prevIn = side(prev, i);
        if (curIn) {
          if (!prevIn) {
            const dx = cur[0] - prev[0];
            const dy = cur[1] - prev[1];
            const ok = i < 2 ? Math.abs(dx) > 1e-9 : Math.abs(dy) > 1e-9;
            if (ok) out.push(cut(prev, cur, i));
          }
          out.push(cur);
        } else if (prevIn) {
          const dx = cur[0] - prev[0];
          const dy = cur[1] - prev[1];
          const ok = i < 2 ? Math.abs(dx) > 1e-9 : Math.abs(dy) > 1e-9;
          if (ok) out.push(cut(prev, cur, i));
        }
      }
      poly = out;
      if (poly.length < 3) return [];
    }
    return poly;
  }

  // 画布内容的「指纹」：一样就不用重画
  function mapStageSignature(m) {
    if (!m) return "";
    const parts = [m.id, m.kind, mapDrawMode ? 1 : 0, m.aspect || 0];
    (m.regions || []).forEach((r) => {
      parts.push(
        [r.id, r.placeId || "", mapPlaceLabel(r.placeId), r.color || "", (r.pts || []).length, (r.pts || [])[0] && (r.pts || [])[0].join(",")].join("~")
      );
    });
    (m.icons || []).forEach((ic) =>
      parts.push([ic.id, ic.placeId || "", mapPlaceLabel(ic.placeId), ic.color || "", ic.x, ic.y, ic.tone || ""].join("~"))
    );
    (m.strokes || []).forEach((s) => parts.push([s.id, (s.pts || []).length, (s.pts || [])[0] && (s.pts || [])[0].join(",")].join("~")));
    const gc = mapCoordOf(m);
    parts.push(
      ["coord", gc.mode, gc.x, gc.y, gc.nx, gc.ny, gc.nz, gc.color || "", gc.tone || "", gc.size || 1, mapGizmoArmed === "coord" ? 1 : 0].join("~")
    );
    const gs = mapScalebarOf(m);
    parts.push(["scale", gs.mode, gs.x, gs.y, gs.text, gs.color || "", gs.tone || "", gs.align || "", gs.size || 0, mapGizmoArmed === "scale" ? 1 : 0].join("~"));
    if (m.vector) parts.push((m.vector.rects || []).length + "x" + m.vector.cols + "x" + m.vector.rows);
    if (m.image) parts.push("img" + String(m.image).length + (m.image || "").slice(-24));
    return parts.join("|");
  }

  function maps() {
    if (!Array.isArray(state.maps)) state.maps = [];
    return state.maps;
  }

  function selectedMap() {
    const list = maps();
    if (!list.length) return null;
    let m = list.find((x) => x.id === selectedMapId);
    if (!m) {
      m = list[0];
      selectedMapId = m.id;
    }
    return m;
  }

  function mapCategory() {
    return (state.settings.categories || []).find((c) => catKind(c) === "place") || null;
  }

  function placeEntries() {
    const cat = mapCategory();
    if (!cat) return [];
    return (state.settings.entries || []).filter((e) => e.categoryId === cat.id);
  }

  function getEntrySafe(id) {
    return (state.settings.entries || []).find((e) => e.id === id) || null;
  }

  // 名字 → 地点条目：先全等、再包含（都用折叠异体字后的写法比）
  function resolvePlaceIdByName(name) {
    const q = foldVariant(String(name == null ? "" : name).trim().toLowerCase());
    if (!q) return "";
    const list = placeEntries();
    const keys = (e) =>
      (typeof entryNamesFor === "function" ? entryNamesFor(e) : [e.name])
        .map((n) => foldVariant(String(n == null ? "" : n).trim().toLowerCase()))
        .filter(Boolean);
    let hit = list.find((e) => keys(e).indexOf(q) >= 0);
    if (!hit) hit = list.find((e) => keys(e).some((k) => k.indexOf(q) >= 0 || q.indexOf(k) >= 0));
    return hit ? hit.id : "";
  }

  /* 地点卡被删掉 / 合并掉之后，地图上指向它的引用要一起清掉 */
  function pruneMapRefs() {
    const list = maps();
    if (!list.length) return false;
    const alive = new Set((state.settings.entries || []).map((e) => e.id));
    let changed = false;
    list.forEach((m) => {
      (m.regions || []).forEach((r) => {
        if (r.placeId && !alive.has(r.placeId)) {
          r.placeId = "";
          changed = true;
        }
      });
      const icons = (m.icons || []).filter((ic) => ic.placeId && alive.has(ic.placeId));
      if (icons.length !== (m.icons || []).length) {
        m.icons = icons;
        changed = true;
      }
    });
    if (changed) saveState();
    return changed;
  }

  function mapColorAt(i) {
    return CAT_COLORS[i % CAT_COLORS.length];
  }

  function mapPlaceLabel(id) {
    const en = getEntrySafe(id);
    return en ? String(en.name || "") : "";
  }

  /* ---------- 面板 ---------- */

  function renderMapPanel() {
    const pane = $("#map-pane");
    if (!pane) return;
    const cat = getCat(selectedCategoryId);
    const show = !!(cat && catKind(cat) === "place");
    pane.hidden = !show;
    const handle = $("#pane-handle-map");
    if (handle) handle.hidden = !show;
    // 折叠状态：左栏收起来时只留那条拖拽条
    if (show && typeof applyPaneState === "function") applyPaneState();
    if (!show) {
      mapDrawMode = false;
      mapDrawPts = null;
      return;
    }
    pruneMapRefs();
    renderMapRail();
    renderMapStage();
  }

  /* 复制一张地图：区域 / 图标 / 坐标 / 比例尺 / 底图整体克隆一份，名字加「副本」 */
  function copyMap(m) {
    const src = maps().find((x) => x.id === (m && m.id)) || m;
    if (!src) return;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid();
    copy.name = uiSentence("mapCopyName", src.name);
    copy.createdAt = Date.now();
    pendingUndoLabel = uiSentence("mapCopyUndo", src.name);
    state.maps = maps().concat([copy]);
    selectedMapId = copy.id;
    mapDrawMode = false;
    saveState();
    renderMapRail();
    renderMapStage();
    showToast(uiSentence("mapCopyUndo", src.name));
  }

  // 删除一张地图（先问一句，可撤销）
  async function deleteMap(m) {
    const cur = maps().find((x) => x.id === (m && m.id));
    if (!cur) return;
    if (!(await uiConfirm(uiSentence("mapDeleteConfirm", cur.name)))) return;
    pendingUndoLabel = uiSentence("mapDeleteUndo", cur.name);
    state.maps = maps().filter((x) => x.id !== cur.id);
    if (selectedMapId === cur.id) selectedMapId = maps()[0] ? maps()[0].id : "";
    mapDrawMode = false;
    saveState();
    renderMapRail();
    renderMapStage();
  }

  function renderMapRail() {
    const list = $("#map-list");
    if (!list) return;
    const all = maps();
    const cur = selectedMap();
    list.innerHTML = all
      .map(
        (m) => `<div class="map-item${cur && cur.id === m.id ? " active" : ""}" draggable="true" data-map-id="${esc(
          m.id
        )}" title="单击＝打开 · 双击＝改名 · 拖动＝排序 · ×＝删除">
          <span class="map-kind" title="${esc(uiTextFor(m.kind === "vector" ? "模拟图" : "板块图"))}">${
            m.kind === "vector" ? "🗺" : "🧩"
          }</span>
          <span class="map-name">${esc(m.name || "")}</span>
          <span class="map-count">(${mapPlaceCount(m)})</span>
          <button type="button" class="icon-btn map-del" title="${esc(uiTextFor("删除这张地图（可撤销）"))}">×</button>
        </div>`
      )
      .join("");
    const empty = $("#map-empty");
    if (empty) empty.hidden = all.length > 0;
    let dragId = null;
    $$("#map-list .map-item").forEach((el) => {
      // 右键地图卡：编辑 / 比例（只有板块图有）/ 坐标 / 比例尺
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const m = maps().find((x) => x.id === el.dataset.mapId);
        if (!m) return;
        selectedMapId = m.id;
        mapDrawMode = false;
        renderMapRail();
        renderMapStage();
        const items = [
          { label: uiTextFor("编辑…"), act: () => openMapModal(m.id) },
          { label: uiTextFor("复制"), act: () => copyMap(m) },
          { label: uiTextFor("删除"), danger: true, act: () => deleteMap(m) },
        ];
        // 菜单跟着鼠标：在鼠标右下角（右下角放不下时 placeFloatingAtCursor 会自动翻到左上 / 左下）
        renderContextMenu(ev.clientX + 2, ev.clientY + 2, m.name || uiTextFor("地图"), items);
      });
      el.addEventListener("click", (ev) => {
        if (ev.target.closest(".map-del")) return;
        selectedMapId = el.dataset.mapId;
        mapDrawMode = false;
        renderMapRail();
        renderMapStage();
      });
      el.addEventListener("dblclick", async (ev) => {
        if (ev.target.closest(".map-del")) return;
        const m = maps().find((x) => x.id === el.dataset.mapId);
        if (!m) return;
        // 双击＝和右键「编辑…」同一个界面（不再单独弹改名框，可撤销）
        openMapModal(m.id);
      });
      el.querySelectorAll(".map-del").forEach((b) =>
        b.addEventListener("click", (ev) => {
          ev.stopPropagation();
          deleteMap({ id: el.dataset.mapId });
        })
      );
      el.addEventListener("dragstart", (ev) => {
        dragId = el.dataset.mapId;
        el.classList.add("dragging");
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
      });
      el.addEventListener("dragend", () => {
        el.classList.remove("dragging");
        dragId = null;
      });
      el.addEventListener("dragover", (ev) => {
        if (!dragId || dragId === el.dataset.mapId) return;
        ev.preventDefault();
        const r = el.getBoundingClientRect();
        const before = ev.clientY < r.top + r.height / 2;
        const dragging = $(`#map-list .map-item[data-map-id="${dragId}"]`);
        if (dragging) el.parentElement.insertBefore(dragging, before ? el : el.nextSibling);
      });
      el.addEventListener("drop", (ev) => {
        if (!dragId) return;
        ev.preventDefault();
        const ids = $$("#map-list .map-item").map((x) => x.dataset.mapId);
        const beforeOrder = maps().map((m) => m.id).join(",");
        const byId = new Map(maps().map((m) => [m.id, m]));
        const next = ids.map((id) => byId.get(id)).filter(Boolean);
        maps().forEach((m) => {
          if (next.indexOf(m) < 0) next.push(m);
        });
        state.maps = next;
        if (maps().map((m) => m.id).join(",") !== beforeOrder) {
          pendingUndoLabel = "调整地图顺序";
          saveState();
        }
        renderMapRail();
      });
    });
  }

  // 这张地图上已经有几个「地点条目」（区域 / 图标关联到的不同地点）
  function mapPlaceCount(m) {
    const ids =
      m && m.kind === "vector"
        ? (m.icons || []).map((ic) => ic.placeId)
        : (m.regions || []).map((r) => r.placeId);
    return new Set((ids || []).filter(Boolean)).size;
  }

  function renderMapStage() {
    const stage = $("#map-stage");
    if (!stage) return;
    const m = selectedMap();
    const title = $("#map-title");
    const drawBtn = $("#map-draw-btn");
    const importBtn = $("#map-import-btn");
    const pencilBtn = $("#map-pencil-btn");
    const eraserBtn = $("#map-eraser-btn");
    const doneBtn = $("#map-done-btn");
    const cancelBtn = $("#map-cancel-btn");
    const canvas = $("#map-canvas");
    if (!canvas) return;
    if (!m) {
      if (title) title.textContent = "";
      if (drawBtn) drawBtn.hidden = true;
      if (importBtn) importBtn.hidden = true;
      [pencilBtn, eraserBtn, doneBtn, cancelBtn].forEach((b) => {
        if (b) b.hidden = true;
      });
      canvas.innerHTML = `<p class="map-hint">${esc(uiTextFor("还没有地图：点这里的「＋」新建一张。"))}</p>`;
      return;
    }
    if (title) title.textContent = m.name || "";
    const isBoard = m.kind === "board";
    // 板块图：没在画 = 「绘制 / 导入」；画的时候 = 铅笔 / 橡皮 / 完成 / 取消
    if (importBtn) importBtn.hidden = mapDrawMode;
    if (drawBtn) {
      drawBtn.hidden = !isBoard || mapDrawMode;
      drawBtn.classList.remove("btn-primary");
      drawBtn.textContent = uiTextFor("绘制");
    }
    if (pencilBtn) {
      pencilBtn.hidden = !mapDrawMode;
      pencilBtn.classList.toggle("active", mapTool === "pencil");
    }
    if (eraserBtn) {
      eraserBtn.hidden = !mapDrawMode;
      eraserBtn.classList.toggle("active", mapTool === "eraser");
    }
    if (doneBtn) doneBtn.hidden = !mapDrawMode;
    if (cancelBtn) cancelBtn.hidden = !mapDrawMode;
    // 内容没变就别重画（搜索框每敲一个字都会走 renderEntries → 这里）
    const sig = mapStageSignature(m);
    if (sig === mapStageSig) return;
    mapStageSig = sig;
    if (m.kind === "board") renderBoardCanvas(m, canvas);
    else renderVectorCanvas(m, canvas);
  }

  /* ---------- 板块图 ---------- */

  function boardViewBox(m) {
    const aspect = Number(m && m.aspect) > 0 ? Number(m.aspect) : MAP_VB_W / 700;
    return { w: MAP_VB_W, h: Math.round(MAP_VB_W / aspect) };
  }

  /* 自动找封闭区域：按「画布上现在长什么样」来找，不看鼠标轨迹。
     做法：把画布缩成一张小图（已经画出来的区域＝白，其余＝黑），
     先从图像四边灌水把「和外面连着」的黑标掉，剩下的黑就是被形状围住的空隙，
     再把每一块空隙描成闭合曲线。 */
  function detectEnclosedRegions(m) {
    const vb = boardViewBox(m);
    // 分辨率高一点：轮廓更贴用户的笔迹，生成的闭合曲线不用再做很重的平滑
    const W = 520;
    const H = Math.max(24, Math.round((W * vb.h) / vb.w));
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return 0;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    /* 已经识别过的区域这里不再铺白：用户很可能就是在已有区域里再画一圈，
       铺了白那块就「被封住」，怎么画都认不出来。边界笔迹会被替换掉，所以不会重复识别。 */
    // 用户画在画布上的线也算「边界」：一起画进这张小图，才能围住空隙。
    // 先按「完成」的规则把断口接起来（首尾相接 / 端点接端点 / 端点接别的线 / 端点贴边），
    // 免得手绘差几像素就漏气、认不出封闭区域。
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(3, W / 90);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    weldStrokeGaps((m.strokes || []).map((s) => s.pts), vb).forEach((poly) => {
      const pts = (poly || [])
        .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => [p[0] * W, p[1] * H]);
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    });
    let img = null;
    try {
      img = ctx.getImageData(0, 0, W, H);
    } catch (e) {
      return 0;
    }
    const data = img.data;
    const dark = (i) => data[i * 4] < 128;
    /* 地图边缘当作封闭曲线的一段：最外一圈直接画成「墙」，
       这样画到边缘上的线就和边缘一起围住一块区域（画布边缘＝边界的一部分）。
       墙的厚度 RING：线宽 RING-1 的描边正好盖住最外 RING 圈像素。 */
    const RING = 4;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = RING - 1;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    try {
      img = ctx.getImageData(0, 0, W, H);
    } catch (e) {
      return 0;
    }
    const data2 = img.data;
    const dark2 = (i) => data2[i * 4] < 128;
    // 把黑（还没归属的空地）分成一块块「面」：贴边最多 / 最大的那块＝背景，其余＝围出来的区域
    const label = new Int32Array(W * H).fill(-1);
    const faces = [];
    for (let start = 0; start < W * H; start++) {
      if (label[start] >= 0 || !dark2(start)) continue;
      const id = faces.length;
      const stack = [start];
      label[start] = id;
      let area = 0;
      let border = 0;
      while (stack.length) {
        const i = stack.pop();
        area++;
        const x = i % W;
        const y = (i - x) / W;
        if (x <= RING || x >= W - 1 - RING || y <= RING || y >= H - 1 - RING) border++; // 贴着地图边缘
        if (x > 0 && label[i - 1] < 0 && dark2(i - 1)) {
          label[i - 1] = id;
          stack.push(i - 1);
        }
        if (x < W - 1 && label[i + 1] < 0 && dark2(i + 1)) {
          label[i + 1] = id;
          stack.push(i + 1);
        }
        if (y > 0 && label[i - W] < 0 && dark2(i - W)) {
          label[i - W] = id;
          stack.push(i - W);
        }
        if (y < H - 1 && label[i + W] < 0 && dark2(i + W)) {
          label[i + W] = id;
          stack.push(i + W);
        }
      }
      faces.push({ id, area, border });
    }
    if (!faces.length) return 0;
    // 背景＝贴着地图边缘最长的那块（一样长就比面积）。
    // 完全不贴边的块＝被笔迹整个圈住的，永远算区域，不参与「谁是背景」的竞争。
    const touching = faces.filter((f) => f.border > 0);
    const bg = (touching.length ? touching : faces).slice().sort((a, b) => b.border - a.border || b.area - a.area)[0];
    // 围出来的空地：做成一张「区域为暗、其余为亮」的图再描轮廓
    const masked = new Uint8ClampedArray(data.length);
    let holePx = 0;
    for (let i = 0; i < W * H; i++) {
      const hole = dark2(i) && label[i] !== bg.id;
      if (hole) holePx++;
      const v = hole ? 0 : 255;
      masked[i * 4] = v;
      masked[i * 4 + 1] = v;
      masked[i * 4 + 2] = v;
      masked[i * 4 + 3] = 255;
    }
    if (!holePx) return 0;
    const traced = traceInkContours({ w: W, h: H, data: masked }, Math.max(16, Math.round(W * H * 0.001)));
    const holes = traced.filter((t) => t.area / (W * H) >= 0.0025); // 太碎的小缝不算（放宽一点）
    if (!holes.length) return 0;
    const fresh = [];
    holes.forEach((t) => {
      const pts = t.pts.map((p) => [
        Number((p[0] / W).toFixed(5)),
        Number((p[1] / H).toFixed(5)),
      ]);
      if (pts.length < 3) return;
      const simp = simplifyPolygon(pts, 0.0012);
      const region = {
        id: uid(),
        placeId: "",
        color: mapColorAt(m.regions.length),
        pts: simp.length >= 3 ? simp : pts,
      };
      m.regions.push(region);
      fresh.push(region);
    });
    // 生成闭合曲线后，把围成它的那几笔替掉：不然用户画的线和识别出的边界会叠成「重影」
    dropStrokesOnRegions(m, fresh);
    return holes.length;
  }

  /* 闭合曲线已经把用户画的那一圈代表掉了：把基本贴着新区域边界的笔迹去掉，避免重影。
     离边界远的涂鸦、没围成区域的线都留着。返回去掉了多少笔。 */
  function dropStrokesOnRegions(m, regions) {
    const list = m.strokes || [];
    if (!regions.length || !list.length) return 0;
    const vb = boardViewBox(m);
    const minSide = Math.max(1, Math.min(vb.w, vb.h));
    const t = minSide * 0.022; // 容差：描出来的轮廓本来就贴着笔迹，给一点点富余
    const tx = t / vb.w;
    const ty = t / vb.h;
    const nearBoundary = (p) => {
      for (let r = 0; r < regions.length; r++) {
        const pts = regions[r].pts || [];
        for (let i = 0; i < pts.length; i++) {
          const cp = closestOnSegment(p, pts[i], pts[(i + 1) % pts.length]);
          if (Math.hypot((p[0] - cp[0]) / tx, (p[1] - cp[1]) / ty) <= 1) return true;
        }
      }
      return false;
    };
    const keep = [];
    let dropped = 0;
    list.forEach((s) => {
      const pts = (s.pts || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length < 2) {
        keep.push(s);
        return;
      }
      let on = 0;
      pts.forEach((p) => {
        if (nearBoundary(p)) on++;
      });
      if (on / pts.length >= 0.6) dropped++;
      else keep.push(s);
    });
    if (dropped) m.strokes = keep;
    return dropped;
  }

  // 手绘 / 画完一块之后：顺手把被围住的黑色空隙也变成区域
  function autoDetectEnclosedRegions(m, canvas) {
    const n = detectEnclosedRegions(m);
    if (!n) return 0;
    renderMapRail();
    renderBoardCanvas(m, canvas);
    return n;
  }

  /* ---------- 绘制状态：铅笔 / 橡皮 / 完成 / 取消 ---------- */

  function enterMapDraw() {
    const m = selectedMap();
    if (!m || m.kind !== "board") return;
    // 进入绘制前留一份底：Esc 时连「这一轮画的线」和「这一轮识别出的区域」一起退回
    mapDrawBackup = {
      regions: JSON.parse(JSON.stringify(m.regions || [])),
      strokes: JSON.parse(JSON.stringify(m.strokes || [])),
    };
    mapDrawMode = true;
    mapTool = "pencil"; // 默认铅笔
    mapDrawPts = null;
    mapStageSig = "";
    renderMapStage();
  }

  // save=true：保留这一轮画的东西（Enter / 完成）；save=false：回到进入绘制前的样子（Esc / 取消）
  // 用户画的就是一条条线（不自动收尾闭合）：到这一步才「按画布上呈现的图」一次性找封闭区域。
  function finishMapDraw(save) {
    if (!mapDrawMode) return;
    const m = selectedMap();
    mapDrawMode = false;
    mapTool = "pencil";
    mapDrawPts = null;
    if (!save && m && mapDrawBackup) {
      pendingUndoLabel = uiTextFor("取消这一轮绘制");
      m.regions = mapDrawBackup.regions;
      m.strokes = mapDrawBackup.strokes;
      saveState();
      showToast(uiTextFor("已回到开始绘制之前的样子"));
    } else if (m) {
      const n = detectEnclosedRegions(m);
      if (n) {
        pendingUndoLabel = uiSentence("mapClosedFound", n);
        saveState();
        showToast(uiSentence("mapClosedFound", n));
      } else if ((m.strokes || []).length) {
        // 什么都没认出来时给一句提示：不然用户只看到「没反应」
        showToast(uiTextFor("这次没找到封闭区域：笔迹要围成一圈（小缺口会自动接上），太碎或没围起来的不算。"));
      }
    }
    mapDrawBackup = null;
    mapStageSig = "";
    renderMapRail();
    renderMapStage();
  }

  function setMapTool(tool) {
    mapTool = tool === "eraser" ? "eraser" : "pencil";
    mapDrawPts = null;
    mapStageSig = "";
    renderMapStage();
  }

  // 橡皮：按住划过 —— 线只擦「经过的那一段」（不是整条擦掉），区域划过就整块擦（可撤销）
  // defer=true：这一划先只改数据，松手时整划一起存一步（撤销退掉整划，而不是一笔一笔退）
  // 返回 { kind: "region", label }（线由 eraseStrokeParts 按几何位置擦，不走这里）
  function eraseInkAt(ev, defer) {
    const m = selectedMap();
    if (!m) return null;
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    if (!el || !el.closest) return null;
    const fresh = maps().find((x) => x.id === m.id) || m; // 撤销会换对象，落笔前重新取
    if (el.closest(".map-stroke")) return null; // 线在擦的过程中会被切开，交给几何算法处理
    const g = el.closest(".map-region");
    if (!g) return null;
    const id = g.dataset.regionId;
    const region = (fresh.regions || []).find((r) => r.id === id);
    if (!region) return null;
    const label = mapPlaceLabel(region.placeId) || uiTextFor("一块区域");
    fresh.regions = (fresh.regions || []).filter((r) => r.id !== id);
    if (defer) {
      mapStageSig = "";
      renderMapStage();
      return { kind: "region", label };
    }
    pendingUndoLabel = uiSentence("mapEraseUndo", label);
    saveState();
    renderMapRail();
    renderMapStage();
    return { kind: "region", label };
  }

  // 橡皮这一划的撤销标签：只擦线 / 只擦区域 / 两样都有
  function erasedLabel(strokes, regions) {
    const kr = regions.length;
    if (strokes && kr) return uiSentence("mapEraseMixedUndo", kr, strokes);
    if (strokes) return strokes > 1 ? uiSentence("mapEraseStrokeUndoMany", strokes) : uiTextFor("擦掉地图上画的一笔");
    return kr > 1 ? uiSentence("mapEraseUndoMany", kr) : uiSentence("mapEraseUndo", regions[0]);
  }

  /* 橡皮擦过一笔：把经过的那一段切掉，剩下的线段留着（返回被切到的线有几条）。
     不碰到的线原样保留对象，免得白重画。 */
  function eraseStrokeParts(m, at, rad) {
    const list = m.strokes || [];
    let touched = 0;
    const next = [];
    list.forEach((s) => {
      const pieces = cutStrokeByBrush(s.pts || [], at, rad);
      if (!pieces) {
        next.push(s);
        return;
      }
      touched++;
      pieces.forEach((pts, i) =>
        next.push({ id: i === 0 ? s.id : uid(), pts: pts.map((p) => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]) })
      );
    });
    if (touched) m.strokes = next;
    return touched;
  }

  function renderBoardCanvas(m, canvas) {
    const vb = boardViewBox(m);
    const regions = m.regions || [];
    const shapes = regions
      .map((r, i) => {
        const filled = !!r.placeId;
        const d = polygonPath(r.pts || [], vb.w, vb.h);
        if (!d) return "";
        const label = filled ? mapPlaceLabel(r.placeId) : "";
        return `<g class="map-region${filled ? " linked" : ""}" data-region-id="${esc(r.id)}" title="${esc(
          filled ? label + uiTextFor("（单击打开这张地点卡）") : uiTextFor("单击／右键关联一个地点")
        )}">
          <path d="${d}" fill="${filled ? esc(r.color || mapColorAt(i)) : "transparent"}" />
        </g>`;
      })
      .join("");
    // 区域名用 HTML 画（不吃缩放）：位置按 0..1 的比例摆
    const labels = regions
      .map((r) => {
        if (!r.placeId) return "";
        const pts = r.pts || [];
        if (!pts.length) return "";
        const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        return `<span class="map-region-label" style="left:${(cx * 100).toFixed(3)}%;top:${(cy * 100).toFixed(3)}%">${esc(
          mapPlaceLabel(r.placeId)
        )}</span>`;
      })
      .join("");
    // 用户画的线：就是一条条开曲线，原样摆在那儿（不自动收尾闭合）
    const ink = (m.strokes || [])
      .map((s) => {
        const pts = (s.pts || []).filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
        if (pts.length < 2) return "";
        const d = smoothOpenPath(pts.map((p) => [p[0] * vb.w, p[1] * vb.h]));
        return d ? `<path class="map-stroke" data-stroke-id="${esc(s.id)}" d="${d}" />` : "";
      })
      .join("");
    // 草稿线：正在画的那一笔，和落笔后一样（只裁到画布内，不收尾、不闭合）
    const draft = `<path class="map-draft" d="${draftPreviewPath(mapDrawPts, vb, canvas)}" />`;
    canvas.innerHTML = `<div class="map-fit"></div><svg class="map-svg${mapDrawMode ? " drawing" : ""}" viewBox="0 0 ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id="mapClip"><rect x="0" y="0" width="${vb.w}" height="${vb.h}" /></clipPath></defs>
      <g clip-path="url(#mapClip)">
        ${shapes}
        ${ink}
        ${draft}
      </g>
    </svg><div class="map-overlay">${labels}${mapGizmoHtml(m)}</div>${
      regions.length || (m.strokes || []).length
        ? ""
        : `<p class="map-hint">${esc(uiTextFor("板块图是空的：点「绘制」画线，点「完成」自动识别围出的区域。"))}</p>`
    }`;
    syncMapOverlay(canvas, vb);
    syncMapGizmoScale(canvas, m);
    clampMapGizmos(canvas, m);
    bindMapGizmos(canvas, m);
    bindBoardEvents(m, canvas, vb);
  }

  function bindBoardEvents(m, canvas, vb) {
    const svg = canvas.querySelector(".map-svg");
    if (!svg) return;
    // 撤销 / 还原会把 state 整份换成新对象，闭包里那个 m 和区域对象就成了旧的：
    // 每个回调里都按 id 重新取一次当前这份数据
    const mapNow = () => maps().find((x) => x.id === m.id) || null;
    const regionNow = (id) => {
      const mm = mapNow();
      return mm ? (mm.regions || []).find((r) => r.id === id) || null : null;
    };
    // 每次都重新取 svg：手绘途中可能会整块重画，闭包里那个节点会变成脱离文档的旧节点
    const toNorm = (ev) => mapUnitOf(canvas, vb, ev);
    const toUnit = (ev) => {
      const [x, y] = toNorm(ev);
      return [Math.max(0, Math.min(1, x / vb.w)), Math.max(0, Math.min(1, y / vb.h))];
    };
    // 手绘：按下拖一圈，松手闭合成区域
    svg.addEventListener("mousedown", (ev) => {
      if (!mapDrawMode || ev.button !== 0) return;
      if (mapTool === "eraser") {
        // 橡皮：按住划过 —— 线擦掉经过的那一段，区域划过就整块擦（一整划算一步撤销）
        ev.preventDefault();
        const brush = mapBrushUnit(canvas);
        let cutLines = 0;
        const regionGone = [];
        let lastAt = null;
        const applyAt = (at) => {
          const mm = mapNow();
          if (!mm) return;
          const n = eraseStrokeParts(mm, at, brush);
          if (n) {
            cutLines += n;
            mapStageSig = "";
            renderMapStage();
          }
        };
        const eraseAt = (e) => {
          const at = toUnit(e);
          if (lastAt) {
            // 鼠标动得快时中间会漏掉：两点之间补几个采样点，擦出来的是一条连续的带
            const d = Math.hypot(at[0] - lastAt[0], at[1] - lastAt[1]);
            const steps = Math.max(1, Math.ceil(d / Math.max(1e-4, brush * 0.5)));
            for (let i = 1; i <= steps; i++) {
              applyAt([lastAt[0] + ((at[0] - lastAt[0]) * i) / steps, lastAt[1] + ((at[1] - lastAt[1]) * i) / steps]);
            }
          } else {
            applyAt(at);
          }
          lastAt = at;
          const hit = eraseInkAt(e, true); // 区域：划过就整块擦
          if (hit) regionGone.push(hit.label);
        };
        eraseAt(ev);
        const move = (e) => eraseAt(e);
        const up = () => {
          document.removeEventListener("mousemove", move, true);
          document.removeEventListener("mouseup", up, true);
          if (!cutLines && !regionGone.length) return;
          pendingUndoLabel = erasedLabel(cutLines, regionGone);
          saveState();
          renderMapRail();
          renderMapStage();
        };
        document.addEventListener("mousemove", move, true);
        document.addEventListener("mouseup", up, true);
        return;
      }
      ev.preventDefault();
      mapDrawPts = [toNorm(ev)];
      const move = (e) => {
        mapDrawPts.push(toNorm(e));
        const line = canvas.querySelector(".map-draft");
        const str = draftPreviewPath(mapDrawPts, vb, canvas);
        if (line) line.setAttribute("d", str);
        else {
          const mm = mapNow();
          if (mm) renderBoardCanvas(mm, canvas);
        }
      };
      const up = () => {
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("mouseup", up, true);
        // 收尾只做「压薄 + 裁到画布范围内」：画的就是一条线，不收尾、不自动连成封闭曲线。
        // 封闭区域等按「完成 / Enter」时，按画布上呈现的图一次性找。
        const pts = handStrokeOf(mapDrawPts || [], vb);
        mapDrawPts = null;
        const mm = mapNow(); // 中途可能被撤销换成新对象，这里重新取
        if (!mm) return;
        if (pts.length < 2) {
          renderBoardCanvas(mm, canvas);
          return;
        }
        pendingUndoLabel = uiTextFor("在地图上画一笔");
        mm.strokes = (mm.strokes || []).concat([{ id: uid(), pts }]);
        saveState();
        renderMapRail();
        renderBoardCanvas(mm, canvas);
      };
      // 用捕获阶段：界面别处的 mousemove 处理（拖拽 / 自动滚动）可能会 stopPropagation，
      // 手绘的每一个点都不能丢
      document.addEventListener("mousemove", move, true);
      document.addEventListener("mouseup", up, true);
    });
    $$(".map-region", svg).forEach((g) => {
      const regionId = g.dataset.regionId;
      if (!regionId) return;
      g.addEventListener("click", () => {
        if (mapDrawMode) return;
        const reg = regionNow(regionId);
        const mm = mapNow();
        if (!reg || !mm) return;
        if (reg.placeId) openEntryModal(reg.placeId);
        else pickPlaceForRegion(mm, reg);
      });
      g.addEventListener("contextmenu", (ev) => {
        if (mapDrawMode) return; // 绘制中只画图：不开这些菜单
        ev.preventDefault();
        ev.stopPropagation();
        const reg = regionNow(regionId);
        const mm = mapNow();
        if (reg && mm) showRegionMenu(ev.clientX, ev.clientY, mm, reg);
      });
      g.addEventListener("dragover", (ev) => {
        if (mapDrawMode) return; // 绘制中不收地点卡
        const cd = dragDataOf(ev);
        if (cd && (cd.type === "char" || cd.type === "chars")) {
          // 人物卡：拖到「已关联地点」的区域上＝把人物加进那张地点卡
          const reg0 = regionNow(regionId);
          if (!reg0 || !reg0.placeId) return;
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
          g.classList.add("char-drop");
          return;
        }
        const id = draggedPlaceId(ev);
        if (!id) return;
        ev.preventDefault();
        // 条目卡 dragstart 里设的是 effectAllowed="move"：这里必须跟着写 move，
        // 写 copy 的话浏览器认为「这次拖动不允许这个效果」，drop 根本不会触发
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        g.classList.add("drop-hot");
      });
      g.addEventListener("dragleave", () => g.classList.remove("drop-hot"));
      g.addEventListener("drop", (ev) => {
        if (mapDrawMode) return;
        const cd = dragDataOf(ev);
        if (cd && (cd.type === "char" || cd.type === "chars")) {
          const reg0 = regionNow(regionId);
          if (!reg0 || !reg0.placeId) return;
          ev.preventDefault();
          ev.stopPropagation();
          g.classList.remove("char-drop");
          linkCharsToPlace(cd.type === "chars" ? cd.ids : [cd.id], reg0.placeId);
          return;
        }
        const id = draggedPlaceId(ev);
        g.classList.remove("drop-hot");
        if (!id) return;
        ev.preventDefault();
        const reg = regionNow(regionId);
        const mm = mapNow();
        if (reg && mm) linkRegionToPlace(mm, reg, id, true);
      });
    });
  }

  // 正在被拖进来的是不是「地点」条目（条目卡拖动记在 entryDragId 上）
  /* 人物卡拖到地图上「已经关联了地点」的区域 / 图标：把人物加进那张地点卡的关联人物。
     （用的就是设定档案里「人物拖到条目上」同一套逻辑，势力条目会同步写所属势力） */
  function linkCharsToPlace(charIds, placeId) {
    const en = getEntrySafe(placeId);
    if (!en) return false;
    const ids = (charIds || []).filter((id) => getChar(id));
    if (!ids.length) return false;
    const before = new Set(en.characterIds || []);
    const fresh = ids.filter((id) => !before.has(id));
    pendingUndoLabel = uiSentence(
      fresh.length === 1 ? "mapCharLinkUndo" : "mapCharsLinkUndo",
      fresh.length || ids.length,
      mapPlaceLabel(placeId)
    );
    addCharsToEntry(ids, placeId);
    if (fresh.length) showToast(uiSentence("mapCharsLinked", fresh.length, mapPlaceLabel(placeId)));
    return true;
  }

  function draggedPlaceId(ev) {
    let id = "";
    if (typeof entryDragId === "string" && entryDragId) id = entryDragId;
    else if (ev && ev.dataTransfer) {
      try {
        const t = ev.dataTransfer.getData("text/plain");
        if (t && getEntrySafe(t)) id = t;
      } catch (e) {
        /* ignore */
      }
    }
    if (!id) return "";
    const en = getEntrySafe(id);
    const cat = mapCategory();
    if (!en || !cat || en.categoryId !== cat.id) return "";
    return id;
  }

  function linkRegionToPlace(m, region, placeId, quiet) {
    if (!getEntrySafe(placeId)) return;
    const prev = region.placeId;
    pendingUndoLabel = uiSentence("mapLinkUndo", mapPlaceLabel(placeId));
    region.placeId = placeId;
    if (!region.color || region.color === "transparent") {
      region.color = mapColorAt((m.regions || []).indexOf(region));
    }
    saveState();
    renderMapRail();
    renderMapStage();
    if (!quiet && prev !== placeId) showToast(uiSentence("mapLinkedTo", mapPlaceLabel(placeId)));
  }

  async function pickPlaceForRegion(m, region) {
    const list = placeEntries();
    if (!list.length) {
      uiAlert(uiTextFor("还没有地点条目：先去「设定档案 → 地点」建几个。"));
      return;
    }
    const name = await uiPrompt(
      uiTextFor("关联哪个地点？（可下拉选，也可直接打名字）"),
      mapPlaceLabel(region.placeId),
      uiTextFor("关联地点"),
      { options: list.map((e) => String(e.name || "")) }
    );
    if (name === null) return;
    const id = resolvePlaceIdByName(name);
    if (!id) {
      uiAlert(uiSentence("mapNoPlaceMatch", String(name || "")));
      return;
    }
    linkRegionToPlace(m, region, id);
  }

  function showRegionMenu(x, y, m, region) {
    const linked = !!region.placeId;
    renderContextMenu(x, y, linked ? mapPlaceLabel(region.placeId) : uiTextFor("（这块区域还没关联地点）"), [
      { label: uiTextFor("关联地点…"), act: () => pickPlaceForRegion(m, region) },
      {
        label: uiTextFor("删除地点"),
        disabled: !linked,
        act: () => {
          pendingUndoLabel = uiSentence("mapUnlinkUndo", mapPlaceLabel(region.placeId));
          region.placeId = "";
          saveState();
          renderMapRail();
          renderMapStage();
        },
      },
      {
        label: uiTextFor("更改颜色…"),
        disabled: !linked,
        act: () => {
          const r = $(`.map-region[data-region-id="${region.id}"]`);
          openMapColorPop(x, y, region.color || mapColorAt(0), (hex) => {
            pendingUndoLabel = uiTextFor("更改地图区域颜色");
            region.color = hex;
            saveState();
            renderMapStage();
          }, r);
        },
      },
      {
        label: uiTextFor("删除这块区域"),
        danger: true,
        act: () => {
          // 删除区域不弹窗（做错了 Ctrl+Z 能退回来）
          pendingUndoLabel = uiTextFor("删除地图区域");
          m.regions = (m.regions || []).filter((r) => r.id !== region.id);
          saveState();
          renderMapRail();
          renderMapStage();
        },
      },
    ]);
  }

  /* ---------- 模拟图 ---------- */

  function vectorViewBox(m) {
    const v = m.vector || {};
    return { w: Math.max(8, v.cols || 128), h: Math.max(8, v.rows || 72) };
  }

  function renderVectorCanvas(m, canvas) {
    if (!m.vector || !(m.vector.rects || []).length) {
      if (!m.image) {
        canvas.innerHTML = `<p class="map-hint">${esc(uiTextFor("还没有底图：点「导入」放一张图上去，再双击空白处放图标。"))}</p>`;
        return;
      }
    }
    const vb = m.vector && (m.vector.rects || []).length ? vectorViewBox(m) : boardViewBox(m);
    const rects = ((m.vector && m.vector.rects) || [])
      .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${esc(r.color)}" />`)
      .join("");
    // 图标也用 HTML 画：字号 / 圆点永远是屏幕像素，不会被拉扁
    const icons = (m.icons || [])
      .map((ic) => {
        const color = ic.color || mapColorAt(0);
        const label = mapPlaceLabel(ic.placeId);
        const armed = mapIconArmedId === ic.id;
        return `<span class="map-icon${armed ? " armed" : ""}" data-icon-id="${esc(ic.id)}" style="left:${(ic.x * 100).toFixed(
          3
        )}%;top:${(ic.y * 100).toFixed(3)}%" title="${esc(label + uiTextFor(armed ? "（现在可以拖动它）" : "（双击或长按＝拖动 / 单击打开地点卡）"))}">
          <span class="map-icon-dot" style="background:${esc(color)}"></span>
          <span class="map-icon-label${ic.tone === "dark" ? " tone-dark" : ""}">${esc(label)}</span>
        </span>`;
      })
      .join("");
    const plate = m.vector && (m.vector.rects || []).length ? "" : `<img class="map-photo" src="${esc(m.image || "")}" alt="" />`;
    canvas.innerHTML = `<div class="map-fit is-vector">${plate}</div><svg class="map-svg" viewBox="0 0 ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">
      <g class="map-vector">${rects}</g>
    </svg><div class="map-overlay">${icons}${mapGizmoHtml(m)}</div>`;
    syncMapOverlay(canvas, vb);
    syncMapGizmoScale(canvas, m);
    clampMapGizmos(canvas, m);
    bindMapGizmos(canvas, m);
    const svg = canvas.querySelector(".map-svg");
    svg.addEventListener("dblclick", (ev) => {
      if (ev.target.closest(".map-icon")) return;
      const u = mapPctOf(canvas, ev);
      addIconAt(m, u[0], u[1]);
    });
    svg.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const u = mapPctOf(canvas, ev);
      renderContextMenu(ev.clientX, ev.clientY, uiTextFor("地图空白处"), [
        { label: uiTextFor("新建地点图标…"), act: () => addIconAt(m, u[0], u[1]) },
      ]);
    });
    $$(".map-overlay .map-icon", canvas).forEach((g) => {
      const iconId = g.dataset.iconId;
      if (!iconId) return;
      // 撤销 / 还原会换对象：每次都用当前这份数据
      const iconNow = () => {
        const mm = maps().find((x) => x.id === m.id);
        return mm ? (mm.icons || []).find((x) => x.id === iconId) || null : null;
      };
      const ic = iconNow();
      if (!ic) return;
      // 人物卡拖到图标上＝把人物加进这个地点卡
      g.addEventListener("dragover", (ev) => {
        const cd = dragDataOf(ev);
        if (!cd || (cd.type !== "char" && cd.type !== "chars")) return;
        const cur0 = iconNow();
        if (!cur0 || !cur0.placeId) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
        g.classList.add("char-drop");
      });
      g.addEventListener("dragleave", () => g.classList.remove("char-drop"));
      g.addEventListener("drop", (ev) => {
        const cd = dragDataOf(ev);
        g.classList.remove("char-drop");
        if (!cd || (cd.type !== "char" && cd.type !== "chars")) return;
        const cur0 = iconNow();
        if (!cur0 || !cur0.placeId) return;
        ev.preventDefault();
        ev.stopPropagation();
        linkCharsToPlace(cd.type === "chars" ? cd.ids : [cd.id], cur0.placeId);
      });
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const cur = iconNow();
        if (!cur) return;
        if (mapIconSuppressClick) {
          // 刚刚拖完（长按拖动 / 武装后拖动）：这一下只是手松开，不要打开卡片
          mapIconSuppressClick = false;
          return;
        }
        if (mapIconArmedId === cur.id) return; // 已经进入拖动状态：这一下不算「打开卡片」
        // 双击会先来两次 click：延后一点，等 dblclick 决定要不要拖动
        clearTimeout(mapIconClickTimer);
        mapIconClickTimer = setTimeout(() => {
          if (mapIconArmedId !== cur.id) openEntryModal(cur.placeId);
        }, 260);
      });
      // 双击＝进入可拖动状态（不双击、不选右键「拖动」就不给拖）
      g.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        clearTimeout(mapIconClickTimer);
        armMapIcon(ic.id, mapIconArmedId !== ic.id);
      });
      // 拖动：① 双击 / 右键「拖动」进入可拖状态后按住；② 直接长按 0.45 秒
      const startIconDrag = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const move = (e) => {
          const cur = iconNow();
          if (!cur) return;
          const u = mapPctOf(canvas, e);
          cur.x = u[0];
          cur.y = u[1];
          // 不能抓着可能已经被重画掉的旧节点：按 id 重新取
          const el = canvas.querySelector(`.map-overlay .map-icon[data-icon-id="${cur.id}"]`);
          if (el) {
            el.style.left = (cur.x * 100).toFixed(3) + "%";
            el.style.top = (cur.y * 100).toFixed(3) + "%";
          }
        };
        const up = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          pendingUndoLabel = uiTextFor("移动地图上的地点图标");
          saveState();
          armMapIcon("", false);
          mapIconSuppressClick = true;
          setTimeout(() => {
            mapIconSuppressClick = false;
          }, 500);
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      };
      g.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        if (mapIconArmedId === ic.id) {
          startIconDrag(ev);
          return;
        }
        // 长按＝也可以拖：按住 0.45 秒不动就开始拖，动了 / 松手了就当普通点击
        const started = [ev.clientX, ev.clientY];
        let fired = false;
        const timer = setTimeout(() => {
          fired = true;
          cleanup();
          armMapIcon(ic.id);
          startIconDrag(ev);
        }, 450);
        const cleanup = () => {
          document.removeEventListener("mousemove", onMove, true);
          document.removeEventListener("mouseup", onUp, true);
        };
        const onMove = (e) => {
          if (Math.hypot(e.clientX - started[0], e.clientY - started[1]) > 6) {
            clearTimeout(timer);
            cleanup();
          }
        };
        const onUp = () => {
          if (!fired) clearTimeout(timer);
          cleanup();
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
      });
    });
    // 图标上的右键菜单（HTML 元素自己收）
    $$(".map-overlay .map-icon", canvas).forEach((g) => {
      const ic = (m.icons || []).find((x) => x.id === g.dataset.iconId);
      if (!ic) return;
      g.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showIconMenu(ev.clientX, ev.clientY, m, ic);
      });
    });
    // 把地点卡拖到空白处＝直接在这个位置建一个图标
    svg.addEventListener("dragover", (ev) => {
      const id = draggedPlaceId(ev);
      if (!id) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
      svg.classList.add("drop-hot");
    });
    svg.addEventListener("dragleave", () => svg.classList.remove("drop-hot"));
    svg.addEventListener("drop", (ev) => {
      const id = draggedPlaceId(ev);
      svg.classList.remove("drop-hot");
      if (!id) return;
      ev.preventDefault();
      const u = mapPctOf(canvas, ev);
      pendingUndoLabel = uiSentence("mapIconAddUndo", mapPlaceLabel(id));
      m.icons = (m.icons || []).concat([
        { id: uid(), placeId: id, x: u[0], y: u[1], color: mapColorAt((m.icons || []).length) },
      ]);
      saveState();
      renderMapRail();
      renderVectorCanvas(m, canvas);
    });
  }



  async function addIconAt(m, x, y, presetName) {
    const list = placeEntries();
    if (!list.length) {
      uiAlert(uiTextFor("还没有地点条目：先去「设定档案 → 地点」建几个。"));
      return;
    }
    const name = await uiPrompt(
      uiTextFor("这个图标是哪个地点？（可下拉选，也可直接打名字）"),
      presetName || "",
      uiTextFor("新建地点图标"),
      { options: list.map((e) => String(e.name || "")) }
    );
    if (name === null) return; // 取消＝不建
    const id = resolvePlaceIdByName(name);
    if (!id) {
      // 需求：没有有效信息就不建立图标
      uiAlert(uiSentence("mapNoPlaceMatch", String(name || "")));
      return;
    }
    pendingUndoLabel = uiSentence("mapIconAddUndo", mapPlaceLabel(id));
    m.icons = (m.icons || []).concat([
      { id: uid(), placeId: id, x, y, color: mapColorAt((m.icons || []).length) },
    ]);
    saveState();
    renderMapRail();
    renderMapStage();
  }

  function showIconMenu(x, y, m, ic) {
    renderContextMenu(x, y, mapPlaceLabel(ic.placeId), [
      {
        label: uiTextFor("拖动"),
        tip: uiTextFor("选它之后按住图标就能移动"),
        act: () => armMapIcon(ic.id),
      },
      {
        label: uiTextFor("更改地点…"),
        act: async () => {
          const list = placeEntries();
          const name = await uiPrompt(
            uiTextFor("改成哪个地点？"),
            mapPlaceLabel(ic.placeId),
            uiTextFor("更改地点"),
            { options: list.map((e) => String(e.name || "")) }
          );
          if (name === null) return;
          const id = resolvePlaceIdByName(name);
          if (!id) {
            uiAlert(uiSentence("mapNoPlaceMatch", String(name || "")));
            return;
          }
          pendingUndoLabel = uiSentence("mapIconChangeUndo", mapPlaceLabel(id));
          ic.placeId = id;
          saveState();
          renderMapRail();
          renderMapStage();
        },
      },
      {
        label: uiTextFor("删除图标"),
        danger: true,
        act: () => {
          pendingUndoLabel = uiSentence("mapIconDeleteUndo", mapPlaceLabel(ic.placeId));
          m.icons = (m.icons || []).filter((x2) => x2.id !== ic.id);
          saveState();
          renderMapRail();
          renderMapStage();
        },
      },
      {
        label: uiTextFor("更改颜色…"),
        act: () => {
          openMapColorPop(x, y, ic.color || mapColorAt(0), (hex) => {
            pendingUndoLabel = uiTextFor("更改地图图标颜色");
            ic.color = hex;
            saveState();
            renderMapStage();
          });
        },
      },
      {
        // 底图有深有浅：一行字看不清就点一下换个颜色（白＝加阴影，黑＝加一层模糊底）
        label: uiTextFor("字体：白 / 黑"),
        tip: uiTextFor("点一下换成另一种颜色"),
        act: () => {
          const toDark = ic.tone !== "dark";
          pendingUndoLabel = uiSentence(toDark ? "mapIconToneDarkUndo" : "mapIconToneLightUndo", mapPlaceLabel(ic.placeId));
          ic.tone = toDark ? "dark" : "light";
          saveState();
          renderMapStage();
          showToast(uiTextFor(toDark ? "字体已改为黑色" : "字体已改为白色"));
        },
      },
    ]);
  }

  /* ---------- 颜色 / 新建 / 导入 ---------- */

  /* ---------- 坐标 / 比例尺 ---------- */

  /* 坐标：三个轴名（X / Y / Z 三格，默认空）。
     填 1 个 → 一条轴（X 填了＝右向；Y 或 Z 填了＝上向）
     填 2 个 → 二维（按 X→Y→Z 的顺序，前一个右向、后一个上向）
     填 3 个 → 三维（x 向里、y 向右、z 向上）
     三个都空 / 填 Null / 填 NaN → 不生成坐标 */
  const MAP_COORD_DEFAULT = () => ({ mode: "none", x: 0.1, y: 0.12, nx: "", ny: "", nz: "", tone: "light", size: 0 });
  // 比例尺：一条线段 ＋ 它代表多长（线段比例）；不要就选「无」
  const MAP_SCALEBAR_DEFAULT = () => ({ mode: "none", x: 0.1, y: 0.9, text: "", color: "#eef3ff", tone: "light", size: 0, align: "left" });

  function mapCoordOf(m) {
    if (!m.coord || typeof m.coord !== "object") m.coord = MAP_COORD_DEFAULT();
    const c = m.coord;
    if (!Number.isFinite(c.x)) c.x = 0.1;
    if (!Number.isFinite(c.y)) c.y = 0.12;
    ["nx", "ny", "nz"].forEach((k) => {
      if (typeof c[k] !== "string") c[k] = "";
    });
    if (!Number.isFinite(c.size) || c.size < 0) c.size = 0;
    const n = coordAxes(c).length;
    c.mode = n >= 3 ? "3d" : n === 2 ? "2d" : n === 1 ? "1d" : "none";
    return c;
  }

  // 一格轴名：空 / null / nan 都算「没填」
  function coordName(el) {
    const t = String(el == null ? "" : el).trim();
    return !t || /^(null|nan|none|-)$/i.test(t) ? "" : t;
  }

  /* 按上面的规则算出「有几条轴、各自朝哪」：返回 [{ n: 轴名, d: "right"|"up"|"depth" }] */
  function coordAxes(c) {
    const names = [coordName(c && c.nx), coordName(c && c.ny), coordName(c && c.nz)];
    const filled = names.filter(Boolean);
    if (filled.length >= 3) {
      return [
        { n: names[0], d: "depth" },
        { n: names[1], d: "right" },
        { n: names[2], d: "up" },
      ];
    }
    if (filled.length === 2) return [{ n: filled[0], d: "right" }, { n: filled[1], d: "up" }];
    if (filled.length === 1) {
      const i = names.findIndex(Boolean);
      return [{ n: filled[0], d: i === 0 ? "right" : "up" }];
    }
    return [];
  }

  function mapScalebarOf(m) {
    if (!m.scalebar || typeof m.scalebar !== "object") m.scalebar = MAP_SCALEBAR_DEFAULT();
    const s = m.scalebar;
    if (s.mode !== "bar") s.mode = "none";
    if (!Number.isFinite(s.x)) s.x = 0.1;
    if (!Number.isFinite(s.y)) s.y = 0.9;
    if (typeof s.text !== "string") s.text = "";
    if (!Number.isFinite(s.size) || s.size < 0) s.size = 0;
    if (s.align !== "left" && s.align !== "center" && s.align !== "right") s.align = "left";
    return s;
  }

  // 坐标 / 比例尺画在 HTML 图层里（字号是屏幕像素，不跟着地图缩放变形）
  function mapGizmoHtml(m) {
    const out = [];
    const c = mapCoordOf(m);
    const axes = coordAxes(c);
    if (axes.length) {
      const tip = uiTextFor(axes.length >= 3 ? "三维坐标" : axes.length === 2 ? "二维坐标" : "坐标") + uiTextFor("（双击或长按＝拖动，右键＝更多）");
      out.push(`<span class="map-gizmo map-coord${mapGizmoArmed === "coord" ? " armed" : ""}${
        c.tone === "dark" ? " tone-dark" : ""
      }" data-gizmo="coord" style="left:${(
        c.x * 100
      ).toFixed(3)}%;top:${(c.y * 100).toFixed(3)}%" title="${esc(tip)}">
        <i class="hit"></i>
        ${axes.map((a) => `<i class="${a.d}"></i><b class="${a.d}">${esc(a.n)}</b>`).join("")}
      </span>`);
    }
    const s = mapScalebarOf(m);
    if (s.mode !== "none") {
      const tip = uiTextFor("比例尺") + uiTextFor("（双击或长按＝拖动，右键＝更多）");
      const align = s.align === "center" || s.align === "right" ? s.align : "left";
      out.push(`<span class="map-gizmo map-scalebar align-${align}${mapGizmoArmed === "scale" ? " armed" : ""}${
        s.tone === "dark" ? " tone-dark" : ""
      }" data-gizmo="scale" style="left:${(
        s.x * 100
      ).toFixed(3)}%;top:${(s.y * 100).toFixed(3)}%;--gizmo-scale:${Number(
        s.size || 1
      ).toFixed(2)}" title="${esc(tip)}">
        <i class="hit"></i>
        <i class="sbar"></i><b class="snum">${esc(s.text)}</b>
      </span>`);
    }
    return out.join("");
  }

  function armMapGizmo(kind, on) {
    const next = on === false ? "" : kind || "";
    if (mapGizmoArmed === next) return;
    mapGizmoArmed = next;
    mapStageSig = "";
    renderMapStage();
  }

  /* 坐标 / 比例尺相对地图是固定大小：按「地图内容那一块」的短边算出这一档的长度。
     地图栏拉大 / 拉小、界面缩放，它都跟着等比变；字号不跟着变（字是屏幕像素）。 */
  function syncMapGizmoScale(canvas, m) {
    const ov = canvas ? canvas.querySelector(".map-overlay") : null;
    if (!ov || !m) return;
    const r = ov.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const z = uiZoomScale(canvas) || 1;
    const minSide = Math.min(r.width, r.height) / z;
    $$(".map-overlay .map-gizmo", canvas).forEach((el) => {
      const isCoord = el.dataset.gizmo === "coord";
      const fixed = Number(isCoord ? mapCoordOf(m).size : mapScalebarOf(m).size);
      /* 填了「尺寸」就按那个 px 用（用户填的是屏幕上看到的长度，所以要除回界面缩放）；
         没填就跟着地图大小走（地图短边的 7.5%，夹在 16–160px）。 */
      const u =
        Number.isFinite(fixed) && fixed > 0
          ? Math.max(8, Math.min(400, fixed)) / z
          : Math.max(16, Math.min(160, minSide * 0.075));
      el.style.setProperty("--gizmo-u", u.toFixed(2) + "px");
    });
  }

  function clampMapGizmos(canvas, m) {
    const ov = canvas ? canvas.querySelector(".map-overlay") : null;
    if (!ov) return;
    const r = ov.getBoundingClientRect();
    if (!r.width || !r.height) return;
    $$(".map-overlay .map-gizmo", canvas).forEach((el) => {
      const kind = el.dataset.gizmo;
      const it = kind === "coord" ? mapCoordOf(m) : mapScalebarOf(m);
      let left = Infinity;
      let top = Infinity;
      let right = -Infinity;
      let bottom = -Infinity;
      [el].concat(Array.from(el.children)).forEach((n) => {
        const q = n.getBoundingClientRect();
        if (!q.width && !q.height) return;
        left = Math.min(left, q.left);
        top = Math.min(top, q.top);
        right = Math.max(right, q.right);
        bottom = Math.max(bottom, q.bottom);
      });
      if (!Number.isFinite(left)) return;
      let dx = 0;
      let dy = 0;
      if (left < r.left) dx = r.left - left;
      else if (right > r.right) dx = r.right - right;
      if (top < r.top) dy = r.top - top;
      else if (bottom > r.bottom) dy = r.bottom - bottom;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      const nx = Math.max(0, Math.min(1, it.x + dx / r.width));
      const ny = Math.max(0, Math.min(1, it.y + dy / r.height));
      if (nx === it.x && ny === it.y) return;
      it.x = Number(nx.toFixed(5));
      it.y = Number(ny.toFixed(5));
      el.style.left = (it.x * 100).toFixed(3) + "%";
      el.style.top = (it.y * 100).toFixed(3) + "%";
    });
  }

  // 只有黑白两档：白＝加阴影，黑＝加一层模糊白光（线段和字一起）

  /* 坐标 / 比例尺的界面取值：独立弹窗（prefix="map-coord" / "map-scale"）和
     「新建 / 编辑地图」里那两栏（prefix="map-new-coord" / "map-new-scale"）共用。 */
  function readCoordFields(prefix) {
    const g = (suf) => String(($("#" + prefix + "-" + suf) || {}).value || "").trim();
    const checked = document.querySelector('input[name="' + prefix + '-tone"]:checked');
    const sizeN = Number(g("size"));
    return {
      names: [g("x"), g("y"), g("z")],
      tone: checked && checked.value === "dark" ? "dark" : "light",
      size: Number.isFinite(sizeN) && sizeN > 0 ? Math.max(8, Math.min(400, sizeN)) : 0,
    };
  }

  function readScaleFields(prefix) {
    const g = (suf) => String(($("#" + prefix + "-" + suf) || {}).value || "").trim();
    const checked = document.querySelector('input[name="' + prefix + '-tone"]:checked');
    const alignEl = document.querySelector('input[name="' + prefix + '-align"]:checked');
    const sizeN = Number(g("size"));
    return {
      text: g("text"),
      tone: checked && checked.value === "dark" ? "dark" : "light",
      align: alignEl && ["left", "center", "right"].indexOf(alignEl.value) >= 0 ? alignEl.value : "left",
      size: Number.isFinite(sizeN) && sizeN > 0 ? Math.max(8, Math.min(400, sizeN)) : 0,
    };
  }

  // 轴名怎么填决定生成几条轴；返回条数（0＝不生成）
  function applyCoordFields(prefix, c) {
    const f = readCoordFields(prefix);
    const axes = coordAxes({ nx: f.names[0], ny: f.names[1], nz: f.names[2] });
    c.nx = f.names[0];
    c.ny = f.names[1];
    c.nz = f.names[2];
    if (axes.length) {
      c.tone = f.tone;
      c.size = f.size;
    }
    return axes.length;
  }

  // 标度空 / Null / NaN 就不生成比例尺
  function applyScaleFields(prefix, s) {
    const f = readScaleFields(prefix);
    const t = coordName(f.text);
    s.text = t;
    if (t) {
      s.tone = f.tone;
      s.align = f.align;
      s.size = f.size;
      s.mode = "bar";
      return 1;
    }
    s.mode = "none";
    return 0;
  }

  function writeCoordFields(prefix, c) {
    const set = (suf, v) => {
      const el = $("#" + prefix + "-" + suf);
      if (el) el.value = v;
    };
    set("x", coordName(c.nx) || String(c.nx || "").trim());
    set("y", coordName(c.ny) || String(c.ny || "").trim());
    set("z", coordName(c.nz) || String(c.nz || "").trim());
    set("size", Number(c.size) > 0 ? String(c.size) : "");
    $$('input[name="' + prefix + '-tone"]').forEach((r) => {
      r.checked = r.value === (c.tone === "dark" ? "dark" : "light");
    });
    syncGizmoFieldsDisabled(prefix);
  }

  function writeScaleFields(prefix, s) {
    const set = (suf, v) => {
      const el = $("#" + prefix + "-" + suf);
      if (el) el.value = v;
    };
    set("text", coordName(s.text) || String(s.text || "").trim());
    set("size", Number(s.size) > 0 ? String(s.size) : "");
    $$('input[name="' + prefix + '-tone"]').forEach((r) => {
      r.checked = r.value === (s.tone === "dark" ? "dark" : "light");
    });
    $$('input[name="' + prefix + '-align"]').forEach((r) => {
      r.checked = r.value === (s.align === "center" || s.align === "right" ? s.align : "left");
    });
    syncGizmoFieldsDisabled(prefix);
  }

  /* 不生成坐标 / 比例尺时，颜色和尺寸都灰掉不给改 */
  function syncGizmoFieldsDisabled(prefix) {
    const isCoord = /coord/.test(prefix);
    const any = isCoord
      ? ["x", "y", "z"].some((suf) => coordName(($("#" + prefix + "-" + suf) || {}).value))
      : !!coordName(($("#" + prefix + "-text") || {}).value);
    const toneRow = $("#" + prefix + "-tone-row");
    if (toneRow) {
      toneRow.classList.toggle("is-disabled", !any);
      toneRow.querySelectorAll("input").forEach((r) => {
        r.disabled = !any;
      });
    }
    const sizeEl = $("#" + prefix + "-size");
    if (sizeEl) sizeEl.disabled = !any;
    const toneField = $("#" + prefix + "-tone-field");
    if (toneField) toneField.classList.toggle("muted-off", !any);
    const sizeField = $("#" + prefix + "-size-field");
    if (sizeField) sizeField.classList.toggle("muted-off", !any);
    // 比例尺：标度没填就生成不出比例尺，「标度位置」也一起灰掉
    if (!isCoord) {
      const alignRow = $("#" + prefix + "-align-row");
      if (alignRow) {
        alignRow.classList.toggle("is-disabled", !any);
        alignRow.querySelectorAll("input").forEach((r) => {
          r.disabled = !any;
        });
      }
      const alignField = $("#" + prefix + "-align-field");
      if (alignField) alignField.classList.toggle("muted-off", !any);
    }
  }

  // 独立弹窗：坐标
  async function askMapCoord() {
    const m = selectedMap();
    if (!m) return;
    const c = mapCoordOf(m);
    if (!$("#map-coord-form")) return;
    writeCoordFields("map-coord", c);
    const titleEl = $("#map-coord-title");
    if (titleEl) titleEl.textContent = uiTextFor(c.mode === "none" ? "新建坐标" : "编辑坐标");
    openModal("map-coord-modal");
    setTimeout(() => {
      const el = $("#map-coord-x");
      if (el) el.focus();
    }, 40);
  }

  function submitMapCoordForm(ev) {
    if (ev) ev.preventDefault();
    const m = selectedMap();
    const c = m ? mapCoordOf(m) : null;
    if (!c) return;
    const n = applyCoordFields("map-coord", c);
    pendingUndoLabel = uiTextFor(n ? "设置地图上的坐标" : "删掉地图上的坐标");
    mapCoordOf(m); // 重新推导 mode
    saveState();
    closeModal("map-coord-modal");
    renderMapStage();
  }

  // 独立弹窗：比例尺
  async function askMapScalebar() {
    const m = selectedMap();
    if (!m) return;
    const s = mapScalebarOf(m);
    if (!$("#map-scale-form")) return;
    writeScaleFields("map-scale", s);
    const titleEl = $("#map-scale-title");
    if (titleEl) titleEl.textContent = uiTextFor(s.mode === "bar" ? "编辑比例尺" : "新建比例尺");
    openModal("map-scale-modal");
    setTimeout(() => {
      const el = $("#map-scale-text");
      if (el) el.focus();
    }, 40);
  }

  function submitMapScaleForm(ev) {
    if (ev) ev.preventDefault();
    const m = selectedMap();
    const s = m ? mapScalebarOf(m) : null;
    if (!s) return;
    const n = applyScaleFields("map-scale", s);
    pendingUndoLabel = uiTextFor(n ? "设置地图上的比例尺" : "删掉地图上的比例尺");
    saveState();
    closeModal("map-scale-modal");
    renderMapStage();
  }

  function removeMapGizmo(kind) {
    const m = selectedMap();
    if (!m) return;
    if (kind === "coord") {
      const c = mapCoordOf(m);
      if (c.mode === "none") return;
      pendingUndoLabel = uiTextFor("删掉地图上的坐标");
      // 轴名清空＝不生成（mode 是按轴名推导出来的）
      c.nx = "";
      c.ny = "";
      c.nz = "";
      mapCoordOf(m);
      armMapGizmo("", false);
    } else {
      const s = mapScalebarOf(m);
      if (s.mode === "none") return;
      pendingUndoLabel = uiTextFor("删掉地图上的比例尺");
      s.text = "";
      s.mode = "none";
      armMapGizmo("", false);
    }
    saveState();
    renderMapStage();
  }

  // 「坐标…」＝直接打开坐标编辑界面（轴名怎么填决定生成几条轴）
  function showMapCoordMenu() {
    return askMapCoord();
  }

  // 「比例尺…」＝直接打开比例尺编辑界面
  function showMapScalebarMenu() {
    return askMapScalebar();
  }

  // 坐标 / 比例尺自己的右键菜单：和模拟图的地点图标一个用法
  function showMapGizmoMenu(x, y, m, kind) {
    const isCoord = kind === "coord";
    const it = isCoord ? mapCoordOf(m) : mapScalebarOf(m);
    renderContextMenu(x, y, uiTextFor(isCoord ? (it.mode === "3d" ? "三维坐标" : "二维坐标") : "比例尺"), [
      { label: uiTextFor("拖动"), tip: uiTextFor("选它之后按住就能移动"), act: () => armMapGizmo(kind) },
      {
        // 「编辑」＝直接开坐标 / 比例尺编辑界面（轴名、标度、颜色白黑、尺寸都在那里面）
        label: uiTextFor("编辑…"),
        act: () => (isCoord ? askMapCoord() : askMapScalebar()),
      },
      { label: uiTextFor("删除"), danger: true, act: () => removeMapGizmo(kind) },
    ]);
  }

  /* 坐标 / 比例尺的交互：双击、长按 0.45 秒、右键「拖动」之后才能拖（和地点图标一样），
     这样平时点它们不会不小心挪位置。两种地图都用这一套。 */
  function bindMapGizmos(canvas, m) {
    $$(".map-overlay .map-gizmo", canvas).forEach((el) => {
      const kind = el.dataset.gizmo;
      const now = () => {
        const mm = maps().find((x) => x.id === m.id);
        if (!mm) return null;
        return kind === "coord" ? mapCoordOf(mm) : mapScalebarOf(mm);
      };
      const startDrag = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const g0 = now();
        if (!g0) return;
        const start = { x: ev.clientX, y: ev.clientY, gx: g0.x, gy: g0.y };
        const ov = canvas.querySelector(".map-overlay");
        const move = (e) => {
          const cur = now();
          const r = ov ? ov.getBoundingClientRect() : null;
          if (!cur || !r || !r.width || !r.height) return;
          cur.x = Math.max(0, Math.min(1, start.gx + (e.clientX - start.x) / r.width));
          cur.y = Math.max(0, Math.min(1, start.gy + (e.clientY - start.y) / r.height));
          const node = canvas.querySelector(`.map-overlay .map-gizmo[data-gizmo="${kind}"]`);
          if (node) {
            node.style.left = (cur.x * 100).toFixed(3) + "%";
            node.style.top = (cur.y * 100).toFixed(3) + "%";
          }
        };
        const up = () => {
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
          pendingUndoLabel = uiTextFor(kind === "coord" ? "移动地图上的坐标" : "移动地图上的比例尺");
          saveState();
          armMapGizmo("", false);
          mapGizmoSuppressClick = true;
          setTimeout(() => {
            mapGizmoSuppressClick = false;
          }, 500);
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      };
      el.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        if (mapGizmoArmed === kind) {
          startDrag(ev);
          return;
        }
        const started = [ev.clientX, ev.clientY];
        let fired = false;
        const timer = setTimeout(() => {
          fired = true;
          cleanup();
          armMapGizmo(kind);
          startDrag(ev);
        }, 450);
        const cleanup = () => {
          document.removeEventListener("mousemove", onMove, true);
          document.removeEventListener("mouseup", onUp, true);
        };
        const onMove = (e) => {
          if (Math.hypot(e.clientX - started[0], e.clientY - started[1]) > 6) {
            clearTimeout(timer);
            cleanup();
          }
        };
        const onUp = () => {
          if (!fired) clearTimeout(timer);
          cleanup();
        };
        document.addEventListener("mousemove", onMove, true);
        document.addEventListener("mouseup", onUp, true);
      });
      el.addEventListener("click", (ev) => {
        if (mapGizmoSuppressClick) return;
        if (mapGizmoArmed === kind) return;
        // 单击＝打开它的小菜单（和右键一样），免得误改
        ev.stopPropagation();
        showMapGizmoMenu(ev.clientX, ev.clientY, m, kind);
      });
      el.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        armMapGizmo(kind, mapGizmoArmed !== kind);
      });
      el.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        showMapGizmoMenu(ev.clientX, ev.clientY, m, kind);
      });
    });
  }

  // 地图上的取色（面板内的小浮层：调色板 + 彩虹自定义）

  // 地图上的取色（面板内的小浮层：调色板 + 彩虹自定义）
  let mapColorPop = null;
  let mapColorPopDocHandler = null;
  let mapColorPopPlace = null;
  function closeMapColorPop() {
    if (mapColorPopDocHandler) {
      document.removeEventListener("mousedown", mapColorPopDocHandler, true);
      mapColorPopDocHandler = null;
    }
    if (mapColorPop && mapColorPop.parentNode) mapColorPop.parentNode.removeChild(mapColorPop);
    mapColorPop = null;
    mapColorPopPlace = null;
  }
  uiOnZoomReflow(() => {
    if (mapColorPopPlace) mapColorPopPlace();
  });
  function openMapColorPop(x, y, current, onPick, anchorEl) {
    closeMapColorPop();
    const pop = document.createElement("div");
    pop.className = "map-color-pop";
    pop.innerHTML = CAT_COLORS.map(
      (c) => `<span class="swatch${c === current ? " selected" : ""}" data-color="${esc(c)}" style="background:${esc(c)}"></span>`
    ).join("") + `<span class="swatch rainbow" data-color="__custom__" title="${esc(uiTextFor("自定义颜色（色环 / RGB）"))}"></span>`;
    document.body.appendChild(pop);
    // x / y 是右键时的鼠标坐标（视觉 px）→ 写进 style 前除回界面缩放
    const place = () => {
      if (!pop.isConnected || !pop.parentNode) return;
      let px = x;
      let py = y;
      if (anchorEl && anchorEl.isConnected) {
        const r = uiVisualRect(anchorEl);
        px = r.left;
        py = r.bottom + 6;
      }
      pop.style.left = uiZoomPx(Math.max(4, px - 6));
      pop.style.top = uiZoomPx(Math.max(4, py - 6));
    };
    mapColorPopPlace = place;
    place();
    mapColorPop = pop;
    pop.querySelectorAll(".swatch").forEach((s) => {
      s.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (s.dataset.color === "__custom__") {
          const anchor = anchorEl || s;
          closeMapColorPop();
          openColorWheelPop(anchor, current, (hex) => onPick(hex));
          return;
        }
        const hex = s.dataset.color;
        closeMapColorPop();
        onPick(hex);
      });
    });
    // 点浮层外面才关：不能直接把 closeMapColorPop 挂上去 ——
    // 那样按下色块的那一下（mousedown）就会先把浮层删掉，click 落不到色块上，颜色永远改不了
    mapColorPopDocHandler = (ev) => {
      if (mapColorPop && mapColorPop.contains(ev.target)) return;
      closeMapColorPop();
    };
    setTimeout(() => document.addEventListener("mousedown", mapColorPopDocHandler, true), 0);
  }

  /* ---------- 新建地图弹窗 ---------- */

  // 「宽:高」→ 数值比例；也接受直接写一个小数
  function parseMapRatio(str) {
    const s = String(str == null ? "" : str)
      .trim()
      .replace(/：/g, ":")
      .replace(/[×xX]/g, ":");
    const m = /^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/.exec(s);
    if (m) {
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (w > 0 && h > 0) return Math.max(0.1, Math.min(10, w / h));
    }
    const n = Number(s);
    if (n > 0) return Math.max(0.1, Math.min(10, n));
    return 1;
  }

  function mapModalKind() {
    const el = document.querySelector('input[name="map-kind"]:checked');
    return el && el.value === "vector" ? "vector" : "board";
  }

  function mapModalMethod() {
    const el = document.querySelector('input[name="map-method"]:checked');
    return el && el.value === "image" ? "image" : "draw";
  }

  // 比例：数值 ↔ 「宽:高」文字
  function ratioText(a) {
    const n = Number(a) > 0 ? Number(a) : 1;
    return n >= 1 ? `${Math.round(n * 100) / 100}:1` : `1:${Math.round((1 / n) * 100) / 100}`;
  }

  // 地图卡右键「比例…」：改板块图的画布比例（可撤销）
  async function askMapAspect(m) {
    if (!m || m.kind !== "board") return;
    const v = await uiPrompt(uiTextFor("画布比例：填「宽:高」，如 1:1 / 4:3 / 16:9"), ratioText(m.aspect), uiTextFor("比例"));
    if (v === null) return;
    const r = parseMapRatio(v);
    if (!Number.isFinite(r) || r <= 0) return;
    pendingUndoLabel = uiSentence("mapAspectUndo", m.name, ratioText(r));
    m.aspect = r;
    saveState();
    renderMapRail();
    renderMapStage();
  }

  // 只有「板块图 + 绘制」才需要用户自己填比例；其余两种比例由图片决定（输入框灰掉，不隐藏）
  function syncMapModalFields() {
    // 编辑地图时不显示「类型 / 底图来自」这几行（比例改在下面单独那一栏）
    if (mapEditId) return;
    const kind = mapModalKind();
    const method = mapModalMethod();
    const methodField = $("#map-method-field");
    if (methodField) methodField.hidden = kind !== "board";
    const ratioEl = $("#map-ratio");
    const canType = kind === "board" && method === "draw";
    if (ratioEl) ratioEl.disabled = !canType;
    const ratioBox = $("#map-ratio-field");
    if (ratioBox) ratioBox.classList.toggle("is-disabled", !canType);
  }

  // 编辑中是哪张地图（打开「编辑…」时记下来；新建时为空）
  let mapEditId = "";

  function openMapModal(editId) {
    const editing = maps().find((x) => x.id === editId) || null;
    mapEditId = editing ? editing.id : "";
    const titleEl = $("#map-modal-title");
    if (titleEl) titleEl.textContent = uiTextFor(editing ? "编辑地图" : "新建地图");
    const kindField = $("#map-kind-row");
    const kindWrap = kindField && kindField.closest(".field");
    if (kindWrap) kindWrap.hidden = !!editing;
    const methodField = $("#map-method-field");
    if (methodField) methodField.hidden = !!editing;
    const editRatio = $("#map-edit-ratio-field");
    if (editRatio) editRatio.hidden = !editing || !editing.kind || editing.kind !== "board";
    const descEl = $("#map-desc");
    if (descEl) descEl.value = editing ? editing.desc || "" : "";
    // 界面里那两栏「坐标 / 比例尺」：编辑时带上原来的值，新建时留空（自动）
    writeCoordFields("map-new-coord", editing ? mapCoordOf(editing) : MAP_COORD_DEFAULT());
    writeScaleFields("map-new-scale", editing ? mapScalebarOf(editing) : MAP_SCALEBAR_DEFAULT());
    if (editing) {
      const er = $("#map-edit-ratio");
      if (er) er.value = ratioText(editing.aspect || 1);
    }
    const n = maps().length + 1;
    const nameEl = $("#map-name");
    if (nameEl) nameEl.value = editing ? editing.name || "" : uiSentence("mapDefaultName", n);
    const ratioEl = $("#map-ratio");
    if (ratioEl) ratioEl.value = "1:1";
    $$('input[name="map-kind"]').forEach((r) => {
      r.checked = r.value === "board";
    });
    $$('input[name="map-method"]').forEach((r) => {
      r.checked = r.value === "draw";
    });
    syncMapModalFields();
    openModal("map-modal");
    setTimeout(() => {
      if (nameEl) {
        nameEl.focus();
        try {
          nameEl.select();
        } catch (e) {
          /* ignore */
        }
      }
    }, 40);
  }

  function submitMapForm(ev) {
    if (ev) ev.preventDefault();
    const name = String(($("#map-name") || {}).value || "").trim();
    if (!name) return;
    const desc = String(($("#map-desc") || {}).value || "").trim();
    if (mapEditId) {
      // 编辑已有地图：名字 / 概述（板块图还能改比例）
      const cur = maps().find((x) => x.id === mapEditId);
      mapEditId = "";
      if (!cur) return;
      closeModal("map-modal");
      pendingUndoLabel = uiSentence("mapRenameUndo", cur.name, name);
      cur.name = name;
      cur.desc = desc;
      if (cur.kind === "board") {
        const r = parseMapRatio(($("#map-edit-ratio") || {}).value);
        if (Number.isFinite(r) && r > 0) cur.aspect = r;
      }
      applyCoordFields("map-new-coord", mapCoordOf(cur));
      applyScaleFields("map-new-scale", mapScalebarOf(cur));
      mapCoordOf(cur); // 重新推导 mode
      saveState();
      renderMapRail();
      renderMapStage();
      return;
    }
    const kind = mapModalKind();
    const method = kind === "board" ? mapModalMethod() : "image";
    const ratio = kind === "board" && method === "draw" ? parseMapRatio(($("#map-ratio") || {}).value) : 1;
    closeModal("map-modal");
    const m = {
      id: uid(),
      name,
      desc,
      kind,
      aspect: ratio,
      regions: [],
      icons: [],
      vector: null,
      createdAt: Date.now(),
    };
    pendingUndoLabel = uiSentence("mapCreateUndo", name);
    state.maps = maps().concat([m]);
    applyCoordFields("map-new-coord", mapCoordOf(m));
    applyScaleFields("map-new-scale", mapScalebarOf(m));
    mapCoordOf(m); // 重新推导 mode
    selectedMapId = m.id;
    saveState();
    renderMapRail();
    renderMapStage();
    if (kind === "board") {
      // 绘制：直接把绘制模式打开，用户接着画就行（走 enterMapDraw：要留「画之前」的快照给 Esc）；
      // 上传图片：立刻选图
      if (method === "draw") enterMapDraw();
      else importMapImage();
    } else {
      importMapImage();
    }
  }

  function importMapImage() {
    const m = selectedMap();
    if (!m) return;
    const input = $("#map-file-input");
    if (!input) return;
    input.value = "";
    input.click();
  }

  async function handleMapImage(file) {
    const m = selectedMap();
    if (!m || !file) return;
    /* 模拟图：直接把原图放上去（不再转成马赛克矢量图，画质太差），
       跟着边栏等比缩放就行。图片以 dataURL 存在项目里。 */
    if (m.kind !== "board") {
      try {
        let url = await fileToDataURL(file);
        let dim = await imageDims(url);
        /* 大图先缩一下再存：模拟图原图直接进项目（画质优先），但大图会把存档撑得很大。
           长边超过 1000 就等比缩到 1000 并转成 JPEG(0.9)——地图这种用途看不出差别，体积能小很多。 */
        if (dim && Math.max(dim.w, dim.h) > 1000) {
          const small = await downscaleDataURL(url, dim, 1000);
          if (small) {
            url = small;
            dim = await imageDims(url);
          }
        }
        pendingUndoLabel = uiTextFor("导入图片");
        m.image = url;
        m.vector = null;
        if (dim && dim.w && dim.h) m.aspect = dim.w / dim.h;
        if (!(m.icons || []).length) m.icons = [];
        saveState();
        renderMapRail();
        renderMapStage();
        showToast(uiTextFor("图片已经放上去了，可以双击空白处放地点图标。"));
        return;
      } catch (e) {
        uiAlert(uiTextFor("这张图片读不出来，换一张试试。"));
        return;
      }
    }
    let data;
    try {
      setAnalyzeStatus(uiTextFor("正在把图片转成矢量…"));
      data = await readImageFile(file, 300);
    } catch (e) {
      uiAlert(String((e && e.message) || e));
      return;
    }
    if (!data) {
      uiAlert(uiTextFor("这张图片读不出像素，换一张试试。"));
      return;
    }
    const regions = imageToBoardRegions(data, 40);
    if (!regions.length) {
      uiAlert(uiTextFor("这张图全是同一个色调，分不出板块：换一张边界清楚的图，或直接手绘。"));
      return;
    }
    pendingUndoLabel = uiTextFor("导入图片生成板块图");
    m.aspect = data.w / data.h;
    m.regions = regions.map((r, i) => ({ id: uid(), placeId: "", color: mapColorAt(i), pts: r.pts }));
    saveState();
    renderMapRail();
    renderMapStage();
    showToast(uiSentence("mapVectorDone", m.kind === "board" ? "board" : "vector"));
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("read"));
      fr.readAsDataURL(file);
    });
  }

  // 图片的原始宽高（算地图比例用）
  function imageDims(url) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => resolve(null);
      im.src = url;
    });
  }

  /* 长边缩到 maxSide 以内（保持比例），返回 dataURL；失败就返回空串（那就用原图）。
     输出的体积比原来大就不要（宁可用原图）。 */
  function downscaleDataURL(url, dim, maxSide) {
    return new Promise((resolve) => {
      try {
        const s = Math.min(1, Number(maxSide) / Math.max(dim.w, dim.h));
        const w = Math.max(1, Math.round(dim.w * s));
        const h = Math.max(1, Math.round(dim.h * s));
        const im = new Image();
        im.onload = () => {
          try {
            const cv = document.createElement("canvas");
            cv.width = w;
            cv.height = h;
            const ctx = cv.getContext("2d");
            if (!ctx) return resolve("");
            ctx.drawImage(im, 0, 0, w, h);
            const out = cv.toDataURL("image/jpeg", 0.9);
            resolve(out && out.length < String(url).length ? out : "");
          } catch (e) {
            resolve("");
          }
        };
        im.onerror = () => resolve("");
        im.src = url;
      } catch (e) {
        resolve("");
      }
    });
  }

  function bindMapPanel() {
    bindMapGutter();
    observeMapCanvas();
    const newBtn = $("#new-map-btn");
    if (newBtn)
      newBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openMapModal();
      });
    // 弹窗里：类型 / 底图来源一变，显示对应的字段
    $$('input[name="map-kind"], input[name="map-method"]').forEach((r) =>
      r.addEventListener("change", () => syncMapModalFields())
    );
    const mapForm = $("#map-form");
    if (mapForm) mapForm.addEventListener("submit", submitMapForm);
    const drawBtn = $("#map-draw-btn");
    if (drawBtn)
      drawBtn.addEventListener("click", () => {
        if (mapDrawMode) finishMapDraw(true);
        else enterMapDraw();
      });
    const pencilBtn = $("#map-pencil-btn");
    if (pencilBtn) pencilBtn.addEventListener("click", () => setMapTool("pencil"));
    const eraserBtn = $("#map-eraser-btn");
    if (eraserBtn) eraserBtn.addEventListener("click", () => setMapTool("eraser"));
    const doneBtn = $("#map-done-btn");
    if (doneBtn) doneBtn.addEventListener("click", () => finishMapDraw(true));
    const cancelBtn = $("#map-cancel-btn");
    if (cancelBtn) cancelBtn.addEventListener("click", () => finishMapDraw(false));
    // 画图状态下：Enter＝完成（保留），Esc＝取消（回到画之前）
    document.addEventListener(
      "keydown",
      (ev) => {
        if (!mapDrawMode) return;
        if (ev.key === "Enter" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
          ev.preventDefault();
          ev.stopPropagation();
          finishMapDraw(true);
          return;
        }
        if (ev.key === "Escape") {
          ev.preventDefault();
          ev.stopPropagation();
          finishMapDraw(false);
        }
      },
      true
    );
    const importBtn = $("#map-import-btn");
    if (importBtn) importBtn.addEventListener("click", () => importMapImage());
    const fileInput = $("#map-file-input");
    const coordForm = $("#map-coord-form");
    if (coordForm) coordForm.addEventListener("submit", submitMapCoordForm);
    const scaleForm = $("#map-scale-form");
    if (scaleForm) scaleForm.addEventListener("submit", submitMapScaleForm);
    // 四组「轴名 / 标度 + 颜色 + 尺寸」：填了内容才解禁颜色和尺寸
    ["map-coord", "map-new-coord", "map-scale", "map-new-scale"].forEach((prefix) => {
      const isCoord = /coord/.test(prefix);
      (isCoord ? ["x", "y", "z"] : ["text"]).forEach((suf) => {
        const el = $("#" + prefix + "-" + suf);
        if (el) el.addEventListener("input", () => syncGizmoFieldsDisabled(prefix));
      });
    });
    if (fileInput)
      fileInput.addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (f) handleMapImage(f);
      });
    // 拖一张图片到地图上也可以（模拟图/板块图都直接转）
    const canvas = $("#map-canvas");
    if (canvas) {
      canvas.addEventListener("dragover", (ev) => {
        if (mapDrawMode) return; // 绘制中不收拖进来的东西
        const dt = ev.dataTransfer;
        if (!dt) return;
        const hasFile = Array.from(dt.types || []).indexOf("Files") >= 0;
        if (!hasFile) return;
        ev.preventDefault();
        dt.dropEffect = "copy";
      });
      canvas.addEventListener("drop", (ev) => {
        if (mapDrawMode) return;
        const dt = ev.dataTransfer;
        if (!dt || !dt.files || !dt.files.length) return;
        ev.preventDefault();
        ev.stopPropagation();
        handleMapImage(dt.files[0]);
      });
      // 点了画布空白 / 别处＝退出「可拖动」状态；Esc 同理
      canvas.addEventListener("mousedown", (ev) => {
        if (!mapIconArmedId) return;
        if (ev.target.closest && ev.target.closest(".map-icon")) {
          const g = ev.target.closest(".map-icon");
          if (g.dataset.iconId === mapIconArmedId) return;
        }
        disarmMapIcon();
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape" && mapIconArmedId) disarmMapIcon();
      });
      canvas.addEventListener("contextmenu", (ev) => {
        const m = selectedMap();
        if (!m) return;
        if (mapDrawMode) {
          // 绘制中只画图：右键不开菜单
          ev.preventDefault();
          return;
        }
        if (ev.target.closest(".map-region") || ev.target.closest(".map-icon")) return;
        ev.preventDefault();
        disarmMapIcon(); // 在空白处右键＝退出拖动状态
        if (m.kind === "board") {
          renderContextMenu(ev.clientX, ev.clientY, uiTextFor("地图空白处"), [
            { label: uiTextFor("绘制区域"), act: () => enterMapDraw() },
            { label: uiTextFor("导入图片生成板块…"), act: () => importMapImage() },
            {
              label: uiTextFor("识别封闭区域"),
              tip: uiTextFor("把被形状围住的空隙也变成区域"),
              act: () => {
                const n = detectEnclosedRegions(m);
                if (!n) {
                  showToast(uiTextFor("没有找到新的封闭区域"));
                  return;
                }
                pendingUndoLabel = uiSentence("mapClosedFound", n);
                saveState();
                renderMapRail();
                renderMapStage();
                showToast(uiSentence("mapClosedFound", n));
              },
            },
          ]);
        }
      });
    }
  }

  /* 地图列表与画布之间那条分隔条：上下拖动＝改高度（双击＝回默认），高度记在本地 */
  const MAP_RAIL_H_KEY = "fiction_gui_map_rail_h_v1";
  const MAP_RAIL_H_DEF = 150;

  function mapRailHeight() {
    let v = 0;
    try {
      v = parseInt(localStorage.getItem(MAP_RAIL_H_KEY) || "", 10) || 0;
    } catch (e) {
      v = 0;
    }
    return v >= 56 ? v : MAP_RAIL_H_DEF;
  }

  function applyMapRailHeight(h) {
    const rail = $(".map-rail");
    if (!rail) return;
    const pane = $("#map-pane");
    const max = pane ? Math.max(80, Math.round(pane.getBoundingClientRect().height) - 140) : 600;
    const v = Math.max(56, Math.min(max, Math.round(h)));
    rail.style.height = v + "px";
  }

  function bindMapGutter() {
    const gutter = $("#map-gutter");
    const rail = $(".map-rail");
    const canvas2 = $("#map-canvas");
    if (!gutter || !rail) return;
    applyMapRailHeight(mapRailHeight());
    gutter.addEventListener("dblclick", () => {
      try {
        localStorage.removeItem(MAP_RAIL_H_KEY);
      } catch (e) {
        /* ignore */
      }
      applyMapRailHeight(MAP_RAIL_H_DEF);
      mapStageSig = "";
      renderMapStage();
    });
    gutter.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      const startY = ev.clientY;
      const startH = rail.getBoundingClientRect().height;
      document.body.classList.add("pane-resizing-row");
      const move = (e) => {
        applyMapRailHeight(startH + (e.clientY - startY));
        // 同样只重新对齐，不整块重画（拖的时候要跟手）
        const mm = selectedMap();
        if (mm && canvas2) syncMapOverlay(canvas2, mm.kind === "board" ? boardViewBox(mm) : vectorViewBox(mm));
      };
      const up = () => {
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("mouseup", up, true);
        document.body.classList.remove("pane-resizing-row");
        try {
          localStorage.setItem(MAP_RAIL_H_KEY, String(Math.round(rail.getBoundingClientRect().height)));
        } catch (e) {
          /* ignore */
        }
      };
      document.addEventListener("mousemove", move, true);
      document.addEventListener("mouseup", up, true);
    });
  }

  /* 画布尺寸一变（边栏拖宽 / 折叠 / 拉高）就重画：图上的字号要按新的缩放重算 */
  let mapResizeObs = null;
  function observeMapCanvas() {
    const canvas = $("#map-canvas");
    if (!canvas || mapResizeObs || typeof ResizeObserver !== "function") return;
    mapResizeObs = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // 只把「地图内容那一块」和 HTML 图层重新对齐：
      // 地图本身是 SVG，会自己跟着缩放；整块重画（几百个格子）会卡、还会和背景不同步
      const m = selectedMap();
      if (!m) return;
      syncMapOverlay(canvas, m.kind === "board" ? boardViewBox(m) : vectorViewBox(m));
      // 地图变大 / 变小，坐标和比例尺跟着等比变（字号不变），再确认没跑出地图
      syncMapGizmoScale(canvas, m);
      clampMapGizmos(canvas, m);
    });
    mapResizeObs.observe(canvas);
  }
