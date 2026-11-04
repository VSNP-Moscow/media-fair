(function () {
  'use strict';

  window.MF_TEAM_FORM = function (container, prefix) {
    let optional = false;
    let enabled = true;
    let nextId = 0;
    const rows = document.createElement('div');
    const status = document.createElement('p');
    status.className = 'small';
    status.setAttribute('aria-live', 'polite');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn-sm';
    add.textContent = '+ Добавить участника';
    container.append(rows, status, add);

    function update() {
      const fields = Array.from(rows.querySelectorAll('input'));
      const hasValue = fields.some((input) => input.value.trim());
      fields.forEach((input) => {
        input.disabled = !enabled;
        input.required = enabled && (!optional || hasValue);
      });
      Array.from(rows.children).forEach((row, index) => {
        row.querySelector('legend').textContent = 'Участник ' + (index + 1);
        const remove = row.querySelector('button');
        remove.disabled = !enabled || rows.children.length === 1;
        remove.setAttribute('aria-label', 'Удалить участника ' + (index + 1));
      });
      add.disabled = !enabled || rows.children.length >= 3;
      status.textContent = 'Участников: ' + rows.children.length + ' из 3.';
    }

    function append(member, focus) {
      if (rows.children.length >= 3) return;
      const row = document.createElement('fieldset');
      row.style.cssText = 'min-width:0;margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px;';
      const legend = document.createElement('legend');
      row.appendChild(legend);
      const id = prefix + '-' + (++nextId);
      [['firstName', 'Имя', 80], ['lastName', 'Фамилия', 80], ['className', 'Класс', 32]].forEach(([key, title, max]) => {
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.htmlFor = id + '-' + key;
        label.textContent = title;
        const input = document.createElement('input');
        input.id = label.htmlFor;
        input.type = 'text';
        input.maxLength = max;
        input.dataset.memberField = key;
        input.value = member && member[key] || '';
        input.addEventListener('input', update);
        group.append(label, input);
        row.appendChild(group);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-sm danger';
      remove.textContent = 'Удалить участника';
      remove.addEventListener('click', () => {
        if (rows.children.length <= 1) return;
        const target = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        update();
        target.querySelector('input').focus();
      });
      row.appendChild(remove);
      rows.appendChild(row);
      update();
      if (focus) row.querySelector('input').focus();
    }

    add.addEventListener('click', () => append(null, true));
    return {
      reset(members, options) {
        optional = !!(options && options.optional);
        rows.replaceChildren();
        const list = Array.isArray(members) && members.length ? members.slice(0, 3) : [null];
        list.forEach((member) => append(member, false));
        update();
      },
      setEnabled(value) {
        enabled = !!value;
        container.hidden = !enabled;
        update();
      },
      getMembers() {
        if (!enabled) return undefined;
        const members = Array.from(rows.children).map((row) => {
          const member = {};
          row.querySelectorAll('input').forEach((input) => { member[input.dataset.memberField] = input.value.trim(); });
          return member;
        });
        if (optional && !members.some((member) => Object.values(member).some(Boolean))) return undefined;
        if (members.some((member) => Object.values(member).some((value) => !value))) {
          throw new Error('Заполните имя, фамилию и класс каждого участника команды.');
        }
        return members;
      },
    };
  };
})();
