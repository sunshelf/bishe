(function(){
    // read query param
    function getQueryParam(name){
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    const courseId = getQueryParam('courseId');
    const metaEl = document.getElementById('meta');
    const metaTitleEl = document.getElementById('meta-title') || metaEl;
    const metricsEl = document.getElementById('metrics');
    const contentEl = document.getElementById('content');
    const refreshBtn = document.getElementById('refreshBtn');

    function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

    async function load(){
        if (!courseId){
            metaTitleEl.textContent = '缺少 courseId 参数。';
            if (metricsEl) metricsEl.innerHTML = '';
            contentEl.innerHTML = '<div class="no-data">无效的地址。</div>';
            return;
        }
        metaTitleEl.textContent = '课程 ' + courseId;
        if (metricsEl) metricsEl.innerHTML = '<div class="metric-badge">加载中…</div>';
        contentEl.innerHTML = '<div class="no-data">正在加载学生名单…</div>';

        try{
            // Fetch all student-course relations and filter by courseId to get records with score
            const allRel = await fetch('http://localhost:8080/api/student-courses');
            if (!allRel.ok) {
                const t = await allRel.text().catch(()=>allRel.statusText || allRel.status);
                const msg = '获取订阅关系失败: '+ (t || allRel.status);
                console.warn(msg);
                contentEl.innerHTML = '<div class="no-data">'+escapeHtml(msg)+'</div>';
                return;
            }
            const rels = await allRel.json();
            const students = rels.filter(r=>String(r.courseId) === String(courseId));
            if (!students || students.length === 0){
                contentEl.innerHTML = '<div class="no-data">暂无学生订阅此课程。</div>';
                return;
            }

            // for each student record, fetch profile and prepare row
            const tasks = students.map(async (rec)=>{
                let profile = null;
                try{ profile = await getUserProfile('student', rec.studentId); }catch(e){ console.warn('getUserProfile failed', e); }
                return { record: rec, profile };
            });

            const rows = await Promise.all(tasks);

            // compute completion / pass metrics
            const passThreshold = 60; // 可调整的及格分数线
            const totalStudents = rows.length;
            const completedCount = rows.filter(rr => rr.record && rr.record.score != null).length;
            const passedCount = rows.filter(rr => rr.record && rr.record.score != null && Number(rr.record.score) >= passThreshold).length;
            const completionRate = totalStudents ? Math.round((completedCount / totalStudents) * 100) : 0;
            const passRate = completedCount ? Math.round((passedCount / completedCount) * 100) : 0; // 及格率按已完成人数计算

            // show metrics in meta area: title + badges
            metaTitleEl.textContent = `课程 ${escapeHtml(String(courseId))}`;
            if (metricsEl){
                metricsEl.innerHTML = '';
                const badges = [
                    {text: `学生 ${totalStudents}`},
                    {text: `完成率 ${completionRate}%`},
                    {text: `及格率 ${passRate}%`},
                    {text: `及格线 ${passThreshold}`}
                ];
                badges.forEach(b => {
                    const d = document.createElement('div');
                    d.className = 'metric-badge';
                    d.textContent = b.text;
                    metricsEl.appendChild(d);
                });
            }

            // build table with additional columns: 完成, 及格
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            thead.innerHTML = '<tr><th>学生</th><th>学院</th><th>分数</th><th>完成</th><th>及格</th><th>操作</th></tr>';
            table.appendChild(thead);
            const tb = document.createElement('tbody');

            rows.forEach(r=>{
                const tr = document.createElement('tr');
                const profile = r.profile || {};
                const avatarHtml = profile.avatarUrl ? ('<img src="'+escapeHtml(profile.avatarUrl)+'" class="avatar" alt="'+escapeHtml(profile.name||'学生头像')+'"/>') : ('<div class="avatar">'+escapeHtml((profile.name||'')[0]||'?')+'</div>');
                const nameCell = '<td><div class="user-cell">'+avatarHtml+'<div><div class="name">'+escapeHtml(profile.name||('学生'+r.record.studentId))+'</div></div></div></td>';
                const collegeCell = '<td>'+escapeHtml(profile.college||'')+'</td>';
                const scoreCell = '<td>' + (r.record.score == null ? '未完成' : escapeHtml(r.record.score)) + '</td>';

                // completion and pass cells
                const isCompleted = (r.record && r.record.score != null);
                const isPassed = isCompleted && (Number(r.record.score) >= passThreshold);
                const completionCell = '<td>' + (isCompleted ? '<span style="color:green">已完成</span>' : '<span style="color:#777">未完成</span>') + '</td>';
                const passCell = '<td>' + (isCompleted ? (isPassed ? '<span style="color:green">及格</span>' : '<span style="color:#c00">未及格</span>') : '-') + '</td>';

                // action button: 私聊 -> calls openChatWithStudent(studentId)
                const safeStudentId = String(r.record.studentId).replace(/'/g, "\\'");
                const actionCell = '<td><button class="btn" onclick="openChatWithStudent(\'' + safeStudentId + '\')">私聊</button></td>';
                tr.innerHTML = nameCell + collegeCell + scoreCell + completionCell + passCell + actionCell;
                tb.appendChild(tr);
            });
            table.appendChild(tb);
            contentEl.innerHTML = '';
            contentEl.appendChild(table);
        }catch(e){
            console.error(e);
            contentEl.innerHTML = '<div class="no-data">加载失败：'+escapeHtml(String(e))+'</div>';
        }
    }

    if (refreshBtn) refreshBtn.addEventListener('click', ()=>{ load(); });

    // init
    // helper to open chat from this page: prefer existing global gotoChats, otherwise navigate directly
    try{
        if (typeof window !== 'undefined'){
            window.openChatWithStudent = function(studentId){
                if (!studentId) return;
                if (typeof window.gotoChats === 'function'){
                    try{ window.gotoChats(studentId); return; }catch(e){ console.warn('window.gotoChats failed', e); }
                }
                // fallback: navigate to chat page (teacher folder to chat is ../chat.html)
                window.location.href = '../chat.html?studentID=' + encodeURIComponent(String(studentId));
            };
        }
    }catch(e){ /* ignore */ }

    document.addEventListener('DOMContentLoaded', ()=>{ load(); });
})();
