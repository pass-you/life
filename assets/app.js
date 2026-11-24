/* 人生日历 — 年 / 月 / 日 三级日历，数据通过 Markdown 文件导入 / 导出。 */
(function () {
  'use strict';

  const MIN_YEAR = 2006;
  const MAX_YEAR = 2105;
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
  const MOODS = ['很好', '不错', '一般', '有点累', '低落'];
  const MOVIES = Array.isArray(window.MOVIE_DATA) ? window.MOVIE_DATA : [];
  const MOVIE_BY_ID = {};
  MOVIES.forEach(function (movie) {
    MOVIE_BY_ID[movie.id] = movie;
  });
  const MOVIE_GENRES = ['全部', '喜剧', '爱情', '动作', '科幻', '动画', '悬疑', '惊悚', '恐怖',
    '犯罪', '同性', '音乐', '歌舞', '传记', '历史', '战争', '西部', '奇幻', '冒险', '灾难',
    '武侠', '情色', '剧情'];
  const MOVIE_REGIONS = ['全部', '华语', '欧美', '韩国', '日本', '中国大陆', '美国', '中国香港',
    '中国台湾', '英国', '法国', '德国', '意大利', '西班牙', '印度', '泰国', '俄罗斯', '加拿大',
    '澳大利亚', '爱尔兰', '瑞典', '巴西', '丹麦'];
  const MOVIE_DECADES = [
    { label: '全部' },
    { label: '2020年代', from: 2020, to: 2029 },
    { label: '2010年代', from: 2010, to: 2019 },
    { label: '2000年代', from: 2000, to: 2009 },
    { label: '1990年代', from: 1990, to: 1999 },
    { label: '1980年代', from: 1980, to: 1989 },
    { label: '1970年代', from: 1970, to: 1979 },
    { label: '1960年代', from: 1960, to: 1969 },
    { label: '1950年代', from: 1950, to: 1959 },
    { label: '更早', from: 1900, to: 1949 }
  ];
  const MOVIE_SORTS = [
    { value: 'U', label: '综合排序' },
    { value: 'S', label: '评分最高' },
    { value: 'R', label: '评价人数' },
    { value: 'T', label: '最新上映' }
  ];

  const WEATHERS = [
    { label: '晴', icon: 'sun' },
    { label: '多云', icon: 'partly' },
    { label: '阴', icon: 'cloud' },
    { label: '小雨', icon: 'rain' },
    { label: '大雨', icon: 'heavyRain' },
    { label: '雷雨', icon: 'storm' },
    { label: '雪', icon: 'snow' },
    { label: '雾', icon: 'fog' }
  ];

  const WEATHER_ICONS = {
    sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
    partly: '<circle cx="8.2" cy="8.4" r="2.7"/><path d="M8.2 3.2v1.4M3 8.4h1.4M4.5 4.7l1 1M11.9 4.7l-1 1"/><path d="M9.4 18h8.2a3 3 0 0 0 .4-6 4.4 4.4 0 0 0-8.3-.6 3.3 3.3 0 0 0-.3 6.6Z"/>',
    cloud: '<path d="M6.4 17.8h10.4a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.8-.3 4 4 0 0 0-1 7.5Z"/>',
    rain: '<path d="M6.4 15.8h10.4a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.8-.3 4 4 0 0 0-1 7.5Z"/><path d="M8.6 19v2M12 19v2.6M15.4 19v2"/>',
    heavyRain: '<path d="M6.4 15.8h10.4a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.8-.3 4 4 0 0 0-1 7.5Z"/><path d="M7.6 18.6l-.8 3M11.6 18.6l-.8 3M15.6 18.6l-.8 3M19.2 18.6l-.8 3"/>',
    storm: '<path d="M6.4 15.4h10.4a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.8-.3 4 4 0 0 0-1 7.5Z"/><path d="M12.8 17.2l-2 3.2h2.6l-1.4 2.4"/>',
    snow: '<path d="M6.4 15.4h10.4a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.8-.3 4 4 0 0 0-1 7.5Z"/><path d="M8.6 19.2v2.4M7.5 20.4h2.2M8.6 20.4l-.8-.8M8.6 20.4l.8-.8M12 19.6v2.2M11 20.7h2M12 20.7l-.7-.7M12 20.7l.7-.7M15.4 19.2v2.4M14.3 20.4h2.2M15.4 20.4l-.8-.8M15.4 20.4l.8-.8"/>',
    fog: '<path d="M6.4 14.4h10.4a3.6 3.6 0 0 0 .4-7.2 5.2 5.2 0 0 0-9.8-.3 4 4 0 0 0-1 7.5Z"/><path d="M5 17.4h14M7 20.4h10"/>'
  };

  function weatherIcon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      (WEATHER_ICONS[name] || WEATHER_ICONS.cloud) + '</svg>';
  }

  function weatherByLabel(label) {
    for (let i = 0; i < WEATHERS.length; i += 1) {
      if (WEATHERS[i].label === label) return WEATHERS[i];
    }
    return null;
  }

  function sceneParticles(count, type) {
    let out = '';
    for (let i = 0; i < count; i += 1) {
      let style;
      if (type === 'snow') {
        const near = Math.random() < 0.14;
        const size = near ? 12 + Math.random() * 6 : 5 + Math.random() * 5;
        const duration = 7 + Math.random() * 7;
        style = '--x:' + (Math.random() * 100).toFixed(1) + '%;' +
          '--delay:-' + (Math.random() * 10).toFixed(2) + 's;' +
          '--dur:' + duration.toFixed(2) + 's;' +
          '--sway:' + (duration * 0.55).toFixed(2) + 's;' +
          '--spin:' + (12 + Math.random() * 12).toFixed(1) + 's;' +
          '--size:' + size.toFixed(1) + 'px;' +
          '--blur:' + (near ? 1.8 : 0).toFixed(1) + 'px;' +
          '--o:' + (near ? 0.45 + Math.random() * 0.15 : 0.8 + Math.random() * 0.2).toFixed(2) + ';';
      } else {
        const near = type === 'nearRain';
        const width = near ? 1.5 + Math.random() * 1.1 : 0.7 + Math.random() * 0.4;
        const height = near ? 22 + Math.random() * 16 : 10 + Math.random() * 6;
        const duration = near ? 0.5 + Math.random() * 0.3 : 1.4 + Math.random() * 0.5;
        style = '--x:' + (Math.random() * 100).toFixed(1) + '%;' +
          '--delay:-' + (Math.random() * 8).toFixed(2) + 's;' +
          '--dur:' + duration.toFixed(2) + 's;' +
          '--w:' + width.toFixed(1) + 'px;' +
          '--h:' + height.toFixed(1) + 'px;' +
          '--o:' + (near ? 0.55 + Math.random() * 0.3 : 0.25 + Math.random() * 0.2).toFixed(2) + ';';
      }
      out += '<span style="' + style + '"></span>';
    }
    return out;
  }

  function sceneClouds(count) {
    let out = '<div class="scene-clouds">';
    for (let i = 1; i <= count; i += 1) {
      out += '<div class="scene-cloud c' + i + '">' +
        '<i class="puff p1"></i><i class="puff p2"></i>' +
        '<i class="puff p3"></i><i class="puff p4"></i>' +
        '<i class="shade"></i><i class="sheen"></i></div>';
    }
    return out + '</div>';
  }

  function sceneSplashes(count, heavy) {
    let out = '<div class="scene-splashes">';
    for (let i = 0; i < count; i += 1) {
      const size = heavy ? 8 + Math.random() * 7 : 6 + Math.random() * 5;
      out += '<span style="--x:' + (Math.random() * 100).toFixed(1) + '%;' +
        '--delay:-' + (Math.random() * 2.5).toFixed(2) + 's;' +
        '--size:' + size.toFixed(1) + 'px"></span>';
    }
    return out + '</div>';
  }

  let stormTimer = 0;

  function stopStormEffects() {
    clearTimeout(stormTimer);
    stormTimer = 0;
    const overlay = document.getElementById('weather-overlay');
    if (overlay) overlay.classList.remove('is-striking');
  }

  function scheduleStormStrike(first) {
    clearTimeout(stormTimer);
    stormTimer = setTimeout(function () {
      const overlay = document.getElementById('weather-overlay');
      if (!overlay || overlay.hidden || overlay.dataset.weather !== 'storm') return;
      overlay.classList.add('is-striking');
      window.setTimeout(function () { overlay.classList.remove('is-striking'); }, 900);
      scheduleStormStrike(false);
    }, first ? 2500 + Math.random() * 2000 : 5000 + Math.random() * 3000);
  }

  function sceneSnowFeatures() {
    const flake = '<svg viewBox="0 0 64 64" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
      '<path d="M32 4v56M8.2 18l47.6 28M8.2 46l47.6-28"/>' +
      '<path d="M32 12l-4-4M32 12l4-4M32 52l-4 4M32 52l4 4"/>' +
      '<path d="M10.3 19.2l-1-5M10.3 19.2l-5-1M53.7 44.8l1 5M53.7 44.8l5 1' +
      'M53.7 19.2l1-5M53.7 19.2l5-1M10.3 44.8l-1 5M10.3 44.8l-5 1"/>' +
      '<circle cx="32" cy="32" r="2.2"/></g></svg>';

    let out = '<div class="scene-snow-features">';
    for (let i = 0; i < 2; i += 1) {
      const size = 14 + Math.random() * 8;
      const x = 12 + Math.random() * 76;
      const delay = -(Math.random() * 26).toFixed(1);
      const duration = 20 + Math.random() * 8;
      out += '<i class="snow-feature" style="--x:' + x.toFixed(1) + '%;' +
        '--size:' + size.toFixed(1) + 'px;' +
        '--delay:' + delay + 's;' +
        '--dur:' + duration.toFixed(1) + 's;' +
        '--sway:' + (duration * 0.3).toFixed(1) + 's;' +
        '--spin:' + (16 + Math.random() * 10).toFixed(1) + 's">' + flake + '</i>';
    }
    return out + '</div>';
  }

  function weatherSceneMarkup(item) {
    const key = item.icon;
    const sun = '<div class="scene-sun" aria-hidden="true"></div>';

    let html = '';

    if (key === 'sun') {
      html += sun;
    } else if (key === 'partly') {
      html += sun + sceneClouds(2);
    } else if (key === 'cloud') {
      html += sceneClouds(3);
    } else if (key === 'rain') {
      html += sceneClouds(2) +
        '<div class="scene-rain">' +
        '<div class="rain-far">' + sceneParticles(40, 'farRain') + '</div>' +
        '<div class="rain-near">' + sceneParticles(16, 'nearRain') + '</div>' +
        '</div>' + sceneSplashes(10, false);
    } else if (key === 'heavyRain') {
      html += sceneClouds(3) +
        '<div class="scene-rain">' +
        '<div class="rain-far">' + sceneParticles(70, 'farRain') + '</div>' +
        '<div class="rain-near">' + sceneParticles(48, 'nearRain') + '</div>' +
        '</div>' + sceneSplashes(24, true);
    } else if (key === 'storm') {
      html += sceneClouds(3) +
        '<div class="scene-rain">' +
        '<div class="rain-far">' + sceneParticles(110, 'farRain') + '</div>' +
        '<div class="rain-near">' + sceneParticles(70, 'nearRain') + '</div>' +
        '</div>' + sceneSplashes(32, true) +
        '<svg class="scene-lightning" viewBox="0 0 40 60" aria-hidden="true">' +
        '<path d="M22 4 10 31h8l-3 22 13-27h-7l1-22"/></svg>' +
        '<div class="scene-flash"></div>';
    } else if (key === 'snow') {
      html += sceneClouds(2) + '<div class="scene-snow">' + sceneParticles(100, 'snow') + sceneSnowFeatures() + '</div>';
    } else if (key === 'fog') {
      html += sceneClouds(1) +
        '<div class="scene-fog"><span></span><span></span><span></span></div>';
    }

    return html;
  }

  function updateWeatherOverlaySize() {
    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;
    if (overlay.hidden) {
      overlay.style.height = '0px';
      overlay.style.setProperty('--fall', '0px');
      return;
    }
    const meta = app.querySelector('.day-meta');
    if (!meta) {
      overlay.style.height = '0px';
      overlay.style.setProperty('--fall', '0px');
      return;
    }
    const bottom = Math.max(0, Math.round(meta.getBoundingClientRect().top + window.scrollY));
    overlay.style.height = bottom + 'px';
    overlay.style.setProperty('--fall', bottom + 'px');
  }

  function hideWeatherOverlay() {
    stopStormEffects();
    const overlay = document.getElementById('weather-overlay');
    if (!overlay) return;
    overlay.hidden = true;
    overlay.removeAttribute('data-weather');
    overlay.innerHTML = '';
    overlay.style.height = '0px';
  }

  function renderWeatherScene(label) {
    const scene = document.getElementById('weather-overlay');
    if (!scene) return;
    stopStormEffects();
    const item = weatherByLabel(label);
    if (!item) {
      hideWeatherOverlay();
      return;
    }
    scene.hidden = false;
    scene.dataset.weather = item.icon;
    scene.innerHTML = weatherSceneMarkup(item);
    updateWeatherOverlaySize();
    if (item.icon === 'storm') {
      scheduleStormStrike(true);
    }
  }

  const app = document.getElementById('app');
  const crumbsEl = document.getElementById('crumbs');
  const swatchEl = document.getElementById('swatches');
  const colorInput = document.getElementById('colorInput');
  const todayHint = document.getElementById('todayHint');
  const fileStatus = document.getElementById('fileStatus');
  const openBtn = document.getElementById('openBtn');
  const saveAsBtn = document.getElementById('saveAsBtn');
  const exportBtn = document.getElementById('exportBtn');
  const reconnectBtn = document.getElementById('reconnectBtn');
  const fileInput = document.getElementById('fileInput');

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

  /* ---------------- 数据模型 ---------------- */

  const state = { color: DEFAULT_COLOR, years: {} };

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
      yNode.months[key] = { plan: '', income: 0, days: {} };
    }
    const node = yNode.months[key];
    if (typeof node !== 'object' || Array.isArray(node)) {
      if (!create) return null;
      yNode.months[key] = { plan: '', income: 0, days: {} };
      return yNode.months[key];
    }
    if (typeof node.plan !== 'string') node.plan = '';
    if (typeof node.income !== 'number' || !Number.isFinite(node.income)) node.income = 0;
    node.income = Math.max(0, Math.round(node.income));
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
      mNode.days[key] = { mood: '', weather: '', journal: '', highlights: '', next: '', expenses: [], movies: [] };
    }
    const node = mNode.days[key];
    if (typeof node !== 'object' || Array.isArray(node)) {
      if (!create) return null;
      mNode.days[key] = { mood: '', weather: '', journal: '', highlights: '', next: '', expenses: [], movies: [] };
      return mNode.days[key];
    }
    // 兼容旧文件：work 字段迁移到 journal。
    if (typeof node.work === 'string') {
      if (typeof node.journal !== 'string' || !node.journal) {
        node.journal = node.work;
      }
      delete node.work;
    }
    if (typeof node.mood !== 'string') node.mood = '';
    if (typeof node.weather !== 'string') node.weather = '';
    if (typeof node.journal !== 'string') node.journal = '';
    if (typeof node.highlights !== 'string') node.highlights = '';
    if (typeof node.next !== 'string') node.next = '';
    if (!Array.isArray(node.expenses)) node.expenses = [];
    node.expenses = node.expenses.map(function (item) {
      return {
        name: item && typeof item.name === 'string' ? item.name : '',
        price: item && Number.isFinite(item.price) ? Math.max(0, Math.round(item.price)) : 0
      };
    }).filter(function (item) {
      return !!(item.name || item.price);
    });
    if (!Array.isArray(node.movies)) node.movies = [];
    node.movies = node.movies.map(normalizeMovie).filter(function (item) {
      return !!(item.id || item.title);
    });
    return node;
  }

  function normalizeMovie(item) {
    const rawId = item && typeof item.id === 'string' ? item.id : '';
    const data = MOVIE_BY_ID[rawId] || null;
    const title = item && typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : (data ? data.title : '');
    const year = item && /^\d{4}$/.test(item.year || '') ? item.year : (data ? data.year : '');
    const rating = item && Number.isFinite(item.rating) && item.rating > 0
      ? item.rating
      : (data ? data.rating : 0);
    return { id: rawId || (data ? data.id : ''), title: title, year: year, rating: rating };
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
    if (!node) return false;
    if (['mood', 'weather', 'journal', 'highlights', 'next'].some(function (field) {
      return !!(node[field] || '').trim();
    })) return true;
    return Array.isArray(node.expenses) && node.expenses.some(function (item) {
      return item && (item.name || item.price);
    }) || (Array.isArray(node.movies) && node.movies.length > 0);
  }

  function amountToCents(value) {
    const text = String(value == null ? '' : value).replace(/,/g, '').trim();
    const match = text.match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;
    const amount = Number(match[0]);
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  }

  function centsToYuan(cents) {
    return (Math.max(0, Math.round(cents || 0)) / 100).toFixed(2);
  }

  function formatCents(cents) {
    const value = Math.round(cents || 0);
    return (value < 0 ? '-¥' : '¥') + (Math.abs(value) / 100).toFixed(2);
  }

  function parseExpenseLines(value) {
    const items = [];
    String(value || '').split('\n').forEach(function (line) {
      const match = /^\s*-\s*(\d+(?:\.\d{1,2})?)\s*元(?:\s*[·:：]\s*(.*))?\s*$/.exec(line);
      if (!match) return;
      const name = (match[2] || '').trim();
      const price = Math.max(0, Math.round(Number(match[1]) * 100));
      if (name || price) items.push({ name: name, price: price });
    });
    return items;
  }

  function parseMovieLines(value) {
    const items = [];
    String(value || '').split('\n').forEach(function (line) {
      if (!/^\s*-/.test(line)) return;
      const parts = line.replace(/^\s*-\s*/, '').split(/\s+·\s+/).map(function (part) {
        return part.trim();
      }).filter(function (part, index) {
        return part !== '' || index > 0;
      });
      if (!parts.length || !parts[0]) return;
      let id = '';
      let rating = 0;
      let year = '';
      if (parts.length > 1 && /^\d{5,}$/.test(parts[parts.length - 1])) id = parts.pop();
      if (parts.length > 1 && /^\d+(?:\.\d+)?$/.test(parts[parts.length - 1])) {
        rating = Number(parts.pop()) || 0;
      }
      if (parts.length > 1 && /^\d{4}$/.test(parts[parts.length - 1])) year = parts.pop();
      const title = parts.join(' · ').trim();
      if (!title) return;
      const known = id ? MOVIE_BY_ID[id] : MOVIES.filter(function (movie) {
        return movie.title === title && (!year || movie.year === year);
      })[0];
      if (known) {
        items.push(normalizeMovie({ id: known.id }));
      } else {
        items.push(normalizeMovie({ id: id, title: title, year: year, rating: rating }));
      }
    });
    return items;
  }

  function dayExpenseCents(node) {
    if (!node || !Array.isArray(node.expenses)) return 0;
    return node.expenses.reduce(function (sum, item) {
      return sum + (item && Number.isFinite(item.price) ? item.price : 0);
    }, 0);
  }

  function monthExpenseCents(node) {
    if (!node || !node.days) return 0;
    return Object.keys(node.days).reduce(function (sum, key) {
      return sum + dayExpenseCents(node.days[key]);
    }, 0);
  }

  function monthIncomeCents(node) {
    return node && Number.isFinite(node.income) ? node.income : 0;
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
    if (monthIncomeCents(node) > 0) return true;
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

  /* ---------------- 文件连接与自动同步 ---------------- */

  let dirty = false;
  let fileName = '';
  let fileHandle = null;
  let pendingHandle = null;
  let noticeText = '';
  let noticeIsError = false;
  let syncState = 'idle'; // idle | saving | error
  let syncError = '';
  let syncTimer = 0;
  let syncInFlight = false;
  let syncQueued = false;
  let editRevision = 0;

  const supportsFsa = typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function';

  function countData() {
    let years = 0;
    let days = 0;
    Object.keys(state.years).forEach(function (key) {
      const node = state.years[key];
      if (!node || typeof node !== 'object') return;
      if (yearHasContent(node)) years += 1;
      const months = node.months && typeof node.months === 'object' ? node.months : {};
      Object.keys(months).forEach(function (monthKey) {
        const month = months[monthKey];
        if (!month || !month.days || typeof month.days !== 'object') return;
        Object.keys(month.days).forEach(function (dayKey) {
          if (hasDayContent(month.days[dayKey])) days += 1;
        });
      });
    });
    return { years: years, days: days };
  }

  function describeFileError(err) {
    if (!err) return '未知错误';
    if (err.name === 'NotAllowedError') return '文件权限已失效，请重新选择保存位置';
    if (err.name === 'NotFoundError') return '文件已被移动或删除';
    if (err.name === 'QuotaExceededError') return '存储空间不足';
    return err.message || '写入失败，请重试';
  }

  function openHandleDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = indexedDB.open('life-calendar', 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains('handles')) {
          request.result.createObjectStore('handles');
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  // 只保存文件句柄，不保存日历内容；用于下次打开页面时恢复连接。
  async function storeHandle(handle) {
    try {
      const db = await openHandleDb();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'calendar');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
      db.close();
    } catch (err) {
      /* 句柄保存失败不影响当前会话的自动同步 */
    }
  }

  async function loadStoredHandle() {
    try {
      const db = await openHandleDb();
      const handle = await new Promise(function (resolve, reject) {
        const tx = db.transaction('handles', 'readonly');
        const request = tx.objectStore('handles').get('calendar');
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
      db.close();
      return handle;
    } catch (err) {
      return null;
    }
  }

  async function clearStoredHandle() {
    try {
      const db = await openHandleDb();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('calendar');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
      db.close();
    } catch (err) {
      /* 忽略 */
    }
  }

  async function writeHandle(handle, text) {
    const writable = await handle.createWritable();
    try {
      await writable.write(text);
      await writable.close();
    } catch (err) {
      try { await writable.abort(); } catch (ignored) { /* 忽略 */ }
      throw err;
    }
  }

  function refreshStatus() {
    const hasError = noticeIsError || (!noticeText && syncState === 'error');
    fileStatus.classList.toggle('is-error', hasError);
    fileStatus.classList.toggle('is-dirty', !hasError && dirty);

    if (noticeText) {
      fileStatus.textContent = noticeText;
      return;
    }
    if (!supportsFsa) {
      fileStatus.textContent = '当前浏览器不支持自动同步 · 请用「导出副本」保存';
      return;
    }
    if (fileHandle) {
      if (syncState === 'saving') {
        fileStatus.textContent = '正在同步到 ' + fileName + '…';
        return;
      }
      if (syncState === 'error') {
        fileStatus.textContent = '同步失败：' + syncError;
        return;
      }
      fileStatus.textContent = fileName + (dirty ? ' · 待同步' : ' · 已同步');
      return;
    }
    if (pendingHandle) {
      fileStatus.textContent = '上次的 ' + pendingHandle.name + ' 待恢复 · 点击「恢复同步」';
      return;
    }
    fileStatus.textContent = dirty
      ? '未连接文件 · 修改尚未保存，请选择保存位置'
      : '未连接文件 · 选择保存位置后自动同步';
  }

  function setNotice(message, isError) {
    noticeText = message;
    noticeIsError = !!isError;
    refreshStatus();
  }

  function updateReconnectButton() {
    reconnectBtn.hidden = !pendingHandle;
  }

  function markDirty() {
    dirty = true;
    editRevision += 1;
    noticeText = '';
    noticeIsError = false;
    if (syncState === 'error') {
      syncState = 'idle';
      syncError = '';
    }
    if (fileHandle) {
      scheduleSync();
    } else {
      refreshStatus();
    }
  }

  function scheduleSync() {
    if (!fileHandle) {
      refreshStatus();
      return;
    }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { syncToFile(); }, 450);
    refreshStatus();
  }

  async function syncToFile() {
    if (!fileHandle) return;
    if (flushVditorEditors()) {
      dirty = true;
      editRevision += 1;
    }
    if (syncInFlight) {
      syncQueued = true;
      return;
    }
    clearTimeout(syncTimer);
    syncInFlight = true;
    syncQueued = false;
    const revision = editRevision;
    syncState = 'saving';
    syncError = '';
    refreshStatus();

    try {
      await writeHandle(fileHandle, buildMarkdown());
      if (editRevision === revision) {
        dirty = false;
      } else {
        syncQueued = true;
      }
      syncState = 'idle';
    } catch (err) {
      syncState = 'error';
      syncError = describeFileError(err);
    } finally {
      syncInFlight = false;
      refreshStatus();
      if (syncQueued) {
        syncQueued = false;
        if (syncState !== 'error') syncToFile();
      }
    }
  }

  async function attachHandle(handle, loadContent) {
    let parsed = null;
    let needsSync = false;

    if (loadContent) {
      const file = await handle.getFile();
      if (file.size > MD_MAX_BYTES) {
        throw new Error('文件超过 5 MB，无法打开');
      }
      const text = await file.text();
      if (text.trim()) {
        parsed = parseMarkdown(text);
      } else {
        const current = countData();
        needsSync = current.years > 0 || current.days > 0;
      }
    }

    if (parsed) {
      state.years = parsed.years;
      if (parsed.color) state.color = parsed.color;
      applyTheme(state.color);
    }

    fileHandle = handle;
    fileName = handle.name;
    pendingHandle = null;
    noticeText = '';
    noticeIsError = false;
    syncState = 'idle';
    syncError = '';
    dirty = needsSync;
    if (needsSync) editRevision += 1;
    updateReconnectButton();
    currentKey = '';
    render();
    await storeHandle(handle);

    const stats = countData();
    setNotice((loadContent ? '已打开 ' : '已连接 ') + fileName + ' · ' +
      stats.years + ' 年 · ' + stats.days + ' 天记录', false);
    if (needsSync) scheduleSync();
  }

  async function chooseSaveLocation() {
    if (!supportsFsa) {
      setNotice('当前浏览器不支持自动同步，请使用「导出副本」', true);
      return;
    }
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: fileName || '人生日历.md',
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'] }
        }]
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setNotice('无法选择保存位置：' + describeFileError(err), true);
      return;
    }
    try {
      await writeHandle(handle, buildMarkdown());
    } catch (err) {
      setNotice('无法写入文件：' + describeFileError(err), true);
      return;
    }
    await attachHandle(handle, false);
  }

  async function openCalendarFile() {
    if (!supportsFsa) {
      fileInput.click();
      return;
    }
    if (dirty && !window.confirm('打开文件会替换当前未同步的内容，继续吗？')) return;
    let handles;
    try {
      handles = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] }
        }]
      });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setNotice('无法打开文件：' + describeFileError(err), true);
      return;
    }
    if (!handles || !handles.length) return;
    try {
      await attachHandle(handles[0], true);
    } catch (err) {
      setNotice(err.message || '打开失败，请确认文件格式', true);
    }
  }

  async function reconnectHandle() {
    if (!pendingHandle) return;
    const handle = pendingHandle;
    let permission = 'granted';
    try {
      if (typeof handle.requestPermission === 'function') {
        permission = await handle.requestPermission({ mode: 'readwrite' });
      }
    } catch (err) {
      permission = 'denied';
    }
    if (permission !== 'granted') {
      pendingHandle = null;
      updateReconnectButton();
      await clearStoredHandle();
      setNotice('未获得文件权限，请重新选择文件', true);
      return;
    }
    try {
      await attachHandle(handle, true);
    } catch (err) {
      pendingHandle = null;
      updateReconnectButton();
      await clearStoredHandle();
      setNotice(err.message || '恢复文件失败，请重新选择', true);
    }
  }

  async function restoreStoredHandle() {
    if (!supportsFsa) return;
    const handle = await loadStoredHandle();
    if (!handle) return;

    let permission = 'prompt';
    try {
      if (typeof handle.queryPermission === 'function') {
        permission = await handle.queryPermission({ mode: 'readwrite' });
      }
    } catch (err) {
      permission = 'prompt';
    }

    if (permission === 'granted') {
      try {
        await attachHandle(handle, true);
      } catch (err) {
        await clearStoredHandle();
        setNotice(err.message || '恢复文件失败，请重新选择', true);
      }
      return;
    }
    if (permission === 'prompt') {
      pendingHandle = handle;
      updateReconnectButton();
      refreshStatus();
      return;
    }
    await clearStoredHandle();
  }

  window.addEventListener('beforeunload', function (event) {
    if (flushVditorEditors()) dirty = true;
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && dirty && fileHandle) {
      syncToFile();
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

  function applyTheme(hex) {
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
      applyTheme(btn.dataset.color);
      markDirty();
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

  function safeLink(url) {
    const value = String(url || '').trim();
    if (!/^(https?:\/\/|mailto:)/i.test(value)) return '';
    return value;
  }

  function renderInlineMarkdown(raw) {
    const codes = [];
    const links = [];
    let source = String(raw);

    source = source.replace(/`([^`\n]+)`/g, function (match, code) {
      codes.push(code);
      return '\u0000C' + (codes.length - 1) + '\u0000';
    });
    source = source.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (match, label, url) {
      links.push({ label: label, url: url });
      return '\u0000L' + (links.length - 1) + '\u0000';
    });

    let text = esc(source);
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    text = text.replace(/\u0000C(\d+)\u0000/g, function (match, index) {
      return '<code>' + esc(codes[Number(index)]) + '</code>';
    });
    text = text.replace(/\u0000L(\d+)\u0000/g, function (match, index) {
      const link = links[Number(index)];
      const url = safeLink(link.url);
      if (!url) return esc(link.label);
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
        esc(link.label) + '</a>';
    });
    return text;
  }

  function renderMarkdown(source) {
    const text = String(source || '');
    if (window.marked && typeof window.marked.parse === 'function' && window.DOMPurify) {
      try {
        const html = window.marked.parse(text, { gfm: true, breaks: true });
        return window.DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ['style', 'iframe', 'form', 'object', 'embed'],
          FORBID_ATTR: ['style']
        });
      } catch (err) {
        /* fall through to the local renderer */
      }
    }
    return renderMarkdownFallback(text);
  }

  function decorateMarkdown(root) {
    if (!root) return;
    root.querySelectorAll('a').forEach(function (link) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
    root.querySelectorAll('img').forEach(function (img) {
      img.loading = 'lazy';
      img.decoding = 'async';
    });
  }

  function renderMarkdownFallback(source) {
    const text = String(source || '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    const out = [];
    let i = 0;

    function isBlockStart(line) {
      return /^(#{1,6}\s|```|~~~|>\s?|\s*(?:[-*+]|\d+\.)\s+|(?:\*\s*){3,}$|(?:-\s*){3,}$|(?:_\s*){3,}$)/.test(line);
    }

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }

      let match = /^\s*(```|~~~)\s*([^\s`]*)\s*$/.exec(line);
      if (match) {
        const fence = match[1];
        const lang = match[2];
        i += 1;
        const code = [];
        while (i < lines.length && !lines[i].trim().startsWith(fence)) {
          code.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        out.push('<pre><code' + (lang ? ' class="language-' + esc(lang) + '"' : '') + '>' +
          esc(code.join('\n')) + '</code></pre>');
        continue;
      }

      match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (match) {
        const level = match[1].length;
        out.push('<h' + level + '>' + renderInlineMarkdown(match[2]) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (/^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i += 1;
        }
        out.push('<blockquote>' + renderMarkdownFallback(quote.join('\n')) + '</blockquote>');
        continue;
      }

      match = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
      if (match) {
        const ordered = /\d+\./.test(match[2]);
        const items = [];
        while (i < lines.length) {
          const item = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
          if (!item || /\d+\./.test(item[2]) !== ordered) break;
          let content = item[3];
          const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
          let prefix = '';
          if (task) {
            prefix = '<span class="md-task" aria-hidden="true">' +
              (task[1].toLowerCase() === 'x' ? '✓' : '○') + '</span> ';
            content = task[2];
          }
          items.push('<li>' + prefix + renderInlineMarkdown(content) + '</li>');
          i += 1;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
        continue;
      }

      const paragraph = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
        paragraph.push(lines[i]);
        i += 1;
      }
      out.push('<p>' + renderInlineMarkdown(paragraph.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }

    return out.join('');
  }

  let vditorInstances = [];
  let vditorFields = [];

  function destroyVditorEditors() {
    vditorInstances.forEach(function (editor) {
      try { editor.destroy(); } catch (err) { /* 忽略 */ }
    });
    vditorInstances = [];
    vditorFields = [];
  }

  // Vditor 的 input 回调有延迟；导出、同步、切换页面前主动读一次，
  // 避免最后几个字还没写回数据模型就落盘。
  function flushVditorEditors() {
    let changed = false;
    vditorFields.forEach(function (entry) {
      if (!entry.isReady()) return;
      let value;
      try { value = entry.editor.getValue(); } catch (err) { return; }
      if (typeof value !== 'string' || value === entry.lastValue) return;
      entry.lastValue = value;
      entry.setValue(value);
      changed = true;
    });
    return changed;
  }

  function bindVditorField(selector, getValue, setValue, height, placeholder) {
    const host = app.querySelector(selector);
    if (!host) return;
    const initial = getValue() || '';

    function fallback() {
      host.innerHTML = '';
      const textarea = document.createElement('textarea');
      textarea.className = 'plan-input';
      textarea.rows = 8;
      textarea.placeholder = placeholder || '';
      textarea.value = initial;
      textarea.style.minHeight = height + 'px';
      host.appendChild(textarea);
      textarea.addEventListener('input', function () {
        setValue(textarea.value);
        markDirty();
      });
    }

    if (!window.Vditor) {
      fallback();
      return;
    }

    let ready = false;
    try {
      const editor = new window.Vditor(host, {
        mode: 'ir',
        value: initial,
        height: height,
        placeholder: placeholder,
        cdn: 'assets/vendor/vditor',
        lang: 'zh_CN',
        icon: 'ant',
        theme: 'classic',
        cache: { enable: false },
        toolbar: [],
        counter: { enable: false },
        outline: { enable: false },
        resize: { enable: false },
        preview: { hljs: { enable: false } },
        input: function (value) {
          if (!ready) return;
          setValue(value);
          markDirty();
        },
        after: function () {
          ready = true;
        }
      });
      const field = {
        editor: editor,
        setValue: setValue,
        lastValue: initial,
        isReady: function () { return ready; }
      };
      vditorFields.push(field);
      vditorInstances.push(editor);
    } catch (err) {
      fallback();
    }
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
          ? '<div class="md-body">' + renderMarkdown(text) + '</div>'
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
          ? '<div class="md-body">' + renderMarkdown(text) + '</div>'
          : '<p class="review-empty">这个月还没有写下月计划。</p>') +
        '<p class="review-meta">当月记录 ' + recorded + ' 天</p></aside>';
    }

    const prevDay = shiftDay(year, month, day, -1);
    if (!prevDay) {
      return '<aside class="review"><div class="review-head"><h3>没有更早的日期</h3></div>' +
        '<p class="review-empty">2006 年 1 月 1 日是最早的一天。</p></aside>';
    }
    const node = dayNode(prevDay.y, prevDay.m, prevDay.d);
    const mood = node ? (node.mood || '').trim() : '';
    const weather = node ? (node.weather || '').trim() : '';
    const journal = node ? (node.journal || '').trim() : '';
    const highlights = node ? (node.highlights || '').trim() : '';
    const plan = node ? (node.next || '').trim() : '';
    let blocks = '';
    const status = [
      mood ? '心情：' + mood : '',
      weather ? '天气：' + weather : ''
    ].filter(Boolean).join(' · ');
    if (status) {
      blocks += '<div class="review-block"><h4>心情与天气</h4><p class="review-body">' +
        esc(status) + '</p></div>';
    }
    if (journal) {
      blocks += '<div class="review-block"><h4>今日记录</h4><div class="md-body">' +
        renderMarkdown(journal) + '</div></div>';
    }
    if (highlights) {
      blocks += '<div class="review-block"><h4>值得记住的小事</h4><div class="md-body">' +
        renderMarkdown(highlights) + '</div></div>';
    }
    if (plan) {
      blocks += '<div class="review-block"><h4>当时写下的明日计划</h4><div class="md-body">' +
        renderMarkdown(plan) + '</div></div>';
    }
    if (!blocks) {
      blocks = '<p class="review-empty">这一天没有记录。</p>';
    }
    return '<aside class="review" aria-label="' + prevDay.y + ' 年 ' + prevDay.m + ' 月 ' +
      prevDay.d + ' 日记录">' +
      '<div class="review-head"><h3>' + prevDay.y + ' 年 ' + prevDay.m + ' 月 ' +
      prevDay.d + ' 日 · 昨天</h3>' +
      '<a class="review-link" href="#/' + prevDay.y + '/' + prevDay.m + '/' + prevDay.d +
      '">前往这一天</a></div>' +
      blocks + '</aside>';
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
        requestAnimationFrame(updateWeatherOverlaySize);
        return;
      }
      slot.innerHTML = reviewMarkup(kind, year, month, day);
      decorateMarkdown(slot);
      btn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(updateWeatherOverlaySize);
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
      '<p class="sub">2006 至 2105，共 100 年 · 从任意一天开始记录</p></div>' +
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
    let yearIncome = 0;
    let yearExpense = 0;

    for (let m = 1; m <= 12; m += 1) {
      const mNode = monthNode(year, m);
      yearIncome += monthIncomeCents(mNode);
      yearExpense += monthExpenseCents(mNode);
    }
    const yearNet = yearIncome - yearExpense;

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
      '<button type="button" class="expense-entry' +
      (yearIncome > 0 || yearExpense > 0 ? ' has-expenses' : '') +
      '" data-year-finance aria-haspopup="dialog" title="年度收支 · 净收入 ' + formatCents(yearNet) +
      '" aria-label="年度收支，净收入 ' + formatCents(yearNet) + '">¥</button>' +
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
      '<section class="card"><div class="card-head"><h2>年度计划</h2></div>' +
      '<div class="md-field"><div class="vditor-host" id="year-md-editor"></div></div></section>' +
      '<div class="section-head"><h2>选择月份</h2><p>点击月份，制定月计划并进入每日记录</p></div>' +
      '<div class="month-grid">' + months + '</div>' +
      '</section>';

    bindVditorField('#year-md-editor', function () {
      return yearPlanOf(year);
    }, function (value) {
      yearNode(year, true).plan = value;
    }, 260, '这一年想完成什么？想成为怎样的人？写下几件最重要的事。');

    wireYearFinanceEntry(year);
    wireReview('year', year);
  }

  function wireMonthFinanceEntry(year, month) {
    const button = app.querySelector('[data-month-finance]');
    if (!button) return;
    button.addEventListener('click', function () {
      openMonthFinanceModal(year, month);
    });
  }

  function openMonthFinanceModal(year, month) {
    if (document.querySelector('.expense-modal')) return;
    const node = monthNode(year, month);
    const income = monthIncomeCents(node);
    const expense = monthExpenseCents(node);
    const net = income - expense;
    let days = '';
    for (let d = 1; d <= daysInMonth(year, month); d += 1) {
      const cents = dayExpenseCents(node && node.days ? node.days[String(d)] : null);
      if (cents > 0) {
        days += '<span class="finance-day"><span>' + d + ' 日</span><strong>' +
          formatCents(cents) + '</strong></span>';
      }
    }

    const overlay = document.createElement('div');
    overlay.className = 'expense-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'finance-title');
    overlay.innerHTML =
      '<div class="expense-sheet finance-detail">' +
      '<div class="expense-head"><div><p class="eyebrow">月度收支</p>' +
      '<h2 id="finance-title">' + year + ' 年 ' + month + ' 月</h2>' +
      '<p class="sub">每日支出与本月净收入</p></div>' +
      '<button type="button" class="expense-close" aria-label="关闭月度收支">×</button></div>' +
      '<div class="finance-summary">' +
      '<label class="finance-income"><span>本月收入</span><span class="finance-input">' +
      '<span aria-hidden="true">¥</span><input id="finance-month-income" type="number" min="0" ' +
      'step="0.01" inputmode="decimal" value="' + (income ? (income / 100).toFixed(2) : '') +
      '" aria-label="本月收入"></span></label>' +
      '<div class="finance-stat"><span>本月支出</span><strong id="finance-month-expense">' +
      formatCents(expense) + '</strong></div>' +
      '<div class="finance-stat"><span>净收入</span><strong id="finance-month-net" class="' +
      (net < 0 ? 'is-negative' : '') + '">' + formatCents(net) + '</strong></div></div>' +
      '<div class="finance-days"><span class="finance-days-label">每日支出</span>' +
      (days || '<span class="finance-empty">本月暂无支出</span>') + '</div></div>';

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    const input = overlay.querySelector('#finance-month-income');
    const expenseEl = overlay.querySelector('#finance-month-expense');
    const netEl = overlay.querySelector('#finance-month-net');
    const closeButton = overlay.querySelector('.expense-close');

    function close() {
      if (!overlay.isConnected) return;
      overlay.remove();
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      const current = monthNode(year, month);
      const currentExpense = monthExpenseCents(current);
      const currentIncome = monthIncomeCents(current);
      const currentNet = currentIncome - currentExpense;
      const button = app.querySelector('[data-month-finance]');
      if (button) {
        button.classList.toggle('has-expenses', currentIncome > 0 || currentExpense > 0);
        button.title = '本月收支 · 净收入 ' + formatCents(currentNet);
        button.setAttribute('aria-label', '本月收支，净收入 ' + formatCents(currentNet));
        button.focus();
      }
    }

    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }

    input.addEventListener('input', function () {
      const current = monthNode(year, month, true);
      current.income = Math.max(0, amountToCents(input.value));
      markDirty();
      const currentExpense = monthExpenseCents(current);
      const currentNet = current.income - currentExpense;
      expenseEl.textContent = formatCents(currentExpense);
      netEl.textContent = formatCents(currentNet);
      netEl.classList.toggle('is-negative', currentNet < 0);
    });
    input.addEventListener('blur', function () {
      const current = monthNode(year, month, true);
      input.value = current.income ? (current.income / 100).toFixed(2) : '';
    });
    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    input.focus();
  }

  function wireYearFinanceEntry(year) {
    const button = app.querySelector('[data-year-finance]');
    if (!button) return;
    button.addEventListener('click', function () {
      openYearFinanceModal(year);
    });
  }

  function openYearFinanceModal(year) {
    if (document.querySelector('.expense-modal')) return;
    let income = 0;
    let expense = 0;
    let rows = '';
    for (let m = 1; m <= 12; m += 1) {
      const mNode = monthNode(year, m);
      const monthIncome = monthIncomeCents(mNode);
      const monthExpense = monthExpenseCents(mNode);
      income += monthIncome;
      expense += monthExpense;
      rows += '<tr><th scope="row">' + m + ' 月</th><td>' +
        formatCents(monthExpense) + '</td><td>' + formatCents(monthIncome) + '</td></tr>';
    }
    const net = income - expense;

    const overlay = document.createElement('div');
    overlay.className = 'expense-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'finance-title');
    overlay.innerHTML =
      '<div class="expense-sheet finance-detail">' +
      '<div class="expense-head"><div><p class="eyebrow">年度收支</p>' +
      '<h2 id="finance-title">' + year + ' 年</h2>' +
      '<p class="sub">每月支出与收入汇总</p></div>' +
      '<button type="button" class="expense-close" aria-label="关闭年度收支">×</button></div>' +
      '<div class="finance-summary">' +
      '<div class="finance-stat"><span>总收入</span><strong>' + formatCents(income) + '</strong></div>' +
      '<div class="finance-stat"><span>总支出</span><strong>' + formatCents(expense) + '</strong></div>' +
      '<div class="finance-stat"><span>净收入</span><strong class="' +
      (net < 0 ? 'is-negative' : '') + '">' + formatCents(net) + '</strong></div></div>' +
      '<div class="finance-table-wrap"><table class="finance-table">' +
      '<thead><tr><th>月份</th><th>支出</th><th>收入</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';

    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    const closeButton = overlay.querySelector('.expense-close');

    function close() {
      if (!overlay.isConnected) return;
      overlay.remove();
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      const button = app.querySelector('[data-year-finance]');
      if (button) {
        button.classList.toggle('has-expenses', income > 0 || expense > 0);
        button.title = '年度收支 · 净收入 ' + formatCents(net);
        button.setAttribute('aria-label', '年度收支，净收入 ' + formatCents(net));
        button.focus();
      }
    }

    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    }

    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    closeButton.focus();
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
    const mNode = monthNode(year, month);
    const recorded = countDays(mNode);
    const prev = shiftMonth(year, month, -1);
    const next = shiftMonth(year, month, 1);
    const monthIncome = monthIncomeCents(mNode);
    const monthExpense = monthExpenseCents(mNode);
    const monthNet = monthIncome - monthExpense;

    let cells = '';
    for (let i = 0; i < offset; i += 1) {
      cells += '<span class="day-cell is-blank" aria-hidden="true"></span>';
    }

    for (let day = 1; day <= total; day += 1) {
      const node = dayNode(year, month, day);
      const mood = node ? (node.mood || '').trim() : '';
      const weather = node ? (node.weather || '').trim() : '';
      const weatherItem = weather ? weatherByLabel(weather) : null;
      let meta = '';
      if (mood) {
        meta += '<span class="day-mood" title="心情：' + esc(mood) + '">' + esc(mood) + '</span>';
      }
      if (weatherItem) {
        meta += '<span class="day-weather" title="天气：' + esc(weather) + '">' +
          '<span class="day-weather-label">天气</span>' +
          weatherIcon(weatherItem.icon) + '</span>';
      }
      const has = hasDayContent(node);
      const isToday = today.getFullYear() === year && today.getMonth() + 1 === month &&
        today.getDate() === day;
      const weekday = weekdayName(year, month, day);
      const moodText = mood ? '，心情' + mood : '';
      const weatherText = weather ? '，天气' + weather : '';

      cells += '<a class="day-cell' + (has ? ' has-content' : '') +
        (isToday ? ' is-today' : '') + '" href="#/' + year + '/' + month + '/' + day + '"' +
        ' aria-label="' + year + ' 年 ' + month + ' 月 ' + day + ' 日，星期' + weekday +
        moodText + weatherText + (has ? '，有记录' : '') + '">' +
        '<span class="day-num">' + day + '</span>' +
        (meta ? '<span class="day-meta-mini">' + meta + '</span>' : '') +
        '</a>';
    }

    app.innerHTML = '<section class="view">' +
      '<header class="chapter"><div>' +
      '<p class="eyebrow">' + year + ' 年</p>' +
      '<h1 class="display">' + month + '<span class="unit">月</span></h1>' +
      '<p class="sub">' + total + ' 天 · 已记录 ' + recorded + ' 天</p></div>' +
      '<div class="chapter-actions">' +
      '<button type="button" class="expense-entry' +
      (monthIncome > 0 || monthExpense > 0 ? ' has-expenses' : '') +
      '" data-month-finance aria-haspopup="dialog" title="本月收支 · 净收入 ' + formatCents(monthNet) +
      '" aria-label="本月收支，净收入 ' + formatCents(monthNet) + '">¥</button>' +
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
      '<section class="card"><div class="card-head"><h2>月计划</h2></div>' +
      '<div class="md-field"><div class="vditor-host" id="month-md-editor"></div></div></section>' +
      '<div class="section-head"><h2>选择日期</h2><p>点击某一天，记录今天的生活与明日计划</p></div>' +
      '<div class="calendar"><div class="weekdays">' +
      WEEKDAYS.map(function (w) { return '<span>' + w + '</span>'; }).join('') +
      '</div><div class="days">' + cells + '</div></div>' +
      '</section>';

    bindVditorField('#month-md-editor', function () {
      return monthPlanOf(year, month);
    }, function (value) {
      monthNode(year, month, true).plan = value;
    }, 240, '这个月的重点是什么？想在哪些事情上保持节奏？');

    wireMonthFinanceEntry(year, month);
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
    const mood = node ? node.mood : '';
    const weather = node ? node.weather : '';
    const expenseTotal = node ? dayExpenseCents(node) : 0;
    const movieCount = node && Array.isArray(node.movies) ? node.movies.length : 0;

    const moodButtons = MOODS.map(function (item) {
      const active = mood === item;
      return '<button type="button" class="mood-chip' + (active ? ' is-active' : '') +
        '" data-mood="' + item + '" aria-pressed="' + active + '">' + item + '</button>';
    }).join('');

    const weatherButtons = WEATHERS.map(function (item) {
      const active = weather === item.label;
      return '<button type="button" class="weather-chip' + (active ? ' is-active' : '') +
        '" data-weather="' + item.label + '" aria-pressed="' + active + '">' +
        weatherIcon(item.icon) + '<span>' + item.label + '</span></button>';
    }).join('');

    app.innerHTML = '<section class="view">' +
      '<header class="chapter"><div>' +
      '<p class="eyebrow">' + year + ' 年 ' + month + ' 月</p>' +
      '<h1 class="display">' + day + '<span class="unit">日</span></h1>' +
      '<p class="sub">星期' + weekdayName(year, month, day) + (isToday ? ' · 今天' : '') + '</p></div>' +
      '<div class="chapter-actions">' +
      '<button type="button" class="expense-entry film-entry' + (movieCount ? ' has-movies' : '') +
      '" data-movies-open aria-haspopup="dialog" title="找电影 ·今日片单 ' + movieCount + ' 部' +
      '" aria-label="找电影，今日片单 ' + movieCount + ' 部">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="5.5" width="18" height="13" rx="2.4"/>' +
      '<path d="M7.6 5.5v13M16.4 5.5v13M3.6 9h4M3.6 15h4M16.4 9h4M16.4 15h4"/>' +
      '</svg></button>' +
      '<button type="button" class="expense-entry' + (expenseTotal > 0 ? ' has-expenses' : '') +
      '" data-expense-open aria-haspopup="dialog" title="记账 · ' + formatCents(expenseTotal) +
      '" aria-label="记账，今日支出 ' + formatCents(expenseTotal) + '">¥</button>' +
      '<button type="button" class="btn" data-review aria-expanded="false" aria-controls="review-slot"' +
      (prev ? '' : ' disabled') + '>回顾昨天</button>' +
      '<div class="stepper">' +
      (prev
        ? '<a class="stepper-btn" href="#/' + prev.y + '/' + prev.m + '/' + prev.d + '" aria-label="昨天">‹ 昨天</a>'
        : '<span class="stepper-btn is-disabled">‹ 昨天</span>') +
      (next
        ? '<a class="stepper-btn" href="#/' + next.y + '/' + next.m + '/' + next.d + '" aria-label="明天">明天 ›</a>'
        : '<span class="stepper-btn is-disabled">明天 ›</span>') +
      '</div></div></header>' +
      '<div id="review-slot" class="review-slot"></div>' +
      '<div class="day-meta">' +
      '<div class="meta-row">' +
      '<span class="meta-label">今天感觉怎么样？</span>' +
      '<div class="mood-options" role="group" aria-label="今日心情">' + moodButtons + '</div>' +
      '</div>' +
      '<div class="meta-row">' +
      '<span class="meta-label">今天天气</span>' +
      '<div class="weather-options" role="group" aria-label="今日天气">' + weatherButtons + '</div>' +
      '</div>' +
      '</div>' +
      '<section class="card journal-card">' +
      '<div class="card-head"><h2>今日记录</h2></div>' +
      '<div class="md-field"><div class="vditor-host" id="journal-md-editor"></div></div></section>' +
      '<div class="day-grid">' +
      '<section class="card"><div class="card-head"><h2>值得记住的小事</h2></div>' +
      '<div class="md-field"><div class="vditor-host" id="highlights-md-editor"></div></div></section>' +
      '<section class="card"><div class="card-head"><h2>明日计划</h2></div>' +
      '<div class="md-field"><div class="vditor-host" id="next-md-editor"></div></div></section></div>' +
      '</section>';

    const chips = app.querySelectorAll('.mood-chip');
    renderWeatherScene(weather);
    Array.prototype.forEach.call(chips, function (btn) {
      btn.addEventListener('click', function () {
        const current = dayNode(year, month, day, true);
        const nextMood = current.mood === btn.dataset.mood ? '' : btn.dataset.mood;
        current.mood = nextMood;
        Array.prototype.forEach.call(chips, function (chip) {
          const active = chip.dataset.mood === nextMood;
          chip.classList.toggle('is-active', active);
          chip.setAttribute('aria-pressed', String(active));
        });
        markDirty();
      });
    });

    const weatherChips = app.querySelectorAll('.weather-chip');
    Array.prototype.forEach.call(weatherChips, function (btn) {
      btn.addEventListener('click', function () {
        const current = dayNode(year, month, day, true);
        const nextWeather = current.weather === btn.dataset.weather ? '' : btn.dataset.weather;
        current.weather = nextWeather;
        Array.prototype.forEach.call(weatherChips, function (chip) {
          const active = chip.dataset.weather === nextWeather;
          chip.classList.toggle('is-active', active);
          chip.setAttribute('aria-pressed', String(active));
        });
        renderWeatherScene(nextWeather);
        markDirty();
      });
    });

    bindVditorField('#journal-md-editor', function () {
      return node ? node.journal : '';
    }, function (value) {
      dayNode(year, month, day, true).journal = value;
    }, 300, '工作、学习、生活、见闻、心情……今天发生了什么？');

    bindVditorField('#highlights-md-editor', function () {
      return node ? node.highlights : '';
    }, function (value) {
      dayNode(year, month, day, true).highlights = value;
    }, 180, '每行一件，比如早起散步、读完一章书、和朋友吃饭。');

    bindVditorField('#next-md-editor', function () {
      return node ? node.next : '';
    }, function (value) {
      dayNode(year, month, day, true).next = value;
    }, 180, '明天想先做的一两件事……');

    wireReview('day', year, month, day);
    wireExpenseEntry(year, month, day);
    wireMovieEntry(year, month, day);
  }

  function wireExpenseEntry(year, month, day) {
    const button = app.querySelector('[data-expense-open]');
    if (!button) return;
    button.addEventListener('click', function () {
      openExpenseModal(year, month, day);
    });
  }

  function openExpenseModal(year, month, day) {
    if (document.querySelector('.expense-modal')) return;
    const node = dayNode(year, month, day, true);
    if (!node.expenses.length) node.expenses.push({ name: '', price: 0 });

    const overlay = document.createElement('div');
    overlay.className = 'expense-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'expense-title');
    overlay.innerHTML =
      '<div class="expense-sheet">' +
      '<div class="expense-head"><div>' +
      '<p class="eyebrow">记账</p>' +
      '<h2 id="expense-title">' + year + ' 年 ' + month + ' 月 ' + day + ' 日</h2>' +
      '<p class="sub">星期' + weekdayName(year, month, day) + '</p>' +
      '</div><button type="button" class="expense-close" aria-label="关闭记账">×</button></div>' +
      '<div class="expense-summary"><div><span>今日总支出</span>' +
      '<strong id="expense-total">' + formatCents(dayExpenseCents(node)) + '</strong></div>' +
      '<span class="expense-count" id="expense-count">0 笔</span></div>' +
      '<div class="expense-list" id="expense-list"></div>' +
      '<button type="button" class="expense-add">＋ 添加一笔</button>' +
      '<p class="expense-hint">收入在对应月页面填写；记账内容会随日历一起同步。</p>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    const list = overlay.querySelector('#expense-list');
    const totalEl = overlay.querySelector('#expense-total');
    const countEl = overlay.querySelector('#expense-count');
    const addButton = overlay.querySelector('.expense-add');
    const closeButton = overlay.querySelector('.expense-close');

    function updateTotals() {
      totalEl.textContent = formatCents(dayExpenseCents(node));
      const count = node.expenses.filter(function (item) {
        return item && (item.name || item.price);
      }).length;
      countEl.textContent = count + ' 笔';
    }

    function renderRows(focusIndex) {
      if (!node.expenses.length) {
        list.innerHTML = '<p class="expense-empty">还没有支出，添加第一笔。</p>';
      } else {
        list.innerHTML = node.expenses.map(function (item, index) {
          return '<div class="expense-row" data-index="' + index + '">' +
            '<input class="expense-name" type="text" value="' + esc(item.name) +
            '" placeholder="物品名称" aria-label="第 ' + (index + 1) + ' 笔物品名称">' +
            '<div class="expense-price"><span aria-hidden="true">¥</span>' +
            '<input class="expense-price-input" type="number" min="0" step="0.01" ' +
            'inputmode="decimal" value="' + (item.price ? (item.price / 100).toFixed(2) : '') +
            '" placeholder="0.00" aria-label="第 ' + (index + 1) + ' 笔价格"></div>' +
            '<button type="button" class="expense-delete" aria-label="删除第 ' + (index + 1) +
            ' 笔" title="删除">×</button></div>';
        }).join('');
      }
      updateTotals();
      if (focusIndex !== undefined && focusIndex !== null) {
        const row = list.querySelector('.expense-row[data-index="' + focusIndex + '"]');
        if (row) row.querySelector('.expense-name').focus();
      }
    }

    function close() {
      if (!overlay.isConnected) return;
      node.expenses = node.expenses.map(function (item) {
        return {
          name: String(item.name || '').trim(),
          price: Math.max(0, Math.round(item.price || 0))
        };
      }).filter(function (item) {
        return item.name || item.price;
      });
      markDirty();
      overlay.remove();
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      const entry = app.querySelector('[data-expense-open]');
      if (entry) {
        const total = dayExpenseCents(node);
        entry.classList.toggle('has-expenses', total > 0);
        entry.title = '记账 · ' + formatCents(total);
        entry.setAttribute('aria-label', '记账，今日支出 ' + formatCents(total));
        entry.focus();
      }
    }

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }

    list.addEventListener('input', function (event) {
      const row = event.target.closest('.expense-row');
      if (!row) return;
      const item = node.expenses[Number(row.dataset.index)];
      if (!item) return;
      if (event.target.classList.contains('expense-name')) {
        item.name = event.target.value;
      } else if (event.target.classList.contains('expense-price-input')) {
        item.price = Math.max(0, amountToCents(event.target.value));
      }
      updateTotals();
      markDirty();
    });

    list.addEventListener('focusout', function (event) {
      if (!event.target.classList.contains('expense-price-input')) return;
      const row = event.target.closest('.expense-row');
      const item = row ? node.expenses[Number(row.dataset.index)] : null;
      if (item) event.target.value = item.price ? (item.price / 100).toFixed(2) : '';
    });

    list.addEventListener('click', function (event) {
      const button = event.target.closest('.expense-delete');
      if (!button) return;
      const row = button.closest('.expense-row');
      node.expenses.splice(Number(row.dataset.index), 1);
      renderRows();
      markDirty();
    });

    addButton.addEventListener('click', function () {
      node.expenses.push({ name: '', price: 0 });
      renderRows(node.expenses.length - 1);
      markDirty();
    });
    closeButton.addEventListener('click', close);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    renderRows(0);
  }

  /* ---------------- 找电影 ---------------- */

  function movieRegionMatch(movie, region) {
    if (region === '全部') return true;
    const regions = movie.regions || [];
    if (region === '华语') {
      return regions.some(function (item) {
        return item === '中国大陆' || item === '中国香港' || item === '中国台湾';
      });
    }
    if (region === '欧美') {
      const west = ['美国', '英国', '法国', '德国', '意大利', '西班牙', '加拿大', '澳大利亚',
        '爱尔兰', '瑞典', '丹麦', '巴西', '俄罗斯'];
      return regions.some(function (item) { return west.indexOf(item) >= 0; });
    }
    return regions.indexOf(region) >= 0;
  }

  function movieDecadeMatch(movie, label) {
    if (label === '全部') return true;
    const decade = MOVIE_DECADES.filter(function (item) { return item.label === label; })[0];
    if (!decade) return true;
    const year = Number(movie.year) || 0;
    if (decade.from && year < decade.from) return false;
    if (decade.to && year > decade.to) return false;
    return true;
  }

  function movieSearchText(movie) {
    return [movie.title, movie.en, movie.year, movie.director].concat(
      movie.actors || [], movie.genres || [], movie.regions || []
    ).join(' ').toLowerCase();
  }

  function movieDoubanUrl(movie) {
    return movie.id ? 'https://movie.douban.com/subject/' + movie.id + '/' : '';
  }

  function wireMovieEntry(year, month, day) {
    const button = app.querySelector('[data-movies-open]');
    if (!button) return;
    button.addEventListener('click', function () {
      openMovieModal(year, month, day);
    });
  }

  function openMovieModal(year, month, day) {
    if (document.querySelector('.expense-modal')) return;
    const node = dayNode(year, month, day, true);
    const filters = { genre: '全部', region: '全部', decade: '全部', sort: 'U', query: '' };
    const feed = {
      online: null,
      items: [],
      known: {},
      start: 0,
      hasMore: true,
      loading: false,
      token: 0,
      error: '',
      note: ''
    };

    function pickIds() {
      return node.movies.map(function (item) { return item.id; }).filter(Boolean);
    }

    function isPicked(id) {
      return pickIds().indexOf(id) >= 0;
    }

    function chipRow(attr, values, active) {
      return values.map(function (value) {
        const on = value === active;
        return '<button type="button" class="filter-chip' + (on ? ' is-active' : '') +
          '" data-' + attr + '="' + esc(value) + '" aria-pressed="' + on + '">' + esc(value) + '</button>';
      }).join('');
    }

    function playlistMarkup() {
      if (!node.movies.length) {
        return '<span class="playlist-empty">还没选片 ·点海报下方的「加入今日片单」挑一部。</span>';
      }
      return node.movies.map(function (item, index) {
        return '<span class="playlist-item"><span class="playlist-title">' + esc(item.title) +
          (item.year ? ' <em>' + esc(item.year) + '</em>' : '') + '</span>' +
          '<button type="button" class="playlist-remove" data-unpick="' + index +
          '" aria-label="从今日片单移除《' + esc(item.title) + '》" title="移除">×</button></span>';
      }).join('');
    }

    function offlineList() {
      const query = filters.query.trim().toLowerCase();
      const tokens = query ? query.split(/\s+/) : [];
      const list = MOVIES.filter(function (movie) {
        if (filters.genre !== '全部' && (movie.genres || []).indexOf(filters.genre) < 0) return false;
        if (!movieRegionMatch(movie, filters.region)) return false;
        if (!movieDecadeMatch(movie, filters.decade)) return false;
        if (tokens.length) {
          const haystack = movieSearchText(movie);
          if (!tokens.every(function (token) { return haystack.indexOf(token) >= 0; })) return false;
        }
        return true;
      });
      list.sort(function (a, b) {
        if (filters.sort === 'R') return b.votes - a.votes;
        if (filters.sort === 'T') return (Number(b.year) || 0) - (Number(a.year) || 0);
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.votes - a.votes;
      });
      return list;
    }

    function offlinePage(start) {
      const page = offlineList().slice(start, start + 40);
      return {
        items: page.map(function (movie) {
          return {
            id: movie.id,
            title: movie.title,
            rating: movie.rating,
            year: movie.year,
            poster: movie.poster,
            cover: '',
            directors: movie.director ? [movie.director] : [],
            casts: movie.actors || [],
            genres: movie.genres || [],
            regions: movie.regions || []
          };
        }),
        hasMore: start + 40 < offlineList().length
      };
    }

    function requestPage() {
      if (feed.online !== true) return Promise.resolve(offlinePage(feed.start));
      const keyword = filters.query.trim();
      const decade = MOVIE_DECADES.filter(function (item) { return item.label === filters.decade; })[0] || {};
      if (keyword) {
        return MovieSource.search({
          q: keyword,
          genres: filters.genre,
          countries: filters.region,
          from: decade.from,
          to: decade.to,
          sort: filters.sort,
          start: feed.start
        });
      }
      return MovieSource.discover({
        genres: filters.genre,
        countries: filters.region,
        from: decade.from,
        to: decade.to,
        sort: filters.sort,
        start: feed.start
      });
    }

    function cardMarkup(movie) {
      const id = movie.id;
      const picked = isPicked(id);
      const posterSrc = movie.poster || (movie.cover ? MovieSource.poster(movie.cover) : '');
      const line = movie.directors && movie.directors.length
        ? '导演 ' + movie.directors.slice(0, 2).join(' / ')
        : [movie.year, (movie.regions || []).join(' / ')].filter(Boolean).join(' · ');
      return '<article class="movie-card">' +
        '<button type="button" class="movie-poster' + (posterSrc ? '' : ' is-plain') +
        '" data-detail="' + esc(id) + '" aria-label="查看《' + esc(movie.title) + '》详情">' +
        (posterSrc
          ? '<img src="' + esc(posterSrc) + '" alt="" loading="lazy" decoding="async">'
          : '<span class="movie-poster-fallback">' + esc(movie.title.slice(0, 4)) + '</span>') +
        (movie.rating ? '<span class="movie-score">' + movie.rating.toFixed(1) + '</span>' : '') +
        '</button>' +
        '<div class="movie-body"><h3 class="movie-name">' +
        '<button type="button" class="movie-name-btn" data-detail="' + esc(id) + '">' +
        esc(movie.title) + '</button></h3>' +
        (line ? '<p class="movie-meta">' + esc(line) + '</p>' : '') +
        '<button type="button" class="movie-pick' + (picked ? ' is-picked' : '') +
        '" data-pick="' + esc(id) + '" aria-pressed="' + picked + '">' +
        (picked ? '✓ 已在片单' : '＋ 加入今日片单') + '</button></div></article>';
    }

    function detailMarkup(data) {
      const picked = isPicked(data.id);
      const meta = [data.year, data.region, data.duration].filter(Boolean).join(' · ');
      const genres = (data.genres || []).join(' · ');
      const directors = (data.directors || []).join(' / ');
      const actors = (data.actors || []).slice(0, 8).join(' / ');
      return '<div class="detail-card">' +
        (data.poster
          ? '<figure class="detail-poster"><img src="' + esc(data.poster) + '" alt="《' +
            esc(data.title) + '》海报"></figure>'
          : '') +
        '<div class="detail-info">' +
        '<h3 class="detail-name">' + esc(data.title) +
        (data.year ? ' <em>' + esc(data.year) + '</em>' : '') + '</h3>' +
        '<p class="detail-rate">' +
        (data.rating
          ? '<span class="detail-score">' + data.rating.toFixed(1) + '</span><span class="detail-score-label">豆瓣评分</span>'
          : '<span class="detail-score is-none">暂无评分</span>') +
        (meta ? '<span class="detail-meta">' + esc(meta) + '</span>' : '') + '</p>' +
        (genres ? '<p class="detail-genres">' + esc(genres) + '</p>' : '') +
        (directors ? '<p class="detail-row"><span>导演</span>' + esc(directors) + '</p>' : '') +
        (actors ? '<p class="detail-row"><span>主演</span>' + esc(actors) + '</p>' : '') +
        (data.summary ? '<p class="detail-summary">' + esc(data.summary) + '</p>' : '') +
        '<div class="detail-actions">' +
        '<button type="button" class="movie-pick detail-pick' + (picked ? ' is-picked' : '') +
        '" data-pick="' + esc(data.id) + '" aria-pressed="' + picked + '">' +
        (picked ? '✓ 已在片单' : '＋ 加入今日片单') + '</button>' +
        (data.url ? '<a class="detail-link" href="' + esc(data.url) +
          '" target="_blank" rel="noopener noreferrer">在豆瓣查看 ↗</a>' : '') +
        '</div></div></div>';
    }

    function openDetail(id, fallback) {
      const local = MOVIE_BY_ID[id];
      if (local) {
        detailBody.innerHTML = detailMarkup({
          id: local.id,
          title: local.title,
          year: local.year,
          rating: local.rating,
          genres: local.genres,
          region: (local.regions || []).join(' / '),
          duration: '',
          directors: local.director ? [local.director] : [],
          actors: local.actors || [],
          summary: local.quote || '',
          url: movieDoubanUrl(local),
          poster: local.poster
        });
      } else if (feed.online !== true) {
        detailBody.innerHTML = '<p class="movie-empty">离线片库没有这部影片的详情。运行 <code>python serve.py</code> 后可查看豆瓣条目。</p>';
      } else {
        detailBody.innerHTML = '<p class="movie-empty">正在加载豆瓣条目…</p>';
        MovieSource.detail(id).then(function (data) {
          if (fallback && fallback.cover) data.poster = MovieSource.poster(fallback.cover);
          detailBody.innerHTML = detailMarkup(data);
        }).catch(function (error) {
          detailBody.innerHTML = '<p class="movie-empty">条目加载失败：' +
            esc(error && error.message ? error.message : '网络异常') + '</p>';
        });
      }
      detail.hidden = false;
      const back = overlay.querySelector('.detail-back');
      if (back) back.focus();
    }

    function closeDetail() {
      detail.hidden = true;
      detailBody.innerHTML = '';
    }

    const overlay = document.createElement('div');
    overlay.className = 'expense-modal movie-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'movie-title');
    overlay.innerHTML =
      '<div class="expense-sheet movie-sheet">' +
      '<div class="movie-head"><div>' +
      '<p class="eyebrow">找电影</p>' +
      '<h2 id="movie-title">今天想看点什么？</h2>' +
      '<p class="sub">' + year + ' 年 ' + month + ' 月 ' + day + ' 日 ·<span id="movie-source-note">豆瓣电影片库</span></p>' +
      '</div><button type="button" class="expense-close movie-close" aria-label="关闭找电影">×</button></div>' +
      '<div class="movie-scroll" id="movie-scroll">' +
      '<div class="playlist" id="movie-playlist"><span class="playlist-label">今日片单</span>' +
      playlistMarkup() + '</div>' +
      '<div class="movie-toolbar">' +
      '<label class="movie-search"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4 4"/></svg>' +
      '<input id="movie-search" type="search" placeholder="搜索片名、导演、演员、类型" autocomplete="off" aria-label="搜索电影">' +
      '</label>' +
      '<label class="movie-sort"><span>排序</span><select id="movie-sort" aria-label="排序方式">' +
      MOVIE_SORTS.map(function (item) {
        return '<option value="' + esc(item.value) + '">' + esc(item.label) + '</option>';
      }).join('') +
      '</select></label></div>' +
      '<div class="movie-filters">' +
      '<div class="filter-row"><span class="filter-label">类型</span><div class="filter-chips">' +
      chipRow('genre', MOVIE_GENRES, '全部') + '</div></div>' +
      '<div class="filter-row"><span class="filter-label">地区</span><div class="filter-chips">' +
      chipRow('region', MOVIE_REGIONS, '全部') + '</div></div>' +
      '<div class="filter-row"><span class="filter-label">年代</span><div class="filter-chips">' +
      chipRow('decade', MOVIE_DECADES.map(function (item) { return item.label; }), '全部') +
      '</div></div></div>' +
      '<p class="movie-count" id="movie-count" role="status" aria-live="polite"></p>' +
      '<div class="movie-grid" id="movie-grid"></div>' +
      '<div class="movie-foot"><button type="button" class="movie-more" id="movie-more" hidden>加载更多</button></div>' +
      '</div>' +
      '<div class="movie-detail" id="movie-detail" hidden>' +
      '<div class="detail-bar"><button type="button" class="detail-back" data-detail-close>← 返回片库</button></div>' +
      '<div class="detail-body" id="movie-detail-body"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    const scrollEl = overlay.querySelector('#movie-scroll');
    const grid = overlay.querySelector('#movie-grid');
    const countEl = overlay.querySelector('#movie-count');
    const moreButton = overlay.querySelector('#movie-more');
    const playlistEl = overlay.querySelector('#movie-playlist');
    const sourceNote = overlay.querySelector('#movie-source-note');
    const searchInput = overlay.querySelector('#movie-search');
    const sortSelect = overlay.querySelector('#movie-sort');
    const closeButton = overlay.querySelector('.movie-close');
    const detail = overlay.querySelector('#movie-detail');
    const detailBody = overlay.querySelector('#movie-detail-body');

    function renderPlaylist() {
      playlistEl.innerHTML = '<span class="playlist-label">今日片单</span>' + playlistMarkup();
    }

    function syncPickButtons() {
      const ids = pickIds();
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-pick]'), function (button) {
        const picked = ids.indexOf(button.dataset.pick) >= 0;
        button.classList.toggle('is-picked', picked);
        button.setAttribute('aria-pressed', String(picked));
        button.textContent = picked ? '✓ 已在片单' : '＋ 加入今日片单';
      });
    }

    function renderStatus() {
      if (feed.error) {
        countEl.innerHTML = '<span class="movie-error">' + esc(feed.error) + '</span>' +
          '<button type="button" class="movie-retry" data-retry>重试</button>';
      } else if (feed.loading && !feed.items.length) {
        countEl.textContent = '正在加载豆瓣片库…';
      } else if (feed.online === null) {
        countEl.textContent = '正在连接豆瓣片库…';
      } else if (feed.online !== true) {
        countEl.innerHTML = '离线片库 <b>' + feed.items.length + '</b>部 ·运行 <code>python serve.py</code> 接入豆瓣全库';
      } else if (!feed.items.length) {
        countEl.textContent = feed.note || '没有符合条件的电影，换个筛选条件或关键词试试。';
      } else {
        const keyword = filters.query.trim();
        countEl.innerHTML = '已加载 <b>' + feed.items.length + '</b>部 ·豆瓣电影片库' +
          (keyword ? ' ·关键词「' + esc(keyword) + '」' : '') +
          (feed.loading ? ' ·加载中…' : '');
        if (feed.note) {
          countEl.innerHTML += '<span class="movie-note">' + esc(feed.note) + '</span>';
        }
      }
      moreButton.hidden = !feed.hasMore || !!feed.error;
      moreButton.disabled = feed.loading;
      moreButton.textContent = feed.loading ? '加载中…' : '加载更多';
      sourceNote.textContent = feed.online
        ? '豆瓣电影片库 ·类型 / 地区 / 年代均为全库筛选'
        : '离线片库 ·运行 python serve.py 接入豆瓣全库';
    }

    function skeleton() {
      grid.innerHTML = new Array(9).join('<div class="movie-skeleton" aria-hidden="true"></div>');
    }

    function clearSkeleton() {
      Array.prototype.forEach.call(grid.querySelectorAll('.movie-skeleton'), function (node) {
        node.remove();
      });
    }

    function loadMore() {
      if (feed.loading || !feed.hasMore || feed.error) return;
      const token = feed.token;
      feed.loading = true;
      renderStatus();
      requestPage().then(function (page) {
        if (token !== feed.token) return;
        feed.loading = false;
        const items = Array.isArray(page.items) ? page.items : [];
        items.forEach(function (item) {
          if (item && item.id) feed.known[item.id] = item;
        });
        feed.items = feed.items.concat(items);
        feed.start += items.length;
        feed.note = page.note || '';
        feed.hasMore = !!page.hasMore && items.length > 0;
        clearSkeleton();
        if (items.length) grid.insertAdjacentHTML('beforeend', items.map(cardMarkup).join(''));
        renderStatus();
      }).catch(function (error) {
        if (token !== feed.token) return;
        feed.loading = false;
        feed.error = '加载失败：' + (error && error.message ? error.message : '网络异常');
        renderStatus();
      });
    }

    function resetFeed() {
      feed.token += 1;
      feed.items = [];
      feed.start = 0;
      feed.hasMore = true;
      feed.loading = false;
      feed.error = '';
      feed.note = '';
      grid.innerHTML = '';
      skeleton();
      renderStatus();
      loadMore();
    }

    function refreshEntry() {
      const entry = app.querySelector('[data-movies-open]');
      if (!entry) return;
      const count = node.movies.length;
      entry.classList.toggle('has-movies', count > 0);
      entry.title = '找电影 ·今日片单 ' + count + ' 部';
      entry.setAttribute('aria-label', '找电影，今日片单 ' + count + ' 部');
    }

    function stabilizeYear(id) {
      if (feed.online !== true) return;
      const entry = node.movies.filter(function (item) { return item.id === id; })[0];
      if (!entry || entry.year) return;
      MovieSource.detail(id).then(function (data) {
        const target = node.movies.filter(function (item) { return item.id === id; })[0];
        if (!target || !data || !data.year) return;
        target.year = data.year;
        if (!target.rating && data.rating) target.rating = data.rating;
        markDirty();
        renderPlaylist();
      }).catch(function () {});
    }

    let observer = null;

    function close() {
      if (!overlay.isConnected) return;
      if (observer) observer.disconnect();
      overlay.remove();
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      refreshEntry();
      const entry = app.querySelector('[data-movies-open]');
      if (entry) entry.focus();
    }

    function onKey(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (!detail.hidden) {
        closeDetail();
        return;
      }
      close();
    }

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) close();
    });
    closeButton.addEventListener('click', close);
    moreButton.addEventListener('click', loadMore);

    overlay.addEventListener('click', function (event) {
      const chip = event.target.closest('.filter-chip');
      if (chip) {
        const type = chip.dataset.genre ? 'genre' : chip.dataset.region ? 'region' : 'decade';
        filters[type] = chip.textContent;
        const row = chip.parentNode;
        Array.prototype.forEach.call(row.children, function (item) {
          const on = item === chip;
          item.classList.toggle('is-active', on);
          item.setAttribute('aria-pressed', String(on));
        });
        resetFeed();
        return;
      }

      const retry = event.target.closest('[data-retry]');
      if (retry) {
        feed.error = '';
        loadMore();
        return;
      }

      const pick = event.target.closest('[data-pick]');
      if (pick) {
        const id = pick.dataset.pick;
        const item = feed.known[id] || MOVIE_BY_ID[id];
        if (!item) return;
        if (isPicked(id)) {
          node.movies = node.movies.filter(function (entry) { return entry.id !== id; });
        } else {
          node.movies.push(normalizeMovie({
            id: id,
            title: item.title,
            year: item.year || '',
            rating: item.rating || 0
          }));
        }
        markDirty();
        renderPlaylist();
        syncPickButtons();
        refreshEntry();
        stabilizeYear(id);
        return;
      }

      const remove = event.target.closest('[data-unpick]');
      if (remove) {
        const index = Number(remove.dataset.unpick);
        const removed = node.movies[index];
        node.movies.splice(index, 1);
        markDirty();
        renderPlaylist();
        syncPickButtons();
        refreshEntry();
        if (removed) remove.focus();
        return;
      }

      const open = event.target.closest('[data-detail]');
      if (open) {
        openDetail(open.dataset.detail, feed.known[open.dataset.detail]);
        return;
      }

      const back = event.target.closest('[data-detail-close]');
      if (back) closeDetail();
    });

    let searchTimer = 0;
    searchInput.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        filters.query = searchInput.value;
        resetFeed();
      }, 200);
    });

    sortSelect.addEventListener('change', function () {
      filters.sort = sortSelect.value;
      resetFeed();
    });

    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          if (feed.hasMore && !feed.error) loadMore();
        }
      }, { root: scrollEl, rootMargin: '320px 0px' });
      observer.observe(moreButton);
    }

    MovieSource.online().then(function (available) {
      if (!overlay.isConnected) return;
      feed.online = available;
      resetFeed();
    });
    searchInput.focus();
  }


  /* ---------------- Markdown 导入 / 导出 ---------------- */

  const MD_MAX_BYTES = 5 * 1024 * 1024;

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function dayStamp() {
    const now = new Date();
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  }

  function nowStamp() {
    const now = new Date();
    return dayStamp() + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
  }

  // 以 \ 或 # 开头的行可能被误认为章节，导出时转义；导入时还原。
  function escapeMdText(text) {
    return String(text).split('\n').map(function (line) {
      if (line.charAt(0) === '\\' || line.charAt(0) === '#') {
        return '\\' + line;
      }
      return line;
    }).join('\n');
  }

  function unescapeMdLine(line) {
    if (line.slice(0, 2) === '\\\\') return line.slice(1);
    if (line.slice(0, 2) === '\\#') return line.slice(1);
    return line;
  }

  function trimBlankLines(lines) {
    let start = 0;
    let end = lines.length;
    while (start < end && !lines[start].trim()) start += 1;
    while (end > start && !lines[end - 1].trim()) end -= 1;
    return lines.slice(start, end);
  }

  function pushField(parts, heading, text) {
    // 保留内容的首行缩进与末尾空行，避免破坏 Markdown 代码块；只用 trim 判断是否为空。
    const raw = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    if (!raw.trim()) return;
    const value = raw.replace(/\n+$/, '');
    parts.push(heading, '', escapeMdText(value), '');
  }

  function buildMarkdown() {
    const parts = [
      '# 人生日历',
      '',
      '> 此文件由「人生日历」生成，可直接导入网站恢复记录。',
      '',
      '- 格式版本：6',
      '- 导出时间：' + nowStamp(),
      '- 主题色：' + state.color,
      ''
    ];

    Object.keys(state.years)
      .map(Number)
      .filter(function (year) {
        return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
      })
      .sort(function (a, b) { return a - b; })
      .forEach(function (year) {
        const node = yearNode(year);
        if (!yearHasContent(node)) return;

        parts.push('## 年度 · ' + year, '');
        pushField(parts, '### 年度计划', node.plan);

        for (let month = 1; month <= 12; month += 1) {
          const mNode = monthNode(year, month);
          if (!monthHasContent(mNode)) continue;

          parts.push('### 月份 · ' + year + '-' + pad2(month), '');
          pushField(parts, '#### 月计划', mNode.plan);
          pushField(parts, '#### 本月收入', mNode.income > 0 ? centsToYuan(mNode.income) : '');

          Object.keys(mNode.days || {})
            .map(Number)
            .filter(function (day) {
              return Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month) &&
                hasDayContent(mNode.days[String(day)]);
            })
            .sort(function (a, b) { return a - b; })
            .forEach(function (day) {
              const dNode = mNode.days[String(day)];
              parts.push('#### 日期 · ' + year + '-' + pad2(month) + '-' + pad2(day) +
                ' · 星期' + weekdayName(year, month, day), '');
              pushField(parts, '##### 今日心情', dNode.mood);
              pushField(parts, '##### 今日天气', dNode.weather);
              pushField(parts, '##### 今日记录', dNode.journal);
              pushField(parts, '##### 值得记住的小事', dNode.highlights);
              const expenseLines = (dNode.expenses || []).filter(function (item) {
                return item && (item.name || item.price);
              }).map(function (item) {
                return '- ' + centsToYuan(item.price) + ' 元' +
                  (item.name ? ' · ' + item.name : '');
              }).join('\n');
              pushField(parts, '##### 今日支出', expenseLines);
              const movieLines = (dNode.movies || []).map(function (item) {
                const bits = [String(item.title || '').replace(/\s+/g, ' ').trim()];
                if (item.year) bits.push(item.year);
                if (item.rating) bits.push(item.rating.toFixed(1));
                if (item.id) bits.push(item.id);
                return '- ' + bits.join(' · ');
              }).filter(function (line) { return line !== '- '; }).join('\n');
              pushField(parts, '##### 今日电影', movieLines);
              pushField(parts, '##### 明日计划', dNode.next);
            });
        }
      });

    return parts.join('\n').replace(/\n+$/, '') + '\n';
  }

  function parseMarkdown(source) {
    const text = String(source).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    const years = {};
    let color = null;
    let year = null;
    let month = null;
    let day = null;
    let target = null;
    let recognized = false;
    let warnings = 0;
    let inHeader = true;

    function ensureYear(y) {
      const key = String(y);
      if (!years[key] || typeof years[key] !== 'object') {
        years[key] = { plan: '', months: {} };
      }
      const node = years[key];
      if (!node.months || typeof node.months !== 'object') node.months = {};
      if (typeof node.plan !== 'string') node.plan = '';
      return node;
    }

    function ensureMonth(y, m) {
      const node = ensureYear(y);
      const key = String(m);
      if (!node.months[key] || typeof node.months[key] !== 'object') {
        node.months[key] = { plan: '', income: 0, days: {} };
      }
      const mNode = node.months[key];
      if (!mNode.days || typeof mNode.days !== 'object') mNode.days = {};
      if (typeof mNode.plan !== 'string') mNode.plan = '';
      if (typeof mNode.income !== 'number' || !Number.isFinite(mNode.income)) mNode.income = 0;
      mNode.income = Math.max(0, Math.round(mNode.income));
      return mNode;
    }

    function ensureDay(y, m, d) {
      const mNode = ensureMonth(y, m);
      const key = String(d);
      if (!mNode.days[key] || typeof mNode.days[key] !== 'object') {
        mNode.days[key] = { mood: '', weather: '', journal: '', highlights: '', next: '', expenses: [], movies: [] };
      }
      const dNode = mNode.days[key];
      if (typeof dNode.work === 'string') {
        if (!dNode.journal) dNode.journal = dNode.work;
        delete dNode.work;
      }
      if (typeof dNode.mood !== 'string') dNode.mood = '';
      if (typeof dNode.weather !== 'string') dNode.weather = '';
      if (typeof dNode.journal !== 'string') dNode.journal = '';
      if (typeof dNode.highlights !== 'string') dNode.highlights = '';
      if (typeof dNode.next !== 'string') dNode.next = '';
      if (!Array.isArray(dNode.expenses)) dNode.expenses = [];
      dNode.expenses = dNode.expenses.map(function (item) {
        return {
          name: item && typeof item.name === 'string' ? item.name : '',
          price: item && Number.isFinite(item.price) ? Math.max(0, Math.round(item.price)) : 0
        };
      }).filter(function (item) { return !!(item.name || item.price); });
      if (!Array.isArray(dNode.movies)) dNode.movies = [];
      dNode.movies = dNode.movies.map(normalizeMovie).filter(function (item) {
        return !!(item.id || item.title);
      });
      return dNode;
    }

    function flush() {
      if (!target) return;
      const value = trimBlankLines(target.lines).map(unescapeMdLine).join('\n');
      const apply = target.apply;
      target = null;
      if (value.trim()) apply(value);
    }

    lines.forEach(function (line) {
      let match;

      if (inHeader) {
        if (/^##/.test(line)) {
          inHeader = false;
        } else {
          if (/^#\s*人生日历\s*$/.test(line) || /^-\s*格式版本：/.test(line)) {
            recognized = true;
          }
          match = /^-\s*主题色：\s*(#[0-9a-fA-F]{6})\s*$/.exec(line);
          if (match) color = match[1].toLowerCase();
          return;
        }
      }

      match = /^##\s*年度\s*[·・]\s*(\d{4})\s*$/.exec(line);
      if (match) {
        flush();
        recognized = true;
        const y = Number(match[1]);
        if (y < MIN_YEAR || y > MAX_YEAR) {
          warnings += 1;
          year = null;
          month = null;
          day = null;
          return;
        }
        year = y;
        month = null;
        day = null;
        ensureYear(y);
        return;
      }

      match = /^###\s*月份\s*[·・]\s*(\d{4})-(\d{1,2})\s*$/.exec(line);
      if (match) {
        flush();
        const y = Number(match[1]);
        const m = Number(match[2]);
        if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12) {
          warnings += 1;
          month = null;
          day = null;
          return;
        }
        year = y;
        month = m;
        day = null;
        ensureMonth(y, m);
        return;
      }

      match = /^####\s*日期\s*[·・]\s*(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*[·・].*)?\s*$/.exec(line);
      if (match) {
        flush();
        const y = Number(match[1]);
        const m = Number(match[2]);
        const d = Number(match[3]);
        if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 ||
            d < 1 || d > daysInMonth(y, m)) {
          warnings += 1;
          day = null;
          return;
        }
        year = y;
        month = m;
        day = d;
        ensureDay(y, m, d);
        return;
      }

      if (/^###\s*年度计划\s*$/.test(line)) {
        if (year === null) {
          if (target) target.lines.push(line);
          return;
        }
        flush();
        const node = ensureYear(year);
        target = { lines: [], apply: function (value) { node.plan = value; } };
        return;
      }

      if (/^####\s*月计划\s*$/.test(line)) {
        if (year === null || month === null) {
          if (target) target.lines.push(line);
          return;
        }
        flush();
        const node = ensureMonth(year, month);
        target = { lines: [], apply: function (value) { node.plan = value; } };
        return;
      }

      if (/^####\s*本月收入\s*$/.test(line)) {
        if (year === null || month === null) {
          if (target) target.lines.push(line);
          return;
        }
        flush();
        const node = ensureMonth(year, month);
        target = {
          lines: [],
          apply: function (value) {
            node.income = Math.max(0, amountToCents(value));
          }
        };
        return;
      }

      match = /^#####\s*(今日心情|心情|今日天气|天气|今日记录|今日工作记录|值得记住的小事|三件小事|今日小事|今日支出|今日电影|今日片单|观影记录|明日计划|明日工作计划)\s*$/.exec(line);
      if (match) {
        if (year === null || month === null || day === null) {
          if (target) target.lines.push(line);
          return;
        }
        flush();
        {
          const node = ensureDay(year, month, day);
          const label = match[1];
          if (label === '今日心情' || label === '心情') {
            target = {
              lines: [],
              apply: function (value) {
                const first = trimBlankLines(String(value).split('\n'))
                  .map(unescapeMdLine)[0];
                const text = (first || '').trim();
                node.mood = MOODS.indexOf(text) >= 0 ? text : '';
              }
            };
          } else if (label === '今日天气' || label === '天气') {
            target = {
              lines: [],
              apply: function (value) {
                const first = trimBlankLines(String(value).split('\n'))
                  .map(unescapeMdLine)[0];
                const text = (first || '').trim();
                node.weather = WEATHERS.some(function (item) {
                  return item.label === text;
                }) ? text : '';
              }
            };
          } else if (label === '今日支出') {
            target = {
              lines: [],
              apply: function (value) { node.expenses = parseExpenseLines(value); }
            };
          } else if (label === '今日电影' || label === '今日片单' || label === '观影记录') {
            target = {
              lines: [],
              apply: function (value) { node.movies = parseMovieLines(value); }
            };
          } else {
            let field = 'next';
            if (label === '今日记录' || label === '今日工作记录') field = 'journal';
            else if (label === '值得记住的小事' || label === '三件小事' || label === '今日小事') {
              field = 'highlights';
            }
            target = { lines: [], apply: function (value) { node[field] = value; } };
          }
        }
        return;
      }

      // 未识别的标题行不结束当前字段：旧文件或手写文件里正文的 # 标题
      // 若被当作结构丢弃，会导致整段记录在导入时静默丢失。
      if (target) target.lines.push(line);
    });

    flush();

    if (!recognized) {
      throw new Error('未识别到日历数据：请选择由本站导出的 MD 文件。');
    }

    return { years: years, color: color, warnings: warnings };
  }

  function importTextFile(file) {
    if (!file) return;
    if (file.size > MD_MAX_BYTES) {
      setNotice('文件超过 5 MB，无法导入', true);
      return;
    }
    if (dirty && !window.confirm('导入会替换当前未同步的内容，继续吗？')) return;

    file.text().then(function (text) {
      const parsed = parseMarkdown(text);
      state.years = parsed.years;
      if (parsed.color) state.color = parsed.color;
      applyTheme(state.color);
      fileHandle = null;
      pendingHandle = null;
      updateReconnectButton();
      clearStoredHandle();
      fileName = file.name;
      dirty = true;
      editRevision += 1;
      noticeText = '';
      noticeIsError = false;
      currentKey = '';
      render();
      const stats = countData();
      setNotice('已导入 ' + file.name + ' · 未连接文件，修改需导出' +
        (parsed.warnings ? '，跳过 ' + parsed.warnings + ' 处异常日期' : ''), false);
    }).catch(function (err) {
      setNotice(err && err.message ? err.message : '导入失败，请确认文件格式', true);
    });
  }

  function exportMarkdown() {
    if (flushVditorEditors()) {
      dirty = true;
      editRevision += 1;
    }
    const isCopy = !!fileHandle;
    const name = isCopy
      ? '人生日历-副本-' + dayStamp() + '.md'
      : (fileName || '人生日历-' + dayStamp() + '.md');
    try {
      const content = buildMarkdown();
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

      if (!isCopy && !fileName) fileName = name;
      const stats = countData();
      setNotice((isCopy ? '已下载副本 ' : '已导出 ') + name + ' · ' +
        stats.years + ' 年 · ' + stats.days + ' 天记录', false);
    } catch (err) {
      setNotice('导出失败，请重试', true);
    }
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
    destroyVditorEditors();
    if (route.level !== 'day') hideWeatherOverlay();
    if (route.level === 'home') renderHome();
    else if (route.level === 'year') renderYear(route.y);
    else if (route.level === 'month') renderMonth(route.y, route.m);
    else renderDay(route.y, route.m, route.d);
  }

  /* ---------------- 启动 ---------------- */

  buildSwatches();
  applyTheme(state.color);

  const initialDate = new Date();
  todayHint.textContent = '今天 ' + initialDate.getFullYear() + ' 年 ' +
    (initialDate.getMonth() + 1) + ' 月 ' + initialDate.getDate() + ' 日';

  colorInput.addEventListener('input', function () {
    applyTheme(colorInput.value);
    markDirty();
  });

  openBtn.addEventListener('click', openCalendarFile);
  saveAsBtn.addEventListener('click', chooseSaveLocation);
  reconnectBtn.addEventListener('click', reconnectHandle);
  exportBtn.addEventListener('click', exportMarkdown);

  fileInput.addEventListener('change', function () {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    importTextFile(file);
  });

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
      event.preventDefault();
      if (fileHandle) syncToFile();
      else exportMarkdown();
    }
  });

  if (!supportsFsa) {
    saveAsBtn.hidden = true;
  }
  updateReconnectButton();

  refreshStatus();
  window.addEventListener('hashchange', function () {
    if (flushVditorEditors()) {
      dirty = true;
      editRevision += 1;
      if (fileHandle) scheduleSync();
    }
    render();
  });
  window.addEventListener('resize', updateWeatherOverlaySize);
  render();
  restoreStoredHandle();
})();
