/* ================================================================
   APPLICATION STATE
================================================================ */
const APP_STATE = {
    isOnline: false,
    isLoggedIn: false,
    user: { name: "Juan Dela Cruz", id: "2024-00123", role: 'student' },
    activeEvent: { name: "General Assembly 2024", location: "Main Hall", time: "10:00 AM" },
    records: []
};

let html5QrCodeScanner = null;
let currentEventId = null;
let currentEventName = null;
let currentEventLocation = null;
let previousViewBeforeScanner = null;
let isScannerStopping = false;
let scannedModalTarget = null;

// Demo allowlist mirrors simple_authentication.py. Verification is browser-only.
const ALLOWED_ADMIN_EMAILS = new Set(['okims@gmail.com', 'test@example.com']);
const ADMIN_KEY_LIFETIME_MS = 15 * 60 * 1000;
let pendingAdminSignup = null;
let passwordResetRole = 'student';
let pendingPasswordReset = null;
const PASSWORD_RESET_LIFETIME_MS = 15 * 60 * 1000;

/* ================================================================
   LOCAL STORAGE HELPERS
================================================================ */
function getUsers() {
    let users = JSON.parse(localStorage.getItem('mock_users') || '[]');
    if (users.length === 0) {
        users.push({
            id: "2024-00123",
            name: "Juan Dela Cruz",
            email: "juan@school.com",
            password: "password"
        });
        localStorage.setItem('mock_users', JSON.stringify(users));
    }
    return users;
}

function loadLocalRecords() {
    const stored = localStorage.getItem("attendance_records");
    if (stored) {
        APP_STATE.records = JSON.parse(stored);
    } else {
        APP_STATE.records = [];
        saveLocalRecords();
    }
    updateCounters();
}

function saveLocalRecords() {
    localStorage.setItem("attendance_records", JSON.stringify(APP_STATE.records));
    updateCounters();
}

function updateCounters() {
    const unsynced = APP_STATE.records.filter(r => !r.synced).length;
    const pendingEl = document.getElementById("pending-count");
    if (pendingEl) pendingEl.innerText = unsynced;

    const totalEl = document.getElementById("total-events");
    const presentEl = document.getElementById("present-count");
    const absentEl = document.getElementById("absent-count");
    const rateEl = document.getElementById("attendance-rate");

    const total = APP_STATE.records.length;
    const present = APP_STATE.records.filter(r => r.status === "PRESENT").length;
    const absent = total - present;
    const rate = total === 0 ? 0 : Math.round((present / total) * 100);

    if (totalEl) totalEl.innerText = total;
    if (presentEl) presentEl.innerText = present;
    if (absentEl) absentEl.innerText = absent;
    if (rateEl) rateEl.innerText = rate + '%';

    const adminTotal = document.getElementById("admin-total-val");
    const adminPresent = document.getElementById("admin-present-val");
    if (adminTotal) adminTotal.innerText = total;
    if (adminPresent) adminPresent.innerText = present;
}

/* ================================================================
   TOAST
================================================================ */
function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.classList.remove("hidden");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add("hidden"), 3000);
}

/* ================================================================
   VIEW NAVIGATION
================================================================ */
function switchView(viewId) {
    if (viewId === 'view-scanner') {
        const activeView = document.querySelector('.view.active');
        previousViewBeforeScanner = activeView ? activeView.id : 'view-student-dash';
    }

    if (viewId !== 'view-scanner') {
        stopQRScanner();
    }

    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");
    updateNavVisibility(viewId);

    if (viewId === 'view-event-history') {
        renderHistoryEvents();
    }
}

function goBackFromScanner() {
    const targetView = previousViewBeforeScanner || 'view-student-dash';
    previousViewBeforeScanner = null;
    if (targetView === 'view-scanner') {
        switchView('view-student-dash');
        return;
    }
    stopQRScanner();
    setTimeout(() => {
        switchView(targetView);
    }, 300);
}

function setActiveNav(btn) {
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    btn.classList.add("active");
}

function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("fa-eye", "fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.replace("fa-eye-slash", "fa-eye");
    }
}

function updateNavVisibility(viewId) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const authViews = ['view-login', 'view-signup', 'view-admin-login'];
    if (authViews.includes(viewId) || !APP_STATE.isLoggedIn) {
        nav.style.display = 'none';
    } else {
        nav.style.display = 'flex';
    }
}

/* ================================================================
   AUTHENTICATION
================================================================ */
function handleSignup(e) {
    e.preventDefault();
    const id = document.getElementById('signup-id').value.trim();
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-pass').value.trim();
    const confirm = document.getElementById('signup-confirm').value.trim();

    if (!id || !name || !email || !password || !confirm) {
        showToast('Please fill in all fields');
        return;
    }
    if (password !== confirm) {
        showToast('Passwords do not match!');
        document.getElementById('signup-pass').style.borderColor = '#ef4444';
        document.getElementById('signup-confirm').style.borderColor = '#ef4444';
        return;
    }
    document.getElementById('signup-pass').style.borderColor = '';
    document.getElementById('signup-confirm').style.borderColor = '';

    const users = getUsers();
    if (users.find(u => u.id === id)) {
        showToast('Student ID already registered!');
        return;
    }
    users.push({ id, name, email, password });
    localStorage.setItem('mock_users', JSON.stringify(users));
    showToast('Account created! Please log in.');
    switchView('view-login');
    document.getElementById('form-signup').reset();
}

