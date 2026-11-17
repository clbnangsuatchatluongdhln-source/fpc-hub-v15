let isDragging = false;
let currentX = 0;
let currentY = 0;
let initialX = 0;
let initialY = 0;
let xOffset = 0;
let yOffset = 0;
let panel: HTMLElement | null = null;

export function initChatDrag(): void {
  panel = document.getElementById('chatPanel');
  if (!panel) return;
  if (panel.dataset.layout) return;

  // Reset vị trí mỗi khi mở lại
  xOffset = 0;
  yOffset = 0;
  panel.style.removeProperty('transform');
  panel.style.removeProperty('transition');

  // Gắn sự kiện mousedown vào các header
  const headers = panel.querySelectorAll<HTMLElement>('.chat-header, .conv-side > div:first-child');
  headers.forEach((h) => {
    h.style.cursor = 'move';
    h.style.userSelect = 'none';
    // Dùng mousedown với option capture để bắt sự kiện sớm nhất
    h.addEventListener('mousedown', dragStart);
  });

  document.addEventListener('mouseup', dragEnd);
  document.addEventListener('mousemove', drag);
}

function dragStart(e: MouseEvent): void {
  if (e.button !== 0 || !panel) return;
  e.preventDefault(); // Ngăn chặn bôi đen text khi kéo
  
  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;
  isDragging = true;
  
  panel.style.setProperty('transition', 'none', 'important');
  panel.style.setProperty('box-shadow', '0 25px 50px -12px rgba(0,0,0,0.35)', 'important');
  panel.style.setProperty('user-select', 'none', 'important');
}

function dragEnd(): void {
  if (!isDragging) return;
  isDragging = false;
  if (panel) {
    panel.style.removeProperty('transition');
    panel.style.removeProperty('box-shadow');
    panel.style.removeProperty('user-select');
  }
  initialX = currentX;
  initialY = currentY;
}

function drag(e: MouseEvent): void {
  if (!isDragging || !panel) return;
  e.preventDefault();
  
  currentX = e.clientX - initialX;
  currentY = e.clientY - initialY;
  xOffset = currentX;
  yOffset = currentY;
  
  // Dùng 'important' để đè CSS
  panel.style.setProperty('transform', `translate3d(${currentX}px, ${currentY}px, 0)`, 'important');
}

export function resetChatDrag(): void {
  xOffset = 0;
  yOffset = 0;
  if (panel) panel.style.removeProperty('transform');
}
