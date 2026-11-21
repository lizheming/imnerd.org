'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const ThinkViewEta = require('think-view-eta');
const Widget = require('../say-comments');

const time = '2026-11-20T01:16:00Z';
const theme = path.resolve(__dirname, '..');
const rows = [
  {id: 9, post_id: 7, user_id: '5', comment: 'nested reply', pid: '8', rid: '6', inserted_at: time, status: 'approved'},
  {id: 8, post_id: 7, nick: '阿鹤', comment: 'child reply', pid: '6', rid: '6', inserted_at: time, status: 'approved'},
  {id: 6, post_id: 7, user_id: '5', nick: 'old name', comment: '<script>alert(1)</script>', inserted_at: time, status: 'approved', sticky: 1, mail: 'private@example.invalid'},
  {id: 4, post_id: 7, nick: '等待者', comment: 'waiting', inserted_at: time, status: 'waiting'},
  {id: 3, post_id: 7, nick: '垃圾', comment: 'spam', inserted_at: time, status: 'spam'},
  {id: 2, post_id: 8, nick: '私密', comment: 'private', inserted_at: time, status: 'approved'},
  {id: 1, post_id: 9, nick: '关闭', comment: 'closed', inserted_at: time, status: 'approved'}
];
const eligible = {type: 3, status: 3, is_public: 1, allow_comment: 1};
const records = {
  post: [
    {...eligible, id: 7, pathname: 'say 生'},
    {...eligible, id: 8, pathname: 'private', is_public: 0},
    {...eligible, id: 9, pathname: 'closed', allow_comment: 0},
    {...eligible, id: 10, pathname: 'protected', options: '{"postPasswordHash":"not-public"}'},
    {...eligible, id: 11, pathname: 'empty'}
  ],
  comment: rows,
  user: [{id: 5, display_name: '山雀', name: 'private-user-name', email: 'account@example.invalid'}],
  counter: [{url: '/says/7?pathname=say%2520%25E7%2594%259F&type=3', reaction0: '12'}]
};

function item(id, pathname, values = {}) {
  return {id, pathname, status: 'public', allowComments: true, ...values};
}
const items = [
  item(7, 'say 生'),
  item(8, 'private', {status: 'private'}),
  item(9, 'closed', {allowComments: false}),
  item(10, 'protected'),
  item(11, 'empty'),
  item(12, 'hidden', {status: 'hidden'}),
  item(13, '')
];
function modelFixture(data = records) {
  const calls = [];
  const model = name => ({
    setRelation() { return this; },
    where(where) { this.filters = where; return this; },
    field(field) { this.fields = field.split(','); return this; },
    order() { return this; },
    async select() {
      calls.push({name, filters: this.filters, fields: this.fields});
      if (data[name] instanceof Error) throw data[name];
      return data[name].filter(row => Object.entries(this.filters).every(([key, value]) => (
        Array.isArray(value) ? value[1].map(String).includes(String(row[key])) : value === row[key]
      ))).map(row => Object.fromEntries(this.fields.map(key => [key, row[key]])));
    },
    async find() { return {value: data.options?.[this.filters.key]}; }
  });
  return {model, calls};
}

test('batches visible post, approved comment, nickname and reaction0 reads; keeps replies in one level', async () => {
  const fixture = modelFixture();
  const widget = new Widget(fixture, {items});
  await widget.execute();
  const {entries, commentsUnavailable} = widget.row;
  assert.equal(commentsUnavailable, false);
  assert.equal(entries[7].likes, 12);
  assert.equal(entries[7].path, records.counter[0].url);
  assert.equal(entries[7].thread.count, 3);
  const [root] = entries[7].thread.roots;
  assert.equal(root.nick, '山雀');
  assert.deepEqual(root.children.map(reply => [reply.id, reply.rootId, reply.nick, reply.replyTo]), [
    ['8', '6', '阿鹤', '山雀'], ['9', '6', '山雀', '阿鹤']
  ]);
  assert.ok(!entries[8] && !entries[12] && !entries[13]);
  assert.equal(entries[9].thread, null);
  assert.equal(entries[9].likes, 0);
  assert.equal(entries[10].thread, null);
  assert.deepEqual(entries[11].thread, {count: 0, roots: []});
  assert.deepEqual(fixture.calls.map(call => call.name).sort(), ['comment', 'counter', 'post', 'user']);
  assert.deepEqual(fixture.calls.find(call => call.name === 'comment').filters, {post_id: ['IN', ['7', '11']], status: 'approved'});
  assert.doesNotMatch(JSON.stringify(entries), /example\.invalid|private-user-name|not-public|waiting|spam/);
});

