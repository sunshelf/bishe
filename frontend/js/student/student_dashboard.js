async function initStudentDashboard() {
    const viewedStudentId = getQueryParam('studentId');
    const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const isAdminViewing = viewedStudentId && currentUser && currentUser.role === 'admin';

    await initUserInfo(isAdminViewing ? viewedStudentId : null);
    await initStudyCourses(isAdminViewing ? viewedStudentId : null);
}

async function initUserInfo(studentId){
    let user = null;
    if (studentId) {
        // try to use getUserProfile if available
        if (typeof getUserProfile === 'function'){
            try{ user = await getUserProfile('student', studentId); }catch(e){ console.warn('getUserProfile failed', e); }
        }
        // fallback: try to fetch directly from REST endpoint
        if (!user){
            try{ const res = await fetch((typeof API_BASE !== 'undefined'? API_BASE : '') + '/api/users/' + encodeURIComponent(studentId)); if (res.ok) user = await res.json(); }catch(e){ /*ignore*/ }
        }
    }

    if (!user){
        // no viewed student provided or fetch failed: fall back to current user
        user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    }

    if (!user) {
        // 如果没有登录用户，重定向到登录页
        window.location.href = '../login.html';
        return;
    }

    const user_info_el = document.getElementsByClassName('user-info')[0];
    if (!user_info_el) return;
    const user_info_avatar_el = user_info_el.querySelector('img');
    const user_info_name_el = user_info_el.querySelector('p');
    const user_info_school_el = user_info_el.querySelector('span');
    // 修正字段名：avatarUrl, college
    try{ if (user_info_avatar_el) user_info_avatar_el.src = user.avatarUrl || '';}catch(e){}
    if (user_info_name_el) user_info_name_el.textContent = user.name || '';
    if (user_info_school_el) user_info_school_el.textContent = user.college || '';
}

async function initStudyCourses(studentId){
    // If studentId provided, show that student's courses (admin viewing); otherwise current user
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const viewedStudentId = studentId || (user ? user.id : null);
    const isAdminViewing = studentId && user && user.role === 'admin';
    if (!viewedStudentId){
        console.warn('No student id available to load courses');
        return;
    }
    const gotCourseData = await getCoursesByStudentId(viewedStudentId);
     console.log(gotCourseData);
     const coursesCountainDiv = document.getElementsByClassName('course-list')[0];
     coursesCountainDiv.innerHTML = '';
     for (let i = 0; i < gotCourseData.length; i++){
         //获取授课教师信息
         const courseId=gotCourseData[i].id;
         const image_url=gotCourseData[i].image_url;
         const courseName=gotCourseData[i].name;
         const startTime=gotCourseData[i].startTime;
         const college=gotCourseData[i].college;
         const credits=gotCourseData[i].credits;
        const courseTeacherData=await getTeacherByCourseId(courseId);
        const courseScoreData=await getStudentCourseScore(viewedStudentId,courseId);

        // pass readOnly flag when admin is viewing another student's dashboard
        const courseCard=setCourseCard(1,courseId,image_url, courseName,courseTeacherData.id, courseTeacherData.name, courseTeacherData.title, startTime, college,credits, courseScoreData && courseScoreData.score, { readOnly: !!isAdminViewing });
         coursesCountainDiv.innerHTML+=courseCard;
     }
}

// Navigate to student checkin page for a course
function gotoStudentCheckin(courseId){
    if (!courseId && courseId !== 0) return;
    // student checkin page is located at pages/student/checkin.html relative to student dashboard
    // if current HTML is pages/student/dashboard.html, use relative path
    const base = window.location.pathname || '';
    // use relative navigation assuming same folder
    window.location.href = 'checkin.html?courseId=' + encodeURIComponent(String(courseId));
}

// expose helper for inline onclick usage
try{ if (typeof window !== 'undefined') window.gotoStudentCheckin = gotoStudentCheckin; }catch(e){}

// exit button function
async function exitButtonFunc(){
    try {
        // clearCurrentUser is defined in ../../js/login.js which is already included above
        if (typeof clearCurrentUser === 'function') clearCurrentUser();
    } catch (e) {
        // ignore
    }
    // Redirect back to the app root (index.html)
    window.location.href = '../../index.html';
}

async function subscribeNewCrouses(){
    initUnsubscribedCrouses();
}

