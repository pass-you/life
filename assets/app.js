/* 人生日历 — 年 / 月 / 日 三级日历，数据保存在 localStorage。 */
(function () {
  'use strict';

  const MIN_YEAR = 2006;
  const MAX_YEAR = 2106;
  const STORE_KEY = 'life-calendar:v1';
  const DEFAULT_COLOR = '#e26a8d';
  const PRESETS = [
    { name: '樱粉', color: '#e26a8d' },
    { name: '杏橙', color: '#dd8a55' },
    { name: '雾紫', color: '#8d7cc9' },
    { name: '湖蓝', color: '#4f8fc4' },
    { name: '青瓷', color: '#4aa38c' },
    { name: '麦金', color: '#b4912f' }
  ];
  const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

  const app = document.getElementById('app');
  const crumbsEl = document.getElementById('crumbs');
  const swatchEl = document.getElementById('swatches');
  const colorInput = document.getElementById('colorInput');
  const todayHint = document.getElementById('todayHint');

  /* ---------------- 日期工具 ---------------- */

  function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  // 周一为 0，周日为 6
  function firstWeekdayIndex(year, month) {
    return (new Date(year, month - 1, 1).getDay() + 6) % 7;
  }

  function weekdayName(year, month, day) {
    return WEEKDAYS[(new Date(year, month - 1, day).getDay() + 6) % 7];
  }

  function shiftMonth(year, month, delta) {
    const index = year * 12 + (month - 1) + delta;
    const nextYear = Math.floor(index / 12);
    const nextMonth = (index % 12 + 12) % 12 + 1;
    if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) return null;
    return { y: nextYear, m: nextMonth };
  }

  function shiftDay(year, month, day, delta) {
    const date = new Date(year, month - 1, day + delta);
    const nextYear = date.getFullYear();
    if (nextYear < MIN_YEAR || nextYear > MAX_YEAR) return null;
    return { y: nextYear, m: date.getMonth() + 1, d: date.getDate() };
  }

  /* ---------------- 数据存储 ---------------- */

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const years = parsed.years && typeof parsed.years === 'object' && !Array.isArray(parsed.years)
        ? parsed.years
        : {};
      const color = typeof parsed.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.color)
        ? parsed.color.toLowerCase()
        : DEFAULT_COLOR;
      return { color: color, years: years };
    } catch (err) {
      return null;
    }
  }

  const state = loadState() || { color: DEFAULT_COLOR, years: {} };

  function yearNode(year, create) {
    const key = String(year);
    if (!Object.prototype.hasOwnProperty.call(state.years, key) || !state.years[key]) {
      if (!create) return null;
      state.years[key] = { plan: '', months: {} };
    }
    const node = state.years[key];
    if (typeof node !== 'object' || Array.isArray(node)) {
      if (!create) return null;
      state.years[key] = { plan: '', months: {} };
      return state.years[key];
    }
    if (typeof node.plan !== 'string') node.plan = '';
    if (!node.months || typeof node.months !== 'object' || Array.isArray(node.months)) {
      node.months = {};
    }
    return node;
  }

  function monthNode(year, month, create) {
    const yNode = yearNode(year, create);
    if (!yNode) return null;
    const key = String(month);
    if (!Object.prototype.hasOwnProperty.call(yNode.months, key) || !yNode.months[key]) {
      if (!create) return null;
      yNode.months[key] = { plan: '', days: {} };
    }
    const node = yNode.months[key];
    if (typeof node !== 'object' || Array.isArray(node)) {
      if (!create) return null;
      yNode.months[key] = { plan: '', days: {} };
      return yNode.months[key];
    }
    if (typeof node.plan !== 'string') node.plan = '';
    if (!node.days || typeof node.days !== 'object' || Array.isArray(node.days)) {
      node.days = {};
    }
    return node;
  }

  function dayNode(year, month, day, create) {
    const mNode = monthNode(year, month, create);
    if (!mNode) return null;
    const key = String(day);
    if (!Object.prototype.hasOwnProperty.call(mNode.days, key) || !mNode.days[key]) {
      if (!create) return null;
      mNode.days[key] = { work: '', next: '' };
    }
    const node = mNode.days[key];
    if (typeof node !== 'object' || Array.isArray(node)) {
      if (!create) return null;
      mNode.days[key] = { work: '', next: '' };
      return mNode.days[key];
    }
    if (typeof node.work !== 'string') node.work = '';
    if (typeof node.next !== 'string') node.next = '';
    return node;
  }

  const yearPlanOf = function (year) {
    const node = yearNode(year);
    return node ? node.plan : '';
  };

  const monthPlanOf = function (year, month) {
    const node = monthNode(year, month);
    return node ? node.plan : '';
  };

  function hasDayContent(node) {
    return !!node && (!!(node.work || '').trim() || !!(node.next || '').trim());
  }

  function countDays(node) {
    if (!node || !node.days) return 0;
    return Object.keys(node.days).filter(function (key) {
      return hasDayContent(node.days[key]);
    }).length;
  }

  function monthHasContent(node) {
    if (!node) return false;
    if ((node.plan || '').trim()) return true;
    if (!node.days) return false;
    return Object.keys(node.days).some(function (key) {
      return hasDayContent(node.days[key]);
    });
  }

  function yearHasContent(node) {
    if (!node) return false;
    if ((node.plan || '').trim()) return true;
    if (!node.months) return false;
    return Object.keys(node.months).some(function (key) {
      return monthHasContent(node.months[key]);
    });
  }

  function recordedDaysInYear(year) {
    const node = yearNode(year);
    if (!node) return 0;
    let total = 0;
    for (let m = 1; m <= 12; m += 1) {
      total += countDays(node.months[String(m)]);
    }
    return total;
  }

  let saveTimer = 0;

  function setSaveState(text) {
    app.querySelectorAll('[data-save-state]').forEach(function (el) {
      el.textContent = text;
    });
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      setSaveState('本地存储不可用，未能保存');
      return false;
    }
  }

  function queueSave() {
    clearTimeout(saveTimer);
    setSaveState('保存中…');
    saveTimer = setTimeout(function () {
      if (persist()) setSaveState('已保存');
    }, 300);
  }

  window.addEventListener('beforeunload', function () {
    clearTimeout(saveTimer);
    persist();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearTimeout(saveTimer);
      persist();
    }
  });

  /* ---------------- 主题色 ---------------- */

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    return [
      parseInt(value.slice(0, 2), 16),
      parseInt(value.slice(2, 4), 16),
      parseInt(value.slice(4, 6), 16)
    ];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) {
      const clamped = Math.min(255, Math.max(0, Math.round(v)));
      return clamped.toString(16).padStart(2, '0');
    }).join('');
  }

  function mix(hexA, hexB, amount) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    return rgbToHex(a.map(function (v, i) {
      return v + (b[i] - v) * amount;
    }));
  }

  function channelLuminance(value) {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function luminance(hex) {
    const rgb = hexToRgb(hex);
    return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2]);
  }

  // 保证强调色文字在白底上可读（对比度 >= 4.5）
  function inkFor(hex) {
    let color = hex;
    for (let i = 0; i < 16 && 1.05 / (luminance(color) + 0.05) < 4.5; i += 1) {
      color = mix(color, '#000000', 0.1);
    }
    return color;
  }

  function applyTheme(hex, shouldPersist) {
    const root = document.documentElement;
    const rgb = hexToRgb(hex);
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-ink', inkFor(hex));
    root.style.setProperty('--accent-soft', mix(hex, '#ffffff', 0.9));
    root.style.setProperty('--accent-ghost', mix(hex, '#ffffff', 0.95));
    root.style.setProperty('--accent-line', mix(hex, '#ffffff', 0.55));
    root.style.setProperty('--accent-glow', 'rgba(' + rgb.join(', ') + ', 0.16)');
    root.style.setProperty('--accent-glow-soft', 'rgba(' + rgb.join(', ') + ', 0.07)');

    colorInput.value = hex;
    Array.prototype.forEach.call(swatchEl.children, function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.color === hex));
    });

    state.color = hex;
    if (shouldPersist) persist();
  }

  function buildSwatches() {
    swatchEl.innerHTML = PRESETS.map(function (preset) {
      return '<button type="button" class="swatch" aria-pressed="false" aria-label="主题色：' +
        preset.name + '" title="' + preset.name + '" data-color="' + preset.color +
        '" style="--sw:' + preset.color + '"></button>';
    }).join('');

    swatchEl.addEventListener('click', function (event) {
      const btn = event.target.closest('.swatch');
      if (!btn) return;
      applyTheme(btn.dataset.color, true);
    });
  }

  /* ---------------- 渲染工具 ---------------- */

  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ESC_MAP[ch];
    });
  }

  function setCrumbs(parts) {
    const items = [{ label: '全部年份', href: '#/' }].concat(parts);
    crumbsEl.innerHTML = items.map(function (item, index) {
      const sep = index ? '<span class="sep" aria-hidden="true">/</span>' : '';
      const isLast = index === items.length - 1;
      if (isLast) {
        return sep + '<span class="current" aria-current="page">' + esc(item.label) + '</span>';
      }
      return sep + '<a href="' + item.href + '">' + esc(item.label) + '</a>';
    }).join('');
  }

  function bindEditor(selector, getValue, setValue) {
    const el = app.querySelector(selector);
    if (!el) return;
    el.value = getValue() || '';
    el.addEventListener('input', function () {
      setValue(el.value);
      queueSave();
    });
  }

  function reviewMarkup(kind, year, month, day) {
    if (kind === 'year') {
      const prevYear = year - 1;
      if (prevYear < MIN_YEAR) {
        return '<aside class="review"><div class="review-head"><h3>没有更早的年份</h3></div>' +
          '<p class="review-empty">2006 年是最早的一年。</p></aside>';
      }
      const text = (yearPlanOf(prevYear) || '').trim();
      return '<aside class="review" aria-label="' + prevYear + ' 年年度计划">' +
        '<div class="review-head"><h3>' + prevYear + ' 年 · 年度计划</h3>' +
        '<a class="review-link" href="#/' + prevYear + '">前往 ' + prevYear + ' 年</a></div>' +
        (text
          ? '<p class="review-body">' + esc(text) + '</p>'
          : '<p class="review-empty">这一年还没有写下年度计划。</p>') +
        '</aside>';
    }

    if (kind === 'month') {
      const prev = shiftMonth(year, month, -1);
      if (!prev) {
        return '<aside class="review"><div class="review-head"><h3>没有更早的月份</h3></div>' +
          '<p class="review-empty">2006 年 1 月是最早的一个月。</p></aside>';
      }
      const text = (monthPlanOf(prev.y, prev.m) || '').trim();
      const recorded = countDays(monthNode(prev.y, prev.m));
      return '<aside class="review" aria-label="' + prev.y + ' 年 ' + prev.m + ' 月月计划">' +
        '<div class="review-head"><h3>' + prev.y + ' 年 ' + prev.m + ' 月 · 月计划</h3>' +
        '<a class="review-link" href="#/' + prev.y + '/' + prev.m + '">前往 ' + prev.m + ' 月</a></div>' +
        (text
          ? '<p class="review-body">' + esc(text) + '</p>'
          : '<p class="review-empty">这个月还没有写下月计划。</p>') +
        '<p class="review-meta">当月记录 ' + recorded + ' 天</p></aside>';
    }

    const prevDay = shiftDay(year, month, day, -1);
    if (!prevDay) {
      return '<aside class="review"><div class="review-head"><h3>没有更早的日期</h3></div>' +
        '<p class="review-empty">2006 年 1 月 1 日是最早的一天。</p></aside>';
    }
    const node = dayNode(prevDay.y, prevDay.m, prevDay.d);
    const work = node ? (node.work || '').trim() : '';
    const plan = node ? (node.next || '').trim() : '';
    return '<aside class="review" aria-label="' + prevDay.y + ' 年 ' + prevDay.m + ' 月 ' +
      prevDay.d + ' 日记录">' +
      '<div class="review-head"><h3>' + prevDay.y + ' 年 ' + prevDay.m + ' 月 ' +
      prevDay.d + ' 日 · 前一天</h3>' +
      '<a class="review-link" href="#/' + prevDay.y + '/' + prevDay.m + '/' + prevDay.d +
      '">前往这一天</a></div>' +
      '<div class="review-grid">' +
      '<div><h4>工作记录</h4>' +
      (work ? '<p class="review-body">' + esc(work) + '</p>' : '<p class="review-empty">没有记录。</p>') +
      '</div>' +
      '<div><h4>当时写下的明日计划</h4>' +
      (plan ? '<p class="review-body">' + esc(plan) + '</p>' : '<p class="review-empty">没有记录。</p>') +
      '</div></div></aside>';
  }

  function wireReview(kind, year, month, day) {
    const btn = app.querySelector('[data-review]');
    const slot = app.querySelector('#review-slot');
    if (!btn || !slot) return;

    btn.addEventListener('click', function () {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        btn.setAttribute('aria-expanded', 'false');
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML = reviewMarkup(kind, year, month, day);
      btn.setAttribute('aria-expanded', 'true');
    });
  }

  /* ---------------- 页面 ---------------- */

  function renderHome() {
    document.title = '人生日历 · Life Calendar';
    setCrumbs([]);

    const today = new Date();
    const thisYear = today.getFullYear();
    const groups = [];
    let start = MIN_YEAR;
    while (start <= MAX_YEAR) {
      const end = Math.min(MAX_YEAR, Math.floor(start / 10) * 10 + 9);
      groups.push([start, end]);
      start = end + 1;
    }

    const sections = groups.map(function (range) {
      const from = range[0];
      const to = range[1];
      const label = from % 10 === 0 ? from + ' 年代' : from + '–' + to;
      let cells = '';

      for (let year = from; year <= to; year += 1) {
        const node = yearNode(year);
        const recorded = recordedDaysInYear(year);
        const has = yearHasContent(node);
        const isCurrent = year === thisYear;
        let meta = '&nbsp;';
        if (has) {
          meta = '<i class="dot" aria-hidden="true"></i>' + (recorded ? recorded + ' 天' : '计划');
        }
        cells += '<a class="year-cell' + (isCurrent ? ' is-current' : '') + '" href="#/' + year + '"' +
          ' aria-label="' + year + ' 年' + (has ? '，有记录' : '') + '">' +
          (isCurrent ? '<span class="tag">今年</span>' : '') +
          '<span class="year-num">' + year + '</span>' +
          '<span class="year-meta">' + meta + '</span></a>';
      }

      return '<section class="decade"><h2 class="decade-label">' + label + '</h2>' +
        '<div class="year-grid">' + cells + '</div></section>';
    }).join('');

    const todayHref = '#/' + thisYear + '/' + (today.getMonth() + 1) + '/' + today.getDate();

    app.innerHTML = '<section class="view">' +
      '<div class="home-head">' +
      '<div><p class="eyebrow">LIFE CALENDAR</p><h1>选择一年</h1>' +
      '<p class="sub">2006 至 2106，共 101 年 · 从任意一天开始记录</p></div>' +
      '<a class="btn" href="' + todayHref + '">回到今天</a>' +
      '</div>' +
      '<div class="year-groups">' + sections + '</div>' +
      '</section>';
  }

  function renderYear(year) {
    document.title = year + ' 年 · 人生日历';
    setCrumbs([{ label: year + ' 年', href: null }]);

    const today = new Date();
    const leap = isLeapYear(year);
    const prevYear = year - 1;
    const nextYear = year + 1;
    const recorded = recordedDaysInYear(year);

    let months = '';
    for (let month = 1; month <= 12; month += 1) {
      const node = monthNode(year, month);
      const dayCount = countDays(node);
      const has = monthHasContent(node);
      const isNow = today.getFullYear() === year && today.getMonth() + 1 === month;
      months += '<a class="month-cell' + (has ? ' has-content' : '') +
        (isNow ? ' is-current' : '') + '" href="#/' + year + '/' + month + '"' +
        ' aria-label="' + year + ' 年 ' + month + ' 月' + (has ? '，有记录' : '') + '">' +
        '<span class="month-name">' + month + '<small>月</small></span>' +
        '<span class="cell-meta">' + daysInMonth(year, month) + ' 天' +
        (dayCount ? ' · 记录 ' + dayCount + ' 天' : '') + '</span></a>';
    }

    app.innerHTML = '<section class="view">' +
      '<header class="chapter"><div>' +
      '<p class="eyebrow">年度</p>' +
      '<h1 class="display">' + year + '<span class="unit">年</span></h1>' +
      '<p class="sub">' + (leap ? '闰年' : '平年') + ' · ' + (leap ? 366 : 365) +
      ' 天 · 已记录 ' + recorded + ' 天</p></div>' +
      '<div class="chapter-actions">' +
      '<button type="button" class="btn" data-review aria-expanded="false" aria-controls="review-slot"' +
      (prevYear < MIN_YEAR ? ' disabled' : '') + '>回顾上一年</button>' +
      '<div class="stepper">' +
      (prevYear >= MIN_YEAR
        ? '<a class="stepper-btn" href="#/' + prevYear + '" aria-label="上一年，' + prevYear + ' 年">‹ 上一年</a>'
        : '<span class="stepper-btn is-disabled">‹ 上一年</span>') +
      (nextYear <= MAX_YEAR
        ? '<a class="stepper-btn" href="#/' + nextYear + '" aria-label="下一年，' + nextYear + ' 年">下一年 ›</a>'
        : '<span class="stepper-btn is-disabled">下一年 ›</span>') +
      '</div></div></header>' +
      '<div id="review-slot" class="review-slot"></div>' +
      '<section class="card"><div class="card-head"><h2>年度计划</h2>' +
      '<span class="save-state" data-save-state aria-live="polite"></span></div>' +
      '<textarea id="plan-editor" class="plan-input" rows="7" aria-label="年度计划" ' +
      'placeholder="这一年想完成什么？想成为怎样的人？写下几件最重要的事。"></textarea></section>' +
      '<div class="section-head"><h2>选择月份</h2><p>点击月份，制定月计划并进入每日记录</p></div>' +
      '<div class="month-grid">' + months + '</div>' +
      '</section>';

    bindEditor('#plan-editor', function () {
      return yearPlanOf(year);
    }, function (value) {
      yearNode(year, true).plan = value;
    });

    wireReview('year', year);
  }

  function renderMonth(year, month) {
    document.title = year + ' 年 ' + month + ' 月 · 人生日历';
    setCrumbs([
      { label: year + ' 年', href: '#/' + year },
      { label: month + ' 月', href: null }
    ]);

    const today = new Date();
    const total = daysInMonth(year, month);
    const offset = firstWeekdayIndex(year, month);
    const recorded = countDays(monthNode(year, month));
    const prev = shiftMonth(year, month, -1);
    const next = shiftMonth(year, month, 1);

    let cells = '';
    for (let i = 0; i < offset; i += 1) {
      cells += '<span class="day-cell is-blank" aria-hidden="true"></span>';
    }

    for (let day = 1; day <= total; day += 1) {
      const node = dayNode(year, month, day);
      let preview = '';
      if (node) {
        const work = (node.work || '').trim();
        const plan = (node.next || '').trim();
        preview = work || (plan ? '明日：' + plan : '');
      }
      preview = preview.replace(/\s+/g, ' ').slice(0, 80);
      const has = !!preview;
      const isToday = today.getFullYear() === year && today.getMonth() + 1 === month &&
        today.getDate() === day;
      const weekday = weekdayName(year, month, day);

      cells += '<a class="day-cell' + (has ? ' has-content' : '') +
        (isToday ? ' is-today' : '') + '" href="#/' + year + '/' + month + '/' + day + '"' +
        ' aria-label="' + year + ' 年 ' + month + ' 月 ' + day + ' 日，星期' + weekday +
        (has ? '，有记录' : '') + '">' +
        '<span class="day-num">' + day + '</span>' +
        (has ? '<span class="day-preview">' + esc(preview) + '</span>' : '') +
        '</a>';
    }

    app.innerHTML = '<section class="view">' +
      '<header class="chapter"><div>' +
      '<p class="eyebrow">' + year + ' 年</p>' +
      '<h1 class="display">' + month + '<span class="unit">月</span></h1>' +
      '<p class="sub">' + total + ' 天 · 已记录 ' + recorded + ' 天</p></div>' +
      '<div class="chapter-actions">' +
      '<button type="button" class="btn" data-review aria-expanded="false" aria-controls="review-slot"' +
      (prev ? '' : ' disabled') + '>回顾上个月</button>' +
      '<div class="stepper">' +
      (prev
        ? '<a class="stepper-btn" href="#/' + prev.y + '/' + prev.m + '" aria-label="上个月，' + prev.y + ' 年 ' + prev.m + ' 月">‹ 上月</a>'
        : '<span class="stepper-btn is-disabled">‹ 上月</span>') +
      (next
        ? '<a class="stepper-btn" href="#/' + next.y + '/' + next.m + '" aria-label="下个月，' + next.y + ' 年 ' + next.m + ' 月">下月 ›</a>'
        : '<span class="stepper-btn is-disabled">下月 ›</span>') +
      '</div></div></header>' +
      '<div id="review-slot" class="review-slot"></div>' +
      '<section class="card"><div class="card-head"><h2>月计划</h2>' +
      '<span class="save-state" data-save-state aria-live="polite"></span></div>' +
      '<textarea id="plan-editor" class="plan-input" rows="6" aria-label="月计划" ' +
      'placeholder="这个月的重点是什么？想在哪些事情上保持节奏？"></textarea></section>' +
      '<div class="section-head"><h2>选择日期</h2><p>点击某一天，记录当日工作与明日计划</p></div>' +
      '<div class="calendar"><div class="weekdays">' +
      WEEKDAYS.map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div><div class="days">' + cells + '</div></div>' +
      '</section>';

    bindEditor('#plan-editor', function () {
      return monthPlanOf(year, month);
    }, function (value) {
      monthNode(year, month, true).plan = value;
    });

    wireReview('month', year, month);
  }

  function renderDay(year, month, day) {
    document.title = year + ' 年 ' + month + ' 月 ' + day + ' 日 · 人生日历';
    setCrumbs([
      { label: year + ' 年', href: '#/' + year },
      { label: month + ' 月', href: '#/' + year + '/' + month },
      { label: day + ' 日', href: null }
    ]);

    const today = new Date();
    const isToday = today.getFullYear() === year && today.getMonth() + 1 === month &&
      today.getDate() === day;
    const prev = shiftDay(year, month, day, -1);
    const next = shiftDay(year, month, day, 1);
    const node = dayNode(year, month, day);

    app.innerHTML = '<section class="view">' +
      '<header class="chapter"><div>' +
      '<p class="eyebrow">' + year + ' 年 ' + month + ' 月</p>' +
      '<h1 class="display">' + day + '<span class="unit">日</span></h1>' +
      '<p class="sub">星期' + weekdayName(year, month, day) + (isToday ? ' · 今天' : '') + '</p></div>' +
      '<div class="chapter-actions">' +
      '<button type="button" class="btn" data-review aria-expanded="false" aria-controls="review-slot"' +
      (prev ? '' : ' disabled') + '>回顾前一天</button>' +
      '<div class="stepper">' +
      (prev
        ? '<a class="stepper-btn" href="#/' + prev.y + '/' + prev.m + '/' + prev.d + '" aria-label="前一天">‹ 前一天</a>'
        : '<span class="stepper-btn is-disabled">‹ 前一天</span>') +
      (next
        ? '<a class="stepper-btn" href="#/' + next.y + '/' + next.m + '/' + next.d + '" aria-label="后一天">后一天 ›</a>'
        : '<span class="stepper-btn is-disabled">后一天 ›</span>') +
      '</div></div></header>' +
      '<div id="review-slot" class="review-slot"></div>' +
      '<div class="day-grid">' +
      '<section class="card"><div class="card-head"><h2>今日工作记录</h2>' +
      '<span class="save-state" data-save-state aria-live="polite"></span></div>' +
      '<textarea id="work-editor" rows="10" aria-label="今日工作记录" placeholder="今天做了什么，进展如何，遇到了什么问题……"></textarea>' +
      '</section>' +
      '<section class="card"><div class="card-head"><h2>明日工作计划</h2>' +
      '<span class="save-state" data-save-state aria-live="polite"></span></div>' +
      '<textarea id="next-editor" rows="10" aria-label="明日工作计划" placeholder="明天最重要的一件事，以及需要跟进的事……"></textarea>' +
      '</section></div>' +
      '</section>';

    bindEditor('#work-editor', function () {
      return node ? node.work : '';
    }, function (value) {
      dayNode(year, month, day, true).work = value;
    });

    bindEditor('#next-editor', function () {
      return node ? node.next : '';
    }, function (value) {
      dayNode(year, month, day, true).next = value;
    });

    wireReview('day', year, month, day);
  }

  /* ---------------- 路由 ---------------- */

  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
    if (!raw) return { level: 'home' };
    const parts = raw.split('/').map(Number);
    if (parts.length > 3 || parts.some(function (n) { return !Number.isInteger(n) || n < 1; })) {
      return { level: 'home' };
    }
    const year = Math.min(MAX_YEAR, Math.max(MIN_YEAR, parts[0]));
    if (parts.length === 1) return { level: 'year', y: year };
    const month = Math.min(12, Math.max(1, parts[1]));
    if (parts.length === 2) return { level: 'month', y: year, m: month };
    const day = Math.min(daysInMonth(year, month), Math.max(1, parts[2]));
    return { level: 'day', y: year, m: month, d: day };
  }

  function canonicalHash(route) {
    if (route.level === 'home') return '#/';
    if (route.level === 'year') return '#/' + route.y;
    if (route.level === 'month') return '#/' + route.y + '/' + route.m;
    return '#/' + route.y + '/' + route.m + '/' + route.d;
  }

  let currentKey = '';

  function render() {
    const route = parseRoute();
    const key = route.level + ':' + (route.y || '') + ':' + (route.m || '') + ':' + (route.d || '');
    if (key === currentKey) return;
    currentKey = key;

    try {
      if (location.hash !== canonicalHash(route)) {
        history.replaceState(null, '', canonicalHash(route));
      }
    } catch (err) {
      /* file:// 等环境下忽略 */
    }

    window.scrollTo(0, 0);
    if (route.level === 'home') renderHome();
    else if (route.level === 'year') renderYear(route.y);
    else if (route.level === 'month') renderMonth(route.y, route.m);
    else renderDay(route.y, route.m, route.d);
  }

  /* ---------------- 启动 ---------------- */

  buildSwatches();
  applyTheme(state.color, false);

  const initialDate = new Date();
  todayHint.textContent = '今天 ' + initialDate.getFullYear() + ' 年 ' +
    (initialDate.getMonth() + 1) + ' 月 ' + initialDate.getDate() + ' 日';

  colorInput.addEventListener('input', function () {
    applyTheme(colorInput.value, false);
  });
  colorInput.addEventListener('change', function () {
    applyTheme(colorInput.value, true);
  });

  window.addEventListener('hashchange', render);
  render();
})();
