/* 电影片库客户端：双源。
 *
 * 1) TMDB（填了 API Key 时）——中文片名 / 简介 / 评分，discover 可翻 500 页，
 *    默认 50 次/秒。api.tmdb.org 在国内可直连并返回 CORS 头。
 * 2) Cinemeta（没填 Key 时）——Stremio 的公开元数据服务，覆盖 IMDb 全量影片，
 *    免 Key、无注册、翻到第几千条仍正常，海报走 images.metahub.space。
 *    代价是片名/简介为英文。
 *
 * 为什么不用豆瓣：豆瓣的匿名接口对本机 IP 连续请求后会一律 302 跳登录页，
 * 点两下「换一批」就再也拿不到数据，也没有可用的替代接口。
 *
 * Key 只在用户自己的浏览器里保存（localStorage），不写进 MD，也不经过第三方中转。
 */
window.MovieSource = (function () {
  'use strict';

  const API = 'https://api.tmdb.org/3/';
  const IMAGE = 'https://image.tmdb.org/t/p/';
  const SITE = 'https://www.themoviedb.org/movie/';
  const CINEMETA = 'https://v3-cinemeta.strem.io/';
  const IMDB = 'https://www.imdb.com/title/';
  const KEY_STORE = 'life.movie.tmdbKey';
  const SOURCE_STORE = 'life.movie.source';
  const MEMO_TTL = 5 * 60 * 1000;
  const MAX_PAGE = 500;
  const CINE_PAGE = 50;
  const CINE_MAX_PAGE = 200;

  // 中文类型 → TMDB genre id / Cinemeta 的英文类型名。
  const GENRES = [
    { id: 28, label: '动作', en: 'Action' },
    { id: 12, label: '冒险', en: 'Adventure' },
    { id: 16, label: '动画', en: 'Animation' },
    { id: 35, label: '喜剧', en: 'Comedy' },
    { id: 80, label: '犯罪', en: 'Crime' },
    { id: 99, label: '纪录', en: 'Documentary' },
    { id: 18, label: '剧情', en: 'Drama' },
    { id: 10751, label: '家庭', en: 'Family' },
    { id: 14, label: '奇幻', en: 'Fantasy' },
    { id: 36, label: '历史', en: 'History' },
    { id: 27, label: '恐怖', en: 'Horror' },
    { id: 10402, label: '音乐', en: 'Music' },
    { id: 9648, label: '悬疑', en: 'Mystery' },
    { id: 10749, label: '爱情', en: 'Romance' },
    { id: 878, label: '科幻', en: 'Sci-Fi' },
    { id: 53, label: '惊悚', en: 'Thriller' },
    { id: 10752, label: '战争', en: 'War' },
    { id: 37, label: '西部', en: 'Western' }
  ];
  const GENRE_NAME = {};
  const GENRE_EN = {};
  const EN_ZH = {
    biography: '传记', sport: '运动', musical: '歌舞', 'film-noir': '黑色电影',
    short: '短片', 'talk-show': '脱口秀', 'reality-tv': '真人秀', game: '游戏', adult: '情色'
  };
  GENRES.forEach(function (item) {
    GENRE_NAME[item.id] = item.label;
    GENRE_EN[item.label] = item.en;
    EN_ZH[item.en.toLowerCase()] = item.label;
  });
  // Cinemeta 的 country 是英文全名，这里按中文筛选项做集合匹配。
  const REGION_EN = {
    '中国大陆': ['china'],
    '中国香港': ['hong kong'],
    '中国台湾': ['taiwan'],
    '美国': ['united states', 'united states of america', 'usa'],
    '日本': ['japan'],
    '韩国': ['south korea', 'korea'],
    '英国': ['united kingdom', 'uk', 'england'],
    '法国': ['france'],
    '德国': ['germany'],
    '意大利': ['italy'],
    '西班牙': ['spain'],
    '印度': ['india'],
    '泰国': ['thailand'],
    '俄罗斯': ['russia', 'soviet union'],
    '加拿大': ['canada'],
    '澳大利亚': ['australia'],
    '华语': ['china', 'hong kong', 'taiwan'],
    '欧美': ['united states', 'united states of america', 'usa', 'united kingdom', 'uk',
      'france', 'germany', 'italy', 'spain', 'canada', 'australia', 'ireland', 'sweden',
      'denmark', 'netherlands', 'russia']
  };
  // TMDB 的 with_origin_country 只认两位代码。
  const REGION_CODE = {
    '中国大陆': 'CN', '中国香港': 'HK', '中国台湾': 'TW', '美国': 'US', '日本': 'JP',
    '韩国': 'KR', '英国': 'GB', '法国': 'FR', '德国': 'DE', '意大利': 'IT', '西班牙': 'ES',
    '印度': 'IN', '泰国': 'TH', '俄罗斯': 'RU', '加拿大': 'CA', '澳大利亚': 'AU',
    '华语': 'CN|HK|TW', '欧美': 'US|GB|FR|DE|IT|ES|CA|AU|IE|SE|DK'
  };
  const CINE_SORT = {
    'popularity.desc': 'top',
    'vote_average.desc': 'imdbRating',
    'vote_count.desc': 'top',
    'primary_release_date.desc': 'year'
  };

  let key = readKey();
  let preferred = readSource();
  let probing = null;
  let healthy = null;
  let lastError = '';
  let provider = preferred === 'cinemeta' || (preferred !== 'tmdb' && !key)
    ? 'cinemeta'
    : 'tmdb';

  function readKey() {
    try {
      return String(localStorage.getItem(KEY_STORE) || '').trim();
    } catch (error) {
      return '';
    }
  }

  function readSource() {
    try {
      const value = String(localStorage.getItem(SOURCE_STORE) || '').trim();
      return value === 'tmdb' || value === 'cinemeta' ? value : '';
    } catch (error) {
      return '';
    }
  }

  function saveSource(value) {
    preferred = value === 'tmdb' || value === 'cinemeta' ? value : '';
    try {
      if (preferred) localStorage.setItem(SOURCE_STORE, preferred);
      else localStorage.removeItem(SOURCE_STORE);
    } catch (error) {
      /* 隐私模式下写不进去，当前会话仍然有效 */
    }
  }

  function resetCaches() {
    probing = null;
    healthy = null;
    lastError = '';
    memo.clear();
    Object.keys(preloaded).forEach(function (id) { delete preloaded[id]; });
  }

  function setKey(value) {
    key = String(value || '').trim();
    try {
      if (key) localStorage.setItem(KEY_STORE, key);
      else localStorage.removeItem(KEY_STORE);
    } catch (error) {
      /* 隐私模式下写不进去，当前会话仍然可用 */
    }
    provider = key ? 'tmdb' : 'cinemeta';
    saveSource(provider);
    resetCaches();
    return key;
  }

  // 用户在界面上直接选片源：TMDB 需要 Key，没有 Key 时保持原片源不动。
  function setProvider(name) {
    if (name === 'tmdb' && !key) return false;
    provider = name === 'tmdb' ? 'tmdb' : 'cinemeta';
    saveSource(provider);
    resetCaches();
    return true;
  }

  function hasKey() {
    return !!key;
  }

  function state() {
    return {
      provider: provider,
      source: provider === 'tmdb' ? 'TMDB 中文库' : '英文片库（免 Key）',
      hasKey: !!key,
      keyTail: key ? key.slice(-4) : '',
      healthy: healthy,
      error: lastError
    };
  }

  function isImdb(id) {
    return /^tt\d{3,}$/.test(String(id || ''));
  }

  function providerOf(id) {
    // 片源归属由 id 形态决定，不随「当前选中的片源」漂移：IMDb id 永远走 Cinemeta，
    // 纯数字 id 永远是 TMDB 的条目。否则切到 Cinemeta 后打开 TMDB 收藏会去请求
    // cinemeta/meta/movie/123.json 这种不存在的条目。
    if (isImdb(id)) return 'cinemeta';
    if (/^\d{1,9}$/.test(String(id || ''))) return 'tmdb';
    return key ? 'tmdb' : 'cinemeta';
  }

  /* ---------------- TMDB ---------------- */

  function tmdbUrl(path, params) {
    const query = new URLSearchParams({ language: 'zh-CN' });
    Object.keys(params || {}).forEach(function (name) {
      const value = params[name];
      if (value === undefined || value === null || value === '') return;
      query.set(name, String(value));
    });
    return API + path + '?' + query.toString() + '&api_key=' + encodeURIComponent(key);
  }

  function parseError(status, payload) {
    if (status === 401) return 'API Key 无效，请重新填写';
    if (status === 429) return 'TMDB 请求过于频繁，稍等一秒再试';
    if (payload && payload.status_message) return 'TMDB 返回：' + payload.status_message;
    return 'TMDB 返回 HTTP ' + status;
  }

  function request(url) {
    return fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (payload) {
        if (!response.ok) {
          healthy = false;
          lastError = parseError(response.status, payload);
          throw new Error(lastError);
        }
        healthy = true;
        lastError = '';
        return payload;
      });
    }).catch(function (error) {
      if (!healthy) lastError = error.message || '网络异常';
      throw error;
    });
  }

  function tmdbImage(path, size) {
    if (!path) return '';
    if (/^https?:\/\//.test(path)) return path;
    return IMAGE + (size || 'w342') + path;
  }

  function yearOf(date) {
    return typeof date === 'string' && /^\d{4}/.test(date) ? date.slice(0, 4) : '';
  }

  function rate(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : 0;
  }

  function genreLabels(ids, names) {
    if (Array.isArray(names) && names.length) {
      return names.map(function (item) {
        return typeof item === 'string' ? item : item && item.name;
      }).filter(Boolean).slice(0, 4);
    }
    return (Array.isArray(ids) ? ids : [])
      .map(function (id) { return GENRE_NAME[id] || ''; })
      .filter(Boolean)
      .slice(0, 4);
  }

  function normalizeTmdb(raw) {
    if (!raw || !raw.id) return null;
    return {
      id: String(raw.id),
      title: raw.title || raw.name || raw.original_title || '',
      // 原名（多数是英文）用来跨片源认人：TMDB 中文名和 Cinemeta 英文名对不上，
      // 但 original_title / name 指向同一部片。
      originalTitle: raw.original_title || raw.title || raw.name || '',
      year: yearOf(raw.release_date),
      rating: rate(raw.vote_average),
      votes: Number(raw.vote_count) || 0,
      cover: tmdbImage(raw.poster_path),
      genres: genreLabels(raw.genre_ids, raw.genres),
      overview: typeof raw.overview === 'string' ? raw.overview.trim() : ''
    };
  }

  function tmdbSortParams(sort) {
    if (sort === 'vote_average.desc') return { sort_by: 'vote_average.desc', 'vote_count.gte': 200 };
    if (sort === 'vote_count.desc') return { sort_by: 'vote_count.desc' };
    if (sort === 'primary_release_date.desc') {
      return { sort_by: 'primary_release_date.desc', 'vote_count.gte': 20 };
    }
    return { sort_by: 'popularity.desc', 'vote_count.gte': 30 };
  }

  function clampPage(page, max) {
    const number = Math.floor(Number(page) || 1);
    return Math.min(max || MAX_PAGE, Math.max(1, number));
  }

  function tmdbDiscover(opts) {
    const page = clampPage(opts.page);
    const params = tmdbSortParams(opts.sort);
    params.page = page;
    params.include_adult = 'false';
    const genreId = (GENRES.filter(function (g) { return g.label === opts.genre; })[0] || {}).id;
    if (genreId) params.with_genres = genreId;
    if (opts.minRating) params['vote_average.gte'] = opts.minRating;
    if (REGION_CODE[opts.country]) params.with_origin_country = REGION_CODE[opts.country];
    if (opts.from) params['primary_release_date.gte'] = opts.from + '-01-01';
    if (opts.to) params['primary_release_date.lte'] = opts.to + '-12-31';
    if (opts.sort === 'primary_release_date.desc') {
      params['primary_release_date.lte'] = '2105-12-31';
    }
    return request(tmdbUrl('discover/movie', params)).then(function (payload) {
      const items = (payload && Array.isArray(payload.results) ? payload.results : [])
        .map(normalizeTmdb)
        .filter(function (item) { return item && item.title; });
      const totalPages = Math.min(MAX_PAGE, Number(payload && payload.total_pages) || 0);
      return {
        provider: 'tmdb',
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: totalPages ? page < totalPages : false
      };
    });
  }

  function tmdbSearch(opts) {
    const page = clampPage(opts.page);
    const keyword = String(opts.q || '').trim();
    if (!keyword) return tmdbDiscover(opts);
    return request(tmdbUrl('search/movie', {
      query: keyword, page: page, include_adult: 'false'
    })).then(function (payload) {
      const totalPages = Math.min(MAX_PAGE, Number(payload && payload.total_pages) || 0);
      const items = (payload && Array.isArray(payload.results) ? payload.results : [])
        .map(normalizeTmdb)
        .filter(function (item) {
          if (!item || !item.title) return false;
          if (opts.genre && item.genres.length && item.genres.indexOf(opts.genre) < 0) return false;
          // search/movie 没有评分门槛参数，只能拿回结果后自己筛；无评分的条目不算达标。
          if (opts.minRating && !(item.rating >= opts.minRating)) return false;
          if (opts.from && item.year && Number(item.year) < opts.from) return false;
          if (opts.to && item.year && Number(item.year) > opts.to) return false;
          return true;
        });
      return {
        provider: 'tmdb',
        items: items,
        page: page,
        totalPages: totalPages,
        hasMore: totalPages ? page < totalPages : false
      };
    });
  }

  function tmdbDetail(id) {
    return request(tmdbUrl('movie/' + encodeURIComponent(id), {
      append_to_response: 'credits'
    })).then(function (raw) {
      const credits = raw && raw.credits ? raw.credits : {};
      const crew = Array.isArray(credits.crew) ? credits.crew : [];
      const cast = Array.isArray(credits.cast) ? credits.cast : [];
      const countries = Array.isArray(raw.production_countries)
        ? raw.production_countries.map(function (item) { return item.name; }).filter(Boolean)
        : [];
      return {
        provider: 'tmdb',
        id: String(raw.id),
        title: raw.title || raw.original_title || '',
        originalTitle: raw.original_title || '',
        year: yearOf(raw.release_date),
        rating: rate(raw.vote_average),
        votes: Number(raw.vote_count) || 0,
        cover: tmdbImage(raw.poster_path, 'w500'),
        backdrop: tmdbImage(raw.backdrop_path, 'w780'),
        overview: typeof raw.overview === 'string' ? raw.overview.trim() : '',
        runtime: Number(raw.runtime) || 0,
        genres: genreLabels(raw.genre_ids, raw.genres),
        region: countries.slice(0, 3).join(' / '),
        directors: crew.filter(function (item) { return item.job === 'Director'; })
          .map(function (item) { return item.name; }).slice(0, 3),
        cast: cast.slice(0, 6).map(function (item) { return item.name; }),
        imdbId: raw.imdb_id || '',
        external: SITE + encodeURIComponent(raw.id)
      };
    });
  }

  /* ---------------- Cinemeta（免 Key） ---------------- */

  function cineUrl(catalog, opts) {
    // Cinemeta 的额外参数是同一个路径段里的 & 连接（genre=Drama&skip=100）。
    // 拆成两个 / 段时它只认第一个，skip 会被丢掉，翻页/换一批就会一直拿到第 1 页。
    const extra = [];
    if (opts.genre) extra.push('genre=' + encodeURIComponent(opts.genre));
    if (opts.search) extra.push('search=' + encodeURIComponent(opts.search));
    if (opts.skip) extra.push('skip=' + opts.skip);
    const parts = ['catalog', 'movie', catalog];
    if (extra.length) parts.push(extra.join('&'));
    return CINEMETA + parts.join('/') + '.json';
  }

  function cineRequest(url) {
    return fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    }).then(function (response) {
      if (!response.ok) {
        healthy = false;
        lastError = '片库返回 HTTP ' + response.status;
        throw new Error(lastError);
      }
      healthy = true;
      lastError = '';
      return response.json();
    }).catch(function (error) {
      if (!healthy) lastError = error.message || '网络异常';
      throw error;
    });
  }

  function cineGenres(list) {
    return (Array.isArray(list) ? list : [])
      .map(function (name) { return EN_ZH[String(name).toLowerCase()] || String(name); })
      .filter(Boolean)
      .slice(0, 4);
  }

  function cineYear(raw) {
    if (raw.releaseInfo) {
      const match = String(raw.releaseInfo).match(/\d{4}/);
      if (match) return match[0];
    }
    return yearOf(raw.released);
  }

  function normalizeCine(raw) {
    if (!raw) return null;
    const id = raw.imdb_id || raw.id;
    if (!id) return null;
    return {
      id: String(id),
      title: raw.name || '',
      originalTitle: raw.name || '',
      year: cineYear(raw),
      rating: rate(raw.imdbRating),
      votes: 0,
      cover: raw.poster || '',
      genres: cineGenres(raw.genre || raw.genres),
      overview: typeof raw.description === 'string' ? raw.description.trim() : '',
      countries: String(raw.country || '').toLowerCase()
    };
  }

  function countryMatches(item, filter) {
    if (!filter) return true;
    const wanted = REGION_EN[filter];
    if (!wanted) return true;
    const text = item.countries || '';
    if (!text) return true; // 没有地区资料时不要误杀
    return wanted.some(function (name) { return text.indexOf(name) >= 0; });
  }

  function yearMatches(item, opts) {
    const year = Number(item.year) || 0;
    if (opts.from && year && year < opts.from) return false;
    if (opts.to && year && year > opts.to) return false;
    return true;
  }

  // Cinemeta 目录也不支持评分参数，列表拿回后按条目自带评分过滤。
  function ratingMatches(item, opts) {
    if (!opts.minRating) return true;
    return (Number(item.rating) || 0) >= opts.minRating;
  }

  function cineDiscover(opts) {
    const page = clampPage(opts.page, CINE_MAX_PAGE);
    return cineFetch(page, opts, 3);
  }

  // Cinemeta 没有服务端筛选年代/地区，只能按页取回后再过滤；整页被滤空就继续往下取。
  function cineFetch(page, opts, tries) {
    const catalog = CINE_SORT[opts.sort] || 'top';
    const url = cineUrl(catalog, {
      genre: opts.genre ? GENRE_EN[opts.genre] : '',
      search: opts.q || '',
      skip: (page - 1) * CINE_PAGE
    });
    return cineRequest(url).then(function (payload) {
      const raw = payload && Array.isArray(payload.metas) ? payload.metas : [];
      const items = raw.map(normalizeCine).filter(Boolean);
      const visible = items.filter(function (item) {
        return yearMatches(item, opts) && countryMatches(item, opts.country) &&
          ratingMatches(item, opts);
      });
      const hasMore = raw.length > 0 && page < CINE_MAX_PAGE;
      if (!visible.length && hasMore && tries > 1) {
        return cineFetch(page + 1, opts, tries - 1);
      }
      return {
        provider: 'cinemeta',
        items: visible.length ? visible : items,
        page: page,
        totalPages: CINE_MAX_PAGE,
        hasMore: hasMore
      };
    }).catch(function (error) {
      // 片库实际深度比页数上限浅，翻过头会 404：当成「没有更多」处理，别让整批加载失败。
      if (error && /HTTP 404/.test(error.message)) {
        return {
          provider: 'cinemeta',
          items: [],
          page: page,
          totalPages: CINE_MAX_PAGE,
          hasMore: false
        };
      }
      throw error;
    });
  }

  function cineDetail(id) {
    return cineRequest(CINEMETA + 'meta/movie/' + encodeURIComponent(id) + '.json')
      .then(function (payload) {
        const raw = payload && payload.meta;
        if (!raw) throw new Error('这部片没有资料');
        const minutes = parseInt(String(raw.runtime || '').replace(/[^\d]/g, ''), 10) || 0;
        return {
          provider: 'cinemeta',
          id: String(raw.imdb_id || raw.id || id),
          title: raw.name || '',
          originalTitle: raw.name || '',
          year: cineYear(raw),
          rating: rate(raw.imdbRating),
          votes: Number(String(raw.imdbVotes || '').replace(/[^\d]/g, '')) || 0,
          cover: raw.poster || '',
          backdrop: raw.background || '',
          overview: typeof raw.description === 'string' ? raw.description.trim() : '',
          runtime: minutes,
          genres: cineGenres(raw.genre || raw.genres),
          region: String(raw.country || ''),
          directors: Array.isArray(raw.director) ? raw.director.slice(0, 3) : [],
          cast: Array.isArray(raw.cast) ? raw.cast.slice(0, 6) : [],
          imdbId: String(raw.imdb_id || ''),
          external: IMDB + encodeURIComponent(raw.imdb_id || id) + '/'
        };
      });
  }

  /* ---------------- 按片名回查（修复旧收藏） ---------------- */

  // 旧版豆瓣收藏存的是豆瓣 id 与 doubanio 海报（外站引用会被 403），
  // 这两样东西现在的片源都用不了。按片名 + 年份回查一次，换成当前片源可用的条目。
  function pickMatch(items, title, year) {
    const wanted = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const scored = (items || []).filter(function (item) {
      return item && item.id && item.title;
    }).map(function (item) {
      const name = item.title.toLowerCase();
      let score = 0;
      if (name === wanted) score += 6;
      else if (name.indexOf(wanted) >= 0 || wanted.indexOf(name) >= 0) score += 3;
      if (year && item.year === year) score += 5;
      else if (year && item.year && Math.abs(Number(item.year) - Number(year)) <= 1) score += 2;
      return { item: item, score: score };
    }).sort(function (a, b) { return b.score - a.score; });
    return scored.length && scored[0].score > 0 ? scored[0].item : null;
  }

  function lookup(title, year) {
    const name = String(title || '').trim();
    if (!name) return Promise.resolve(null);
    const wantYear = /^\d{4}$/.test(String(year || '')) ? String(year) : '';
    if (key) {
      const params = { query: name, page: 1, include_adult: 'false' };
      if (wantYear) params.year = wantYear;
      return request(tmdbUrl('search/movie', params)).then(function (payload) {
        const items = (payload && Array.isArray(payload.results) ? payload.results : [])
          .map(normalizeTmdb).filter(Boolean);
        return pickMatch(items, name, wantYear);
      }).catch(function () {
        return cineLookup(name, wantYear);
      });
    }
    return cineLookup(name, wantYear);
  }

  function cineLookup(name, wantYear) {
    return cineRequest(cineUrl('top', { search: name })).then(function (payload) {
      const items = (payload && Array.isArray(payload.metas) ? payload.metas : [])
        .map(normalizeCine).filter(Boolean);
      return pickMatch(items, name, wantYear);
    });
  }

  // 不管当前选的是哪个片源、有没有 TMDB Key，都按英文片名去 Cinemeta 查一次。
  // 中文条目靠它补回 IMDb id，才能和英文片库里的同一部片合并。
  function cinemetaLookup(name, year) {
    const title = String(name || '').trim();
    if (!title) return Promise.resolve(null);
    const wantYear = /^\d{4}$/.test(String(year || '')) ? String(year) : '';
    return cineLookup(title, wantYear);
  }

  /* ---------------- 统一入口 ---------------- */

  const memo = new Map();

  function memoJSON(cacheKey, run) {
    const hit = memo.get(cacheKey);
    if (hit && Date.now() - hit.at < MEMO_TTL) return hit.promise;
    const promise = run();
    memo.set(cacheKey, { at: Date.now(), promise: promise });
    promise.catch(function () { memo.delete(cacheKey); });
    return promise;
  }

  function discover(options) {
    const opts = options || {};
    const cacheKey = [provider, 'discover', opts.genre, opts.country, opts.from, opts.to,
      opts.minRating, opts.sort, opts.page].join('|');
    return memoJSON(cacheKey, function () {
      return provider === 'tmdb' ? tmdbDiscover(opts) : cineDiscover(opts);
    });
  }

  function search(options) {
    const opts = options || {};
    const keyword = String(opts.q || '').trim();
    if (!keyword) return discover(opts);
    const cacheKey = [provider, 'search', keyword, opts.genre, opts.country, opts.from,
      opts.to, opts.minRating, opts.page].join('|');
    return memoJSON(cacheKey, function () {
      if (provider === 'tmdb') return tmdbSearch(opts);
      return cineFetch(clampPage(opts.page, CINE_MAX_PAGE), opts, 3);
    });
  }

  function detail(id) {
    if (!id) return Promise.reject(new Error('缺少电影 id'));
    const target = providerOf(id);
    // TMDB 条目必须有 Key 才能读；没有 Key 时给出可操作的提示，而不是发一个空 Key 的 401。
    if (target === 'tmdb' && !key) {
      return Promise.reject(new Error('这条影片属于 TMDB 片库，需要先填一个 TMDB API Key 才能打开'));
    }
    return memoJSON('detail|' + target + '|' + id, function () {
      if (target === 'tmdb') return tmdbDetail(id);
      return cineDetail(id);
    });
  }

  // 用 IMDb id 反查 TMDB 数字 id：两个片源要认出同一部片，
  // 收藏里存的 IMDb id 必须能映射到 TMDB 条目，否则切到 TMDB 就丢了状态。
  function findByImdb(imdbId) {
    const imdb = String(imdbId || '').trim();
    if (!/^tt\d{3,}$/.test(imdb) || !key) return Promise.resolve(null);
    return memoJSON('find|' + imdb, function () {
      return request(tmdbUrl('find/' + encodeURIComponent(imdb), {
        external_source: 'imdb_id'
      })).then(function (payload) {
        const list = payload && Array.isArray(payload.movie_results)
          ? payload.movie_results
          : [];
        const hit = list[0];
        if (!hit || !hit.id) return null;
        return {
          id: String(hit.id),
          title: hit.title || hit.original_title || '',
          originalTitle: hit.original_title || '',
          year: yearOf(hit.release_date)
        };
      });
    });
  }

  function fallbackToCinemeta(reason) {
    return cineRequest(cineUrl('top', {})).then(function () {
      provider = 'cinemeta';
      healthy = true;
      lastError = reason;
      memo.clear();
      return true;
    }).catch(function () {
      healthy = false;
      return false;
    });
  }

  function online() {
    if (probing) return probing;
    if (provider === 'tmdb' && key) {
      probing = request(tmdbUrl('configuration', {})).then(function () {
        return true;
      }).catch(function (error) {
        // Key 失效时不要变成死路：自动退回免 Key 的英文全量片库。
        return fallbackToCinemeta(error && error.message ? error.message : 'TMDB 连接失败');
      });
      return probing;
    }
    probing = cineRequest(cineUrl('top', {})).then(function () {
      provider = 'cinemeta';
      lastError = '';
      return true;
    }).catch(function (error) {
      // 免 Key 源也连不上时，试试已保存的 Key（如果用户填过）。
      lastError = error && error.message ? error.message : '网络异常';
      if (!key) return false;
      provider = 'tmdb';
      return request(tmdbUrl('configuration', {})).then(function () {
        lastError = 'Cinemeta 连接失败，已回退 TMDB 中文库';
        return true;
      }).catch(function () {
        return false;
      });
    });
    return probing;
  }

  function retry() {
    probing = null;
    healthy = null;
    memo.clear();
    return online();
  }

  // 当前片源能翻到的最大页码。两个片源都是接口硬上限：TMDB 500 页 × 20 条，
  // Cinemeta 200 页 × 50 条，已经无法再往深处翻。
  function maxPage() {
    return provider === 'cinemeta' ? CINE_MAX_PAGE : MAX_PAGE;
  }

  // 首屏取页：先探第 1 页拿到片库真实页数，再在 1..totalPages 里随机。
  // 范围取满整个片库而不是前若干页的热门池 —— 深页里评分不高但值得一看的冷门片
  // 也有机会被推到首屏，觉得太冷门时用评分筛选收窄即可。
  function startPage() {
    return online().then(function (ok) {
      if (!ok) return { ok: false, totalPages: 0 };
      return discover({ page: 1, sort: 'popularity.desc' }).then(function (first) {
        const cap = maxPage();
        const total = Math.max(1, Math.min(cap, Number(first && first.totalPages) || cap));
        return { ok: true, totalPages: total };
      }).catch(function () {
        return { ok: false, totalPages: 0 };
      });
    });
  }

  // 预热一页：首屏会随机跳到某一页，预热的也必须是同一页才有意义，
  // 所以由调用方把页号传进来（缺省第 1 页）。
  function warm(page) {
    return online().then(function (ok) {
      if (!ok) return false;
      return discover({ page: clampPage(page || 1), sort: 'popularity.desc' })
        .then(function () { return true; })
        .catch(function () { return false; });
    });
  }

  const preloaded = {};
  function preload(id) {
    if (!id || preloaded[id]) return;
    preloaded[id] = true;
    detail(id).catch(function () { delete preloaded[id]; });
  }

  function pageUrl(id) {
    if (!id) return 'https://www.themoviedb.org/';
    if (isImdb(id)) return IMDB + encodeURIComponent(id) + '/';
    return SITE + encodeURIComponent(id);
  }

  function doubanSearchUrl(title) {
    return 'https://search.douban.com/movie/subject_search?search_text=' +
      encodeURIComponent(String(title || '').trim());
  }

  return {
    GENRES: GENRES,
    MAX_PAGE: MAX_PAGE,
    maxPage: maxPage,
    startPage: startPage,
    online: online,
    retry: retry,
    warm: warm,
    discover: discover,
    search: search,
    detail: detail,
    lookup: lookup,
    findByImdb: findByImdb,
    cinemetaLookup: cinemetaLookup,
    poster: function (value) { return value && /^https?:\/\//.test(value) ? value : tmdbImage(value, 'w342'); },
    pageUrl: pageUrl,
    doubanSearchUrl: doubanSearchUrl,
    preload: preload,
    setKey: setKey,
    setProvider: setProvider,
    hasKey: hasKey,
    state: state,
    provider: function () { return provider; }
  };
})();
