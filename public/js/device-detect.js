// 设备检测工具
(function() {
    const ua = navigator.userAgent;

    window.isAndroid = /Android/i.test(ua);
    window.isIOS = /iPhone|iPad|iPod/i.test(ua);
    window.isMobile = /Android|iPhone|iPad|iPod|webOS/i.test(ua);
})();
