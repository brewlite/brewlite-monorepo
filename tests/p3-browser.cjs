// Real Next.js UI -> real NestJS -> dedicated P3 database. No API response mocking.
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const { spawn } = require('node:child_process');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const settings = JSON.parse(process.env.P3_BROWSER_SETTINGS || '{}');
  if (!/^brewlite_(p3|stage2)_test_/.test(settings.database ?? '')) throw new Error('A dedicated test backend is mandatory');
  const edge = process.env.BREWLITE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brewlite-p3-browser-'));
  const processEdge = spawn(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const file = path.join(profile, 'DevToolsActivePort'); for (let i = 0; i < 100 && !fs.existsSync(file); i++) await pause(100);
    const [port, endpoint] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/); socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const pending = new Map(); const errors = []; let sequence = 0; let requests = 0; let session;
    function call(method, params = {}, sessionId = session) { return new Promise((resolve, reject) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser timeout: ${method}`)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); }); }
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) { const item = pending.get(message.id); if (item) { clearTimeout(item.timer); pending.delete(message.id); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); } }
      else if (message.method === 'Runtime.exceptionThrown') errors.push(String(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text).replace(/https?:\/\/\S+/g, '[url]').slice(0, 700));
      else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error' && message.params.args.some((a) => /hydration|did not match/i.test(String(a.value ?? a.description)))) errors.push(message.params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ').replace(/https?:\/\/\S+/g, '[url]').slice(0, 4000));
      else if (message.method === 'Fetch.requestPaused') {
        // Redirect transport only. Every business response comes from the real isolated Nest app.
        const original = new URL(message.params.request.url); const destination = new URL(settings.api);
        if (original.hostname === 'sandbox.vnpayment.vn') {
          void call('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Aborted' }, message.sessionId);
          return;
        }
        original.protocol = destination.protocol; original.host = destination.host;
        requests++;
        void call('Fetch.continueRequest', { requestId: message.params.requestId, url: original.toString() }, message.sessionId).catch(() => errors.push('transport redirect failed'));
      }
    });
    const target = await call('Target.createTarget', { url: 'about:blank' }); session = (await call('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    await call('Page.enable'); await call('Runtime.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*' }, { urlPattern: 'https://sandbox.vnpayment.vn/paymentv2/*' }] });
    const evaluate = async (expression) => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error('Browser evaluation failed'); return result.result.value; };
    const wait = async (expression, label) => { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(200); } console.error(JSON.stringify({ label, text: await evaluate('document.body.innerText.slice(-2200)'), requests })); throw new Error(`UI condition failed: ${label}`); };
    const navigate = async (pathname) => { await call('Page.navigate', { url: (settings.frontend || 'http://localhost:3000') + pathname }); };
    const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.click()`);
    const fill = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error();Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const screenshot = async (name, width, height, mobile) => { await call('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 }); await pause(400); const metrics = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})'); if (metrics.scroll > metrics.width) throw new Error(`Horizontal overflow: ${name}`); const dialogFits = await evaluate('(()=>{const d=document.querySelector("dialog[open]");if(!d)return true;const r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && d.scrollWidth<=d.clientWidth+1;})()'); if (!dialogFits) throw new Error(`Dialog overflow: ${name}`); const result = await call('Page.captureScreenshot', { format: 'png' }); const filename = path.join(os.tmpdir(), `brewlite-p3-${name}.png`); fs.writeFileSync(filename, Buffer.from(result.data, 'base64')); console.log(JSON.stringify({ screen: name, ...metrics, screenshot: filename })); };
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 });
    if (settings.stage2) {
      await navigate('/login');
      await wait("document.querySelector('#auth-email') && Object.keys(document.querySelector('#auth-email')).some(key=>key.startsWith('__reactProps'))", 'checkout login hydrated');
      await fill('#auth-email', settings.customer); await fill('#auth-password', settings.password);
      await evaluate("document.querySelector('#auth-password').closest('form').requestSubmit()"); await wait("location.pathname==='/'", 'checkout login');
      await navigate('/products/' + settings.productId); await wait("document.querySelector('.add-bag')", 'test product detail');
      await evaluate("Array.from(document.querySelectorAll('.choice-row button')).find(e=>e.textContent.trim().startsWith('M ·')).click()");
      await wait("!document.querySelector('.add-bag').disabled", 'configured stock ready');
      await fill('#note', 'Stage2 browser note'); await click('.choice-row input[type=checkbox]'); await click('.add-bag');
      await wait("document.querySelector('.cart-success')", 'server cart add'); await navigate('/cart');
      await wait("document.querySelector('.cart-sheet-name')", 'server cart loaded');
      await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.trim()==='Xác nhận mua').click()");
      await wait("document.querySelector('#purchase-coupon')", 'checkout loaded');
      await screenshot('checkout-desktop', 1440, 1000, false); await screenshot('checkout-mobile', 390, 844, true);
      await wait("Array.from(document.querySelectorAll('dialog button')).some(e=>e.textContent==='Xác nhận mua' && !e.disabled)", 'quote confirmed');
      await evaluate("Array.from(document.querySelectorAll('dialog button')).find(e=>e.textContent==='Xác nhận mua').click()");
      await wait("location.pathname.startsWith('/orders/') && document.body.innerText.includes('Ví mô phỏng')", 'Order created pending payment');
      const orderPath = await evaluate('location.pathname');
      await screenshot('order-detail-desktop', 1440, 1000, false); await screenshot('order-detail-mobile', 390, 844, true);
      await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent.includes('Thanh toán bằng Ví mô phỏng')).click()");
      await wait("document.body.innerText.includes('Đã thanh toán')", 'mock backend confirmed PAID');
      await wait("location.pathname==='/payments/result' && location.search.includes('paymentId=')", 'automatic payment result');
      const resultPath = await evaluate('location.pathname + location.search');
      await navigate(orderPath); await wait("document.body.innerText.includes('Đã thanh toán')", 'payment recorded');
      await navigate(resultPath);
      await wait("document.body.innerText.includes('Thanh toán thành công')", 'backend confirmed success');
      await screenshot('payment-result-mobile', 390, 844, true); await screenshot('payment-result-desktop', 1440, 1000, false);
      await navigate('/orders'); await wait("document.body.innerText.includes('Đã thanh toán')", 'order history paid');
      await screenshot('order-history-mobile', 390, 844, true); await screenshot('order-history-desktop', 1440, 1000, false);
      await navigate(orderPath);
      await wait("Array.from(document.querySelectorAll('button')).some(e=>e.textContent==='Hủy đơn và hoàn tiền mô phỏng')", 'paid mock cancellation available');
      await evaluate("Array.from(document.querySelectorAll('button')).find(e=>e.textContent==='Hủy đơn và hoàn tiền mô phỏng').click()");
      await wait("document.querySelector('dialog[open] .refund-confirmation')", 'native paid cancellation confirmation');
      await screenshot('refund-confirm-desktop', 1440, 1000, false); await screenshot('refund-confirm-mobile', 390, 844, true);
      await evaluate("Array.from(document.querySelectorAll('dialog button')).find(e=>e.textContent==='Hủy và hoàn tiền mô phỏng').click()");
      await wait("document.body.innerText.includes('Đã hoàn tiền mô phỏng:')", 'backend confirmed refund');
      await screenshot('refund-result-desktop', 1440, 1000, false); await screenshot('refund-result-mobile', 390, 844, true);
      await navigate(resultPath);
      await wait("document.querySelector('h1')?.textContent==='Đã hoàn tiền mô phỏng'", 'original success payment shows separate verified refund');
      await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 });
      // Returning through Next navigation must not inherit the cached order page's layout.

      await evaluate("Array.from(document.querySelectorAll('.nav-link[href=\"/menu\"]')).find(e=>e.getBoundingClientRect().width>0).click()");
      await wait("location.pathname==='/menu' && document.querySelector('.menu-shop .container')", 'return to menu');
      await pause(300);
      const menuMetrics = () => evaluate("(()=>{const e=Array.from(document.querySelectorAll('.menu-shop .container')).find(e=>e.getBoundingClientRect().width>0);const r=e.getBoundingClientRect();return {x:r.x,width:r.width,zoom:getComputedStyle(document.documentElement).zoom,font:getComputedStyle(e).fontSize}})()");
      const returnedMenu = await menuMetrics();
      await navigate('/menu');
      await wait("document.querySelector('.menu-shop .container')", 'direct menu load');
      await pause(300);
      const directMenu = await menuMetrics();
      if (Math.abs(returnedMenu.x-directMenu.x)>1 || Math.abs(returnedMenu.width-directMenu.width)>1 || returnedMenu.zoom!==directMenu.zoom || returnedMenu.font!==directMenu.font) throw new Error('Menu scale changed after returning from order history');
      console.log(JSON.stringify({ menuNavigationScale: 'passed', returnedMenu, directMenu }));
      if (errors.length) { console.error(JSON.stringify({ browserErrors: errors })); throw new Error('Runtime/hydration error in Checkout UI'); }
      console.log(JSON.stringify({ stage2Browser: 'passed', realBackendRequests: requests, gatewayNetwork: 'blocked; backend mock wallet only', runtimeExceptions: 0 }));
      await call('Browser.close', {}, null); return;
    }
    await navigate('/products/' + settings.productId);
    await wait("document.querySelector('.add-bag')", 'guest product loaded from test database');
    await evaluate("Array.from(document.querySelectorAll('.choice-row button')).find(e=>e.textContent.trim().startsWith('M ·')).click()");
    await wait("!document.querySelector('.add-bag').disabled", 'available size selected');
    if (!await evaluate("document.body.innerText.includes('P3 Browser Drink')") || !requests) throw new Error('Test backend not confirmed; refusing actions');
    await screenshot('detail-desktop', 1440, 1000, false); await screenshot('detail-mobile', 390, 844, true);
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 });
    await fill('#note', 'P3 guest note'); await click('.add-bag');
    await wait("document.querySelector('.cart-success')", 'guest addition');
    if (!await evaluate(`location.pathname===${JSON.stringify('/products/' + settings.productId)}`)) throw new Error('Add automatically navigated to cart');
    await navigate('/login'); await wait("document.querySelector('#auth-email')", 'login');
    async function login(email) {
      await wait("Object.keys(document.querySelector('#auth-email')).some(key=>key.startsWith('__reactProps'))", 'login hydrated');
      await fill('#auth-email', email); await fill('#auth-password', settings.password);
      await evaluate("document.querySelector('#auth-password').closest('form').requestSubmit()");
      await wait("location.pathname==='/'", 'login completed');
    }
    await login(settings.customer);
    await wait("JSON.parse(sessionStorage.getItem('brewlite-config-cart')||'[]').length===0", 'guest merge acknowledged');
    await navigate('/menu'); await wait("document.body.innerText.includes('P3 Browser Drink')", 'menu loaded');
    await screenshot('menu-desktop', 1440, 1000, false); await screenshot('menu-mobile', 390, 844, true);
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 });
    await navigate('/cart'); await wait("document.querySelector('.cart-sheet-name')?.textContent.includes('P3 Browser Drink')", 'database cart reload');
    await click('.cart-edit'); await wait("document.querySelector('.add-bag')?.textContent.includes('Lưu thay đổi') && !document.querySelector('.add-bag').disabled", 'edit existing line');
    await evaluate("Array.from(document.querySelectorAll('.choice-row button')).find(e=>e.textContent.trim().startsWith('L ·')).click()");
    await fill('#quantity', '2'); await fill('#note', 'P3 edited'); await click('.add-bag'); await wait("location.pathname==='/cart' && document.body.innerText.includes('P3 edited')", 'edit persisted');
    await screenshot('cart-desktop', 1440, 1000, false); await screenshot('cart-mobile', 390, 844, true);
    await click('[aria-label="Xóa P3 Browser Drink"]'); await wait("document.querySelector('[aria-label=\"Xác nhận xóa món\"]')", 'remove confirmation');
    await evaluate("Array.from(document.querySelectorAll('dialog button')).find(e=>e.textContent.trim()==='Xóa món').click()");
    await wait("document.body.innerText.includes('Giỏ hàng đang chờ món đầu tiên')", 'delete persisted');
    await navigate('/login'); await wait("document.querySelector('#auth-email')", 'admin login'); await login(settings.admin);
    await navigate('/admin'); await wait("document.querySelector('.admin-overview')", 'admin hydrated and dashboard loaded');
    await evaluate("Array.from(document.querySelectorAll('.admin-function-card')).find(e=>e.textContent.includes('Size và tồn kho')).click()");
    await wait("document.body.innerText.includes('Chưa nhập tồn kho') && document.querySelector('[aria-label=\"Tồn thực tế M\"]')", 'inventory table and NULL label');
    await fill('.inventory-filters input', 'No matching product');
    await wait("document.querySelectorAll('tbody tr').length===0", 'inventory search filters rows');
    await fill('.inventory-filters input', 'P3 Browser Drink');
    await wait("document.querySelector('[aria-label=\"Tồn thực tế M\"]')", 'inventory search restores rows');
    if (!await evaluate("document.querySelector('[aria-label=\"Tồn thực tế Uninitialized\"]').value===''")) throw new Error('Uninitialized stock input was invented');
    await fill('[aria-label="Tồn thực tế M"]', '55'); await evaluate("document.querySelector('[aria-label=\"Tồn thực tế M\"]').closest('form').requestSubmit()");
    await wait("document.querySelector('[aria-label=\"Xác nhận cập nhật tồn kho\"]')", 'inventory confirmation');
    await evaluate("Array.from(document.querySelectorAll('dialog button')).find(e=>e.textContent==='Xác nhận lưu').click()");
    await wait("Array.from(document.querySelectorAll('tbody tr')).some(r=>r.cells[0]?.textContent==='M' && r.textContent.includes('55'))", 'ADMIN inventory saved');
    await screenshot('inventory-mobile', 390, 844, true); await screenshot('inventory-desktop', 1440, 1000, false);
    if (errors.length) throw new Error('Browser runtime/hydration errors');
    console.log(JSON.stringify({ browserFlow: 'passed', realBackendRequests: requests, runtimeExceptions: 0 }));
    await call('Browser.close', {}, null);
  } finally { socket?.close(); if (processEdge.exitCode === null) processEdge.kill(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
