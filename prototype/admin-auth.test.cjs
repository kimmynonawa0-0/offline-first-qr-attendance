const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = readFileSync(join(__dirname, 'script.js'), 'utf8');
const html = readFileSync(join(__dirname, 'index.html'), 'utf8');

function setup(storage = new Map()) {
    const elements = new Map();
    for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
        const classes = new Set();
        elements.set(id, {
            value: '', textContent: '', innerText: '', style: {}, open: false,
            classList: {
                add: value => classes.add(value),
                remove: value => classes.delete(value),
                contains: value => classes.has(value),
                toggle: (value, force) => force ? classes.add(value) : classes.delete(value)
            },
            focus() {},
            showModal() { this.open = true; },
            close() { this.open = false; },
            querySelector() { return { focus() {} }; },
            reset() {
                const form = html.match(new RegExp(`<form id="${id}"[\\s\\S]*?</form>`));
                for (const [, inputId] of (form?.[0] || '').matchAll(/<input[^>]*id="([^"]+)"/g)) {
                    elements.get(inputId).value = '';
                }
            }
        });
    }
    const context = vm.createContext({
        document: {
            getElementById(id) {
                assert.ok(elements.has(id), `Missing HTML element: ${id}`);
                return elements.get(id);
            },
            addEventListener() {},
            querySelectorAll() { return []; }
        },
        window: { addEventListener() {} },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value)
        },
        crypto: webcrypto,
        setTimeout() {}, clearTimeout() {},
    });
    vm.runInContext(source, context);
    return {
        storage,
        element: id => elements.get(id),
        set: (id, value) => { elements.get(id).value = value; },
        run: code => vm.runInContext(code, context),
        call: name => context[name]({ preventDefault() {} }),
        error: () => elements.get('admin-signup-error').textContent,
        verify(email = 'test@example.com') {
            context.openAdminSignup();
            elements.get('admin-signup-email').value = email;
            context.handleAdminEmail({ preventDefault() {} });
            context.handleAdminKey({ preventDefault() {} });
        },
        details(id = '2026-00001') {
            elements.get('admin-signup-id').value = id;
            elements.get('admin-signup-name').value = 'Demo Admin';
            elements.get('admin-signup-pass').value = 'demo password';
            elements.get('admin-signup-confirm').value = 'demo password';
        }
    };
}

test('only approved emails receive a key; wrong and expired keys cannot proceed', () => {
    const app = setup();
    app.call('openAdminSignup');
    app.set('admin-signup-email', 'outsider@example.com');
    app.call('handleAdminEmail');
    assert.match(app.error(), /not authorized/);
    assert.equal(app.run('pendingAdminSignup'), null);
    app.set('admin-signup-email', ' TEST@EXAMPLE.COM ');
    app.call('handleAdminEmail');
    assert.match(app.element('admin-signup-key').value, /^[a-f0-9]{32}$/);
    app.set('admin-signup-key', 'wrong');
    app.call('handleAdminKey');
    assert.match(app.error(), /Invalid/);
    assert.equal(app.run('pendingAdminSignup.verified'), false);
    app.run('pendingAdminSignup.expiresAt = Date.now() - 1');
    app.call('handleAdminKey');
    assert.match(app.error(), /expired/);
    assert.equal(app.run('pendingAdminSignup'), null);
});

test('verified registration persists, returns to login, and authenticates after reload', () => {
    const app = setup();
    app.storage.set('mock_users', '[{"id":"student-only"}]');
    app.verify();
    assert.equal(app.run('pendingAdminSignup.key'), null);
    app.details();
    app.call('handleAdminSignup');
    assert.equal(app.element('admin-signup-modal').open, false);
    assert.equal(app.element('view-admin-login').classList.contains('active'), true);
    assert.equal(app.element('admin-email').value, 'test@example.com');
    assert.equal(app.run('APP_STATE.isLoggedIn'), false);
    assert.equal(app.storage.get('mock_users'), '[{"id":"student-only"}]');
    const reloaded = setup(app.storage);
    reloaded.set('admin-email', 'TEST@EXAMPLE.COM');
    reloaded.set('admin-pass', 'wrong');
    reloaded.call('handleAdminLogin');
    assert.equal(reloaded.run('APP_STATE.isLoggedIn'), false);
    reloaded.set('admin-pass', 'demo password');
    reloaded.call('handleAdminLogin');
    assert.equal(reloaded.run('APP_STATE.user.role'), 'admin');
    assert.equal(reloaded.run('APP_STATE.user.id'), '2026-00001');
    assert.equal(reloaded.element('admin-display-name').textContent, 'Demo Admin');
});

test('unverified, expired and cancelled signup cannot create accounts', () => {
    const app = setup();
    app.details();
    app.call('handleAdminSignup');
    assert.equal(app.storage.has('mock_admins'), false);
    app.verify();
    app.details();
    app.run('pendingAdminSignup.expiresAt = Date.now() - 1');
    app.call('handleAdminSignup');
    assert.equal(app.storage.has('mock_admins'), false);
    app.verify();
    app.details();
    app.call('closeAdminSignup');
    assert.equal(app.element('admin-signup-pass').value, '');
    app.call('handleAdminSignup');
    assert.equal(app.storage.has('mock_admins'), false);
});

test('password confirmation and duplicate email/student ID are enforced', () => {
    const app = setup();
    app.verify();
    app.details();
    app.set('admin-signup-confirm', 'different');
    app.call('handleAdminSignup');
    assert.match(app.error(), /Passwords do not match/);
    assert.equal(app.storage.has('mock_admins'), false);
    app.set('admin-signup-confirm', 'demo password');
    app.call('handleAdminSignup');
    app.call('openAdminSignup');
    app.set('admin-signup-email', 'test@example.com');
    app.call('handleAdminEmail');
    assert.match(app.error(), /already has an admin account/);
    app.verify('okims@gmail.com');
    app.details();
    app.call('handleAdminSignup');
    assert.match(app.error(), /already registered/);
    assert.equal(JSON.parse(app.storage.get('mock_admins')).length, 1);
});

test('the previous hardcoded admin credentials no longer bypass signup', () => {
    const app = setup();
    app.set('admin-email', 'admin@school.com');
    app.set('admin-pass', 'password');
    app.call('handleAdminLogin');
    assert.equal(app.run('APP_STATE.isLoggedIn'), false);
});
