// public/js/notifications.js
// 通知模块 - 全局函数

const API_BASE = window.API_BASE || 'http://localhost:3000/api';

// 获取 token
function getToken() {
    return localStorage.getItem('token');
}

// 更新小红点显示（顶部铃铛数字 + 侧边栏小红点）
function updateUnreadBadges(unreadCount) {
    const topBadge = document.getElementById('notifBadge');
    const sidebarDot = document.getElementById('sidebarNotifDot');
    const hasUnread = unreadCount > 0;

    if (topBadge) {
        if (hasUnread) {
            topBadge.style.display = 'flex';
            topBadge.innerText = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            topBadge.style.display = 'none';
        }
    }

    if (sidebarDot) {
        sidebarDot.style.display = hasUnread ? 'inline-block' : 'none';
    }
}

// 加载通知列表并更新小红点
async function loadNotifications() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/notifications?page=1&limit=10`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const unreadCount = data.unreadCount || 0;

        // 更新所有小红点
        updateUnreadBadges(unreadCount);

        const listContainer = document.getElementById('notifList');
        if (listContainer) {
            if (!data.notifications || !data.notifications.length) {
                listContainer.innerHTML = '<div style="padding: 20px; text-align: center;">暂无通知</div>';
                return;
            }
            listContainer.innerHTML = data.notifications.map(notif => `
                <div class="notif-item ${!notif.is_read ? 'unread' : ''}" data-id="${notif.id}" data-type="${notif.type}" data-source-id="${notif.source_id}">
                    <div>${formatNotification(notif)}</div>
                    <div style="font-size:0.7rem; color:#6c757d; margin-top:4px;">${new Date(notif.created_at).toLocaleString()}</div>
                </div>
            `).join('');

            // 绑定点击事件
            document.querySelectorAll('.notif-item').forEach(item => {
                item.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const notifId = parseInt(item.dataset.id);
                    const type = item.dataset.type;
                    const sourceId = parseInt(item.dataset.sourceId);
                    // 标记已读
                    await fetch(`${API_BASE}/notifications/${notifId}/read`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    // 跳转
                    if (type === 'like' || type === 'favorite' || type === 'reply') {
                        window.location.href = `/post-detail.html?id=${sourceId}`;
                    } else if (type === 'report_resolved') {
                        window.location.href = '/feedback.html';
                    }
                    // 刷新小红点
                    loadNotifications();
                });
            });
        }
    } catch (err) {
        console.error('加载通知失败', err);
    }
}

// 格式化通知内容
function formatNotification(notif) {
    const sourceName = notif.source_nickname || '系统';
    switch (notif.type) {
        case 'like': return `${sourceName} 点赞了你的帖子`;
        case 'favorite': return `${sourceName} 收藏了你的帖子`;
        case 'reply': return `${sourceName} 回复了你的帖子`;
        case 'report_resolved': return notif.content || '你的举报已处理';
        default: return '新通知';
    }
}

// 全部标记已读
async function markAllRead() {
    const token = getToken();
    if (!token) return;
    try {
        await fetch(`${API_BASE}/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        loadNotifications();
    } catch (err) {
        console.error(err);
    }
}

// 初始化通知模块（绑定顶部铃铛和侧边栏通知按钮）
function initNotifications() {
    const notifIcon = document.getElementById('notifIcon');
    const sidebarNotifBtn = document.getElementById('sidebarNotifBtn');
    const notifDropdown = document.getElementById('notificationsDropdown');

    // 通用的切换下拉面板方法
    function toggleDropdown(e) {
        if (e) e.stopPropagation();
        if (!notifDropdown) return;
        notifDropdown.classList.toggle('show');
        if (notifDropdown.classList.contains('show')) {
            loadNotifications();
        }
    }

    // 绑定顶部铃铛
    if (notifIcon) {
        notifIcon.addEventListener('click', toggleDropdown);
    }

    // 绑定侧边栏通知按钮（如果存在）
    if (sidebarNotifBtn) {
        sidebarNotifBtn.addEventListener('click', toggleDropdown);
    }

    // 点击页面其他区域关闭下拉面板
    document.addEventListener('click', (e) => {
        if (!notifDropdown) return;
        const isNotifIcon = notifIcon && notifIcon.contains(e.target);
        const isSidebarBtn = sidebarNotifBtn && sidebarNotifBtn.contains(e.target);
        const isDropdown = notifDropdown.contains(e.target);
        if (!isNotifIcon && !isSidebarBtn && !isDropdown) {
            notifDropdown.classList.remove('show');
        }
    });

    // 全部已读按钮
    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', markAllRead);
    }

    // 页面加载时加载小红点（不展开下拉面板）
    const token = getToken();
    if (token) {
        loadNotifications();
    }
}

// 将函数挂载到 window，方便外部手动调用
window.loadNotifications = loadNotifications;
window.initNotifications = initNotifications;