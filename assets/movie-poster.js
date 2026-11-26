/* 观看海报：把「本月 / 本年看过的电影」拼成一张可导出的长图。
 *
 * 纯 Canvas2D 绘制 + 手写最小 PDF 封装（JPEG /DCTDecode 直嵌），不引入第三方库。
 * 排版按影片数量自动换档：1–3 部用大卡，4–6 部 3 列，7–12 部 4 列，
 * 13–24 部 5 列，更多则 6 列；高度随行数增长，保证每一部都完整露出。
 * 数量够多时，背景先铺一层半透明的散落海报（模糊 + 提亮）当氛围，
 * 前景网格仍然是清晰可读的 —— 叠加只做景深，不压住片名。
 *
 * 海报图源（image.tmdb.org / images.metahub.space）都回 Access-Control-Allow-Origin: *，
 * crossOrigin 取图后画布不会被污染，toBlob 可直接导出。
 * 任何一张图取不到就退回「主题色渐变 + 片名」占位，不影响整张海报。
 */
window.MoviePoster = (function () {
  'use strict';

  const W = 1800;
  const PAD = 110;
  const BG = '#fbf8f6';
  const INK = '#2f2a2c';
  const MUTED = '#8d8286';
  const SERIF = '"Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", SimSun, Georgia, serif';
  const SANS = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif';
  const LOAD_TIMEOUT = 15000;
  const PARALLEL = 6;
  // 预览与原尺寸画布各自的像素预算：191 部时原图是 1800×16000+，
  // 一次性分配会直接吃掉几百 MB，必须按预算等比缩放。
  const PREVIEW_PIXELS = 10e6;
  const MAX_EXPORT_PIXELS = 24e6;

  /* ---------------- 基础工具 ---------------- */

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function hexToRgb(hex) {
    const value = String(hex || '').trim().replace('#', '');
    const full = value.length === 3
      ? value.split('').map(function (c) { return c + c; }).join('')
      : value;
    if (!/^[0-9a-f]{6}$/i.test(full)) return [226, 106, 141];
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16)
    ];
  }

  function rgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + alpha + ')';
  }

  // 与海报尺寸无关的确定性伪随机：同一份片单每次生成的花纹一致。
  function seeded(seed) {
    let state = seed | 0;
    return function () {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 按卡片实际宽度挑图档：191 部时全取 w780 会解出上百 MB，直接把标签页拖死。
  // TMDB 走 w342 / w500 / w780，Cinemeta 走 medium / large。
  function hiRes(url, need) {
    if (!url) return '';
    const target = Number(need) || 342;
    const value = String(url);
    if (/image\.tmdb\.org/.test(value)) {
      const size = target <= 342 ? 342 : target <= 500 ? 500 : 780;
      return value.replace(/\/t\/p\/w\d+\//, '/t/p/w' + size + '/');
    }
    return value.replace(/\/poster\/(?:small|medium)\//,
      target <= 400 ? '/poster/medium/' : '/poster/large/');
  }

  function fitText(ctx, text, maxWidth) {
    const raw = String(text || '');
    if (ctx.measureText(raw).width <= maxWidth) return raw;
    let cut = raw;
    while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut.length > 1 ? cut + '…' : raw.slice(0, 1);
  }

  /* ---------------- 排版分档 ---------------- */

  function layoutFor(count) {
    const inner = W - PAD * 2;
    let cols;
    let gap;
    if (count <= 3) {
      cols = Math.max(1, count);
      gap = 54;
    } else if (count <= 6) {
      cols = 3;
      gap = 40;
    } else if (count <= 12) {
      cols = 4;
      gap = 34;
    } else if (count <= 24) {
      cols = 5;
      gap = 30;
    } else {
      cols = 6;
      gap = 26;
    }

    let cardW;
    if (count === 1) cardW = 620;
    else if (count === 2) cardW = 600;
    else if (count === 3) cardW = 470;
    else cardW = (inner - gap * (cols - 1)) / cols;
    cardW = Math.floor(cardW);

    const cardH = Math.round(cardW * 1.5);
    const rows = Math.max(1, Math.ceil(count / cols));
    const labelH = count <= 3 ? 64 : 54;
    const rowGap = count <= 3 ? 74 : 56;
    const headerH = count <= 2 ? 720 : 660;
    const gridH = rows * (cardH + labelH) + (rows - 1) * rowGap;
    const height = Math.round(headerH + gridH + 210);

    return {
      cols: cols,
      gap: gap,
      cardW: cardW,
      cardH: cardH,
      rows: rows,
      labelH: labelH,
      rowGap: rowGap,
      headerH: headerH,
      height: height
    };
  }

  /* ---------------- 图片加载 ---------------- */

  function loadImage(url) {
    return new Promise(function (resolve) {
      if (!url) {
        resolve(null);
        return;
      }
      const img = new Image();
      let settled = false;
      const finish = function (value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(function () { finish(null); }, LOAD_TIMEOUT);
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.onload = function () {
        finish(img.naturalWidth && img.naturalHeight ? img : null);
      };
      img.onerror = function () { finish(null); };
      img.src = url;
    });
  }

  async function loadAll(urls, onStep) {
    const result = new Array(urls.length);
    let next = 0;
    let done = 0;
    async function worker() {
      while (next < urls.length) {
        const index = next;
        next += 1;
        result[index] = await loadImage(urls[index]);
        done += 1;
        if (onStep) onStep(done, urls.length);
      }
    }
    const workers = [];
    for (let i = 0; i < Math.min(PARALLEL, urls.length); i += 1) workers.push(worker());
    await Promise.all(workers);
    return result;
  }

  /* ---------------- 绘制 ---------------- */

  function paintArt(ctx, img, film, x, y, w, h, radius, accent) {
    ctx.save();
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    if (img) {
      const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const iw = img.naturalWidth * scale;
      const ih = img.naturalHeight * scale;
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    } else {
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, rgba(accent, 0.24));
      grad.addColorStop(0.55, '#f3ebe7');
      grad.addColorStop(1, '#e6dbd7');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = INK;
      ctx.font = '500 ' + Math.round(w * 0.15) + 'px ' + SERIF;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, film.title || '未命名', w * 0.78), x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  function paintBackdrop(ctx, L, images, accent, count) {
    if (count < 4) return;
    const rand = seeded(count * 977 + 37);
    const picks = [];
    const take = Math.min(count, 14);
    for (let i = 0; i < take; i += 1) {
      picks.push(images[Math.floor((i * count) / take)]);
    }

    ctx.save();
    picks.forEach(function (img) {
      const w = 620 + rand() * 460;
      const h = w * 1.5;
      const x = -w * 0.3 + rand() * (W + w * 0.15);
      const y = rand() * (L.height + h * 0.2) - h * 0.3;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((rand() - 0.5) * 0.44);
      ctx.globalAlpha = 0.14 + rand() * 0.12;
      if (img) {
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale / 2,
          img.naturalWidth * scale, img.naturalHeight * scale);
      } else {
        ctx.fillStyle = rgba(accent, 0.5);
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
    });
    ctx.restore();

    // 氛围层退到背景：提亮到只留色块，前景标题与片名始终清楚。
    ctx.fillStyle = 'rgba(251, 248, 246, 0.7)';
    ctx.fillRect(0, 0, W, L.height);

    const top = ctx.createRadialGradient(W * 0.5, -L.height * 0.1, 0,
      W * 0.5, -L.height * 0.1, W * 0.95);
    top.addColorStop(0, rgba(accent, 0.16));
    top.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, L.height * 0.6);
  }

  function heroGeometry(count) {
    if (count === 1) return { w: 420, h: 630, step: 0, tilt: [-0.03], dy: [0] };
    if (count === 2) return { w: 340, h: 510, step: 170, tilt: [-0.09, 0.04], dy: [26, 0] };
    return { w: 286, h: 429, step: 138, tilt: [-0.115, 0.02, 0.105], dy: [30, 0, 22] };
  }

  function paintHero(ctx, L, films, images, accent, frame) {
    const count = films.length;
    const geo = heroGeometry(count);
    const shown = Math.min(count, 3);
    const totalW = geo.w + geo.step * (shown - 1);
    const startX = W - PAD - totalW;
    const baseY = 128;
    const pad = count === 1 ? 16 : 12;

    for (let i = 0; i < shown; i += 1) {
      const x = startX + geo.step * i;
      const y = baseY + geo.dy[i];
      ctx.save();
      ctx.translate(x + geo.w / 2, y + geo.h / 2);
      ctx.rotate(geo.tilt[i]);
      ctx.shadowColor = 'rgba(58, 38, 43, 0.26)';
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 18;
      ctx.fillStyle = '#fff';
      roundRect(ctx, -geo.w / 2 - pad, -geo.h / 2 - pad,
        geo.w + pad * 2, geo.h + pad * 2, 6);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      paintArt(ctx, images[i], films[i], -geo.w / 2, -geo.h / 2, geo.w, geo.h, 3, accent);
      ctx.restore();
    }

    // 相片堆叠的阴影统一压在下方，避免互相盖章。
    frame.heroBottom = baseY + geo.h + 40;
  }

  function paintHeader(ctx, L, films, images, accent, meta) {
    const frame = {};
    paintHero(ctx, L, films, images, accent, frame);

    const heroLeft = frame.heroBottom ? W - PAD - (heroGeometry(films.length).w +
      heroGeometry(films.length).step * (Math.min(films.length, 3) - 1)) : W - PAD;
    const maxW = Math.max(420, heroLeft - PAD - 70);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = rgba(accent, 1);
    ctx.font = '600 26px ' + SANS;
    ctx.fillText('观 影 记 录', PAD, 196);

    let size = 96;
    ctx.font = '500 ' + size + 'px ' + SERIF;
    while (size > 54 && ctx.measureText(meta.title).width > maxW) {
      size -= 4;
      ctx.font = '500 ' + size + 'px ' + SERIF;
    }
    ctx.fillStyle = INK;
    ctx.fillText(meta.title, PAD, 196 + size + 34);

    ctx.fillStyle = MUTED;
    ctx.font = '400 32px ' + SANS;
    ctx.fillText(meta.subtitle, PAD, 196 + size + 34 + 62);

    ctx.strokeStyle = 'rgba(47, 42, 44, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, L.headerH - 34);
    ctx.lineTo(W - PAD, L.headerH - 34);
    ctx.stroke();
  }

  function paintGrid(ctx, L, films, images, accent) {
    const innerWidth = L.cols * L.cardW + (L.cols - 1) * L.gap;
    const startX = Math.round((W - innerWidth) / 2);
    const top = L.headerH;

    films.forEach(function (film, index) {
      const col = index % L.cols;
      const row = Math.floor(index / L.cols);
      const x = startX + col * (L.cardW + L.gap);
      const y = top + row * (L.cardH + L.labelH + L.rowGap);

      // 191 张卡片各做一次高斯阴影会把主线程按住几十秒：
      // 用一层偏移的纯色圆角矩形代替模糊阴影，层次还在，代价接近 0。
      ctx.save();
      ctx.fillStyle = 'rgba(58, 38, 43, 0.09)';
      roundRect(ctx, x + 2, y + 12, L.cardW, L.cardH, 16);
      ctx.fill();
      ctx.restore();

      paintArt(ctx, images[index], film, x, y, L.cardW, L.cardH, 16, accent);

      ctx.save();
      roundRect(ctx, x, y, L.cardW, L.cardH, 16);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      const nameY = y + L.cardH + (L.labelH > 58 ? 44 : 36);
      const rating = Number(film.rating) > 0 ? Number(film.rating).toFixed(1) : '';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '500 ' + (L.cardW > 400 ? 26 : 22) + 'px ' + SANS;
      ctx.fillStyle = INK;
      const ratingWidth = rating ? 56 : 0;
      ctx.fillText(fitText(ctx, film.title || '未命名', L.cardW - ratingWidth), x, nameY);

      if (rating) {
        ctx.textAlign = 'right';
        ctx.fillStyle = rgba(accent, 1);
        ctx.font = '600 ' + (L.cardW > 400 ? 24 : 20) + 'px ' + SANS;
        ctx.fillText(rating, x + L.cardW, nameY);
      }
    });
  }

  function paintFooter(ctx, L, meta) {
    const y = L.height - 84;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '400 24px ' + SANS;
    ctx.fillStyle = MUTED;
    ctx.fillText('人生日历 · LIFE CALENDAR', PAD, y);
    ctx.textAlign = 'right';
    ctx.fillText(meta.stamp, W - PAD, y);
  }

  function paint(canvas, films, images, meta, scale) {
    const L = layoutFor(films.length);
    const ratio = scale > 0 ? scale : 1;
    canvas.width = Math.round(W * ratio);
    canvas.height = Math.round(L.height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');

    // 所有绘制都按 1800 宽的坐标写，缩放交给变换矩阵：
    // 预览用小尺寸，导出时才按原尺寸重画一遍。
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, L.height);
    paintBackdrop(ctx, L, images, meta.accent, films.length);
    paintHeader(ctx, L, films, images, meta.accent, meta);
    paintGrid(ctx, L, films, images, meta.accent);
    paintFooter(ctx, L, meta);
    return L;
  }

  /* ---------------- 导出 ---------------- */

  function canvasBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('图片编码失败'));
        }, type, quality);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 最小 PDF：单页，整页嵌入 JPEG（DCTDecode），150 dpi。
  function buildPdf(jpegBytes, width, height) {
    const pageW = Math.round((width * 72) / 150 * 100) / 100;
    const pageH = Math.round((height * 72) / 150 * 100) / 100;
    const chunks = [];
    const offsets = {};
    let size = 0;
    const encoder = new TextEncoder();

    function put(text) {
      const bytes = encoder.encode(text);
      chunks.push(bytes);
      size += bytes.length;
    }
    function putBytes(bytes) {
      chunks.push(bytes);
      size += bytes.length;
    }
    function object(num, body) {
      offsets[num] = size;
      put(num + ' 0 obj\n' + body + '\nendobj\n');
    }

    put('%PDF-1.4\n');
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    object(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW + ' ' + pageH +
      '] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>');
    const content = 'q\n' + pageW + ' 0 0 ' + pageH + ' 0 0 cm\n/Im0 Do\nQ\n';
    object(4, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream');

    offsets[5] = size;
    put('5 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + width +
      ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
      ' /Filter /DCTDecode /Length ' + jpegBytes.length + ' >>\nstream\n');
    putBytes(jpegBytes);
    put('\nendstream\nendobj\n');

    const xref = size;
    put('xref\n0 6\n0000000000 65535 f \n');
    for (let i = 1; i <= 5; i += 1) {
      put(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    }
    put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    return new Blob(chunks, { type: 'application/pdf' });
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }

  /* ---------------- 预览与导出界面 ---------------- */

  const ICON_CLOSE = '×';

  function open(options) {
    const films = (options.items || []).slice();
    if (!films.length) return;

    const overlay = document.createElement('div');
    overlay.className = 'poster-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'poster-title');
    overlay.innerHTML =
      '<div class="poster-panel">' +
      '<header class="poster-bar">' +
      '<div class="poster-bar-text">' +
      '<h2 id="poster-title">观看海报</h2>' +
      '<p class="poster-sub" data-poster-status>' + films.length + ' 部 · 正在加载海报…</p>' +
      '</div>' +
      '<button type="button" class="expense-close poster-close" aria-label="关闭">' +
      ICON_CLOSE + '</button>' +
      '</header>' +
      '<div class="poster-stage" data-stage>' +
      '<p class="poster-note">正在加载 ' + films.length + ' 张海报…</p>' +
      '</div>' +
      '<footer class="poster-foot">' +
      '<span class="poster-hint" data-size></span>' +
      '<span class="poster-actions">' +
      '<button type="button" class="btn btn-sm" data-export="png" disabled>PNG</button>' +
      '<button type="button" class="btn btn-sm" data-export="jpg" disabled>JPG</button>' +
      '<button type="button" class="btn btn-sm btn-primary" data-export="pdf" disabled>PDF</button>' +
      '</span>' +
      '</footer>' +
      '</div>';
    document.body.appendChild(overlay);

    const stage = overlay.querySelector('[data-stage]');
    const status = overlay.querySelector('[data-poster-status]');
    const hint = overlay.querySelector('[data-size]');
    const closeButton = overlay.querySelector('.poster-close');
    const exportButtons = overlay.querySelectorAll('[data-export]');

    let imagesRef = null;
    let fullCanvas = null;
    let filename = options.fileBase || '观看海报';
    let previewUrl = '';

    function close() {
      if (!overlay.isConnected) return;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const entry = document.querySelector('[data-poster-open]');
      if (entry) entry.focus();
    }

    function onKey(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    }

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        close();
        return;
      }
      if (event.target.closest('.poster-close')) {
        close();
        return;
      }
      const button = event.target.closest('[data-export]');
      if (button && imagesRef && !button.disabled) {
        exportAs(button.dataset.export, button);
      }
    });
    document.addEventListener('keydown', onKey);
    closeButton.focus();

    // 导出用的原尺寸画布：第一次导出时绘制并缓存，避免每次导出重画 191 张海报。
    async function ensureFull() {
      if (fullCanvas) return fullCanvas;
      const L = layoutFor(films.length);
      const ratio = Math.min(1, Math.sqrt(MAX_EXPORT_PIXELS / (W * L.height)));
      hint.textContent = '正在生成 ' + Math.round(W * ratio) + ' × ' +
        Math.round(L.height * ratio) + ' px…';
      // 先把提示刷到屏幕上，再开始同步绘制。
      await new Promise(function (resolve) { setTimeout(resolve, 30); });
      if (!overlay.isConnected) return null;
      const target = document.createElement('canvas');
      paint(target, films, imagesRef,
        Object.assign({}, options, { subtitle: subtitleFor(films) }), ratio);
      fullCanvas = target;
      hint.textContent = target.width + ' × ' + target.height + ' px';
      return target;
    }

    async function exportAs(kind, button) {
      const previous = button.textContent;
      Array.prototype.forEach.call(exportButtons, function (item) { item.disabled = true; });
      button.textContent = '导出中…';
      try {
        const target = await ensureFull();
        if (!target) return;
        if (kind === 'pdf') {
          const jpeg = await canvasBlob(target, 'image/jpeg', 0.92);
          const pdf = buildPdf(new Uint8Array(await jpeg.arrayBuffer()),
            target.width, target.height);
          saveBlob(pdf, filename + '.pdf');
        } else if (kind === 'jpg') {
          saveBlob(await canvasBlob(target, 'image/jpeg', 0.94), filename + '.jpg');
        } else {
          saveBlob(await canvasBlob(target, 'image/png'), filename + '.png');
        }
      } catch (error) {
        hint.textContent = '导出失败：' + (error && error.message ? error.message : '未知错误');
      } finally {
        button.textContent = previous;
        Array.prototype.forEach.call(exportButtons, function (item) { item.disabled = false; });
      }
    }

    (async function build() {
      try {
        const L = layoutFor(films.length);
        const urls = films.map(function (film) { return hiRes(film.cover, L.cardW); });
        imagesRef = await loadAll(urls, function (done, total) {
          if (!overlay.isConnected) return;
          status.textContent = films.length + ' 部 · 正在加载海报 ' + done + '/' + total;
        });
        if (!overlay.isConnected) return;

        // 预览按像素预算缩放：191 部时原尺寸约 1800×16000，
        // 直接画原尺寸会卡死甚至拖垮标签页；导出时再单独画原尺寸。
        const ratio = Math.min(1, Math.sqrt(PREVIEW_PIXELS / (W * L.height)));
        const previewCanvas = document.createElement('canvas');
        paint(previewCanvas, films, imagesRef,
          Object.assign({}, options, { subtitle: subtitleFor(films) }), ratio);
        const preview = await canvasBlob(previewCanvas, 'image/jpeg', 0.88);
        previewCanvas.width = 1;
        previewCanvas.height = 1;
        if (!overlay.isConnected) return;

        previewUrl = URL.createObjectURL(preview);
        stage.innerHTML = '';
        const img = document.createElement('img');
        img.className = 'poster-preview';
        img.alt = (options.title || '观看') + '海报预览';
        img.src = previewUrl;
        stage.appendChild(img);

        status.textContent = films.length + ' 部 · ' + L.rows + ' 行 × ' + L.cols + ' 列';
        hint.textContent = '约 ' + W + ' × ' + L.height + ' px';
        Array.prototype.forEach.call(exportButtons, function (button) {
          button.disabled = false;
        });
      } catch (error) {
        if (!overlay.isConnected) return;
        stage.innerHTML = '<p class="poster-note">海报生成失败：' +
          escapeHtml(error && error.message ? error.message : '未知错误') + '</p>';
        status.textContent = '生成失败';
      }
    })();
  }

  function subtitleFor(films) {
    const dates = films.map(function (film) { return String(film.added || ''); })
      .filter(function (value) { return /^\d{4}-\d{2}-\d{2}$/.test(value); })
      .sort();
    const count = films.length + ' 部';
    if (!dates.length) return count;
    const from = dates[0];
    const to = dates[dates.length - 1];
    const fmt = function (value) { return value.slice(0, 7).replace('-', '.'); };
    return from === to ? count + ' · ' + fmt(from) : count + ' · ' + fmt(from) + ' — ' + fmt(to);
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  return { open: open, layoutFor: layoutFor, buildPdf: buildPdf };
})();
