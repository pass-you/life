/*! native-bridge.js —— 桌面 / 安卓壳的原生能力桥
 *
 * 浏览器里加载本文件是无操作（detect() 超时后返回 null，一切走原有
 * File System Access / 导入导出流程）；在壳内把原生能力统一成 Promise API：
 *
 *   LifeBridgeClient.detect()            -> Promise<null | {platform, version}>
 *   LifeBridgeClient.pickSaveLocation(n) -> Promise<{ok, name} | {canceled}>
 *   LifeBridgeClient.openFile()          -> Promise<{ok, name, text} | {canceled}>
 *   LifeBridgeClient.writeFile(text)     -> Promise<{ok} | {error}>
 *   LifeBridgeClient.restoreSavedFile()  -> Promise<{ok, name, text} | {none}>
 *   LifeBridgeClient.clearSavedFile()    -> Promise<{ok}>
 *   LifeBridgeClient.checkUpdate()       -> Promise<{ok, current, latest, notes, hasUpdate}>
 *   LifeBridgeClient.applyUpdate()       -> Promise<{ok, message} | {error}>
 *
 * 桥协议（两端一致）：request(method, argsJson) -> 结果 JSON。
 *   桌面 pywebview：window.pywebview.api.request(method, argsJson)
 *                  返回 Promise<string>，resolve 即最终 JSON。
 *   安卓 WebView：  window.LifeBridge.request(method, argsJson, callId)
 *                  立即同步返回 '{"__async":true}'，结果稍后由壳回调
 *                  window.__lifeAsync.resolve(callId, resultJson)。
 */
(function () {
  'use strict';

  if (window.LifeBridgeClient) return;

  var pending = new Map();
  var seq = 0;
  var info = null;
  var detectPromise = null;

  function parseResult(text) {
    if (text == null) return { ok: false, error: '空响应' };
    if (typeof text === 'object') return text;
    try {
      var parsed = JSON.parse(String(text));
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, error: '响应格式异常' };
    } catch (err) {
      return { ok: false, error: '响应解析失败' };
    }
  }

  /* 安卓壳的回调入口：Kotlin 处理完成后 evaluateJavascript 调到这里。 */
  window.__lifeAsync = {
    resolve: function (callId, resultJson) {
      var entry = pending.get(callId);
      if (!entry) return;
      pending.delete(callId);
      entry(parseResult(resultJson));
    }
  };

  function requestAndroid(method, args) {
    return new Promise(function (resolve) {
      var bridge = window.LifeBridge;
      if (!bridge || typeof bridge.request !== 'function') {
        resolve({ ok: false, error: '桥不可用' });
        return;
      }
      var callId = 'c' + (++seq);
      pending.set(callId, resolve);
      var raw = null;
      try {
        raw = bridge.request(method, JSON.stringify(args || {}), callId);
      } catch (err) {
        pending.delete(callId);
        resolve({ ok: false, error: String(err) });
        return;
      }
      var parsed = parseResult(raw);
      if (parsed.__async) return; /* 稍后由 __lifeAsync.resolve 兑现 */
      pending.delete(callId);
      resolve(parsed);
    });
  }

  function requestDesktop(method, args) {
    var api = window.pywebview && window.pywebview.api;
    if (!api || typeof api.request !== 'function') {
      return Promise.resolve({ ok: false, error: '桥不可用' });
    }
    return api.request(method, JSON.stringify(args || {})).then(parseResult, function () {
      return { ok: false, error: '调用失败' };
    });
  }

  function isDesktopShell() {
    return !!(window.pywebview && window.pywebview.api &&
      typeof window.pywebview.api.request === 'function');
  }

  function isAndroidShell() {
    return !!(window.LifeBridge && typeof window.LifeBridge.request === 'function');
  }

  function shellHint() {
    /* pywebview 会先注入 window.pywebview 占位对象（api 稍后 ready）；
     * 安卓壳加载时同步注入 window.LifeBridge。出现任一迹象就值得等。 */
    return typeof window.pywebview !== 'undefined' || typeof window.LifeBridge !== 'undefined';
  }

  function detect() {
    if (detectPromise) return detectPromise;
    detectPromise = new Promise(function (resolve) {
      var tries = 0;
      var maxTries = 20; /* 普通浏览器最多 2 秒放弃，不让文件恢复白等 */
      (function poll() {
        if (isDesktopShell()) {
          requestDesktop('info', {}).then(function (res) {
            info = res && res.ok ? res : null;
            resolve(info);
          });
          return;
        }
        if (isAndroidShell()) {
          requestAndroid('info', {}).then(function (res) {
            info = res && res.ok ? res : null;
            resolve(info);
          });
          return;
        }
        /* 有壳迹象但对象尚未就绪：延长等待（api 注入在 dom ready 之后）。 */
        if (shellHint() && tries >= maxTries) maxTries += 20;
        if (tries++ >= maxTries) { resolve(null); return; }
        setTimeout(poll, 100);
      })();
    });
    return detectPromise;
  }

  function call(method, args) {
    if (!info) return Promise.resolve({ ok: false, error: '桥不可用' });
    if (info.platform === 'android') return requestAndroid(method, args);
    return requestDesktop(method, args);
  }

  window.LifeBridgeClient = {
    detect: detect,
    call: call,
    platform: function () { return info ? info.platform : null; },
    version: function () { return info ? info.version : ''; },
    pickSaveLocation: function (defaultName) {
      return call('pick_save_location', { defaultName: defaultName || '人生日历.md' });
    },
    openFile: function () { return call('open_file', {}); },
    writeFile: function (text) { return call('write_file', { text: text }); },
    restoreSavedFile: function () { return call('restore_saved_file', {}); },
    clearSavedFile: function () { return call('clear_saved_file', {}); },
    checkUpdate: function () { return call('check_update', {}); },
    applyUpdate: function () { return call('apply_update', {}); }
  };
})();
