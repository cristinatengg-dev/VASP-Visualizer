// src/config.ts

// 自动检测环境。在部署环境中直接使用 '/api' 相对路径，让 Nginx 负责代理
// 在本地开发环境中，通过 Vite 的 proxy 转发到后端端口
export const API_BASE_URL = '/api';
