/* ================= Медиаярмарка — кабинет команды ================= */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MF = window.__MF;
  const esc = MF.escapeHtml;
  let user;
  let surveyOpen = false;
  let questions = [];
  let submitted = false;
  let signature = '';
  let refreshing = false;
  let mapImages = [];
  let mapSignature = '';
  let activeFloor = null;
  let mapToken = 0;
  const mapUrls = new Map();

  function applyFlags(flags) {
    $('qrCard').style.display = flags.active ? '' : 'none';
    $('eventBanner').style.display = flags.active ? 'none' : 'block';
    $('eventBanner').textContent = 'Станции сейчас не работают. Баллы и пройденные этапы сохранены. Опрос открывается организаторами отдельно.';
    surveyOpen = !!flags.surveyOpen;
    $('surveyCard').style.display = surveyOpen && questions.length ? '' : 'none';
  }

  async function loadProgress() {
    const [points, progress] = await Promise.all([MF.getMyPoints(), window.MF_API.request('/tasks/progress')]);
    $('myPoints').textContent = MF.fmtPoints(points.totalPoints);
    $('pointsHeader').textContent = MF.fmtPoints(points.totalPoints) + ' баллов';
    const stages = progress.stages || [];
    $('stageSummary').textContent = 'Пройдено: ' + stages.filter((s) => s.completed).length + ' из ' + stages.length;
    $('stageList').innerHTML = stages.length ? stages.map((stage) =>
      '<article class="survey-q"><div class="survey-q-head"><b>' + esc(stage.title) + '</b>' +
      '<span class="tag' + (stage.completed ? ' points' : '') + '">' + (stage.completed ? 'Пройдено · +' + MF.fmtPoints(stage.earnedPoints) : 'Ещё не пройдено') + '</span></div>' +
      '<p class="small" style="margin-top:8px;">' + esc(stage.description) + '</p></article>'
    ).join('') : '<p class="small">Организаторы готовят список этапов.</p>';
  }

  function renderSurvey() {
    $('surveyCard').style.display = surveyOpen && questions.length ? '' : 'none';
    $('surveyForm').style.display = submitted ? 'none' : '';
    $('surveyResult').innerHTML = submitted ? '<div class="survey-thanks">Спасибо! Ответы вашей команды сохранены.</div>' : '';
    if (submitted) return;
    $('surveyFields').innerHTML = questions.map((question, index) =>
      '<fieldset class="survey-field"><legend>' + (index + 1) + '. ' + esc(question.text) + '</legend>' +
      (question.type === 'text'
        ? '<label for="sq_text_' + index + '">Ваш ответ (до 2000 символов)</label><textarea id="sq_text_' + index + '" name="sq_' + esc(question.id) + '" rows="4" maxlength="2000" required></textarea>'
        : (question.type === 'multiple' ? '<p class="small">Выберите один или несколько вариантов.</p>' : '') +
          (question.options || []).map((option, choice) => '<label class="survey-choice"><input type="' + (question.type === 'multiple' ? 'checkbox' : 'radio') + '" name="sq_' + esc(question.id) + '" value="' + choice + '"><span>' + esc(option) + '</span></label>').join('')) + '</fieldset>'
    ).join('');
  }

  async function loadSurvey(force) {
    const data = await MF.getSurvey();
    surveyOpen = !!data.open;
    const next = data.questions || [];
    const nextSignature = JSON.stringify(next);
    const dirty = !!document.querySelector('#surveyFields input:checked') ||
      Array.from(document.querySelectorAll('#surveyFields textarea')).some((field) => field.value.length > 0);
    if (force || submitted !== !!data.submitted || (!dirty && signature !== nextSignature)) {
      questions = next;
      signature = nextSignature;
      submitted = !!data.submitted;
      renderSurvey();
    } else {
      $('surveyCard').style.display = surveyOpen && questions.length ? '' : 'none';
    }
  }

  /* ---------- карта станций ---------- */
  function mapFloors() {
    return Array.from(new Set(mapImages.map((image) => image.floor))).sort((a, b) => a - b);
  }

  function mapCacheKey(image) {
    return image.id + ':' + image.updatedAt;
  }

  async function mapUrl(image) {
    const cached = mapUrls.get(image.id);
    if (cached && cached.key === mapCacheKey(image)) return cached.url;
    const blob = await MF.getMapImageBlob(image.id);
    const url = URL.createObjectURL(blob);
    if (cached) URL.revokeObjectURL(cached.url);
    mapUrls.set(image.id, { url, key: mapCacheKey(image) });
    return url;
  }

  function pruneMapUrls() {
    const ids = new Set(mapImages.map((image) => image.id));
    mapUrls.forEach((cached, id) => {
      if (!ids.has(id)) {
        URL.revokeObjectURL(cached.url);
        mapUrls.delete(id);
      }
    });
  }

  function renderMapFloors() {
    const box = $('mapFloors');
    const floors = mapFloors();
    box.innerHTML = '';
    box.hidden = floors.length === 0;
    floors.forEach((floor) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-floor-tab';
      button.textContent = floor + ' этаж';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(floor === activeFloor));
      button.addEventListener('click', () => {
        if (floor === activeFloor) return;
        activeFloor = floor;
        renderMapFloors();
        renderMapGallery().catch(() => {});
      });
      box.appendChild(button);
    });
  }

  async function renderMapGallery() {
    const gallery = $('mapGallery');
    const floors = mapFloors();
    if (floors.length === 0) {
      gallery.innerHTML = '';
      gallery.hidden = true;
      return;
    }
    if (!floors.includes(activeFloor)) activeFloor = floors[0];
    renderMapFloors();
    gallery.hidden = false;

    const token = ++mapToken;
    const items = mapImages.filter((image) => image.floor === activeFloor);
    gallery.innerHTML = '<p class="small map-loading" role="status">Загружаем изображения…</p>';
    try {
      const pictures = await Promise.all(items.map(async (image) => ({ image, url: await mapUrl(image) })));
      if (token !== mapToken) return;
      gallery.innerHTML = '';
      pictures.forEach(({ image, url }, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'map-photo';
        button.setAttribute('aria-label', 'Открыть карту: ' + image.floor + ' этаж, фото ' + (index + 1));

        const picture = document.createElement('img');
        picture.src = url;
        picture.alt = 'Карта станций: ' + image.floor + ' этаж, фото ' + (index + 1);
        picture.loading = 'lazy';
        button.appendChild(picture);

        const caption = document.createElement('span');
        caption.className = 'map-photo-label';
        caption.textContent = 'Фото ' + (index + 1) + ' · нажмите, чтобы увеличить';
        button.appendChild(caption);
        button.addEventListener('click', () => openMapLightbox(image));
        gallery.appendChild(button);
      });
    } catch (err) {
      if (token !== mapToken) return;
      gallery.innerHTML = '';
      const message = document.createElement('p');
      message.className = 'small';
      message.textContent = 'Не удалось загрузить карту: ' + err.message;
      gallery.appendChild(message);
    }
  }

  async function loadMap(force) {
    const data = await MF.getMapImages();
    const next = Array.isArray(data.images) ? data.images : [];
    const nextSignature = JSON.stringify(next.map((image) => [image.id, image.floor, image.position, image.updatedAt]));
    if (!force && nextSignature === mapSignature) return;

    mapImages = next;
    mapSignature = nextSignature;
    pruneMapUrls();
    const floors = mapFloors();
    if (!floors.includes(activeFloor)) activeFloor = floors[0] || null;

    $('mapHint').textContent = floors.length
      ? 'Выберите этаж и нажмите на фото, чтобы увеличить.'
      : 'Организаторы ещё не добавили карту. Пока ориентируйтесь по названиям этапов и указателям на площадке.';
    $('mapCard').classList.toggle('map-empty', floors.length === 0);
    await renderMapGallery();
  }

  function openMapLightbox(image) {
    const cached = mapUrls.get(image.id);
    if (!cached) return;
    const index = mapImages.filter((item) => item.floor === image.floor).findIndex((item) => item.id === image.id);
    $('mapLightboxImage').src = cached.url;
    $('mapLightboxImage').alt = 'Карта станций: ' + image.floor + ' этаж, фото ' + (index + 1);
    $('mapLightboxCaption').textContent = image.floor + ' этаж · фото ' + (index + 1);
    $('mapLightbox').hidden = false;
    document.body.style.overflow = 'hidden';
    $('mapLightboxClose').focus();
  }

  function closeMapLightbox() {
    $('mapLightbox').hidden = true;
    $('mapLightboxImage').src = '';
    document.body.style.overflow = '';
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const flags = await MF.getEventStatus();
      applyFlags(flags);
      await Promise.all([loadProgress(), loadSurvey(false)]);
    } catch (err) {
      $('stageSummary').textContent = 'Не удалось обновить данные. Повторим автоматически.';
    } finally {
      refreshing = false;
    }
  }

  $('surveyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!surveyOpen) return MF.showAlert('surveyAlert', 'Опрос закрыт организаторами.');
    const answers = [];
    for (let i = 0; i < questions.length; i += 1) {
      if (questions[i].type === 'text') {
        const field = $('sq_text_' + i);
        const text = field.value.trim();
        if (!text || text.length > 2000) {
          field.focus();
          return MF.showAlert('surveyAlert', 'Ответьте на вопрос ' + (i + 1) + ' (до 2000 символов).');
        }
        answers.push(text);
      } else if (questions[i].type === 'multiple') {
        const checked = Array.from(document.querySelectorAll('input[name="sq_' + questions[i].id + '"]:checked'));
        if (!checked.length) return MF.showAlert('surveyAlert', 'Выберите хотя бы один вариант в вопросе ' + (i + 1) + '.');
        answers.push(checked.map((field) => Number(field.value)));
      } else {
        const checked = document.querySelector('input[name="sq_' + questions[i].id + '"]:checked');
        if (!checked) return MF.showAlert('surveyAlert', 'Ответьте на вопрос ' + (i + 1) + '.');
        answers.push(Number(checked.value));
      }
    }
    const btn = $('btnSurveySubmit');
    btn.disabled = true;
    try {
      await MF.submitSurvey(answers);
      submitted = true;
      MF.hideAlert('surveyAlert');
      renderSurvey();
    } catch (err) {
      MF.showAlert('surveyAlert', err.message);
      if (err.status === 409) await loadSurvey(false).catch(() => {});
    } finally {
      btn.disabled = false;
    }
  });

  (async function boot() {
    user = await MF.init(['participant']);
    if (!user) return;
    $('teamTitle').textContent = user.team || user.username;
    $('teamMembers').textContent = (user.members || []).map((m) => m.lastName + ' ' + m.firstName + ' · ' + m.className).join('; ');
    $('qrText').textContent = user.qr;
    MF.generateQRCode('qrContainer', user.qr, 260);
    $('btnLogout').addEventListener('click', () => MF.logout());
    $('btnPrintQr').addEventListener('click', () => window.MF_PRINT(user));
    $('mapLightboxClose').addEventListener('click', closeMapLightbox);
    $('mapLightbox').addEventListener('click', (event) => {
      if (event.target === $('mapLightbox')) closeMapLightbox();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('mapLightbox').hidden) closeMapLightbox();
    });

    await refresh();
    loadMap(true).catch(() => {
      $('mapHint').textContent = 'Не удалось загрузить карту. Обновите страницу.';
    });
    const timer = setInterval(refresh, 5000);
    const mapTimer = setInterval(() => loadMap(false).catch(() => {}), 60000);
    window.addEventListener('beforeunload', () => {
      clearInterval(timer);
      clearInterval(mapTimer);
      mapUrls.forEach((cached) => URL.revokeObjectURL(cached.url));
    });
  })();
})();
