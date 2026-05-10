(function(){
    const base = (typeof API_BASE !== 'undefined') ? API_BASE : '';
    const btnAddStudent = document.getElementById('btnAddStudent');
    const addStudentResult = document.getElementById('addStudentResult');
    btnAddStudent.addEventListener('click', async ()=>{
        const payload = {
            name: document.getElementById('studentName').value.trim(),
            college: document.getElementById('studentCollege').value.trim(),
            grade: document.getElementById('studentGrade').value.trim(),
            avatarUrl: document.getElementById('studentAvatar').value.trim(),
            password: document.getElementById('studentPassword').value.trim()
        };
        addStudentResult.textContent = '创建中...';
        try{
            if (typeof addStudent === 'function'){
                const created = await addStudent(payload);
                addStudentResult.textContent = '学生已创建 ID: ' + (created.id || created.studentId || '');
            } else {
                const res = await fetch(base + '/api/students', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                if (!res.ok) throw new Error('创建学生失败 ' + res.status);
                const created = await res.json();
                addStudentResult.textContent = '学生已创建 ID: ' + (created.id || '');
            }
        }catch(e){ addStudentResult.textContent = '创建失败：'+String(e); }
    });

    const btnAddTeacher = document.getElementById('btnAddTeacher');
    const addTeacherResult = document.getElementById('addTeacherResult');
    btnAddTeacher.addEventListener('click', async ()=>{
        const payload = {
            name: document.getElementById('teacherName').value.trim(),
            college: document.getElementById('teacherCollege').value.trim(),
            title: document.getElementById('teacherTitle').value.trim(),
            avatarUrl: document.getElementById('teacherAvatar').value.trim(),
            password: document.getElementById('teacherPassword').value.trim()
        };
        addTeacherResult.textContent = '创建中...';
        try{
            if (typeof addTeacher === 'function'){
                const created = await addTeacher(payload);
                addTeacherResult.textContent = '教师已创建 ID: ' + (created.id || created.teacherId || '');
            } else {
                const res = await fetch(base + '/api/teachers', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
                if (!res.ok) throw new Error('创建教师失败 ' + res.status);
                const created = await res.json();
                addTeacherResult.textContent = '教师已创建 ID: ' + (created.id || '');
            }
        }catch(e){ addTeacherResult.textContent = '创建失败：'+String(e); }
    });
})();

