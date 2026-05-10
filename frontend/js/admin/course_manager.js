// 管理员课程管理页面逻辑
// 依赖: getAllCourses(), getCourseChapters(courseId), createChapter(payload), createQuestionUnderChapter(chapterId, questionPayload)

async function initCourseManager(){
    // prefixed IDs (cm_) to avoid collisions
    const coursesBody = document.getElementById('cm_coursesBody');
    const chaptersList = document.getElementById('cm_chaptersList');
    // optional elements (not required in this module)
    // const courseTitle = document.getElementById('cm_courseTitle');
    // const courseMeta = document.getElementById('cm_courseMeta');
    const addChapterForm = document.getElementById('cm_addChapterForm');
    const rightRoot = document.getElementById('cm_courseDetailRoot');

    console.log('[course_manager] initCourseManager called', { coursesBody: !!coursesBody, chaptersList: !!chaptersList });
    if (!coursesBody || !rightRoot) return;

    let selectedCourse = null;
    let currentChapter = null;
    const coursesMap = new Map();

    // helpers
    function escapeHtml(str){ if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

    function parseBulkQuestions(text){
        const blocks = text.split(/\n\s*\n+/).map(b=>b.trim()).filter(Boolean);
        const parsed = [], errors = [];
        for (let i=0;i<blocks.length;i++){
            const block = blocks[i];
            const lines = block.split(/\n/).map(l=>l.trim()).filter(Boolean);
            if (lines.length < 2){ errors.push({ index:i, reason:'行数不足' }); continue; }
            const content = lines[0];
            const opts = { A:'', B:'', C:'', D:'' };
            let correct = null;
            for (let j=1;j<lines.length;j++){
                const l = lines[j];
                // character class includes common separators; hyphen placed last
                const m = l.match(/^([A-D])\s*[:)\.：-]?\s*(.*)$/i);
                if (m){ opts[m[1].toUpperCase()] = m[2].trim(); }
                const cm = l.match(/^(?:答案|正确|Answer|Correct)\s*[:：]?\s*([A-D])/i);
                if (cm){ correct = cm[1].toUpperCase(); }
            }
            if (!opts.A && lines.length >= 5){ opts.A = lines[1]; opts.B = lines[2]||''; opts.C = lines[3]||''; opts.D = lines[4]||''; }
            if (!correct){ const last = lines[lines.length-1].trim(); const r = last.match(/^([A-D])$/i); if (r) correct = r[1].toUpperCase(); }
            if (!opts.A || !opts.B || !opts.C || !opts.D || !correct){ errors.push({ index:i, reason:'无法解析选项或答案' }); continue; }
            parsed.push({ content, optionA: opts.A, optionB: opts.B, optionC: opts.C, optionD: opts.D, correctOption: correct });
        }
        return { parsed, errors };
    }

    // Modal builder for course -> chapters -> questions
    async function openCourseModal(course){
        console.log('[course_manager] openCourseModal', course && course.id);
        const existing = document.getElementById('cm_courseModal'); if (existing) existing.remove();
        const modal = document.createElement('div'); modal.id = 'cm_courseModal';
        Object.assign(modal.style, { position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 });
        const panel = document.createElement('div'); panel.style.width='900px'; panel.style.maxWidth='96%'; panel.style.maxHeight='92%'; panel.style.overflow='auto'; panel.style.background='#fff'; panel.style.borderRadius='12px'; panel.style.padding='18px'; panel.style.boxShadow='0 12px 40px rgba(2,6,23,0.2)';

        const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center';
        const title = document.createElement('h2'); title.textContent = `课程：${course.name || ''}`; title.style.margin='0';
        const closeBtn = document.createElement('button'); closeBtn.textContent='关闭'; closeBtn.className='btn-ghost'; closeBtn.addEventListener('click', ()=> modal.remove());
        header.appendChild(title); header.appendChild(closeBtn);

        const contentRoot = document.createElement('div'); contentRoot.style.marginTop = '12px';
        panel.appendChild(header); panel.appendChild(contentRoot); modal.appendChild(panel); document.body.appendChild(modal);

        async function loadAndShowChapters(){
            contentRoot.innerHTML = '<div class="muted">加载章节中...</div>';
            try{
                const chapters = await getCourseChapters(course.id);
                renderChaptersInModal(chapters);
            }catch(e){ contentRoot.innerHTML = `<div class="muted">加载章节失败: ${escapeHtml(e.message||e)}</div>`; }
        }

        function renderChaptersInModal(chapters){
            contentRoot.innerHTML = '';
            const meta = document.createElement('div'); meta.className='muted'; meta.textContent = `学院: ${course.college || '-'}  学分: ${course.credits || '-'}`;
            const listRoot = document.createElement('div'); listRoot.style.marginTop='12px';
            if (!Array.isArray(chapters) || chapters.length===0){ listRoot.innerHTML = '<div class="muted">暂无章节</div>'; }
            else{ chapters.forEach(ch=>{
                const item = document.createElement('div'); item.className='chapter-item'; item.style.cursor='pointer'; item.style.marginBottom='8px';
                item.innerHTML = `<div><strong>第 ${ch.chapterNo != null ? ch.chapterNo : '-'} 章 ${escapeHtml(ch.name||'')}</strong></div><div class="muted">视频: ${escapeHtml(ch.videoUrl||'无')}</div>`;
                item.addEventListener('click', ()=> showQuestionsInModal(ch));
                listRoot.appendChild(item);
            }); }

            // add-chapter form
            const addWrap = document.createElement('div'); addWrap.style.marginTop='14px';
            addWrap.innerHTML = `
                <h4>添加章节</h4>
                <form id="cm_modal_addChapterForm">
                    <div class="form-row"><label class="small-label">章序号</label><input name="chapterNo" type="number" required style="width:120px;" /></div>
                    <div class="form-row"><label class="small-label">章节名</label><input name="name" type="text" required style="width:60%;" /></div>
                    <div class="form-row"><label class="small-label">视频URL</label><input name="videoUrl" type="text" style="width:60%;" /></div>
                    <div class="form-row"><button class="btn" type="submit">添加章节</button></div>
                </form>
            `;
            contentRoot.appendChild(meta); contentRoot.appendChild(listRoot); contentRoot.appendChild(addWrap);

            const modalForm = document.getElementById('cm_modal_addChapterForm');
            if (modalForm){
                modalForm.addEventListener('submit', async (e)=>{
                    e.preventDefault();
                    const f = e.target; const chapterNoRaw = f.chapterNo.value; const chapterNo = Number(chapterNoRaw); const name = f.name.value.trim(); const videoUrl = f.videoUrl.value.trim();
                    if (!name){ alert('请输入章节名'); return; }
                    if (!chapterNoRaw){ alert('请输入章序号'); return; }
                    if (!Number.isInteger(chapterNo) || chapterNo <= 0){ alert('章序号必须为大于0的整数'); return; }
                    try{
                        const existing = Array.isArray(await getCourseChapters(course.id)) ? await getCourseChapters(course.id) : [];
                        if (existing.find(c=>Number(c.chapterNo)===chapterNo)){ alert('章序号 ' + chapterNo + ' 已存在， 请使用不同的章序号'); return; }
                        const created = await createChapter(course.id, { chapterNo, name, videoUrl }, null);
                        const createdId = (created && created.chapter && created.chapter.id) ? created.chapter.id : (created && created.id ? created.id : '');
                        alert('创建章节成功，ID: ' + createdId);
                        // reload chapters
                        const chapters2 = await getCourseChapters(course.id);
                        renderChaptersInModal(chapters2);
                    }catch(err){ alert('创建章节失败: ' + (err && err.message ? err.message : err)); }
                });
            }
        }

        async function showQuestionsInModal(chapter){
            contentRoot.innerHTML = '<div class="muted">加载题目中...</div>';
            const headerDiv = document.createElement('div'); headerDiv.style.display='flex'; headerDiv.style.justifyContent='space-between'; headerDiv.style.alignItems='center';
            const titleDiv = document.createElement('div'); titleDiv.innerHTML = `<strong>第 ${chapter.chapterNo != null ? chapter.chapterNo : '-'} 章 ${escapeHtml(chapter.name||'')}</strong>`;
            const backBtn = document.createElement('button'); backBtn.className='btn-ghost'; backBtn.textContent='返回章节'; backBtn.addEventListener('click', ()=> loadAndShowChapters());
            headerDiv.appendChild(titleDiv); headerDiv.appendChild(backBtn);

            try{
                const qs = await getChapterQuestions(chapter.id);
                const list = document.createElement('div'); list.style.marginTop='12px';
                if (!Array.isArray(qs) || qs.length===0) list.innerHTML = '<div class="muted">该章节暂无题目</div>';
                else qs.forEach((q,idx)=>{ const qd=document.createElement('div'); qd.className='chapter-item'; qd.style.marginBottom='8px'; qd.innerHTML = `<div><strong>${idx+1}. ${escapeHtml(q.content||'')}</strong></div><div class="muted">A.${escapeHtml(q.optionA||'')} B.${escapeHtml(q.optionB||'')}</div><div style="margin-top:6px;color:#666">正确：${escapeHtml(String(q.correctOption||''))}</div>`; list.appendChild(qd); });

                const formWrap = document.createElement('div'); formWrap.style.marginTop='12px';
                formWrap.innerHTML = `
                    <h4>添加题目</h4>
                    <form id="cm_modal_addQuestionForm">
                        <div class="form-row"><label class="small-label">题干</label><input name="content" type="text" required style="width:70%;" /></div>
                        <div class="form-row"><label class="small-label">选项A</label><input name="optionA" type="text" style="width:60%;" /></div>
                        <div class="form-row"><label class="small-label">选项B</label><input name="optionB" type="text" style="width:60%;" /></div>
                        <div class="form-row"><label class="small-label">选项C</label><input name="optionC" type="text" style="width:60%;" /></div>
                        <div class="form-row"><label class="small-label">选项D</label><input name="optionD" type="text" style="width:60%;" /></div>
                        <div class="form-row"><label class="small-label">正确项</label>
                            <select name="correctOption" required><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select>
                        </div>
                        <div class="form-row"><button class="btn" type="submit">添加题目</button></div>
                    </form>

                    <hr />
                    <h4>批量导入题目（可选）</h4>
                    <div class="muted small">输入格式示例（每题用空行分隔）：</div>
                    <pre class="small muted" style="background:#fbfdff;padding:8px;border-radius:6px;">问题内容\nA: 选项A\nB: 选项B\nC: 选项C\nD: 选项D\n答案: A</pre>
                    <textarea id="cm_modal_bulkTextarea" placeholder="请粘贴题目文本，按示例格式，每题以空行分隔" style="width:100%;min-height:120px;padding:8px;border:1px solid #e6eef8;border-radius:8px;margin-top:8px"></textarea>
                    <div style="margin-top:8px"><button id="cm_modal_bulkImportBtn" class="btn">解析并导入题目</button></div>
                `;

                contentRoot.innerHTML = ''; contentRoot.appendChild(headerDiv); contentRoot.appendChild(list); contentRoot.appendChild(formWrap);

                const addQForm = document.getElementById('cm_modal_addQuestionForm');
                if (addQForm){
                    addQForm.addEventListener('submit', async (e)=>{
                        e.preventDefault();
                        const f = e.target;
                        const payload = { courseId: course.id, content: f.content.value.trim(), optionA: f.optionA.value.trim(), optionB: f.optionB.value.trim(), optionC: f.optionC.value.trim(), optionD: f.optionD.value.trim(), correctOption: (f.correctOption.value||'').toUpperCase() };
                        if (!payload.content){ alert('请输入题干'); return; }
                        try{ const created = await createQuestionUnderChapter(chapter.id, payload); alert('创建题目成功，ID:' + (created && created.id)); await showQuestionsInModal(chapter); }catch(err){ alert('创建题目失败：' + (err && err.message ? err.message : err)); }
                    });
                }

                // bind bulk import button
                const bulkTA = document.getElementById('cm_modal_bulkTextarea');
                const bulkBtn = document.getElementById('cm_modal_bulkImportBtn');
                if (bulkBtn && bulkTA){
                    bulkBtn.addEventListener('click', async (ev)=>{
                        ev.preventDefault();
                        const text = (bulkTA.value||'').trim();
                        if (!text){ alert('请先粘贴要导入的题目文本'); return; }
                        const { parsed, errors } = parseBulkQuestions(text);
                        if (errors.length>0){ if (!confirm('检测到部分题目解析失败，是否继续导入已解析的题目？\n失败数: '+errors.length)) return; }
                        if (!parsed || parsed.length===0){ alert('未解析到有效题目，请检查输入格式'); return; }
                        let success=0, fail=0;
                        for (const q of parsed){
                            try{ await createQuestionUnderChapter(chapter.id, { courseId: course.id, content: q.content, optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD, correctOption: q.correctOption }); success++; }catch(e){ fail++; }
                        }
                        alert('批量导入完成，成功: '+success + '，失败: '+fail);
                        await showQuestionsInModal(chapter);
                    });
                }

            }catch(e){ contentRoot.innerHTML = `<div class="muted">加载题目失败: ${escapeHtml(e.message||e)}</div>`; }
        }

        // initial
        await loadAndShowChapters();
    }

    // expose for other modules
    try{ if (typeof window !== 'undefined') window.openCourseModal = openCourseModal; }catch(e){}

    // click on course rows -> open modal
    coursesBody.addEventListener('click', async (e)=>{
        const tr = e.target.closest('tr'); if (!tr) return;
        const cid = tr.dataset.courseId; const course = coursesMap.get(String(cid));
        console.log('[course_manager] course row clicked', cid, 'found=', !!course);
        if (course) { try{ await openCourseModal(course); }catch(err){ console.error(err); } }
    });

    // render chapters in right pane (inline) and show questions there
    function renderChapters(chapters){
        if (!chaptersList) return; chaptersList.innerHTML = '';
        if (!Array.isArray(chapters) || chapters.length===0){ chaptersList.innerHTML = '<div class="muted">暂无章节</div>'; return; }
        chapters.forEach(ch=>{
            const div = document.createElement('div'); div.className='chapter-item'; div.style.cursor='pointer'; div.style.marginBottom='8px';
            div.innerHTML = `<div><strong>第 ${ch.chapterNo != null ? ch.chapterNo : '-'} 章 ${escapeHtml(ch.name||'')}</strong></div><div class="muted">视频: ${escapeHtml(ch.videoUrl||'无')}</div><div style="margin-top:8px;"><button class="btn-ghost" data-chapter-id="${ch.id}">添加题目</button></div>`;
            div.addEventListener('click', (ev)=>{ if (ev.target && ev.target.closest && ev.target.closest('button')) return; showQuestionsView(ch); });
            const btn = div.querySelector('button'); if (btn) btn.addEventListener('click', (e)=>{ e.stopPropagation(); showQuestionsView(ch); });
            chaptersList.appendChild(div);
        });
    }

    // show questions inline (rightRoot)
    async function showQuestionsView(chapter){
        currentChapter = chapter;
        if (chaptersList) chaptersList.style.display = '';
        if (!rightRoot) return;
        // clear or create qroot
        let qroot = document.getElementById('cm_questionsRoot'); if (!qroot){ qroot = document.createElement('div'); qroot.id='cm_questionsRoot'; qroot.style.marginTop='12px'; rightRoot.appendChild(qroot); }
        qroot.innerHTML = '<div class="muted">加载题目中...</div>';
        try{
            const qs = await getChapterQuestions(chapter.id);
            const header = document.createElement('div'); header.style.display='flex'; header.style.justifyContent='space-between'; header.style.alignItems='center'; header.style.marginBottom='8px';
            const h = document.createElement('div'); h.innerHTML = `<strong>第 ${chapter.chapterNo != null ? chapter.chapterNo : '-'} 章 ${escapeHtml(chapter.name||'')}</strong>`;
            const back = document.createElement('button'); back.className='btn-ghost'; back.textContent='返回章节'; back.addEventListener('click', ()=>{ qroot.remove(); });
            header.appendChild(h); header.appendChild(back);
            const list = document.createElement('div'); list.style.marginTop='8px';
            if (!Array.isArray(qs) || qs.length===0) list.innerHTML = '<div class="muted">该章节暂无题目</div>';
            else qs.forEach((q,idx)=>{ const qd=document.createElement('div'); qd.className='chapter-item'; qd.style.marginBottom='8px'; qd.innerHTML=`<div><strong>${idx+1}. ${escapeHtml(q.content||'')}</strong></div><div class="muted">A.${escapeHtml(q.optionA||'')} B.${escapeHtml(q.optionB||'')} C.${escapeHtml(q.optionC||'')} D.${escapeHtml(q.optionD||'')}</div><div style="margin-top:6px;color:#666">正确：${escapeHtml(String(q.correctOption||''))}</div>`; list.appendChild(qd); });

            // add-question + bulk inline
            const formWrap = document.createElement('div'); formWrap.style.marginTop='12px';
            formWrap.innerHTML = `
                <h4>添加题目</h4>
                <form id="cm_addQuestionForm">
                    <div class="form-row"><label class="small-label">题干</label><input name="content" type="text" required style="width:70%;" /></div>
                    <div class="form-row"><label class="small-label">选项A</label><input name="optionA" type="text" style="width:60%;" /></div>
                    <div class="form-row"><label class="small-label">选项B</label><input name="optionB" type="text" style="width:60%;" /></div>
                    <div class="form-row"><label class="small-label">选项C</label><input name="optionC" type="text" style="width:60%;" /></div>
                    <div class="form-row"><label class="small-label">选项D</label><input name="optionD" type="text" style="width:60%;" /></div>
                    <div class="form-row"><label class="small-label">正确项</label>
                        <select name="correctOption" required><option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option></select>
                    </div>
                    <div class="form-row"><button class="btn" type="submit">添加题目</button></div>
                </form>

                <hr />
                <h4>批量导入题目（可选）</h4>
                <div class="muted small">输入格式示例（每题用空行分隔）：</div>
                <pre class="small muted" style="background:#fbfdff;padding:8px;border-radius:6px;">问题内容\nA: 选项A\nB: 选项B\nC: 选项C\nD: 选项D\n答案: A</pre>
                <textarea id="cm_bulkTextarea" placeholder="请粘贴题目文本，按示例格式，每题以空行分隔" style="width:100%;min-height:120px;padding:8px;border:1px solid #e6eef8;border-radius:8px;margin-top:8px"></textarea>
                <div style="margin-top:8px"><button id="cm_bulkImportBtn" class="btn">解析并导入题目</button></div>
            `;

            qroot.innerHTML = '';
            qroot.appendChild(header); qroot.appendChild(list); qroot.appendChild(formWrap);

            const addQuestionForm = document.getElementById('cm_addQuestionForm');
            if (addQuestionForm){ addQuestionForm.addEventListener('submit', async (e)=>{ e.preventDefault(); const f=e.target; const payload={ courseId: selectedCourse.id, content: f.content.value.trim(), optionA: f.optionA.value.trim(), optionB: f.optionB.value.trim(), optionC: f.optionC.value.trim(), optionD: f.optionD.value.trim(), correctOption: (f.correctOption.value||'').toUpperCase() }; if (!payload.content){ alert('请输入题干'); return; } try{ const created = await createQuestionUnderChapter(chapter.id, payload); alert('创建题目成功，ID:'+(created&&created.id)); await showQuestionsView(chapter); }catch(err){ alert('创建题目失败：' + (err && err.message ? err.message : err)); } }); }

            const inlineBulkTA = document.getElementById('cm_bulkTextarea');
            const inlineBulkBtn = document.getElementById('cm_bulkImportBtn');
            if (inlineBulkBtn && inlineBulkTA){ inlineBulkBtn.addEventListener('click', async (ev)=>{ ev.preventDefault(); const text = (inlineBulkTA.value||'').trim(); if (!text){ alert('请先粘贴要导入的题目文本'); return; } const { parsed, errors } = parseBulkQuestions(text); if (errors.length>0){ if (!confirm('检测到部分题目解析失败，是否继续导入已解析的题目？\n失败数: '+errors.length)) return; } if (!parsed || parsed.length===0){ alert('未解析到有效题目，请检查输入格式'); return; } let success=0, fail=0; for (const q of parsed){ try{ await createQuestionUnderChapter(chapter.id, { courseId: selectedCourse.id, content:q.content, optionA:q.optionA, optionB:q.optionB, optionC:q.optionC, optionD:q.optionD, correctOption:q.correctOption }); success++; }catch(e){ fail++; } } alert('批量导入完成，成功: '+success + '，失败: '+fail); showQuestionsView(chapter); }); }

        }catch(e){ qroot.innerHTML = `<div class="muted">加载题目失败: ${escapeHtml(e.message||e)}</div>`; }
    }

    // load and render courses
    async function loadCourses(){
        try{
            const courses = await getAllCourses();
            console.log('[course_manager] loadCourses fetched', Array.isArray(courses)?courses.length:0);
            coursesBody.innerHTML = '';
            courses.forEach(c=>{ const tr = document.createElement('tr'); tr.dataset.courseId = c.id; tr.style.cursor='pointer'; tr.innerHTML = `<td>${escapeHtml(c.name||'')}</td><td>${escapeHtml(c.college||'')}</td>`; coursesMap.set(String(c.id), c); coursesBody.appendChild(tr); });
            console.log('[course_manager] loadCourses rendered rows:', coursesBody.querySelectorAll('tr').length);
        }catch(e){ coursesBody.innerHTML = `<tr><td colspan=2>加载课程失败: ${escapeHtml(e.message||e)}</td></tr>`; }
    }

    // wire inline addChapter form
    if (addChapterForm){
        addChapterForm.addEventListener('submit', async (e)=>{
            e.preventDefault(); if (!selectedCourse){ alert('请先选择课程'); return; }
            const form = e.target; const chapterNoRaw = form.chapterNo.value; const chapterNo = Number(chapterNoRaw); const name = form.name.value.trim(); const videoUrl = form.videoUrl.value.trim();
            if (!name){ alert('请输入章节名'); return; } if (!chapterNoRaw){ alert('请输入章序号'); return; } if (!Number.isInteger(chapterNo) || chapterNo <= 0){ alert('章序号必须为大于0的整数'); return; }
            try{ const existing = Array.isArray(await getCourseChapters(selectedCourse.id)) ? await getCourseChapters(selectedCourse.id) : []; if (existing.find(c=>Number(c.chapterNo)===chapterNo)){ alert('章序号 ' + chapterNo + ' 已存在， 请使用不同的章序号'); return; } const created = await createChapter(selectedCourse.id, { chapterNo, name, videoUrl }, null); alert('创建章节成功，ID: ' + (created && created.chapter && created.chapter.id ? created.chapter.id : (created && created.id ? created.id : ''))); const chapters = await getCourseChapters(selectedCourse.id); renderChapters(chapters); form.reset(); }catch(e){ alert('创建章节失败: ' + (e && e.message ? e.message : e)); }
        });
    }

    // expose init for admin dashboard
    try{ if (typeof window !== 'undefined') window.initCourseManager = initCourseManager; }catch(e){}

    // auto load courses once
    await loadCourses();
}

try{ if (typeof window !== 'undefined') window.initCourseManager = initCourseManager; }catch(e){}

// auto-init on script load (safe)
if (typeof window !== 'undefined' && !window.__cm_inited){ window.initCourseManager().then(()=>{ window.__cm_inited = true; console.log('[course_manager] auto-initialized'); }).catch(e=>console.warn('[course_manager] auto-init failed', e)); }