function handleStudentLogin(e) {
    e.preventDefault();
    const id = document.getElementById('login-id').value.trim();
    const password = document.getElementById('login-pass').value;

    if (!id || !password) {
        showToast('Please enter Student ID and Password');
        return;
    }
    const users = getUsers();
    const user = users.find(u => u.id === id && u.password === password);
    if (!user) {
        showToast('Invalid Student ID or Password');
        return;
    }

    APP_STATE.isLoggedIn = true;
    APP_STATE.user = { name: user.name, id: user.id, role: 'student' };
    document.getElementById('student-display-name').innerText = user.name;
    document.getElementById('student-display-id').innerText = user.id;

    generateStudentQR();
    renderNav();
    loadLocalRecords();
    renderRecords();
    renderAdminRecent();
    renderTodayEvents();
    renderCurrentEventCard();
    switchView('view-student-dash');
    showToast(`Welcome, ${user.name}!`);
}

function handleAdminLogin(e) {
    e.preventDefault();
    const email = document.getElementById('admin-email').value.trim().toLowerCase();
    const password = document.getElementById('admin-pass').value;
    const admin = getAdmins().find(a => a.email === email && a.password === password);

    if (admin && ALLOWED_ADMIN_EMAILS.has(email)) {
        APP_STATE.isLoggedIn = true;
        APP_STATE.user = { name: admin.name, id: admin.id, email, role: 'admin' };
        document.getElementById('admin-display-name').textContent = admin.name;
        document.getElementById('admin-pass').value = '';
        document.getElementById('admin-login-message').textContent = '';
        renderNav();
        loadLocalRecords();
        renderAdminEvents();
        renderAdminRecent();
        renderTodayEvents();
        switchView('view-admin-dash');
        showToast('Admin logged in!');
    } else {
        showToast('Invalid admin credentials');
    }
}

function getAdmins() {
    return JSON.parse(localStorage.getItem('mock_admins') || '[]');
}

function showAdminSignupStep(step) {
    const forms = ['form-admin-email', 'form-admin-key', 'form-admin-signup'];
    forms.forEach((id, index) => {
        document.getElementById(id).classList.toggle('hidden', index !== step - 1);
    });
    document.getElementById('admin-signup-progress').textContent = `Step ${step} of 3`;
    document.getElementById('admin-signup-title').textContent =
        ['Admin sign up', 'Verify your email', 'Create admin account'][step - 1];
    document.getElementById('admin-signup-error').textContent = '';
    document.getElementById(forms[step - 1]).querySelector('input').focus();
}

function resetAdminVerification() {
    pendingAdminSignup = null;
    document.getElementById('form-admin-key').reset();
    document.getElementById('form-admin-signup').reset();
    showAdminSignupStep(1);
}

function openAdminSignup() {
    document.getElementById('form-admin-email').reset();
    document.getElementById('admin-login-message').textContent = '';
    resetAdminVerification();
    document.getElementById('admin-signup-modal').showModal();
    document.getElementById('admin-signup-email').focus();
}

function closeAdminSignup() {
    resetAdminVerification();
    document.getElementById('admin-signup-modal').close();
    document.getElementById('admin-signup-open').focus();
}

function adminSignupError(message) {
    document.getElementById('admin-signup-error').textContent = message;
}

