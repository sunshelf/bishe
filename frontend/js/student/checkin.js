function $(id){ return document.getElementById(id); }
function qs(name){ try { return new URLSearchParams(window.location.search).get(name); } catch(e){ return null; } }

async function getAvailableCourses(){
    const current = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!current) return [];
    return await getCoursesByStudentId(current.id);
}

async function renderSession(){
    const courseSelectEl = $('courseSelect');
    const courseId = Number(courseSelectEl ? courseSelectEl.value : '0');
    const box = $('sessionBox');
    const hist = $('history');
    hist.innerHTML = '';
    box.style.display = 'none';

    if (!courseId){
        return;
    }

    try{
        const sessions = await getActiveCheckinSessions(courseId);
        const active = Array.isArray(sessions) ? sessions.filter(s => s && s.active) : [];
        if (!active.length){
            return;
        }

        const session = active[0];
        box.style.display = 'block';
        box.innerHTML = `<div><strong>签到进行中</strong></div><div>会话ID：${session.id}</div><div>口令：<strong>${session.passcode || ''}</strong></div><div>截止：${session.endAt || '-'}</div>`;

        const div = document.createElement('div');
        div.className = 'item';
        div.innerHTML = `<div>会话ID：${session.id}</div><div class="muted">状态：进行中</div>`;
        hist.appendChild(div);
    }catch(err){
        console.error(err);
        return;
    }
}

async function join(){
    const courseSelectEl = $('courseSelect');
    const courseId = Number(courseSelectEl ? courseSelectEl.value : '0');
    if(!courseId){ alert('请选择课程'); return; }
    const code = $('code').value.trim();
    if(!code) { alert('请输入口令'); return; }
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user){ alert('请先登录'); return; }

    try{
        const sessions = await getActiveCheckinSessions(courseId);
        const active = Array.isArray(sessions) ? sessions.find(s => s && s.active && String(s.passcode) === code) : null;
        if(!active){ alert('当前课程未发起签到或口令错误'); return; }

        await studentSignCheckin(active.id, user.id, code);
        alert('签到成功');
        await renderSession();
    }catch(err){
        console.error(err);
        alert('签到失败：' + (err && err.message ? err.message : '未知错误'));
    }
}

async function init(){
    const courses = await getAvailableCourses();
    const sel = $('courseSelect'); sel.innerHTML='';
    courses.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
    const courseId = qs('courseId');
    if (courseId) sel.value = String(courseId);
    sel.addEventListener('change', renderSession);
    $('joinBtn').addEventListener('click', join);
    await renderSession();
}

if (typeof window !== 'undefined'){
    window.$ = window.$ || $;
    window.qs = window.qs || qs;
    window.getAvailableCourses = getAvailableCourses;
    window.renderSession = renderSession;
    window.joinCheckin = join;
    window.initStudentCheckinPage = init;
    document.addEventListener('DOMContentLoaded', init);
}
