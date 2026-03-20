class GeminiDesktop {
  constructor() {
    this.folders = [];
    this.chats = [];
    this.chatPositions = {};
    this.chatTitleCache = {}; // persistent URL→title cache
    this.isDesktopActive = false;
    this.draggedEl = null;
    this.newFolderTarget = { x: 0, y: 0 };
    this.newFolderParentId = null;
    this.zIndexCounter = 100;
    this.selectedIcons = new Set();

    this.init();
  }

  async init() {
    try { this.injectFonts(); } catch(e) {}
    this.createUI();
    this.loadState();
    setInterval(() => this.extractChats(), 3000);
    setInterval(() => {
      if (!document.getElementById('gemini-desktop-toggle')) this.createToggleButton();
    }, 1500);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.modalBackdrop && this.modalBackdrop.classList.contains('active')) {
          this.closeModal();
        } else if (this.contextMenu && this.contextMenu.classList.contains('active')) {
          this.contextMenu.classList.remove('active');
        } else if (this.isDesktopActive) {
          this.toggleDesktop();
        }
      }
    });
  }

  injectFonts() {
    if (!document.getElementById('gd-inter-font')) {
      const link = document.createElement('link');
      link.id = 'gd-inter-font';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
  }

  // ── Toast ───────────────────────────────────────────
  showToast(msg) {
    let container = document.getElementById('gd-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'gd-toast-container';
      container.className = 'desktop-toast-container';
      document.documentElement.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'desktop-toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 2500);
  }

  // ── Folder Helpers ──────────────────────────────────
  getFolderById(id) { return this.folders.find(f => f.id === id); }

  // Look up a chat title: live data → cache → fallback
  getChatTitle(url) {
    const live = this.chats.find(c => c.url === url);
    if (live) return live.title;
    if (this.chatTitleCache[url]) return this.chatTitleCache[url];
    return 'Chat';
  }

  // Get total item count (chats + subfolders) for badge
  getFolderItemCount(folder) {
    const chatCount = folder.contents.filter(c => !c.startsWith('folder-')).length;
    const subfolderCount = folder.contents.filter(c => c.startsWith('folder-')).length;
    return chatCount + subfolderCount;
  }

  // Get all folders whose parentId matches
  getChildFolders(parentId) {
    return this.folders.filter(f => f.parentId === parentId);
  }

  // Prevent cycles: check if targetId is a descendant of sourceId
  isDescendant(sourceId, targetId) {
    const folder = this.getFolderById(targetId);
    if (!folder) return false;
    if (folder.parentId === sourceId) return true;
    if (folder.parentId) return this.isDescendant(sourceId, folder.parentId);
    return false;
  }

  // Get breadcrumb path from root to folder
  getBreadcrumb(folder) {
    const path = [folder];
    let current = folder;
    while (current.parentId) {
      const parent = this.getFolderById(current.parentId);
      if (!parent) break;
      path.unshift(parent);
      current = parent;
    }
    return path;
  }

  // Recursively collect all chat URLs from a folder tree
  collectAllChats(folder) {
    const chats = folder.contents.filter(c => !c.startsWith('folder-'));
    const subfolderIds = folder.contents.filter(c => c.startsWith('folder-'));
    subfolderIds.forEach(sfId => {
      const sf = this.getFolderById(sfId);
      if (sf) chats.push(...this.collectAllChats(sf));
    });
    return chats;
  }

  // Recursively collect all folder IDs in a tree
  collectAllSubfolderIds(folder) {
    const ids = [];
    const subfolderIds = folder.contents.filter(c => c.startsWith('folder-'));
    subfolderIds.forEach(sfId => {
      ids.push(sfId);
      const sf = this.getFolderById(sfId);
      if (sf) ids.push(...this.collectAllSubfolderIds(sf));
    });
    return ids;
  }

  // ── UI Creation ─────────────────────────────────────
  createUI() {
    this.createToggleButton();
    this.createOverlay();
    this.createContextMenu();
    this.createModal();
    this.bindGlobalEvents();
  }

  createToggleButton() {
    if (document.getElementById('gemini-desktop-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'gemini-desktop-toggle';
    btn.title = 'Open Workspace (Esc to close)';
    btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`;
    btn.onclick = () => this.toggleDesktop();
    document.documentElement.appendChild(btn);
    this.toggleBtn = btn;
  }

  createOverlay() {
    if (document.getElementById('gemini-desktop-overlay')) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'gemini-desktop-overlay';
    this.overlay.innerHTML = `
      <div class="desktop-header">
        <h1>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Gemini Workspace
        </h1>
        <div class="desktop-header-actions">
          <button class="scan-chats-btn" id="gd-scan-chats" title="Scroll through your chat list to discover all chat titles">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Scan All Chats
          </button>
          <button class="close-desktop-btn" id="gd-close-desktop">&times;</button>
        </div>
      </div>
      <div class="desktop-workarea" id="gd-workarea"></div>
    `;
    document.documentElement.appendChild(this.overlay);
    this.workarea = document.getElementById('gd-workarea');
    document.getElementById('gd-close-desktop').onclick = () => this.toggleDesktop();
    document.getElementById('gd-scan-chats').onclick = () => this.scanAllChats();
  }

  createContextMenu() {
    if (document.getElementById('gd-context-menu')) return;
    this.contextMenu = document.createElement('div');
    this.contextMenu.className = 'desktop-context-menu';
    this.contextMenu.id = 'gd-context-menu';
    document.documentElement.appendChild(this.contextMenu);
  }

  createModal() {
    if (document.getElementById('gd-modal-backdrop')) return;
    this.modalBackdrop = document.createElement('div');
    this.modalBackdrop.className = 'desktop-modal-backdrop';
    this.modalBackdrop.id = 'gd-modal-backdrop';
    this.modalBackdrop.innerHTML = `
      <div class="desktop-modal">
        <h2 id="gd-modal-title">Create Folder</h2>
        <input type="text" id="gd-modal-input" placeholder="Folder name..." autocomplete="off" />
        <div class="desktop-modal-actions">
          <button class="desktop-modal-btn" id="gd-modal-cancel">Cancel</button>
          <button class="desktop-modal-btn primary" id="gd-modal-confirm">Create</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(this.modalBackdrop);
    this.modalInput = document.getElementById('gd-modal-input');
    this.modalTitle = document.getElementById('gd-modal-title');
    this.modalConfirmBtn = document.getElementById('gd-modal-confirm');

    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });
    document.getElementById('gd-modal-cancel').onclick = () => this.closeModal();
    this.modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.modalConfirmBtn.click();
      if (e.key === 'Escape') this.closeModal();
    });
  }

  // ── Selection ────────────────────────────────────────
  clearSelection() {
    this.selectedIcons.forEach(el => el.classList.remove('selected'));
    this.selectedIcons.clear();
  }

  selectIcon(el) {
    el.classList.add('selected');
    this.selectedIcons.add(el);
  }

  deselectIcon(el) {
    el.classList.remove('selected');
    this.selectedIcons.delete(el);
  }

  toggleSelectIcon(el) {
    if (this.selectedIcons.has(el)) this.deselectIcon(el);
    else this.selectIcon(el);
  }

  getSelectedDesktopIcons() {
    return [...this.selectedIcons].filter(el => el.parentElement === this.workarea);
  }

  // ── Global Events ───────────────────────────────────
  bindGlobalEvents() {
    // Right-click
    this.workarea.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const icon = e.target.closest('.desktop-icon');
      const win = e.target.closest('.folder-window');
      if (icon && icon.dataset.type === 'folder') {
        this.showFolderContextMenu(e, icon);
      } else if (icon && icon.dataset.type === 'chat') {
        this.showChatContextMenu(e, icon);
      } else if (!win) {
        this.showDesktopContextMenu(e);
      }
    });

    // Dismiss context menu
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.desktop-context-menu')) {
        this.contextMenu.classList.remove('active');
      }
    });

    // Rubber band selection on empty space
    this.workarea.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const icon = e.target.closest('.desktop-icon');
      const win = e.target.closest('.folder-window');
      if (icon || win) return; // only on blank space

      // If not holding Ctrl, clear existing selection
      if (!e.ctrlKey && !e.metaKey) this.clearSelection();

      const workRect = this.workarea.getBoundingClientRect();
      const startX = e.clientX - workRect.left;
      const startY = e.clientY - workRect.top;
      let band = null;

      const onMove = (me) => {
        const curX = me.clientX - workRect.left;
        const curY = me.clientY - workRect.top;
        const dx = Math.abs(curX - startX);
        const dy = Math.abs(curY - startY);
        if (!band && dx < 4 && dy < 4) return;

        if (!band) {
          band = document.createElement('div');
          band.className = 'selection-band';
          this.workarea.appendChild(band);
        }

        const left = Math.min(startX, curX);
        const top = Math.min(startY, curY);
        band.style.left = left + 'px';
        band.style.top = top + 'px';
        band.style.width = dx + 'px';
        band.style.height = dy + 'px';

        // Highlight icons that intersect the band
        const bandRect = { left, top, right: left + dx, bottom: top + dy };
        this.workarea.querySelectorAll('.desktop-icon:not(.folder-window .desktop-icon)').forEach(icon => {
          const ix = parseInt(icon.style.left) || 0;
          const iy = parseInt(icon.style.top) || 0;
          const iw = icon.offsetWidth;
          const ih = icon.offsetHeight;
          const intersects = ix + iw > bandRect.left && ix < bandRect.right && iy + ih > bandRect.top && iy < bandRect.bottom;
          if (intersects) this.selectIcon(icon);
          else if (!e.ctrlKey && !e.metaKey) this.deselectIcon(icon);
        });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (band) band.remove();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ── Context Menus ───────────────────────────────────
  positionContextMenu(e) {
    const menuW = 200, menuH = 200;
    let x = e.clientX, y = e.clientY;
    if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8;
    if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8;
    this.contextMenu.style.left = x + 'px';
    this.contextMenu.style.top = y + 'px';
    this.contextMenu.classList.add('active');
  }

  showDesktopContextMenu(e) {
    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="new-folder">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        New Folder
      </div>
      <div class="context-menu-item" data-action="refresh">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
        Refresh Chats
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="close">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Close Workspace
      </div>
    `;
    const rect = this.workarea.getBoundingClientRect();
    this.newFolderTarget = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.newFolderParentId = null;

    this.contextMenu.onclick = (ev) => {
      const action = ev.target.closest('.context-menu-item')?.dataset.action;
      this.contextMenu.classList.remove('active');
      if (action === 'new-folder') this.showNewFolderModal();
      if (action === 'refresh') this.extractChats();
      if (action === 'close') this.toggleDesktop();
    };
    this.positionContextMenu(e);
  }

  showFolderContextMenu(e, icon) {
    const folderId = icon.dataset.id;
    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="open">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        Open
      </div>
      <div class="context-menu-item" data-action="rename">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        Rename
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="delete">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Delete Folder
      </div>
    `;
    this.contextMenu.onclick = (ev) => {
      const action = ev.target.closest('.context-menu-item')?.dataset.action;
      this.contextMenu.classList.remove('active');
      const folder = this.getFolderById(folderId);
      if (!folder) return;
      if (action === 'open') this.openFolderWindow(folder);
      if (action === 'rename') this.showRenameFolderModal(folder);
      if (action === 'delete') this.deleteFolder(folder);
    };
    this.positionContextMenu(e);
  }

  showChatContextMenu(e, icon) {
    const chatUrl = icon.dataset.id;
    let folderItems = this.folders.map(f =>
      `<div class="context-menu-item" data-action="move" data-folder="${f.id}">${f.name}</div>`
    ).join('');
    if (this.folders.length === 0) folderItems = `<div class="context-menu-item" style="opacity:0.4;cursor:default">No folders yet</div>`;

    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="open-chat">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Open Chat
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" style="opacity:0.5; cursor:default; font-size:11px; padding:6px 16px;">Move to folder:</div>
      ${folderItems}
    `;
    this.contextMenu.onclick = (ev) => {
      const item = ev.target.closest('.context-menu-item');
      if (!item) return;
      this.contextMenu.classList.remove('active');
      if (item.dataset.action === 'open-chat') {
        this.toggleDesktop();
        window.location.href = chatUrl;
      }
      if (item.dataset.action === 'move') {
        this.moveChatToFolder(chatUrl, item.dataset.folder);
        icon.remove();
        this.showToast('Chat moved to folder');
      }
    };
    this.positionContextMenu(e);
  }

  // ── Modal Helpers ───────────────────────────────────
  openModal(title, placeholder, confirmLabel, onConfirm) {
    this.modalTitle.textContent = title;
    this.modalInput.placeholder = placeholder;
    this.modalInput.value = '';
    this.modalConfirmBtn.textContent = confirmLabel;
    this.modalBackdrop.classList.add('active');
    setTimeout(() => this.modalInput.focus(), 80);
    this.modalConfirmBtn.onclick = () => {
      const val = this.modalInput.value.trim();
      onConfirm(val);
      this.closeModal();
    };
  }

  closeModal() { this.modalBackdrop.classList.remove('active'); }

  showNewFolderModal() {
    this.openModal('New Folder', 'Folder name...', 'Create', (name) => {
      this.createNewFolder(name || 'New Folder', this.newFolderParentId);
    });
  }

  showRenameFolderModal(folder) {
    this.openModal('Rename Folder', folder.name, 'Save', (name) => {
      if (!name) return;
      folder.name = name;
      this.saveState();
      // Update all visible references
      document.querySelectorAll(`[data-id="${CSS.escape(folder.id)}"] .desktop-icon-label`).forEach(lbl => lbl.textContent = name);
      const win = document.getElementById(`window-${folder.id}`);
      if (win) {
        const titleSpan = win.querySelector('.folder-window-title-text');
        if (titleSpan) titleSpan.textContent = name;
      }
      this.showToast(`Renamed to "${name}"`);
    });
    this.modalInput.value = folder.name;
    this.modalInput.select();
  }

  // ── Toggle Desktop ─────────────────────────────────
  toggleDesktop() {
    if (!this.overlay) this.createOverlay();
    this.isDesktopActive = !this.isDesktopActive;
    if (this.isDesktopActive) {
      this.overlay.classList.add('active');
      this.extractChats();
    } else {
      this.overlay.classList.remove('active');
    }
  }

  // ── Auto-Scroll Scanner ─────────────────────────────
  async scanAllChats() {
    const scanBtn = document.getElementById('gd-scan-chats');
    if (scanBtn.disabled) return;
    scanBtn.disabled = true;
    scanBtn.innerHTML = `
      <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
      Scanning...
    `;

    // Hide overlay so the sidebar is accessible to the DOM
    this.overlay.style.opacity = '0';
    this.overlay.style.pointerEvents = 'none';

    // Wait a moment for the sidebar to be interactable
    await new Promise(r => setTimeout(r, 300));

    // Find the scrollable chat list container
    // Gemini uses a nav or scrollable container holding the chat links
    const sidebar = this.findScrollableSidebar();
    if (!sidebar) {
      this.showToast('Could not find chat sidebar. Try scrolling manually.');
      this.overlay.style.opacity = '';
      this.overlay.style.pointerEvents = '';
      scanBtn.disabled = false;
      scanBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> Scan All Chats`;
      return;
    }

    const startCount = Object.keys(this.chatTitleCache).length;
    let prevChatCount = 0;
    let stableRounds = 0;
    const maxScrollAttempts = 50; // safety limit

    for (let i = 0; i < maxScrollAttempts; i++) {
      // Scroll down
      sidebar.scrollTop += sidebar.clientHeight * 0.8;
      await new Promise(r => setTimeout(r, 400));

      // Extract chats (updates the cache)
      this.extractChats();

      const currentCount = Object.keys(this.chatTitleCache).length;
      if (currentCount === prevChatCount) {
        stableRounds++;
        if (stableRounds >= 3) break; // no new chats found for 3 rounds
      } else {
        stableRounds = 0;
      }
      prevChatCount = currentCount;
    }

    // Scroll back to top
    sidebar.scrollTop = 0;

    // Re-show overlay
    this.overlay.style.opacity = '';
    this.overlay.style.pointerEvents = '';

    const newCount = Object.keys(this.chatTitleCache).length;
    const discovered = newCount - startCount;
    this.showToast(`Scan complete! ${newCount} chats cached${discovered > 0 ? ` (+${discovered} new)` : ''}`);

    // Re-extract and re-render
    this.extractChats();

    // Refresh any open folder windows to update titles
    this.folders.forEach(f => this.refreshFolderWindow(f.id));

    scanBtn.disabled = false;
    scanBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> Scan All Chats`;
  }

  findScrollableSidebar() {
    // Strategy: find the container that holds chat links and is scrollable
    // Look for common sidebar selectors in Gemini's UI
    const chatLink = document.querySelector('a[href^="/app/"]');
    if (!chatLink) return null;

    // Walk up from a chat link to find the nearest scrollable ancestor
    let el = chatLink.parentElement;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  // ── Folder CRUD ─────────────────────────────────────
  createNewFolder(name, parentId) {
    const folderId = 'folder-' + Date.now();
    const folderInfo = {
      id: folderId,
      name: name,
      parentId: parentId || null,
      x: this.newFolderTarget.x,
      y: this.newFolderTarget.y,
      contents: []
    };
    this.folders.push(folderInfo);

    if (parentId) {
      // Add to parent's contents
      const parent = this.getFolderById(parentId);
      if (parent) {
        parent.contents.push(folderId);
        this.updateFolderBadge(parentId);
        // Refresh open window
        this.refreshFolderWindow(parentId);
      }
    } else {
      // Render on desktop
      this.renderFolder(folderInfo);
    }
    this.saveState();
    this.showToast(`Folder "${name}" created`);
  }

  deleteFolder(folder) {
    // Recursively release all chats back to desktop
    const allChats = this.collectAllChats(folder);
    const allSubIds = this.collectAllSubfolderIds(folder);

    // Remove all sub-folders from this.folders
    this.folders = this.folders.filter(f => f.id !== folder.id && !allSubIds.includes(f.id));

    // Remove from parent's contents if it's a subfolder
    if (folder.parentId) {
      const parent = this.getFolderById(folder.parentId);
      if (parent) {
        parent.contents = parent.contents.filter(c => c !== folder.id);
        this.updateFolderBadge(folder.parentId);
        this.refreshFolderWindow(folder.parentId);
      }
    }

    this.saveState();

    // Remove desktop icon
    const el = document.querySelector(`[data-id="${CSS.escape(folder.id)}"]`);
    if (el) el.remove();

    // Close any open windows for this folder or subfolders
    const win = document.getElementById(`window-${folder.id}`);
    if (win) win.remove();
    allSubIds.forEach(id => {
      const w = document.getElementById(`window-${id}`);
      if (w) w.remove();
    });

    // Re-render released chats
    allChats.forEach(url => {
      const chat = { url, title: this.getChatTitle(url) };
      this.renderChat(chat);
    });

    this.showToast(`Folder "${folder.name}" deleted`);
  }

  updateFolderBadge(folderId) {
    const folder = this.getFolderById(folderId);
    if (!folder) return;
    try {
      const el = document.querySelector(`[data-id="${CSS.escape(folderId)}"] .f-badge`);
      if (el) el.textContent = this.getFolderItemCount(folder);
    } catch(e) {}
  }

  // ── Drag Helpers ────────────────────────────────────
  bringToFront(el) {
    this.zIndexCounter++;
    el.style.zIndex = this.zIndexCounter;
  }

  makeWindowDraggable(win, handle) {
    handle.onmousedown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.bringToFront(win);
      const startMouseX = e.clientX, startMouseY = e.clientY;
      const bounds = win.getBoundingClientRect();
      const workBounds = this.workarea.getBoundingClientRect();
      const startX = bounds.left - workBounds.left;
      const startY = bounds.top - workBounds.top;
      const onMove = (me) => {
        win.style.left = (startX + me.clientX - startMouseX) + 'px';
        win.style.top  = (startY + me.clientY - startMouseY) + 'px';
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  makeDraggable(el, onDragEnd) {
    el.onmousedown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.bringToFront(el);

      // Handle selection on mousedown
      if (e.ctrlKey || e.metaKey) {
        this.toggleSelectIcon(el);
      } else if (!this.selectedIcons.has(el)) {
        this.clearSelection();
        this.selectIcon(el);
      }
      // If already selected (no Ctrl), keep selection for multi-drag

      const startMouseX = e.clientX, startMouseY = e.clientY;
      let moved = false;
      this.draggedEl = el;

      // Snapshot start positions for all selected desktop icons
      const selected = this.getSelectedDesktopIcons();
      const startPositions = selected.map(icon => ({
        el: icon,
        x: parseInt(icon.style.left) || 0,
        y: parseInt(icon.style.top) || 0
      }));

      const onMove = (me) => {
        const dx = me.clientX - startMouseX;
        const dy = me.clientY - startMouseY;
        if (!moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        moved = true;

        // Move all selected icons
        startPositions.forEach(sp => {
          sp.el.style.left = (sp.x + dx) + 'px';
          sp.el.style.top  = (sp.y + dy) + 'px';
          sp.el.classList.add('dragging');
        });

        // Highlight drop targets
        selected.forEach(s => s.style.display = 'none');
        const targets = document.elementsFromPoint(me.clientX, me.clientY);
        selected.forEach(s => s.style.display = '');

        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
        this.workarea.querySelectorAll('.folder-window.window-drop-target').forEach(w => w.classList.remove('window-drop-target'));

        const allDragIds = new Set(selected.map(s => s.dataset.id));
        const folderTarget = targets.find(t => t.dataset && t.dataset.type === 'folder' && !allDragIds.has(t.dataset.id));
        if (folderTarget) {
          folderTarget.classList.add('drop-target');
        } else {
          const windowTarget = targets.find(t => t.closest && t.closest('.folder-window'));
          if (windowTarget) {
            const folderWin = windowTarget.closest('.folder-window');
            const winFolderId = folderWin.id.replace('window-', '');
            if (!allDragIds.has(winFolderId)) {
              folderWin.classList.add('window-drop-target');
            }
          }
        }
      };

      const onUp = (ue) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        startPositions.forEach(sp => sp.el.classList.remove('dragging'));
        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
        this.workarea.querySelectorAll('.folder-window.window-drop-target').forEach(w => w.classList.remove('window-drop-target'));

        if (moved) {
          this.handleDrop(el, ue.clientX, ue.clientY);
        } else if (!e.ctrlKey && !e.metaKey) {
          // Simple click without move = select only this
          this.clearSelection();
          this.selectIcon(el);
        }

        if (onDragEnd) onDragEnd(el);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  handleDrop(el, clientX, clientY) {
    this.draggedEl = null;
    const selected = this.getSelectedDesktopIcons();
    const allDragIds = new Set(selected.map(s => s.dataset.id));

    // Hide all selected to detect what's underneath
    selected.forEach(s => s.style.display = 'none');
    const dropTargets = document.elementsFromPoint(clientX, clientY);
    selected.forEach(s => s.style.display = '');

    // Priority 1: Dropped on a folder icon
    const targetFolderEl = dropTargets.find(t => t.dataset && t.dataset.type === 'folder' && !allDragIds.has(t.dataset.id));
    if (targetFolderEl) {
      const targetFolderId = targetFolderEl.dataset.id;
      let count = 0;
      selected.forEach(icon => {
        if (icon.dataset.type === 'chat') {
          this.moveChatToFolder(icon.dataset.id, targetFolderId);
          icon.remove(); count++;
        } else if (icon.dataset.type === 'folder') {
          this.moveFolderToFolder(icon.dataset.id, targetFolderId); count++;
        }
      });
      this.clearSelection();
      this.showToast(`${count} item${count > 1 ? 's' : ''} moved to folder`);
      return;
    }

    // Priority 2: Dropped on an open folder window
    const windowTarget = dropTargets.find(t => t.closest && t.closest('.folder-window'));
    if (windowTarget) {
      const folderWin = windowTarget.closest('.folder-window');
      const winFolderId = folderWin.id.replace('window-', '');
      if (!allDragIds.has(winFolderId)) {
        let count = 0;
        selected.forEach(icon => {
          if (icon.dataset.type === 'chat') {
            this.moveChatToFolder(icon.dataset.id, winFolderId);
            icon.remove(); count++;
          } else if (icon.dataset.type === 'folder') {
            this.moveFolderToFolder(icon.dataset.id, winFolderId); count++;
          }
        });
        this.clearSelection();
        this.showToast(`${count} item${count > 1 ? 's' : ''} moved to folder`);
        return;
      }
    }

    // No folder target: save new positions for all moved items
    selected.forEach(icon => {
      if (icon.dataset.type === 'chat') {
        this.chatPositions[icon.dataset.id] = {
          x: parseInt(icon.style.left) || 0, y: parseInt(icon.style.top) || 0
        };
        this.saveChatPositions();
      } else if (icon.dataset.type === 'folder') {
        const folder = this.getFolderById(icon.dataset.id);
        if (folder) {
          folder.x = parseInt(icon.style.left) || 0;
          folder.y = parseInt(icon.style.top) || 0;
        }
        this.saveState();
      }
    });
  }

  moveChatToFolder(chatUrl, folderId) {
    // Remove from any existing folder first
    this.folders.forEach(f => {
      const idx = f.contents.indexOf(chatUrl);
      if (idx !== -1) {
        f.contents.splice(idx, 1);
        this.updateFolderBadge(f.id);
        this.refreshFolderWindow(f.id);
      }
    });

    const folder = this.getFolderById(folderId);
    if (folder && !folder.contents.includes(chatUrl)) {
      folder.contents.push(chatUrl);
      this.saveState();
      this.updateFolderBadge(folderId);
      this.refreshFolderWindow(folderId);

      try {
        const folderEl = document.querySelector(`[data-id="${CSS.escape(folderId)}"]`);
        if (folderEl) {
          folderEl.style.transform = 'scale(1.12)';
          setTimeout(() => folderEl.style.transform = '', 200);
        }
      } catch(e) {}

      delete this.chatPositions[chatUrl];
      this.saveChatPositions();
    }
  }

  moveFolderToFolder(sourceFolderId, targetFolderId) {
    const source = this.getFolderById(sourceFolderId);
    const target = this.getFolderById(targetFolderId);
    if (!source || !target) return;

    // Prevent moving into self or descendants
    if (sourceFolderId === targetFolderId) return;
    if (this.isDescendant(sourceFolderId, targetFolderId)) {
      this.showToast("Can't move a folder into its own subfolder");
      return;
    }

    // Remove from old parent
    if (source.parentId) {
      const oldParent = this.getFolderById(source.parentId);
      if (oldParent) {
        oldParent.contents = oldParent.contents.filter(c => c !== sourceFolderId);
        this.updateFolderBadge(oldParent.id);
        this.refreshFolderWindow(oldParent.id);
      }
    }

    // Remove from desktop
    const desktopIcon = document.querySelector(`[data-id="${CSS.escape(sourceFolderId)}"]`);
    if (desktopIcon) desktopIcon.remove();

    // Add to new parent
    source.parentId = targetFolderId;
    if (!target.contents.includes(sourceFolderId)) {
      target.contents.push(sourceFolderId);
    }

    this.saveState();
    this.updateFolderBadge(targetFolderId);
    this.refreshFolderWindow(targetFolderId);

    try {
      const targetEl = document.querySelector(`[data-id="${CSS.escape(targetFolderId)}"]`);
      if (targetEl) {
        targetEl.style.transform = 'scale(1.12)';
        setTimeout(() => targetEl.style.transform = '', 200);
      }
    } catch(e) {}

    this.showToast(`"${source.name}" moved into "${target.name}"`);
  }

  // ── Rendering Icons ─────────────────────────────────
  renderFolder(folder) {
    if (!this.workarea) return;
    // Only render top-level folders on desktop
    if (folder.parentId) return;

    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.type = 'folder';
    el.dataset.id = folder.id;
    el.style.left = folder.x + 'px';
    el.style.top = folder.y + 'px';

    el.innerHTML = `
      <div class="f-badge">${this.getFolderItemCount(folder)}</div>
      <svg class="desktop-icon-svg" viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <div class="desktop-icon-label">${folder.name}</div>
    `;

    el.ondblclick = (e) => { e.stopPropagation(); this.openFolderWindow(folder); };

    this.makeDraggable(el, () => {
      folder.x = parseInt(el.style.left) || 0;
      folder.y = parseInt(el.style.top) || 0;
      this.saveState();
    });

    this.workarea.appendChild(el);
  }

  renderChat(chat) {
    if (!this.workarea) return;
    // Check if in ANY folder
    const isInFolder = this.folders.some(f => f.contents.includes(chat.url));
    if (isInFolder) return;

    try {
      if (document.querySelector(`[data-id="${CSS.escape(chat.url)}"]`)) return;
    } catch(e) {}

    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.type = 'chat';
    el.dataset.id = chat.url;

    const saved = this.chatPositions[chat.url];
    if (saved) {
      el.style.left = saved.x + 'px';
      el.style.top = saved.y + 'px';
    } else {
      const pos = this.getNextGridSlot();
      el.style.left = pos.x + 'px';
      el.style.top = pos.y + 'px';
      this.chatPositions[chat.url] = pos;
      this.saveChatPositions();
    }

    el.innerHTML = `
      <svg class="desktop-icon-svg chat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <div class="desktop-icon-label">${chat.title}</div>
    `;

    el.ondblclick = () => { this.toggleDesktop(); window.location.href = chat.url; };

    this.makeDraggable(el, () => {
      this.chatPositions[chat.url] = { x: parseInt(el.style.left) || 0, y: parseInt(el.style.top) || 0 };
      this.saveChatPositions();
    });

    this.workarea.appendChild(el);
  }

  getNextGridSlot() {
    const colWidth = 120, rowHeight = 110, startX = 30, startY = 20;
    const maxCols = Math.max(1, Math.floor((window.innerWidth - 60) / colWidth));
    const usedSlots = new Set();
    this.workarea.querySelectorAll('.desktop-icon').forEach(icon => {
      const col = Math.round(((parseInt(icon.style.left) || 0) - startX) / colWidth);
      const row = Math.round(((parseInt(icon.style.top) || 0) - startY) / rowHeight);
      usedSlots.add(`${col},${row}`);
    });
    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < maxCols; col++) {
        if (!usedSlots.has(`${col},${row}`)) return { x: startX + col * colWidth, y: startY + row * rowHeight };
      }
    }
    return { x: startX, y: startY };
  }

  // ── Folder Window with Breadcrumb ───────────────────
  openFolderWindow(folder) {
    const existingWindow = document.getElementById(`window-${folder.id}`);
    if (existingWindow) { this.bringToFront(existingWindow); return; }

    const win = document.createElement('div');
    win.className = 'folder-window';
    win.id = `window-${folder.id}`;

    const workareaRect = this.workarea.getBoundingClientRect();
    win.style.top = Math.max(20, (workareaRect.height - 300) / 3) + 'px';
    win.style.left = Math.max(20, (workareaRect.width - 500) / 2) + 'px';
    this.bringToFront(win);

    this.buildFolderWindowHTML(win, folder);
    this.workarea.appendChild(win);
  }

  buildFolderWindowHTML(win, folder) {
    const breadcrumb = this.getBreadcrumb(folder);
    const breadcrumbHTML = breadcrumb.map((f, i) => {
      if (i === breadcrumb.length - 1) {
        return `<span class="breadcrumb-current">${f.name}</span>`;
      }
      return `<span class="breadcrumb-link" data-folder-id="${f.id}">${f.name}</span><span class="breadcrumb-sep">›</span>`;
    }).join('');

    win.innerHTML = `
      <div class="folder-window-header">
        <span class="folder-window-title">
          <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span class="folder-window-breadcrumb">${breadcrumbHTML}</span>
        </span>
        <button class="folder-window-close">&times;</button>
      </div>
      <div class="folder-window-content"></div>
    `;

    win.querySelector('.folder-window-close').onclick = () => win.remove();
    this.makeWindowDraggable(win, win.querySelector('.folder-window-header'));
    win.onmousedown = () => this.bringToFront(win);

    // Breadcrumb navigation
    win.querySelectorAll('.breadcrumb-link').forEach(link => {
      link.onclick = (e) => {
        e.stopPropagation();
        const targetFolder = this.getFolderById(link.dataset.folderId);
        if (targetFolder) this.navigateFolderWindow(win, targetFolder);
      };
    });

    // Right-click inside folder window for "New Subfolder"
    const content = win.querySelector('.folder-window-content');
    content.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.desktop-icon')) return;
      e.preventDefault();
      e.stopPropagation();
      this.showSubfolderContextMenu(e, folder, win);
    });

    this.renderFolderContents(folder, content, win);
  }

  navigateFolderWindow(win, folder) {
    // Preserve position
    const left = win.style.left;
    const top = win.style.top;
    const zIdx = win.style.zIndex;
    win.id = `window-${folder.id}`;
    this.buildFolderWindowHTML(win, folder);
    win.style.left = left;
    win.style.top = top;
    win.style.zIndex = zIdx;
  }

  refreshFolderWindow(folderId) {
    const win = document.getElementById(`window-${folderId}`);
    if (!win) return;
    const folder = this.getFolderById(folderId);
    if (!folder) return;
    this.navigateFolderWindow(win, folder);
  }

  showSubfolderContextMenu(e, parentFolder, win) {
    this.contextMenu.innerHTML = `
      <div class="context-menu-item" data-action="new-subfolder">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
        New Subfolder
      </div>
    `;
    this.contextMenu.onclick = (ev) => {
      const action = ev.target.closest('.context-menu-item')?.dataset.action;
      this.contextMenu.classList.remove('active');
      if (action === 'new-subfolder') {
        this.newFolderParentId = parentFolder.id;
        this.newFolderTarget = { x: 0, y: 0 };
        this.showNewFolderModal();
      }
    };
    this.positionContextMenu(e);
  }

  // Drag items inside a folder window onto subfolder targets (with multi-select)
  makeInWindowDraggable(el, itemId, itemType, currentFolder, win) {
    const onMouseDown = (e) => {
      if (e.target.closest('.remove-from-folder-btn')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const content = win.querySelector('.folder-window-content');

      // Handle selection
      if (e.ctrlKey || e.metaKey) {
        this.toggleSelectIcon(el);
      } else if (!this.selectedIcons.has(el)) {
        // Clear selection for items in THIS window only
        content.querySelectorAll('.desktop-icon.selected').forEach(ic => this.deselectIcon(ic));
        this.selectIcon(el);
      }

      // Gather all selected items in this window's content
      const getSelected = () => [...this.selectedIcons].filter(ic => ic.parentElement === content);

      const startX = e.clientX, startY = e.clientY;
      let moved = false, ghost = null;

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

        if (!moved) {
          moved = true;
          const sel = getSelected();
          // Create a ghost clone — use 'dragging-ghost' only, NOT 'static-icon'
          // (static-icon has position:relative !important which breaks fixed positioning)
          ghost = el.cloneNode(true);
          ghost.className = 'desktop-icon dragging-ghost';
          ghost.style.cssText = `
            position: fixed !important;
            pointer-events: none !important;
            z-index: 2147483647 !important;
            opacity: 0.85 !important;
            transform: scale(1.08) !important;
            filter: drop-shadow(0 8px 16px rgba(0,0,0,0.5)) !important;
            width: ${el.offsetWidth}px !important;
            margin: 0 !important;
            transition: none !important;
          `;
          if (sel.length > 1) {
            const badge = document.createElement('div');
            badge.className = 'f-badge';
            badge.style.cssText = 'position:absolute;top:-4px;left:-4px;background:#3b82f6;';
            badge.textContent = sel.length;
            ghost.appendChild(badge);
          }
          document.documentElement.appendChild(ghost);
          sel.forEach(s => s.style.opacity = '0.3');
        }

        ghost.style.setProperty('left', (me.clientX - el.offsetWidth / 2) + 'px', 'important');
        ghost.style.setProperty('top', (me.clientY - el.offsetHeight / 2) + 'px', 'important');

        // Highlight targets
        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
        this.workarea.querySelectorAll('.folder-window.window-drop-target').forEach(w => w.classList.remove('window-drop-target'));

        const targets = document.elementsFromPoint(me.clientX, me.clientY);
        const currentSel = getSelected();
        const dragIds = new Set(currentSel.map(s => s.dataset.id));

        // Subfolder in same window
        const sfTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'subfolder-in-window' && !dragIds.has(t.dataset.id)
        );
        if (sfTarget) { sfTarget.classList.add('drop-target'); return; }

        // Desktop folder icon
        const deskTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'folder' && !dragIds.has(t.dataset.id) && t.dataset.id !== currentFolder.id
        );
        if (deskTarget) { deskTarget.classList.add('drop-target'); return; }

        // Another open folder window
        const winTarget = targets.find(t => t.closest && t.closest('.folder-window') && t.closest('.folder-window') !== win);
        if (winTarget) {
          winTarget.closest('.folder-window').classList.add('window-drop-target');
        }
      };

      const onUp = (ue) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        const selected = getSelected();
        if (ghost) { ghost.remove(); ghost = null; }
        selected.forEach(s => s.style.opacity = '');
        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
        this.workarea.querySelectorAll('.folder-window.window-drop-target').forEach(w => w.classList.remove('window-drop-target'));

        if (!moved) {
          if (!e.ctrlKey && !e.metaKey) {
            content.querySelectorAll('.desktop-icon.selected').forEach(ic => this.deselectIcon(ic));
            this.selectIcon(el);
          }
          return;
        }

        const targets = document.elementsFromPoint(ue.clientX, ue.clientY);
        const dragIds = new Set(selected.map(s => s.dataset.id));

        // Helper to move one item out of currentFolder
        const moveItem = (icon) => {
          const id = icon.dataset.id;
          const type = icon.dataset.type === 'subfolder-in-window' ? 'subfolder' : 'chat';
          return { id, type };
        };

        // Priority 1: Subfolder in same window
        const sfTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'subfolder-in-window' && !dragIds.has(t.dataset.id)
        );
        if (sfTarget) {
          const targetFolderId = sfTarget.dataset.id;
          const targetFolder = this.getFolderById(targetFolderId);
          let count = 0;
          selected.forEach(icon => {
            const { id, type } = moveItem(icon);
            if (type === 'chat') {
              currentFolder.contents = currentFolder.contents.filter(c => c !== id);
              if (targetFolder && !targetFolder.contents.includes(id)) { targetFolder.contents.push(id); count++; }
            } else {
              const src = this.getFolderById(id);
              if (src && !this.isDescendant(id, targetFolderId) && id !== targetFolderId) {
                currentFolder.contents = currentFolder.contents.filter(c => c !== id);
                src.parentId = targetFolderId;
                if (targetFolder && !targetFolder.contents.includes(id)) targetFolder.contents.push(id);
                count++;
              }
            }
          });
          this.saveState();
          this.updateFolderBadge(currentFolder.id);
          this.updateFolderBadge(targetFolderId);
          this.clearSelection();
          this.refreshFolderWindow(currentFolder.id);
          this.showToast(`${count} item${count > 1 ? 's' : ''} moved to subfolder`);
          return;
        }

        // Priority 2: Desktop folder icon
        const deskTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'folder' && !dragIds.has(t.dataset.id) && t.dataset.id !== currentFolder.id
        );
        if (deskTarget) {
          const targetFolderId = deskTarget.dataset.id;
          let count = 0;
          selected.forEach(icon => {
            const { id, type } = moveItem(icon);
            if (type === 'chat') {
              currentFolder.contents = currentFolder.contents.filter(c => c !== id);
              this.moveChatToFolder(id, targetFolderId);
              count++;
            } else {
              currentFolder.contents = currentFolder.contents.filter(c => c !== id);
              const src = this.getFolderById(id);
              if (src) { src.parentId = targetFolderId; }
              const tf = this.getFolderById(targetFolderId);
              if (tf && !tf.contents.includes(id)) tf.contents.push(id);
              count++;
            }
          });
          this.saveState();
          this.updateFolderBadge(currentFolder.id);
          this.updateFolderBadge(targetFolderId);
          this.clearSelection();
          this.refreshFolderWindow(currentFolder.id);
          this.showToast(`${count} item${count > 1 ? 's' : ''} moved to folder`);
          return;
        }

        // Priority 3: Another open folder window
        const winTarget = targets.find(t => t.closest && t.closest('.folder-window') && t.closest('.folder-window') !== win);
        if (winTarget) {
          const targetWin = winTarget.closest('.folder-window');
          const targetFolderId = targetWin.id.replace('window-', '');
          let count = 0;
          selected.forEach(icon => {
            const { id, type } = moveItem(icon);
            if (type === 'chat') {
              currentFolder.contents = currentFolder.contents.filter(c => c !== id);
              const tf = this.getFolderById(targetFolderId);
              if (tf && !tf.contents.includes(id)) { tf.contents.push(id); count++; }
            } else {
              const src = this.getFolderById(id);
              if (src && !this.isDescendant(id, targetFolderId) && id !== targetFolderId) {
                currentFolder.contents = currentFolder.contents.filter(c => c !== id);
                src.parentId = targetFolderId;
                const tf = this.getFolderById(targetFolderId);
                if (tf && !tf.contents.includes(id)) tf.contents.push(id);
                count++;
              }
            }
          });
          this.saveState();
          this.updateFolderBadge(currentFolder.id);
          this.updateFolderBadge(targetFolderId);
          this.clearSelection();
          this.refreshFolderWindow(currentFolder.id);
          this.refreshFolderWindow(targetFolderId);
          this.showToast(`${count} item${count > 1 ? 's' : ''} moved`);
          return;
        }

        // Priority 4: Bare desktop
        const isOverWindow = targets.find(t => t.closest && t.closest('.folder-window'));
        if (!isOverWindow) {
          const workRect = this.workarea.getBoundingClientRect();
          let offsetIdx = 0;
          selected.forEach(icon => {
            const { id, type } = moveItem(icon);
            const dropX = ue.clientX - workRect.left - 50 + (offsetIdx * 120);
            const dropY = ue.clientY - workRect.top - 50;
            if (type === 'chat') {
              currentFolder.contents = currentFolder.contents.filter(c => c !== id);
              this.chatPositions[id] = { x: Math.max(0, dropX), y: Math.max(0, dropY) };
              this.saveChatPositions();
              const chat = { url: id, title: this.getChatTitle(id) };
              this.renderChat(chat);
            } else {
              const src = this.getFolderById(id);
              if (src) {
                currentFolder.contents = currentFolder.contents.filter(c => c !== id);
                src.parentId = null;
                src.x = Math.max(0, dropX);
                src.y = Math.max(0, dropY);
                this.renderFolder(src);
              }
            }
            offsetIdx++;
          });
          this.saveState();
          this.updateFolderBadge(currentFolder.id);
          this.clearSelection();
          this.refreshFolderWindow(currentFolder.id);
          this.showToast(`${offsetIdx} item${offsetIdx > 1 ? 's' : ''} moved to desktop`);
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    el.addEventListener('mousedown', onMouseDown);
  }

  renderFolderContents(folder, container, win) {
    container.innerHTML = '';

    // Subfolders first
    const subfolderIds = folder.contents.filter(c => c.startsWith('folder-'));
    const chatUrls = folder.contents.filter(c => !c.startsWith('folder-'));

    if (subfolderIds.length === 0 && chatUrls.length === 0) {
      container.innerHTML = '<div class="folder-empty-msg">Right-click to create a subfolder, or drag items here</div>';
      return;
    }

    // Render subfolders
    subfolderIds.forEach(sfId => {
      const subfolder = this.getFolderById(sfId);
      if (!subfolder) return;

      const el = document.createElement('div');
      el.className = 'desktop-icon static-icon';
      el.dataset.type = 'subfolder-in-window';
      el.dataset.id = subfolder.id;

      el.innerHTML = `
        <button class="remove-from-folder-btn" title="Remove from folder">\u00d7</button>
        <div class="f-badge" style="position:absolute;top:-2px;right:0;">${this.getFolderItemCount(subfolder)}</div>
        <svg class="desktop-icon-svg" viewBox="0 0 24 24">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="desktop-icon-label">${subfolder.name}</div>
      `;

      el.ondblclick = (e) => {
        e.stopPropagation();
        this.navigateFolderWindow(win, subfolder);
      };

      el.querySelector('.remove-from-folder-btn').onclick = (e) => {
        e.stopPropagation();
        subfolder.parentId = null;
        folder.contents = folder.contents.filter(c => c !== sfId);
        this.saveState();
        this.updateFolderBadge(folder.id);
        this.renderFolder(subfolder);
        el.remove();
        if (folder.contents.length === 0) {
          container.innerHTML = '<div class="folder-empty-msg">Right-click to create a subfolder, or drag items here</div>';
        }
        this.showToast(`"${subfolder.name}" moved to desktop`);
      };

      // Enable in-window drag to move into other subfolders
      this.makeInWindowDraggable(el, subfolder.id, 'subfolder', folder, win);

      container.appendChild(el);
    });

    // Render chats
    chatUrls.forEach(url => {
      const title = this.getChatTitle(url);
      const chat = { url, title };

      const el = document.createElement('div');
      el.className = 'desktop-icon static-icon';
      el.dataset.type = 'chat-in-folder';
      el.dataset.id = chat.url;

      el.innerHTML = `
        <button class="remove-from-folder-btn" title="Remove from folder">\u00d7</button>
        <svg class="desktop-icon-svg chat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <div class="desktop-icon-label">${chat.title}</div>
      `;

      el.ondblclick = () => { this.toggleDesktop(); window.location.href = chat.url; };

      el.querySelector('.remove-from-folder-btn').onclick = (e) => {
        e.stopPropagation();
        this.removeFromFolder(chat.url, folder.id);
        el.remove();
        if (folder.contents.length === 0) {
          container.innerHTML = '<div class="folder-empty-msg">Right-click to create a subfolder, or drag items here</div>';
        }
      };

      // Enable in-window drag to move into subfolders
      this.makeInWindowDraggable(el, chat.url, 'chat', folder, win);

      container.appendChild(el);
    });
  }

  removeFromFolder(chatUrl, folderId) {
    const folder = this.getFolderById(folderId);
    if (folder) {
      folder.contents = folder.contents.filter(url => url !== chatUrl);
      this.saveState();
      this.updateFolderBadge(folderId);
      const chat = { url: chatUrl, title: this.getChatTitle(chatUrl) };
      this.renderChat(chat);
      this.showToast('Chat removed from folder');
    }
  }

  // ── Chat Extraction ─────────────────────────────────
  extractChats() {
    const chatLinks = document.querySelectorAll('a[href^="/app/"]');
    const newChats = [];
    let cacheUpdated = false;
    chatLinks.forEach(el => {
      const url = el.getAttribute('href');
      if (url === '/app/' || url === '/app') return;
      const titleEl = el.querySelector('p, span, div.truncate') || el;
      const title = titleEl.innerText.trim() || 'Untitled Chat';
      const absUrl = new URL(url, window.location.origin).href;
      if (!newChats.find(c => c.url === absUrl)) newChats.push({ url: absUrl, title });
      // Update title cache
      if (this.chatTitleCache[absUrl] !== title) {
        this.chatTitleCache[absUrl] = title;
        cacheUpdated = true;
      }
    });
    if (cacheUpdated) this.saveTitleCache();
    this.chats = newChats;
    this.chats.forEach(chat => this.renderChat(chat));
  }

  // ── Persistence ─────────────────────────────────────
  saveState() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ geminiFolders: this.folders });
    }
  }
  saveChatPositions() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ geminiChatPositions: this.chatPositions });
    }
  }
  saveTitleCache() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ geminiChatTitleCache: this.chatTitleCache });
    }
  }
  loadState() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiFolders', 'geminiChatPositions', 'geminiChatTitleCache'], (res) => {
        if (res.geminiChatTitleCache) {
          this.chatTitleCache = res.geminiChatTitleCache;
        }
        if (res.geminiFolders) {
          this.folders = res.geminiFolders;
          this.folders.forEach(f => this.renderFolder(f));
        }
        if (res.geminiChatPositions) {
          this.chatPositions = res.geminiChatPositions;
        }
      });
    }
  }
}

// ── Bootstrap ───────────────────────────────────────
(function boot() {
  if (window.__geminiDesktopBooted) return;
  window.__geminiDesktopBooted = true;
  function start() { new GeminiDesktop(); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
