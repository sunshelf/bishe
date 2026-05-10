function saveCurrentUser(user, { storage = 'local' } = {}) {
    const safeUser = { ...user };
    // remove any sensitive fields if present
    try {
        // keep in-memory copy first so redirects can read it immediately
        window._currentUser = safeUser;
        if (storage === 'session') {
            sessionStorage.setItem('currentUser', JSON.stringify(safeUser));
        } else {
            localStorage.setItem('currentUser', JSON.stringify(safeUser));
        }
    } catch (e) {
        // fallback to in-memory storage
        console.warn('Could not persist currentUser to web storage, using in-memory fallback.', e);
        window._currentUser = safeUser;
    }
}

function getCurrentUser() {
    try {
        if (window._currentUser) return window._currentUser;
        const raw = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                window._currentUser = parsed;
                return parsed;
            }
        }
    } catch (e) {
        // ignore parse/storage errors
    }
    return window._currentUser || null;
}

// Alias for legacy or alternative naming: getLocalUser
function getLocalUser(){
    return getCurrentUser();
}

function clearCurrentUser() {
    try {
        localStorage.removeItem('currentUser');
        sessionStorage.removeItem('currentUser');
    } catch (e) {
        // ignore
    }
    window._currentUser = null;
}

function testButtonFunction() {
    const role = document.querySelector('input[name="role"]:checked')?.value || 'student';
    alert('当前角色: ' + role);
}

async function loginButtonFunction() {
    // 读取输入
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const role = document.querySelector('input[name="role"]:checked')?.value || 'student';

    const username = usernameEl ? usernameEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';

    // 简单校验
    if (!username) {
        alert('请输入用户名');
        usernameEl && usernameEl.focus();
        return;
    }
    if (!password) {
        alert('请输入密码');
        passwordEl && passwordEl.focus();
        return;
    }

    // Special local admin shortcut: username '0' and password '0' -> admin dashboard
    if (username === '0' && password === '0'){
        const adminUser = { id: 0, name: '管理员', role: 'admin' };
        try{ saveCurrentUser(adminUser); }catch(e){ window._currentUser = adminUser; }
        // redirect to admin dashboard (same relative convention as other redirects)
        window.location.href = '../pages/admin/admin_dashboard.html';
        return;
    }

    // 调用后端接口进行登录
    try {
        const data = await getLoginData(role, username, password); // login 函数在本文件下边定义
        console.log('登录成功 ->', data);

        // --- Persist user info globally for other pages to read ---
        // data 结构可能不同：可能包含 token、user 对象或直接返回用户信息。我们把 role 合并进去以便统一使用。
        // 安全处理：如果 data.user 存在并且为对象，则使用它；否则如果 data 本身是对象则使用 data；否则使用空对象。
        const returnedUser = (data && typeof data === 'object' && data.user && typeof data.user === 'object')
            ? data.user
            : (data && typeof data === 'object' ? data : {});
        const token = (data && (data.token ?? data.accessToken)) || undefined;
        const userToStore = {
            ...returnedUser,
            role: returnedUser.role || role,
            ...(token ? { token } : {})
        };
        saveCurrentUser(userToStore);
        // --------------------------------------------------------

        // 根据 role 跳转到不同页面（根据实际项目调整路径）
        if (role === 'teacher') {
            window.location.href = '../pages/teacher/dashboard.html';
        } else {
            window.location.href = '../pages/student/dashboard.html';
        }
    } catch (err) {
        console.error('登录失败', err);
        alert('登录失败: ' + (err && err.message ? err.message : err));
    }
}

 // init: attach form submit handler so Enter triggers login
 if (typeof window !== 'undefined'){
     try{
         document.addEventListener('DOMContentLoaded', ()=>{
             const form = document.getElementById('loginForm');
             if (form){
                 form.addEventListener('submit', (e)=>{
                     e.preventDefault();
                     // call existing login handler
                     loginButtonFunction().catch(err => console.warn('login handler error', err));
                 });
             }
         });
     }catch(e){ console.warn('Failed to attach login form submit handler', e); }
 }