function handleAdminEmail(e) {
    e.preventDefault();
    pendingAdminSignup = null;
    const email = document.getElementById('admin-signup-email').value.trim().toLowerCase();
    if (!ALLOWED_ADMIN_EMAILS.has(email)) {
        adminSignupError('This email is not authorized for admin signup.');
        return;
    }
    if (getAdmins().some(admin => admin.email === email)) {
        adminSignupError('This email already has an admin account. Go back to admin login.');
        return;
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const key = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    pendingAdminSignup = { email, key, expiresAt: Date.now() + ADMIN_KEY_LIFETIME_MS, verified: false };
    document.getElementById('admin-signup-key').value = key;
    document.getElementById('admin-key-email').textContent = email;
    showAdminSignupStep(2);
}

function handleAdminKey(e) {
    e.preventDefault();
    if (!pendingAdminSignup || Date.now() >= pendingAdminSignup.expiresAt) {
        resetAdminVerification();
        adminSignupError('Your key has expired. Submit your email to get a new key.');
        return;
    }
    if (pendingAdminSignup.verified || document.getElementById('admin-signup-key').value.trim() !== pendingAdminSignup.key) {
        adminSignupError('Invalid authorization key. Check the key and try again.');
        return;
    }
    pendingAdminSignup.verified = true;
    pendingAdminSignup.key = null;
    document.getElementById('admin-signup-key').value = '';
    document.getElementById('admin-verified-email').value = pendingAdminSignup.email;
    showAdminSignupStep(3);
}

function handleAdminSignup(e) {
    e.preventDefault();
    if (!pendingAdminSignup || !pendingAdminSignup.verified || Date.now() >= pendingAdminSignup.expiresAt) {
        resetAdminVerification();
        adminSignupError('Please verify your email again before creating an account.');
        return;
    }
    const { email } = pendingAdminSignup;
    const id = document.getElementById('admin-signup-id').value.trim();
    const name = document.getElementById('admin-signup-name').value.trim();
    const password = document.getElementById('admin-signup-pass').value;
    const confirm = document.getElementById('admin-signup-confirm').value;
    if (!id || !name || !password.trim() || !confirm.trim()) {
        adminSignupError('Please fill in all fields.');
        return;
    }
    if (password !== confirm) {
        adminSignupError('Passwords do not match.');
        return;
    }
    const admins = getAdmins();
    if (!ALLOWED_ADMIN_EMAILS.has(email) || admins.some(admin => admin.email === email || admin.id === id)) {
        adminSignupError('This email or student ID is already registered, or the email is no longer authorized.');
        return;
    }
    // Keep demo accounts separate from student accounts and attendance records.
    try {
        localStorage.setItem('mock_admins', JSON.stringify([...admins, { id, name, email, password }]));
    } catch {
        adminSignupError('Could not save your account. Enable browser storage and try again.');
        return;
    }
    closeAdminSignup();
    switchView('view-admin-login');
    document.getElementById('admin-email').value = email;
    document.getElementById('admin-pass').value = '';
    document.getElementById('admin-login-message').textContent = 'Admin account created. Log in with your email and password.';
    document.getElementById('admin-pass').focus();
}

function showPasswordResetStep(step) {
    const forms = ['form-reset-email', 'form-reset-code', 'form-reset-password'];
    forms.forEach((id, index) => document.getElementById(id).classList.toggle('hidden', index !== step - 1));
    document.getElementById('password-reset-progress').textContent = `Step ${step} of 3`;
    document.getElementById('password-reset-error').textContent = '';
    document.getElementById(forms[step - 1]).querySelector('input').focus();
}

function restartPasswordReset() {
    pendingPasswordReset = null;
    ['form-reset-code', 'form-reset-password'].forEach(id => document.getElementById(id).reset());
    document.getElementById('reset-student-id').value = '';
    document.getElementById('reset-id-group').classList.add('hidden');
    showPasswordResetStep(1);
}

function openPasswordReset(role) {
    passwordResetRole = role === 'admin' ? 'admin' : 'student';
    document.getElementById('form-reset-email').reset();
    restartPasswordReset();
    document.getElementById('password-reset-title').textContent = `${passwordResetRole === 'admin' ? 'Admin' : 'Student'} password reset`;
    document.getElementById('password-reset-modal').showModal();
    document.getElementById('reset-email').focus();
}

function closePasswordReset() {
    restartPasswordReset();
    document.getElementById('form-reset-email').reset();
    document.getElementById('password-reset-modal').close();
    document.getElementById(`${passwordResetRole}-forgot-password`).focus();
}

function resetPasswordError(message) {
    document.getElementById('password-reset-error').textContent = message;
}

function getResetAccounts() {
    return passwordResetRole === 'admin' ? getAdmins() : getUsers();
}

function handleResetEmail(e) {
    e.preventDefault();
    pendingPasswordReset = null;
    const email = document.getElementById('reset-email').value.trim().toLowerCase();
    let matches = getResetAccounts().filter(account => account.email.toLowerCase().trim() === email);
    if (matches.length > 1) {
        document.getElementById('reset-id-group').classList.remove('hidden');
        const id = document.getElementById('reset-student-id').value.trim();
        matches = matches.filter(account => account.id === id);
        if (matches.length !== 1) {
            resetPasswordError('This email is shared. Enter your student ID to select your account.');
            document.getElementById('reset-student-id').focus();
            return;
        }
    }
    if (matches.length !== 1) {
        resetPasswordError(`No ${passwordResetRole} account matches this email.`);
        return;
    }
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => (byte % 10).toString()).join('');
    pendingPasswordReset = { id: matches[0].id, email, code, verified: false, expiresAt: Date.now() + PASSWORD_RESET_LIFETIME_MS };
    document.getElementById('reset-code').value = code;
    document.getElementById('reset-email-display').textContent = email;
    showPasswordResetStep(2);
}

function hasActivePasswordReset() {
    if (!pendingPasswordReset || Date.now() >= pendingPasswordReset.expiresAt) {
        restartPasswordReset();
        resetPasswordError('Request a new code. Your password reset is missing or has expired.');
        return false;
    }
    return true;
}

function handleResetCode(e) {
    e.preventDefault();
    if (!hasActivePasswordReset()) return;
    if (pendingPasswordReset.verified || document.getElementById('reset-code').value.trim() !== pendingPasswordReset.code) {
        resetPasswordError('Incorrect reset code. Check the code and try again.');
        return;
    }
    pendingPasswordReset.verified = true;
    pendingPasswordReset.code = null;
    document.getElementById('reset-code').value = '';
    showPasswordResetStep(3);
}

