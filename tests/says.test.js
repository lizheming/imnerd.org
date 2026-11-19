'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const auth = require('firekylin/src/service/admin-auth');
const {relativeTime, parseTime} = require('../themes/eureka/res/js/says');
const theme = path.resolve(__dirname, '../themes/eureka');

const {render} = require('./says-fixture.cjs');

test('relative times cover every boundary, Shanghai dates and past years', () => {
  const now = new Date('2026-11-19T12:00:00+08:00');
  for (const [seconds, expected] of [[0,'0秒前'],[59,'59秒前'],[60,'1分钟前'],[3599,'59分钟前'],[3600,'1小时前'],[86399,'23小时前'],[86400,'1天前'],[604799,'6天前'],[604800,'11月12日']]) {
    assert.equal(relativeTime(new Date(now-seconds*1000).toISOString(), now), expected);
  }
  assert.equal(relativeTime('2025-11-19 12:00:00', now), '2025年11月19日');
  assert.equal(relativeTime('invalid', now), '时间未知');
  assert.equal(relativeTime('2026-11-19 12:01:00', now), '0秒前');
  assert.equal(parseTime('2026-11-19 12:00:00').toISOString(), '2026-11-19T04:00:00.000Z');
});

test('real Eta layout renders guest, admin and nonadmin; Say pagination overrides page pagination', async () => {
  const guest = await render({page:2});
  assert.match(guest, />登录<\/a>/); assert.doesNotMatch(guest, /data-says-composer/);
  assert.match(guest, /href="\/page\/says.html\?page=3"/);
  assert.match(guest, /aria-current="page">2</);
  const admin = await render({identity:{loggedIn:true,canPublish:true,csrf:'signed-proof'}});
  assert.match(admin, /data-csrf="signed-proof"/); assert.match(admin, /name="private"/); assert.match(admin, />退出<\/a>/);
  const reader = await render({identity:{loggedIn:true,canPublish:false}});
  assert.match(reader, />退出<\/a>/); assert.doesNotMatch(reader, /data-says-composer/);
});

test('content is escaped, unsafe URLs omitted, image groups and comments are accessible', async () => {
  const html = await render({items:[{id:42,kind:'textpic',text:'<script>alert(1)</script>',images:['https://example.com/a.jpg','javascript:alert(1)','https://user:pass@example.com/x'],createdAt:'2026-11-19 12:00:00',commentCount:3}]});
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /javascript:alert|user:pass/);
  assert.match(html, /data-says-image/); assert.match(html, /aria-controls="say-comments-42"/);
  assert.match(html, /data-comment-count>3</);
});

test('empty, unavailable and deleted last page render gracefully', async () => {
  assert.match(await render({total:0}), /暂无微博/);
  assert.match(await render({missing:true}), /微博暂时无法加载/);
  assert.match(await render({list:async()=>{throw new Error('database detail')}}), /微博暂时无法加载/);
  const calls=[];
  const html=await render({page:99,list:async args=>{calls.push(Number(args.page));return {items:[],page:Number(args.page),pageSize:10,total:11}}});
  assert.deepEqual(calls,[99,2]); assert.match(html,/aria-current="page">2</);
});

test('session widget verifies signed token and current database role/status, sets private caching', async () => {
  const secret='test-only-secret-32-characters-long';
  async function session(token, user) {
    let value; const headers={};
    class Widget {push(row){value=row} model(name){return name==='options'?{getOptions:async()=>({jwt_secret:secret})}:{where:()=>({field:()=>({find:async()=>user})})}}}
    const Session=require('../widgets/say-session')({Widget}); const widget=new Session();
    widget.ctx={state:{},cookie:()=>token,set:(key,v)=>headers[key]=v,vary:v=>headers.Vary=v};
    await widget.execute(); assert.equal(headers['Cache-Control'],'private, no-store'); assert.equal(headers.Vary,'Cookie'); return value;
  }
  const admin=auth.sign({id:1,type:1},secret);
  assert.equal((await session(admin,{id:1,type:1,status:1})).canPublish,true);
  assert.equal((await session(admin,{id:1,type:2,status:1})).canPublish,false);
  assert.equal((await session(admin,{id:1,type:1,status:0})).loggedIn,false);
  for(const token of ['',admin+'tamper',auth.sign({id:1,type:1},secret,-1)]) {
    assert.deepEqual(await session(token,{id:1,type:1,status:1}),{loggedIn:false,canPublish:false,csrf:''});
  }
  for(const type of [2,4]) assert.equal((await session(auth.sign({id:2,type},secret),{id:2,type,status:1})).canPublish,false);
});

test('committed browser assets match editable sources', () => {
  for(const [type,file] of [['js','says.js'],['css','says.css']]) assert.equal(fs.readFileSync(path.join(theme,'assets',type,file),'utf8'),fs.readFileSync(path.join(theme,'res',type,file),'utf8'));
});
