'use strict';

const Widget = require('firekylin/src/widget/base');

function idOf(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? String(id) : '';
}

function interactionPath(item) {
  // Match the native Waline key and the previous Eureka client, including encoding.
  return encodeURI(`/says/${idOf(item.id)}?pathname=${encodeURIComponent(item.pathname)}&type=3`);
}

function isUnprotected(options) {
  try {
    const value = typeof options === 'string' ? JSON.parse(options) : options;
    return !value?.postPasswordHash;
  } catch {
    return false;
  }
}

function publicThreads(rows, users) {
  const names = new Map(users.map(user => [idOf(user.id), user.display_name || user.name]));
  const nickname = row => names.get(idOf(row.user_id)) || row.nick || '访客';
  const byId = new Map(rows.map(row => [idOf(row.id), row]));
  const entries = new Map();
  const publicRow = (row, rootId, parent) => ({
    id: idOf(row.id), rootId, nick: nickname(row), replyTo: parent,
    text: String(row.comment || ''), time: row.inserted_at
  });
  for (const row of rows) {
    if (!idOf(row.rid)) entries.set(idOf(row.id), {...publicRow(row, idOf(row.id), ''), children: []});
  }
  // Waline renders all replies in one level below their root, oldest first.
  for (const row of [...rows].reverse()) {
    const root = entries.get(idOf(row.rid));
    if (!root) continue;
    const parent = byId.get(idOf(row.pid));
    const sameThread = parent && (idOf(parent.rid) || idOf(parent.id)) === root.id;
    root.children.push(publicRow(row, root.id, sameThread ? nickname(parent) : '原评论'));
  }
  return {count: rows.length, roots: [...entries.values()]};
}

module.exports = class EurekaSayComments extends Widget {
  async execute() {
    const {items = [], refreshId} = this.parameter;
    // The page supplies the list (not request IDs) in a normal render. A fragment
    // explicitly checks the enabled plugin and the target again before reading it.
    const publicItems = items.filter(item => item.status === 'public' && item.pathname && idOf(item.id));
    const entries = Object.fromEntries(publicItems.map(item => [idOf(item.id), {
      path: interactionPath(item), likes: null, thread: null
    }]));
    const readThreads = async () => {
      let commentIds = publicItems.filter(item => item.allowComments).map(item => idOf(item.id));
      if (refreshId) {
        const {SayService} = require('firekylin-plugin-say/lib/say-service');
        const service = new SayService({getModel: name => this.model(name)});
        if (!(await service.settings()).enabled) return;
        commentIds = [idOf(refreshId)].filter(Boolean);
      }
      if (!commentIds.length) return;
      const posts = await this.model('post').setRelation(false).where({
        id: ['IN', commentIds], type: 3, status: 3, is_public: 1, allow_comment: 1
      }).field('id,pathname,options').select();
      const eligible = posts.filter(post => post.pathname && isUnprotected(post.options));
      if (!eligible.length) return;
      const byPost = new Map(eligible.map(post => [idOf(post.id), []]));
      const rows = await this.model('comment').where({
        post_id: ['IN', [...byPost.keys()]], status: 'approved'
      }).field('id,post_id,user_id,nick,comment,pid,rid,inserted_at,sticky')
        .order('inserted_at DESC,id DESC').select();
      for (const row of rows) if (idOf(row.id)) byPost.get(idOf(row.post_id))?.push(row);
      const userIds = [...new Set(rows.map(row => idOf(row.user_id)).filter(Boolean))];
      const users = userIds.length
        ? await this.model('user').where({id: ['IN', userIds]}).field('id,display_name,name').select()
        : [];
      for (const post of eligible) {
        const id = idOf(post.id);
        if (!entries[id]) entries[id] = {path: interactionPath(post), likes: null, thread: null};
        if (entries[id].path !== interactionPath(post)) continue;
        const comments = byPost.get(id);
        const thread = publicThreads(comments, users);
        const sticky = new Set(comments.filter(row => Number(row.sticky) > 0).map(row => idOf(row.id)));
        thread.roots.sort((a, b) => Number(sticky.has(b.id)) - Number(sticky.has(a.id)));
        entries[id].thread = thread;
      }
    };

    const readLikes = async () => {
      const byPath = new Map(Object.values(entries).map(entry => [entry.path, entry]));
      if (!byPath.size) return;
      const rows = await this.model('counter').where({url: ['IN', [...byPath.keys()]]})
        .field('url,reaction0').select();
      for (const entry of byPath.values()) entry.likes = 0;
      for (const row of rows) {
        const entry = byPath.get(row.url);
        if (entry) entry.likes = Math.max(0, Number(row.reaction0) || 0);
      }
    };

    const results = await Promise.allSettled([readThreads(), readLikes()]);
    this.push({entries, commentsUnavailable: results[0].status === 'rejected'});
  }
};
