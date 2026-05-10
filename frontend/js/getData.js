const API_BASE = "http://localhost:8080"; // 后端 API 基础 URL
async function getCoursesByTeacherId(teacherId) {
    // 1) 查教师-课程关系表
    const relResp = await fetch(`${API_BASE}/api/teacher-courses`);
    if (!relResp.ok) {
        throw new Error(`获取教师课程关系失败: ${relResp.status}`);
    }
    const relations = await relResp.json();
    // relations 预期结构: [{ teacherId: 1, courseId: 2 }, ...]

    // 2) 过滤出该老师的 courseId
    const courseIds = relations
        .filter(r => Number(r.teacherId) === Number(teacherId))
        .map(r => r.courseId);

    // 去重，避免重复请求
    const uniqueCourseIds = [...new Set(courseIds)];

    if (uniqueCourseIds.length === 0) return [];

    // 3) 并发查询每个课程详情
    const coursePromises = uniqueCourseIds.map(async (courseId) => {
        const courseResp = await fetch(`${API_BASE}/api/courses/${courseId}`);
        if (!courseResp.ok) {
            // 某个课程不存在时返回 null，不中断全部
            return null;
        }
        return courseResp.json();
    });

    const courseList = await Promise.all(coursePromises);

    // 4) 过滤掉 null（请求失败/不存在）
    return courseList.filter(Boolean);
}

async function getCoursesByStudentId(StudentId) {
    // 1) 查教师-课程关系表
    const relResp = await fetch(`${API_BASE}/api/student-courses`);
    if (!relResp.ok) {
        throw new Error(`获取学生课程关系失败: ${relResp.status}`);
    }
    const relations = await relResp.json();
    // relations 预期结构: [{ StudentId: 1, courseId: 2 }, ...]

    const courseIds = relations
        .filter(r => Number(r.studentId) === Number(StudentId))
        .map(r => r.courseId);

    // 去重，避免重复请求
    const uniqueCourseIds = [...new Set(courseIds)];

    if (uniqueCourseIds.length === 0) return [];

    // 3) 并发查询每个课程详情
    const coursePromises = uniqueCourseIds.map(async (courseId) => {
        const courseResp = await fetch(`${API_BASE}/api/courses/${courseId}`);
        if (!courseResp.ok) {
            // 某个课程不存在时返回 null，不中断全部
            return null;
        }
        return courseResp.json();
    });

    const courseList = await Promise.all(coursePromises);

    // 4) 过滤掉 null（请求失败/不存在）
    return courseList.filter(Boolean);
}

async function getLoginData(role, id, password) {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            role,      // "student" 或 "teacher"
            id,        // 账号ID（数字或字符串）
            password   // 密码
        })
    });

    // 后端可能返回 json 或 text，这里都兼容
    const contentType = resp.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
        ? await resp.json()
        : await resp.text();

    if (!resp.ok) {
        throw new Error(typeof data === "string" ? data : JSON.stringify(data));
    }
    return data;
}

async function getUnsubscribedCoursesByStudentId(studentId) {

    const url = `${API_BASE}/api/courses/unsubscribed/${studentId}`;

    const res = await fetch(url, {
        method: "GET",
        headers: {
            "Accept": "application/json"
        }
    });

    if (!res.ok) {
        throw new Error(`查询失败: ${res.status} ${res.statusText}`);
    }

    // 返回课程数组
    return await res.json();
}

async function getTeacherByCourseId(courseId) {
    try {
        const response = await fetch(API_BASE+`/api/courses/${courseId}/teacher`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`请求失败，状态码：${response.status}`);
        }

        const teacher = await response.json();
        console.log('教师信息：', teacher);
        return teacher;
    } catch (error) {
        console.error('查询教师信息失败：', error);
    }
}

// 1) 查询某学生在某课程的分数
async function getStudentCourseScore(studentId, courseId) {
    const url = API_BASE+`/api/student-courses/${studentId}/${courseId}`;
    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (res.status === 404) {
        return null; // 没有该成绩记录
    }
    if (!res.ok) {
        throw new Error(`请求失败: ${res.status} ${res.statusText}`);
    }

    // 形如: { studentId: 1, courseId: 2, score: 88.5 }
    return await res.json();
}

