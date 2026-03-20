class GeminiDesktop {
  constructor() {
    this.folders = [];
    this.chats = [];
    this.chatPositions = {};
    this.isDesktopActive = false;
    this.draggedEl = null;
    this.newFolderTarget = { x: 0, y: 0 };
    this.newFolderParentId = null; // for subfolders
    this.zIndexCounter = 100;

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

    this.modalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.modalBackdrop) this.closeModal();
    });
    document.getElementById('gd-modal-cancel').onclick = () => this.closeModal();
    this.modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.modalConfirmBtn.click();
      if (e.key === 'Escape') this.closeModal();
    });
  }

  // ── Global Events ───────────────────────────────────
  bindGlobalEvents() {
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

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.desktop-context-menu')) {
        this.contextMenu.classList.remove('active');
      }
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
      const chat = this.chats.find(c => c.url === url);
      if (chat) this.renderChat(chat);
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
        el.style.left = (startX + me.clientX - startMouseX) + 'px';
        el.style.top  = (startY + me.clientY - startMouseY) + 'px';

        // Highlight drop targets (folder icons AND open folder windows)
        const draggingType = el.dataset.type;
        if (draggingType === 'chat' || draggingType === 'folder') {
          el.style.display = 'none';
          const targets = document.elementsFromPoint(me.clientX, me.clientY);
          el.style.display = '';
          this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
          this.workarea.querySelectorAll('.folder-window.window-drop-target').forEach(w => w.classList.remove('window-drop-target'));

          // Check for folder icon targets first
          const folderTarget = targets.find(t => t.dataset && t.dataset.type === 'folder' && t.dataset.id !== el.dataset.id);
          if (folderTarget) {
            folderTarget.classList.add('drop-target');
          } else {
            // Check if hovering over an open folder window's content area
            const windowTarget = targets.find(t => t.closest && t.closest('.folder-window'));
            if (windowTarget) {
              const folderWin = windowTarget.closest('.folder-window');
              // Get the folder id from the window id (window-{folderId})
              const winFolderId = folderWin.id.replace('window-', '');
              if (winFolderId !== el.dataset.id) {
                folderWin.classList.add('window-drop-target');
              }
            }
          }
        }
      };

      const onUp = (ue) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        el.classList.remove('dragging');
        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));
        this.workarea.querySelectorAll('.folder-window.window-drop-target').forEach(w => w.classList.remove('window-drop-target'));
        if (moved) this.handleDrop(el, ue.clientX, ue.clientY);
        if (onDragEnd) onDragEnd(el);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };
  }

  handleDrop(el, clientX, clientY) {
    this.draggedEl = null;
    const dragType = el.dataset.type;
    const dragId = el.dataset.id;

    el.style.display = 'none';
    const dropTargets = document.elementsFromPoint(clientX, clientY);
    el.style.display = '';

    // Priority 1: Dropped on a folder icon on the desktop
    const targetFolderEl = dropTargets.find(t => t.dataset && t.dataset.type === 'folder' && t.dataset.id !== dragId);

    if (targetFolderEl) {
      const targetFolderId = targetFolderEl.dataset.id;
      if (dragType === 'chat') {
        this.moveChatToFolder(dragId, targetFolderId);
        el.remove();
        this.showToast('Chat moved to folder');
      } else if (dragType === 'folder') {
        this.moveFolderToFolder(dragId, targetFolderId);
      }
      return;
    }

    // Priority 2: Dropped on an open folder window
    const windowTarget = dropTargets.find(t => t.closest && t.closest('.folder-window'));
    if (windowTarget) {
      const folderWin = windowTarget.closest('.folder-window');
      const winFolderId = folderWin.id.replace('window-', '');
      if (winFolderId !== dragId) {
        if (dragType === 'chat') {
          this.moveChatToFolder(dragId, winFolderId);
          el.remove();
          this.showToast('Chat moved to folder');
        } else if (dragType === 'folder') {
          this.moveFolderToFolder(dragId, winFolderId);
        }
      }
    }
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

  // Drag items inside a folder window onto subfolder targets
  makeInWindowDraggable(el, itemId, itemType, currentFolder, win) {
    let ghost = null, startX = 0, startY = 0, moved = false;

    const onMouseDown = (e) => {
      // Ignore if clicking the remove button
      if (e.target.closest('.remove-from-folder-btn')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      startX = e.clientX;
      startY = e.clientY;
      moved = false;

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;

        // Require a small drag threshold before activating
        if (!moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

        if (!moved) {
          moved = true;
          ghost = el.cloneNode(true);
          ghost.className = 'desktop-icon static-icon dragging-ghost';
          ghost.style.position = 'fixed';
          ghost.style.pointerEvents = 'none';
          ghost.style.zIndex = '2147483647';
          ghost.style.opacity = '0.85';
          ghost.style.transform = 'scale(1.08)';
          ghost.style.filter = 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))';
          ghost.style.width = el.offsetWidth + 'px';
          document.documentElement.appendChild(ghost);
          el.style.opacity = '0.3';
        }

        ghost.style.left = (me.clientX - el.offsetWidth / 2) + 'px';
        ghost.style.top = (me.clientY - el.offsetHeight / 2) + 'px';

        // Clear all highlights everywhere
        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));

        const targets = document.elementsFromPoint(me.clientX, me.clientY);

        // Check for subfolder targets inside the window
        const subfolderTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'subfolder-in-window' && t.dataset.id !== itemId
        );
        if (subfolderTarget) { subfolderTarget.classList.add('drop-target'); return; }

        // Check for desktop folder targets (dragging out onto a folder on the desktop)
        const desktopFolderTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'folder' && t.dataset.id !== itemId && t.dataset.id !== currentFolder.id
        );
        if (desktopFolderTarget) desktopFolderTarget.classList.add('drop-target');
      };

      const onUp = (ue) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        if (ghost) { ghost.remove(); ghost = null; }
        el.style.opacity = '';

        this.workarea.querySelectorAll('.drop-target').forEach(dt => dt.classList.remove('drop-target'));

        if (!moved) return;

        const targets = document.elementsFromPoint(ue.clientX, ue.clientY);

        // Priority 1: Dropped on a subfolder inside the same window
        const subfolderTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'subfolder-in-window' && t.dataset.id !== itemId
        );

        if (subfolderTarget) {
          const targetFolderId = subfolderTarget.dataset.id;
          if (itemType === 'chat') {
            currentFolder.contents = currentFolder.contents.filter(c => c !== itemId);
            const targetFolder = this.getFolderById(targetFolderId);
            if (targetFolder && !targetFolder.contents.includes(itemId)) targetFolder.contents.push(itemId);
            this.saveState();
            this.updateFolderBadge(currentFolder.id);
            this.updateFolderBadge(targetFolderId);
            this.refreshFolderWindow(currentFolder.id);
            this.showToast('Chat moved to subfolder');
          } else if (itemType === 'subfolder') {
            const source = this.getFolderById(itemId);
            if (source && !this.isDescendant(itemId, targetFolderId) && itemId !== targetFolderId) {
              currentFolder.contents = currentFolder.contents.filter(c => c !== itemId);
              source.parentId = targetFolderId;
              const targetFolder = this.getFolderById(targetFolderId);
              if (targetFolder && !targetFolder.contents.includes(itemId)) targetFolder.contents.push(itemId);
              this.saveState();
              this.updateFolderBadge(currentFolder.id);
              this.updateFolderBadge(targetFolderId);
              this.refreshFolderWindow(currentFolder.id);
              this.showToast(`"${source.name}" moved to subfolder`);
            } else {
              this.showToast("Can't move a folder into its own subfolder");
            }
          }
          return;
        }

        // Priority 2: Dropped on a desktop folder icon (different from current)
        const desktopFolderTarget = targets.find(t =>
          t.dataset && t.dataset.type === 'folder' && t.dataset.id !== itemId && t.dataset.id !== currentFolder.id
        );

        if (desktopFolderTarget) {
          const targetFolderId = desktopFolderTarget.dataset.id;
          if (itemType === 'chat') {
            currentFolder.contents = currentFolder.contents.filter(c => c !== itemId);
            const targetFolder = this.getFolderById(targetFolderId);
            if (targetFolder && !targetFolder.contents.includes(itemId)) targetFolder.contents.push(itemId);
            this.saveState();
            this.updateFolderBadge(currentFolder.id);
            this.updateFolderBadge(targetFolderId);
            this.refreshFolderWindow(currentFolder.id);
            this.showToast('Chat moved to folder');
          } else if (itemType === 'subfolder') {
            const source = this.getFolderById(itemId);
            if (source && !this.isDescendant(itemId, targetFolderId) && itemId !== targetFolderId) {
              currentFolder.contents = currentFolder.contents.filter(c => c !== itemId);
              source.parentId = targetFolderId;
              const targetFolder = this.getFolderById(targetFolderId);
              if (targetFolder && !targetFolder.contents.includes(itemId)) targetFolder.contents.push(itemId);
              this.saveState();
              this.updateFolderBadge(currentFolder.id);
              this.updateFolderBadge(targetFolderId);
              this.refreshFolderWindow(currentFolder.id);
              this.showToast(`"${source.name}" moved to folder`);
            }
          }
          return;
        }

        // Priority 3: Dropped on the bare desktop (outside ANY folder window)
        const isOverWindow = targets.find(t => t.closest && t.closest('.folder-window'));
        if (!isOverWindow) {
          const workRect = this.workarea.getBoundingClientRect();
          const dropX = ue.clientX - workRect.left - 50;
          const dropY = ue.clientY - workRect.top - 50;

          if (itemType === 'chat') {
            currentFolder.contents = currentFolder.contents.filter(c => c !== itemId);
            this.saveState();
            this.updateFolderBadge(currentFolder.id);
            this.refreshFolderWindow(currentFolder.id);
            // Place on desktop at drop position
            this.chatPositions[itemId] = { x: Math.max(0, dropX), y: Math.max(0, dropY) };
            this.saveChatPositions();
            const chat = this.chats.find(c => c.url === itemId) || { url: itemId, title: 'Chat' };
            this.renderChat(chat);
            this.showToast('Chat moved to desktop');
          } else if (itemType === 'subfolder') {
            const source = this.getFolderById(itemId);
            if (source) {
              currentFolder.contents = currentFolder.contents.filter(c => c !== itemId);
              source.parentId = null;
              source.x = Math.max(0, dropX);
              source.y = Math.max(0, dropY);
              this.saveState();
              this.updateFolderBadge(currentFolder.id);
              this.refreshFolderWindow(currentFolder.id);
              this.renderFolder(source);
              this.showToast(`"${source.name}" moved to desktop`);
            }
          }
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
      const chat = this.chats.find(c => c.url === chatUrl);
      if (chat) this.renderChat(chat);
      this.showToast('Chat removed from folder');
    }
  }

  // ── Chat Extraction ─────────────────────────────────
  extractChats() {
    const chatLinks = document.querySelectorAll('a[href^="/app/"]');
    const newChats = [];
    chatLinks.forEach(el => {
      const url = el.getAttribute('href');
      if (url === '/app/' || url === '/app') return;
      const titleEl = el.querySelector('p, span, div.truncate') || el;
      const title = titleEl.innerText.trim() || 'Untitled Chat';
      const absUrl = new URL(url, window.location.origin).href;
      if (!newChats.find(c => c.url === absUrl)) newChats.push({ url: absUrl, title });
    });
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
