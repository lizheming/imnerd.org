(function () {
  'use strict';
  function parseTime(value) {
    const source = String(value || '').trim();
    return new Date(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(source) ? source.replace(' ', 'T') + '+08:00' : source);
  }
  function relativeTime(value, now) {
    const date = parseTime(value);
    if (!Number.isFinite(date.getTime())) return '时间未知';
    const seconds = Math.max(0, Math.floor(((now || new Date()).getTime() - date.getTime()) / 1000));
    const parts = value => Object.fromEntries(new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric'}).formatToParts(value).map(p => [p.type, p.value]));
    const d = parts(date), current = parts(now || new Date());
    if (d.year !== current.year) return d.year + '年' + d.month + '月' + d.day + '日';
    if (seconds < 60) return seconds + '秒前';
    if (seconds < 3600) return Math.floor(seconds / 60) + '分钟前';
    if (seconds < 86400) return Math.floor(seconds / 3600) + '小时前';
    if (seconds < 604800) return Math.floor(seconds / 86400) + '天前';
    return d.month + '月' + d.day + '日';
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {parseTime, relativeTime};
  if (typeof document === 'undefined') return;
  const root = document.querySelector('[data-says-page]');
  if (!root) return;
  const updateTimes = () => root.querySelectorAll('[data-says-time]').forEach(el => {
    el.textContent = relativeTime(el.dataset.saysTime);
    const date = parseTime(el.dataset.saysTime);
    if (Number.isFinite(date.getTime())) el.dateTime = date.toISOString();
  });
  updateTimes();
  const timer = setInterval(updateTimes, 30000);
  window.addEventListener('pagehide', () => clearInterval(timer), {once: true});

  const form = root.querySelector('[data-says-composer]');
  if (form) form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    if (button.disabled) return;
    const status = form.querySelector('[data-publish-status]');
    const text = form.elements.text.value.trim(), privatePost = form.elements.private.checked;
    if (!text) { status.textContent = '请输入微博内容。'; return; }
    button.disabled = true; button.textContent = '发布中…'; status.textContent = '';
    try {
      const response = await fetch('/admin/api/plugins/say/forms/publish-say', {method: 'POST', credentials: 'same-origin',
        headers: {'Content-Type': 'application/json', 'X-CSRF-Token': form.dataset.csrf},
        body: JSON.stringify({text, status: privatePost ? 'private' : 'public', allowComments: !privatePost})});
      const result = await response.json();
      if (!response.ok || result.errno !== 0 || !result.data?.item?.id) throw new Error(response.status === 403 ? 'auth' : 'unconfirmed');
      form.elements.text.value = '';
      location.assign(location.pathname); return;
    } catch (error) {
      status.textContent = error.message === 'auth' ? '登录已失效或没有权限，请重新登录后再试。'
        : '发布结果未确认，内容已保留。请先到后台核对，避免重复发布。';
    } finally { button.disabled = false; button.textContent = '发布'; }
  });

  // Revalidate authenticated markup when restored from browser history.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  const editor = document.querySelector('[data-says-editor]');
  const editForm = editor?.querySelector('[data-says-edit-form]');
  let editing;
  async function adminRequest(path, body) {
    const response = await fetch('/admin/api/plugins/say/' + path, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: {'Content-Type': 'application/json', 'X-CSRF-Token': root.dataset.adminCsrf},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const result = await response.json();
    if (!response.ok || result.errno !== 0 || !result.data) {
      throw new Error(response.status === 403 ? 'auth' : 'unconfirmed');
    }
    return result.data;
  }
  const formPath = id => 'forms/edit-say?id=' + encodeURIComponent(id);
  const errorText = error => error.message === 'auth' ? '登录已失效或没有权限，请重新登录。'
    : error.message === 'conflict' ? '正文已在其他地方修改，请重新打开编辑后再试。'
      : '操作结果未确认，请刷新页面核对，勿立即重复提交。';
  root.querySelectorAll('[data-say-action]').forEach(button => button.addEventListener('click', async () => {
    if (button.disabled) return;
    const card = button.closest('.says-card');
    const status = card.querySelector('[data-manage-status]');
    const buttons = card.querySelectorAll('[data-say-action]');
    buttons.forEach(item => { item.disabled = true; });
    status.textContent = '';
    const id = button.dataset.id;
    try {
      if (button.dataset.sayAction === 'edit') {
        const values = await adminRequest(formPath(id));
        editing = {id, text: values.text || '', trigger: button};
        editForm.elements.text.value = editing.text;
        editForm.querySelector('[data-edit-status]').textContent = '';
        editForm.querySelector('[type=submit]').disabled = false;
        editor.showModal();
        editForm.elements.text.focus();
        buttons.forEach(item => { item.disabled = false; });
        return;
      }
      if (button.dataset.sayAction === 'visibility') {
        await adminRequest('actions/toggle-say', {id, status: button.dataset.value});
      } else {
        const values = await adminRequest(formPath(id));
        await adminRequest('forms/edit-say', {...values, id, allowComments: button.dataset.value === 'true'});
      }
      location.reload();
    } catch (error) {
      status.textContent = errorText(error);
      if (button.dataset.sayAction === 'edit') buttons.forEach(item => { item.disabled = false; });
    }
  }));
  editor?.querySelector('[data-edit-cancel]').addEventListener('click', () => editor.close());
  editor?.addEventListener('close', () => editing?.trigger.focus());
  editForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = editForm.querySelector('[type=submit]');
    if (button.disabled || !editing) return;
    button.disabled = true;
    const status = editForm.querySelector('[data-edit-status]');
    status.textContent = '保存中…';
    try {
      const latest = await adminRequest(formPath(editing.id));
      if ((latest.text || '') !== editing.text) throw new Error('conflict');
      await adminRequest('forms/edit-say', {...latest, id: editing.id, text: editForm.elements.text.value});
      location.reload();
    } catch (error) { status.textContent = errorText(error); }
  });

  const commentOptions = JSON.parse(root.dataset.walineOptions);
  const counterURL = commentOptions.serverURL + '/api/article';
  root.querySelectorAll('[data-like-path]').forEach(button => {
    // Use the same path as Waline and reserve its first article reaction for likes.
    const path = encodeURI(button.dataset.likePath);
    const storageKey = 'says:reaction0:' + path;
    const status = button.closest('.says-card').querySelector('[data-like-status]');
    let liked = false;
    try { liked = localStorage.getItem(storageKey) === '1'; } catch {}
    const show = count => {
      button.querySelector('[data-like-count]').textContent = String(Math.max(0, count));
      button.setAttribute('aria-pressed', String(liked));
      button.setAttribute('aria-label', liked ? '取消点赞' : '点赞');
    };
    async function counter(action) {
      const query = new URLSearchParams({path, type: 'reaction0'});
      const response = await fetch(counterURL + (action ? '' : '?' + query), action ? {
        method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({path, type: 'reaction0', action})
      } : {credentials: 'same-origin'});
      const result = await response.json();
      const count = result.data?.[0]?.reaction0;
      if (!response.ok || result.errno !== 0 || !Number.isFinite(count)) throw new Error('counter');
      return count;
    }
    counter().then(count => { show(count); button.disabled = false; }).catch(() => {
      button.title = '点赞数量暂时无法加载，请刷新后重试';
    });
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = '';
      try {
        const count = await counter(liked ? 'desc' : 'inc');
        liked = !liked;
        try { localStorage.setItem(storageKey, liked ? '1' : '0'); } catch {}
        show(count);
        status.textContent = liked ? '已点赞' : '已取消点赞';
        button.disabled = false;
      } catch {
        status.classList.remove('says-sr-only');
        status.textContent = '点赞结果未确认，请刷新页面核对后再试。';
      }
    });
  });

  const walineMounts = new WeakMap();
  let walineReady;
  function mountWaline(panel, button) {
    if (walineMounts.has(panel)) return walineMounts.get(panel);
    const pending = (async () => {
      panel.textContent = '评论加载中…';
      try {
        if (!walineReady) walineReady = Promise.all([
          import('https://cdn.jsdelivr.net/npm/@waline/client@3.16.0/dist/waline.js'),
          fetch('/api/comment/api/token', {credentials: 'same-origin'}).then(async response => {
            const result = await response.json();
            if (!response.ok || result.errno !== 0) throw new Error('session');
            if (result.data?.objectId) localStorage.setItem('WALINE_USER', JSON.stringify({...result.data, remember: true}));
            else localStorage.removeItem('WALINE_USER');
          })
        ]).catch(error => { walineReady = null; throw error; });
        const [client] = await walineReady;
        const options = JSON.parse(root.dataset.walineOptions);
        panel.replaceChildren();
        client.init({...options, reaction: false, el: panel, path: encodeURI(button.dataset.commentPath)});
        const query = new URLSearchParams({type: 'count', url: button.dataset.commentPath});
        fetch('/api/comment/api/comment?' + query, {credentials: 'omit'}).then(r => r.json()).then(result => {
          if (result.errno === 0 && Number.isFinite(result.data?.[0])) {
            button.querySelector('[data-comment-count]').textContent = result.data[0];
          }
        }).catch(() => {});
      } catch {
        panel.textContent = '评论暂时无法加载，请收起后重新展开重试。';
        walineMounts.delete(panel);
      }
    })();
    walineMounts.set(panel, pending);
    return pending;
  }

  root.querySelectorAll('[data-say-id]').forEach(button => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? '收起评论' : '展开评论');
      panel.hidden = !open;
      if (!open) return;
      if (button.dataset.commentPath) {
        mountWaline(panel, button);
      } else {
        const link = document.createElement('a');
        link.href = '/says/' + encodeURIComponent(button.dataset.sayId);
        link.textContent = '前往详情页查看评论';
        panel.replaceChildren(link);
      }
    });
  });

  const dialog = document.querySelector('[data-says-lightbox]');
  let images = [], selected = 0, trigger;
  function show(index) {
    selected = (index + images.length) % images.length;
    const img = dialog.querySelector('img'); img.src = images[selected].href; img.alt = images[selected].querySelector('img').alt;
    dialog.querySelector('[data-lightbox-count]').textContent = (selected + 1) + ' / ' + images.length;
    dialog.querySelector('[data-lightbox-prev]').hidden = images.length < 2;
    dialog.querySelector('[data-lightbox-next]').hidden = images.length < 2;
  }
  root.querySelectorAll('[data-says-image]').forEach(link => link.addEventListener('click', event => {
    if (!dialog?.showModal) return;
    event.preventDefault(); trigger = link; images = [...link.parentElement.querySelectorAll('[data-says-image]')]; show(images.indexOf(link)); dialog.showModal();
  }));
  if (dialog) {
    dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(selected - 1));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(selected + 1));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {event.preventDefault(); show(selected + (event.key === 'ArrowLeft' ? -1 : 1));} });
    dialog.addEventListener('close', () => trigger?.focus());
  }
})();
