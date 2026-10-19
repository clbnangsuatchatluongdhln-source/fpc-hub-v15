// src/main.ts
import { setupAuthUI } from './ui/auth-ui';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Khởi tạo sự kiện cho trang Đăng nhập
  setupAuthUI();
  console.log('✅ Auth UI đã sẵn sàng');
  
  // 2. Tạm thời hiển thị trang Auth khi mới vào web
  const authPage = document.getElementById('authPage');
  const mainApp = document.getElementById('mainAppContainer');
  
  if (authPage) authPage.classList.remove('hidden');
  if (mainApp) mainApp.classList.add('hidden');
});
