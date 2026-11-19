'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {render} = require('./says-fixture.cjs');
const script = fs.readFileSync(path.resolve(__dirname, '../themes/eureka/res/js/says.js'), 'utf8');

test('browser script: publish payload, duplicate prevention, failure preservation, comments and lightbox', async () => {
  const html = await render({identity:{loggedIn:true,canPublish:true,csrf:'fixture-proof'},items:[{id:42,kind:'image',images:['https://example.test/a.jpg','https://example.test/b.jpg'],createdAt:'2026-11-19 12:00:00'}]});
  const dom = new JSDOM(html,{url:'https://example.test/page/says.html',runScripts:'outside-only'});
  const {window} = dom; const doc=window.document;
  try {
    const dialog=doc.querySelector('dialog');
    dialog.showModal=()=>dialog.open=true; dialog.close=()=>{dialog.open=false;dialog.dispatchEvent(new window.Event('close'))};
    let pending, calls=[];
    window.fetch=(url,options)=>{calls.push({url,options});return new Promise(resolve=>pending=resolve)};
    window.eval(script);
    const form=doc.querySelector('form[data-says-composer]'), input=form.elements.text, privateBox=form.elements.private;
    // Native named form controls are exposed as properties in browsers; jsdom exposes them through namedItem.
    const submit=()=>form.dispatchEvent(new window.Event('submit',{cancelable:true}));
    const flush=()=>new Promise(resolve=>setImmediate(resolve));
    input.value='  私密测试  '; privateBox.checked=true;
    submit();submit(); assert.equal(calls.length,1);
    assert.equal(calls[0].options.headers['X-CSRF-Token'],'fixture-proof');
    assert.deepEqual(JSON.parse(calls[0].options.body),{text:'私密测试',status:'private',allowComments:false});
    pending({ok:true,status:200,json:async()=>({errno:0,data:{item:{id:43}}})}); await flush();
    assert.equal(input.value,''); assert.match(doc.querySelector('[data-publish-status]').textContent,/私密微博已发布/);
    input.value='不要丢失';privateBox.checked=false;submit();
    assert.deepEqual(JSON.parse(calls[1].options.body),{text:'不要丢失',status:'public',allowComments:true});
    pending({ok:false,status:500,json:async()=>({errno:1})});await flush();
    assert.equal(input.value,'不要丢失');assert.match(doc.querySelector('[data-publish-status]').textContent,/避免重复发布/);
    assert.equal(form.querySelector('button').disabled,false);
    submit();pending({ok:false,status:403,json:async()=>({errno:1})});await flush();
    assert.match(doc.querySelector('[data-publish-status]').textContent,/重新登录/);
    const toggle=doc.querySelector('[data-say-id]'); toggle.click();
    assert.equal(calls[3].url,'/api/plugins/say/comments/42?page=1');
    pending({ok:true,status:200,json:async()=>({success:true,data:{total:1,pageSize:20,items:[{nick:'访客',comment:'<script>bad()</script>'}]}})});await flush();
    assert.equal(doc.querySelector('.says-comment p').textContent,'<script>bad()</script>');
    assert.equal(doc.querySelector('.says-comment script'),null);
    toggle.click(); assert.equal(doc.querySelector('[data-comments-panel]').hidden,true);
    toggle.click(); assert.equal(calls.length,4);
    doc.querySelector('[data-says-image]').click();assert.equal(dialog.open,true);
    doc.querySelector('[data-lightbox-next]').click();assert.equal(doc.querySelector('[data-lightbox-count]').textContent,'2 / 2');
    doc.querySelector('[data-lightbox-close]').click();assert.equal(dialog.open,false);
  } finally { window.close(); }
});
