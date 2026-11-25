/* 电影片库：站点自带的静态数据（assets/library/movies.json + assets/library/p/*.webp）。
 * 不走任何本地服务：GitHub Pages、file://、本机静态服务器打开都立即可用，无需启动进程。
 * 数据由 tools/build_library.py 从豆瓣抓取生成，覆盖全部类型 / 地区 / 年代。 */
window.MovieSource = (function () {
  'use strict';

  const LIBRARY_URL = 'assets/library/movies.json';
  const PAGE_SIZE = 24;

  let library = null;
  let loading = null;
  let error = '';

  function normalize(movie) {
    return {
      id: String(movie.id || ''),
      title: movie.title || '',
      year: String(movie.year || ''),
      rating: Number(movie.rating) || 0,
      genres: Array.isArray(movie.genres) ? movie.genres : [],
      region: movie.region || '',
      duration: movie.duration || '',
      directors: Array.isArray(movie.directors) ? movie.directors : [],
      casts: Array.isArray(movie.casts) ? movie.casts : [],
      summary: movie.summary || '',
      summaryBy: movie.summaryBy || '',
      poster: movie.poster || '',
      tags: Array.isArray(movie.tags) ? movie.tags : []
    };
  }

  function load() {
    if (library) return Promise.resolve(library);
    if (loading) return loading;
    error = '';
    loading = fetch(LIBRARY_URL, { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        const rows = (data && data.movies) || [];
        library = rows.map(normalize).filter(function (movie) { return movie.id && movie.title; });
        return library;
      })
      .catch(function (err) {
        loading = null;
        error = '片库加载失败：' + (err && err.message ? err.message : '网络异常');
        throw err;
      });
    return loading;
  }

  // 片库只认标签：类型 / 地区 / 年代都是抓取时打在片子上的 tag，聚合值（华语、欧美）也能命中。
  function hasTag(movie, tag) {
    return !!tag && tag !== '全部' && movie.tags.indexOf(tag) >= 0;
  }

  function keywordHit(movie, keyword) {
    if (!keyword) return true;
    const needle = keyword.toLowerCase();
    const fields = [movie.title, movie.year, movie.region, movie.duration,
      movie.genres.join(' '), movie.directors.join(' '), movie.casts.join(' '), movie.tags.join(' ')];
    for (let i = 0; i < fields.length; i += 1) {
      if (String(fields[i] || '').toLowerCase().indexOf(needle) >= 0) return true;
    }
    return false;
  }

  function compare(sort) {
    if (sort === 'T') {
      return function (a, b) {
        return (Number(b.year) || 0) - (Number(a.year) || 0) || b.rating - a.rating;
      };
    }
    return function (a, b) {
      return b.rating - a.rating || (Number(b.year) || 0) - (Number(a.year) || 0);
    };
  }

  function matchRows(rows, cond, keyword) {
    return rows.filter(function (movie) {
      if (cond.genre && cond.genre !== '全部' && !hasTag(movie, cond.genre)) return false;
      if (cond.region && cond.region !== '全部' && !hasTag(movie, cond.region)) return false;
      if (cond.decade && cond.decade !== '全部' && !hasTag(movie, cond.decade)) return false;
      return keywordHit(movie, keyword);
    });
  }

  /* options: { genre, region, decade, sort, query, start } */
  function query(options) {
    const opts = options || {};
    return load().then(function (rows) {
      const keyword = String(opts.query || '').trim();
      const base = { genre: opts.genre, region: opts.region, decade: opts.decade };
      // 静态片库里三维交集可能为空；搜索保持精确，筛选按「年代 → 地区」逐级放宽，
      // 并把放宽的维度返回给界面明确提示，避免出现空白页。
      const attempts = keyword ? [base] : [
        base,
        { genre: base.genre, region: base.region, decade: '全部' },
        { genre: base.genre, region: '全部', decade: '全部' }
      ];
      let hits = [];
      let relaxed = '';
      for (let i = 0; i < attempts.length; i += 1) {
        hits = matchRows(rows, attempts[i], keyword);
        if (hits.length) {
          if (i === 1) relaxed = '年代';
          else if (i === 2) relaxed = '地区';
          break;
        }
      }
      hits.sort(compare(opts.sort));
      const start = Math.max(0, Number(opts.start) || 0);
      const page = hits.slice(start, start + PAGE_SIZE);
      return {
        items: page,
        total: hits.length,
        relaxed: relaxed,
        hasMore: start + page.length < hits.length
      };
    });
  }

  function discover(options) {
    return query(options);
  }

  function find(id) {
    return load().then(function (rows) {
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].id === id) return rows[i];
      }
      return null;
    });
  }

  // 海报存在仓库里，直接给相对路径；没有海报的片子由 UI 用片名兜底。
  function poster(movie) {
    if (!movie) return '';
    if (movie.poster) {
      return movie.poster.indexOf('/') >= 0 ? movie.poster : 'assets/library/p/' + movie.poster;
    }
    return '';
  }

  // 打开日页面时预热一次片库，点胶片按钮时列表已经在内存里。
  let warmed = false;
  function warm() {
    if (warmed) return Promise.resolve(true);
    warmed = true;
    return load().then(function () { return true; }).catch(function () {
      warmed = false;
      return false;
    });
  }

  function lastError() {
    return error;
  }

  return {
    load: load,
    warm: warm,
    discover: discover,
    find: find,
    poster: poster,
    lastError: lastError
  };
})();
