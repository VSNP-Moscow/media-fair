/* ================= Медиаярмарка — карта станций (администратор) ================= */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const MAX_DATA_URL = 4 * 1024 * 1024;
  const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  let images = [];
  let maxImages = 6;
  let listToken = 0;
  let uploading = false;
  const thumbs = new Map();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function setAlert(message, type) {
    MF.showAlert('mapAlert', message, type);
    if (type === 'ok') setTimeout(() => MF.hideAlert('mapAlert'), 4000);
  }

  function fmtSize(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(1).replace('.', ',') + ' МБ';
    return Math.max(1, Math.round(size / 1024)) + ' КБ';
  }

  function sourceType(file) {
    if (ACCEPTED.includes(file.type)) return file.type;
    if (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name || '')) return 'image/jpeg';
    return '';
  }

  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Браузер не смог открыть этот файл.')); };
      img.src = url;
    });
  }

  async function compress(file) {
    if (!sourceType(file)) throw new Error('нужен файл JPG, PNG или WebP');
    if (file.size > 20 * 1024 * 1024) throw new Error('исходный файл больше 20 МБ');

    const img = await readImage(file);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error('не удалось определить размер изображения');

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const attempts = [[1800, 0.85], [1600, 0.78], [1400, 0.7], [1200, 0.62], [1000, 0.55]];

    for (const [maxSide, quality] of attempts) {
      const scale = Math.min(1, maxSide / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_DATA_URL) return data;
    }
    throw new Error('не удалось сжать изображение до 4 МБ');
  }

  function updateCounters() {
    $('mapCount').textContent = images.length + ' из ' + maxImages;
    $('mapUploadHint').textContent = uploading
      ? $('mapUploadHint').textContent
      : 'Свободно мест: ' + Math.max(0, maxImages - images.length) + '.';
  }

  async function loadThumb(image) {
    const cached = thumbs.get(image.id);
    if (cached && cached.updatedAt === image.updatedAt) return cached.url;
    const blob = await MF.getMapImageBlob(image.id);
    const url = URL.createObjectURL(blob);
    if (cached) URL.revokeObjectURL(cached.url);
    thumbs.set(image.id, { url, updatedAt: image.updatedAt });
    return url;
  }

  function dropThumb(id) {
    const cached = thumbs.get(id);
    if (cached) {
      URL.revokeObjectURL(cached.url);
      thumbs.delete(id);
    }
  }

  function floorOptions(selected) {
    const select = element('select');
    select.setAttribute('aria-label', 'Этаж изображения');
    select.dataset.action = 'floor';
    for (let floor = 1; floor <= 3; floor += 1) {
      const option = element('option', '', floor + ' этаж');
      option.value = String(floor);
      if (floor === selected) option.selected = true;
      select.appendChild(option);
    }
    return select;
  }

  function renderGroup(floor, urls) {
    const group = element('section', 'map-admin-group');
    const head = element('div', 'map-admin-group-head');
    head.appendChild(element('h4', '', floor + ' этаж'));
    head.appendChild(element('span', 'small', 'Фото: ' + images.filter((image) => image.floor === floor).length));
    group.appendChild(head);

    const grid = element('div', 'admin-map-grid');
    images.filter((image) => image.floor === floor).forEach((image) => {
      const card = element('article', 'admin-map-item');
      const button = element('button', 'map-thumb');
      button.type = 'button';
      button.dataset.action = 'view';
      button.dataset.id = image.id;
      button.setAttribute('aria-label', 'Открыть фото ' + floor + ' этажа на весь экран');

      const picture = element('img');
      picture.src = urls.get(image.id);
      picture.alt = 'Карта, ' + floor + ' этаж';
      picture.loading = 'lazy';
      button.appendChild(picture);

      const meta = element('div', 'admin-map-meta');
      meta.appendChild(element('div', 'small', fmtSize(image.size) + ' · ' + MF.fmtDate(image.createdAt)));
      const actions = element('div', 'map-admin-actions');
      actions.appendChild(floorOptions(image.floor));
      const remove = element('button', 'btn-sm danger', 'Удалить');
      remove.type = 'button';
      remove.dataset.action = 'delete';
      remove.dataset.id = image.id;
      actions.appendChild(remove);
      meta.appendChild(actions);
      card.appendChild(button);
      card.appendChild(meta);
      grid.appendChild(card);
    });
    group.appendChild(grid);
    return group;
  }

  async function render() {
    const token = ++listToken;
    const box = $('mapAdminList');
    updateCounters();

    if (images.length === 0) {
      box.innerHTML = '<div class="empty" style="padding:22px;">Карта пока не добавлена. Загрузите первое изображение — у участников появятся кнопки этажей.</div>';
      return;
    }

    box.innerHTML = '<p class="small">Загружаем фотографии…</p>';
    const urls = new Map();
    try {
      await Promise.all(images.map(async (image) => {
        urls.set(image.id, await loadThumb(image));
      }));
    } catch (err) {
      if (token === listToken) {
        box.innerHTML = '';
        box.appendChild(element('div', 'empty', 'Не удалось загрузить фотографии: ' + err.message));
      }
      return;
    }
    if (token !== listToken) return;

    box.innerHTML = '';
    [1, 2, 3].forEach((floor) => {
      if (images.some((image) => image.floor === floor)) box.appendChild(renderGroup(floor, urls));
    });
  }

  async function load() {
    const data = await MF.getMapImages();
    images = Array.isArray(data.images) ? data.images : [];
    maxImages = Number(data.maxImages) || 6;
    await render();
  }

  function openLightbox(imageId) {
    const cached = thumbs.get(imageId);
    if (!cached) return;
    const image = images.find((item) => item.id === imageId);
    const picture = $('mapLightboxImage');
    picture.src = cached.url;
    picture.alt = image ? 'Карта, ' + image.floor + ' этаж' : 'Карта станций';
    $('mapLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    $('mapLightboxClose').focus();
  }

  function closeLightbox() {
    $('mapLightbox').hidden = true;
    $('mapLightboxImage').src = '';
    document.body.style.overflow = '';
  }

  async function uploadFiles(event) {
    event.preventDefault();
    if (uploading) return;

    const files = Array.from($('mapFiles').files || []);
    if (files.length === 0) {
      setAlert('Выберите хотя бы один файл.');
      return;
    }

    const floor = Number($('mapFloor').value);
    const free = Math.max(0, maxImages - images.length);
    if (free === 0) {
      setAlert('Достигнут лимит: ' + maxImages + ' изображений. Удалите лишнее, чтобы загрузить новое.');
      return;
    }
    if (files.length > free) {
      setAlert('Свободно мест: ' + free + '. Выберите не больше ' + free + ' файлов.');
      return;
    }

    const button = $('btnUploadMap');
    const hint = $('mapUploadHint');
    uploading = true;
    button.disabled = true;
    $('mapFiles').disabled = true;

    let uploaded = 0;
    const errors = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        hint.textContent = 'Обработка ' + (index + 1) + ' из ' + files.length + ': ' + files[index].name;
        try {
          const dataUrl = await compress(files[index]);
          await MF.uploadMapImage({ floor, image: dataUrl });
          uploaded += 1;
        } catch (err) {
          errors.push(files[index].name + ': ' + err.message);
        }
      }
      $('mapFiles').value = '';
      await load();
      if (errors.length) {
        setAlert('Загружено: ' + uploaded + '. Не удалось: ' + errors.join('; '));
      } else {
        setAlert('Загружено фотографий: ' + uploaded + '.', 'ok');
      }
    } catch (err) {
      setAlert(err.message);
    } finally {
      uploading = false;
      button.disabled = false;
      $('mapFiles').disabled = false;
      updateCounters();
    }
  }

  function bind() {
    $('btnLogout').addEventListener('click', () => MF.logout());

    $('btnRefresh').addEventListener('click', async () => {
      const button = $('btnRefresh');
      button.disabled = true;
      try {
        await load();
        setAlert('Карта обновлена.', 'ok');
      } catch (err) {
        setAlert(err.message);
      } finally {
        button.disabled = false;
      }
    });

    $('mapUploadForm').addEventListener('submit', uploadFiles);

    $('mapAdminList').addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const image = images.find((item) => item.id === button.dataset.id);
      if (!image) return;

      if (button.dataset.action === 'view') {
        openLightbox(image.id);
        return;
      }

      if (button.dataset.action === 'delete') {
        if (!window.confirm('Удалить это изображение карты? Участники перестанут его видеть.')) return;
        button.disabled = true;
        try {
          await MF.deleteMapImage(image.id);
          dropThumb(image.id);
          await load();
          setAlert('Изображение удалено.', 'ok');
        } catch (err) {
          setAlert(err.message);
          button.disabled = false;
        }
      }
    });

    $('mapAdminList').addEventListener('change', async (event) => {
      const select = event.target.closest('select[data-action="floor"]');
      if (!select) return;
      const item = select.closest('.admin-map-item');
      const button = item && item.querySelector('button[data-action="view"]');
      const image = button && images.find((entry) => entry.id === button.dataset.id);
      if (!image) return;

      select.disabled = true;
      try {
        await MF.updateMapImage(image.id, { floor: Number(select.value) });
        await load();
        setAlert('Этаж изменён.', 'ok');
      } catch (err) {
        setAlert(err.message);
        select.value = String(image.floor);
      } finally {
        select.disabled = false;
      }
    });

    $('mapLightboxClose').addEventListener('click', closeLightbox);
    $('mapLightbox').addEventListener('click', (event) => {
      if (event.target === $('mapLightbox')) closeLightbox();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('mapLightbox').hidden) closeLightbox();
    });
    window.addEventListener('beforeunload', () => {
      thumbs.forEach((cached) => URL.revokeObjectURL(cached.url));
    });
  }

  (async function boot() {
    const user = await MF.init(['admin']);
    if (!user) return;
    bind();
    try {
      await load();
      $('mapUploadHint').textContent = 'Свободно мест: ' + Math.max(0, maxImages - images.length) + '.';
    } catch (err) {
      setAlert('Не удалось загрузить карту: ' + err.message);
      $('mapAdminList').innerHTML = '<div class="empty" style="padding:22px;">Проверьте связь с сервером и обновите страницу.</div>';
    }
  })();
})();