// 3) 订阅课程（score 初始可传 null）
async function giveSubscribeCourse(studentId, courseId) {
    const res = await fetch(`${API_BASE}/api/student-courses`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            studentId: Number(studentId),
            courseId: Number(courseId),
            score: null
        })
    });

    if (!res.ok) throw new Error(`订阅失败: ${res.status}`);
    return true;
}

async function getQuestionsByCourseId(courseId) {
    const url = API_BASE+`/api/questions/course/${courseId}`;

    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        throw new Error(`获取题目失败: ${res.status} ${res.statusText}`);
    }

    // 返回 Question[]，无数据时是 []
    return await res.json();
}

async function setStudentCourseScore(studentId, courseId, score) {
    const url = API_BASE+"/api/student-courses";

    const payload = {
        studentId: Number(studentId),
        courseId: Number(courseId),
        score: score === null || score === undefined ? null : Number(score)
    };

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        throw new Error(`设置分数失败: ${res.status} ${res.statusText}`);
    }

    // 当前后端返回 201 + 空体，直接返回 true 表示成功
    return true;
}

async function getUserChats(userType, userId) {
    const url = API_BASE+`/api/chats/user/${userType}/${userId}`;

    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`获取聊天记录失败: ${res.status} ${msg || res.statusText}`);
    }

    // 返回 Chat[]
    return await res.json();
}

async function addChatRecord({ teacherId, studentId, sender, content, createdAt }) {
    const url = API_BASE+"/api/chats";

    const payload = {
        teacherId: teacherId == null ? null : Number(teacherId),
        studentId: studentId == null ? null : Number(studentId),
        sender: String(sender || "").trim(),      // "teacher" 或 "student"
        content: String(content || "").trim(),
        createdAt: createdAt || new Date().toISOString()
    };

    if (!payload.sender) throw new Error("sender 不能为空");
    if (!payload.content) throw new Error("content 不能为空");

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`添加聊天记录失败: ${res.status} ${msg || res.statusText}`);
    }

    // 后端返回新建的 Chat 对象
    return await res.json();
}

async function getUserProfile(role, id) {
    const url = API_BASE+`/api/auth/profile/${role}/${id}`;

    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`获取用户信息失败: ${res.status} ${msg || res.statusText}`);
    }

    return await res.json();
}

async function getStudentIdsByCourseId(courseId) {
    const url = API_BASE+"/api/student-courses";

    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        throw new Error(`获取订阅关系失败: ${res.status} ${res.statusText}`);
    }

    const relations = await res.json();
    return relations
        .filter(item => Number(item.courseId) === Number(courseId))
        .map(item => item.studentId);
}

async function addStudent({ name, college, grade, avatarUrl, password }) {
    const res = await fetch(API_BASE+"/api/students", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            name: String(name || "").trim(),
            college: String(college || "").trim(),
            grade: String(grade || "").trim(),
            avatarUrl: String(avatarUrl || "").trim(),
            password: String(password || "")
        })
    });

    if (!res.ok) throw new Error(`创建学生失败: ${res.status}`);
    return await res.json();
}
async function addTeacher({ name, college, avatarUrl, title, password }) {
    const res = await fetch(API_BASE+"/api/teachers", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            name: String(name || "").trim(),
            college: String(college || "").trim(),
            avatarUrl: String(avatarUrl || "").trim(),
            title: String(title || "").trim(),
            password: String(password || "")
        })
    });

    if (!res.ok) throw new Error(`创建教师失败: ${res.status}`);
    return await res.json();
}


/**
 * 获取所有学生信息
 * 后端接口: GET /api/students
 *
 * JSON 返回格式（数组）示例:
 * [
 *   {
 *     "id": 1,
 *     "name": "张三",
 *     "college": "计算机学院",
 *     "grade": "2023",
 *     "avatarUrl": "https://xxx/avatar1.png",
 *     "password": "123456" // 若后端返回则会包含（不建议前端展示）
 *   }
 * ]
 */
async function getAllStudents() {
    const res = await fetch(`${API_BASE}/api/students`, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        throw new Error(`获取学生列表失败: ${res.status} ${res.statusText}`);
    }

    return await res.json();
}

