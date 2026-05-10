// public/js/mobile.js
(function () {
    if (window.innerWidth > 768) return;

    const body = document.body;
    const sidebar = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');

    if (!sidebar || !menuToggle) return;

    // 1. 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    body.appendChild(overlay);

    // 2. 打开/关闭侧边栏
    function openSidebar() {
        sidebar.classList.add('open-mobile');
        overlay.classList.add('show');
        body.style.overflow = 'hidden';   // 禁止背景滚动
    }
    function closeSidebar() {
        sidebar.classList.remove('open-mobile');
        overlay.classList.remove('show');
        body.style.overflow = '';
    }

    // 清除菜单按钮原事件（克隆替换）
    const newToggle = menuToggle.cloneNode(true);
    menuToggle.parentNode.replaceChild(newToggle, menuToggle);
    newToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (sidebar.classList.contains('open-mobile')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    overlay.addEventListener('click', closeSidebar);

    // 3. 强制侧边栏内所有链接可跳转，并关闭侧边栏
    function bindSidebarLinks() {
        const links = sidebar.querySelectorAll('a[href]');
        links.forEach(link => {
            // 移除旧事件（克隆替换）
            const newLink = link.cloneNode(true);
            link.parentNode.replaceChild(newLink, link);

            newLink.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                const href = this.getAttribute('href');
                if (href && href !== '#') {
                    closeSidebar();
                    setTimeout(() => {
                        window.location.href = href;
                    }, 100);
                }
            });
        });
    }

    bindSidebarLinks(); // 初始绑定
    // 如果侧边栏内容动态变化，可以在 openSidebar 中重新绑定，这里我们谨慎起见在 open 时也绑定一次
    const originalOpen = openSidebar;
    openSidebar = function () {
        originalOpen();
        // 等待动画后绑定（确保所有链接已渲染）
        setTimeout(bindSidebarLinks, 50);
    };

    // 4. 阻止侧边栏内部点击冒泡到遮罩，但不影响链接
    sidebar.addEventListener('click', function (e) {
        e.stopPropagation();
    });

    // 5. 隐藏 PC 端浮动按钮
    const pcFab = document.querySelector('.fab:not(.mobile-nav .fab)');
    if (pcFab) pcFab.style.display = 'none';

    // 6. 创建底部导航栏
    const nav = document.createElement('nav');
    nav.className = 'mobile-nav';

    const currentPath = window.location.pathname;
    const isActive = (url) => {
        if (url === '/index.html' && (currentPath === '/' || currentPath === '/index.html')) return 'active';
        return currentPath.includes(url) ? 'active' : '';
    };

    nav.innerHTML = `
        <a href="/index.html" class="${isActive('/index.html')}">
            <i class="fas fa-home"></i><span>首页</span>
        </a>
        <a href="/study.html" class="${isActive('/study.html')}">
            <i class="fas fa-clock"></i><span>自习室</span>
        </a>
        <a href="/post.html" class="fab">
            <i class="fas fa-plus"></i>
        </a>
        <a href="/notifications.html" class="${isActive('/notifications.html')}">
            <i class="fas fa-bell"></i><span>通知</span>
        </a>
        <a href="/profile.html" class="${isActive('/profile.html')}">
            <i class="fas fa-user"></i><span>我的</span>
        </a>
    `;
    body.appendChild(nav);

    // 7. 顶部搜索功能
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    if (searchBtn && searchInput) {
        const newSearchBtn = searchBtn.cloneNode(true);
        searchBtn.parentNode.replaceChild(newSearchBtn, searchBtn);
        newSearchBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const keyword = searchInput.value.trim();
            window.location.href = keyword ? `/search.html?q=${encodeURIComponent(keyword)}` : '/search.html';
        });
    }

    // 8. 移除 PC 端的侧边栏折叠状态
    sidebar.classList.remove('collapsed');
    body.classList.remove('sidebar-collapsed');
})();