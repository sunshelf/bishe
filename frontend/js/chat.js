// Ensure a global escapeHtml is available (fallback) to prevent ReferenceError from other scripts
if (typeof window !== 'undefined' && !window.escapeHtml) {
    window.escapeHtml = function(str){
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
}

(function(){
    let messagesEl = null;
    let inputEl = null;
    let sendBtn = null;
    let clearBtn = null;
    let userListEl = null;
    let contactsToggle = null;
    let backdrop = null;

    let allMessages = [];
    let contacts = new Map(); // key => { id, type, name, avatarUrl, college }
    let selectedContact = null; // always a concrete contact when available
    let chatLogoutBtn = null;

    // 新增：用户资料缓存与补全函数
    const profileCache = new Map(); // key `${role}:${id}` -> profile
    function roleLabel(role){ return role === 'teacher' ? '老师' : '学生'; }

    // helper to create avatar text from name (首字母)
    function initials(name){
        if(!name) return '';
        const parts = String(name).trim().split(/\s+/);
        if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }

    // safe escape helper: prefer local escapeHtml, fallback to window.escapeHtml or identity
    const safeEscape = (typeof escapeHtml === 'function') ? escapeHtml : ((typeof window !== 'undefined' && typeof window.escapeHtml === 'function') ? window.escapeHtml : (s=> s == null ? '' : String(s)));

    async function getProfileCached(role, id){
        const key = `${role}:${id}`;
        if (profileCache.has(key)) return profileCache.get(key);
        if (id == null || id === '') { profileCache.set(key, null); return null; }
        try {
            if (typeof getUserProfile === 'function'){
                const p = await getUserProfile(role, id);
                profileCache.set(key, p || null);
                return p || null;
            }
        } catch(e){ console.warn('getUserProfile failed', role, id, e); }
        profileCache.set(key, null);
        return null;
    }

    // 将一组消息补全发送者和对方（相对于 currentUser）的资料
    async function enrichMessagesWithProfiles(messages, currentUser){
        const tasks = messages.map(async (m) => {
            const senderRole = m.fromType;
            const senderId = m.fromId;
            const senderProfile = await getProfileCached(senderRole, senderId);

            // 对当前用户来说的“对方”
            let otherRole, otherId;
            if (currentUser && currentUser.role === 'student'){
                otherRole = 'teacher'; otherId = m._teacherId;
            } else {
                otherRole = 'student'; otherId = m._studentId;
            }
            const otherProfile = await getProfileCached(otherRole, otherId);

            return {
                ...m,
                fromName: senderProfile?.name || (m.fromName || `${roleLabel(senderRole)}${senderId ?? ''}`),
                _fromAvatarUrl: senderProfile?.avatarUrl || (m._fromAvatarUrl || ''),
                _fromCollege: senderProfile?.college || senderProfile?.collegeName || senderProfile?.department || '',
                _counterpartName: otherProfile?.name || (m._counterpartName || `${roleLabel(otherRole)}${otherId ?? ''}`),
                _counterpartAvatarUrl: otherProfile?.avatarUrl || (m._counterpartAvatarUrl || ''),
                _counterpartCollege: otherProfile?.college || otherProfile?.collegeName || otherProfile?.department || ''
            };
        });
        return Promise.all(tasks);
    }

    // render a message
    function addMessageEl({text, self=false}){
        const li = document.createElement('li');
        li.className = 'message' + (self ? ' self' : '');
        const content = document.createElement('div');
        content.className = 'content';
        content.textContent = text;
        li.appendChild(content);
        messagesEl.appendChild(li);
    }

    // Scroll helper: robustly scroll the messages area to the bottom.
    // We attempt several techniques and times to handle layout shifts (images, fonts, async renders):
    // - Prefer scrollIntoView on the last message element.
    // - Run inside two rAF ticks, then retry via timed fallbacks (50ms, 150ms).
    // - Final fallback: set scrollTop directly.
    function scrollMessagesToBottom(){
        try{
            // Immediate jump so user sees the latest message right away.
            try{ messagesEl.scrollTop = messagesEl.scrollHeight; }catch(e){}

            const attemptScroll = () => {
                const msgs = messagesEl.querySelectorAll('li.message');
                const last = msgs && msgs.length ? msgs[msgs.length-1] : null;
                if (last) {
                    // Force layout/read to stabilise sizes
                    try{ last.offsetHeight; /* force reflow */ }catch(_){ }
                    try{ last.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' }); }
                    catch(e){ try{ messagesEl.scrollTop = messagesEl.scrollHeight; }catch(_){ } }
                } else {
                    try{ messagesEl.scrollTop = messagesEl.scrollHeight; }catch(_){ }
                }
            };

            const isAtBottom = () => {
                const tolerance = 4; // pixels
                return (messagesEl.scrollTop + messagesEl.clientHeight) >= (messagesEl.scrollHeight - tolerance);
            };

            // run initial attempts inside rAFs to let layout settle
            requestAnimationFrame(()=>{
                requestAnimationFrame(()=>{
                    attemptScroll();
                });
            });

            // scheduled retries with increasing delay until we detect we're at bottom
            const delays = [30, 80, 200, 500, 1000];
            delays.forEach(d => setTimeout(()=>{ if (!isAtBottom()) attemptScroll(); }, d));

            // final assurance
            setTimeout(()=>{ if (!isAtBottom()) try{ messagesEl.scrollTop = messagesEl.scrollHeight; }catch(_){} }, 1600);
        }catch(e){ try{ messagesEl.scrollTop = messagesEl.scrollHeight; }catch(_){/*ignore*/} }
    }

    function renderMessages(filterContact){
        messagesEl.innerHTML = '';
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const list = allMessages.filter(m => {
            if(!user || !filterContact) return false;
            const otherId = filterContact.id;
            if (user.role === 'student') {
                return String(m._teacherId) === String(otherId) && String(m._studentId) === String(user.id);
            } else {
                return String(m._studentId) === String(otherId) && String(m._teacherId) === String(user.id);
            }
        });
        if (list.length === 0) {
            // If there's a selected contact, show their avatar and name above the placeholder
            if (filterContact) {
                // header with avatar + name/meta
                const header = document.createElement('div');
                header.className = 'no-messages-header';

                const avatarWrap = document.createElement('div');
                avatarWrap.className = 'user-avatar no-msg-avatar';
                avatarWrap.innerHTML = filterContact.avatarUrl
                    ? `<img class="user-avatar-img" src="${safeEscape(filterContact.avatarUrl)}" alt="${safeEscape(filterContact.name || '用户')}"/>`
                    : `${safeEscape(initials(filterContact.name || 'U'))}`;

                const infoWrap = document.createElement('div');
                infoWrap.className = 'no-msg-info';
                const nameDiv = document.createElement('div');
                nameDiv.className = 'user-name no-msg-name';
                nameDiv.textContent = filterContact.name || '';
                const metaDiv = document.createElement('div');
                metaDiv.className = 'user-meta no-msg-meta';
                metaDiv.textContent = filterContact.college || '';
                infoWrap.appendChild(nameDiv);
                infoWrap.appendChild(metaDiv);

                header.appendChild(avatarWrap);
                header.appendChild(infoWrap);
                messagesEl.appendChild(header);
            }

            const li = document.createElement('li');
            li.className = 'message no-messages';
            li.textContent = '暂无消息。';
            messagesEl.appendChild(li);
            // ensure we're scrolled properly
            scrollMessagesToBottom();
            return;
        }

        // sort by timestamp ascending to ensure chronological order
        list.sort((a,b)=>{
            const ta = a.timestamp || a.time || a.createdAt || 0;
            const tb = b.timestamp || b.time || b.createdAt || 0;
            return new Date(ta).getTime() - new Date(tb).getTime();
        });

        // Insert date dividers between messages when the day changes
        let prevDate = null;
        let prevMinute = null;
        list.forEach(m => {
            const ts = m.timestamp || m.time || m.createdAt;
            const d = ts ? new Date(ts) : new Date();
            const dateStr = d.toLocaleDateString();
            // date divider when day changes
            if (dateStr !== prevDate) {
                // create divider
                const divLi = document.createElement('li');
                divLi.className = 'date-divider';
                divLi.textContent = dateStr;
                messagesEl.appendChild(divLi);
                prevDate = dateStr;
                prevMinute = null; // reset minute when day changes
            }

            // time divider at minute precision when minute changes
            const minuteStr = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
            if (minuteStr !== prevMinute) {
                const tLi = document.createElement('li');
                tLi.className = 'time-divider';
                tLi.textContent = minuteStr;
                messagesEl.appendChild(tLi);
                prevMinute = minuteStr;
            }

            const userNow = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
            const self = (m.fromType && m.fromId && userNow && String(m.fromId) === String(userNow.id) && String(m.fromType) === String(userNow.role));
            addMessageEl({text: m.text || m.content || '', self});
        });
        // After fully rendering the message list, keep the view at the bottom
        scrollMessagesToBottom();
    }

    function buildContacts(){
        contacts.clear();
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if(!user) return;
        // for each message, derive the counterpart relative to current user
        allMessages.forEach(m => {
            let otherId;
            let otherType;
            if (user.role === 'student') {
                otherType = 'teacher';
                otherId = m._teacherId;
            } else {
                otherType = 'student';
                otherId = m._studentId;
            }
            const key = `${otherType}:${otherId || 'anon'}`;
            if (!contacts.has(key)){
                const displayName = m._counterpartName || ((otherType === 'teacher') ? (`老师${otherId}`) : (`学生${otherId}`));
                const avatarUrl = m._counterpartAvatarUrl || '';
                const college = m._counterpartCollege || '';
                contacts.set(key, { id: otherId, type: otherType, name: displayName, avatarUrl, college });
            }
        });
    }
    // alias for backward compatibility
    // const buildParticipants = buildContacts;

    function ensureBackdrop(){
        if(!backdrop){
            backdrop = document.createElement('div');
            backdrop.className = 'chat-backdrop';
            document.body.appendChild(backdrop);
            backdrop.addEventListener('click', ()=>{ closeDrawer(); });
        }
    }

    function openDrawer(){
        ensureBackdrop();
        document.querySelector('.chat-sidebar').classList.remove('drawer-closed');
        document.querySelector('.chat-sidebar').classList.add('drawer-open');
        backdrop.classList.add('visible');
    }
    function closeDrawer(){
        const sb = document.querySelector('.chat-sidebar');
        if(sb){ sb.classList.remove('drawer-open'); sb.classList.add('drawer-closed'); }
        if(backdrop){ backdrop.classList.remove('visible'); }
    }

    // modify contact click to also close drawer (for mobile)
    function renderContactList(){
        userListEl.innerHTML = '';

        // If we have no contacts but a selectedContact exists (e.g., teacher opened a new student chat),
        // render that single contact so the teacher can send a message.
        if (contacts.size === 0) {
            if (selectedContact) {
                const p = selectedContact;
                const li = document.createElement('li');
                li.className = 'user-item active';
                const avatarText = initials(p.name || 'U');
                li.innerHTML = `<div class="user-avatar">${p.avatarUrl ? `<img class="user-avatar-img" src="${safeEscape(p.avatarUrl)}" alt="${safeEscape(p.name || '用户')}"/>` : `${safeEscape(avatarText)}`}</div><div><div class="user-name">${safeEscape(p.name)}</div><div class="user-meta">${safeEscape(p.college||'')}</div></div>`;
                li.addEventListener('click', ()=>{ selectedContact = p; renderContactList(); renderMessages(p); closeDrawer(); });
                userListEl.appendChild(li);
                return;
            }
            const li = document.createElement('li');
            li.className = 'user-item';
            li.innerHTML = `<div class="user-avatar">?</div><div><div class="user-name">暂无对话</div><div class="user-meta">开始一次对话以显示</div></div>`;
            userListEl.appendChild(li);
            return;
        }

        for(const p of contacts.values()){
            const li = document.createElement('li');
            li.className = 'user-item' + (selectedContact && String(selectedContact.id) === String(p.id) && String(selectedContact.type) === String(p.type) ? ' active' : '');
            const avatarText = initials(p.name || 'U');
            li.innerHTML = `<div class="user-avatar">${p.avatarUrl ? `<img class="user-avatar-img" src="${safeEscape(p.avatarUrl)}" alt="${safeEscape(p.name || '用户')}"/>` : `${safeEscape(avatarText)}`}</div><div><div class="user-name">${safeEscape(p.name)}</div><div class="user-meta">${safeEscape(p.college||'')}</div></div>`;
             li.addEventListener('click', ()=>{ selectedContact = p; renderContactList(); renderMessages(p); closeDrawer(); });
             userListEl.appendChild(li);
         }
     }

    // Utility: read query param
    function getQueryParam(name){
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    // load history - best-effort using getUserChats
    async function loadHistory(){
        try{
            // Try to infer current user
            const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

            if (!user) {
                // show helpful UI when not logged in instead of silently doing nothing
                userListEl.innerHTML = '';
                const li = document.createElement('li');
                li.className = 'user-item';
                li.innerHTML = `<div class="user-avatar">?</div><div><div class="user-name">未登录</div><div class="user-meta">请先登录以加载聊天</div></div>`;
                userListEl.appendChild(li);

                messagesEl.innerHTML = '';
                const mli = document.createElement('li');
                mli.className = 'message';
                mli.textContent = '当前未登录，请先登录后查看聊天记录。';
                messagesEl.appendChild(mli);
                return;
            }
             const type = user.role ;
             const data = await getUserChats(type, user.id); // uses getData.js
              if (!Array.isArray(data)) return;

            // Map backend chat items to internal message shape; keep all messages
            allMessages = data.map(item => {
                const fromType = item.sender === 'student' ? 'student' : 'teacher';
                const fromId = fromType === 'student' ? item.studentId : item.teacherId;
                return {
                    id: item.id,
                    fromType,
                    fromId,
                    fromName: '', // will be filled by profile lookup
                    text: item.content || item.text || '',
                    timestamp: item.createdAt || item.time || item.timestamp,
                    _teacherId: item.teacherId,
                    _studentId: item.studentId,
                    _counterpartAvatarUrl: '',
                    _counterpartName: ''
                };
            });

            // 补全每条消息的头像与姓名信息
            allMessages = await enrichMessagesWithProfiles(allMessages, user);

            buildContacts();
            // contacts built

            // If the page was opened with a query param for the counterpart (teacherId for students,
            // or studentId/studentID for teachers), ensure we have a contact entry for that counterpart
            // even if there are no previous messages. This allows teachers to open a new chat with a
            // student who hasn't chatted before.
            const counterpartParam = (user.role === 'student')
                ? getQueryParam('teacherId')
                : (getQueryParam('studentId') || getQueryParam('studentID'));
            if (counterpartParam) {
                const otherType = (user.role === 'student') ? 'teacher' : 'student';
                let p = [...contacts.values()].find(x => String(x.type) === otherType && String(x.id) === String(counterpartParam));
                if (!p) {
                    // try to fetch profile for the counterpart and create a contact placeholder
                    const prof = await getProfileCached(otherType, counterpartParam);
                    p = {
                        id: counterpartParam,
                        type: otherType,
                        name: prof?.name || (otherType === 'teacher' ? `老师${counterpartParam}` : `学生${counterpartParam}`),
                        avatarUrl: prof?.avatarUrl || '',
                        college: prof?.college || ''
                    };
                    contacts.set(`${otherType}:${counterpartParam}`, p);
                    console.debug('Created placeholder contact from query param', p);
                } else {
                    console.debug('Found existing contact for counterpart param', p);
                }
                selectedContact = p;
            }

             // no 'all' mode: default to first contact when no explicit selection
             if (!selectedContact && contacts.size > 0) {
                 selectedContact = contacts.values().next().value;
             }

            // selectedContact set (or none)

            renderContactList();
            renderMessages(selectedContact);
        }catch(e){
            console.warn('加载历史聊天失败', e);
            // show error to user in UI
            messagesEl.innerHTML = '';
            const li = document.createElement('li');
            li.className = 'message';
            li.textContent = '加载聊天记录失败，请检查后端服务或网络（查看控制台获取详情）。';
            messagesEl.appendChild(li);
         }
    }

    // send local echo (replace with real send call if available)
    async function sendMessage(){
        // Defensive: ensure selectedContact exists for teachers; if not, try to initialize from query param
        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (user && user.role === 'teacher' && !selectedContact) {
            const sid = getQueryParam('studentId') || getQueryParam('studentID');
            if (sid) {
                console.debug('Initializing selectedContact for teacher from query param studentId=', sid);
                const prof = await getProfileCached('student', sid);
                const p = { id: sid, type: 'student', name: prof?.name || ('学生' + sid), avatarUrl: prof?.avatarUrl || '', college: prof?.college || '' };
                contacts.set(`student:${sid}`, p);
                selectedContact = p;
                renderContactList();
            }
        }

         const txt = inputEl.value.trim();
         if (!txt) return;
         // reuse `user` declared earlier in this function (defensive init block)
         if (!user) return;
         const name = user ? (user.name || ('用户' + user.id)) : '匿名';
        // construct optimistic local message (will be replaced/updated with server response if available)
        const localMsg = {
            id: 'local-' + Date.now() + '-' + Math.floor(Math.random()*1000000),
            _pending: true,
            fromType: user.role,
            fromId: user.id,
            fromName: name,
            text: txt,
            timestamp: new Date().toISOString(),
            _teacherId: null,
            _studentId: null
        };
// 规范化 id，避免字符串/空值导致后端入库异常
        const toNumOrNull = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };

        if (user) {
            if (user.role === 'student') {
                localMsg._studentId = toNumOrNull(user.id);

                // 优先：当��选中的老师；回退：URL 上的 teacherId
                let teacherId;
                if (selectedContact && selectedContact.type === 'teacher') {
                    teacherId = selectedContact.id;
                } else {
                    teacherId = getQueryParam('teacherId');
                }
                localMsg._teacherId = toNumOrNull(teacherId);
            } else {
                // teacher sending: set teacherId to numeric if possible, otherwise leave as raw
                const tNum = toNumOrNull(user.id);
                localMsg._teacherId = (tNum !== null) ? tNum : user.id;

                // 老师端优先取当前选中的学生
                let studentId;
                if (selectedContact && selectedContact.type === 'student') {
                    studentId = selectedContact.id;
                }
                const sNum = toNumOrNull(studentId);
                // prefer numeric id for backend if available, otherwise use raw string id (some backends accept strings)
                localMsg._studentId = (sNum !== null) ? sNum : (studentId || null);
            }
        }

// 学生发消息时 teacherId 必填（按你的业务）
        if (user.role === 'student' && localMsg._teacherId == null) {
            alert('请先选择老师后再发送消息');
            return;
        }


        // optimistic UI update
        allMessages.push(localMsg);
        // enrich the optimistic message so name/avatar show immediately
        try {
            const enrichedArr = await enrichMessagesWithProfiles([localMsg], user);
            if (enrichedArr && enrichedArr[0]){
                const idxOptim = allMessages.findIndex(m => m.id === localMsg.id);
                if (idxOptim >= 0) allMessages.splice(idxOptim, 1, enrichedArr[0]);
            }
        } catch (e) {
            // non-fatal
            console.warn('enrich optimistic message failed', e);
        }
        buildContacts();
        renderContactList();
        renderMessages(selectedContact);
        scrollMessagesToBottom();
        inputEl.value = '';

        // prepare payload for backend (match example: teacherId 可留空)
        const payload = {
            teacherId: localMsg._teacherId,
            studentId: localMsg._studentId,
            sender: user.role === 'student' ? 'student' : 'teacher',
            content: localMsg.text
        };

        // try to persist to backend via addChatRecord (defined in getData.js)
        try{
            if (typeof addChatRecord === 'function'){
                const saved = await addChatRecord(payload);
                // replace the optimistic message with server-returned record (map fields)
                const idx = allMessages.findIndex(m => m.id === localMsg.id && m._pending);
                const mapped = {
                    id: saved.id,
                    fromType: saved.sender === 'student' ? 'student' : 'teacher',
                    fromId: saved.sender === 'student' ? saved.studentId : saved.teacherId,
                    fromName: '',
                    text: saved.content,
                    timestamp: saved.createdAt || new Date().toISOString(),
                    _teacherId: saved.teacherId,
                    _studentId: saved.studentId,
                    _counterpartAvatarUrl: saved.avatarUrl || saved.counterpartAvatarUrl || saved.userAvatarUrl || ''
                };
                // 使用 profile 补全刚保存的消息并替换到消息列表
                const enrichedSavedArr = await enrichMessagesWithProfiles([mapped], (typeof getCurrentUser === 'function') ? getCurrentUser() : null);
                const enrichedSaved = enrichedSavedArr && enrichedSavedArr[0] ? enrichedSavedArr[0] : mapped;
                if (idx >= 0) allMessages.splice(idx, 1, enrichedSaved);
                renderContactList();
                renderMessages(selectedContact);
            }
        }catch(e){
        console.warn('保存消息失败', e);
        // show error to user in UI
        const errMsg = String(e).includes('401') ? '保存失败：未授权（请重新登录）' : '保存失败：' + (e.message || e);
        if (messagesEl) messagesEl.innerHTML = '';
        const li = document.createElement('li');
        li.className = 'message';
        li.textContent = errMsg;
        if (messagesEl) messagesEl.appendChild(li);
     }
 }

 // Expose debug helper to inspect chat state in browser console
 try{ if (typeof window !== 'undefined') window.__debugChatState = function(){ return { selectedContact, contacts: Array.from(contacts.values()), allMessages }; }; }catch(e){}

 // Initialize UI references and attach handlers after DOM is ready
    function initUI(){
    try{
        messagesEl = document.getElementById('messages');
        inputEl = document.getElementById('messageInput');
        sendBtn = document.getElementById('sendBtn');
        clearBtn = document.getElementById('clearBtn');
        userListEl = document.getElementById('userList');
        contactsToggle = document.getElementById('participantsToggle');
        chatLogoutBtn = document.getElementById('chatLogoutBtn');

        // contacts toggle (open/close sidebar)
        if (contactsToggle && typeof contactsToggle.addEventListener === 'function'){
            contactsToggle.addEventListener('click', ()=>{
                const sb = document.querySelector('.chat-sidebar');
                const open = sb && sb.classList.contains('drawer-open');
                if(open) closeDrawer(); else openDrawer();
            });
        }

        // logout button handler: navigate back (no confirmation)
        if (chatLogoutBtn && typeof chatLogoutBtn.addEventListener === 'function'){
           chatLogoutBtn.addEventListener('click', (e)=>{
                e.preventDefault();
                try{
                    if (window.history && window.history.length > 1){
                        window.history.back();
                    } else {
                        try{ window.location.href = '..'; }catch(_){ /* ignore */ }
                    }
                }catch(err){ console.warn('navigate back failed', err); }
            });
        }

        // send / input / clear
        if (sendBtn && typeof sendBtn.addEventListener === 'function') sendBtn.addEventListener('click', (e)=>{ e.preventDefault(); sendMessage(); });
        if (inputEl && typeof inputEl.addEventListener === 'function') inputEl.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });
        if (clearBtn && typeof clearBtn.addEventListener === 'function') clearBtn.addEventListener('click', (e)=>{ e.preventDefault(); if(messagesEl) messagesEl.innerHTML = ''; allMessages = []; buildContacts(); renderContactList(); });
    }catch(e){ console.warn('initUI failed', e); }
}

// Run initUI after DOM is ready, then load history
if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ initUI(); loadHistory().catch(e=>console.warn('loadHistory failed', e)); });
} else {
    initUI();
    loadHistory().catch(e=>console.warn('loadHistory failed', e));
}

})();
