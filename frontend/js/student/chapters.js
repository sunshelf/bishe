async function initChapterPage() {
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get('courseId');
    const container = document.getElementById('chapterList');

    if (!container) return;
    if (!courseId) {
        container.innerHTML = '<div class="course-card">缺少课程参数</div>';
        return;
    }

    try {
        const chapters = await getCourseChapters(courseId);
        if (!Array.isArray(chapters) || chapters.length === 0) {
            container.innerHTML = '<div class="course-card">该课程暂无章节</div>';
            return;
        }

        container.innerHTML = chapters.map((chapter, index) => {
            const chapterNo = chapter.chapterNo != null ? chapter.chapterNo : (index + 1);
            return `
                <div class="course-card chapter-card" data-chapter-id="${chapter.id}" onclick="gotoLearnPage(${courseId}, ${chapter.id})" style="cursor:pointer;">
                    <h3>第 ${chapterNo} 章 ${escapeHtml(chapter.name || '')}</h3>
                    <div class="chapter-meta">
                        <span id="score_${chapter.id}" class="chapter-score"></span>
                    </div>
                </div>
            `;
        }).join('');

        const currentUser = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (currentUser && currentUser.role === 'student') {
            chapters.forEach(async (chapter) => {
                try {
                    const rec = await getStudentChapter(currentUser.id, chapter.id);
                    const scoreEl = document.getElementById(`score_${chapter.id}`);
                    if (!scoreEl) return;
                    if (rec && rec.score != null) {
                        const display = Number.isInteger(rec.score) ? rec.score : (Math.round(rec.score * 10) / 10);
                        scoreEl.textContent = `分数: ${display}`;
                        scoreEl.style.color = '#2f6bff';
                        scoreEl.style.fontWeight = '600';
                    }
                } catch (e) {
                }
            });
        }

    } catch (e) {
        container.innerHTML = `<div class="course-card">加载章节失败：${escapeHtml(e.message || e)}</div>`;
    }
}

function gotoLearnPage(courseId, chapterId) {
    window.location.href = `./learn.html?courseId=${encodeURIComponent(courseId)}&chapterId=${encodeURIComponent(chapterId)}`;
}

function goBackToCourses() {
    window.location.href = './dashboard.html';
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
        window.gotoLearnPage = gotoLearnPage;
        window.goBackToCourses = goBackToCourses;
    }
} catch (e) {}

document.addEventListener('DOMContentLoaded', initChapterPage);
