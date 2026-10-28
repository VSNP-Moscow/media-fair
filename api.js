/* ================= Медиаярмарка — клиент API ================= */
(function () {
  'use strict';

  var BASE = (window.MF_CONFIG && window.MF_CONFIG.apiBase) || '/api';
  var TOKEN_KEY = 'mf_token';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* приватный режим — работаем без сохранения */ }
  }

  function clearToken() { setToken(''); }

  async function request(path, options) {
    var opts = options || {};
    var headers = { Accept: 'application/json' };

    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

    var token = getToken();
    if (token && opts.auth !== false) headers.Authorization = 'Bearer ' + token;

    var response;
    try {
      response = await fetch(BASE + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        mode: 'cors',
        cache: 'no-store',
      });
    } catch (e) {
      var netErr = new Error('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
      netErr.network = true;
      throw netErr;
    }

    var data = null;
    try { data = await response.json(); } catch (e) { data = null; }

    if (!response.ok) {
      var err = new Error((data && data.error) || ('Ошибка сервера (' + response.status + ')'));
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data || {};
  }

  window.MF_API = {
    base: BASE,
    request: request,
    getToken: getToken,
    setToken: setToken,
    clearToken: clearToken,
  };
})();
