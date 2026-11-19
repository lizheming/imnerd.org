// Optional real-browser checks: install playwright and its Chromium first.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {render} = require('./says-fixture.cjs');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {})});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:960}});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const items=[{id:42,kind:'textpic',text:'今天散步，记录一些日常。\n两张照片，一段时光。',images:['https://example.test/a.svg','https://example.test/b.svg'],createdAt:'2026-11-19 12:00:00',commentCount:1}];
    const html=await render({identity:{loggedIn:true,canPublish:true,csrf:'fixture-csrf'},items});
    let requests=[], fail=false, reads=0;
    await page.route('https://example.test/**', async route => {
      const url=new URL(route.request().url());
      if(url.pathname.startsWith('/theme/eureka/')) {
        const file=path.resolve(__dirname,'../themes/eureka',url.pathname.slice('/theme/eureka/'.length));
        return fs.existsSync(file) ? route.fulfill({path:file}) : route.fulfill({status:404,body:''});
      }
      if(url.pathname.endsWith('.svg')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#83b5a1"/><circle cx="300" cy="200" r="95" fill="#e5eee7"/></svg>'});
      if(url.pathname.startsWith('/api/plugins/say/comments/')) { reads++; return route.fulfill({json:{success:true,data:{total:1,pageSize:20,items:[{nick:'访客',comment:'<script>unsafe()</script>'}]}}}); }
      if(url.pathname.startsWith('/admin/api/plugins/say/forms/')) {
        requests.push({body:route.request().postDataJSON(),csrf:route.request().headers()['x-csrf-token']});
        return route.fulfill({status:fail?500:200,json:fail?{errno:1}:{errno:0,data:{item:{id:100}}}});
      }
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.goto('https://example.test/page/says.html?page=2');
    await page.locator('[data-says-image]').first().click();
    assert.equal(await page.locator('dialog').evaluate(el=>el.open),true);
    await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('[data-lightbox-count]').textContent(),'2 / 2');
    await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog').evaluate(el=>el.open),false);
    await page.locator('[data-say-id]').click();
    await page.waitForFunction(()=>document.querySelector('.says-comment'));
    assert.equal(await page.locator('.says-comment p').textContent(),'<script>unsafe()</script>');
    await page.locator('[data-say-id]').click(); await page.locator('[data-say-id]').click(); assert.equal(reads,1);
    await page.locator('textarea').fill('私密测试'); await page.locator('[name=private]').check(); await page.locator('.says-publish').click();
    await page.waitForFunction(()=>document.querySelector('[data-publish-status]').textContent.includes('私密微博已发布'));
    assert.deepEqual(requests[0],{body:{text:'私密测试',status:'private',allowComments:false},csrf:'fixture-csrf'});
    assert.equal(await page.locator('textarea').inputValue(),'');
    fail=true; await page.locator('textarea').fill('保留内容'); await page.locator('.says-publish').click();
    await page.waitForFunction(()=>document.querySelector('[data-publish-status]').textContent.includes('发布结果未确认'));
    assert.equal(await page.locator('textarea').inputValue(),'保留内容'); assert.equal(requests.length,2);
    fail=false; await page.locator('[name=private]').uncheck(); await page.locator('.says-publish').click();
    await page.waitForURL('https://example.test/page/says.html');
    assert.equal(requests[2].body.status,'public'); assert.equal(requests[2].body.allowComments,true);
    await page.screenshot({path:process.env.SAYS_SCREENSHOT || '/tmp/eureka-says-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'/tmp/eureka-says-mobile.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: lightbox, inline comments, private/public publish, CSRF, failure recovery, mobile overflow.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
