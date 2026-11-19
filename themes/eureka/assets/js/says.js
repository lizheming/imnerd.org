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
      if (privatePost) status.textContent = '私密微博已发布，仅在后台查看，不会出现在公开列表。';
      else { location.assign(location.pathname); return; }
    } catch (error) {
      status.textContent = error.message === 'auth' ? '登录已失效或没有权限，请重新登录后再试。'
        : '发布结果未确认，内容已保留。请先到后台核对，避免重复发布。';
    } finally { button.disabled = false; button.textContent = '发布'; }
  });

  root.querySelectorAll('[data-say-id]').forEach(button => {
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    let loaded = false, loading = false;
    const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
    async function load(page) {
      loading = true; panel.replaceChildren(text('p', '评论加载中…'));
      try {
        const response = await fetch('/api/plugins/say/comments/' + encodeURIComponent(button.dataset.sayId) + '?page=' + page, {credentials: 'same-origin'});
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          if ([403, 404].includes(response.status)) { panel.replaceChildren(text('p', '这条微博的评论尚未开放。')); loaded = true; return; }
          throw new Error('load');
        }
        panel.replaceChildren();
        button.querySelector('[data-comment-count]').textContent = payload.data.total;
        for (const comment of payload.data.items) {
          const item = document.createElement('div'); item.className = 'says-comment';
          item.append(text('strong', comment.nick), text('p', comment.comment)); panel.appendChild(item);
        }
        if (!payload.data.items.length) panel.appendChild(text('p', '暂无评论。'));
        const link = document.createElement('a'); link.href = '/says/' + encodeURIComponent(button.dataset.sayId); link.textContent = '前往详情页参与评论';
        panel.appendChild(link);
        const note = text('p', '评论审核通过后展示。', 'says-comment-note'); panel.appendChild(note);
        const navigation = document.createElement('div'); navigation.className = 'says-comments-nav';
        for (const [label, next, show] of [['上一页评论', page - 1, page > 1], ['下一页评论', page + 1, page * payload.data.pageSize < payload.data.total]]) {
          if (!show) continue;
          const control = text('button', label); control.type = 'button'; control.addEventListener('click', () => { if (!loading) load(next); }); navigation.appendChild(control);
        }
        panel.appendChild(navigation); loaded = true;
      } catch { panel.replaceChildren(text('p', '评论暂时无法加载，请收起后重新展开重试。')); }
      finally { loading = false; }
    }
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open)); button.setAttribute('aria-label', open ? '收起评论' : '展开评论'); panel.hidden = !open;
      if (open && !loaded && !loading) load(1);
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
