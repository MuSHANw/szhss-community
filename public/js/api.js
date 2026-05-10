// public/js/api.js
const API_BASE = 'http://localhost:3000/api';

// 通用请求函数，自动携带 token
async function request(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '请求失败');
    }
    return response.json();
}

// 公开接口（不需要 token）
export async function sendCode(email) {
    return request('/send-code', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function register(email, code, password, nickname) {
    return request('/register', { method: 'POST', body: JSON.stringify({ email, code, password, nickname }) });
}

export async function login(email, password) {
    return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

// 需要认证的接口
export async function getMe() {
    return request('/me');
}

export async function createPost(title, content, category) {
    return request('/posts', { method: 'POST', body: JSON.stringify({ title, content, category }) });
}

export async function getPosts(page = 1, limit = 10, category = '') {
    let url = `/posts?page=${page}&limit=${limit}`;
    if (category) url += `&category=${category}`;
    return request(url);
}