test('fragment revalidates disabled, protected and private targets and plugin availability', async () => {
  for (const id of ['8', '9', '10', '99']) {
    const fixture = modelFixture();
    const widget = new Widget(fixture, {refreshId: id});
    await widget.execute();
    assert.deepEqual(widget.row.entries, {});
    assert.deepEqual(fixture.calls.map(call => call.name), ['post']);
  }
  const fixture = modelFixture({...records, options: {plugin_say_settings: '{"enabled":false}'}});
  const widget = new Widget(fixture, {refreshId: '7'});
  await widget.execute();
  assert.deepEqual(widget.row.entries, {});
  assert.deepEqual(fixture.calls, []);
});

test('reuses actual Eta fragment partial with escaped plaintext and no user fields', async () => {
  const fixture = modelFixture();
  const state = {};
  const ctx = {
    get: name => name === 'X-Eureka-Say-Comments' ? '7' : '',
    set: (key, value) => { state[key] = value; },
    vary: key => { state.vary = key; }
  };
  const data = {
    ctx,
    plugin: {say: {list: () => { throw Error('fragment must not load the whole Say list'); }}},
    widget: async (name, parameter) => {
      assert.equal(name, 'Widget_Eureka_SayComments');
      const widget = new Widget(fixture, parameter);
      await widget.execute();
      return widget;
    }
  };
  const file = path.join(theme, 'template/says.eta');
  const html = await new ThinkViewEta(file, data, {viewPath: theme, options: {varName: 'firekylin'}}).render();
  assert.match(html, /data-say-comment-list="7" data-count="3"/);
  assert.match(html, /山雀<\/strong>：<span>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/span>/);
  assert.match(html, /回复 阿鹤<\/span>：<span>nested reply<\/span>/);
  assert.match(html, /09:16/);
  assert.doesNotMatch(html, /<!doctype|<script>|example\.invalid|<img|waiting/);
  assert.deepEqual(state, {'Cache-Control': 'private, no-store', vary: 'X-Eureka-Say-Comments'});
  assert.deepEqual(fixture.calls.map(call => call.name), ['post', 'comment', 'user']);
});

test('comment read failure still preserves server-rendered like counts', async () => {
  const fixture = modelFixture({...records, comment: Error('storage unavailable')});
  const widget = new Widget(fixture, {items});
  await widget.execute();
  assert.equal(widget.row.commentsUnavailable, true);
  assert.equal(widget.row.entries[7].thread, null);
  assert.equal(widget.row.entries[7].likes, 12);
});

test('login return preserves the current page, query and exact Say or reply anchor', () => {
  const {commentLoginUrl} = require('../assets/js/says.js');
  for (const anchor of ['say-7', 'say-7-comment-8']) {
    const url = new URL(commentLoginUrl('/digu.html', '?page=3&from=%E9%B9%BF', anchor), 'https://example.invalid');
    assert.equal(url.pathname, '/admin/login');
    assert.equal(url.searchParams.get('redirect'), '/digu.html?page=3&from=%E9%B9%BF#' + anchor);
  }
});

test('drafts persist verbatim across page loads and are isolated by card and exact reply', () => {
  const {commentDraftStore} = require('../assets/js/says.js');
  const values = new Map();
  const storage = () => ({
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  });
  const firstPage = commentDraftStore(storage);
  firstPage.write('say-7', '  顶层\n带换行  ');
  firstPage.write('say-10', '另一条碎语');
  firstPage.write('say-7-comment-6', '回复楼主');
  firstPage.write('say-7-comment-8', '回复子评论');
  const nextPage = commentDraftStore(storage);
  assert.equal(nextPage.latest(), 'say-7-comment-8');
  assert.equal(nextPage.read('say-7'), '  顶层\n带换行  ');
  assert.equal(nextPage.read('say-10'), '另一条碎语');
  assert.equal(nextPage.read('say-7-comment-6'), '回复楼主');

  // A successful submission clears only the exact draft that was submitted.
  nextPage.clear('say-7-comment-8', '回复子评论');
  assert.equal(firstPage.read('say-7-comment-8'), '');
  assert.equal(firstPage.read('say-7-comment-6'), '回复楼主');
  assert.equal(firstPage.read('say-7'), '  顶层\n带换行  ');
  assert.equal(nextPage.latest(), null);

  // An older request must not erase text another tab saved later.
  firstPage.write('say-7', '另一标签页新输入');
  nextPage.clear('say-7', '  顶层\n带换行  ');
  assert.equal(nextPage.read('say-7'), '另一标签页新输入');
  nextPage.write('say-7', '');
  assert.equal(firstPage.read('say-7'), '');
  assert.equal(firstPage.latest(), null);
});

test('a blocked storage backend still keeps the current page usable', () => {
  const {commentDraftStore} = require('../assets/js/says.js');
  const drafts = commentDraftStore(() => { throw Error('localStorage is disabled'); });
  drafts.write('say-7', '本页草稿');
  assert.equal(drafts.read('say-7'), '本页草稿');
  assert.equal(drafts.latest(), 'say-7');
  drafts.clear('say-7', '本页草稿');
  assert.equal(drafts.read('say-7'), '');
  assert.equal(drafts.latest(), null);
});
