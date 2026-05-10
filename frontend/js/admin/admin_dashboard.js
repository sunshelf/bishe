(function(){
    // Simple admin dashboard JS to manage users, create students/teachers, query scores and participation
    console.log('[admin_dashboard] script loaded');
    const tabs = document.getElementById('tabs');
    const panes = { roles: document.getElementById('pane-roles'), courses: document.getElementById('pane-courses'), add: document.getElementById('pane-add'), manage: document.getElementById('pane-manage') };

    function switchTab(name){
        for(const el of tabs.querySelectorAll('.tab')) el.classList.toggle('active', el.dataset.tab===name);
        for(const k of Object.keys(panes)) panes[k].style.display = (k===name? 'block':'none');
        // auto-load courses when showing courses pane
        if (name === 'courses' && typeof loadAllCourses === 'function'){
            loadAllCourses().catch(e=>console.warn('loadAllCourses failed', e));
        }
        // initialize course manager when showing manage pane (inline, only once)
        if (name === 'manage' && typeof window.initCourseManager === 'function'){
            if (!window.__cm_inited) {
                try { window.initCourseManager(); window.__cm_inited = true; } catch(e){ console.warn('initCourseManager failed', e); }
            }
        }
    }
    tabs.addEventListener('click', (e)=>{ const t = e.target.closest('.tab'); if(t) switchTab(t.dataset.tab); });

    // Users table and sorting
    const usersTable = document.getElementById('usersTable');
    const usersTbody = usersTable.querySelector('tbody');
    const btnRefreshUsers = document.getElementById('btnRefreshUsers');
    let usersCache = []; // array of user objects
    let currentSort = { key: 'id', dir: 1 };

    function renderUsers(){
        usersTbody.innerHTML = '';
        if (!Array.isArray(usersCache) || usersCache.length===0){
            usersTbody.innerHTML = '<tr><td colspan="4" class="muted small">无用户</td></tr>';
            return;
        }
        // sort
        const arr = [...usersCache].sort((a,b)=>{
            const A = (a[currentSort.key] == null ? '' : String(a[currentSort.key])).toLowerCase();
            const B = (b[currentSort.key] == null ? '' : String(b[currentSort.key])).toLowerCase();
            if (A < B) return -1 * currentSort.dir; if (A > B) return 1 * currentSort.dir; return 0;
        });
        for(const u of arr){
             const tr = document.createElement('tr');
             const id = u.id ?? u.userId ?? u._id ?? '';
             const name = u.name || u.username || '';
             const role = u.role || 'student';
             const college = u.college || u.department || '';
             // read-only row
             tr.dataset.userid = String(id);
             tr.dataset.role = String(role);
             tr.innerHTML = `<td>${escapeHtml(String(id))}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(role)}</td><td>${escapeHtml(college)}</td>`;
             usersTbody.appendChild(tr);
         }
     }

    // clicking a row shows the student's learning report in a modal (admin view)
    usersTbody.addEventListener('click', (e)=>{
        const tr = e.target.closest('tr');
        if (!tr || !tr.dataset) return;
        const uid = tr.dataset.userid;
        const role = tr.dataset.role;
        if (!uid) return;
        if (role === 'student'){
            renderStudentReport(uid).catch(err => console.error('renderStudentReport failed', err));
        } else if (role === 'teacher'){
            renderTeacherReport(uid).catch(err => console.error('renderTeacherReport failed', err));
        } else {
            console.debug('clicked user', uid, role);
        }
    });

    // render a modal containing the student's learning report
    async function renderStudentReport(studentId){
        if (!studentId) return;
        // create modal container
        const existing = document.getElementById('studentReportModal');
        if (existing) existing.remove();
        const modal = document.createElement('div');
        modal.id = 'studentReportModal';
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0,0,0,0.4)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '9999';

        const card = document.createElement('div');
        card.style.width = '820px';
        card.style.maxWidth = '95%';
        card.style.maxHeight = '90%';
        card.style.overflow = 'auto';
        card.style.background = '#fff';
        card.style.borderRadius = '12px';
        card.style.padding = '20px';
        card.style.boxShadow = '0 12px 40px rgba(2,6,23,0.2)';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.float = 'right';
        closeBtn.style.background = '#ef4444';
        closeBtn.style.border = 'none';
        closeBtn.style.color = '#fff';
        closeBtn.style.padding = '6px 10px';
        closeBtn.style.borderRadius = '8px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', ()=> modal.remove());

        const title = document.createElement('h2');
        title.textContent = '学生学习报告';
        title.style.marginTop = '6px';

        const content = document.createElement('div');
        content.innerHTML = '<p class="muted">加载中…</p>';

        card.appendChild(closeBtn);
        card.appendChild(title);
        card.appendChild(content);
        modal.appendChild(card);
        document.body.appendChild(modal);

        try{
            // fetch profile if possible
            let profile = null;
            if (typeof getUserProfile === 'function'){
                try{ profile = await getUserProfile('student', studentId); }catch(e){ console.warn('getUserProfile failed', e); }
            }
            if (!profile){
                // try REST fallback
                try{ const res = await fetch((typeof API_BASE !== 'undefined') + '/api/users/' + encodeURIComponent(studentId)); if (res.ok) profile = await res.json(); }catch(e){}
            }

            // courses and scores
            const courses = Array.isArray(await (typeof getCoursesByStudentId === 'function' ? getCoursesByStudentId(studentId) : fetch((typeof API_BASE !== 'undefined'?API_BASE:'') + '/api/student-courses?studentId='+encodeURIComponent(studentId)).then(r=>r.ok?r.json():[]))) ? await (typeof getCoursesByStudentId === 'function' ? getCoursesByStudentId(studentId) : fetch((typeof API_BASE !== 'undefined'?API_BASE:'') + '/api/student-courses?studentId='+encodeURIComponent(studentId)).then(r=>r.ok?r.json():[])) : [];
            // ensure courses is array
            const courseList = Array.isArray(courses) ? courses : [];

            // fetch scores for each course in parallel
            const scorePromises = courseList.map(c => {
                if (typeof getStudentCourseScore === 'function') return getStudentCourseScore(studentId, c.id).catch(()=>({ score: null }));
                // fallback: try /api/student-course-score?studentId=&courseId=
                return fetch((typeof API_BASE !== 'undefined'?API_BASE:'') + '/api/student-course-score?studentId=' + encodeURIComponent(studentId) + '&courseId=' + encodeURIComponent(c.id)).then(r=>r.ok?r.json():{ score: null }).catch(()=>({ score: null }));
            });
            const scoreResults = await Promise.all(scorePromises);

            // compute metrics
            const total = courseList.length;
            let completedCount = 0, passCount = 0, sum = 0, counted = 0;
            const passThreshold = 60;
            const rows = courseList.map((c, idx) => {
                const scObj = scoreResults[idx] || {};
                const sc = (scObj && typeof scObj.score !== 'undefined') ? scObj.score : null;
                if (sc !== null && !isNaN(Number(sc))){ completedCount++; counted++; sum += Number(sc); if (Number(sc) >= passThreshold) passCount++; }
                return { course: c, score: sc };
            });

            const avg = counted ? Math.round((sum / counted) * 100) / 100 : null;
            const completionRate = total ? Math.round((completedCount / total) * 100) : 0;
            const passRate = completedCount ? Math.round((passCount / completedCount) * 100) : 0;

            // render HTML
            let html = `<div style="margin-top:6px"><strong>学生：</strong>${escapeHtml(profile && profile.name ? profile.name : ('ID ' + studentId))}`;
            html += profile && profile.college ? ` <span style="color:var(--muted)">(${escapeHtml(profile.college)})</span>` : '';
            html += `</div>`;
            html += `<div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap">`;
            html += `<div style="background:#f8fafc;padding:10px;border-radius:8px;min-width:120px">课程数<br><strong>${total}</strong></div>`;
            html += `<div style="background:#fff7ed;padding:10px;border-radius:8px;min-width:120px">完成率<br><strong>${completionRate}%</strong></div>`;
            html += `<div style="background:#ecfdf5;padding:10px;border-radius:8px;min-width:120px">及格率<br><strong>${passRate}%</strong></div>`;
            html += `<div style="background:#eef2ff;padding:10px;border-radius:8px;min-width:120px">平均分<br><strong>${avg===null? '—' : avg}</strong></div>`;
            html += `</div>`;

            html += '<hr style="margin:12px 0">';
            html += '<div><h3>课程明细</h3>';
            if (rows.length === 0) html += '<p class="muted">该学生暂无课程记录。</p>'; else {
                html += '<table style="width:100%;border-collapse:collapse">';
                html += '<thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eef">课程</th><th style="padding:8px;border-bottom:1px solid #eef">分数</th><th style="padding:8px;border-bottom:1px solid #eef">状态</th></tr></thead>';
                html += '<tbody>';
                rows.forEach(r=>{
                    const cname = escapeHtml(r.course.name || r.course.courseName || ('课程 ' + (r.course.id||'')));
                    const sc = r.score == null ? '未完成' : String(r.score);
                    let status = '未完成';
                    if (r.score != null && !isNaN(Number(r.score))){ status = Number(r.score) >= passThreshold ? '及格' : '未及格'; }
                    html += `<tr><td style="padding:8px;border-bottom:1px solid #f4f6fb">${cname}</td><td style="padding:8px;border-bottom:1px solid #f4f6fb">${escapeHtml(sc)}</td><td style="padding:8px;border-bottom:1px solid #f4f6fb">${status}</td></tr>`;
                });
                html += '</tbody></table>';
            }
            html += '</div>';

            content.innerHTML = html;
        }catch(err){
            console.error(err);
            content.innerHTML = '<p class="muted">加载失败：'+escapeHtml(String(err))+'</p>';
        }

        // close on backdrop click or ESC
        modal.addEventListener('click', (ev)=>{ if (ev.target === modal) modal.remove(); });
        document.addEventListener('keydown', function onEsc(e){ if (e.key === 'Escape'){ modal.remove(); document.removeEventListener('keydown', onEsc); } });
    }

    // render a simple modal containing the teacher's basic info and their courses
    async function renderTeacherReport(teacherId){
        if (!teacherId) return;
        const existing = document.getElementById('teacherReportModal'); if (existing) existing.remove();
        const modal = document.createElement('div'); modal.id='teacherReportModal'; modal.style.position='fixed'; modal.style.left='0'; modal.style.top='0'; modal.style.width='100%'; modal.style.height='100%'; modal.style.background='rgba(0,0,0,0.4)'; modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.zIndex='9999';
        const card = document.createElement('div'); card.style.width='760px'; card.style.maxWidth='95%'; card.style.maxHeight='90%'; card.style.overflow='auto'; card.style.background='#fff'; card.style.borderRadius='12px'; card.style.padding='18px'; card.style.boxShadow='0 12px 40px rgba(2,6,23,0.2)';
        const close = document.createElement('button'); close.textContent='关闭'; close.style.float='right'; close.style.background='#ef4444'; close.style.color='#fff'; close.style.border='none'; close.style.padding='6px 10px'; close.style.borderRadius='8px'; close.style.cursor='pointer'; close.addEventListener('click', ()=> modal.remove());
        const title = document.createElement('h2'); title.textContent = '教师信息'; title.style.marginTop='6px';
        const content = document.createElement('div'); content.innerHTML = '<p class="muted">加载中…</p>';
        card.appendChild(close); card.appendChild(title); card.appendChild(content); modal.appendChild(card); document.body.appendChild(modal);

        try{
            // try helper first
            let profile = null;
            if (typeof getUserProfile === 'function'){
                try{ profile = await getUserProfile('teacher', teacherId); }catch(e){ console.warn('getUserProfile failed', e); }
            }
            if (!profile){
                try{ const res = await fetch((typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/teachers/' + encodeURIComponent(teacherId)); if (res.ok) profile = await res.json(); }catch(e){}
            }

            // courses taught
            let courses = [];
            if (typeof getCoursesByTeacherId === 'function'){
                try{ courses = await getCoursesByTeacherId(teacherId); }catch(e){ console.warn('getCoursesByTeacherId failed', e); courses = []; }
            } else {
                // fallback: try teacher-courses relation + course fetch
                try{
                    const relRes = await fetch((typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/teacher-courses');
                    if (relRes.ok){
                        const rels = await relRes.json();
                        const ids = (Array.isArray(rels) ? rels.filter(r=>String(r.teacherId)===String(teacherId)).map(r=>r.courseId) : []);
                        const uniq = [...new Set(ids)];
                        const p = uniq.map(id=> fetch((typeof API_BASE !== 'undefined' ? API_BASE : '') + '/api/courses/' + encodeURIComponent(id)).then(r=>r.ok?r.json():null).catch(()=>null));
                        const res = await Promise.all(p);
                        courses = res.filter(Boolean);
                    }
                }catch(e){ console.warn('fallback course fetch failed', e); }
            }

            // build html
            let html = '<div style="display:flex;gap:12px;align-items:center">';
            if (profile && profile.avatarUrl){ html += `<img src="${escapeHtml(profile.avatarUrl)}" alt="avatar" style="width:72px;height:72px;border-radius:10px;object-fit:cover">`; }
            html += '<div>';
            html += `<div style="font-size:18px;font-weight:700">${escapeHtml((profile && profile.name) ? profile.name : ('ID ' + teacherId))}</div>`;
            if (profile && profile.title) html += `<div class="muted" style="margin-top:4px">${escapeHtml(profile.title)}</div>`;
            if (profile && profile.college) html += `<div class="muted" style="margin-top:6px">${escapeHtml(profile.college)}</div>`;
            html += '</div></div>';

            html += `<div style="margin-top:14px;display:flex;gap:12px;flex-wrap:wrap">`;
            html += `<div style="background:#f8fafc;padding:10px;border-radius:8px;min-width:120px">课程数<br><strong>${Array.isArray(courses)?courses.length:0}</strong></div>`;
            html += `</div>`;

            html += '<hr style="margin:12px 0">';
            html += '<div><h3>课程列表</h3>';
            if (!Array.isArray(courses) || courses.length===0){ html += '<p class="muted">该教师暂无课程。</p>'; } else {
                html += '<table style="width:100%;border-collapse:collapse">';
                html += '<thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #eef">课程</th><th style="padding:8px;border-bottom:1px solid #eef">学院</th><th style="padding:8px;border-bottom:1px solid #eef">开始时间</th></tr></thead>';
                html += '<tbody>';
                courses.forEach(c=>{
                    const id = escapeHtml(String(c.id || c.courseId || ''));
                    const name = escapeHtml(c.name || c.courseName || ('课程 ' + id));
                    const college = escapeHtml(c.college || '');
                    const st = escapeHtml(c.startTime || c.start || '');
                    html += `<tr><td style="padding:8px;border-bottom:1px solid #f4f6fb">${name}</td><td style="padding:8px;border-bottom:1px solid #f4f6fb">${college}</td><td style="padding:8px;border-bottom:1px solid #f4f6fb">${st}</td></tr>`;
                });
                html += '</tbody></table>';
            }
            html += '</div>';

            content.innerHTML = html;
        }catch(err){
            console.error(err);
            content.innerHTML = '<p class="muted">加载失败：'+escapeHtml(String(err))+'</p>';
        }

        modal.addEventListener('click', (ev)=>{ if (ev.target===modal) modal.remove(); });
        document.addEventListener('keydown', function onEsc(e){ if (e.key==='Escape'){ modal.remove(); document.removeEventListener('keydown', onEsc);} });
    }

    const base = (typeof API_BASE !== 'undefined') ? API_BASE : '';

    // load all users: use getData helpers when available, otherwise fallback to REST endpoints under API_BASE
    async function loadAllUsers(){
        usersTbody.innerHTML = '<tr><td colspan="4" class="muted small">加载中…</td></tr>';
        try{
            let students = [];
            let teachers = [];
            // Prefer using helpers from getData.js
            if (typeof getAllStudents === 'function'){
                try{ students = await getAllStudents(); }catch(e){ console.warn('getAllStudents failed', e); students = []; }
            } else {
                try{ const s = await fetch(base + '/api/students'); if (s.ok) students = await s.json(); }catch(e){ students = []; }
            }
            if (typeof getAllTeachers === 'function'){
                try{ teachers = await getAllTeachers(); }catch(e){ console.warn('getAllTeachers failed', e); teachers = []; }
            } else {
                try{ const t = await fetch(base + '/api/teachers'); if (t.ok) teachers = await t.json(); }catch(e){ teachers = []; }
            }

            // Merge students and teachers into a unified users array
            const data = [];
            if (Array.isArray(students)) data.push(...students.map(u => ({ ...u, role: u.role || 'student' })));
            if (Array.isArray(teachers)) data.push(...teachers.map(u => ({ ...u, role: u.role || 'teacher' })));
            usersCache = data;
            renderUsers();
        }catch(e){ usersTbody.innerHTML = '<tr><td colspan="4" class="muted small">加载失败：'+String(e)+'</td></tr>'; }
    }

    // click on header to change sort
    usersTable.querySelectorAll('th[data-key]').forEach(h=>{
        h.addEventListener('click', ()=>{
            const key = h.dataset.key;
            if (currentSort.key === key) currentSort.dir = -currentSort.dir; else { currentSort.key = key; currentSort.dir = 1; }
            renderUsers();
        });
    });

    btnRefreshUsers.addEventListener('click', ()=> loadAllUsers());

    // --- Courses pane wiring ---
    const btnRefreshCourses = document.getElementById('btnRefreshCourses');
    const coursesTable = document.getElementById('coursesTable');

    async function loadAllCourses(){
        const tbody = coursesTable.querySelector('tbody');
        tbody.innerHTML = '<tr><td colspan="5" class="muted small">加载中…</td></tr>';
        try{
            const data = (typeof getAllCourses === 'function') ? await getAllCourses() : (await fetch((typeof API_BASE !== 'undefined'?API_BASE:'') + '/api/courses').then(r=>r.ok?r.json():[]));
            if (!Array.isArray(data) || data.length===0){ coursesCache = []; renderCourses(); return; }
            // cache and render via renderCourses (so sorting works)
            coursesCache = data;
            renderCourses();
        }catch(e){ tbody.innerHTML = '<tr><td colspan="5" class="muted small">加载失败：'+escapeHtml(String(e))+'</td></tr>'; }
    }

    // --- Courses sorting/rendering utilities ---
    let coursesCache = [];
    let courseSort = { key: 'id', dir: 1 };

    function renderCourses(){
        const tbody = coursesTable.querySelector('tbody');
        tbody.innerHTML = '';
        if (!Array.isArray(coursesCache) || coursesCache.length === 0){
            tbody.innerHTML = '<tr><td colspan="5" class="muted small">无课程数据</td></tr>';
            return;
        }
        const arr = [...coursesCache].sort((a,b)=>{
            const A = (a[courseSort.key] == null ? '' : String(a[courseSort.key])).toLowerCase();
            const B = (b[courseSort.key] == null ? '' : String(b[courseSort.key])).toLowerCase();
            if (A < B) return -1 * courseSort.dir; if (A > B) return 1 * courseSort.dir; return 0;
        });
        for (const c of arr){
            const tr = document.createElement('tr');
            tr.dataset.courseid = String(c.id || c.courseId || '');
            const id = c.id || c.courseId || '';
            const name = c.name || c.courseName || '';
            const college = c.college || '';
            const credits = c.credits != null ? c.credits : '';
            const startTime = c.startTime || c.start || '';
            tr.innerHTML = `<td>${escapeHtml(String(id))}</td><td>${escapeHtml(name)}</td><td>${escapeHtml(college)}</td><td>${escapeHtml(String(credits))}</td><td>${escapeHtml(startTime)}</td>`;
            tbody.appendChild(tr);
        }
    }

    if (btnRefreshCourses){ btnRefreshCourses.addEventListener('click', ()=> loadAllCourses()); }

    // clicking a course row opens the course modal (only tbody rows)
    if (coursesTable){
        coursesTable.addEventListener('click', (e)=>{
            const tr = e.target.closest('tr');
            if (!tr) return;
            // ignore clicks on thead/header rows
            const tbody = tr.closest('tbody');
            if (!tbody) return;
            const cid = tr.dataset.courseid || tr.dataset.courseId;
            if (!cid) return;
            renderCourseModal(cid).catch(err=>console.error('renderCourseModal failed', err));
        });
    }

    async function renderCourseModal(courseId){
        // remove existing
        const existing = document.getElementById('courseModal'); if (existing) existing.remove();
        const modal = document.createElement('div'); modal.id='courseModal'; modal.style.position='fixed'; modal.style.left='0'; modal.style.top='0'; modal.style.width='100%'; modal.style.height='100%'; modal.style.background='rgba(0,0,0,0.4)'; modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.zIndex='9999';
        const card = document.createElement('div'); card.style.width='760px'; card.style.maxWidth='95%'; card.style.maxHeight='90%'; card.style.overflow='auto'; card.style.background='#fff'; card.style.borderRadius='12px'; card.style.padding='18px'; card.style.boxShadow='0 12px 40px rgba(2,6,23,0.2)';
        const close = document.createElement('button'); close.textContent='关闭'; close.style.float='right'; close.style.background='#ef4444'; close.style.color='#fff'; close.style.border='none'; close.style.padding='6px 10px'; close.style.borderRadius='8px'; close.style.cursor='pointer'; close.addEventListener('click', ()=> modal.remove());
        const title = document.createElement('h2'); title.textContent = '课程详情'; title.style.marginTop='6px';
        const content = document.createElement('div'); content.innerHTML = '<p class="muted">加载中…</p>';
        card.appendChild(close); card.appendChild(title); card.appendChild(content); modal.appendChild(card); document.body.appendChild(modal);

        try{
            // fetch course detail
            let course = null;
            try{ course = await (typeof getAllCourses === 'function' ? (async ()=>{ const all=await getAllCourses(); return all.find(x=>String(x.id)==String(courseId) || String(x.courseId)==String(courseId)); })() : null); }catch(e){ console.warn(e); }
            if (!course){ try{ const res = await fetch((typeof API_BASE !== 'undefined'?API_BASE:'') + '/api/courses/' + encodeURIComponent(courseId)); if (res.ok) course = await res.json(); }catch(e){} }
            // teacher info
            let teacher = null;
            try{ if (typeof getTeacherByCourseId === 'function') teacher = await getTeacherByCourseId(courseId); }catch(e){ console.warn(e); }
            // students enrolled
            let studentIds = [];
            try{ if (typeof getStudentIdsByCourseId === 'function') studentIds = await getStudentIdsByCourseId(courseId); }catch(e){ console.warn(e); }
            // compute average score if possible
            const scorePromises = (studentIds || []).map(sid => (typeof getStudentCourseScore === 'function') ? getStudentCourseScore(sid, courseId).catch(()=>null) : fetch((typeof API_BASE !== 'undefined'?API_BASE:'') + '/api/student-courses/' + encodeURIComponent(sid) + '/' + encodeURIComponent(courseId)).then(r=>r.ok?r.json():null).catch(()=>null));
            const scoreRes = await Promise.all(scorePromises);
            const scores = scoreRes.map(r=> (r && typeof r.score !== 'undefined') ? Number(r.score) : null).filter(s=>s!==null && !isNaN(s));
            const avg = scores.length ? Math.round((scores.reduce((a,b)=>a+b,0)/scores.length) * 100) / 100 : null;

            let html = '<div>';
            html += `<p><strong>课程：</strong>${escapeHtml(course && (course.name||course.courseName) || ('ID ' + courseId))}</p>`;
            html += `<p><strong>学院：</strong>${escapeHtml(course && course.college || '')} &nbsp; <strong>学分：</strong>${escapeHtml(String(course && course.credits || ''))}</p>`;
            html += `<p><strong>教师：</strong>${teacher ? escapeHtml(teacher.name || '') + ' ('+escapeHtml(teacher.title||'')+')' : '<span class="muted">未知</span>'}</p>`;
            html += `<p><strong>订阅人数：</strong>${(studentIds && studentIds.length) || 0} &nbsp; <strong>平均分：</strong>${avg===null? '—' : avg}</p>`;
            html += '</div>';
            content.innerHTML = html;
        }catch(err){ console.error(err); content.innerHTML = '<p class="muted">加载失败：'+escapeHtml(String(err))+'</p>'; }
        modal.addEventListener('click', (ev)=>{ if (ev.target===modal) modal.remove(); });
        document.addEventListener('keydown', function onEsc(e){ if (e.key==='Escape'){ modal.remove(); document.removeEventListener('keydown', onEsc);} });
    }

    // escape helper (reuse simple approach)
    function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

    // init load
    document.addEventListener('DOMContentLoaded', ()=>{
        loadAllUsers().catch(e=>console.warn('loadAllUsers failed', e));
        // bind admin logout (navigate back) if present
        try{
            const adminLogout = document.getElementById('adminLogoutBtn');
            if (adminLogout) {
                adminLogout.addEventListener('click', ()=>{
                    try{
                        if (window.history && window.history.length > 1) window.history.back();
                        else window.location.href = '..';
                    }catch(e){ console.warn('adminLogout navigation failed', e); }
                });
            }
        }catch(e){ console.warn('bind adminLogout failed', e); }
    });

    // bind course table header clicks for sorting
    try{
        const courseThs = document.querySelectorAll('#coursesTable thead th[data-key]');
        courseThs.forEach(h=>{
            h.addEventListener('click', ()=>{
                const key = h.dataset.key;
                if (courseSort.key === key) courseSort.dir = -courseSort.dir; else { courseSort.key = key; courseSort.dir = 1; }
                renderCourses();
            });
        });
    }catch(e){ /* ignore if DOM not ready */ }

    // --- 新增用户 表单绑定 ---
    try{
        const btnAddStudent = document.getElementById('btnAddStudent');
        const btnAddTeacher = document.getElementById('btnAddTeacher');
        const studentName = document.getElementById('studentName');
        const studentCollege = document.getElementById('studentCollege');
        const studentGrade = document.getElementById('studentGrade');
        const studentAvatar = document.getElementById('studentAvatar');
        const studentPassword = document.getElementById('studentPassword');

        const teacherName = document.getElementById('teacherName');
        const teacherCollege = document.getElementById('teacherCollege');
        const teacherTitle = document.getElementById('teacherTitle');
        const teacherAvatar = document.getElementById('teacherAvatar');
        const teacherPassword = document.getElementById('teacherPassword');

        async function addStudentHandler(){
            console.log('[admin_dashboard] addStudentHandler invoked');
            if (!btnAddStudent) return;
            const name = (studentName && studentName.value) ? studentName.value.trim() : '';
            const college = (studentCollege && studentCollege.value) ? studentCollege.value.trim() : '';
            const grade = (studentGrade && studentGrade.value) ? studentGrade.value.trim() : '';
            const avatarUrl = (studentAvatar && studentAvatar.value) ? studentAvatar.value.trim() : '';
            const password = (studentPassword && studentPassword.value) ? studentPassword.value : '';

            if (!name){ alert('请输入学生姓名'); return; }
            if (!password){ alert('请输入密码'); return; }

            try{
                btnAddStudent.disabled = true;
                btnAddStudent.textContent = '新增中…';
                const created = await addStudent({ name, college, grade, avatarUrl, password });
                alert('学生创建成功：' + (created && (created.name || created.id) ? (created.name || ('ID ' + created.id)) : '已创建'));
                // clear fields
                if (studentName) studentName.value = '';
                if (studentCollege) studentCollege.value = '';
                if (studentGrade) studentGrade.value = '';
                if (studentAvatar) studentAvatar.value = '';
                if (studentPassword) studentPassword.value = '';
                // refresh list and switch to roles tab
                await loadAllUsers();
                switchTab('roles');
            }catch(err){
                console.error('addStudent failed', err);
                alert('新增学生失败：' + (err && err.message ? err.message : String(err)));
            }finally{
                btnAddStudent.disabled = false;
                btnAddStudent.textContent = '新增学生';
            }
        }

        async function addTeacherHandler(){
            console.log('[admin_dashboard] addTeacherHandler invoked');
            if (!btnAddTeacher) return;
            const name = (teacherName && teacherName.value) ? teacherName.value.trim() : '';
            const college = (teacherCollege && teacherCollege.value) ? teacherCollege.value.trim() : '';
            const title = (teacherTitle && teacherTitle.value) ? teacherTitle.value.trim() : '';
            const avatarUrl = (teacherAvatar && teacherAvatar.value) ? teacherAvatar.value.trim() : '';
            const password = (teacherPassword && teacherPassword.value) ? teacherPassword.value : '';

            if (!name){ alert('请输入教师姓名'); return; }
            if (!password){ alert('请输入密码'); return; }

            try{
                btnAddTeacher.disabled = true;
                btnAddTeacher.textContent = '新增中…';
                const created = await addTeacher({ name, college, avatarUrl, title, password });
                alert('教师创建成功：' + (created && (created.name || created.id) ? (created.name || ('ID ' + created.id)) : '已创建'));
                // clear fields
                if (teacherName) teacherName.value = '';
                if (teacherCollege) teacherCollege.value = '';
                if (teacherTitle) teacherTitle.value = '';
                if (teacherAvatar) teacherAvatar.value = '';
                if (teacherPassword) teacherPassword.value = '';
                // refresh list and switch to roles tab
                await loadAllUsers();
                switchTab('roles');
            }catch(err){
                console.error('addTeacher failed', err);
                alert('新增教师失败：' + (err && err.message ? err.message : String(err)));
            }finally{
                btnAddTeacher.disabled = false;
                btnAddTeacher.textContent = '新增教师';
            }
        }

        if (btnAddStudent) btnAddStudent.addEventListener('click', addStudentHandler);
        if (btnAddTeacher) btnAddTeacher.addEventListener('click', addTeacherHandler);
    }catch(e){ console.warn('bind add user controls failed', e); }

})();
