/*! github-sync.js —— 私有仓库同步（网页版 PAT）
 *
 * 只做「配置 / 探测 / 拉取 / 推送」四件事，不碰 DOM：
 *   LifeGithubSync.load()                    -> Promise<config|null>
 *   LifeGithubSync.save(cfg)                 -> Promise<config>
 *   LifeGithubSync.clear()                   -> Promise
 *   LifeGithubSync.normalize(cfg)            -> config
 *   LifeGithubSync.probe(cfg)                -> {ok, sha, size, exists, private, branch}
 *   LifeGithubSync.pull(cfg)                 -> {ok, text, sha, size}
 *   LifeGithubSync.push(cfg, text, sha)      -> {ok, sha} | {conflict, remote...}
 *   LifeGithubSync.digest(text)              -> 正文摘要（剔除导出时间戳）
 *   LifeGithubSync.describe(result)          -> 中文错误文案
 *
 * token 只存在本机浏览器的 IndexedDB 里，绝不写进 md 文件，也不进 URL。
 * 请求只用 api.github.com（有 CORS），不经过任何第三方中转。
 */
(function () {
  'use strict';

  if (window.LifeGithubSync) return;

  var API = 'https://api.github.com';
  var DB_NAME = 'life-calendar-sync';
  var DB_VERSION = 1;
  var STORE = 'settings';
  var KEY = 'github';
  var META_KEY = 'github-meta';
  var DEFAULT_PATH = '人生日历.md';
  var TIMEOUT = 25000;

  function normalize(input) {
    var cfg = input || {};
    var owner = String(cfg.owner || '').trim().replace(/^@/, '');
    var repo = String(cfg.repo || '').trim();
    var token = String(cfg.token || '').trim();
    var branch = String(cfg.branch || '').trim() || 'main';
    var path = String(cfg.path || '').trim().replace(/^\/+/, '') || DEFAULT_PATH;

    // 允许直接粘贴 https://github.com/owner/repo 或 owner/repo。
    var combined = owner && repo ? owner + '/' + repo : owner || repo;
    var match = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(combined) ||
      /^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(combined);
    if (match) {
      owner = match[1];
      repo = match[2];
    }
    return {
      token: token,
      owner: owner,
      repo: repo,
      branch: branch,
      path: path
    };
  }

  function validConfig(cfg) {
    return !!(cfg && cfg.token && cfg.owner && cfg.repo);
  }

  /* ---------------- 本机存储（独立 IndexedDB，避免和文件句柄库互相升级） ---------------- */

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE);
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  async function load() {
    try {
      var db = await openDb();
      var value = await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var request = tx.objectStore(STORE).get(KEY);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
      db.close();
      if (!value) return null;
      var cfg = normalize(value);
      return validConfig(cfg) ? cfg : null;
    } catch (err) {
      return null;
    }
  }

  async function save(input) {
    var cfg = normalize(input);
    var db = await openDb();
    await new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        token: cfg.token,
        owner: cfg.owner,
        repo: cfg.repo,
        branch: cfg.branch,
        path: cfg.path,
        savedAt: Date.now()
      }, KEY);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
    db.close();
    return cfg;
  }

  async function clear() {
    try {
      var db = await openDb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.objectStore(STORE).delete(META_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
      db.close();
    } catch (err) {
      /* 清不掉也不影响本次会话断开 */
    }
  }

  // sha 与「上次同步的正文摘要」必须跨刷新保存：
  // 否则每次重开页面都会把「本地没改、云端没改」误判成冲突。
  async function saveMeta(input) {
    var meta = input || {};
    try {
      var db = await openDb();
      await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({
          sha: meta.sha || null,
          digest: String(meta.digest || ''),
          at: Date.now()
        }, META_KEY);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
      db.close();
    } catch (err) {
      /* 元数据写失败只会多一次比对，不影响正文同步 */
    }
  }

  async function loadMeta() {
    try {
      var db = await openDb();
      var value = await new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var request = tx.objectStore(STORE).get(META_KEY);
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
      });
      db.close();
      if (!value) return null;
      return {
        sha: value.sha || null,
        digest: String(value.digest || ''),
        at: value.at || 0
      };
    } catch (err) {
      return null;
    }
  }

  /* ---------------- 网络 ---------------- */

  function headers(token, accept) {
    return {
      'Accept': accept || 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function encodePath(path) {
    return String(path).split('/').map(encodeURIComponent).join('/');
  }

  function repoPath(cfg) {
    return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  }

  function filePath(cfg) {
    return repoPath(cfg) + '/contents/' + encodePath(cfg.path);
  }

  async function api(cfg, path, init) {
    var opts = init || {};
    var controller = null;
    var timer = 0;
    var requestInit = {
      method: opts.method || 'GET',
      headers: headers(cfg.token, opts.accept),
      cache: 'no-store'
    };
    if (opts.body !== undefined) {
      requestInit.headers['Content-Type'] = 'application/json';
      requestInit.body = JSON.stringify(opts.body);
    }
    if (typeof AbortController === 'function') {
      controller = new AbortController();
      requestInit.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, TIMEOUT);
    }

    var response;
    try {
      response = await fetch(API + path, requestInit);
    } catch (err) {
      return {
        ok: false,
        offline: true,
        error: (err && err.name === 'AbortError')
          ? '连接 GitHub 超时'
          : '网络不可用，无法连接 GitHub'
      };
    } finally {
      if (timer) clearTimeout(timer);
    }

    var data = null;
    var text = '';
    try {
      if (opts.raw) {
        text = await response.text();
      } else {
        data = await response.json();
      }
    } catch (err) {
      data = null;
    }

    if (response.ok) {
      return { ok: true, status: response.status, data: data, text: text, headers: response.headers };
    }

    var message = (data && data.message) || '';
    var result = {
      ok: false,
      status: response.status,
      error: message || ('GitHub 返回 ' + response.status),
      remaining: response.headers.get('x-ratelimit-remaining')
    };
    if (response.status === 401) {
      result.auth = true;
      result.error = 'token 无效或已过期';
    } else if (response.status === 403) {
      if (result.remaining === '0') {
        result.rateLimit = true;
        var reset = Number(response.headers.get('x-ratelimit-reset') || 0);
        result.resetAt = reset ? reset * 1000 : 0;
        result.error = 'GitHub 接口调用次数已用完';
      } else {
        result.forbidden = true;
        result.error = 'token 没有该仓库的读写权限';
      }
    } else if (response.status === 404) {
      result.notFound = true;
    } else if (response.status === 409 || (response.status === 422 && /sha|does not match/i.test(message))) {
      result.conflict = true;
      result.error = '云端文件已被其他设备改动';
    }
    return result;
  }

  function branchQuery(cfg) {
    return '?ref=' + encodeURIComponent(cfg.branch);
  }

  /* ---------------- 探测 ---------------- */

  async function probe(input) {
    var cfg = normalize(input);
    if (!validConfig(cfg)) return { ok: false, error: '请先填写 token 和仓库' };

    var repo = await api(cfg, repoPath(cfg));
    if (!repo.ok) {
      if (repo.notFound) {
        return {
          ok: false,
          notFound: true,
          error: '仓库 ' + cfg.owner + '/' + cfg.repo + ' 不存在，或 token 无权访问'
        };
      }
      return repo;
    }

    var info = repo.data || {};
    var file = await api(cfg, filePath(cfg) + branchQuery(cfg));
    if (file.ok && file.data && (file.data.type === 'file' || file.data.sha)) {
      return {
        ok: true,
        sha: file.data.sha,
        size: file.data.size || 0,
        exists: true,
        private: !!info.private,
        branch: cfg.branch,
        repo: cfg.owner + '/' + cfg.repo,
        defaultBranch: info.default_branch || cfg.branch,
        empty: false
      };
    }
    if (file.status === 404) {
      // 空仓库（没有任何提交）时分支还不存在，按「云端无文件」处理，首次推送会建出分支。
      var empty = !info.size || info.size === 0;
      return {
        ok: true,
        sha: null,
        size: 0,
        exists: false,
        private: !!info.private,
        branch: cfg.branch,
        repo: cfg.owner + '/' + cfg.repo,
        defaultBranch: info.default_branch || cfg.branch,
        empty: empty
      };
    }
    return file;
  }

  /* ---------------- 拉取 ---------------- */

  function decodeBase64(value) {
    var binary = atob(String(value || '').replace(/\s+/g, ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  function encodeBase64(text) {
    var bytes = new TextEncoder().encode(String(text));
    var chunk = 0x8000;
    var binary = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function pull(input) {
    var cfg = normalize(input);
    if (!validConfig(cfg)) return { ok: false, error: '请先填写 token 和仓库' };

    var file = await api(cfg, filePath(cfg) + branchQuery(cfg));
    if (file.status === 404) {
      return { ok: true, exists: false, sha: null, size: 0, text: '' };
    }
    if (!file.ok) {
      if (file.notFound) {
        return {
          ok: false,
          notFound: true,
          error: '云端还没有 ' + cfg.path + '，可以先从本地推送'
        };
      }
      return file;
    }

    var data = file.data || {};
    if (typeof data.content === 'string' && data.content) {
      return {
        ok: true,
        exists: true,
        sha: data.sha,
        size: data.size || 0,
        text: decodeBase64(data.content)
      };
    }

    // 超过 1 MB 时 contents 接口不回内容，改用 raw 媒体类型读。
    var raw = await api(cfg, filePath(cfg) + branchQuery(cfg), { accept: 'application/vnd.github.raw' });
    if (!raw.ok) return raw;
    return {
      ok: true,
      exists: true,
      sha: data.sha,
      size: data.size || 0,
      text: raw.text
    };
  }

  /* ---------------- 推送 ---------------- */

  async function latestRemote(cfg) {
    var res = await pull(cfg);
    if (!res.ok) return null;
    return res.exists ? res : { ok: true, exists: false, sha: null, text: '', size: 0 };
  }

  async function put(cfg, text, sha, useBranch) {
    var body = {
      message: '更新人生日历 ' + new Date().toISOString().slice(0, 16).replace('T', ' '),
      content: encodeBase64(text)
    };
    if (useBranch !== false) body.branch = cfg.branch;
    if (sha) body.sha = sha;
    var res = await api(cfg, filePath(cfg), { method: 'PUT', body: body });
    if (!res.ok) return res;
    var data = res.data || {};
    return {
      ok: true,
      sha: data.content ? data.content.sha : '',
      commit: data.commit ? data.commit.sha : ''
    };
  }

  async function push(input, text, sha) {
    var cfg = normalize(input);
    if (!validConfig(cfg)) return { ok: false, error: '请先填写 token 和仓库' };

    var res = await put(cfg, text, sha || null, true);
    if (res.ok) return res;

    // 空仓库里指定分支还不存在：退回不指定分支，让 GitHub 自己建默认分支。
    // 422 也可能是 sha 不匹配（已标记 conflict），那种情况绝不能重试成「新建」。
    if (sha && !res.conflict && (res.notFound || res.status === 422)) {
      var retry = await put(cfg, text, null, false);
      if (retry.ok) return retry;
    }
    if (!sha && !res.conflict && (res.notFound || res.status === 422)) {
      var create = await put(cfg, text, null, false);
      if (create.ok) return create;
    }

    if (res.conflict) {
      var remote = await latestRemote(cfg);
      return {
        ok: false,
        conflict: true,
        error: res.error,
        remote: remote,
        remoteText: remote ? remote.text : '',
        remoteSha: remote ? remote.sha : null
      };
    }
    return res;
  }

  /* ---------------- 摘要与文案 ---------------- */

  // 导出时间每次都会变，比对正文时必须剔除，否则会不停产生空提交。
  function digest(text) {
    var normalized = String(text == null ? '' : text)
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .filter(function (line) { return !/^- 导出时间：/.test(line); })
      .join('\n')
      .replace(/\s+$/, '');
    var hash = 0x811c9dc5;
    for (var i = 0; i < normalized.length; i += 1) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return normalized.length + ':' + hash.toString(16);
  }

  function describe(result) {
    if (!result) return '未知错误';
    if (result.offline) return result.error || '网络不可用';
    if (result.auth) return 'token 无效或已过期，请重新填写';
    if (result.forbidden) return 'token 没有该仓库 Contents 读写权限';
    if (result.rateLimit) {
      var wait = result.resetAt ? Math.max(1, Math.ceil((result.resetAt - Date.now()) / 60000)) : 0;
      return 'GitHub 接口调用次数已用完' + (wait ? '，约 ' + wait + ' 分钟后恢复' : '');
    }
    if (result.notFound) return result.error || '仓库或文件不存在，或 token 无权访问';
    if (result.conflict) return '云端文件已被改动，需要先处理冲突';
    return result.error || '同步失败';
  }

  window.LifeGithubSync = {
    DEFAULT_PATH: DEFAULT_PATH,
    normalize: normalize,
    valid: validConfig,
    load: load,
    save: save,
    clear: clear,
    loadMeta: loadMeta,
    saveMeta: saveMeta,
    probe: probe,
    pull: pull,
    push: push,
    digest: digest,
    describe: describe
  };
})();
