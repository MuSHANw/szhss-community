// public/js/common.js
export function formatDate(isoString) {
    const date = new Date(isoString);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
}

export function showMessage(msg, isError = false) {
    // 简单实现：alert 或页面上的浮动提示
    alert(msg);
}