// Real Next.js UI -> real NestJS -> dedicated P3 database. No API response mocking.
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const { spawn } = require('node:child_process');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const settings = JSON.parse(process.env.ADMIN_DETAILS_BROWSER_SETTINGS || '{}');
  if (!/^brewlite_auth_test_/.test(settings.schema ?? '') || !['localhost', '127.0.0.1'].includes(new URL(settings.api).hostname)) throw new Error('A dedicated test backend is mandatory');
  const edge = process.env.BREWLITE_EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brewlite-admin-details-browser-'));
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
    const screenshot = async (name, width, height, mobile) => { await call('Emulation.setDeviceMetricsOverride', { width, height, mobile, deviceScaleFactor: 1 }); await pause(400); const metrics = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})'); if (metrics.scroll > metrics.width) throw new Error(`Horizontal overflow: ${name}`); const dialogFits = await evaluate('(()=>{return Array.from(document.querySelectorAll("dialog[open]")).every(d=>{const r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && d.scrollWidth<=d.clientWidth+1;});})()'); if (!dialogFits) throw new Error(`Dialog overflow: ${name}`); const result = await call('Page.captureScreenshot', { format: 'png' }); const filename = path.join(os.tmpdir(), `brewlite-admin-${name}.png`); fs.writeFileSync(filename, Buffer.from(result.data, 'base64')); console.log(JSON.stringify({ screen: name, ...metrics, screenshot: filename })); };
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, mobile: false, deviceScaleFactor: 1 });
    await navigate('/login');
    await wait("document.querySelector('#auth-email') && Object.keys(document.querySelector('#auth-email')).some(key=>key.startsWith('__reactProps'))", 'admin login hydrated');
    await fill('#auth-email', settings.admin); await fill('#auth-password', settings.password);
    await evaluate("document.querySelector('#auth-password').closest('form').requestSubmit()");
    await wait("location.pathname==='/'", 'admin login');
    await navigate('/admin');
    await wait("document.querySelector('.admin-overview')", 'admin dashboard');
    await evaluate("Array.from(document.querySelectorAll('.admin-sidebar button')).find(e=>e.textContent.trim()==='Giám sát đơn').click()");
    await wait(`Array.from(document.querySelectorAll('.order-monitor-main-row')).some(e=>e.textContent.includes(${JSON.stringify(settings.orderCode)}))`, 'order loaded');
    await evaluate(`Array.from(document.querySelectorAll('.order-monitor-main-row')).find(e=>e.textContent.includes(${JSON.stringify(settings.orderCode)})).click()`);
    await wait("document.querySelector('.admin-order-detail-dialog[open] .admin-order-people')", 'order details');
    await screenshot('order-desktop', 1440, 1000, false);
    await screenshot('order-mobile', 390, 844, true);
    await click('[aria-label^="Xem tài khoản nhân viên"]');
    await wait("document.querySelector('.admin-staff-activity') && document.body.innerText.includes('Đơn từng tham gia')", 'staff profile and activity');
    await screenshot('staff-profile-mobile', 390, 844, true);
    await screenshot('staff-profile-desktop', 1440, 1000, false);
    await click('.account-staff-event');
    await wait("Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-order-people') && Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-order-payments')", 'staff event opens the same full order detail');
    await screenshot('staff-order-desktop', 1440, 1000, false);
    await screenshot('staff-order-mobile', 390, 844, true);
    await click('.admin-order-back');
    await wait("document.querySelector('.account-profile-head h2')?.textContent==='Chi tiết nhân viên' && document.querySelector('.account-staff-event')", 'back to staff profile');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await wait("document.querySelectorAll('dialog[open]').length===1 && document.querySelector('.admin-order-detail-dialog[open]')", 'Escape returns to order only');
    await click('[aria-label^="Xem tài khoản khách hàng"]');
    await wait("Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.account-stat-grid button') && Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.account-order-row')", 'customer profile');
    await screenshot('customer-profile-desktop', 1440, 1000, false);
    await screenshot('customer-profile-mobile', 390, 844, true);
    const differentOrder = await evaluate(`Array.from(document.querySelectorAll('.account-order-row')).find(e=>e.title!==${JSON.stringify(settings.orderCode)})?.title`);
    if (!differentOrder) throw new Error('A different fixture order is required');
    await evaluate(`Array.from(document.querySelectorAll('.account-order-row')).find(e=>e.title===${JSON.stringify(differentOrder)}).click()`);
    await wait(`Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-order-meta strong')?.textContent===${JSON.stringify(differentOrder)}`, 'customer selects a different full order');
    await wait("Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-order-timeline')", 'full state history is reused');
    if (await evaluate("document.body.innerText.includes('Tóm tắt đơn hàng')")) throw new Error('Old summary view still rendered');
    await screenshot('customer-other-order-desktop', 1440, 1000, false);
    await screenshot('customer-other-order-mobile', 390, 844, true);
    await click('.admin-order-back');
    await wait("document.querySelector('.account-profile-head h2')?.textContent==='Chi tiết tài khoản'", 'back to customer profile');
    await click('.account-view-all');
    await wait("document.querySelector('.admin-order-filters')", 'all customer orders');
    await evaluate("Array.from(document.querySelectorAll('.admin-order-filters button')).find(e=>e.textContent==='Hoàn tất').click()");
    await wait("document.querySelector('.account-order-row .status-completed')", 'completed order filter');
    await click('.account-order-row');
    await wait("Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-order-people')", 'filtered order detail');
    await evaluate("Array.from(document.querySelectorAll('dialog[open]')).at(-1).querySelector('[aria-label^=\"Xem tài khoản nhân viên\"]').click()");
    await wait("document.querySelectorAll('dialog[open]').length===3 && Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-staff-activity')", 'shared order detail also links to a different staff account');
    await screenshot('staff-from-customer-order-mobile', 390, 844, true);
    await evaluate("Array.from(document.querySelectorAll('dialog[open]')).at(-1).querySelector('[aria-label=\"Đóng chi tiết tài khoản\"]').click()");
    await wait("document.querySelectorAll('dialog[open]').length===2 && Array.from(document.querySelectorAll('dialog[open]')).at(-1)?.querySelector('.admin-order-people')", 'close staff account returns to selected full order');

    await click('.admin-order-back');
    await wait("Array.from(document.querySelectorAll('.admin-order-filters button')).some(e=>e.textContent==='Hoàn tất' && e.getAttribute('aria-pressed')==='true') && document.querySelector('.account-order-row')", 'back keeps the selected filter');
    await screenshot('customer-filtered-list-mobile', 390, 844, true);
    await click('.account-profile-icon[aria-label="Quay lại"]');
    await wait("document.querySelector('.account-profile-head h2')?.textContent==='Chi tiết tài khoản'", 'list back to profile');
    await click('[aria-label="Đóng chi tiết tài khoản"]');
    await wait("document.querySelectorAll('dialog[open]').length===1", 'customer profile closes without closing order');
    await click('[aria-label="Đóng chi tiết đơn hàng"]');
    await wait("document.querySelectorAll('dialog[open]').length===0", 'order closed');
    if (errors.length) { console.error(JSON.stringify({ errors })); throw new Error('Browser runtime/hydration errors'); }
    console.log(JSON.stringify({ browserFlow: 'shared full order detail from staff/customer profiles, other-order selection and filter-preserving back passed', realBackendRequests: requests, runtimeExceptions: 0 }));
    await call('Browser.close', {}, null);
  } finally { socket?.close(); if (processEdge.exitCode === null) processEdge.kill(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
