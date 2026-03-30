import { auth, db, ref, push, set, onValue, update, get, child, CLOUD_NAME, UPLOAD_PRESET } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";

// ========== المتغيرات العامة ==========
let currentUser = null;
let currentUserData = null;
let allUsers = {};
let allPosts = [];
let allStories = [];
let selectedMediaFile = null;
let selectedMediaType = null;
let currentChatUserId = null;
let viewingProfileUserId = null;
let mediaRecorder = null;
let audioChunks = [];

// ========== إعدادات الأدمن ==========
const ADMIN_EMAILS = ['jasim28v@gmail.com'];
let isAdmin = false;

// ========== الوضع الليلي ==========
window.toggleTheme = function() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
};

// ========== المصادقة ==========
window.switchAuth = function(type) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    document.getElementById(type + 'Form').classList.add('active');
};

window.login = async function() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const msg = document.getElementById('loginMsg');
    if (!email || !password) { msg.innerText = 'الرجاء ملء جميع الحقول'; return; }
    msg.innerText = 'جاري تسجيل الدخول...';
    try {
        await signInWithEmailAndPassword(auth, email, password);
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/user-not-found') msg.innerText = 'لا يوجد حساب بهذا البريد';
        else if (error.code === 'auth/wrong-password') msg.innerText = 'كلمة المرور غير صحيحة';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

window.register = async function() {
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const msg = document.getElementById('regMsg');
    if (!name || !email || !password) { msg.innerText = 'املأ جميع الحقول'; return; }
    if (password.length < 6) { msg.innerText = 'كلمة المرور 6 أحرف على الأقل'; return; }
    msg.innerText = 'جاري إنشاء الحساب...';
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, `users/${userCredential.user.uid}`), {
            name, email, bio: '', avatarUrl: '', coverUrl: '', followers: {}, following: {}, createdAt: Date.now()
        });
        msg.innerText = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') msg.innerText = 'البريد الإلكتروني مستخدم بالفعل';
        else msg.innerText = 'حدث خطأ: ' + error.message;
    }
};

window.logout = function() { signOut(auth); location.reload(); };

// ========== تحميل البيانات ==========
async function loadUserData() {
    const snap = await get(child(ref(db), `users/${currentUser.uid}`));
    if (snap.exists()) currentUserData = { uid: currentUser.uid, ...snap.val() };
}
onValue(ref(db, 'users'), (s) => { allUsers = s.val() || {}; });

// ========== عرض المنشورات ==========
onValue(ref(db, 'posts'), (s) => {
    const data = s.val();
    if (!data) { allPosts = []; renderFeed(); return; }
    allPosts = [];
    Object.keys(data).forEach(key => allPosts.push({ id: key, ...data[key] }));
    allPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderFeed();
});