/**
 * 获取所有教师信息
 * 后端接口: GET /api/teachers
 *
 * JSON 返回格式（数组）示例:
 * [
 *   {
 *     "id": 1,
 *     "name": "李老师",
 *     "college": "计算机学院",
 *     "avatarUrl": "https://xxx/avatar2.png",
 *     "title": "副教授",
 *     "password": "123456" // 若后端返回则会包含（不建议前端展示）
 *   }
 * ]
 */
async function getAllTeachers() {
    const res = await fetch(`${API_BASE}/api/teachers`, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        throw new Error(`获取教师列表失败: ${res.status} ${res.statusText}`);
    }

    return await res.json();
}
/**
 * 查询所有课程信息
 * 接口: GET http://localhost:8080/api/courses
 *
 * 返回 JSON 示例（数组）:
 * [
 *   {
 *     "id": 1,
 *     "name": "操作系统",
 *     "startTime": "2026-03-01 08:00:00",
 *     "college": "计算机学院",
 *     "credits": 3.0,
 *     "image_url": "https://example.com/course/os.png"
 *   },
 *   {
 *     "id": 2,
 *     "name": "数据库原理",
 *     "startTime": "2026-03-02 10:00:00",
 *     "college": "计算机学院",
 *     "credits": 2.5,
 *     "image_url": "https://example.com/course/db.png"
 *   }
 * ]
 */
async function getAllCourses() {
    const url = API_BASE+"/api/courses";

    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" }
    });

    if (!res.ok) {
        throw new Error(`获取课程列表失败: ${res.status} ${res.statusText}`);
    }

    return await res.json();
}
/**
 * 老师发起签到
 * 请求参数说明：
 * teacherId: 老师ID
 * courseId: 课程ID
 * passcode: 签到口令
 * durationMinutes: 签到有效时间（分钟）
 *
 * 返回JSON示例：
 * {
 *   "id": 1,
 *   "teacherId": 1,
 *   "courseId": 1,
 *   "passcode": "123456",
 *   "startAt": "2026-04-29 10:00:00",
 *   "endAt": "2026-04-29 10:05:00",
 *   "active": true
 * }
 */
async function createCheckinSession(teacherId, courseId, passcode, durationMinutes) {
    const res = await fetch('http://localhost:8080/api/teacher-checkins/sessions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            teacherId,
            courseId,
            passcode,
            durationMinutes
        })
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }

    if (!res.ok) {
        throw new Error(typeof data === 'string' ? data : '发起签到失败');
    }

    return data;
}
/**
 * 学生进行口令签到
 * 请求参数说明：
 * sessionId: 签到会话ID
 * studentId: 学生ID
 * passcode: 学生输入的签到口令
 *
 * 返回JSON示例：
 * {
 *   "id": 1,
 *   "sessionId": 1,
 *   "studentId": 2,
 *   "checkinAt": "2026-04-29 10:01:12"
 * }
 */
async function studentSignCheckin(sessionId, studentId, passcode) {
    const res = await fetch(`http://localhost:8080/api/student-checkins/sessions/${sessionId}/sign`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            studentId,
            passcode
        })
    });

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }

    if (!res.ok) {
        throw new Error(typeof data === 'string' ? data : '签到失败');
    }

    return data;
}
/**
 * 查询某课程正在进行中的签到会话
 *
 * 返回JSON示例：
 * [
 *   {
 *     "id": 1,
 *     "teacherId": 1,
 *     "courseId": 1,
 *     "passcode": "123456",
 *     "startAt": "2026-04-29 10:00:00",
 *     "endAt": "2026-04-29 10:05:00",
 *     "active": true
 *   }
 * ]
 */
async function getActiveCheckinSessions(courseId) {
    const res = await fetch(`http://localhost:8080/api/teacher-checkins/sessions/course/${courseId}`);
    const data = await res.json();

    if (!res.ok) {
        throw new Error('获取签到会话失败');
    }

    return data;
}
/**
 * 查询某次签到会话下的学生签到记录
 *
 * 返回JSON示例：
 * [
 *   {
 *     "id": 1,
 *     "sessionId": 1,
 *     "studentId": 2,
 *     "checkinAt": "2026-04-29 10:01:12"
 *   }
 * ]
 */