function handleResetPassword(e) {
    e.preventDefault();
    if (!hasActivePasswordReset()) return;
    if (!pendingPasswordReset.verified) {
        resetPasswordError('Verify your reset code first.');
        return;
    }
    const password = document.getElementById('reset-password').value;
    if (!password.trim() || password !== document.getElementById('reset-confirm').value) {
        resetPasswordError('Enter a new password and make sure both passwords match.');
        return;
    }
    const accounts = getResetAccounts();
    const account = accounts.find(a => a.id === pendingPasswordReset.id && a.email.trim().toLowerCase() === pendingPasswordReset.email);
    if (!account) {
        restartPasswordReset();
        resetPasswordError('The account changed. Request a new code.');
        return;
    }
    account.password = password;
    try {
        localStorage.setItem(passwordResetRole === 'admin' ? 'mock_admins' : 'mock_users', JSON.stringify(accounts));
    } catch {
        resetPasswordError('Could not save your password. Enable browser storage and try again.');
        return;
    }
    closePasswordReset();
    const admin = passwordResetRole === 'admin';
    switchView(admin ? 'view-admin-login' : 'view-login');
    document.getElementById(admin ? 'admin-email' : 'login-id').value = admin ? account.email : account.id;
    const passwordInput = document.getElementById(admin ? 'admin-pass' : 'login-pass');
    passwordInput.value = '';
    passwordInput.focus();
    showToast('Password updated. Log in with your new password.');
}

function logout() {
    showConfirmDialog('Are you sure you want to logout?', () => {
        stopQRScanner();
        APP_STATE.isLoggedIn = false;
        APP_STATE.user.role = 'student';
        renderNav();
        switchView('view-login');
        showToast('Logged out');
    }, () => {
        showToast('Logout cancelled');
    });
}

/* ================================================================
   CONFIRM DIALOG
================================================================ */
function showConfirmDialog(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    msgEl.innerText = message;

    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newOk.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (onConfirm) onConfirm();
    });
    newCancel.addEventListener('click', () => {
        modal.classList.add('hidden');
        if (onCancel) onCancel();
    });

    modal.classList.remove('hidden');
}

/* ================================================================
   NAVIGATION BAR
================================================================ */
function renderNav() {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    const role = APP_STATE.user.role || 'student';
    let html = '';
    if (role === 'student') {
        html = `
            <button class="nav-item active" onclick="switchView('view-student-dash'); setActiveNav(this)">
                <i class="fa-solid fa-house"></i><span>Home</span>
            </button>
            <button class="nav-item" onclick="switchView('view-records'); setActiveNav(this)">
                <i class="fa-solid fa-clipboard-list"></i><span>Records</span>
            </button>
            <button class="nav-item" onclick="logout()">
                <i class="fa-solid fa-right-from-bracket"></i><span>Logout</span>
            </button>
        `;
    } else if (role === 'admin') {
    html = `
        <button class="nav-item active" onclick="switchView('view-admin-dash'); setActiveNav(this)">
            <i class="fa-solid fa-gauge-high"></i><span>Dashboard</span>
        </button>
        <button class="nav-item" onclick="logout()">
            <i class="fa-solid fa-right-from-bracket"></i><span>Logout</span>
        </button>
    `;
}
    nav.innerHTML = html;
    nav.style.display = APP_STATE.isLoggedIn ? 'flex' : 'none';
}

/* ================================================================
   QR CODE GENERATION
================================================================ */
function generateStudentQR() {
    const id = APP_STATE.user.id || '2024-00123';
    const img = document.getElementById('student-qr-img');
    const enlarged = document.getElementById('enlarged-qr-img');
    const label = document.getElementById('enlarged-qr-label');
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(id)}`;
    const urlBig = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(id)}`;
    if (img) img.src = url;
    if (enlarged) enlarged.src = urlBig;
    if (label) label.innerText = `Student ID: ${id}`;
}

