async function initTeacherDashboard() {
    await initUserInfo();
    await initTeachCourses();
}

async function initUserInfo() {
    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user) {
        // 如果没有登录用户，重定向到登录页
        window.location.href = '../login.html';
        return;
    }

    // Try new topbar IDs first (we moved sidebar to topbar). Fall back to legacy .user-info selectors.
    const user_info_avatar_el = document.getElementById('topbarAvatar') || (document.querySelector('.user-info') ? document.querySelector('.user-info img') : null);
    const user_info_name_el = document.getElementById('topbarName') || (document.querySelector('.user-info') ? document.querySelector('.user-info p') : null);
    const user_info_school_el = document.getElementById('topbarCollege') || (document.querySelector('.user-info') ? document.querySelector('.user-info span') : null);

    // Fill fields if present (be defensive in case some DOM pieces are missing)
    try{
        if (user_info_avatar_el && user.avatarUrl) user_info_avatar_el.src = user.avatarUrl;
    }catch(e){ console.warn('set avatar failed', e); }
    try{
        if (user_info_name_el && typeof user.name !== 'undefined') user_info_name_el.textContent = user.name;
    }catch(e){ console.warn('set name failed', e); }
    try{
        if (user_info_school_el && typeof user.college !== 'undefined') user_info_school_el.textContent = user.college;
    }catch(e){ console.warn('set college failed', e); }
}

async function initTeachCourses() {
    const current = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!current) return;
    const user_id = current.id;
    const gotData = await getCoursesByTeacherId(user_id);
    // 调用示例
    console.log(gotData);
    const coursesCountainDiv = document.getElementsByClassName('course-list')[0];
    if (!coursesCountainDiv) return;
    coursesCountainDiv.innerHTML = '';
    for (let i = 0; i < (gotData && gotData.length ? gotData.length : 0); i++) {
        const course = gotData[i] || {};
        const courseId = course.id ?? course.courseId ?? '';
        const img = course.image_url || course.imageUrl || '';
        const name = course.name || '';
        const startTime = course.startTime || course.start_time || '';
        const college = course.college || '';
        const credits = course.credits || course.credit || '';
        // ensure courseId is safely embedded as a JS string literal inside onclick
        const safeCourseId = String(courseId ?? '').replace(/'/g, "\\'");
        let courseCard = `
            <div class="course-card" onclick="gotoCourseStudents('${safeCourseId}')">
                <img src="${img}" alt="${name}">
                <h3>${name}</h3>
                <div class="meta">
                    <span>${startTime}</span>
                    <span>${college}</span>
                    <span>${credits}学分</span>
                </div>
            </div>
        `;
        coursesCountainDiv.innerHTML += courseCard;
    }
}

async function gotoChats(studentID){
    // 从学生仪表盘跳转到聊天页；studentID 可为空，若提供则传递作为查询参数以优先显示该教师会话
    let url = '../chat.html';
    if (typeof studentID !== 'undefined' && studentID !== null && studentID !== '') {
        url += '?studentID=' + encodeURIComponent(studentID);
    }
    window.location.href = url;
}

async function gotoCourseStudents(courseId){
    // Validate input
    if (typeof courseId === 'undefined' || courseId === null || String(courseId).trim() === '') {
        console.warn('gotoCourseStudents: missing courseId');
        return;
    }
    // 跳转到课程学生名单页，传递 courseId 作为查询参数
    // The teacher dashboard and course_students are in the same folder, so use relative path
    window.location.href = 'course_students.html?courseId=' + encodeURIComponent(String(courseId));
}

// Navigate to the teacher checkin page for a given courseId
function gotoStartCheckin(courseId){
    if (typeof courseId === 'undefined' || courseId === null || String(courseId).trim() === '') return;
    // Teacher pages are located in the same folder; pass courseId as query param
    window.location.href = 'checkin.html?courseId=' + encodeURIComponent(String(courseId));
}

// expose for inline usage
try{ if (typeof window !== 'undefined') window.gotoStartCheckin = gotoStartCheckin; }catch(e){}

// expose for inline onclick usage
try{ if (typeof window !== 'undefined') window.gotoCourseStudents = gotoCourseStudents; }catch(e){}