async function getSessionCheckinList(sessionId) {
    const res = await fetch(`http://localhost:8080/api/student-checkins/sessions/${sessionId}`);
    const data = await res.json();

    if (!res.ok) {
        throw new Error('获取签到记录失败');
    }

    return data;
}
/**
 * 查询课程某次签到的出勤情况
 *
 * 接口：
 * GET /api/student-checkins/courses/{courseId}/sessions/{sessionId}/attendance
 *
 * 返回JSON示例：
 * {
 *   "courseId": 1,
 *   "sessionId": 10,
 *   "session": {
 *     "id": 10,
 *     "teacherId": 1,
 *     "courseId": 1,
 *     "passcode": "123456",
 *     "startAt": "2026-04-29 10:00:00",
 *     "endAt": "2026-04-29 10:05:00",
 *     "active": true
 *   },
 *   "summary": {
 *     "enrolledCount": 30,
 *     "presentCount": 18,
 *     "absentCount": 12
 *   },
 *   "presentStudents": [
 *     {
 *       "id": 2,
 *       "name": "小明",
 *       "college": "计算机学院",
 *       "grade": "2023",
 *       "avatarUrl": "/img/a.png"
 *     }
 *   ],
 *   "absentStudents": [
 *     {
 *       "id": 3,
 *       "name": "小红",
 *       "college": "计算机学院",
 *       "grade": "2023",
 *       "avatarUrl": "/img/b.png"
 *     }
 *   ]
 * }
 */
async function getCourseAttendance(courseId, sessionId) {
    const res = await fetch(
        `http://localhost:8080/api/student-checkins/courses/${courseId}/sessions/${sessionId}/attendance`
    );

    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        data = text;
    }

    if (!res.ok) {
        throw new Error(typeof data === 'string' ? data : '查询签到名单失败');
    }

    return data;
}
// 获取课程章节列表
// 参数: courseId - 课程ID
// 返回: Chapter[]
// 示例返回字段: { id, videoUrl, chapterNo, name }
async function getCourseChapters(courseId) {
    const res = await fetch(`${API_BASE}/api/courses/${courseId}/chapters`);
    if (!res.ok) throw new Error(`加载课程章节失败: ${res.status}`);
    return await res.json();
}
// 获取章节习题列表
// 参数: chapterId - 章节ID
// 返回: Question[]
// 示例返回字段: { id, courseId, content, optionA, optionB, optionC, optionD, correctOption }
async function getChapterQuestions(chapterId) {
    const res = await fetch(`${API_BASE}/api/chapters/${chapterId}/questions`);
    if (!res.ok) throw new Error(`加载章节习题失败: ${res.status}`);
    return await res.json();
}
// 获取章节详情
// 参数: chapterId - 章节ID
// 返回: Chapter
// 示例返回字段: { id, videoUrl, chapterNo, name }
async function getChapterById(chapterId) {
    const res = await fetch(`http://localhost:8080/api/chapters/${chapterId}`);
    if (!res.ok) throw new Error(`加载章节详情失败: ${res.status}`);
    return await res.json();
}
/*
  1) 查询某学生在某章节的分数
  - URL: GET /api/student-chapters/{studentId}/{chapterId}
  - 返回: 如果存在，返回 JSON 对象 { studentId, chapterId, score }
           如果不存在，返回 404（这里抛出错误，调用方可据此处理）
  - 用法示例: const rec = await getStudentChapter(123, 45);
*/
async function getStudentChapter(studentId, chapterId) {
    const url = `${API_BASE}/api/student-chapters/${encodeURIComponent(studentId)}/${encodeURIComponent(chapterId)}`;
    const res = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (res.status === 404) {
        // 没有记录：可以返回 null，也可以抛错，根据前端逻辑选择
        return null;
    }
    if (!res.ok) {
        throw new Error(`加载学生章节分数失败: ${res.status} ${res.statusText}`);
    }
    // 返回形如 { studentId: 123, chapterId: 45, score: 88.5 }
    return await res.json();
}

