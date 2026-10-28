/* ================= Медиаярмарка — конфигурация =================
   Адрес API. Фронтенд живёт на GitHub Pages, база — на отдельном сервере.

   Переопределение (для отладки): index.html?api=https://другой-адрес/api
   Значение запоминается в sessionStorage на время вкладки, чтобы работали
   переходы между страницами admin.html / participant.html / volunteer.html.
   ============================================================== */
(function () {
  var PROD_API = 'https://mf.176.109.108.39.sslip.io/api';

  function readOverride() {
    try {
      var params = new URLSearchParams(window.location.search);
      var fromUrl = params.get('api');
      if (fromUrl) {
        sessionStorage.setItem('mf_api_override', fromUrl);
        return fromUrl;
      }
      return sessionStorage.getItem('mf_api_override') || '';
    } catch (e) {
      return '';
    }
  }

  var override = readOverride();
  var local = ['localhost', '127.0.0.1', '0.0.0.0'].indexOf(window.location.hostname) !== -1;

  window.MF_CONFIG = {
    apiBase: override || (local ? 'http://localhost:4010/api' : PROD_API),
  };
})();
