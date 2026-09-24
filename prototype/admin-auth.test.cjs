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
            appendChild() {},
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
            createElement() { return { style: {}, append() {}, appendChild() {} }; },
            querySelector() { return null; },
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

function organizerSetup() {
    const app = setup();
    app.run("APP_STATE.isLoggedIn = true; APP_STATE.user = { id: '2026-001', name: 'Event Officer', role: 'admin' }");
    app.storage.set('events', JSON.stringify([
        { id: 1, name: 'Assembly', location: 'Hall', date: '2026-09-23', time: '10:00', attendees: [] },
        { id: 2, name: 'Assembly', location: 'Room', date: '2026-09-24', time: '10:00', attendees: [] }
    ]));
    app.run('openEventDetail(2)');
    return app;
}

function resetSetup(role = 'student') {
    const app = setup();
    const account = { id: '2026-123', name: 'Test Person', email: 'test@example.com', password: 'old password', extra: 'preserve me' };
    app.storage.set('mock_users', JSON.stringify([account]));
    app.storage.set('mock_admins', JSON.stringify([account]));
    app.run(`openPasswordReset('${role}')`);
    app.set('reset-email', ' TEST@EXAMPLE.COM ');
    app.call('handleResetEmail');
    return app;
}

for (const role of ['student', 'admin']) {
    test(`${role} password reset changes only its password and supports login after reload`, () => {
        const app = resetSetup(role);
        assert.match(app.element('reset-code').value, /^\d{6}$/);
        const key = role === 'admin' ? 'mock_admins' : 'mock_users';
        const otherKey = role === 'admin' ? 'mock_users' : 'mock_admins';
        const original = JSON.parse(app.storage.get(key))[0];
        const untouched = app.storage.get(otherKey);
        app.call('handleResetCode');
        app.set('reset-password', ' new password ');
        app.set('reset-confirm', ' new password ');
        app.call('handleResetPassword');
        assert.deepEqual(JSON.parse(app.storage.get(key))[0], { ...original, password: ' new password ' });
        assert.equal(app.storage.get(otherKey), untouched);
        assert.equal(app.element('password-reset-modal').open, false);
        assert.equal(app.run('pendingPasswordReset'), null);
        assert.equal(app.element(role === 'admin' ? 'view-admin-login' : 'view-login').classList.contains('active'), true);
        const reloaded = setup(app.storage);
        reloaded.set(role === 'admin' ? 'admin-email' : 'login-id', role === 'admin' ? original.email : original.id);
        reloaded.set(role === 'admin' ? 'admin-pass' : 'login-pass', original.password);
        reloaded.call(role === 'admin' ? 'handleAdminLogin' : 'handleStudentLogin');
        assert.equal(reloaded.run('APP_STATE.isLoggedIn'), false);
        reloaded.set(role === 'admin' ? 'admin-pass' : 'login-pass', ' new password ');
        reloaded.call(role === 'admin' ? 'handleAdminLogin' : 'handleStudentLogin');
        assert.equal(reloaded.run('APP_STATE.isLoggedIn'), true);
    });
}

test('password reset rejects wrong codes, skipped verification, mismatches, expiry and cancellation', () => {
    const app = resetSetup();
    const original = app.storage.get('mock_users');
    const code = app.element('reset-code').value;
    app.set('reset-password', 'new password');
    app.set('reset-confirm', 'new password');
    app.call('handleResetPassword');
    assert.match(app.element('password-reset-error').textContent, /Verify/);
    app.set('reset-code', 'incorrect');
    app.call('handleResetCode');
    assert.match(app.element('password-reset-error').textContent, /Incorrect/);
    app.set('reset-code', code);
    app.call('handleResetCode');
    app.set('reset-confirm', 'different');
    app.call('handleResetPassword');
    assert.match(app.element('password-reset-error').textContent, /match/);
    app.run('pendingPasswordReset.expiresAt = 0');
    app.call('handleResetPassword');
    assert.match(app.element('password-reset-error').textContent, /expired/);
    app.call('handleResetEmail');
    app.call('handleResetCode');
    app.call('closePasswordReset');
    app.call('handleResetPassword');
    assert.equal(app.storage.get('mock_users'), original);
});