/*
  2) 设置学生在章节的分数
  - URL: POST /api/student-chapters
  - body: JSON { studentId: <number>, chapterId: <number>, score: <number|null> }
  - 返回: 后端实现返回 201 Created (无 body)。此函数仅在请求成功时返回 true。
  - 注意: score 可以为 null（表示清空/未评分），也可以是数值（如 95 或 87.5）
  - 用法示例: await setStudentChapterScore({ studentId: 123, chapterId: 45, score: 90 });
*/
async function setStudentChapterScore({ studentId, chapterId, score }) {
    const url = `${API_BASE}/api/student-chapters`;
    const payload = { studentId, chapterId, score };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        // 可能返回 400（参数错误）、404（关联实体不存在）或 500（服务器错误）
        const text = await res.text().catch(() => '');
        throw new Error(`保存学生章节分数失败: ${res.status} ${res.statusText} ${text}`);
    }

    // 成功：后端返回 201 Created，但无 body，返回 true 表示成功
    return true;
}


// ---------- 在章节下创建题目并自动关联 ----------
// POST /api/chapters/{chapterId}/questions
// 请求 body (Question) 示例:
// {
//   "courseId": 1,
//   "content": "进程的基本概念是什么？",
//   "optionA": "正在执行的程序",
//   "optionB": "已经关闭的程序",
//   "optionC": "磁盘中的文件",
//   "optionD": "内存中的数据块",
//   "correctOption": "A"
// }
// 返回: 201 Created，body 为创建后的 Question 对象（包含 id）
// 若 chapterId 不存在，返回 404
async function createQuestionUnderChapter(chapterId, questionPayload) {
    // questionPayload: { courseId, content, optionA, optionB, optionC, optionD, correctOption }
    const res = await fetch(`${API_BASE}/api/chapters/${chapterId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionPayload)
    });
    if (res.status === 404) {
        throw new Error(`章节 ${chapterId} 未找到 (404)`);
    }
    if (!res.ok) {
        const txt = await res.text().catch(()=>"");
        throw new Error(`在章节下创建题目失败: ${res.status} ${txt}`);
    }
    const q = await res.json();
    return q;
}


/**
 * 在服务器端原子地创建章节并绑定到指定课程。
 *
 * 调用接口： POST /api/courses/{courseId}/chapters?sortOrder={sortOrder}
 *
 * 参数：
 *  - courseId (Number) 必需：要绑定的课程 ID
 *  - chapterPayload (Object) 必需：章节对象，例如 { videoUrl, chapterNo, name }
 *  - sortOrder (Number|null) 可选：用于 course_chapter.sort_order（若不需要可传 null/undefined）
 *
 * 返回：
 *  - 成功 (201)：解析并返回后端 JSON 对象 { chapter, courseChapter }
 *  - 404：课程不存在，函数抛出包含状态的 Error
 *  - 其它非 2xx：函数抛出包含状态和服务器返回文本的 Error
 *
 * 示例：
 *   const payload = { videoUrl: "", chapterNo: 2, name: "进程管理" };
 *   const result = await createChapterBoundToCourse(1, payload, 1);
 *   // result.chapter -> 新的 Chapter 对象
 *   // result.courseChapter -> 绑定对象
 */
async function createChapter(courseId, chapterPayload, sortOrder = null) {
    if (courseId == null) throw new Error("courseId is required");
    if (!chapterPayload || typeof chapterPayload !== "object") throw new Error("chapterPayload must be an object");

    // build URL with optional sortOrder query param
    let url = `${API_BASE}/api/courses/${encodeURIComponent(courseId)}/chapters`;
    if (sortOrder !== null && sortOrder !== undefined) {
        url += `?sortOrder=${encodeURIComponent(sortOrder)}`;
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chapterPayload)
    });

    if (res.status === 404) {
        throw new Error(`Course ${courseId} not found (404)`);
    }

    if (!res.ok) {
        // try to include server message
        const txt = await res.text().catch(() => "");
        throw new Error(`Create & bind chapter failed: ${res.status} ${txt}`);
    }

    // expected JSON: { chapter: {...}, courseChapter: {...} }
    const body = await res.json();
    return body;
}




