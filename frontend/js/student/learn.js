async function initLearnPage() {
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get('courseId');
    const chapterId = params.get('chapterId');

    const chapterInfo = document.getElementById('chapterInfo');
    const videoContainer = document.getElementById('videoContainer');
    const questionContainer = document.getElementById('questionContainer');

    if (!chapterId) {
        chapterInfo.textContent = '缺少章节参数';
        return;
    }

    try {
        const chapter = await getChapterById(chapterId);
        chapterInfo.innerHTML = `<h3>第 ${chapter.chapterNo != null ? chapter.chapterNo : '-'} 章 ${chapter.name || ''}</h3>`;
        renderVideo(videoContainer, chapter.videoUrl);
    } catch (e) {
        chapterInfo.textContent = `加载章节失败：${e.message || e}`;
        return;
    }

    try {
        const questions = await getChapterQuestions(chapterId);
        renderQuestions(questionContainer, questions);
    } catch (e) {
        questionContainer.innerHTML = '<div class="empty-tip">课程暂未创建题库</div>';
    }

    try {
        if (courseId && (!questionContainer.textContent || !questionContainer.textContent.trim())) {
            const questions = await getChapterQuestions(chapterId);
            if (!Array.isArray(questions) || questions.length === 0) {
                questionContainer.innerHTML = '<div class="empty-tip">课程暂未创建题库</div>';
            }
        }
    } catch (e) {
        questionContainer.innerHTML = '<div class="empty-tip">课程暂未创建题库</div>';
    }
}

function renderVideo(container, videoUrl) {
    if (!container) return;
    if (!videoUrl) {
        container.innerHTML = '<div class="empty-tip">本章节暂无视频</div>';
        return;
    }

    if (/\.(mp4|webm|ogg)(\?|$)/i.test(videoUrl)) {
        container.innerHTML = `<video class="learn-video" controls src="${videoUrl}"></video>`;
        return;
    }

    const biliMatch = String(videoUrl).match(/(BV[0-9A-Za-z]+|av\d+)/i);
    if (biliMatch) {
        const key = biliMatch[0];
        const embedUrl = key.toLowerCase().startsWith('bv')
            ? `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(key)}`
            : `https://player.bilibili.com/player.html?aid=${encodeURIComponent(key.replace(/av/i, ''))}`;
        container.innerHTML = `<iframe class="learn-video" src="${embedUrl}" allowfullscreen></iframe>`;
        return;
    }

    container.innerHTML = `<iframe class="learn-video" src="${videoUrl}" allowfullscreen></iframe>`;
}

function renderQuestions(container, questions) {
    if (!container) return;
    if (!Array.isArray(questions) || questions.length === 0) {
        container.innerHTML = '<div class="empty-tip">课程暂未创建题库</div>';
        return;
    }

    container.innerHTML = `
        <div class="question-list">
            ${questions.map((q, idx) => `
                <div class="question-item" data-index="${idx}">
                    <div><strong>${idx + 1}. ${escapeHtml(q.content || '')}</strong></div>
                    <div class="question-options">
                        <label><input type="radio" name="q_${idx}" value="A"> A. ${escapeHtml(q.optionA || '')}</label>
                        <label><input type="radio" name="q_${idx}" value="B"> B. ${escapeHtml(q.optionB || '')}</label>
                        <label><input type="radio" name="q_${idx}" value="C"> C. ${escapeHtml(q.optionC || '')}</label>
                        <label><input type="radio" name="q_${idx}" value="D"> D. ${escapeHtml(q.optionD || '')}</label>
                    </div>
                    <div class="question-result" id="result_${idx}"></div>
                </div>
            `).join('')}
        </div>
        <div class="question-actions" style="margin-top:16px; text-align:right;">
            <button id="submitAllAnswersBtn">提交答案</button>
        </div>
    `;

    const submitBtn = container.querySelector('#submitAllAnswersBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => submitAllAnswers(questions));
    }
}

async function submitAllAnswers(questions) {
    let correctCount = 0;
    const total = Array.isArray(questions) ? questions.length : 0;

    questions.forEach((q, idx) => {
        const card = document.querySelector(`.question-item[data-index="${idx}"]`);
        const resultEl = document.getElementById(`result_${idx}`);
        if (!card || !resultEl) return;

        const checked = card.querySelector(`input[name="q_${idx}"]:checked`);
        if (!checked) {
            resultEl.textContent = '请选择一个选项';
            resultEl.style.color = '#b42318';
            return;
        }

        const correctOption = String(q.correctOption || '').toUpperCase();
        if (String(checked.value).toUpperCase() === correctOption) {
            correctCount++;
            resultEl.textContent = '回答正确';
            resultEl.style.color = 'green';
        } else {
            resultEl.textContent = `回答错误，正确答案：${correctOption || '-'}`;
            resultEl.style.color = 'red';
        }
    });

    if (total <= 0) return;

    const score = Math.round((correctCount / total) * 100);

    try {
        const user = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        const params = new URLSearchParams(window.location.search);
        const chapterId = params.get('chapterId');
        if (!user || !chapterId) return;

        let existing = null;
        if (typeof getStudentChapter === 'function') {
            try {
                existing = await getStudentChapter(user.id, chapterId);
            } catch (e) {
                existing = null;
            }
        }

        if (typeof setStudentChapterScore === 'function') {
            await setStudentChapterScore({
                studentId: user.id,
                chapterId: chapterId,
                score
            });
        }

        const tip = document.getElementById('submitAllAnswersBtn');
        if (tip) {
            tip.textContent = existing ? '已更新分数' : '已保存分数';
            setTimeout(() => {
                tip.textContent = '提交答案';
            }, 1500);
        }
    } catch (e) {
        console.warn('保存章节分数失败', e);
        alert('答案已提交，但保存章节分数失败');
    }
}

function goBackToChapters() {
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get('courseId');
    window.location.href = `./chapters.html?courseId=${encodeURIComponent(courseId || '')}`;
}

function escapeHtml(str){
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

try {
    if (typeof window !== 'undefined') {
        window.renderVideo = renderVideo;
        window.renderQuestions = renderQuestions;
        window.submitAllAnswers = submitAllAnswers;
        window.goBackToChapters = goBackToChapters;
        window.initLearnPage = initLearnPage;
    }
} catch (e) {}

document.addEventListener('DOMContentLoaded', initLearnPage);
