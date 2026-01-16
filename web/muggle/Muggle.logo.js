/**
 * Muggle.logo.js - 动态 Logo 组件
 * BigEyeMix 麻瓜模式
 */

// 初始化 Logo 点击事件
function initLogo() {
    const logo = document.querySelector('.logo');
    if (!logo) return;
    
    // 添加文字包装
    const text = logo.textContent.trim();
    const icon = logo.querySelector('i');
    logo.innerHTML = '';
    if (icon) logo.appendChild(icon);
    
    const textSpan = document.createElement('span');
    textSpan.className = 'logo-text';
    textSpan.textContent = text;
    logo.appendChild(textSpan);
    
    // 点击跳转到首页
    logo.addEventListener('click', function(e) {
        e.preventDefault();
        
        // 添加点击效果
        logo.classList.add('clicked');
        setTimeout(() => {
            logo.classList.remove('clicked');
        }, 600);
        
        // 延迟跳转，让动画播放完
        setTimeout(() => {
            window.location.href = '/home';
        }, 300);
    });
    
    // 添加触摸反馈（移动端）
    logo.addEventListener('touchstart', function() {
        logo.style.transform = 'scale(0.95)';
    });
    
    logo.addEventListener('touchend', function() {
        logo.style.transform = '';
    });
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLogo);
} else {
    initLogo();
}
