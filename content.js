class GeminiDesktop {
  constructor() {
    this.folders = [];
    this.chats = [];
    this.chatPositions = {}; // { url: { x, y } }
    this.isDesktopActive = false;
    this.draggedEl = null;
    this.newFolderTarget = { x: 0, y: 0 };
    this.zIndexCounter = 100;
    this.contextTarget = null; // element that was right-clicked

    this.init();
  }

  async init() {
    try { this.injectFonts(); } catch(e) {}

    this.createUI();
    this.loadState();

    setInterval(() => this.extractChats(), 3000);

    // Guardian to re-attach FAB if removed by Gemini SPA navigation
    setInterval(() => {
      if (!document.getElementById('gemini-desktop-toggle')) this.createToggleButton();
    }, 1500);

    // Keyboard shortcuts
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

  // ── Toast ──────────────────────────────────────────
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
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ── UI Creation ────────────────────────────────────
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
        <button class="close-desktop-btn" id="gd-close-desktop">&times;</button>
      </div>
      <div class="desktop-workarea" id="gd-workarea"></div>
    `;

    document.documentElement.appendChild(this.overlay);
    this.workarea = document.getElementById('gd-workarea');
    document.getElementById('gd-close-desktop').onclick = () => this.toggleDesktop();
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

    // Clicking backdrop = close
    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });
    document.getElementById('gd-modal-cancel').onclick = () => this.closeModal();
    this.modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.modalConfirmBtn.click();
      if (e.key === 'Escape') this.closeModal();
    });
  }

  // ── Global Events ──────────────────────────────────
  bindGlobalEvents() {
    // Right-click on workarea (blank space)
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

    // Dismiss context menu on any click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.desktop-context-menu')) {
        this.contextMenu.classList.remove('active');
      }
    });
  }

  // ── Context Menus ──────────────────────────────────
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
      const folder = this.folders.find(f => f.id === folderId);
      if (!folder) return;
      if (action === 'open') this.openFolderDetails(folder);
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
      const action = item.dataset.action;
      if (action === 'open-chat') {
        this.toggleDesktop();
        window.location.href = chatUrl;
      }
      if (action === 'move') {
        this.moveChatToFolder(chatUrl, item.dataset.folder);
        icon.remove();
        this.showToast('Chat moved to folder');
      }
    };
    this.positionContextMenu(e);
  }

  // ── Modal Helpers ──────────────────────────────────
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

  closeModal() {
    this.modalBackdrop.classList.remove('active');
  }

  showNewFolderModal() {
    this.openModal('New Folder', 'Folder name...', 'Create', (name) => {
      this.createNewFolder(name || 'New Folder');
    });
  }

  showRenameFolderModal(folder) {
    this.openModal('Rename Folder', folder.name, 'Save', (name) => {
      if (!name) return;
      folder.name = name;
      this.saveState();
      const el = document.querySelector(`[data-id="${CSS.escape(folder.id)}"]`);
      if (el) el.querySelector('.desktop-icon-label').textContent = name;
      // Update any open window title
      const win = document.getElementById(`window-${folder.id}`);
      if (win) win.querySelector('.folder-window-title span').textContent = name;
      this.showToast(`Renamed to "${name}"`);
    });
    this.modalInput.value = folder.name;
    this.modalInput.select();
  }

  // ── Toggle Desktop ────────────────────────────────
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

  // ── Folder CRUD ────────────────────────────────────
  createNewFolder(name) {
    const folderId = 'folder-' + Date.now();
    const folderInfo = {
      id: folderId,
      name: name,
      x: this.newFolderTarget.x,
      y: this.newFolderTarget.y,
      contents: []
    };
    this.folders.push(folderInfo);
    this.renderFolder(folderInfo);
    this.saveState();
    this.showToast(`Folder "${name}" created`);
  }

  deleteFolder(folder) {
    // Return chats to desktop
    folder.contents.forEach(url => {
      const chat = this.chats.find(c => c.url === url);
      if (chat) this.renderChat(chat);
    });
    this.folders = this.folders.filter(f => f.id !== folder.id);
    this.saveState();
    const el = document.querySelector(`[data-id="${CSS.escape(folder.id)}"]`);
    if (el) el.remove();
    const win = document.getElementById(`window-${folder.id}`);
    if (win) win.remove();
    this.showToast(`Folder "${folder.name}" deleted`);
  }

  // ── Drag Helpers ───────────────────────────────────
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
      const startMouseX = e.clientX, startMouseY = e.clientY;
      const bounds = el.getBoundingClientRect();
      const workBounds = this.workarea.getBoundingClientRect();
      const startX = bounds.left - workBounds.left;
      const startY = bounds.top - workBounds.top;
      let moved = false;

      this.draggedEl = el;
      el.classList.add('dragging');

      const onMove = (me) => {
        moved = true;
        const newX = startX + me.clientX - startMouseX;
        const newY = startY + me.clientY - startMouseY;
        el.style.left = newX + 'px';
        el.style.top  = newY + 'px';

        // Highlight drop targets
        if (el.dataset.type === 'chat') {
          el.style.display = 'none';
          const targets = document.elementsFromPoint(me.clientX, me.clientY);
          el.style.display = '';
          // Clear all highlights
          this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
          const folderTarget = targets.find(t => t.dataset && t.dataset.type === 'folder');
          if (folderTarget) folderTarget.classList.add('drop-target');
        }
      };

      const onUp = (ue) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        el.classList.remove('dragging');
        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));

        if (moved) {
          this.handleDrop(el, ue.clientX, ue.clientY);
        }
        if (onDragEnd) onDragEnd(el);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  handleDrop(el, clientX, clientY) {
    this.draggedEl = null;
    const isChat = el.dataset.type === 'chat';

    el.style.display = 'none';
    const dropTargets = document.elementsFromPoint(clientX, clientY);
    el.style.display = '';

    const targetFolder = dropTargets.find(t => t.dataset && t.dataset.type === 'folder');

    if (isChat && targetFolder) {
      this.moveChatToFolder(el.dataset.id, targetFolder.dataset.id);
      el.remove();
      this.showToast('Chat moved to folder');
    }
  }

  moveChatToFolder(chatUrl, folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder && !folder.contents.includes(chatUrl)) {
      folder.contents.push(chatUrl);
      this.saveState();

      // Update badge
      try {
        const folderEl = document.querySelector(`[data-id="${CSS.escape(folderId)}"]`);
        if (folderEl) {
          folderEl.querySelector('.f-badge').textContent = folder.contents.length;
          folderEl.style.transform = 'scale(1.12)';
          setTimeout(() => folderEl.style.transform = '', 200);
        }
      } catch(e) {}

      // Remove chat position from saved state
      delete this.chatPositions[chatUrl];
      this.saveChatPositions();
    }
  }

  // ── Rendering Icons ────────────────────────────────
  renderFolder(folder) {
    if (!this.workarea) return;
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.type = 'folder';
    el.dataset.id = folder.id;
    el.style.left = folder.x + 'px';
    el.style.top = folder.y + 'px';

    el.innerHTML = `
      <div class="f-badge">${folder.contents.length}</div>
      <svg class="desktop-icon-svg" viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <div class="desktop-icon-label">${folder.name}</div>
    `;

    el.ondblclick = (e) => {
      e.stopPropagation();
      this.openFolderDetails(folder);
    };

    this.makeDraggable(el, () => {
      folder.x = parseInt(el.style.left) || 0;
      folder.y = parseInt(el.style.top) || 0;
      this.saveState();
    });

    this.workarea.appendChild(el);
  }

  renderChat(chat) {
    if (!this.workarea) return;
    const isInFolder = this.folders.some(f => f.contents.includes(chat.url));
    if (isInFolder) return;

    try {
      if (document.querySelector(`[data-id="${CSS.escape(chat.url)}"]`)) return;
    } catch(e) {}

    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.type = 'chat';
    el.dataset.id = chat.url;

    // Use saved position or compute a grid slot
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

    el.ondblclick = () => {
      this.toggleDesktop();
      window.location.href = chat.url;
    };

    this.makeDraggable(el, () => {
      this.chatPositions[chat.url] = {
        x: parseInt(el.style.left) || 0,
        y: parseInt(el.style.top) || 0
      };
      this.saveChatPositions();
    });

    this.workarea.appendChild(el);
  }

  getNextGridSlot() {
    const colWidth = 120, rowHeight = 110;
    const startX = 30, startY = 20;
    const maxCols = Math.max(1, Math.floor((window.innerWidth - 60) / colWidth));

    // Count existing icons in workarea to find next empty slot
    const usedSlots = new Set();
    this.workarea.querySelectorAll('.desktop-icon').forEach(icon => {
      const x = parseInt(icon.style.left) || 0;
      const y = parseInt(icon.style.top) || 0;
      const col = Math.round((x - startX) / colWidth);
      const row = Math.round((y - startY) / rowHeight);
      usedSlots.add(`${col},${row}`);
    });

    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < maxCols; col++) {
        if (!usedSlots.has(`${col},${row}`)) {
          return { x: startX + col * colWidth, y: startY + row * rowHeight };
        }
      }
    }
    return { x: startX, y: startY };
  }

  // ── Folder Window ──────────────────────────────────
  openFolderDetails(folder) {
    const existingWindow = document.getElementById(`window-${folder.id}`);
    if (existingWindow) {
      this.bringToFront(existingWindow);
      return;
    }

    const win = document.createElement('div');
    win.className = 'folder-window';
    win.id = `window-${folder.id}`;

    // Center nicely
    const workareaRect = this.workarea.getBoundingClientRect();
    const winW = 500, winH = 300;
    const centerX = Math.max(20, (workareaRect.width - winW) / 2);
    const centerY = Math.max(20, (workareaRect.height - winH) / 3);
    win.style.top = centerY + 'px';
    win.style.left = centerX + 'px';
    this.bringToFront(win);

    win.innerHTML = `
      <div class="folder-window-header">
        <span class="folder-window-title">
          <svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <span>${folder.name}</span>
        </span>
        <button class="folder-window-close">&times;</button>
      </div>
      <div class="folder-window-content"></div>
    `;

    win.querySelector('.folder-window-close').onclick = () => win.remove();
    this.makeWindowDraggable(win, win.querySelector('.folder-window-header'));
    win.onmousedown = () => this.bringToFront(win);

    this.renderFolderContents(folder, win.querySelector('.folder-window-content'));
    this.workarea.appendChild(win);
  }

  renderFolderContents(folder, container) {
    container.innerHTML = '';
    if (folder.contents.length === 0) {
      container.innerHTML = '<div class="folder-empty-msg">Drop chats here to organize them</div>';
      return;
    }

    folder.contents.forEach(url => {
      const chat = this.chats.find(c => c.url === url) || { url, title: 'Chat' };

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

      el.ondblclick = () => {
        this.toggleDesktop();
        window.location.href = chat.url;
      };

      el.querySelector('.remove-from-folder-btn').onclick = (e) => {
        e.stopPropagation();
        this.removeFromFolder(chat.url, folder.id);
        el.remove();
        if (folder.contents.length === 0) {
          container.innerHTML = '<div class="folder-empty-msg">Drop chats here to organize them</div>';
        }
      };

      container.appendChild(el);
    });
  }

  removeFromFolder(chatUrl, folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (folder) {
      folder.contents = folder.contents.filter(url => url !== chatUrl);
      this.saveState();

      try {
        const folderEl = document.querySelector(`[data-id="${CSS.escape(folderId)}"]`);
        if (folderEl) folderEl.querySelector('.f-badge').textContent = folder.contents.length;
      } catch(e) {}

      const chat = this.chats.find(c => c.url === chatUrl);
      if (chat) this.renderChat(chat);
      this.showToast('Chat removed from folder');
    }
  }

  // ── Chat Extraction ────────────────────────────────
  extractChats() {
    const chatLinks = document.querySelectorAll('a[href^="/app/"]');
    const newChats = [];

    chatLinks.forEach(el => {
      const url = el.getAttribute('href');
      if (url === '/app/' || url === '/app') return;

      const titleEl = el.querySelector('p, span, div.truncate') || el;
      const title = titleEl.innerText.trim() || 'Untitled Chat';
      const absUrl = new URL(url, window.location.origin).href;

      if (!newChats.find(c => c.url === absUrl)) {
        newChats.push({ url: absUrl, title });
      }
    });

    this.chats = newChats;
    this.chats.forEach(chat => this.renderChat(chat));
  }

  // ── Persistence ────────────────────────────────────
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

  loadState() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiFolders', 'geminiChatPositions'], (res) => {
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

// ── Bootstrap ──────────────────────────────────────
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