async function initUnsubscribedCrouses(){
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const userId = user ? user.id : null;
    const gotCourseData = await getUnsubscribedCoursesByStudentId(userId);
    console.log(gotCourseData);
    const coursesCountainDiv = document.getElementsByClassName('course-list')[0];
    coursesCountainDiv.innerHTML = '';
    for (let i = 0; i < gotCourseData.length; i++){
        //获取授课教师信息
        const courseId=gotCourseData[i].id;
        const image_url=gotCourseData[i].image_url;
        const courseName=gotCourseData[i].name;
        const startTime=gotCourseData[i].startTime;
        const college=gotCourseData[i].college;
        const credits=gotCourseData[i].credits;
        const courseTeacherData=await getTeacherByCourseId(courseId);
        let courseCard=setCourseCard(0,courseId,image_url, courseName,courseTeacherData.id, courseTeacherData.name, courseTeacherData.title, startTime, college,credits, 0, { readOnly: false });
        coursesCountainDiv.innerHTML+=courseCard;
    }
}

async function tabNavsControl(index){
    const tab_navs = document.querySelectorAll('.tab-nav a');
    if (index < 0 || index >= tab_navs.length) return;
    tab_navs.forEach(el => el.classList.remove('active'));
    tab_navs[index].classList.add('active');

    if(index===0){
        initStudyCourses();
    }else if(index===1){
        subscribeNewCrouses();
    }else if(index===2){
        // 签到 tab should open the dedicated student check-in page, not the report view
        gotoStudentCheckin((getCurrentUser && getCurrentUser() && getCurrentUser().id) ? getCurrentUser().id : '');
    }else if(index===3){
        initReport();
    }
}
//订阅课程逻辑
async function subscribeCourseButtonFunc(studentId,courseId){
    const re=await giveSubscribeCourse(studentId,courseId);
    if(re){
        console.log('订阅成功');
        //刷新
        location.reload();
    }else{
        alert("订阅失败，请稍后再试");
    }
}

//生成学习报告
async function initReport(){
    const coursesCountainDiv = document.getElementsByClassName('course-list')[0];
    coursesCountainDiv.innerHTML = '';

    const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!user) {
        coursesCountainDiv.innerHTML = '<p>未检测到用户，请先登录。</p>';
        return;
    }

    try{
        // 获取学生已订阅/已选课程（与 initStudyCourses 使用同一接口）
        const courses = await getCoursesByStudentId(user.id) || [];
        const total = courses.length;

        // 并行获取每门课的成绩（若接口未返回则视为未完成）
        const scorePromises = courses.map(c => getStudentCourseScore(user.id, c.id).catch(() => ({ score: null })));
        const scoreResults = await Promise.all(scorePromises);

        let completedCount = 0;
        let scoreSum = 0;
        let scoreCount = 0;
        const passThreshold = 60; // 及格线，可根据需要调整
        let passCount = 0;

        // 课程明细 HTML 列表
        const listItems = courses.map((c, idx) => {
            const res = scoreResults[idx] || {};
            // 支撑后端返回 {score: null} 或 {score: number}
            const sc = (res && typeof res.score !== 'undefined') ? res.score : null;
            let scoreText = '未完成';
            let statusClass = 'pending';
            let statusLabel = '未完成';
            if (sc !== null && !isNaN(Number(sc))) {
                const n = Number(sc);
                scoreText = `${n}`;
                completedCount++;
                scoreSum += n;
                scoreCount++;
                if (n >= passThreshold) { passCount++; statusClass = 'pass'; statusLabel = '通过'; } else { statusClass = 'fail'; statusLabel = '未通过'; }
            }
            // nicer list item with badge
            const courseName = escapeHtml(c.name || c.courseName || '课程');
            const badge = `<span class="badge ${statusClass}">${statusLabel}</span>`;
            const scoreDisplay = sc === null ? '<span class="score-text">—</span>' : `<span class="score-text">${scoreText}</span>`;
            return `<li><div class="course-name">${courseName}</div><div class="course-meta">${scoreDisplay}${badge}</div></li>`;
        });

        const avg = scoreCount > 0 ? (scoreSum / scoreCount) : null;
        const avgDisplay = avg === null ? '—' : (Math.round(avg * 100) / 100);
        const avgPercent = avg === null ? 0 : Math.max(0, Math.min(100, Math.round(avg)));
        const passRate = scoreCount > 0 ? Math.round((passCount / scoreCount) * 100) : 0;

        const html = `
            <div class="report-card">
                <h3>学习报告</h3>
                <div class="report-summary">
                    <p>已订阅课程数：<strong>${total}</strong></p>
                    <p>已完成课程数：<strong>${completedCount}</strong></p>
                    <p>未完成课程数：<strong>${total - completedCount}</strong></p>
                    <p>平均分（已完成）：
                        <strong>${avgDisplay}</strong>
                    </p>
                    <p>及格率（已完成）：<strong>${passRate}%</strong></p>
                </div>
                <div class="report-list">
                    <h4>课程明细</h4>
                    <ul>
                        ${listItems.join('\n')}
                    </ul>
                </div>
            </div>
        `;

        coursesCountainDiv.innerHTML = html;

        // trigger score-fill animation after insertion
        try{
            const fill = coursesCountainDiv.querySelector('.score-fill');
            if(fill){
                const p = Number(fill.getAttribute('data-percent')) || 0;
                // allow layout, then animate
                requestAnimationFrame(()=>{
                    requestAnimationFrame(()=>{
                        fill.style.width = p + '%';
                    });
                });
            }
        }catch(e){/* ignore animation errors */}

    }catch(err){
        console.error('生成学习报告时出错', err);
        coursesCountainDiv.innerHTML = '<p>生成学习报告失败，请重试。</p>';
    }
}

