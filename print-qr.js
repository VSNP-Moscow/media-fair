(function () {
  'use strict';

  window.MF_PRINT = function (user) {
    if (!user || !user.qr || !window.QRCode) {
      window.alert('Не удалось подготовить QR-код для печати. Обновите страницу.');
      return;
    }
    const frame = document.createElement('iframe');
    frame.title = 'Печать QR-кода команды';
    frame.style.cssText = 'position:fixed;left:-10000px;width:800px;height:1000px;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>QR-код команды</title><style>body{font:18px Arial,sans-serif;text-align:center;padding:40px;color:#111}#qr{display:inline-block;margin:24px}#qr img{display:block}p{line-height:1.5}code{font-size:16px} @page{margin:20mm}</style></head><body><p>Медиаярмарка «День народного единства» · 6 ноября 2026</p><h1 id="team"></h1><p id="members"></p><div id="qr"></div><p><code id="code"></code></p><p>Показывайте этот QR-код волонтёру после прохождения станции.<br>Один QR-код — одна команда.</p></body></html>');
    doc.close();
    doc.getElementById('team').textContent = user.team || user.username;
    doc.getElementById('members').textContent = (user.members || []).map((m) => m.lastName + ' ' + m.firstName + ' · ' + m.className).join('; ');
    doc.getElementById('code').textContent = user.qr;
    new window.QRCode(doc.getElementById('qr'), { text: user.qr, width: 300, height: 300, correctLevel: window.QRCode.CorrectLevel.H });
    setTimeout(function () {
      if (!frame.isConnected || !frame.contentWindow) return;
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function () { frame.remove(); }, 60000);
    }, 600);
  };
})();
