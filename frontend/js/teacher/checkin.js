function $(id){ return document.getElementById(id); }
function generateCode(){ return Math.random().toString(36).slice(-6).toUpperCase(); }

async function getMyCourses(){
    const current = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!current) return [];
    return await getCoursesByTeacherId(current.id);
}

async function getUserNameById(userId){
    try {
        const u = await getUserProfile('student', userId);
        return u && u.name ? u.name : `学生${userId}`;
    } catch (e) {
        return `学生${userId}`;
    }
}

function getTeacherCourseAttendance(session, courseAttendance){
    const summary = courseAttendance && courseAttendance.summary ? courseAttendance.summary : {};
    const presentStudents = Array.isArray(courseAttendance && courseAttendance.presentStudents) ? courseAttendance.presentStudents : [];
    const absentStudents = Array.isArray(courseAttendance && courseAttendance.absentStudents) ? courseAttendance.absentStudents : [];
    const enrolledCount = Number(summary.enrolledCount || session.studentCount || session.totalStudents || 0) || 0;
    const presentCount = Number(summary.presentCount || presentStudents.length || 0) || 0;
    const absentCount = Number(summary.absentCount || absentStudents.length || 0) || 0;
    return { enrolledCount, presentCount, absentCount, presentStudents, absentStudents };
}

async function loadActiveSession(courseId){
    const sessions = await getActiveCheckinSessions(courseId);
    return Array.isArray(sessions) ? sessions.find(s => s && s.active) || null : null;
}

function renderCourseOptions(courses, selectedId){
    const courseSelect = $('courseSelect');
    if (!courseSelect) return;
    courseSelect.innerHTML = '';
    (courses || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name || ('课程 ' + c.id);
        if (Number(c.id) === Number(selectedId)) opt.selected = true;
        courseSelect.appendChild(opt);
    });
}