// helper to avoid XSS when injecting course names
function escapeHtml(str){
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Unified: navigate to chapters selection page for a course
function gotoDoExcercisesWindow(courseId){
    if (!courseId && courseId !== 0) return;
    console.log('[nav] gotoDoExcercisesWindow -> chapters, courseId=', courseId);
    // always open chapters so user can pick a chapter first
    window.location.href = '../student/chapters.html?courseId=' + encodeURIComponent(String(courseId));
}

async function gotoChats(teacherID){
    // 从学生仪表盘跳转到聊天页；teacherID 可为空，若提供则传递作为查询参数以优先显示该教师会话
    let url = '../chat.html';
    if (typeof teacherID !== 'undefined' && teacherID !== null && teacherID !== '') {
        url += '?teacherId=' + encodeURIComponent(teacherID);
    }
    window.location.href = url;
}
function setCourseCard(type,courseId,image_url, courseName,teacherId, teacherName, teacherTitle,startTime, college, credits,score, opts={}){
    //type 0:预选 1:已选
    let courseCard="";
    const readOnly = !!opts.readOnly;
    const userId= (typeof getCurrentUser === 'function') ? getCurrentUser().id : null;
    if(type==0){
         courseCard=`
            <div class="course-card" data-course-id="${courseId}">
                <img src="${image_url}" alt="${courseName}">
                <h3>${courseName}</h3>
                <div class="meta">
                    <span>${teacherName}&nbsp;${teacherTitle}</span>
                    ${readOnly ? '' : `<button onclick="subscribeCourseButtonFunc(${userId},${courseId})"> 订阅</button>`}
                    <button onclick="gotoChats(${teacherId})">私聊</button>

                </div>                
                <div class="meta">
                    <span>${startTime}</span>
                    <span>${college}</span>
                    <span>${credits}学分</span>
                </div>
            </div>
        `
    }
    else if(type==1){
        courseCard=`
            <div class="course-card" data-course-id="${courseId}">
                <img src="${image_url}" alt="${courseName}">
                <h3>${courseName}</h3>
                <div class="meta">
                    <span>${teacherName}&nbsp;${teacherTitle}</span>
                    <span>成绩：${score}</span>
                    ${readOnly ? '' : `<button onclick="gotoDoExcercisesWindow(${courseId})">做题</button>`}
                    <button onclick="gotoChats(${teacherId})">私聊</button>
                </div>                
                <div class="meta">
                    <span>${startTime}</span>
                    <span>${college}</span>
                    <span>${credits}学分</span>
                </div>
            </div>
        `
    }
    return courseCard;
}

// helper to read query params
function getQueryParam(name){ try{ const p = new URLSearchParams(window.location.search); return p.get(name); }catch(e){ return null; } }

// Provide aliases used by static HTML (gotoDoExercises and toggleSubscribe)
function gotoDoExercises(courseId){
    if (!courseId && courseId !== 0) return;
    console.log('[nav] gotoDoExercises -> chapters, courseId=', courseId);
    window.location.href = '../student/chapters.html?courseId=' + encodeURIComponent(String(courseId));
}

try {
    if (typeof window !== 'undefined') {
        window.gotoDoExcercisesWindow = gotoDoExcercisesWindow;
        window.gotoDoExercises = gotoDoExercises;
    }
} catch (e) {}

async function toggleSubscribe(courseId, btnEl){
    try{
        // call subscribe helper
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const uid = user ? user.id : null;
        if (!uid){ alert('请先登录'); return; }
        await subscribeCourseButtonFunc(uid, courseId);
        // if a button element provided, mark subscribed visually
        if (btnEl && btnEl.classList){
            btnEl.classList.add('subscribed');
        }
    }catch(e){ console.warn('toggleSubscribe failed', e); }
}

// expose some functions globally (so inline onclick in returned HTML can call them)
try{ if (typeof window !== 'undefined'){
    window.gotoDoExcercisesWindow = gotoDoExcercisesWindow;
    window.gotoDoExercises = gotoDoExercises;
    window.subscribeCourseButtonFunc = subscribeCourseButtonFunc;
    window.toggleSubscribe = toggleSubscribe;
    window.gotoChats = function(teacherId){ let url = '../chat.html'; if (teacherId) url += '?teacherId=' + encodeURIComponent(teacherId); window.location.href = url; };
} }catch(e){}