test('unknown emails are rejected and shared emails require the matching student ID', () => {
    const app = resetSetup();
    app.call('restartPasswordReset');
    app.set('reset-email', 'unknown@example.com');
    app.call('handleResetEmail');
    assert.equal(app.run('pendingPasswordReset'), null);
    assert.match(app.element('password-reset-error').textContent, /No student account/);
    const accounts = JSON.parse(app.storage.get('mock_users'));
    accounts.push({ ...accounts[0], id: '2026-456' });
    app.storage.set('mock_users', JSON.stringify(accounts));
    app.set('reset-email', 'test@example.com');
    app.call('handleResetEmail');
    assert.equal(app.run('pendingPasswordReset'), null);
    assert.equal(app.element('reset-id-group').classList.contains('hidden'), false);
    app.set('reset-student-id', '2026-456');
    app.call('handleResetEmail');
    app.call('handleResetCode');
    app.set('reset-password', 'changed');
    app.set('reset-confirm', 'changed');
    app.call('handleResetPassword');
    const updated = JSON.parse(app.storage.get('mock_users'));
    assert.deepEqual(updated[0], accounts[0]);
    assert.equal(updated[1].password, 'changed');
});

test('organizer check-in uses signed-in identity and exact event, persists and prevents duplicates', () => {
    const app = organizerSetup();
    assert.equal(app.element('organizer-checkin-btn').disabled, false);
    app.call('checkInOrganizer');
    const events = JSON.parse(app.storage.get('events'));
    assert.equal(events[0].attendees.length, 0);
    assert.equal(events[1].attendees[0].id, '2026-001');
    assert.equal(events[1].attendees[0].method, 'organizer');
    const records = JSON.parse(app.storage.get('attendance_records'));
    assert.equal(records[0].eventId, 2);
    assert.equal(records[0].method, 'organizer');
    assert.equal(records[0].synced, false);
    assert.equal(app.element('view-event-detail').classList.contains('active'), true);
    assert.equal(app.element('organizer-checkin-btn').disabled, true);
    app.call('checkInOrganizer');
    assert.equal(JSON.parse(app.storage.get('attendance_records')).length, 1);
    app.call('enlargeQR');
    assert.match(app.element('enlarged-qr-img').src, /2026-001/);
    assert.equal(app.element('enlarged-qr-label').textContent, 'Student ID: 2026-001');
    const reloaded = setup(app.storage);
    reloaded.run("APP_STATE.isLoggedIn = true; APP_STATE.user = { id: '2026-001', name: 'Event Officer', role: 'admin' }; openEventDetail(2)");
    assert.equal(reloaded.element('organizer-checkin-btn').disabled, true);
    assert.match(reloaded.element('organizer-attendance-status').textContent, /Organizer check-in/);
});

test('students and logged-out users cannot self check in as organizers', () => {
    const app = organizerSetup();
    app.run("APP_STATE.user.role = 'student'");
    app.call('checkInOrganizer');
    app.run("APP_STATE.user.role = 'admin'; APP_STATE.isLoggedIn = false");
    app.call('checkInOrganizer');
    assert.equal(app.storage.has('attendance_records'), false);
    assert.equal(JSON.parse(app.storage.get('events'))[1].attendees.length, 0);
});

test('scanned attendance prevents a second organizer entry and keeps its original method', () => {
    const app = organizerSetup();
    app.run("recordAttendanceForEvent('2026-001', 'Event Officer', 'Assembly', 'Room')");
    app.call('checkInOrganizer');
    const records = JSON.parse(app.storage.get('attendance_records'));
    assert.equal(records.length, 1);
    assert.equal(records[0].method, 'scan');
    assert.equal(app.element('organizer-checkin-btn').disabled, true);
});
