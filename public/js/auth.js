// public/js/auth.js
import { login, register, sendCode } from './api.js';

// 注册表单处理
export async function handleRegister(formData) {
    const { email, code, password, nickname } = formData;
    try {
        const result = await register(email, code, password, nickname);
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        window.location.href = '/';
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// 登录表单处理
export async function handleLogin(email, password) {
    try {
        const result = await login(email, password);
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        window.location.href = '/';
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// 退出
export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// 检查是否已登录，未登录则跳转
export function requireAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}