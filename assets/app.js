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
  // 类型 / 地区 / 排序都是 TMDB 的官方口径，找电影直接按这些参数查全库。
  const MOVIE_GENRES = ['全部', '动作', '冒险', '动画', '喜剧', '犯罪', '纪录', '剧情',
    '家庭', '奇幻', '历史', '恐怖', '音乐', '悬疑', '爱情', '科幻', '惊悚', '战争', '西部'];
  const MOVIE_REGIONS = ['全部', '华语', '中国大陆', '中国香港', '中国台湾', '美国', '日本',
    '韩国', '英国', '法国', '德国', '意大利', '西班牙', '印度', '泰国', '俄罗斯', '加拿大',
    '澳大利亚', '欧美'];
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
    { value: 'popularity.desc', label: '综合排序' },
    { value: 'vote_average.desc', label: '评分最高' },
    { value: 'vote_count.desc', label: '评价人数' },
    { value: 'primary_release_date.desc', label: '最新上映' }
  ];
  // 评分门槛：TMDB 用 vote_average.gte 服务端筛，Cinemeta / 搜索接口拿回后本地筛。
  const MOVIE_RATINGS = ['全部', '9分以上', '8分以上', '7.5分以上', '7分以上', '6分以上'];
  const RATING_MIN = {
    '9分以上': 9, '8分以上': 8, '7.5分以上': 7.5, '7分以上': 7, '6分以上': 6
  };
  // 「想看的电影」「看过的电影」在本地排序。
  const LIBRARY_SORTS = [
    { value: 'added', label: '收藏时间' },
    { value: 'rating', label: '评分最高' },
    { value: 'year', label: '上映年份' },
    { value: 'title', label: '片名' }
  ];
  // 清单里的地区筛选用条目自带的地区字段，「华语」「欧美」按同一口径展开。
  const REGION_GROUPS = {
    '华语': ['中国大陆', '中国香港', '中国台湾', '香港', '台湾', '澳门', '中国', 'China',
      'Hong Kong', 'Taiwan'],
    '欧美': ['美国', '英国', '法国', '德国', '意大利', '西班牙', '加拿大', '澳大利亚',
      '爱尔兰', '瑞典', '丹麦', '荷兰', '俄罗斯', '波兰', '奥地利', '比利时',
      'United States of America', 'United States', 'USA', 'United Kingdom', 'UK', 'England',
      'France', 'Germany', 'Italy', 'Spain', 'Canada', 'Australia', 'Ireland', 'Sweden',
      'Denmark', 'Netherlands', 'Russia']
  };

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

  const state = { color: DEFAULT_COLOR, years: {}, library: { wish: [], watched: [] } };

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
      mNode.days[key] = { mood: '', weather: '', journal: '', highlights: '', next: '', expenses: [] };
    }
    const node = mNode.days[key];
    if (typeof node !== 'object' || Array.isArray(node)) {
      if (!create) return null;
      mNode.days[key] = { mood: '', weather: '', journal: '', highlights: '', next: '', expenses: [] };
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
    return node;
  }

  /* 电影收藏：想看 / 看过，各为一份独立列表，随 MD 一起保存。 */

  const COLLECTIONS = ['wish', 'watched'];

  function collectionList(kind) {
    if (!state.library || typeof state.library !== 'object') {
      state.library = { wish: [], watched: [] };
    }
    if (!Array.isArray(state.library[kind])) state.library[kind] = [];
    return state.library[kind];
  }

  // 类型 / 地区用来在「想看的电影」「看过的电影」里做与找电影一致的筛选。
  // 列表接口不返回这两个字段，收藏时会异步用 TMDB 条目补齐，存进 MD 一起保存。
  function normalizeTagList(value, limit) {
    const list = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[\/、,]/) : []);
    const out = [];
    list.forEach(function (entry) {
      const text = typeof entry === 'string' ? entry.replace(/\s+/g, ' ').trim() : '';
      if (text && out.indexOf(text) < 0 && out.length < limit) out.push(text);
    });
    return out;
  }

  function normalizeCollectionItem(item) {
    const raw = item && typeof item === 'object' ? item : {};
    const title = typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ').trim() : '';
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const year = /^\d{4}$/.test(raw.year || '') ? String(raw.year) : '';
    const rating = Number.isFinite(raw.rating) && raw.rating > 0
      ? Math.round(raw.rating * 10) / 10
      : 0;
    const cover = typeof raw.cover === 'string' && /^https?:\/\//.test(raw.cover) ? raw.cover : '';
    const added = /^\d{4}-\d{2}-\d{2}$/.test(raw.added || '') ? raw.added : '';
    // 原名与 IMDb id 不参与展示，只用来把两个片源里的同一部片认成一部。
    const originalTitle = typeof raw.originalTitle === 'string'
      ? raw.originalTitle.replace(/\s+/g, ' ').trim()
      : '';
    const imdbId = /^tt\d{3,}$/.test(raw.imdbId || '') ? raw.imdbId
      : (/^tt\d{3,}$/.test(id) ? id : '');
    // 两个片源对同一部片给的是两套 id。收藏必须同时记住 TMDB 数字 id 与 IMDb id，
    // 切换片源、重新导入 MD 之后才能在两边都认出「这部片已经收藏过」。
    const tmdbId = /^\d{1,9}$/.test(raw.tmdbId || '') ? String(raw.tmdbId)
      : (/^\d{1,9}$/.test(id) ? id : '');
    return {
      id: id, title: title, originalTitle: originalTitle, imdbId: imdbId,
      tmdbId: tmdbId,
      year: year, rating: rating, cover: cover, added: added,
      genres: normalizeTagList(raw.genres, 4),
      regions: normalizeTagList(raw.regions || raw.region, 3)
    };
  }

  // 同一部片可能同时出现在 TMDB（数字 id、中文名）和 Cinemeta（IMDb id、英文名）。
  // 认片顺序：IMDb id → 条目 id → 原名 + 年份（没有原名时退回展示名）。
  function filmIdOf(item) {
    if (!item) return '';
    if (item.imdbId) return String(item.imdbId);
    const id = String(item.id || '');
    return /^tt\d{3,}$/.test(id) ? id : '';
  }

  function filmTitleKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function filmTitleOf(item) {
    if (!item) return '';
    return filmTitleKey(item.originalTitle || item.title);
  }

  // 跨片源认片用的稳定键：片名（原名优先）+ 年份。
  // TMDB 给中文名 + 英文原名，Cinemeta 只给英文名，两边按 originalTitle/title
  // 归一化后是同一条，因此「已经推荐过的片」在两个片源之间共享同一份记录。
  function filmKeyOf(item) {
    if (!item) return '';
    const title = filmTitleOf(item);
    if (title) return title + '|' + String(item.year || '');
    const imdb = filmIdOf(item);
    if (imdb) return imdb;
    return '';
  }

  function filmTmdbOf(item) {
    if (!item) return '';
    if (/^\d{1,9}$/.test(String(item.tmdbId || ''))) return String(item.tmdbId);
    const id = String(item.id || '');
    return /^\d{1,9}$/.test(id) ? id : '';
  }

  // 同一部片在 TMDB 存中文名、Cinemeta 存英文名，但两边通常都带英文原名。
  // 认片时把「展示名」和「原名」都当别名，任一对得上且年份不冲突就算同一部。
  function filmTitleKeys(item) {
    const keys = [];
    if (!item) return keys;
    [item.originalTitle, item.title].forEach(function (value) {
      const key = filmTitleKey(value);
      if (key && keys.indexOf(key) < 0) keys.push(key);
    });
    return keys;
  }

  function shareTitleAlias(a, b) {
    const aKeys = filmTitleKeys(a);
    const bKeys = filmTitleKeys(b);
    return aKeys.some(function (key) { return bKeys.indexOf(key) >= 0; });
  }

  function sameFilm(a, b) {
    if (!a || !b) return false;
    const aImdb = filmIdOf(a);
    const bImdb = filmIdOf(b);
    // 两边都有 IMDb id 时这是最强证据：不同就是不同的片。
    if (aImdb && bImdb) return aImdb === bImdb;
    const aTmdb = filmTmdbOf(a);
    const bTmdb = filmTmdbOf(b);
    if (aTmdb && bTmdb && aTmdb === bTmdb) return true;
    if (a.id && b.id && String(a.id) === String(b.id)) return true;
    if (!shareTitleAlias(a, b)) return false;
    const aYear = String(a.year || '');
    const bYear = String(b.year || '');
    // 年份都不缺时必须一致；缺年份时只能在标题完全一致的前提下认作同一部。
    return !aYear || !bYear || aYear === bYear;
  }

  // 合并同一部片的两条记录：保留更完整的一条，另一条只用来补空缺。
  function mergeFilm(target, source) {
    if (!target || !source) return;
    ['imdbId', 'tmdbId', 'originalTitle'].forEach(function (field) {
      if (!target[field] && source[field]) target[field] = source[field];
    });
    if (!target.year && source.year) target.year = source.year;
    if (!target.title && source.title) target.title = source.title;
    if (!target.rating && source.rating) target.rating = source.rating;
    if (!target.cover && source.cover) target.cover = source.cover;
    if (!target.id && source.id) target.id = source.id;
    if (!(target.genres || []).length && (source.genres || []).length) {
      target.genres = source.genres.slice(0, 4);
    }
    if (!(target.regions || []).length && (source.regions || []).length) {
      target.regions = source.regions.slice(0, 3);
    }
    // 收藏日期保留更早的那次。
    if (source.added && (!target.added || source.added < target.added)) {
      target.added = source.added;
    }
  }

  // 合并「想看」与「看过」里的同一部片：看过优先，重复的记录直接删掉。
  // 打开找电影、导入 MD 后都会跑一次，用户不需要手工清理。
  function dedupeLibrary() {
    let removed = 0;
    const watched = collectionList('watched');
    const wish = collectionList('wish');
    for (let index = wish.length - 1; index >= 0; index -= 1) {
      const hit = watched.filter(function (entry) { return sameFilm(entry, wish[index]); })[0];
      if (!hit) continue;
      mergeFilm(hit, wish[index]);
      wish.splice(index, 1);
      removed += 1;
    }
    COLLECTIONS.forEach(function (kind) {
      const list = collectionList(kind);
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const first = list.findIndex(function (entry) { return sameFilm(entry, list[index]); });
        if (first < 0 || first === index) continue;
        mergeFilm(list[first], list[index]);
        list.splice(index, 1);
        removed += 1;
      }
    });
    return removed;
  }

  function findSameFilm(item) {
    const lists = COLLECTIONS.map(collectionList);
    for (let index = 0; index < lists.length; index += 1) {
      const found = lists[index].filter(function (entry) { return sameFilm(entry, item); })[0];
      if (found) return found;
    }
    return null;
  }

  // 取消收藏、换清单或去重时，把两个片源里的同一部片一起清掉，避免残留数字 id 的副本。
  function removeFilm(item) {
    COLLECTIONS.forEach(function (kind) {
      const list = collectionList(kind);
      for (let index = list.length - 1; index >= 0; index -= 1) {
        if (sameFilm(list[index], item)) list.splice(index, 1);
      }
    });
  }

  function findInCollection(kind, id) {
    if (!id) return null;
    return collectionList(kind).filter(function (item) { return item.id === id; })[0] || null;
  }

  function removeFromCollection(kind, id) {
    const list = collectionList(kind);
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index].id === id) list.splice(index, 1);
    }
  }

  function addToCollection(kind, item) {
    const next = normalizeCollectionItem(item);
    if (!next.title) return false;
    const previous = findSameFilm(next);
    if (previous) {
      if (previous.added && !next.added) next.added = previous.added;
      if (!next.originalTitle && previous.originalTitle) next.originalTitle = previous.originalTitle;
      if (!next.imdbId && previous.imdbId) next.imdbId = previous.imdbId;
      if (!next.tmdbId && previous.tmdbId) next.tmdbId = previous.tmdbId;
    }
    removeFilm(next);
    if (!next.added) next.added = dayStamp();
    collectionList(kind).push(next);
    return true;
  }

  function libraryCounts() {
    return { wish: collectionList('wish').length, watched: collectionList('watched').length };
  }

  function hasLibraryContent() {
    const counts = libraryCounts();
    return counts.wish > 0 || counts.watched > 0;
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
    });
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

  // MD 里的电影行：- 片名 · 年份 · 评分 · TMDB id · 加入日期 · 海报地址
  // 尾部可选字段从后往前剥离，标题里带「·」也能原样还原。
  function parseMovieLine(line, fallbackDate) {
    const text = String(line || '').replace(/^\s*-\s*/, '').replace(/\s+$/, '');
    if (!text) return null;
    let parts = text.split(/\s+·\s+/).map(function (part) { return part.trim(); });
    // 旧版导出的个别行少了「·」分隔：标题、年份、评分、id 粘在一起
    // （如「杀死比尔20038.0」「幽灵公主19978.3128」）。不拆开的话
    // 整行会被当成一个片名，既显示错乱，也无法和另一个片源的同一部片去重。
    const repaired = [];
    parts.forEach(function (part) {
      // 裸 IMDb id、海报地址、日期都是合法字段，不能拿去匹配「标题+年份+评分」，
      // 否则 tt6019206 会被拆成「tt60 / 1920 / 6」。
      if (/^tt\d{3,}$/.test(part) || /^https?:\/\//.test(part) ||
          /^\d{4}-\d{2}-\d{2}$/.test(part) ||
          /^(类型|地区|原名|imdb|tmdb)=/.test(part)) {
        repaired.push(part);
        return;
      }
      const glued = /^(.+?)((?:19|20)\d{2})(\d{1,2}(?:\.\d)?)(\d{1,9})?$/.exec(part);
      const strayId = /^(\d{1,9})\.0$/.exec(part);
      if (glued && glued[1].trim()) {
        repaired.push(glued[1].trim(), glued[2], glued[3]);
        if (glued[4]) repaired.push('tmdb=' + glued[4]);
        return;
      }
      // 「24.0」这种一位小数不是评分（评分不超过 10），是 TMDB id 被误写成小数。
      if (strayId && Number(strayId[1]) > 10) {
        repaired.push('tmdb=' + strayId[1]);
        return;
      }
      repaired.push(part);
    });
    parts = repaired;
    const item = { title: '', year: '', rating: 0, id: '', cover: '', added: fallbackDate || '' };
    // 类型 / 地区 / 原名 / IMDb id 用带标签的段落写在行尾，既能被旧解析器当成普通文本保留，
    // 也能让清单页做与找电影一致的筛选、跨片源认出同一部片。
    const tags = { genres: [], regions: [] };
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const tagged = /^(类型|地区|原名|imdb|tmdb)=(.+)$/.exec(parts[index]);
      if (!tagged) continue;
      if (tagged[1] === '原名') {
        item.originalTitle = tagged[2].trim();
      } else if (tagged[1] === 'tmdb') {
        if (/^\d{1,9}$/.test(tagged[2].trim())) {
          item.tmdbId = tagged[2].trim();
          if (!item.id) item.id = item.tmdbId;
        }
      } else if (tagged[1] === 'imdb') {
        if (/^tt\d{3,}$/.test(tagged[2].trim())) {
          item.imdbId = tagged[2].trim();
          if (!item.id) item.id = item.imdbId;
        }
      } else {
        const key = tagged[1] === '类型' ? 'genres' : 'regions';
        tags[key] = normalizeTagList(tagged[2], 4);
      }
      parts.splice(index, 1);
    }
    if (parts.length > 1 && /^https?:\/\/\S+$/.test(parts[parts.length - 1])) item.cover = parts.pop();
    if (parts.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1])) item.added = parts.pop();
    // TMDB 的 id 可能只有 3 位（如《搏击俱乐部》是 550），不能只认 5 位以上；
    // 但 4 位且落在 1900–2100 的数字是年份，必须留给后面的年份解析。
    const tail = parts[parts.length - 1] || '';
    const looksYear = /^(?:19|20|21)\d{2}$/.test(tail);
    if (parts.length > 1 && (/^tt\d{3,}$/.test(tail) ||
        (/^\d{3,8}$/.test(tail) && !looksYear))) {
      item.id = parts.pop();
    }
    // 评分只会是 0-10 的一位小数（如 9.2、8），4 位纯数字是年份，不能当评分吃掉。
    if (parts.length > 1 && /^\d{1,2}(?:\.\d)?$/.test(parts[parts.length - 1])) {
      item.rating = Number(parts.pop()) || 0;
    }
    if (parts.length > 1 && /^\d{4}$/.test(parts[parts.length - 1])) item.year = parts.pop();
    // 旧版解析曾把 4 位年份写成评分（如 2026.0），读回时还原成年份。
    if (!item.year && item.rating >= 1900 && item.rating <= 2100) {
      item.year = String(Math.round(item.rating));
      item.rating = 0;
    }
    item.title = parts.join(' · ').trim();
    if (!item.title) return null;
    item.genres = tags.genres;
    item.regions = tags.regions;
    return normalizeCollectionItem(item);
  }

  function parseMovieLines(value) {
    const items = [];
    String(value || '').split('\n').forEach(function (line) {
      if (!/^\s*-/.test(line)) return;
      const item = parseMovieLine(line, '');
      if (item) items.push(item);
    });
    return items;
  }

  // 旧版「今日电影 / 今日片单」章节迁移到「看过的电影」。
  function migrateDayMovies(list, date) {
    (list || []).forEach(function (item) {
      if (!item || !item.title) return;
      if (!item.added) item.added = date;
      // 已经在「看过」里就不动；只在「想看」里则按同一部片移过来。
      if (collectionList('watched').some(function (entry) { return sameFilm(entry, item); })) return;
      addToCollection('watched', item);
    });
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
        needsSync = current.years > 0 || current.days > 0 || hasLibraryContent();
      }
    }

    if (parsed) {
      state.years = parsed.years;
      // 电影清单同样是文件内容的一部分，恢复文件时必须一起读回来，
      // 否则重开页面后清单为空，下一次写入会把文件里的收藏覆盖掉。
      state.library = parsed.library || { wish: [], watched: [] };
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
    setNotice('正在打开保存位置选择器…', false);
    // 部分环境里 showSaveFilePicker 既不弹窗也不报错；给一个带条件的提示，
    // 不打断仍在挑选文件的人（对话框通常会让窗口失焦）。
    let hinted = false;
    const hintTimer = setTimeout(function () {
      hinted = true;
      if (document.hasFocus() && !fileHandle) {
        setNotice('如果没看到保存对话框：当前浏览器无法自动同步，请用「导出副本」保存文件', true);
      }
    }, 2500);
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
      clearTimeout(hintTimer);
      if (err && err.name === 'AbortError') {
        if (!hinted) setNotice('已取消选择保存位置 ·修改可用「导出副本」保存', false);
        return;
      }
      setNotice('无法选择保存位置：' + describeFileError(err) + ' ·可改用「导出副本」', true);
      return;
    }
    clearTimeout(hintTimer);
    try {
      await writeHandle(handle, buildMarkdown());
    } catch (err) {
      setNotice('无法写入文件：' + describeFileError(err), true);
      return;
    }
    await attachHandle(handle, false);
  }

  // 打开文件统一走 <input type="file">：所有浏览器、HTTPS 静态托管
  // （GitHub Pages）和 file:// 下都能用；showOpenFilePicker 在部分环境
  // 不弹窗也不报错，用户看到的就是「点了没反应」。
  let inputNoticeTimer = 0;

  function pickWithInput(message) {
    if (dirty && !window.confirm('导入会替换当前未同步的内容，继续吗？')) return;
    if (message) setNotice(message, false);
    fileInput.value = '';
    try {
      fileInput.click();
    } catch (err) {
      setNotice('无法打开文件选择：' + describeFileError(err), true);
      return;
    }
    clearTimeout(inputNoticeTimer);
    inputNoticeTimer = setTimeout(function () {
      setNotice('如果没看到文件选择框：可以把 .md 文件直接拖进页面，或改用 Chrome / Edge 打开', false);
    }, 8000);
  }

  function openCalendarFile() {
    pickWithInput('请选择要打开的 Markdown 文件…');
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
    const movies = libraryCounts();

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
      '<button type="button" class="expense-entry film-entry' +
      (movies.wish || movies.watched ? ' has-movies' : '') +
      '" data-movies-open aria-haspopup="dialog" title="找电影 · 想看 ' + movies.wish +
      ' 部 · 看过 ' + movies.watched + ' 部' +
      '" aria-label="找电影，想看 ' + movies.wish + ' 部，看过 ' + movies.watched + ' 部">' +
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

  // 打开日页面时顺手把「找电影」的首屏拉进内存：用户点胶片按钮时列表已经就绪。
  // 整个会话只做一次，用空闲时段发起，不抢首屏渲染。
  // 首屏在整个片库里随机取页：先探明片源真实页数（TMDB 500 页、Cinemeta 200 页，
  // 都是接口硬上限），再在其中均匀随机。深页里那些热度不高但值得一看的冷门片
  // 同样有机会出现在首屏；嫌冷门可以用顶部的评分筛选收窄。
  // 页号记进 localStorage：刷新、关掉弹层再进来都不会又落回同一页。
  const MOVIE_START_KEY = 'life.movie.startPage';
  // 已经展示过的影片跨会话记一份：用户关掉弹层、刷新页面、甚至明天再进来，
  // 首屏与「换一批」都不会再推荐同一批片。按片名+年份记录，两个片源共享。
  const MOVIE_SEEN_KEY = 'life.movie.seen';
  const MOVIE_SEEN_LIMIT = 4000;
  let seenFilms = null;
  let seenSaveTimer = 0;
  let movieWarmPage = 0;

  function loadSeenFilms() {
    if (seenFilms) return seenFilms;
    seenFilms = new Set();
    try {
      const raw = JSON.parse(localStorage.getItem(MOVIE_SEEN_KEY) || '[]');
      if (Array.isArray(raw)) {
        raw.forEach(function (key) {
          if (typeof key === 'string' && key) seenFilms.add(key);
        });
      }
    } catch (error) {
      /* 隐私模式或脏数据：从空集合开始，不影响使用 */
    }
    return seenFilms;
  }

  function saveSeenFilms() {
    if (!seenFilms) return;
    clearTimeout(seenSaveTimer);
    seenSaveTimer = setTimeout(function () {
      try {
        let list = Array.from(seenFilms);
        if (list.length > MOVIE_SEEN_LIMIT) list = list.slice(list.length - MOVIE_SEEN_LIMIT);
        localStorage.setItem(MOVIE_SEEN_KEY, JSON.stringify(list));
      } catch (error) {
        /* 存储满或隐私模式：本次会话内仍然有效 */
      }
    }, 120);
  }

  function filmSeen(item) {
    return !!item && loadSeenFilms().has(filmKeyOf(item));
  }

  // 卡片一进网格就记下，不等关闭弹层：中途退出也不会让下一批重复。
  function rememberFilm(item) {
    const key = filmKeyOf(item);
    if (!key) return false;
    const set = loadSeenFilms();
    if (set.has(key)) return false;
    set.add(key);
    saveSeenFilms();
    return true;
  }

  function lastStartPage() {
    try { return Number(localStorage.getItem(MOVIE_START_KEY)) || 0; } catch (error) { return 0; }
  }

  function randomStartPage(max) {
    const span = Math.max(1, Number(max) || MovieSource.maxPage());
    let page = Math.floor(Math.random() * span) + 1;
    // 撞上一次的首屏页就顺延一页，保证「每次进来都不一样」。
    if (page === lastStartPage()) page = (page % span) + 1;
    try { localStorage.setItem(MOVIE_START_KEY, String(page)); } catch (error) { /* 隐私模式 */ }
    return page;
  }

  // 预热过的那一页就是弹层首屏要显示的页；还没预热就临场随机（按当前片源上限）。
  function takeStartPage() {
    if (movieWarmPage) {
      const page = movieWarmPage;
      movieWarmPage = 0;
      return page;
    }
    return randomStartPage(0);
  }

  let movieWarmed = false;
  function warmMovieLibrary() {
    if (movieWarmed) return;
    movieWarmed = true;
    const start = function () {
      MovieSource.startPage().then(function (probe) {
        if (!probe || !probe.ok) {
          movieWarmed = false;
          movieWarmPage = 0;
          return;
        }
        movieWarmPage = randomStartPage(probe.totalPages);
        MovieSource.warm(movieWarmPage).then(function (ok) {
          if (!ok) {
            movieWarmed = false;
            movieWarmPage = 0;
          }
        });
      });
    };
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 800);
  }

  function wireMovieEntry(year, month, day) {
    const button = app.querySelector('[data-movies-open]');
    if (!button) return;
    button.addEventListener('click', function () {
      openMovieModal(year, month, day);
    });
    warmMovieLibrary();
  }

  function openMovieModal(year, month, day) {
    if (document.querySelector('.expense-modal')) return;
    // 每次打开都先合并两个片源留下的重复收藏，保证清单里一部片只有一条。
    if (dedupeLibrary()) markDirty();
    const node = dayNode(year, month, day, true);
    const filters = {
      genre: '全部', region: '全部', decade: '全部', rating: '全部',
      sort: 'popularity.desc', query: ''
    };
    const feed = {
      online: null,
      items: [],
      known: {},
      shown: {},
      page: 1,
      totalPages: 0,
      hasMore: true,
      loading: false,
      token: 0,
      error: '',
      unavailable: '',
      note: ''
    };

    // 想看 / 看过都算「已收藏」，推荐流不再推它们，但搜索和收藏列表不受影响。
    // 判定按「同一部片」而不是条目 id：TMDB 与 Cinemeta 对同一部片给的是两套 id，
    // 只比 id 会让在 TMDB 收藏过的片又从 Cinemeta 推荐出来。
    function isSaved(movie) {
      if (!movie) return false;
      return collectionList('wish').concat(collectionList('watched'))
        .some(function (entry) { return sameFilm(entry, movie); });
    }

    // 旧版豆瓣片源存下来的海报（doubanio）现在会被对方站点按外链 403，
    // 豆瓣 id 新的两套片源也都用不了，需要按片名回查一次替换掉。
    const LEGACY_POSTER = /(^|\/\/)[^/]*douban(?:io)?\.com\//i;
    const repairTried = {};
    let repairing = false;

    function legacyPoster(item) {
      if (!item) return true;
      return !item.cover || LEGACY_POSTER.test(item.cover);
    }

    function repairKeyOf(item) {
      return [item.title, item.year, item.cover].join('|');
    }

    function isIn(kind, movie) {
      if (!movie || (!movie.id && !movie.title)) return false;
      return collectionList(kind).some(function (entry) { return sameFilm(entry, movie); });
    }

    // 想看 / 看过 互斥切换：再点一次同一状态即取消收藏。
    // 同一部片在另一个片源里已有记录时，直接沿用那条记录的身份字段，不再存第二份。
    function toggleCollection(kind, movie) {
      if (!movie || !movie.id) return false;
      if (isIn(kind, movie)) {
        removeFilm(movie);
        return false;
      }
      addToCollection(kind, {
        id: movie.id,
        title: movie.title || '',
        originalTitle: movie.originalTitle || '',
        imdbId: movie.imdbId || (/^tt\d{3,}$/.test(movie.id) ? movie.id : ''),
        tmdbId: movie.tmdbId || (/^\d{1,9}$/.test(movie.id) ? movie.id : ''),
        year: movie.year || '',
        rating: movie.rating || 0,
        cover: movie.cover || '',
        added: dayStamp()
      });
      return true;
    }

    function chipRow(attr, values, active) {
      return values.map(function (value) {
        const on = value === active;
        return '<button type="button" class="filter-chip' + (on ? ' is-active' : '') +
          '" data-' + attr + '="' + esc(value) + '" aria-pressed="' + on + '">' + esc(value) + '</button>';
      }).join('');
    }

    function posterOf(movie) {
      if (!movie) return '';
      if (movie.poster) return movie.poster;
      return movie.cover ? MovieSource.poster(movie.cover) : '';
    }

    function requestPage() {
      if (feed.online !== true) {
        // 连不上片源时不要抛错，交给状态区显示引导与重新检测按钮。
        return Promise.resolve({ items: [], hasMore: false, offline: true });
      }
      const keyword = filters.query.trim();
      const decade = MOVIE_DECADES.filter(function (item) { return item.label === filters.decade; })[0] || {};
      const payload = {
        q: keyword,
        genre: filters.genre === '全部' ? '' : filters.genre,
        country: filters.region === '全部' ? '' : filters.region,
        from: decade.from,
        to: decade.to,
        minRating: RATING_MIN[filters.rating] || 0,
        sort: filters.sort,
        page: feed.page
      };
      return keyword ? MovieSource.search(payload) : MovieSource.discover(payload);
    }

    function markButton(kind, movie, label) {
      const on = isIn(kind, movie);
      const id = movie && movie.id ? movie.id : '';
      return '<button type="button" class="movie-mark' + (on ? ' is-on' : '') +
        '" data-mark="' + kind + '" data-id="' + esc(id) +
        '" data-title="' + esc(movie && movie.title || '') +
        '" data-original="' + esc(movie && movie.originalTitle || '') +
        '" data-year="' + esc(movie && movie.year || '') +
        '" aria-pressed="' + on + '">' +
        (on ? '✓' : '＋') + ' ' + label + '</button>';
    }

    // 列表接口没有地区、原名和 IMDb id，收藏后用条目页补齐：
    // 清单筛选要地区，跨片源认同一部片要原名 / IMDb id。
    const enriching = {};
    function needsEnrich(item) {
      if (!item) return false;
      return !item.year || !item.rating || !(item.genres || []).length || !(item.regions || []).length;
    }

    function needsIdentity(item) {
      if (!item) return true;
      if (!item.originalTitle || !item.imdbId) return true;
      // 两个片源的状态要同步，收藏就得同时握着 TMDB 数字 id 与 IMDb id。
      // 没 Key 时无法反查 TMDB id，先不反复重试。
      return !!MovieSource.hasKey() && !item.tmdbId;
    }

    function enrichLibraryItem(id) {
      if (feed.online !== true || !id || enriching[id]) return;
      // 没有 Key 时 TMDB 数字条目读不了，等填了 Key 再补。
      if (!MovieSource.hasKey() && /^\d{1,9}$/.test(id)) return;
      const item = findInCollection('wish', id) || findInCollection('watched', id);
      if (!needsEnrich(item) && !needsIdentity(item)) return;
      enriching[id] = true;
      MovieSource.detail(id).then(function (data) {
        enriching[id] = false;
        if (!data || data.unavailable) return;
        const target = findInCollection('wish', id) || findInCollection('watched', id);
        if (!target) return;
        let changed = false;
        if (!target.year && data.year) { target.year = data.year; changed = true; }
        if (!target.rating && data.rating) { target.rating = data.rating; changed = true; }
        if (!target.title && data.title) { target.title = data.title; changed = true; }
        if (!target.originalTitle && data.originalTitle) {
          target.originalTitle = data.originalTitle;
          changed = true;
        }
        if (!target.imdbId && /^tt\d{3,}$/.test(data.imdbId || '')) {
          target.imdbId = data.imdbId;
          changed = true;
        }
        if (!(target.genres || []).length && data.genres && data.genres.length) {
          target.genres = normalizeTagList(data.genres, 4);
          changed = true;
        }
        if (!(target.regions || []).length && data.region) {
          target.regions = normalizeTagList(data.region, 3);
          changed = true;
        }
        const imdb = target.imdbId || (/^tt\d{3,}$/.test(data.imdbId || '') ? data.imdbId : '');
        if (!target.tmdbId && imdb && MovieSource.hasKey()) {
          // IMDb id → TMDB 数字 id：补齐后不管当前在哪个片源，这部片的状态都能对上。
          MovieSource.findByImdb(imdb).then(function (hit) {
            if (!hit || !hit.id) return;
            const current = findInCollection('wish', id) || findInCollection('watched', id);
            if (!current || current.tmdbId) return;
            current.tmdbId = String(hit.id);
            if (!current.originalTitle && hit.originalTitle) current.originalTitle = hit.originalTitle;
            markDirty();
            if (libraryKind) renderLibraryView();
            refreshEntry();
          }).catch(function () { /* 下次再补 */ });
        }
        if (!changed) return;
        markDirty();
        if (libraryKind) renderLibraryView();
      }).catch(function () { enriching[id] = false; });
    }

    // 清单页需要元数据才能筛选：打开清单时对缺字段的条目补一次（网络失败时静默跳过）。
    function enrichLibraryList() {
      if (!libraryKind) return;
      collectionList(libraryKind).slice(0, 8).forEach(function (entry) {
        if (needsEnrich(entry) || needsIdentity(entry)) enrichLibraryItem(entry.id);
      });
    }

    // 旧版收藏没存原名 / IMDb id，换片源后认不出是同一部片。
    // 打开找电影时按批补一次，补齐后随 MD 保存，之后的推荐排除和去重都准确。
    const identityTried = {};
    function upgradeLibraryIdentity(size) {
      if (feed.online !== true) return;
      collectionList('wish').concat(collectionList('watched'))
        .filter(function (entry) {
          return needsIdentity(entry) && entry.id && !identityTried[entry.id];
        })
        .slice(0, size || 4)
        .forEach(function (entry) {
          identityTried[entry.id] = true;
          enrichLibraryItem(entry.id);
        });
    }

    // TMDB 中文条目通常没存 IMDb id，只有中文名 + 英文原名。
    // 用英文原名去 Cinemeta 查一次，补上 IMDb id 后就能与英文片库里的
    // 同一条目合并，避免「杀死比尔」和「Kill Bill」各收藏一份。
    const imdbBackfill = {};
    function completeMissingImdb(size) {
      if (feed.online !== true) return;
      collectionList('wish').concat(collectionList('watched'))
        .filter(function (entry) {
          return entry && entry.imdbId === '' && entry.id && !imdbBackfill[entry.id];
        })
        .slice(0, size || 4)
        .forEach(function (entry) {
          const name = entry.originalTitle || entry.title;
          if (!name) return;
          imdbBackfill[entry.id] = true;
          MovieSource.cinemetaLookup(name, entry.year).then(function (match) {
            if (!match || !/^tt\d{3,}$/.test(String(match.id || ''))) return;
            const target = findInCollection('wish', entry.id) ||
              findInCollection('watched', entry.id);
            if (!target || target.imdbId) return;
            target.imdbId = String(match.id);
            if (!target.originalTitle && match.originalTitle) {
              target.originalTitle = match.originalTitle;
            }
            if (!target.year && match.year) target.year = match.year;
            dedupeLibrary();
            markDirty();
            renderLibraryButtons();
            if (libraryKind) renderLibraryView();
            refreshEntry();
          }).catch(function () { /* 下次打开再试 */ });
        });
    }

    // 用片名 + 年份把旧收藏里的豆瓣条目换成当前片源可用的条目，
    // 保留用户自己写的片名与收藏日期。
    function applyRepair(entry, match) {
      const before = entry.id + '|' + entry.cover;
      if (match.id) entry.id = match.id;
      entry.cover = match.cover;
      if (match.year) entry.year = match.year;
      if (match.rating) entry.rating = match.rating;
      if (match.genres && match.genres.length) {
        entry.genres = normalizeTagList(match.genres, 4);
      }
      return before !== entry.id + '|' + entry.cover;
    }

    function repairLibrary(size) {
      if (repairing || feed.online !== true) return;
      const batch = [];
      collectionList('wish').concat(collectionList('watched')).forEach(function (entry) {
        if (batch.length >= (size || 4)) return;
        if (!legacyPoster(entry)) return;
        const key = repairKeyOf(entry);
        if (repairTried[key]) return;
        const marked = batch.some(function (item) { return repairKeyOf(item) === key; });
        if (marked) return;
        batch.push(entry);
      });
      if (!batch.length) return;
      repairing = true;
      let changed = false;
      const tasks = batch.map(function (entry) {
        repairTried[repairKeyOf(entry)] = true;
        return MovieSource.lookup(entry.title, entry.year).then(function (match) {
          if (!match || !match.id || !match.cover) return;
          if (applyRepair(entry, match)) changed = true;
        }).catch(function () {
          /* 单片失败不影响其它条目，下次打开清单再试 */
        });
      });
      Promise.all(tasks).then(function () {
        repairing = false;
        if (!overlay.isConnected) return;
        if (changed) {
          markDirty();
          renderLibraryButtons();
          if (libraryKind) renderLibraryView();
          refreshEntry();
        }
        // 还有没回查过的旧条目就接着来一批，避免一次几十个请求把接口压满。
        const rest = collectionList('wish').concat(collectionList('watched')).some(function (entry) {
          return legacyPoster(entry) && !repairTried[repairKeyOf(entry)];
        });
        if (rest && changed) setTimeout(function () { repairLibrary(size); }, 300);
      });
    }

    // 海报真实地址 403/404 时把卡片换成文字底图，并按片名重新回查一次。
    function posterFailed(id) {
      const entry = findInCollection('wish', id) || findInCollection('watched', id);
      if (!entry || !entry.cover) return;
      entry.cover = '';
      markDirty();
      repairLibrary(2);
    }

    function cardMarkup(movie) {
      const id = movie.id;
      const posterSrc = posterOf(movie);
      const line = [movie.year, (movie.genres || []).slice(0, 2).join(' / ')]
        .filter(Boolean).join(' · ');
      return '<article class="movie-card">' +
        '<button type="button" class="movie-poster' + (posterSrc ? '' : ' is-plain') +
        '" data-open="' + esc(id) + '" data-title="' + esc(movie.title) + '" aria-label="查看《' + esc(movie.title) + '》的详情">' +
        (posterSrc
          ? '<img class="movie-poster-img" src="' + esc(posterSrc) + '" alt="" loading="lazy" decoding="async">'
          : '') +
        '<span class="movie-poster-fallback">' + esc(movie.title.slice(0, 4)) + '</span>' +
        (movie.rating ? '<span class="movie-score">' + movie.rating.toFixed(1) + '</span>' : '') +
        '</button>' +
        '<div class="movie-body"><h3 class="movie-name">' +
        '<button type="button" class="movie-name-btn" data-open="' + esc(id) + '" data-title="' + esc(movie.title) + '">' +
        esc(movie.title) + '</button></h3>' +
        (line ? '<p class="movie-meta">' + esc(line) + '</p>' : '') +
        '<div class="movie-marks">' + markButton('wish', movie, '想看') +
        markButton('watched', movie, '看过') + '</div></div></article>';
    }

    function metaLine(parts) {
      return parts.filter(Boolean).join(' · ');
    }

    // 详情改成用 TMDB 的 JSON 直接渲染：不再内嵌第三方页面，点开就是本地排版，
    // 断网、被墙、对方改版都不会白屏。
    // 右上角条目跳转跟随当前条目所属片源：IMDb 条目给 IMDb 徽标，TMDB 条目给 TMDB 徽标。
    // 两个片源用同一套详情排版，不再只给 TMDB 做跳转。
    function renderDetailBadge(id, title) {
      const link = detail.querySelector('.detail-douban');
      if (!link) return;
      const isImdb = /^tt\d{3,}$/.test(String(id || ''));
      const name = title || id;
      link.href = MovieSource.pageUrl(id);
      link.setAttribute('aria-label', '在 ' + (isImdb ? 'IMDb' : 'TMDB') +
        ' 打开《' + name + '》的条目页');
      link.innerHTML = isImdb
        ? '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<rect width="24" height="24" rx="6" fill="#f5c518"/>' +
          '<text x="12" y="16.2" text-anchor="middle" font-size="7.6" font-weight="700" ' +
          'fill="#111" font-family="PingFang SC,Microsoft YaHei,sans-serif">IMDb</text></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true">' +
          '<rect width="24" height="24" rx="6" fill="#01b4e4"/>' +
          '<text x="12" y="16.6" text-anchor="middle" font-size="9" fill="#fff" ' +
          'font-family="PingFang SC,Microsoft YaHei,sans-serif">TMDB</text></svg>';
    }

    function openDetail(id, title) {
      if (!id) return;
      detail.hidden = false;
      detailBody.innerHTML = '<div class="detail-loading">' +
        '<span class="detail-spinner"></span><span>正在读取影片资料…</span></div>';
      const back = overlay.querySelector('.detail-back');
      if (back) back.focus();
      renderDetailBadge(id, title);
      MovieSource.detail(id).then(function (movie) {
        if (!movie || detail.hidden) return;
        renderDetailBadge(movie.id, movie.title);
        feed.known[movie.id] = {
          id: movie.id, title: movie.title, originalTitle: movie.originalTitle,
          imdbId: movie.imdbId, year: movie.year,
          rating: movie.rating, cover: movie.cover, genres: movie.genres
        };
        const runtime = movie.runtime ? Math.round(movie.runtime) + ' 分钟' : '';
        const score = movie.rating ? movie.rating.toFixed(1) : '';
        const votes = movie.votes ? movie.votes.toLocaleString('zh-CN') + ' 人评分' : '';
        const tags = (movie.genres || []).join(' · ');
        detailBody.innerHTML =
          '<div class="movie-fiche">' +
          (movie.backdrop
            ? '<div class="fiche-backdrop" style="background-image:url(' +
              esc(movie.backdrop) + ')" aria-hidden="true"></div>'
            : '') +
          '<div class="fiche-head">' +
          (movie.cover
            ? '<img class="fiche-poster" src="' + esc(movie.cover) + '" alt="" decoding="async">'
            : '') +
          '<div class="fiche-info">' +
          '<h2 class="fiche-title">' + esc(movie.title) + '</h2>' +
          (movie.originalTitle && movie.originalTitle !== movie.title
            ? '<p class="fiche-original">' + esc(movie.originalTitle) + '</p>' : '') +
          '<p class="fiche-meta">' + esc(metaLine([movie.year, runtime, movie.region])) + '</p>' +
          (score
            ? '<p class="fiche-score"><b>' + esc(score) + '</b><span>' +
              esc(votes || '评分') + '</span></p>' : '') +
          (tags ? '<p class="fiche-tags">' + esc(tags) + '</p>' : '') +
          '<div class="movie-marks">' + markButton('wish', movie, '想看') +
          markButton('watched', movie, '看过') + '</div>' +
          '</div></div>' +
          (movie.directors.length
            ? '<p class="fiche-line"><span>导演</span>' + esc(movie.directors.join(' / ')) + '</p>'
            : '') +
          (movie.cast.length
            ? '<p class="fiche-line"><span>主演</span>' + esc(movie.cast.join(' / ')) + '</p>'
            : '') +
          '<p class="fiche-overview">' +
          esc(movie.overview || '这部片暂时没有简介。') + '</p>' +
          '<div class="fiche-actions">' +
          '<a class="btn btn-sm" href="' + esc(MovieSource.doubanSearchUrl(movie.title)) +
          '" target="_blank" rel="noopener noreferrer">在豆瓣搜《' +
          esc(movie.title) + '》</a>' +
          '<a class="btn btn-sm" href="' + esc(movie.external || MovieSource.pageUrl(movie.id)) +
          '" target="_blank" rel="noopener noreferrer">' +
          (movie.provider === 'cinemeta' ? 'IMDb 条目' : 'TMDB 条目') + '</a>' +
          '</div></div>';
      }).catch(function (error) {
        if (detail.hidden) return;
        detailBody.innerHTML = '<div class="detail-loading"><span>' +
          esc(error && error.message ? error.message : '影片资料读取失败') +
          '</span></div>';
      });
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
      '<div class="movie-head"><div class="movie-head-title">' +
      '<p class="eyebrow">找电影</p>' +
      '<h2 id="movie-title">今天想看点什么？</h2>' +
      '<p class="sub">' + year + ' 年 ' + month + ' 月 ' + day + ' 日 ·<span id="movie-source-note">正在连接片库…</span></p>' +
      '</div><div class="movie-head-actions">' +
      '<div class="movie-source-switch" role="group" aria-label="选择片源">' +
      '<button type="button" class="movie-source-btn" data-src="tmdb" aria-pressed="false" ' +
      'title="TMDB 中文片库（需要 API Key）">TMDB · 中文</button>' +
      '<button type="button" class="movie-source-btn" data-src="cinemeta" aria-pressed="false" ' +
      'title="Cinemeta 英文片库（免 Key）">Cinemeta · 英文</button>' +
      '</div>' +
      '<button type="button" class="collection-entry" data-lib="wish" aria-pressed="false" ' +
      'aria-label="想看的电影"><span class="collection-text">想看的电影</span>' +
      '<span class="collection-short">想看</span> <b data-lib-count="wish">0</b></button>' +
      '<button type="button" class="collection-entry" data-lib="watched" aria-pressed="false" ' +
      'aria-label="看过的电影"><span class="collection-text">看过的电影</span>' +
      '<span class="collection-short">看过</span> <b data-lib-count="watched">0</b></button>' +
      '<button type="button" class="movie-key-open" id="movie-key-open" aria-label="TMDB Key 设置">Key</button>' +
      '<button type="button" class="expense-close movie-close" aria-label="关闭找电影">×</button>' +
      '</div></div>' +
      '<div class="movie-scroll" id="movie-scroll">' +
      '<div class="movie-keypanel" id="movie-keypanel" tabindex="-1" hidden>' +
      '<p class="movie-keytitle" id="movie-key-title">可选：用 TMDB Key 切到中文片库</p>' +
      '<p class="movie-keytext" id="movie-key-text">不填也能用——当前是 Cinemeta 的英文全量片库（免 Key）。填一个免费的 TMDB ' +
      '<b>API Key (v3 auth)</b> 后，片名、简介、类型都会变成中文，筛选也更精确。' +
      'Key 只存在这台浏览器里，不会写进 MD 文件。</p>' +
      '<div class="movie-keyrow">' +
      '<input id="movie-key-input" type="text" spellcheck="false" autocomplete="off" ' +
      'aria-label="TMDB API Key" placeholder="粘贴 TMDB API Key">' +
      '<button type="button" class="btn btn-sm btn-primary" id="movie-key-save">保存并切换</button>' +
      '<button type="button" class="btn btn-sm" id="movie-key-clear" hidden>清除 Key</button>' +
      '<a class="btn btn-sm" href="https://www.themoviedb.org/settings/api" target="_blank" ' +
      'rel="noopener noreferrer">去申请 Key</a>' +
      '</div>' +
      '<p class="movie-keyhint" id="movie-key-hint" role="status" aria-live="polite"></p>' +
      '</div>' +
      '<div class="movie-controls">' +
      '<div class="movie-toolbar">' +
      '<label class="movie-search"><svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4 4"/></svg>' +
      '<input id="movie-search" type="search" placeholder="搜索片名、导演、演员、类型" autocomplete="off" aria-label="搜索电影">' +
      '</label>' +
      '<label class="movie-sort"><span>排序</span><select id="movie-sort" aria-label="排序方式">' +
      MOVIE_SORTS.map(function (item) {
        return '<option value="' + esc(item.value) + '">' + esc(item.label) + '</option>';
      }).join('') +
      '</select></label>' +
      '<button type="button" class="movie-shuffle" id="movie-shuffle" title="换一批电影">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.6"/>' +
      '<path d="M20 5v6h-6"/></svg>换一批</button></div>' +
      '<div class="movie-filters">' +
      '<div class="filter-row"><span class="filter-label">类型</span><div class="filter-chips">' +
      chipRow('genre', MOVIE_GENRES, '全部') + '</div></div>' +
      '<div class="filter-row"><span class="filter-label">地区</span><div class="filter-chips">' +
      chipRow('region', MOVIE_REGIONS, '全部') + '</div></div>' +
      '<div class="filter-row"><span class="filter-label">年代</span><div class="filter-chips">' +
      chipRow('decade', MOVIE_DECADES.map(function (item) { return item.label; }), '全部') +
      '</div></div>' +
      '<div class="filter-row"><span class="filter-label">评分</span><div class="filter-chips">' +
      chipRow('rating', MOVIE_RATINGS, '全部') + '</div></div></div></div>' +
      '<p class="movie-count" id="movie-count" role="status" aria-live="polite"></p>' +
      '<div class="movie-find" id="movie-find">' +
      '<div class="movie-grid" id="movie-grid"></div>' +
      '<div class="movie-foot"><button type="button" class="movie-more" id="movie-more" hidden>加载更多</button></div>' +
      '</div>' +
      '<div class="movie-library" id="movie-library" hidden></div>' +
      '</div>' +
      '<div class="movie-detail" id="movie-detail" hidden>' +
      '<div class="detail-bar"><button type="button" class="detail-back" data-detail-close>← 返回片库</button>' +
      '<a class="detail-douban" href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" ' +
      'aria-label="在片源网站打开这个条目"></a></div>' +
      '<div class="detail-body" id="movie-detail-body"></div>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');

    const scrollEl = overlay.querySelector('#movie-scroll');
    const grid = overlay.querySelector('#movie-grid');
    const countEl = overlay.querySelector('#movie-count');
    const moreButton = overlay.querySelector('#movie-more');
    const findEl = overlay.querySelector('#movie-find');
    const libraryEl = overlay.querySelector('#movie-library');
    const sourceNote = overlay.querySelector('#movie-source-note');
    const searchInput = overlay.querySelector('#movie-search');
    const sortSelect = overlay.querySelector('#movie-sort');
    const shuffleButton = overlay.querySelector('#movie-shuffle');
    const closeButton = overlay.querySelector('.movie-close');
    const detail = overlay.querySelector('#movie-detail');
    const detailBody = overlay.querySelector('#movie-detail-body');
    const keyPanel = overlay.querySelector('#movie-keypanel');
    const keyInput = overlay.querySelector('#movie-key-input');
    const keyHint = overlay.querySelector('#movie-key-hint');
    const keyOpen = overlay.querySelector('#movie-key-open');
    const keyTitle = overlay.querySelector('#movie-key-title');
    const keyText = overlay.querySelector('#movie-key-text');
    const keyClear = overlay.querySelector('#movie-key-clear');
    let libraryKind = null;
    renderLibraryButtons();

    function renderLibraryButtons() {
      const counts = libraryCounts();
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-lib]'), function (button) {
        const kind = button.dataset.lib;
        const count = counts[kind] || 0;
        const on = libraryKind === kind;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
        const badge = button.querySelector('[data-lib-count]');
        if (badge) badge.textContent = String(count);
      });
    }

    // 顶部小字与分段按钮一起反映当前片源：用户随时能看见现在用的是哪一套，
    // 已经保存的 Key 也不会再被当成「没填过」。
    function updateSourceNote() {
      const state = MovieSource.state();
      const tail = state.keyTail ? '（Key 末 ' + state.keyTail + '）' : '';
      if (sourceNote) {
        if (state.provider === 'tmdb') {
          sourceNote.textContent = 'TMDB 中文库' + tail;
        } else {
          sourceNote.textContent = 'Cinemeta 英文片库（免 Key）' +
            (state.hasKey ? ' · 已保存 Key，可切回 TMDB' : '');
        }
        if (state.error) {
          sourceNote.textContent += ' · ' + state.error;
        }
      }
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-src]'), function (button) {
        const on = button.dataset.src === state.provider;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
        if (button.dataset.src === 'tmdb' && state.hasKey) button.title = '已保存 Key' + tail;
      });
      // Cinemeta 只能按英文片名搜；TMDB 的中文检索能命中更多字段。
      if (searchInput) {
        searchInput.placeholder = state.provider === 'tmdb'
          ? '搜索片名、导演、演员、类型'
          : '搜索片名（英文）';
      }
      renderKeyPanel();
    }

    function renderKeyPanel() {
      const state = MovieSource.state();
      keyClear.hidden = !state.hasKey;
      keyTitle.textContent = state.hasKey ? 'TMDB Key 已保存' : '可选：用 TMDB Key 切到中文片库';
      if (state.hasKey) {
        keyText.innerHTML = '已保存 Key（末尾 <b>' + esc(state.keyTail) + '</b>），当前片源是 <b>' +
          (state.provider === 'tmdb' ? 'TMDB 中文库' : 'Cinemeta 英文片库（免 Key）') + '</b>。' +
          '可以在上面的两个按钮之间随时切换；Key 只存在这台浏览器里，不会写进 MD 文件。';
        keyInput.placeholder = '已保存（末尾 ' + state.keyTail + '），粘贴新 Key 可替换';
      } else {
        keyText.innerHTML = '不填也能用——当前是 Cinemeta 的英文全量片库（免 Key）。填一个免费的 TMDB ' +
          '<b>API Key (v3 auth)</b> 后，片名、简介、类型都会变成中文，筛选也更精确。' +
          'Key 只存在这台浏览器里，不会写进 MD 文件。';
        keyInput.placeholder = '粘贴 TMDB API Key（API Key (v3 auth)）';
      }
    }

    // 片源只需要一个 API Key（可选）：填一次就存在浏览器里，
    // 之后不管换筛选、翻多少页、点多少次「换一批」都不会再被限流。
    function showKeyPanel(show) {
      keyPanel.hidden = !show;
      if (!show) return;
      keyHint.textContent = '';
      renderKeyPanel();
      if (MovieSource.hasKey()) {
        // 已经有 Key 时不再把光标丢进输入框，避免看起来像「还让你重填」。
        keyPanel.focus();
      } else {
        keyInput.focus();
        keyInput.select();
      }
    }

    function saveKey() {
      const value = keyInput.value.trim();
      if (!value) {
        keyHint.textContent = '先把 Key 粘进来。';
        keyInput.focus();
        return;
      }
      MovieSource.setKey(value);
      keyInput.value = '';
      keyHint.textContent = '正在验证…';
      feed.online = null;
      feed.error = '';
      feed.unavailable = '';
      updateSourceNote();
      renderStatus();
      MovieSource.online().then(function (ok) {
        if (!overlay.isConnected) return;
        updateSourceNote();
        if (ok && MovieSource.provider() === 'tmdb') {
          keyHint.textContent = 'Key 有效，已切到 TMDB 中文片库。';
          feed.online = true;
          keyPanel.hidden = true;
          resetFeed(randomStartPage(0));
          return;
        }
        if (ok) {
          // TMDB 不通、但免 Key 片库还能用：不要谎称 Key 验证通过。
          keyHint.textContent = 'Key 没通过验证：' + (MovieSource.state().error || '网络异常') +
            '。已继续使用 Cinemeta 英文片库，确认复制的是「API Key (v3 auth)」那一串。';
          feed.online = true;
          resetFeed(randomStartPage(0));
          return;
        }
        keyHint.textContent = '片源没连上：' + (MovieSource.state().error || '网络异常') +
          '。检查网络后再试。';
        feed.online = false;
        renderStatus();
      });
    }

    function switchSource(name) {
      if (name === 'tmdb' && !MovieSource.hasKey()) {
        showKeyPanel(true);
        keyHint.textContent = 'TMDB 中文片库需要 API Key；也可以先用 Cinemeta 英文片库（免 Key）。';
        return false;
      }
      if (!MovieSource.setProvider(name)) return false;
      // 换片源不清空「已展示」记录：用户要的是换座片库继续发现新片，
      // 而不是把刚才那一批从头再推一遍。页号也重新随机。
      updateSourceNote();
      feed.online = null;
      feed.error = '';
      feed.unavailable = '';
      feed.note = '';
      renderStatus();
      MovieSource.online().then(function (ok) {
        if (!overlay.isConnected) return;
        feed.online = ok;
        updateSourceNote();
        if (ok) resetFeed(randomStartPage(0));
        else renderStatus();
      });
      return true;
    }

    keyOpen.addEventListener('click', function () { showKeyPanel(keyPanel.hidden); });
    overlay.querySelector('#movie-key-save').addEventListener('click', saveKey);
    keyClear.addEventListener('click', function () {
      MovieSource.setKey('');
      keyHint.textContent = '已清除 Key，回到 Cinemeta 英文片库。';
      feed.online = null;
      updateSourceNote();
      renderStatus();
      MovieSource.online().then(function (ok) {
        if (!overlay.isConnected) return;
        feed.online = ok;
        updateSourceNote();
        if (ok) resetFeed(randomStartPage(0));
        else renderStatus();
      });
    });
    keyInput.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveKey();
    });

    function libraryPoster(item) {
      if (!item || !item.cover || LEGACY_POSTER.test(item.cover)) return '';
      return MovieSource.poster(item.cover);
    }

    function libraryCard(item) {
      const posterSrc = libraryPoster(item);
      return '<article class="movie-card">' +
        '<button type="button" class="movie-poster' + (posterSrc ? '' : ' is-plain') +
        '" data-open="' + esc(item.id) + '" data-title="' + esc(item.title) + '" aria-label="查看《' + esc(item.title) + '》的详情">' +
        (posterSrc
          ? '<img class="movie-poster-img" src="' + esc(posterSrc) + '" alt="" loading="lazy" decoding="async">'
          : '') +
        '<span class="movie-poster-fallback">' + esc(item.title.slice(0, 4)) + '</span>' +
        (item.rating ? '<span class="movie-score">' + item.rating.toFixed(1) + '</span>' : '') +
        '</button>' +
        '<div class="movie-body"><h3 class="movie-name">' +
        '<button type="button" class="movie-name-btn" data-open="' + esc(item.id) + '" data-title="' + esc(item.title) + '">' +
        esc(item.title) + '</button></h3>' +
        '<p class="movie-meta">' + esc([item.year, item.added ? item.added + ' 收藏' : '']
          .filter(Boolean).join(' · ')) + '</p>' +
        '<div class="movie-marks">' + markButton('wish', item, '想看') +
        markButton('watched', item, '看过') + '</div>' +
        '<button type="button" class="movie-remove" data-remove="' + esc(item.id) +
        '" aria-label="从' + (libraryKind === 'wish' ? '想看的电影' : '看过的电影') +
        '移除《' + esc(item.title) + '》">移除</button></div></article>';
    }

    function regionMatches(item, region) {
      if (!region || region === '全部') return true;
      const regions = item.regions || [];
      if (!regions.length) return false;
      const group = REGION_GROUPS[region];
      return regions.some(function (entry) {
        if (group) return group.indexOf(entry) >= 0;
        return entry === region || entry.indexOf(region) >= 0;
      });
    }

    function filtersActive() {
      return filters.genre !== '全部' || filters.region !== '全部' ||
        filters.decade !== '全部' || filters.rating !== '全部' || !!filters.query.trim();
    }

    // 清单在本地筛选：类型 / 地区 / 年代 / 关键词都是收藏时随 MD 一起保存的字段。
    function libraryFiltered() {
      const keyword = filters.query.trim().toLowerCase();
      const decade = MOVIE_DECADES.filter(function (item) {
        return item.label === filters.decade;
      })[0] || {};
      return collectionList(libraryKind).filter(function (item) {
        if (keyword) {
          const hay = [item.title, item.year, (item.genres || []).join(' '),
            (item.regions || []).join(' ')].join(' ').toLowerCase();
          if (hay.indexOf(keyword) < 0) return false;
        }
        if (filters.genre !== '全部' && (item.genres || []).indexOf(filters.genre) < 0) return false;
        if (!regionMatches(item, filters.region)) return false;
        const minRating = RATING_MIN[filters.rating] || 0;
        if (minRating && !(Number(item.rating) >= minRating)) return false;
        if (decade.from) {
          const year = Number(item.year);
          if (!year || year < decade.from || year > decade.to) return false;
        }
        return true;
      });
    }

    function sortLibrary(list) {
      const sort = filters.sort;
      return list.sort(function (a, b) {
        if (sort === 'rating') {
          return (b.rating || 0) - (a.rating || 0) || String(b.year || '').localeCompare(String(a.year || ''));
        }
        if (sort === 'year') {
          return String(b.year || '').localeCompare(String(a.year || '')) ||
            (b.rating || 0) - (a.rating || 0);
        }
        if (sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hans-CN');
        return String(b.added || '').localeCompare(String(a.added || ''));
      });
    }

    function renderLibraryView() {
      if (!libraryKind) return;
      const all = collectionList(libraryKind).slice();
      const isWish = libraryKind === 'wish';
      const name = isWish ? '想看的电影' : '看过的电影';
      if (!all.length) {
        libraryEl.innerHTML = '<p class="movie-empty">' + (isWish
          ? '还没有想看的电影 · 在上方点「＋ 想看」把片子存进来。'
          : '还没有看过的电影 · 在上方点「＋ 看过」记录一下。') + '</p>';
        return;
      }
      const narrowed = filtersActive();
      const list = sortLibrary(libraryFiltered());
      const count = narrowed
        ? '<b>' + list.length + '</b> / ' + all.length + ' 部'
        : '<b>' + all.length + '</b> 部';
      let html = '<p class="movie-count">' + name + ' ' + count + '</p>';
      html += list.length
        ? '<div class="movie-grid">' + list.map(libraryCard).join('') + '</div>'
        : '<p class="movie-empty">没有符合条件的影片，换个关键词或筛选条件试试。</p>';
      if (narrowed && all.some(needsEnrich)) {
        html += '<p class="movie-note movie-hint">' +
          '部分影片还没有类型 / 地区资料（收藏时联网才能补齐），筛选时会漏掉它们。' +
          '</p>';
      }
      libraryEl.innerHTML = html;
    }

    // 清单与找电影共用一个搜索框和筛选条，切换视图时把排序选项换成对应的那一套。
    function applySortOptions() {
      const list = libraryKind ? LIBRARY_SORTS : MOVIE_SORTS;
      const values = list.map(function (item) { return item.value; });
      if (values.indexOf(filters.sort) < 0) filters.sort = list[0].value;
      sortSelect.innerHTML = list.map(function (item) {
        return '<option value="' + esc(item.value) + '">' + esc(item.label) + '</option>';
      }).join('');
      sortSelect.value = filters.sort;
      shuffleButton.hidden = !!libraryKind;
    }

    function openLibrary(kind) {
      libraryKind = kind;
      findEl.hidden = true;
      libraryEl.hidden = false;
      countEl.hidden = true;
      renderLibraryButtons();
      applySortOptions();
      renderLibraryView();
      enrichLibraryList();
      scrollEl.scrollTop = 0;
    }

    function closeLibrary() {
      libraryKind = null;
      libraryEl.hidden = true;
      findEl.hidden = false;
      renderLibraryButtons();
      applySortOptions();
      countEl.hidden = false;
      scrollEl.scrollTop = 0;
      renderStatus();
    }

    function syncMarks() {
      Array.prototype.forEach.call(overlay.querySelectorAll('[data-mark]'), function (button) {
        const movie = {
          id: button.dataset.id,
          title: button.dataset.title,
          originalTitle: button.dataset.original,
          year: button.dataset.year
        };
        const on = isIn(button.dataset.mark, movie);
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', String(on));
        const label = button.dataset.mark === 'wish' ? '想看' : '看过';
        button.textContent = (on ? '✓ ' : '＋ ') + label;
      });
    }

    // 两个片源都连不上时才出现：给一次重试与填 Key 的机会。
    // 平时无 Key 也能用（Cinemeta 英文片库），所以这里不再提示"必须填 Key"。
    function sourceNotice() {
      const state = MovieSource.state();
      return '<span class="movie-offline">片源没连上：' +
        esc(state.error || '网络异常') + '。' +
        (state.hasKey ? '' : '也可以填一个 TMDB Key 切到中文片库。') +
        '</span>' +
        '<button type="button" class="movie-retry" data-key>填写 Key</button>' +
        '<button type="button" class="movie-retry" data-start>重新检测</button>';
    }

    // 成功时不显示多余小字：网格本身就是结果，只有没 Key、连不上、
    // 没结果或自动切片时才给提示。
    function renderStatus() {
      if (libraryKind) {
        countEl.hidden = true;
        countEl.innerHTML = '';
        moreButton.hidden = true;
        return;
      }
      countEl.hidden = false;
      if (feed.error || feed.unavailable) {
        countEl.innerHTML = '<span class="movie-error">' + esc(feed.error || feed.unavailable) +
          '</span><button type="button" class="movie-retry" data-retry>重试</button>';
      } else if (feed.loading && !feed.items.length) {
        countEl.textContent = '正在加载片库…';
      } else if (feed.online === null) {
        countEl.textContent = '正在连接片库…';
      } else if (feed.online !== true) {
        countEl.innerHTML = sourceNotice();
      } else if (!feed.items.length) {
        countEl.textContent = feed.note || '没有符合条件的电影，换个筛选条件或关键词试试。';
      } else if (feed.note) {
        countEl.innerHTML = '<span class="movie-note">' + esc(feed.note) + '</span>';
      } else {
        countEl.hidden = true;
        countEl.innerHTML = '';
      }
      moreButton.hidden = !feed.hasMore || !!feed.error || !!feed.unavailable;
      moreButton.disabled = feed.loading;
      moreButton.textContent = feed.loading ? '加载中…' : '加载更多';
    }

    function skeleton() {
      grid.innerHTML = new Array(9).join('<div class="movie-skeleton" aria-hidden="true"></div>');
    }

    function clearSkeleton() {
      Array.prototype.forEach.call(grid.querySelectorAll('.movie-skeleton'), function (node) {
        node.remove();
      });
    }

    // 推荐流里跳过「想看/看过」的电影，也跳过已经展示过的条目；
    // 已展示记录跨片源、跨会话持久保存，整页都被过滤掉时继续取下一页。
    function fetchChunk(token, remaining, seen) {
      const used = seen || {};
      if (!seen) {
        feed.items.forEach(function (item) { used[item.id] = true; });
        grid.querySelectorAll('[data-open]').forEach(function (node) {
          used[node.getAttribute('data-open')] = true;
        });
      }
      return requestPage().then(function (page) {
        if (token !== feed.token) return { items: [], hasMore: false };
        if (page && page.unavailable) {
          return { items: [], hasMore: false, unavailable: page.unavailable };
        }
        const items = Array.isArray(page.items) ? page.items : [];
        items.forEach(function (item) {
          if (item && item.id) feed.known[item.id] = item;
        });
        const hideSaved = !filters.query.trim();
        const visible = items.filter(function (item) {
          if (!item || !item.id || used[item.id]) return false;
          // 跨片源判定：TMDB 收藏过的片不会因为 Cinemeta 用另一套 id 又被推出来。
          if (hideSaved && isSaved(item)) return false;
          // 持久记录里出现过的片，不管上次是在哪个片源看到的，都不再推荐。
          if (hideSaved && filmSeen(item)) return false;
          used[item.id] = true;
          return true;
        });
        visible.forEach(function (item) {
          feed.shown[item.id] = true;
          rememberFilm(item);
        });
        feed.page = (page.page || feed.page) + 1;
        feed.totalPages = page.totalPages || 0;
        feed.hasMore = !!page.hasMore && items.length > 0;
        feed.note = page.note || '';
        if (!visible.length && remaining > 0) {
          if (feed.hasMore) return fetchChunk(token, remaining - 1, used);
          // 已经翻到片库末尾还是全被过滤：回绕到第 1 页补找一次，
          // 避免「看过很多片之后首屏一片空白」。
          if (!feed.wrapped && page.page !== 1) {
            feed.wrapped = true;
            feed.page = 1;
            feed.hasMore = true;
            return fetchChunk(token, remaining - 1, used);
          }
        }
        return { items: visible, hasMore: feed.hasMore };
      });
    }

    function loadMore() {
      if (feed.loading || !feed.hasMore || feed.error || feed.unavailable) return;
      const token = feed.token;
      const isFirst = !feed.items.length;
      feed.loading = true;
      renderStatus();
      // 首屏多留几次翻页预算：热门页几乎都展示过了，要往深处取才有新片。
      fetchChunk(token, isFirst ? 8 : 4).then(function (result) {
        if (token !== feed.token) return;
        feed.loading = false;
        if (result.unavailable) {
          feed.unavailable = result.unavailable;
          clearSkeleton();
          renderStatus();
          return;
        }
        feed.items = feed.items.concat(result.items);
        clearSkeleton();
        if (result.items.length) {
          grid.insertAdjacentHTML('beforeend', result.items.map(cardMarkup).join(''));
          // 预先抓取最可能被点开的前两部，点开时就接近瞬开。
          result.items.slice(0, 2).forEach(function (item) {
            setTimeout(function () { MovieSource.preload(item.id); }, 600);
          });
        }
        renderStatus();
      }).catch(function (error) {
        if (token !== feed.token) return;
        feed.loading = false;
        feed.error = '加载失败：' + (error && error.message ? error.message : '网络异常');
        renderStatus();
      });
    }

    // TMDB discover 每页 20 条、最多到第 500 页，换一批就在这个范围里随机跳页，
    // 完全不需要付出任何"限流"代价。limit 必须来自当前筛选条件的真实页数，
    // 否则带筛选时会随机到 404。
    const usedPages = {};
    function pickFreshPage(limit) {
      const max = Math.max(1, Math.min(MovieSource.MAX_PAGE,
        limit || feed.totalPages || MovieSource.MAX_PAGE));
      const candidates = [];
      for (let page = 1; page <= max; page += 1) {
        if (!usedPages[page]) candidates.push(page);
      }
      if (!candidates.length) {
        Object.keys(usedPages).forEach(function (key) { delete usedPages[key]; });
        for (let page = 1; page <= max; page += 1) candidates.push(page);
      }
      const picked = candidates[Math.floor(Math.random() * candidates.length)];
      usedPages[picked] = true;
      return picked;
    }

    // 换一批：绝不改动用户选的筛选条件，只在同一条件下随机翻页，
    // 并且挑出这次会话里从没展示过的电影。
    function shuffleFeed() {
      if (feed.loading || feed.online !== true) return;
      feed.token += 1;
      const token = feed.token;
      feed.items = [];
      feed.error = '';
      feed.unavailable = '';
      feed.note = '';
      feed.loading = true;
      grid.innerHTML = '';
      skeleton();
      renderStatus();
      scrollEl.scrollTop = 0;

      const batch = [];
      let pages = 0;
      let limit = 0;

      function pull() {
        if (pages >= 10 || batch.length >= 8) return Promise.resolve();
        pages += 1;
        // 第一次先取第 1 页，拿到当前筛选条件真实的页数；后面才在范围内随机跳页。
        feed.page = limit ? pickFreshPage(limit) : 1;
        return requestPage().then(function (page) {
          if (token !== feed.token) return null;
          const items = (page && Array.isArray(page.items) ? page.items : [])
            .filter(function (item) { return item && item.id; });
          items.forEach(function (item) { feed.known[item.id] = item; });
          if (!limit) {
            limit = Math.max(1, Math.min(MovieSource.MAX_PAGE,
              Number(page && page.totalPages) || 1));
          }
          feed.totalPages = page.totalPages || feed.totalPages;
          feed.hasMore = !!page.hasMore && items.length > 0;
          feed.note = page.note || '';
          // 换一批同样跳过已收藏与任何会话里展示过的片：跨片源共享这份记录。
          const hideSeen = !filters.query.trim();
          const fresh = items.filter(function (item) {
            return !feed.shown[item.id] && !isSaved(item) &&
              !(hideSeen && filmSeen(item));
          });
          fresh.forEach(function (item) {
            feed.shown[item.id] = true;
            rememberFilm(item);
            batch.push(item);
          });
          // 这一页全是看过的就继续翻，直到凑够一批或没有更多页。
          if (fresh.length < 6 && items.length && pages < 8) return pull();
          return null;
        }).catch(function (error) {
          // 页数估计偏大时接口会给 404，换一页继续，不要直接把「换一批」判死。
          if (pages < 12) return pull();
          throw error;
        });
      }

      pull().then(function () {
        if (token !== feed.token) return;
        feed.loading = false;
        feed.items = batch;
        clearSkeleton();
        if (batch.length) {
          grid.innerHTML = batch.map(cardMarkup).join('');
          batch.slice(0, 2).forEach(function (item) {
            setTimeout(function () { MovieSource.preload(item.id); }, 400);
          });
        } else {
          feed.note = '当前筛选条件里能推荐的电影都看过了，换个筛选条件试试。';
        }
        renderStatus();
      }).catch(function (error) {
        if (token !== feed.token) return;
        feed.loading = false;
        clearSkeleton();
        feed.error = '加载失败：' + (error && error.message ? error.message : '网络异常');
        renderStatus();
      });
    }

    function resetFeed(page) {
      feed.token += 1;
      feed.items = [];
      feed.page = Math.max(1, Number(page) || 1);
      feed.hasMore = true;
      feed.wrapped = false;
      feed.loading = false;
      feed.error = '';
      feed.unavailable = '';
      feed.note = '';
      grid.innerHTML = '';
      skeleton();
      renderStatus();
      scrollEl.scrollTop = 0;
      loadMore();
    }

    function refreshEntry() {
      const entry = app.querySelector('[data-movies-open]');
      if (!entry) return;
      const counts = libraryCounts();
      entry.classList.toggle('has-movies', counts.wish + counts.watched > 0);
      entry.title = '找电影 · 想看 ' + counts.wish + ' 部 · 看过 ' + counts.watched + ' 部';
      entry.setAttribute('aria-label', '找电影，想看 ' + counts.wish + ' 部，看过 ' +
        counts.watched + ' 部');
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

    // 悬停/聚焦就预取条目页，点击时 iframe 直接命中缓存。
    let preloadTimer = 0;
    function schedulePreload(target) {
      const open = target && target.closest ? target.closest('[data-open]') : null;
      if (!open) return;
      const id = open.dataset.open;
      clearTimeout(preloadTimer);
      preloadTimer = setTimeout(function () { MovieSource.preload(id); }, 120);
    }
    overlay.addEventListener('pointerover', function (event) { schedulePreload(event.target); });
    overlay.addEventListener('focusin', function (event) { schedulePreload(event.target); });

    overlay.addEventListener('click', function (event) {
      const chip = event.target.closest('.filter-chip');
      if (chip) {
        const type = chip.dataset.genre ? 'genre'
          : chip.dataset.region ? 'region'
          : chip.dataset.decade ? 'decade' : 'rating';
        filters[type] = chip.textContent;
        const row = chip.parentNode;
        Array.prototype.forEach.call(row.children, function (item) {
          const on = item === chip;
          item.classList.toggle('is-active', on);
          item.setAttribute('aria-pressed', String(on));
        });
        if (libraryKind) renderLibraryView();
        else resetFeed();
        return;
      }

      const retry = event.target.closest('[data-retry]');
      if (retry) {
        feed.error = '';
        loadMore();
        return;
      }

      const keyButton = event.target.closest('[data-key]');
      if (keyButton) {
        showKeyPanel(true);
        return;
      }

      const start = event.target.closest('[data-start]');
      if (start) {
        start.disabled = true;
        start.textContent = '正在检测…';
        MovieSource.retry().then(function (available) {
          if (!overlay.isConnected) return;
          feed.online = available;
          if (available) {
            resetFeed(1);
          } else {
            start.disabled = false;
            start.textContent = '仍然连不上，再试一次';
            renderStatus();
          }
        });
        return;
      }

      const lib = event.target.closest('[data-lib]');
      if (lib) {
        if (libraryKind === lib.dataset.lib && !libraryEl.hidden) closeLibrary();
        else openLibrary(lib.dataset.lib);
        return;
      }

      const mark = event.target.closest('[data-mark]');
      if (mark) {
        const id = mark.dataset.id;
        const movie = feed.known[id] || findInCollection('wish', id) ||
          findInCollection('watched', id) || {
            id: id,
            title: mark.dataset.title || '',
            originalTitle: mark.dataset.original || '',
            year: mark.dataset.year || ''
          };
        if (!movie) return;
        const added = toggleCollection(mark.dataset.mark, movie);
        // 万一两个片源的条目身份还没补齐，标记后再合并一次，清单不会出现两份。
        dedupeLibrary();
        markDirty();
        syncMarks();
        renderLibraryButtons();
        if (libraryKind) renderLibraryView();
        refreshEntry();
        if (added) enrichLibraryItem(id);
        if (added) completeMissingImdb(2);
        if (added && !libraryKind && !filters.query.trim()) {
          // 刚标记「想看」/「看过」的电影不再留在推荐流里。
          const card = mark.closest('.movie-card');
          if (card) card.remove();
          feed.items = feed.items.filter(function (item) { return item.id !== id; });
          renderStatus();
        }
        return;
      }

      const remove = event.target.closest('[data-remove]');
      if (remove) {
        const id = remove.dataset.remove;
        if (libraryKind) removeFromCollection(libraryKind, id);
        markDirty();
        renderLibraryButtons();
        renderLibraryView();
        syncMarks();
        refreshEntry();
        return;
      }

      const open = event.target.closest('[data-open]');
      if (open) {
        openDetail(open.dataset.open, open.dataset.title);
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
        if (libraryKind) renderLibraryView();
        else resetFeed();
      }, 200);
    });

    sortSelect.addEventListener('change', function () {
      filters.sort = sortSelect.value;
      if (libraryKind) renderLibraryView();
      else resetFeed();
    });

    shuffleButton.addEventListener('click', function () {
      if (libraryKind) return;
      // 筛选条件永远由用户决定：这里只换电影，不动任何 chip。
      shuffleFeed();
    });

    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);

    // 图片加载失败时不要留一片空白：隐藏破图、露出文字底图，并尝试按片名回查。
    overlay.addEventListener('error', function (event) {
      const img = event.target;
      if (!img || img.tagName !== 'IMG') return;
      img.classList.add('is-broken');
      const poster = img.closest('.movie-poster');
      if (poster) poster.classList.add('is-broken');
      const mark = poster && poster.parentNode.querySelector('[data-mark]');
      const id = mark ? mark.dataset.id : '';
      if (id) posterFailed(id);
    }, true);

    // 顶部两个按钮就是片源开关：点哪个用哪个，选中状态一眼可见。
    Array.prototype.forEach.call(overlay.querySelectorAll('[data-src]'), function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.src === MovieSource.provider()) return;
        switchSource(button.dataset.src);
      });
    });

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
          if (feed.hasMore && !feed.error) loadMore();
        }
      }, { root: scrollEl, rootMargin: '320px 0px' });
      observer.observe(moreButton);
    }

    applySortOptions();
    // 没有 Key 也能直接用（Cinemeta 英文片库），所以这里总是先探测再加载；
    // 只有两个源都失败时才把 Key 面板露出来。
    MovieSource.online().then(function (available) {
      if (!overlay.isConnected) return;
      feed.online = available;
      updateSourceNote();
      if (available) {
        resetFeed(takeStartPage());
        repairLibrary(4);
        upgradeLibraryIdentity(4);
        completeMissingImdb(6);
      } else {
        renderStatus();
        showKeyPanel(true);
      }
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

  function movieRecordLine(item) {
    const title = String(item.title || '').replace(/\s*·\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const bits = [title];
    if (item.year) bits.push(item.year);
    if (item.rating) bits.push(item.rating.toFixed(1));
    // IMDb id 自带 tt 前缀不会认错；TMDB 纯数字 id 加 tmdb= 前缀，
    // 免得 4 位 id（如 2024）回读时被当成上映年份。
    if (item.id) bits.push(/^tt\d{3,}$/.test(item.id) ? item.id : 'tmdb=' + item.id);
    // 两条 id 都要落盘：TMDB 数字 id 与 IMDb id 互相补位，
    // 切到另一个片源后仍能认出同一部片，不会被当成新片再推一遍。
    const tmdbId = filmTmdbOf(item);
    const imdbId = filmIdOf(item);
    if (tmdbId && tmdbId !== item.id) bits.push('tmdb=' + tmdbId);
    if (imdbId && imdbId !== item.id) bits.push('imdb=' + imdbId);
    if (item.added) bits.push(item.added);
    if (item.cover) bits.push(item.cover);
    if (item.genres && item.genres.length) bits.push('类型=' + item.genres.join('/'));
    if (item.regions && item.regions.length) bits.push('地区=' + item.regions.join('/'));
    // 原名与 IMDb id 只在和展示字段不同时写入：它们负责在 TMDB / Cinemeta
    // 两套 id 之间认出同一部片，导回后仍能去重、不再被推荐。
    if (item.originalTitle && filmTitleKey(item.originalTitle) !== filmTitleKey(title)) {
      bits.push('原名=' + item.originalTitle);
    }
    if (item.imdbId && item.imdbId !== item.id) bits.push('imdb=' + item.imdbId);
    return '- ' + bits.join(' · ');
  }

  function buildMarkdown() {
    const parts = [
      '# 人生日历',
      '',
      '> 此文件由「人生日历」生成，可直接导入网站恢复记录。',
      '',
      '- 格式版本：10',
      '- 导出时间：' + nowStamp(),
      '- 主题色：' + state.color,
      ''
    ];

    [
      { kind: 'wish', heading: '想看的电影' },
      { kind: 'watched', heading: '看过的电影' }
    ].forEach(function (entry) {
      const list = collectionList(entry.kind);
      if (!list.length) return;
      parts.push('## ' + entry.heading, '');
      list.forEach(function (item) {
        parts.push(movieRecordLine(item), '');
      });
    });

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
    const previousLibrary = state.library;
    state.library = { wish: [], watched: [] };
    let color = null;
    let year = null;
    let month = null;
    let day = null;
    let target = null;
    let recognized = false;
    let warnings = 0;
    let inHeader = true;
    let movieSection = null;

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
        mNode.days[key] = { mood: '', weather: '', journal: '', highlights: '', next: '', expenses: [] };
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
      // 旧版「今日电影」字段改由解析器迁移进「看过的电影」。
      delete dNode.movies;
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

      match = /^##\s*(想看的电影|看过的电影)\s*$/.exec(line);
      if (match) {
        flush();
        recognized = true;
        year = null;
        month = null;
        day = null;
        movieSection = match[1] === '想看的电影' ? 'wish' : 'watched';
        return;
      }

      match = /^##\s*年度\s*[·・]\s*(\d{4})\s*$/.exec(line);
      if (match) {
        flush();
        recognized = true;
        movieSection = null;
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
            const date = year + '-' + pad2(month) + '-' + pad2(day);
            target = {
              lines: [],
              apply: function (value) { migrateDayMovies(parseMovieLines(value), date); }
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

      if (movieSection) {
        if (/^\s*-/.test(line)) {
          const item = parseMovieLine(line, '');
          if (item) addToCollection(movieSection, item);
        }
        return;
      }

      // 未识别的标题行不结束当前字段：旧文件或手写文件里正文的 # 标题
      // 若被当作结构丢弃，会导致整段记录在导入时静默丢失。
      if (target) target.lines.push(line);
    });

    flush();

    // 导入后立刻合并两个片源的同一部片：旧文件里可能已经存了中英文两份，
    // 合并结果会随下次保存写回 MD。
    dedupeLibrary();
    const library = state.library;
    state.library = previousLibrary;

    if (!recognized) {
      throw new Error('未识别到日历数据：请选择由本站导出的 MD 文件。');
    }

    return { years: years, color: color, warnings: warnings, library: library };
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
      state.library = parsed.library || { wish: [], watched: [] };
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
      setNotice('已导入 ' + file.name + ' · 未连接文件' +
        (supportsFsa ? '，点「选择保存位置」选中该文件即可自动同步' : '，修改需导出') +
        (parsed.warnings ? '，跳过 ' + parsed.warnings + ' 处异常日期' : ''), false);
    }).catch(function (err) {
      setNotice(err && err.message ? err.message : '导入失败，请确认文件格式', true);
    });
  }

  // 拖拽导入：所有浏览器都能用，也是「打开 MD」没响应时的可靠退路。
  function setupDropImport() {
    const hint = document.createElement('div');
    hint.className = 'drop-hint';
    hint.textContent = '松开鼠标，导入 Markdown 文件';
    hint.hidden = true;
    document.body.appendChild(hint);

    function hasFiles(event) {
      const types = event.dataTransfer && event.dataTransfer.types;
      if (!types) return false;
      return Array.prototype.indexOf.call(types, 'Files') !== -1;
    }

    let depth = 0;
    document.addEventListener('dragenter', function (event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      hint.hidden = false;
    });
    document.addEventListener('dragover', function (event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('dragleave', function (event) {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) hint.hidden = true;
    });
    document.addEventListener('drop', function (event) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      hint.hidden = true;
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) importTextFile(file);
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

  /* 远端页面（GitHub Pages）无法访问本机服务，链接会带着 ?movie=1 跳到本机日历，
   * 这里读完 hash 路由后直接把找电影打开，用户不用再点一次。 */
  function openMovieFromQuery() {
    let params;
    try {
      params = new URLSearchParams(location.search);
    } catch (err) {
      return;
    }
    if (params.get('movie') !== '1') return;
    const route = parseRoute();
    try {
      history.replaceState(null, '', location.pathname + location.hash);
    } catch (err) {
      /* file:// 等环境下忽略 */
    }
    if (route.level === 'day') openMovieModal(route.y, route.m, route.d);
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
    clearTimeout(inputNoticeTimer);
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

  setupDropImport();

  // 移动端系统文件选择器常按 MIME 过滤：只写 text/markdown 时 .md 可能灰掉，
  // 表现为「点了没反应」。手机上放开类型，导入时再校验内容。
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    fileInput.accept = '*/*';
  }

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
  openMovieFromQuery();
  restoreStoredHandle();
})();
