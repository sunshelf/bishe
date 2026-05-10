// Simple quiz runner for 4-option multiple choice questions
(function (){
    // example questions — you'll replace these with real data or fetch from API
    const sampleQuestions = [
        { id:1, stem: '下列哪一项不是前端开发的常见语言？', options: ['HTML','CSS','Python','JavaScript'], answerIndex:2 },
        { id:2, stem: 'CSS 中用于布局的属性是哪个？', options: ['float','color','border','console'], answerIndex:0 },
        { id:3, stem: 'JavaScript 中用于输出调试信息的函数是？', options: ['alert','log','console.log','println'], answerIndex:2 }
    ];

    const STORAGE_KEY = 'quiz_answers_v1';
    let questions = sampleQuestions;
    let currentIndex = 0;
    let answers = loadAnswers();

    const questionCard = document.getElementById('questionCard');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const submitBtn = document.getElementById('submitBtn');
    const closeBtn = document.getElementById('closeBtn');
    const retakeBtn = document.getElementById('retakeBtn');
    const progress = document.getElementById('quizProgress');
    const resultPanel = document.getElementById('resultPanel');
    const resultText = document.getElementById('resultText');

    function loadAnswers(){
        try{ const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }catch(e){return {};}    }
    function saveAnswers(){
        try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(answers)); }catch(e){}
    }

    function getQueryParam(name){
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    // load remote questions if courseId provided
    const courseId = getQueryParam('courseId');
    async function loadRemoteQuestionsIfAny(){
        if (!courseId) return;
        try{
            // getQuestionsByCourseId is provided by ../js/getData.js
            const remote = await getQuestionsByCourseId(courseId);
            if(Array.isArray(remote) && remote.length>0){
                questions = remote.map((q, idx) => {
                    const stem = q.content || q.stem || q.question || q.title || `题目 ${idx+1}`;
                    const opts = [q.optionA || q.option1 || q.a || q.A || '', q.optionB || q.option2 || q.b || q.B || '', q.optionC || q.option3 || q.c || q.C || '', q.optionD || q.option4 || q.d || q.D || ''].map(x => String(x || ''));
                    const letterMap = { A:0, B:1, C:2, D:3 };
                    let answerIndex = -1;
                    if (typeof q.correctOption === 'string' && /^[A-Da-d]$/.test(q.correctOption.trim())) {
                        answerIndex = letterMap[q.correctOption.trim().toUpperCase()];
                    } else if (typeof q.correct === 'string' && /^[A-Da-d]$/.test(q.correct.trim())) {
                        answerIndex = letterMap[q.correct.trim().toUpperCase()];
                    } else if (typeof q.correct === 'string') {
                        answerIndex = opts.findIndex(o => o.trim() === q.correct.trim());
                    }
                    return { id: q.id || idx+1, stem, options: opts, answerIndex };
                });
            }
        }catch(e){
            console.warn('拉取远端题目失败，使用本地示例题', e);
        }
    }

    function render(){
        const q = questions[currentIndex];
        progress.textContent = `${currentIndex+1} / ${questions.length}`;
        resultPanel.hidden = true;
        let html = `
            <div class="question-stem">${q.stem}</div>
            <div class="options">
        `;
        q.options.forEach((opt, idx) => {
            const checked = answers[q.id] === idx ? 'checked' : '';
            const selected = answers[q.id] === idx ? 'selected' : '';
            html += `<label class="option ${selected}" data-index="${idx}">
                        <input type="radio" name="opt_${q.id}" ${checked} />
                        <span class="opt-text">${opt}</span>
                    </label>`;
        });
        html += '</div>';
        questionCard.innerHTML = html;

        // attach click handlers
        questionCard.querySelectorAll('.option').forEach(el => {
            el.addEventListener('click', () => {
                answers[q.id] = Number(el.dataset.index);
                saveAnswers();
                // update UI state
                questionCard.querySelectorAll('.option').forEach(o=>o.classList.remove('selected'));
                el.classList.add('selected');
                const radio = el.querySelector('input[type=radio]');
                if(radio) radio.checked = true;
            });
        });

        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === questions.length - 1;
    }

    prevBtn.addEventListener('click', ()=>{
        if(currentIndex>0){ currentIndex--; render(); }
    });
    nextBtn.addEventListener('click', ()=>{
        if(currentIndex<questions.length-1){ currentIndex++; render(); }
    });

    submitBtn.addEventListener('click', async ()=>{
        // calculate score
        let correct = 0;
        questions.forEach(q=>{
            if(typeof answers[q.id] !== 'undefined' && answers[q.id] === q.answerIndex) correct++;
        });
        const score = Math.round((correct / questions.length) * 100);
        resultText.textContent = `得分 ${correct} / ${questions.length} (${score}%)`;
        resultPanel.hidden = false;

        // save score via getData.setStudentCourseScore if available
        try{
            const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            if (user && courseId && typeof setStudentCourseScore === 'function'){
                // await and show status
                try{
                    await setStudentCourseScore(user.id, courseId, score);
                    // show a brief success message
                    resultText.textContent += '，已保存成绩。';
                }catch(err){
                    console.warn('保存成绩失败', err);
                    resultText.textContent += '，保存成绩失败。';
                }
            }
        }catch(e){
            console.warn('提交分数时出错', e);
        }
    });

    closeBtn.addEventListener('click', ()=>{
        // try to close window; if not allowed (opened directly), redirect back to student dashboard
        try{
            window.close();
            // fallback redirect after short delay in case close is blocked
            setTimeout(()=>{
                window.location.href = '../../pages/student/dashboard.html';
            }, 200);
        }catch(e){
            window.location.href = '../../pages/student/dashboard.html';
        }
    });

    retakeBtn.addEventListener('click', ()=>{
        answers = {}; saveAnswers(); render();
    });

    // initial load
    (async ()=>{
        await loadRemoteQuestionsIfAny();
        render();
    })();
})();