function renderFeed() {
    const container = document.getElementById('feedContainer');
    if (!container) return;
    container.innerHTML = '';
    if (allPosts.length === 0) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div><span>لا توجد منشورات بعد</span></div>';
        return;
    }
    allPosts.forEach(post => {
        const user = allUsers[post.sender] || { name: post.senderName || 'user', avatarUrl: '' };
        const isLiked = post.likedBy && post.likedBy[currentUser?.uid];
        const isRetweeted = post.retweets && post.retweets[currentUser?.uid];
        const commentsCount = post.comments ? Object.keys(post.comments).length : 0;
        const retweetCount = post.retweets ? Object.keys(post.retweets).length : 0;
        
        let mediaHtml = '';
        if (post.mediaUrl) {
            if (post.mediaType === 'image') {
                mediaHtml = `<div class="tweet-media"><img src="${post.mediaUrl}" loading="lazy"></div>`;
            } else if (post.mediaType === 'video') {
                mediaHtml = `<div class="tweet-media"><video controls src="${post.mediaUrl}"></video></div>`;
            } else if (post.mediaType === 'audio') {
                mediaHtml = `<div class="tweet-media"><audio controls src="${post.mediaUrl}"></audio></div>`;
            }
        }
        
        const div = document.createElement('div');
        div.className = 'tweet-card';
        div.innerHTML = `
            <div class="tweet-header">
                <div class="tweet-avatar" onclick="viewProfile('${post.sender}')">${user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.name?.charAt(0) || '👤')}</div>
                <div class="tweet-user-info">
                    <div class="tweet-name-row">
                        <span class="tweet-name" onclick="viewProfile('${post.sender}')">${user.name}</span>
                        <span class="tweet-username">@${user.name?.toLowerCase().replace(/\s/g, '')}</span>
                        <span class="tweet-time">· ${new Date(post.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="tweet-content">${post.text || ''}</div>
                    ${mediaHtml}
                    <div class="tweet-actions">
                        <button class="tweet-action ${isLiked ? 'active' : ''}" onclick="toggleLike('${post.id}', this)"><i class="fas fa-heart"></i> <span>${post.likes || 0}</span></button>
                        <button class="tweet-action" onclick="openCommentModal('${post.id}')"><i class="fas fa-comment"></i> <span>${commentsCount}</span></button>
                        <button class="tweet-action ${isRetweeted ? 'active' : ''}" onclick="retweet('${post.id}', this)"><i class="fas fa-retweet"></i> <span>${retweetCount}</span></button>
                        <button class="tweet-action" onclick="sharePost('${post.id}')"><i class="fas fa-share"></i></button>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ========== رفع الوسائط إلى Cloudinary ==========
async function uploadMedia(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    let resourceType = 'image';
    if (file.type.startsWith('video/')) resourceType = 'video';
    else if (file.type.startsWith('audio/')) resourceType = 'raw';
    formData.append('resource_type', resourceType);
    
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
    const response = await fetch(url, { method: 'POST', body: formData });
    const data = await response.json();
    return { url: data.secure_url, type: resourceType === 'raw' ? 'audio' : resourceType };
}

// ========== إنشاء منشور ==========
window.openCompose = function() { document.getElementById('composePanel').classList.add('open'); resetCompose(); };
window.closeCompose = function() { document.getElementById('composePanel').classList.remove('open'); };

function resetCompose() {
    document.getElementById('postText').value = '';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('mediaPreview').style.display = 'none';
    selectedMediaFile = null;
    selectedMediaType = null;
    document.getElementById('postImage').value = '';
    document.getElementById('postVideo').value = '';
    document.getElementById('postStatus').innerHTML = '';
}

window.previewMedia = function(input, type) {
    const file = input.files[0];
    if (!file) return;
    selectedMediaFile = file;
    selectedMediaType = type;
    const reader = new FileReader();
    reader.onload = function(e) {
        if (type === 'image') {
            document.getElementById('mediaPreview').innerHTML = `<img src="${e.target.result}" class="max-h-48 rounded-lg">`;
        } else if (type === 'video') {
            document.getElementById('mediaPreview').innerHTML = `<video controls class="max-h-48 rounded-lg"><source src="${e.target.result}"></video>`;
        }
        document.getElementById('mediaPreview').style.display = 'block';
    };
    reader.readAsDataURL(file);
};

window.startAudioRecording = async function() {
    const btn = document.getElementById('audioRecordBtn');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => { audioChunks.push(event.data); };
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mp3' });
            selectedMediaFile = audioFile;
            selectedMediaType = 'audio';
            const audioUrl = URL.createObjectURL(audioBlob);
            document.getElementById('mediaPreview').innerHTML = `<audio controls src="${audioUrl}"></audio>`;
            document.getElementById('mediaPreview').style.display = 'block';
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        btn.innerHTML = '<i class="fas fa-stop-circle text-red-500"></i>';
    } catch (err) { alert('لا يمكن الوصول إلى الميكروفون'); }
};

window.createPost = async function() {
    const text = document.getElementById('postText').value;
    if (!text.trim() && !selectedMediaFile) { alert('اكتب شيئاً أو اختر وسائط'); return; }
    const status = document.getElementById('postStatus');
    status.innerHTML = '📤 جاري النشر...';
    
    let mediaUrl = '';
    let mediaType = 'none';
    
    if (selectedMediaFile) {
        try {
            const result = await uploadMedia(selectedMediaFile);
            mediaUrl = result.url;
            mediaType = result.type;
        } catch (error) {
            status.innerHTML = '❌ فشل رفع الوسائط: ' + error.message;
            return;
        }
    }
    
    try {
        await push(ref(db, 'posts'), {
            text: text,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            sender: currentUser.uid,
            senderName: currentUserData?.name,
            likes: 0,
            likedBy: {},
            retweets: {},
            comments: {},
            timestamp: Date.now()
        });
        status.innerHTML = '✅ تم النشر!';
        setTimeout(() => { closeCompose(); }, 1500);
    } catch (error) {
        status.innerHTML = '❌ فشل النشر: ' + error.message;
    }
};

// ========== التفاعلات ==========
window.toggleLike = async function(postId, btn) {
    if (!currentUser) return;
    const postRef = ref(db, `posts/${postId}`);
    const snap = await get(postRef);
    const post = snap.val();
    let likes = post.likes || 0;
    let likedBy = post.likedBy || {};
    if (likedBy[currentUser.uid]) {
        likes--; delete likedBy[currentUser.uid];
    } else {
        likes++; likedBy[currentUser.uid] = true;
        addNotification(post.sender, 'like');
    }
    await update(postRef, { likes, likedBy });
    btn.classList.toggle('active');
    btn.querySelector('span').innerText = likes;
};

window.retweet = async function(postId, btn) {
    if (!currentUser) return;
    const postRef = ref(db, `posts/${postId}`);
    const snap = await get(postRef);
    const post = snap.val();
    let retweets = post.retweets || {};
    if (retweets[currentUser.uid]) {
        delete retweets[currentUser.uid];
    } else {
        retweets[currentUser.uid] = true;
        addNotification(post.sender, 'retweet');
    }
    await update(postRef, { retweets });
    btn.querySelector('span').innerText = Object.keys(retweets).length;
    btn.classList.toggle('active');
};

window.sharePost = function(postId) {
    navigator.clipboard.writeText(window.location.href + '?post=' + postId);
    alert('✅ تم نسخ رابط المنشور');
};

window.openCommentModal = function(postId) {
    const comment = prompt('أضف تعليقاً:');
    if (comment && comment.trim()) {
        addComment(postId, comment);
    }
};

async function addComment(postId, text) {
    await push(ref(db, `posts/${postId}/comments`), {
        userId: currentUser.uid,
        username: currentUserData?.name,
        text: text,
        timestamp: Date.now()
    });
    const post = allPosts.find(p => p.id === postId);
    if (post && post.sender !== currentUser.uid) addNotification(post.sender, 'comment');
    renderFeed();
}

// ========== الإشعارات ==========
async function addNotification(targetUserId, type) {
    if (targetUserId === currentUser.uid) return;
    const messages = {
        like: 'أعجب بمنشورك', comment: 'علق على منشورك', retweet: 'أعاد تغريد منشورك',
        follow: 'بدأ بمتابعتك', unfollow: 'توقف عن متابعتك'
    };
    await push(ref(db, `notifications/${targetUserId}`), {
        type, fromUserId: currentUser.uid, fromUsername: currentUserData?.name,
        message: messages[type], timestamp: Date.now(), read: false
    });
}

window.openNotifications = async function() {
    const panel = document.getElementById('notificationsPanel');
    const snap = await get(child(ref(db), `notifications/${currentUser.uid}`));
    const notifs = snap.val() || {};
    const container = document.getElementById('notificationsList');
    container.innerHTML = '';
    Object.values(notifs).reverse().forEach(n => {
        container.innerHTML += `<div class="notification-item"><i class="fas ${n.type === 'like' ? 'fa-heart text-pink-500' : n.type === 'comment' ? 'fa-comment text-blue-500' : n.type === 'retweet' ? 'fa-retweet text-green-500' : 'fa-user-plus text-cyan-500'}"></i><div><div class="font-bold">${n.fromUsername}</div><div class="text-sm text-gray-500">${n.message}</div></div></div>`;
        if (!n.read) update(ref(db, `notifications/${currentUser.uid}/${Object.keys(notifs).find(k => notifs[k] === n)}`), { read: true });
    });
    panel.classList.add('open');
};
window.closeNotifications = function() { document.getElementById('notificationsPanel').classList.remove('open'); };

// ========== الملف الشخصي ==========
window.openMyProfile = function() { viewProfile(currentUser.uid); };
window.viewProfile = async function(userId) {
    if (!userId) return;
    viewingProfileUserId = userId;
    await loadProfileData(userId);
    document.getElementById('profilePanel').classList.add('open');
};
window.closeProfile = function() { document.getElementById('profilePanel').classList.remove('open'); viewingProfileUserId = null; };

async function loadProfileData(userId) {
    const userSnap = await get(child(ref(db), `users/${userId}`));
    const user = userSnap.val();
    if (!user) return;
    const coverEl = document.getElementById('profileCover');
    if (user.coverUrl) coverEl.style.background = `url(${user.coverUrl}) center/cover`;
    else coverEl.style.background = 'linear-gradient(135deg, #1d9bf0, #f91880)';
    document.getElementById('profileAvatar').innerHTML = user.avatarUrl ? `<img src="${user.avatarUrl}">` : (user.name?.charAt(0) || '👤');
    document.getElementById('profileName').innerText = user.name;
    document.getElementById('profileBio').innerText = user.bio || '';
    const userPosts = allPosts.filter(p => p.sender === userId);
    document.getElementById('profilePosts').innerText = userPosts.length;
    document.getElementById('profileFollowers').innerText = Object.keys(user.followers || {}).length;
    document.getElementById('profileFollowing').innerText = Object.keys(user.following || {}).length;
    
    const postsContainer = document.getElementById('profilePostsList');
    postsContainer.innerHTML = '';
    userPosts.forEach(post => {
        const div = document.createElement('div');
        div.className = 'tweet-card';
        let mediaHtml = '';
        if (post.mediaUrl) {
            if (post.mediaType === 'image') mediaHtml = `<div class="tweet-media mt-2"><img src="${post.mediaUrl}"></div>`;
            else if (post.mediaType === 'video') mediaHtml = `<div class="tweet-media mt-2"><video controls src="${post.mediaUrl}"></video></div>`;
            else if (post.mediaType === 'audio') mediaHtml = `<div class="tweet-media mt-2"><audio controls src="${post.mediaUrl}"></audio></div>`;
        }
        div.innerHTML = `
            <div class="tweet-content">${post.text || ''}</div>
            ${mediaHtml}
            <div class="tweet-actions mt-2">
                <span class="text-sm text-gray-500"><i class="fas fa-heart"></i> ${post.likes || 0}</span>
                <span class="text-sm text-gray-500"><i class="fas fa-comment"></i> ${Object.keys(post.comments || {}).length}</span>
                <span class="text-sm text-gray-500"><i class="fas fa-retweet"></i> ${Object.keys(post.retweets || {}).length}</span>
            </div>
        `;
        postsContainer.appendChild(div);
    });
    
    const buttonsDiv = document.getElementById('profileButtons');
    buttonsDiv.innerHTML = '';
    if (userId === currentUser.uid) {
        buttonsDiv.innerHTML = `<button class="profile-btn profile-btn-primary" onclick="openEditProfile()">تعديل الملف</button>
                                <button class="profile-btn profile-btn-secondary" onclick="logout()">تسجيل خروج</button>`;
    } else {
        const isFollowing = currentUserData?.following && currentUserData.following[userId];
        buttonsDiv.innerHTML = `<button class="profile-btn profile-btn-primary" onclick="toggleFollow('${userId}', this)">${isFollowing ? 'متابع' : 'متابعة'}</button>
                                <button class="profile-btn profile-btn-secondary" onclick="openPrivateChat('${userId}')"><i class="fas fa-envelope"></i> مراسلة</button>`;
    }
}

window.toggleFollow = async function(userId, btn) {
    if (!currentUser || currentUser.uid === userId) return;
    const userRef = ref(db, `users/${currentUser.uid}/following/${userId}`);
    const targetRef = ref(db, `users/${userId}/followers/${currentUser.uid}`);
    const snap = await get(userRef);
    if (snap.exists()) {
        await set(userRef, null); await set(targetRef, null); btn.innerText = 'متابعة';
        addNotification(userId, 'unfollow');
    } else {
        await set(userRef, true); await set(targetRef, true); btn.innerText = 'متابع';
        addNotification(userId, 'follow');
    }
    if (viewingProfileUserId === userId) await loadProfileData(userId);
};

window.openEditProfile = function() {
    const newName = prompt('الاسم الجديد:', currentUserData?.name);
    const newBio = prompt('السيرة الذاتية:', currentUserData?.bio || '');
    if (newName) update(ref(db, `users/${currentUser.uid}`), { name: newName });
    if (newBio !== null) update(ref(db, `users/${currentUser.uid}`), { bio: newBio });
    if (newName || newBio !== null) location.reload();
};

window.changeAvatar = function() { document.getElementById('avatarInput').click(); };
window.changeCover = function() { document.getElementById('coverInput').click(); };

document.getElementById('avatarInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await uploadMedia(file);
    await update(ref(db, `users/${currentUser.uid}`), { avatarUrl: result.url });
    location.reload();
});

document.getElementById('coverInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const result = await uploadMedia(file);
    await update(ref(db, `users/${currentUser.uid}`), { coverUrl: result.url });
    location.reload();
});

const avatarInput = document.createElement('input');
avatarInput.type = 'file';
avatarInput.accept = 'image/*';
avatarInput.id = 'avatarInput';
avatarInput.style.display = 'none';
document.body.appendChild(avatarInput);

const coverInput = document.createElement('input');
coverInput.type = 'file';
coverInput.accept = 'image/*';
coverInput.id = 'coverInput';
coverInput.style.display = 'none';
document.body.appendChild(coverInput);

// ========== الدردشة الخاصة ==========
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

window.openConversations = async function() {
    const panel = document.getElementById('conversationsPanel');
    const container = document.getElementById('conversationsList');
    const userId = currentUser.uid;
    const convSnap = await get(child(ref(db), `private_chats/${userId}`));
    const conversations = convSnap.val() || {};
    container.innerHTML = '';
    for (const [otherId, convData] of Object.entries(conversations)) {
        const otherUser = allUsers[otherId];
        if (!otherUser) continue;
        container.innerHTML += `<div class="conversation-item" onclick="openPrivateChat('${otherId}')"><div class="w-12 h-12 rounded-full bg-pink-500 flex items-center justify-center">${otherUser.avatarUrl ? `<img src="${otherUser.avatarUrl}">` : (otherUser.name?.charAt(0) || 'U')}</div><div><div class="font-bold">${otherUser.name}</div><div class="text-sm text-gray-500">${convData.lastMessage?.substring(0, 40)}</div></div></div>`;
    }
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد محادثات بعد</div>';
    panel.classList.add('open');
};
window.closeConversations = function() { document.getElementById('conversationsPanel').classList.remove('open'); };

window.openPrivateChat = async function(otherUserId) {
    currentChatUserId = otherUserId;
    const user = allUsers[otherUserId];
    document.getElementById('chatUserName').innerText = user?.name || 'مستخدم';
    document.getElementById('chatAvatar').innerHTML = user?.avatarUrl ? `<img src="${user.avatarUrl}">` : (user?.name?.charAt(0) || 'U');
    await loadPrivateMessages(otherUserId);
    document.getElementById('chatPanel').classList.add('open');
    closeConversations();
};
window.closeChat = function() { document.getElementById('chatPanel').classList.remove('open'); currentChatUserId = null; };

async function loadPrivateMessages(otherUserId) {
    const container = document.getElementById('chatMessages');
    container.innerHTML = '<div class="text-center text-gray-500 py-10">جاري التحميل...</div>';
    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesSnap = await get(child(ref(db), `private_messages/${chatId}`));
    const messages = messagesSnap.val() || {};
    container.innerHTML = '';
    const sorted = Object.entries(messages).sort((a,b)=>a[1].timestamp-b[1].timestamp);
    for (const [id, msg] of sorted) {
        const isSent = msg.senderId === currentUser.uid;
        const time = new Date(msg.timestamp).toLocaleTimeString();
        let content = '';
        if (msg.type === 'text') content = `<div class="message-bubble ${isSent ? 'sent' : 'received'}">${msg.text}</div>`;
        else if (msg.type === 'image') content = `<img src="${msg.imageUrl}" class="max-w-[200px] rounded-lg cursor-pointer" onclick="window.open('${msg.imageUrl}')">`;
        else if (msg.type === 'audio') content = `<div class="message-audio"><audio controls src="${msg.audioUrl}"></audio></div>`;
        container.innerHTML += `<div class="chat-message ${isSent ? 'sent' : 'received'}"><div>${content}<div class="text-[10px] opacity-50 mt-1">${time}</div></div></div>`;
    }
    if (container.innerHTML === '') container.innerHTML = '<div class="text-center text-gray-500 py-10">لا توجد رسائل بعد</div>';
    container.scrollTop = container.scrollHeight;
}

window.sendChatMessage = async function() {
    const input = document.getElementById('chatMessageInput');
    const text = input.value.trim();
    if (!text || !currentChatUserId) return;
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.name, text, type: 'text', timestamp: Date.now() });
    await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: text, lastTimestamp: Date.now(), withUser: currentChatUserId });
    await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: text, lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
};

window.sendChatImage = async function(input) {
    const file = input.files[0];
    if (!file || !currentChatUserId) return;
    const result = await uploadMedia(file);
    const chatId = getChatId(currentUser.uid, currentChatUserId);
    await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.name, imageUrl: result.url, type: 'image', timestamp: Date.now() });
    await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentChatUserId });
    await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: '📷 صورة', lastTimestamp: Date.now(), withUser: currentUser.uid });
    input.value = '';
    await loadPrivateMessages(currentChatUserId);
};

window.startRecordingChat = async function() {
    const btn = document.getElementById('chatRecordBtn');
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => { audioChunks.push(event.data); };
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            const audioFile = new File([audioBlob], 'recording.mp3', { type: 'audio/mp3' });
            const result = await uploadMedia(audioFile);
            if (currentChatUserId) {
                const chatId = getChatId(currentUser.uid, currentChatUserId);
                await push(ref(db, `private_messages/${chatId}`), { senderId: currentUser.uid, senderName: currentUserData?.name, audioUrl: result.url, type: 'audio', timestamp: Date.now() });
                await set(ref(db, `private_chats/${currentUser.uid}/${currentChatUserId}`), { lastMessage: '🎤 رسالة صوتية', lastTimestamp: Date.now(), withUser: currentChatUserId });
                await set(ref(db, `private_chats/${currentChatUserId}/${currentUser.uid}`), { lastMessage: '🎤 رسالة صوتية', lastTimestamp: Date.now(), withUser: currentUser.uid });
                await loadPrivateMessages(currentChatUserId);
            }
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        btn.innerHTML = '<i class="fas fa-stop-circle text-red-500"></i>';
    } catch (err) { alert('لا يمكن الوصول إلى الميكروفون'); }
};

// ========== البحث ==========
window.openSearch = function() { document.getElementById('searchPanel').classList.add('open'); };
window.closeSearch = function() { document.getElementById('searchPanel').classList.remove('open'); };
window.searchAll = function() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    if (!query) { resultsDiv.innerHTML = ''; return; }
    const users = Object.values(allUsers).filter(u => u.name?.toLowerCase().includes(query));
    const posts = allPosts.filter(p => p.text?.toLowerCase().includes(query));
    const hashtags = [...new Set(allPosts.flatMap(p => (p.text?.match(/#\w+/g) || []).filter(h => h.toLowerCase().includes(query))))];
    resultsDiv.innerHTML = `
        ${users.length ? `<h4 class="font-bold mb-2 text-pink-500">👥 مستخدمين</h4>${users.map(u => `<div class="conversation-item" onclick="viewProfile('${u.uid}')"><div class="w-10 h-10 rounded-full bg-pink-500 flex items-center justify-center">${u.avatarUrl ? `<img src="${u.avatarUrl}">` : (u.name?.charAt(0) || 'U')}</div><div>@${u.name}</div></div>`).join('')}</div>` : ''}
        ${hashtags.length ? `<h4 class="font-bold mb-2 mt-4 text-blue-500"># هاشتاقات</h4>${hashtags.map(h => `<div class="conversation-item" onclick="searchHashtag('${h.substring(1)}')"><i class="fas fa-hashtag"></i><div>${h}</div></div>`).join('')}</div>` : ''}
        ${posts.length ? `<h4 class="font-bold mb-2 mt-4 text-green-500">📝 منشورات</h4>${posts.map(p => `<div class="conversation-item" onclick="window.open('${p.id}')"><div>${p.text?.substring(0, 40)}</div></div>`).join('')}</div>` : ''}
    `;
};
window.searchHashtag = function(tag) { document.getElementById('searchInput').value = '#' + tag; searchAll(); };

// ========== القصص ==========
onValue(ref(db, 'stories'), (s) => {
    const data = s.val();
    const now = Date.now();
    const activeStories = [];
    if (data) {
        Object.keys(data).forEach(key => {
            const story = data[key];
            if (story.timestamp && (now - story.timestamp) < 24*60*60*1000) activeStories.push({ id: key, ...story });
        });
    }
    renderStories(activeStories);
});

function renderStories(stories) {
    const container = document.getElementById('storiesList');
    if (!container) return;
    container.innerHTML = '';
    stories.forEach(story => {
        const user = allUsers[story.sender] || { name: 'user', avatarUrl: '' };
        container.innerHTML += `
            <div class="story-item" onclick="window.open('${story.mediaUrl}','_blank')">
                <div class="story-ring"><img class="story-avatar" src="${user.avatarUrl || 'https://via.placeholder.com/70'}"></div>
                <div class="text-xs">${user.name}</div>
            </div>
        `;
    });
}

window.openStories = function() { document.getElementById('storiesPanel').classList.add('open'); };
window.closeStories = function() { document.getElementById('storiesPanel').classList.remove('open'); };
window.addStory = async function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const result = await uploadMedia(file);
        await push(ref(db, 'stories'), { mediaUrl: result.url, mediaType: result.type, sender: currentUser.uid, timestamp: Date.now() });
        alert('✅ تم إضافة القصة');
    };
    input.click();
};

// ========== التنقل ==========
window.switchTab = function(tab) {
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    event.target.closest('.nav-item').classList.add('active');
    if (tab === 'home') { closeCompose(); closeProfile(); closeChat(); closeConversations(); closeNotifications(); closeSearch(); closeStories(); }
};

// ========== مراقبة المستخدم ==========
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        isAdmin = ADMIN_EMAILS.includes(currentUser.email);
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
    } else {
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

console.log('✅ UltraSocial Ready');
