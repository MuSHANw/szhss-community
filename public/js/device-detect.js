// 设备检测工具
(function() {
    const ua = navigator.userAgent;

    // 检测纯血鸿蒙（HarmonyOS NEXT）：UA 中包含 HarmonyOS 或 OpenHarmony，且不含 Android
    window.isHarmonyOS = /HarmonyOS|OpenHarmony/i.test(ua) && !/Android/i.test(ua);

    // 检测安卓（包含鸿蒙2/3/4等基于安卓的版本，它们 UA 中仍有 Android）
    window.isAndroid = /Android/i.test(ua);

    // 检测 iOS
    window.isIOS = /iPhone|iPad|iPod/i.test(ua);

    // 检测移动端
    window.isMobile = /Android|iPhone|iPad|iPod|webOS|HarmonyOS|OpenHarmony/i.test(ua);
})();
