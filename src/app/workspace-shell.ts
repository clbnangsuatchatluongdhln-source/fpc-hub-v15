let mounted = false;

export function initWorkspaceShell(): void {
  if (mounted) return;
  const container = document.getElementById('mainAppContainer');
  const panel = document.getElementById('chatPanel');
  if (!container || !panel) return;
  mounted = true;
  panel.dataset.layout = 'dock';
  panel.setAttribute('role', 'complementary');
  panel.removeAttribute('aria-modal');
  container.append(panel);
  const toolbar = document.createElement('div');
  toolbar.className = 'workspace-chat-toolbar';
  const list = document.createElement('button');
  list.type = 'button';
  list.textContent = 'Hội thoại';
  list.setAttribute('aria-label', 'Xem danh sách hội thoại');
  list.onclick = () => { panel.dataset.mobileView = panel.dataset.mobileView === 'list' ? 'chat' : 'list'; };
  const expand = document.createElement('button');
  expand.type = 'button';
  expand.textContent = 'Phóng lớn ↗';
  expand.onclick = () => {
    panel.dataset.layout = panel.dataset.layout === 'full' ? 'dock' : 'full';
    expand.textContent = panel.dataset.layout === 'full' ? 'Cạnh lịch ↙' : 'Phóng lớn ↗';
    panel.dataset.mobileView = 'chat';
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Thu gọn';
  close.dataset.action = 'toggle-chat';
  toolbar.append(list, expand, close);
  panel.prepend(toolbar);
}
