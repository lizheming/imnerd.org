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
  function commentLoginUrl(pathname, search, anchor) {
    const target = pathname + search + '#' + anchor;
    return '/admin/login?' + new URLSearchParams({redirect: target});
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {parseTime, relativeTime, commentLoginUrl};
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

  const commentAPI = '/api/comment/api';
  async function walineRequest(resource, data) {
    const response = await fetch(commentAPI + '/' + resource, {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error',
      signal: AbortSignal.timeout(15000),
      ...(data ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)} : {})
    });
    const result = await response.json();
    if (!response.ok || result.errno !== 0) {
      throw Object.assign(new Error('Waline request failed'), {status: response.status, code: result.errno});
    }
    return result.data;
  }

  root.querySelectorAll('[data-like-path]').forEach(button => {
    const path = button.dataset.likePath;
    const storageKey = 'says:reaction0:' + path;
    const status = button.closest('.says-card').querySelector('[data-like-status]');
    let liked = false;
    try { liked = localStorage.getItem(storageKey) === '1'; } catch {}
    const show = () => {
      button.setAttribute('aria-pressed', String(liked));
      button.setAttribute('aria-label', liked ? '取消点赞' : '点赞');
    };
    show();
    if (button.querySelector('[data-like-count]').textContent === '–') {
      button.title = '点赞数量暂时无法加载，请刷新后重试';
      return;
    }
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = '';
      try {
        const result = await walineRequest('article', {path, type: 'reaction0', action: liked ? 'desc' : 'inc'});
        const count = result?.[0]?.reaction0;
        if (!Number.isFinite(count)) throw new Error('counter');
        liked = !liked;
        try { localStorage.setItem(storageKey, liked ? '1' : '0'); } catch {}
        button.querySelector('[data-like-count]').textContent = String(Math.max(0, count));
        show();
        status.textContent = liked ? '已点赞' : '已取消点赞';
        button.disabled = false;
      } catch {
        status.classList.remove('says-sr-only');
        status.textContent = '点赞结果未确认，请刷新页面核对后再试。';
      }
    });
  });

  const panels = [...root.querySelectorAll('[data-comments-panel]')];
  let signedIn = false, sessionRequest;
  function setSignedIn(value) {
    signedIn = value;
    for (const panel of panels) {
      const composer = panel.querySelector('[data-comment-form]');
      const replying = composer.hasAttribute('data-replying');
      composer.elements.comment.readOnly = !signedIn;
      composer.querySelector('[type=submit]').textContent = signedIn ? replying ? '回复' : '评论' : '登录后评论';
    }
  }
  function checkSession() {
    if (!sessionRequest) {
      sessionRequest = walineRequest('token').then(identity => {
        // The native API authenticates the same-origin session cookie. Never
        // store Waline's token or use it in a URL or in client markup.
        setSignedIn(Boolean(identity?.objectId));
        return signedIn;
      }).finally(() => { sessionRequest = null; });
    }
    return sessionRequest;
  }
  if (panels.length) {
    checkSession().catch(() => {});
    document.addEventListener('pointerdown', event => {
      const row = root.querySelector('[data-comment-active]');
      if (row && !row.contains(event.target)) row.removeAttribute('data-comment-active');
    });
  }

  async function refreshThread(card, panel, toggle) {
    const id = card.id.slice(4);
    const response = await fetch(location.pathname + location.search, {
      credentials: 'omit', cache: 'no-store', redirect: 'error',
      headers: {'X-Eureka-Say-Comments': id}, signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('comments');
    const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
    const incoming = parsed.querySelector('[data-say-comment-list]');
    if (incoming?.dataset.sayCommentList !== id || !/^\d+$/.test(incoming.dataset.count)) throw new Error('comments');
    panel.querySelector('[data-say-comment-list]').replaceWith(incoming);
    toggle.querySelector('[data-comment-count]').textContent = incoming.dataset.count;
  }

  const commentErrors = {
    DUPLICATE_CONTENT: '这条评论已经提交过。',
    COMMENT_TOO_FAST: '评论发得太快，请稍后再试。',
    COMMENT_DISABLED: '这条微博已关闭评论或不再公开。',
    INVALID_PATH: '找不到这条微博，刷新页面后再试。',
    VALIDATION_ERROR: '评论内容不符合站点要求，请检查字数后重试。'
  };
  for (const panel of panels) {
    const card = panel.closest('.says-card');
    const toggle = card.querySelector('[data-comment-toggle]');
    const composer = panel.querySelector('[data-comment-form]');
    const home = panel.querySelector('[data-comment-compose-home]');
    const textarea = composer.elements.comment;
    const submit = composer.querySelector('[type=submit]');
    const caption = composer.querySelector('[data-comment-reply-caption]');
    const status = panel.querySelector('[data-comment-status]');
    const drafts = new Map();
    let active, busy = false, uncertain = false;

    function closeComposer({discard = false, focus = false} = {}) {
      if (!active) return;
      const {key, button} = active;
      if (discard) drafts.delete(key);
      else drafts.set(key, textarea.value);
      button.setAttribute('aria-expanded', 'false');
      composer.hidden = true;
      home.appendChild(composer);
      active = null;
      if (focus) button.focus();
    }
    function openComposer(button, row, focus = true) {
      if (busy) return;
      if (active?.button === button) { closeComposer({focus}); return; }
      closeComposer();
      const key = row?.dataset.commentId || '';
      active = {key, row, button};
      button.setAttribute('aria-expanded', 'true');
      if (row) row.nextElementSibling.appendChild(composer);
      composer.toggleAttribute('data-replying', Boolean(row));
      caption.hidden = !row;
      const nick = row?.dataset.commentNick;
      caption.querySelector('[data-comment-addressee]').textContent = row ? '回复 @' + nick : '';
      textarea.setAttribute('aria-label', row ? '回复 ' + nick : '评论');
      textarea.placeholder = row ? '写下你的回复…' : '写下你的评论…';
      textarea.value = drafts.get(key) || '';
      submit.textContent = signedIn ? row ? '回复' : '评论' : '登录后评论';
      composer.hidden = false;
      if (!uncertain) status.textContent = '';
      if (focus) (signedIn ? textarea : submit).focus();
    }

    toggle.addEventListener('click', () => openComposer(toggle));
    panel.addEventListener('click', event => {
      const reply = event.target.closest('[data-comment-reply]');
      const row = event.target.closest('[data-comment-row]');
      if (!row) return;
      panel.querySelector('[data-comment-active]')?.removeAttribute('data-comment-active');
      row.setAttribute('data-comment-active', '');
      if (reply) openComposer(reply, row);
    });
    composer.querySelector('[data-comment-cancel]').addEventListener('click', () => {
      if (!busy) closeComposer({focus: true});
    });
    composer.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); closeComposer({focus: true}); }
    });
    if (location.hash === '#' + card.id) {
      openComposer(toggle, null, false);
    } else if (location.hash.startsWith('#' + card.id + '-comment-')) {
      const row = document.getElementById(location.hash.slice(1));
      if (row?.matches('[data-comment-row]') && panel.contains(row)) {
        openComposer(row.querySelector('[data-comment-reply]'), row, false);
      }
    }

    composer.addEventListener('submit', async event => {
      event.preventDefault();
      if (!active || busy || uncertain) return;
      busy = true;
      submit.disabled = true;
      status.textContent = '';
      let sent = false;
      try {
        if (!await checkSession()) {
          location.assign(commentLoginUrl(location.pathname, location.search, active.row?.id || card.id));
          return;
        }
        const comment = textarea.value.trim();
        if (!comment) { status.textContent = '请输入评论内容。'; textarea.focus(); return; }
        const data = {comment, url: panel.dataset.commentPath};
        if (active.row) {
          data.pid = active.row.dataset.commentId;
          data.rid = active.row.dataset.commentRoot;
        }
        sent = true;
        const saved = await walineRequest('comment', data);
        if (!saved?.objectId) throw new Error('comment');
        const approved = saved.status === 'approved';
        closeComposer({discard: true});
        toggle.focus();
        status.textContent = approved ? '评论已发表。' : '评论已提交，审核通过后显示。';
        try {
          await refreshThread(card, panel, toggle);
        } catch {
          status.textContent += ' 列表暂时无法更新，可刷新页面查看。';
        }
      } catch (error) {
        if (!sent) status.textContent = '暂时无法确认登录状态，请重试。';
        else if (error.status === 401 || error.code === 'UNAUTHORIZED') {
          setSignedIn(false);
          status.textContent = '登录已失效，请重新登录。';
        } else if (error.status >= 400 && error.status < 500) {
          status.textContent = commentErrors[error.code] || '评论未发送，请确认登录状态和内容后重试。';
        } else {
          uncertain = true;
          status.textContent = '发送结果未确认，内容已保留。请刷新页面核对后再试。';
        }
      } finally {
        busy = false;
        submit.disabled = uncertain;
      }
    });
  }

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