async function renderAttendance(session, courseId){
    const activeBox = $('active');
    if (!session){
        activeBox.style.display = 'none';
        activeBox.innerHTML = '';
        return;
    }

    activeBox.style.display = 'block';

    let courseAttendance = null;
    try {
        courseAttendance = await getCourseAttendance(courseId, session.id);
    } catch (e) {
        console.warn('获取课程出勤情况失败，回退到签到记录列表', e);
    }

    if (courseAttendance && typeof courseAttendance === 'object') {
        const { enrolledCount, presentCount, absentCount, presentStudents, absentStudents } = getTeacherCourseAttendance(session, courseAttendance);
        const presentRows = await Promise.all(presentStudents.map(async (item) => {
            const name = item.name || (item.id ? await getUserNameById(item.id) : '未知学生');
            const college = item.college || '';
            const grade = item.grade || '';
            return `<li><strong>${name}</strong><span>${college}${college && grade ? ' · ' : ''}${grade}</span></li>`;
        }));
        const absentRows = await Promise.all(absentStudents.map(async (item) => {
            const name = item.name || (item.id ? await getUserNameById(item.id) : '未知学生');
            const college = item.college || '';
            const grade = item.grade || '';
            return `<li><strong>${name}</strong><span>${college}${college && grade ? ' · ' : ''}${grade}</span></li>`;
        }));

        activeBox.innerHTML = `
            <div style="font-weight:700; margin-bottom:8px;">签到已发起</div>
            <div>课程：<strong>${session.courseName || ''}</strong></div>
            <div>会话ID：${session.id || '-'}</div>
            <div>口令：<strong>${session.passcode || ''}</strong></div>
            <div>状态：进行中</div>
            <div style="margin-top:10px; padding-top:10px; border-top:1px solid #dbeafe;">
                <div style="font-weight:700; margin-bottom:6px;">出勤情况</div>
                <div>总人数：${enrolledCount} 人，已签到：${presentCount} 人，未签到：${absentCount} 人</div>
                <div style="display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); margin-top:10px;">
                    <div class="activeCard" style="margin-top:0;">
                        <div style="font-weight:700; margin-bottom:6px; color:#16a34a;">已签到名单</div>
                        <ul style="margin:8px 0 0; padding-left:18px;">${presentRows.length ? presentRows.join('') : '<li>暂无已签到学生</li>'}</ul>
                    </div>
                    <div class="activeCard" style="margin-top:0;">
                        <div style="font-weight:700; margin-bottom:6px; color:#dc2626;">未签到名单</div>
                        <ul style="margin:8px 0 0; padding-left:18px;">${absentRows.length ? absentRows.join('') : '<li>暂无未签到学生</li>'}</ul>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    let signList = [];
    try {
        signList = await getSessionCheckinList(session.id);
    } catch (e) {
        console.warn('获取签到记录失败', e);
        signList = [];
    }

    const signedCount = Array.isArray(signList) ? signList.length : 0;
    const totalStudents = Number(session.studentCount || session.totalStudents || 0) || 0;
    const remaining = totalStudents > 0 ? Math.max(totalStudents - signedCount, 0) : null;

    const studentRows = Array.isArray(signList) && signList.length > 0
        ? await Promise.all(signList.map(async (item) => {
            const name = item.studentName || await getUserNameById(item.studentId);
            const time = item.checkinAt || item.createdAt || '';
            return `<li><strong>${name}</strong><span>${time}</span></li>`;
        }))
        : ['<li>暂无学生签到记录</li>'];

    activeBox.innerHTML = `
        <div style="font-weight:700; margin-bottom:8px;">签到已发起</div>
        <div>课程：<strong>${session.courseName || ''}</strong></div>
        <div>会话ID：${session.id || '-'}</div>
        <div>口令：<strong>${session.passcode || ''}</strong></div>
        <div>状态：进行中</div>
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid #dbeafe;">
            <div style="font-weight:700; margin-bottom:6px;">签到情况</div>
            <div>已签到：${signedCount} 人${remaining === null ? '' : `，未签到：${remaining} 人`}</div>
            <ul style="margin:8px 0 0; padding-left:18px;">${studentRows.join('')}</ul>
        </div>
    `;
}

async function refreshByCourse(courseId){
    const session = await loadActiveSession(courseId);
    if (session) {
        $('startPanel').style.display = 'none';
        $('activePanel').style.display = 'block';
        await renderAttendance(session, courseId);
    } else {
        $('startPanel').style.display = 'block';
        $('activePanel').style.display = 'none';
        $('active').style.display = 'none';
        $('active').innerHTML = '';
    }
}

async function startCheckin(courseId){
    const duration = Math.max(1, parseInt($('duration').value || 5, 10));
    const code = $('passcode').value.trim() || generateCode();
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user){ alert('请先登录'); return; }
    if (!courseId){ alert('请选择课程'); return; }

    try{
        const data = await createCheckinSession(user.id, courseId, code, duration);
        const courseName = $('courseSelect').selectedOptions[0]?.textContent || '';
        localStorage.setItem('active_checkin', JSON.stringify({
            sessionId: data.id,
            courseId,
            courseName,
            code,
            expiresAt: data.endAt || null
        }));
        await refreshByCourse(courseId);
    }catch(err){
        console.error(err);
        alert('发起签到失败：' + (err && err.message ? err.message : '未知错误'));
    }
}

async function stopCheckin(courseId){
    localStorage.removeItem('active_checkin');
    if (courseId) await refreshByCourse(courseId);
}

async function init(){
    const courses = await getMyCourses();
    const firstCourseId = courses && courses.length ? courses[0].id : null;
    renderCourseOptions(courses, firstCourseId);

    const startBtn = $('startBtn');
    const stopBtn = $('stopBtn');
    const courseSelect = $('courseSelect');
    const hint = $('courseHint');

    const syncCourseView = async () => {
        const selectedCourseId = Number(courseSelect.value || firstCourseId || 0);
        const selectedCourse = (courses || []).find(c => Number(c.id) === Number(selectedCourseId));
        if (hint) hint.textContent = selectedCourse ? `当前选择：${selectedCourse.name}` : '请选择课程';
        await refreshByCourse(selectedCourseId);
    };

    courseSelect.addEventListener('change', syncCourseView);
    startBtn.addEventListener('click', async () => startCheckin(Number(courseSelect.value)));
    stopBtn.addEventListener('click', async () => stopCheckin(Number(courseSelect.value)));

    if (!courses || !courses.length) {
        if (hint) hint.textContent = '暂无可管理课程';
        $('startBtn').disabled = true;
        $('stopBtn').disabled = true;
        return;
    }

    await syncCourseView();
}

if (typeof window !== 'undefined'){
    window.initTeacherCheckinPage = init;
    document.addEventListener('DOMContentLoaded', init);
}