function enlargeQR() {
    const modal = document.getElementById('qr-enlarged-modal');
    if (!modal) return;
    const id = APP_STATE.user.id || '2024-00123';
    document.getElementById('enlarged-qr-label').textContent = `Student ID: ${id}`;
    const img = document.getElementById('enlarged-qr-img');
    if (img) {
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(id)}`;
    }
    modal.classList.remove('hidden');
}

function closeEnlargedQR() {
    const modal = document.getElementById('qr-enlarged-modal');
    if (modal) modal.classList.add('hidden');
}

/* ================================================================
   SCANNED STUDENT CONFIRMATION MODAL
================================================================ */
function showScannedModal(studentId, studentName, eventName, targetView) {
    document.getElementById('scanned-id').textContent = studentId;
    document.getElementById('scanned-name').textContent = studentName;
    document.getElementById('scanned-event').textContent = eventName;
    scannedModalTarget = targetView || 'view-success';
    document.getElementById('scanned-modal').classList.remove('hidden');
}

function closeScannedModal() {
    document.getElementById('scanned-modal').classList.add('hidden');
    if (scannedModalTarget) {
        switchView(scannedModalTarget);
        scannedModalTarget = null;
    }
}

/* ================================================================
   RECORDS & RENDERING
================================================================ */
function renderRecords() {
    const list = document.getElementById("records-list");
    if (!list) return;
    list.innerHTML = "";
    if (APP_STATE.records.length === 0) {
        list.innerHTML = '<p class="subtext" style="text-align:center; padding:20px 0;">No attendance records yet.</p>';
        return;
    }
    APP_STATE.records.forEach(rec => {
        const card = document.createElement("div");
        card.className = "record-card";
        card.innerHTML = `
            <div>
                <strong>${rec.event}</strong>
                <div class="subtext">${rec.studentName || rec.studentId} • ${rec.date} • ${rec.time}${rec.method === 'organizer' ? ' • Organizer check-in' : ''}</div>
            </div>
            <span class="record-status status-${rec.status.toLowerCase()}">${rec.status} ${rec.synced ? '' : '• Local'}</span>
        `;
        list.appendChild(card);
    });
}

function filterRecords() {
    const query = document.getElementById("record-search").value.toLowerCase();
    document.querySelectorAll("#records-list .record-card").forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(query) ? "flex" : "none";
    });
}

function renderAdminRecent() {
    const list = document.getElementById("admin-recent-list");
    if (!list) return;
    list.innerHTML = "";
    const recent = APP_STATE.records.slice(0, 5);
    if (recent.length === 0) {
        list.innerHTML = '<p class="subtext" style="text-align:center; padding:12px 0;">No recent check-ins.</p>';
        return;
    }
    recent.forEach(r => {
        const item = document.createElement("div");
        item.className = "receipt-row";
        item.style.padding = "8px 0";
        item.innerHTML = `<span>${r.studentName || r.studentId}</span> <strong>${r.time} <i class="fa-solid fa-check text-green" style="color:var(--success);"></i></strong>`;
        list.appendChild(item);
    });
}

function renderAdminEvents() {
    const list = document.getElementById('admin-events-list');
    if (!list) return;
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    if (events.length === 0) {
        list.innerHTML = '<p class="subtext" style="text-align:center; padding:20px 0;">No events created yet. Click "Create Event" to add one.</p>';
        return;
    }
    list.innerHTML = '';
    events.forEach(event => {
        const card = document.createElement('div');
        card.className = 'record-card';
        card.style.marginBottom = '10px';
        card.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <strong>${event.name}</strong>
                <div class="subtext">${event.location} • ${event.date} • ${event.time}</div>
                <div class="subtext" style="font-size:0.75rem; color:var(--purple);">
                    ${event.attendees ? event.attendees.length : 0} students checked in
                </div>
            </div>
            <div style="display:flex; gap:6px; flex-shrink: 0;">
                <button class="btn btn-small btn-purple" onclick="openEventDetail(${event.id})">
                    <i class="fa-solid fa-qrcode"></i> Manage
                </button>
                <button class="btn-icon-danger" onclick="deleteEvent(${event.id})" title="Delete Event">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        list.appendChild(card);
    });
}
function deleteEvent(eventId) {
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    const event = events.find(e => e.id === eventId);
    if (!event) {
        showToast('Event not found');
        return;
    }

    showConfirmDialog(
        `Delete "${event.name}"? This cannot be undone.`,
        () => {
            // Remove the event from localStorage
            const updatedEvents = events.filter(e => e.id !== eventId);
            localStorage.setItem('events', JSON.stringify(updatedEvents));

            // If the deleted event was the currently-managed one, clear it
            if (currentEventId === eventId) {
                currentEventId = null;
                currentEventName = null;
                currentEventLocation = null;
            }

            // Re-render everything
            renderAdminEvents();
            renderTodayEvents();
            renderHistoryEvents();

            showToast(`✅ Event "${event.name}" deleted`);
        },
        () => {
            showToast('Delete cancelled');
        }
    );
}

/* ================================================================
   TODAY'S EVENTS
================================================================ */
function renderTodayEvents() {
    const container = document.getElementById('today-events-list');
    if (!container) return;
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    const today = new Date().toISOString().slice(0, 10);
    const todayEvents = events.filter(e => e.date === today);

    if (todayEvents.length === 0) {
        container.innerHTML = '<p class="subtext" style="text-align:center; padding:10px 0;">No events for today.</p>';
        return;
    }

    container.innerHTML = '';
    todayEvents.forEach(event => {
        const div = document.createElement('div');
        div.className = 'today-event-item';
        div.innerHTML = `
            <span class="event-name">${event.name}</span>
            <span class="event-attendees">${event.attendees ? event.attendees.length : 0} checked in</span>
        `;
        container.appendChild(div);
    });
}
/* ================================================================
   STUDENT: CURRENT EVENT CARD
================================================================ */
function renderCurrentEventCard() {
    const contentEl = document.getElementById('current-event-content');
    const emptyEl   = document.getElementById('current-event-empty');
    const badgeEl   = document.getElementById('current-event-badge');
    if (!contentEl || !emptyEl) return;

    const events = JSON.parse(localStorage.getItem('events') || '[]');

    // No events → show empty state with Reload button
    if (events.length === 0) {
        contentEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        if (badgeEl) badgeEl.style.display = 'none';
        return;
    }

    // Prefer today's event, otherwise the most recently created one
    const today = new Date().toISOString().slice(0, 10);
    let currentEvent = events.find(e => e.date === today);
    if (!currentEvent) {
        currentEvent = events.reduce((a, b) => (a.id > b.id ? a : b));
    }

    // Show content, hide empty state
    contentEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    if (badgeEl) badgeEl.style.display = '';

    document.getElementById('dash-event-name').innerText = currentEvent.name;
    document.getElementById('dash-event-loc').innerText  = currentEvent.location;
    document.getElementById('dash-event-time').innerText = `${currentEvent.date} • ${currentEvent.time}`;

    // Keep APP_STATE in sync in case other code depends on it
    APP_STATE.activeEvent = {
        name: currentEvent.name,
        location: currentEvent.location,
        time: `${currentEvent.date} • ${currentEvent.time}`
    };
}

function reloadEvents() {
    showToast('🔄 Reloading events...');
    setTimeout(() => {
        renderCurrentEventCard();
        const events = JSON.parse(localStorage.getItem('events') || '[]');
        if (events.length === 0) {
            showToast('No events available yet');
        } else {
            showToast('✅ Events loaded');
        }
    }, 500);
}

/* ================================================================
   EVENT HISTORY
================================================================ */
function renderHistoryEvents() {
    const container = document.getElementById('history-events-list');
    if (!container) return;
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    if (events.length === 0) {
        container.innerHTML = '<p class="subtext" style="text-align:center; padding:20px 0;">No events found.</p>';
        return;
    }
    container.innerHTML = '';
    events.forEach(event => {
        const card = document.createElement('div');
        card.className = 'record-card';
        card.style.marginBottom = '10px';
        card.style.cursor = 'pointer';
        const attendees = event.attendees || [];
        const attendeeNames = attendees.map(a => `${a.name}${a.method === 'organizer' ? ' (Organizer check-in)' : ''}`).join(', ') || 'No attendees';
        card.innerHTML = `
            <div style="flex:1;">
                <strong>${event.name}</strong>
                <div class="subtext">${event.location} • ${event.date} • ${event.time}</div>
                <div class="subtext" style="font-size:0.75rem; color:var(--purple);">
                    ${attendees.length} students checked in
                </div>
                <div class="attendee-detail hidden" style="margin-top:8px;">
                    <strong>Attendees:</strong>
                    <div>${attendeeNames}</div>
                </div>
            </div>
            <button class="btn btn-small btn-secondary" onclick="toggleAttendees(this)">Show</button>
        `;
        container.appendChild(card);
    });
}

function toggleAttendees(btn) {
    const detail = btn.closest('.record-card').querySelector('.attendee-detail');
    if (detail) {
        detail.classList.toggle('hidden');
        btn.innerText = detail.classList.contains('hidden') ? 'Show' : 'Hide';
    }
}

/* ================================================================
   ATTENDANCE RECORDING
================================================================ */
function recordAttendance(eventName, location) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const newRecord = {
        id: Date.now(),
        studentId: APP_STATE.user.id,
        studentName: APP_STATE.user.name,
        event: eventName || APP_STATE.activeEvent.name,
        date: dateStr,
        time: timeStr,
        status: "PRESENT",
        synced: false
    };

    APP_STATE.records.unshift(newRecord);
    saveLocalRecords();
    renderRecords();
    renderAdminRecent();

    document.getElementById("rec-student").innerText = APP_STATE.user.name;
    document.getElementById("rec-id").innerText = APP_STATE.user.id;
    document.getElementById("rec-event").innerText = newRecord.event;
    document.getElementById("rec-loc").innerText = location || APP_STATE.activeEvent.location;
    document.getElementById("rec-time").innerText = timeStr;

    stopQRScanner();
    showScannedModal(APP_STATE.user.id, APP_STATE.user.name, newRecord.event, 'view-success');
    showToast(`✅ ${APP_STATE.user.name} checked in!`);
}

function checkInOrganizer() {
    if (!APP_STATE.isLoggedIn || APP_STATE.user.role !== 'admin' || !APP_STATE.user.id || !APP_STATE.user.name) {
        showToast('Log in as an admin to check yourself in.');
        return;
    }
    recordAttendanceForEvent(APP_STATE.user.id, APP_STATE.user.name, currentEventName, currentEventLocation, 'organizer');
}

function renderOrganizerAttendance(event) {
    const isAdmin = APP_STATE.isLoggedIn && APP_STATE.user.role === 'admin';
    document.getElementById('organizer-attendance').classList.toggle('hidden', !isAdmin);
    const attendance = (event.attendees || []).find(a => a.id === APP_STATE.user.id);
    document.getElementById('organizer-identity').textContent = `${APP_STATE.user.name} (${APP_STATE.user.id})`;
    document.getElementById('organizer-attendance-status').textContent = attendance
        ? `Present: ${attendance.method === 'organizer' ? 'Organizer check-in' : 'Student check-in'} at ${attendance.time}`
        : 'You have not checked in to this event yet.';
    const button = document.getElementById('organizer-checkin-btn');
    button.disabled = !isAdmin || Boolean(attendance);
    button.textContent = attendance ? 'Already present' : 'Check myself in';
}

function recordAttendanceForEvent(studentId, studentName, eventName, location, method = 'scan') {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    let events = JSON.parse(localStorage.getItem('events') || '[]');
    const eventIndex = events.findIndex(e => e.id === currentEventId);
    if (eventIndex === -1) {
        showToast(`⚠️ Event "${eventName}" not found`);
        return;
    }
    if (!events[eventIndex].attendees) events[eventIndex].attendees = [];
    const existing = events[eventIndex].attendees.find(a => a.id === studentId);
    if (existing) {
        showToast(`⚠️ ${studentName} already checked in!`);
        stopQRScanner();
        switchView('view-event-detail');
        refreshEventDetail();
        renderAdminEvents();
        renderTodayEvents();
        return;
    }
    events[eventIndex].attendees.push({ id: studentId, name: studentName, time: timeStr, method });
    localStorage.setItem('events', JSON.stringify(events));

    const newRecord = {
        id: Date.now(),
        studentId: studentId,
        studentName: studentName,
        eventId: events[eventIndex].id,
        method,
        event: eventName,
        date: dateStr,
        time: timeStr,
        status: "PRESENT",
        synced: false
    };
    APP_STATE.records.unshift(newRecord);
    saveLocalRecords();
    renderRecords();
    renderAdminRecent();
    renderAdminEvents();
    renderTodayEvents();

    if (method === 'organizer') {
        refreshEventDetail();
        showToast('You are present as an organizer.');
        return;
    }

    document.getElementById("rec-student").innerText = studentName;
    document.getElementById("rec-id").innerText = studentId;
    document.getElementById("rec-event").innerText = eventName;
    document.getElementById("rec-loc").innerText = location || "Unknown";
    document.getElementById("rec-time").innerText = timeStr;

    stopQRScanner();
    showScannedModal(studentId, studentName, eventName, 'view-success');

    // Override DONE button to return to event detail if admin
    const doneBtn = document.querySelector('#view-success .btn-primary');
    if (doneBtn) {
        doneBtn.onclick = function() {
            if (currentEventName) {
                switchView('view-event-detail');
                refreshEventDetail();
                renderAdminEvents();
                renderTodayEvents();
            } else {
                switchView('view-student-dash');
            }
        };
    }
    showToast(`✅ ${studentName} checked in to ${eventName}!`);
}

function refreshEventDetail() {
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    const event = events.find(e => e.id === currentEventId);
    if (!event) return;
    renderOrganizerAttendance(event);
    document.getElementById('event-attendee-count').innerText = event.attendees ? event.attendees.length : 0;
    const list = document.getElementById('event-attendee-list');
    list.innerHTML = '';
    if (event.attendees && event.attendees.length > 0) {
        event.attendees.forEach(a => {
            const item = document.createElement('div');
            item.className = 'receipt-row';
            item.style.padding = '6px 0';
            const name = document.createElement('span');
            name.textContent = `${a.name}${a.method === 'organizer' ? ' (Organizer check-in)' : ''}`;
            const time = document.createElement('strong');
            time.textContent = a.time;
            item.append(name, time);
            list.appendChild(item);
        });
    } else {
        list.innerHTML = '<p class="subtext" style="text-align:center; padding:20px 0;">No students checked in yet</p>';
    }
}

/* ================================================================
   QR SCANNER
================================================================ */
function startQRScanner() {
    if (html5QrCodeScanner) return;
    try {
        html5QrCodeScanner = new Html5Qrcode("reader");
        const config = { fps: 10, qrbox: { width: 180, height: 180 } };
        html5QrCodeScanner.start({ facingMode: "environment" }, config, (decodedText) => {
            recordAttendance(decodedText, "Scanned Location");
        }).catch(() => {
            document.getElementById("camera-notice").classList.remove("hidden");
        });
    } catch (e) {
        document.getElementById("camera-notice").classList.remove("hidden");
    }
}

function stopQRScanner() {
    if (isScannerStopping) return;
    isScannerStopping = true;
    if (html5QrCodeScanner) {
        html5QrCodeScanner.stop().then(() => {
            html5QrCodeScanner.clear();
            html5QrCodeScanner = null;
            isScannerStopping = false;
        }).catch(() => {
            html5QrCodeScanner = null;
            isScannerStopping = false;
        });
    } else {
        isScannerStopping = false;
    }
}

function simulateScan() {
    if (currentEventName) {
        simulateEventScan();
        return;
    }
    const studentName = APP_STATE.user.name || "Juan Dela Cruz";
    const eventName = APP_STATE.activeEvent.name || "General Assembly 2024";
    const location = APP_STATE.activeEvent.location || "Main Hall";
    showToast(`📱 Simulating scan for ${studentName}...`);
    recordAttendance(eventName, location);
}

function simulateEventScan() {
    if (!currentEventName) {
        showToast('❌ No event selected.');
        return;
    }

    const defaultId = APP_STATE.user.id || "2024-00123";
    const defaultName = APP_STATE.user.name || "Juan Dela Cruz";

    const studentIdInput = prompt(
        `📸 Simulating scan for: "${currentEventName}"\n\nEnter Student ID:`,
        defaultId
    );
    if (studentIdInput === null) {
        showToast('Scan cancelled');
        return;
    }
    const studentId = studentIdInput.trim();
    if (studentId === '') {
        showToast('Student ID cannot be empty');
        return;
    }

    const studentNameInput = prompt(
        `Enter Student Name for ID: ${studentId}`,
        defaultName
    );
    if (studentNameInput === null) {
        showToast('Scan cancelled');
        return;
    }
    const studentName = studentNameInput.trim();
    if (studentName === '') {
        showToast('Student name cannot be empty');
        return;
    }

    recordAttendanceForEvent(
        studentId,
        studentName,
        currentEventName,
        currentEventLocation || "Unknown Location"
    );
}

/* ================================================================
   SYNC
================================================================ */
function syncData() {
    const unsyncedCount = APP_STATE.records.filter(r => !r.synced).length;

    if (unsyncedCount === 0) {
        showToast("✅ Already up to date");
        return;
    }

    showToast(`Syncing ${unsyncedCount} record${unsyncedCount > 1 ? 's' : ''}...`);
    setTimeout(() => {
        APP_STATE.records.forEach(r => r.synced = true);
        saveLocalRecords();
        renderRecords();
        renderAdminRecent();
        showToast("✅ Sync Successful!");
    }, 1200);
}
/* ================================================================
   ADMIN: EVENT MANAGEMENT
================================================================ */
function handleCreateEvent(e) {
    e.preventDefault();
    const name = document.getElementById("ev-name").value.trim();
    const loc = document.getElementById("ev-loc").value.trim();
    const date = document.getElementById("ev-date").value;
    const time = document.getElementById("ev-time").value;

    if (!name || !loc || !date || !time) {
        showToast('Please fill in all fields');
        return;
    }

    let events = JSON.parse(localStorage.getItem('events') || '[]');
    const newEvent = { id: Date.now(), name, location: loc, date, time, attendees: [] };
    events.push(newEvent);
    localStorage.setItem('events', JSON.stringify(events));

    APP_STATE.activeEvent = { name, location: loc, time: `${date} • ${time}` };
    document.getElementById("dash-event-name").innerText = name;
    document.getElementById("dash-event-loc").innerText = loc;
    document.getElementById("dash-event-time").innerText = `${date} • ${time}`;

    showToast(`✅ Event "${name}" created!`);
    switchView('view-admin-dash');
    renderAdminEvents();
    renderTodayEvents();
    document.getElementById('create-event-form').reset();
}

function openEventDetail(eventId) {
    const events = JSON.parse(localStorage.getItem('events') || '[]');
    const event = events.find(e => e.id === eventId);
    if (!event) {
        showToast('Event not found');
        return;
    }
    currentEventId = event.id;
    currentEventName = event.name;
    currentEventLocation = event.location;

    document.getElementById('event-detail-name').innerText = event.name;
    document.getElementById('event-detail-loc').innerText = event.location;
    document.getElementById('event-detail-time').innerText = `${event.date} • ${event.time}`;
    refreshEventDetail();
    switchView('view-event-detail');
    showToast(`Managing: ${event.name}`);
}

function startEventScanner() {
    if (html5QrCodeScanner) {
        showToast('Scanner already running');
        return;
    }
    if (!currentEventName) {
        showToast('No event selected.');
        return;
    }
    document.getElementById('scanner-title').textContent = 'Scan Student QR';
    switchView('view-scanner');

    setTimeout(() => {
        try {
            html5QrCodeScanner = new Html5Qrcode("reader");
            const config = { fps: 10, qrbox: { width: 180, height: 180 } };
            html5QrCodeScanner.start({ facingMode: "environment" }, config, (decodedText) => {
                const studentId = decodedText.trim();
                const studentName = prompt(`Enter name for Student ID: ${studentId}`, "Student Name");
                if (studentName !== null && studentName.trim() !== '') {
                    recordAttendanceForEvent(studentId, studentName.trim(), currentEventName, currentEventLocation);
                } else {
                    showToast('Scan cancelled');
                    switchView('view-event-detail');
                }
            }).catch(() => {
                document.getElementById("camera-notice").classList.remove("hidden");
                showToast('Camera access failed. Use Simulate button.');
                document.querySelector('.scanner-controls').innerHTML = `
                    <button class="btn btn-secondary" onclick="simulateEventScan()">
                        <i class="fa-solid fa-bolt"></i> Simulate Student Scan
                    </button>
                `;
            });
        } catch (e) {
            document.getElementById("camera-notice").classList.remove("hidden");
            showToast('Camera error. Use Simulate button.');
        }
    }, 300);
}

/* ================================================================
   NETWORK STATUS
================================================================ */
function updateNetworkStatus() {
    const statusEl = document.getElementById('status-text');
    const badge = document.getElementById('network-status');
    if (navigator.onLine) {
        APP_STATE.isOnline = true;
        badge.className = 'status-badge synced';
        statusEl.textContent = 'Online';
    } else {
        APP_STATE.isOnline = false;
        badge.className = 'status-badge offline';
        statusEl.textContent = 'Offline';
    }
}
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);

/* ================================================================
   INIT
================================================================ */
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('password-reset-modal').addEventListener('cancel', event => {
        event.preventDefault();
        closePasswordReset();
    });
    document.getElementById('admin-signup-modal').addEventListener('cancel', event => {
        event.preventDefault();
        closeAdminSignup();
    });
    updateNetworkStatus();
    loadLocalRecords();
    renderRecords();
    renderAdminRecent();
    generateStudentQR();
    renderNav();
    renderAdminEvents();
    renderTodayEvents();

    const ev = APP_STATE.activeEvent;
    document.getElementById("dash-event-name").innerText = ev.name;
    document.getElementById("dash-event-loc").innerText = ev.location;
    document.getElementById("dash-event-time").innerText = ev.time;

    switchView('view-login');
});
