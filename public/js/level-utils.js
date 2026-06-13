// 等级计算工具 - 公共函数
// 被多个页面共享，用于计算等级、渲染等级徽章和经验条

function calculateLevel(exp, hasPassedQuiz) {
    if (!hasPassedQuiz) {
        return { level: 0, name: '未认证', minExp: 0, maxExp: 0, color: '#9CA3AF', progress: 0, nextLevelName: '新生报到', nextLevelExp: 0 };
    }

    const levels = [
        { level: 1, name: '新生报到', minExp: 0, maxExp: 99, color: '#9CA3AF' },
        { level: 2, name: '积极成员', minExp: 100, maxExp: 399, color: '#10B981' },
        { level: 3, name: '活跃分子', minExp: 400, maxExp: 999, color: '#3B82F6' },
        { level: 4, name: '社区达人', minExp: 1000, maxExp: 1999, color: '#8B5CF6' },
        { level: 5, name: '资深学长', minExp: 2000, maxExp: 3999, color: '#F59E0B' },
        { level: 6, name: '社区元老', minExp: 4000, maxExp: 8999, color: '#EF4444' },
        { level: 7, name: '传说级存在', minExp: 9000, maxExp: Infinity, color: '#FFD700' }
    ];

    const currentLevel = levels.find(l => exp >= l.minExp && exp <= l.maxExp);
    const nextLevel = levels.find(l => l.minExp > exp);

    return {
        ...currentLevel,
        nextLevelName: nextLevel ? nextLevel.name : null,
        nextLevelExp: nextLevel ? nextLevel.minExp : null,
        progress: nextLevel ? Math.floor((exp - currentLevel.minExp) / (nextLevel.minExp - currentLevel.minExp) * 100) : 100
    };
}

function renderLevelBadge(exp, hasPassedQuiz) {
    const level = calculateLevel(exp, hasPassedQuiz);
    return '<span class="level-badge" style="background:' + level.color + '20;color:' + level.color + ';border:1px solid ' + level.color + '40">' +
        '<span class="level-dot" style="background:' + level.color + '"></span>' +
        'LV' + level.level + ' ' + level.name +
    '</span>';
}

function renderExpBar(exp, hasPassedQuiz) {
    const level = calculateLevel(exp, hasPassedQuiz);
    if (level.level === 7 || level.level === 0) return '';
    return '<div style="margin-top:8px;">' +
        '<div class="level-progress">' +
            '<div class="level-progress-bar" style="width:' + level.progress + '%;background:' + level.color + '"></div>' +
        '</div>' +
        '<div style="font-size:0.7rem;color:#999;margin-top:2px;">EXP ' + exp + '/' + level.nextLevelExp + ' 下一级：' + level.nextLevelName + '</div>' +
    '</div>';
}

function renderExpBarInline(exp, hasPassedQuiz) {
    return renderExpBar(exp, hasPassedQuiz);
}

// LV0 答题拦截弹窗
function handleQuizRequired(data) {
    if (data && data.quiz_required) {
        if (confirm('⚠️ 请先通过入站答题才能使用此功能\n\n点击确定前往答题页面')) {
            window.location.href = data.quiz_url || '/quiz.html';
        }
        return true;
    }
    return false;
}
