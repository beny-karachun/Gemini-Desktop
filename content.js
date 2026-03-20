class GeminiDesktop {
  constructor() {
    this.folders = [];
    this.chats = []; 
    this.isDesktopActive = false;
    this.draggedEl = null;
    this.newFolderTarget = { x: 0, y: 0 };
    this.zIndexCounter = 2147480000;
    
    this.init();
  }

  async init() {
    try {
      this.injectFonts();
    } catch(e) { console.warn("Gemini Workspace: CSP blocked fonts", e); }
    
    this.createUI();
    this.loadState();
    
    setInterval(() => this.extractChats(), 3000);
    
    setInterval(() => {
      if (!document.getElementById('gemini-desktop-toggle')) {
        this.createToggleButton();
      }
      if (this.isDesktopActive && !document.getElementById('gemini-desktop-overlay')) {
        this.createOverlay();
        this.bindEvents();
        this.overlay.classList.add('active'); 
      }
    }, 1000);
  }
  
  injectFonts() {
    if(!document.getElementById('inter-font')) {
      const link = document.createElement('link');
      link.id = 'inter-font';
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
  }

  createUI() {
    this.createToggleButton();
    this.createOverlay();
    this.bindEvents();
  }

  createToggleButton() {
    if (document.getElementById('gemini-desktop-toggle')) return;
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'gemini-desktop-toggle';
    this.toggleBtn.title = 'Open Workspace';
    this.toggleBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        <line x1="12" y1="11" x2="12" y2="17"></line>
        <line x1="9" y1="14" x2="15" y2="14"></line>
      </svg>
    `;
    this.toggleBtn.onclick = () => this.toggleDesktop();
    document.documentElement.appendChild(this.toggleBtn);
  }

  createOverlay() {
    if (document.getElementById('gemini-desktop-overlay')) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'gemini-desktop-overlay';
    
    this.overlay.innerHTML = `
      <div class="desktop-header">
        <h1>Gemini Workspace</h1>
        <button class="close-desktop-btn" id="close-desktop">&times;</button>
      </div>
      <div class="desktop-workarea" id="desktop-workarea"></div>
      
      <div class="desktop-context-menu" id="desktop-context-menu">
        <div class="context-menu-item" id="context-new-folder">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="12" y1="11" x2="12" y2="17"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
          New Folder
        </div>
        <div class="context-menu-item" id="context-refresh">
           <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>
           Refresh Chats
        </div>
        <div class="context-menu-item" id="context-close">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Close Workspace
        </div>
      </div>
      
      <div class="desktop-modal" id="new-folder-modal">
        <h2>Create Folder</h2>
        <input type="text" id="folder-name-input" placeholder="Awesome Ideas" autocomplete="off" />
        <div class="desktop-modal-actions">
          <button class="desktop-modal-btn" id="modal-cancel">Cancel</button>
          <button class="desktop-modal-btn primary" id="modal-create">Create</button>
        </div>
      </div>
    `;
    
    document.documentElement.appendChild(this.overlay);
    
    this.workarea = document.getElementById('desktop-workarea');
    this.contextMenu = document.getElementById('desktop-context-menu');
    this.modal = document.getElementById('new-folder-modal');
    this.folderInput = document.getElementById('folder-name-input');
    
    if (this.folders.length > 0) {
      this.folders.forEach(f => this.renderFolder(f));
    }
  }

  bindEvents() {
    const closeBtn = document.getElementById('close-desktop');
    if(closeBtn) closeBtn.onclick = () => this.toggleDesktop();
    
    if(this.workarea) {
      this.workarea.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (e.target.closest('.desktop-icon') || e.target.closest('.desktop-modal') || e.target.closest('.desktop-header')) return;
        
        this.contextMenu.style.left = e.clientX + 'px';
        this.contextMenu.style.top = e.clientY + 'px';
        this.contextMenu.classList.add('active');
      });
    }
    
    if(this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if(!e.target.closest('#desktop-context-menu') && this.contextMenu) {
          this.contextMenu.classList.remove('active');
        }
      });
    }
    
    const btnNewFolder = document.getElementById('context-new-folder');
    if(btnNewFolder) btnNewFolder.onclick = (e) => {
      const x = parseInt(this.contextMenu.style.left);
      const y = parseInt(this.contextMenu.style.top);
      this.contextMenu.classList.remove('active');
      this.showModalForNewFolder(x, y);
    };
    
    const btnRefresh = document.getElementById('context-refresh');
    if(btnRefresh) btnRefresh.onclick = () => {
      this.contextMenu.classList.remove('active');
      this.extractChats();
    };
    
    const btnClose = document.getElementById('context-close');
    if(btnClose) btnClose.onclick = () => {
      this.contextMenu.classList.remove('active');
      this.toggleDesktop();
    };
    
    const btnCancel = document.getElementById('modal-cancel');
    if(btnCancel) btnCancel.onclick = () => {
      if(this.modal) this.modal.classList.remove('active');
    };
    
    const btnCreate = document.getElementById('modal-create');
    if(btnCreate) btnCreate.onclick = () => this.createNewFolder();
    
    if(this.folderInput) {
      this.folderInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') this.createNewFolder();
        if(e.key === 'Escape' && this.modal) this.modal.classList.remove('active');
      });
    }
  }

  toggleDesktop() {
    if(!this.overlay) this.createOverlay();
    this.isDesktopActive = !this.isDesktopActive;
    if(this.isDesktopActive) {
      this.overlay.classList.add('active');
      this.extractChats(); 
    } else {
      this.overlay.classList.remove('active');
    }
  }
  
  showModalForNewFolder(x, y) {
    if(!this.workarea || !this.modal) return;
    const rect = this.workarea.getBoundingClientRect();
    this.newFolderTarget = {
      x: Math.max(0, x - rect.left),
      y: Math.max(0, y - rect.top)
    };
    this.folderInput.value = '';
    this.modal.classList.add('active');
    setTimeout(() => this.folderInput.focus(), 100);
  }
  
  createNewFolder() {
    const name = this.folderInput.value.trim() || 'New Folder';
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
    if(this.modal) this.modal.classList.remove('active');
  }

  bringToFront(el) {
    this.zIndexCounter++;
    el.style.zIndex = this.zIndexCounter;
  }

  makeWindowDraggable(win, handle) {
    let initialX = 0, initialY = 0;
    handle.onmousedown = (e) => {
      if(e.button !== 0) return;
      e.preventDefault();
      this.bringToFront(win);
      
      initialX = e.clientX;
      initialY = e.clientY;
      const bounds = win.getBoundingClientRect();
      const workareaBounds = this.workarea.getBoundingClientRect();
      const startX = bounds.left - workareaBounds.left;
      const startY = bounds.top - workareaBounds.top;
      
      document.onmousemove = (moveEvent) => {
        const dx = moveEvent.clientX - initialX;
        const dy = moveEvent.clientY - initialY;
        win.style.left = (startX + dx) + 'px';
        win.style.top = (startY + dy) + 'px';
      };
      
      document.onmouseup = () => {
        document.onmousemove = null;
        document.onmouseup = null;
      };
    };
  }

  makeDraggable(el, onDragEnd) {
    let initialX = 0, initialY = 0;
    
    el.onmousedown = (e) => {
      if(e.button !== 0) return; 
      e.preventDefault();
      
      this.zIndexCounter++;
      el.style.zIndex = this.zIndexCounter;
      
      initialX = e.clientX;
      initialY = e.clientY;
      
      const bounds = el.getBoundingClientRect();
      const workareaBounds = this.workarea.getBoundingClientRect();
      const startX = bounds.left - workareaBounds.left;
      const startY = bounds.top - workareaBounds.top;
      
      this.draggedEl = el;
      el.classList.add('dragging');
      
      document.onmousemove = (moveEvent) => {
        const dx = moveEvent.clientX - initialX;
        const dy = moveEvent.clientY - initialY;
        el.style.left = (startX + dx) + 'px';
        el.style.top = (startY + dy) + 'px';
      };
      
      document.onmouseup = (upEvent) => {
        document.onmousemove = null;
        document.onmouseup = null;
        el.classList.remove('dragging');
        
        this.handleDrop(el, upEvent.clientX, upEvent.clientY);
        if(onDragEnd) onDragEnd(el);
      };
    };
  }
  
  handleDrop(el, clientX, clientY) {
    this.draggedEl = null;
    
    const isChat = el.dataset.type === 'chat';
    const draggedId = el.dataset.id;
    
    el.style.display = 'none';
    const dropTargets = document.elementsFromPoint(clientX, clientY);
    el.style.display = ''; 
    
    const targetFolder = dropTargets.find(t => t.dataset.type === 'folder');
    
    if (isChat && targetFolder) {
      const folderId = targetFolder.dataset.id;
      this.moveChatToFolder(draggedId, folderId);
      el.remove(); 
    }
  }
  
  moveChatToFolder(chatUrl, folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if(folder && !folder.contents.includes(chatUrl)) {
      folder.contents.push(chatUrl);
      this.saveState();
      
      try {
        const folderEl = document.querySelector(`[data-id="${CSS.escape(folderId)}"]`);
        if(folderEl) {
           folderEl.querySelector('.f-badge').innerText = folder.contents.length;
           folderEl.style.transform = 'scale(1.15)';
           setTimeout(() => folderEl.style.transform = '', 200);
        }
      } catch(e) {}
    }
  }

  renderFolder(folder) {
    if(!this.workarea) return;
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.type = 'folder';
    el.dataset.id = folder.id;
    el.style.left = folder.x + 'px';
    el.style.top = folder.y + 'px';
    
    el.innerHTML = `
      <div class="f-badge">${folder.contents.length > 0 ? folder.contents.length : '0'}</div>
      <svg class="desktop-icon-svg" viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
      <div class="desktop-icon-label">${folder.name}</div>
    `;
    
    el.ondblclick = () => this.openFolderDetails(folder);
    
    this.makeDraggable(el, (draggedEl) => {
      folder.x = parseInt(draggedEl.style.left) || 0;
      folder.y = parseInt(draggedEl.style.top) || 0;
      this.saveState();
    });
    
    this.workarea.appendChild(el);
  }
  
  renderChat(chat) {
    if(!this.workarea) return;
    const isInFolder = this.folders.some(f => f.contents.includes(chat.url));
    if(isInFolder) return;
    
    try {
      if(document.querySelector(`[data-id="${CSS.escape(chat.url)}"]`)) return;
    } catch(e){}
    
    const el = document.createElement('div');
    el.className = 'desktop-icon';
    el.dataset.type = 'chat';
    el.dataset.id = chat.url;
    
    const posX = Math.random() * (window.innerWidth / 2) + 20;
    const posY = Math.random() * (window.innerHeight - 200) + 80;
    
    el.style.left = posX + 'px';
    el.style.top = posY + 'px';
    
    el.innerHTML = `
      <svg class="desktop-icon-svg chat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <div class="desktop-icon-label">${chat.title}</div>
    `;
    
    el.ondblclick = () => {
      this.toggleDesktop();
      window.location.href = chat.url;
    };
    
    this.makeDraggable(el, () => {});
    
    this.workarea.appendChild(el);
  }
  
  openFolderDetails(folder) {
    const existingWindow = document.getElementById(`window-${folder.id}`);
    if (existingWindow) {
      this.bringToFront(existingWindow);
      return;
    }

    const win = document.createElement('div');
    win.className = 'folder-window';
    win.id = `window-${folder.id}`;
    
    win.style.top = Math.max(20, folder.y - 50) + 'px';
    win.style.left = Math.max(20, folder.x + 100) + 'px';
    this.bringToFront(win);

    win.innerHTML = `
      <div class="folder-window-header">
        <span class="folder-window-title">${folder.name}</span>
        <button class="folder-window-close">&times;</button>
      </div>
      <div class="folder-window-content"></div>
    `;

    const closeBtn = win.querySelector('.folder-window-close');
    closeBtn.onclick = () => win.remove();

    const header = win.querySelector('.folder-window-header');
    this.makeWindowDraggable(win, header);
    
    win.onmousedown = () => this.bringToFront(win);

    const content = win.querySelector('.folder-window-content');
    this.renderFolderContents(folder, content);

    this.workarea.appendChild(win);
  }

  renderFolderContents(folder, container) {
    container.innerHTML = '';
    
    if (folder.contents.length === 0) {
      container.innerHTML = '<div style="color:var(--text-secondary); width:100%; text-align:center; padding: 20px; font-family:Inter,sans-serif;">Folder is empty</div>';
      return;
    }
    
    folder.contents.forEach(url => {
      const chat = this.chats.find(c => c.url === url) || { url, title: 'Unknown Chat' };
      
      const el = document.createElement('div');
      el.className = 'desktop-icon static-icon';
      el.dataset.type = 'chat-in-folder';
      el.dataset.id = chat.url;
      
      el.innerHTML = `
        <button class="remove-from-folder-btn" title="Remove from folder">×</button>
        <svg class="desktop-icon-svg chat-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
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
      };
      
      container.appendChild(el);
    });
  }

  removeFromFolder(chatUrl, folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if(folder) {
      folder.contents = folder.contents.filter(url => url !== chatUrl);
      this.saveState();
      
      const folderEl = document.querySelector(`[data-id="${CSS.escape(folderId)}"]`);
      if(folderEl) folderEl.querySelector('.f-badge').innerText = folder.contents.length;
      
      const chat = this.chats.find(c => c.url === chatUrl);
      if(chat) this.renderChat(chat);
    }
  }

  extractChats() {
    const chatLinks = document.querySelectorAll('a[href^="/app/"]');
    const newChats = [];
    
    chatLinks.forEach(el => {
      const url = el.getAttribute('href');
      if(url === '/app/' || url === '/app') return;
      
      const titleEl = el.querySelector('p, span, div.truncate') || el;
      const title = titleEl.innerText.trim() || 'Untitled Chat';
      const absUrl = new URL(url, window.location.origin).href;
      
      if(!newChats.find(c => c.url === absUrl)) {
         newChats.push({ url: absUrl, title });
      }
    });
    
    this.chats = newChats;
    this.chats.forEach(chat => this.renderChat(chat));
  }
  
  saveState() {
    if(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ geminiFolders: this.folders });
    }
  }
  
  loadState() {
    if(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiFolders'], (res) => {
        if(res.geminiFolders) {
          this.folders = res.geminiFolders;
          document.querySelectorAll('.desktop-icon[data-type="folder"]').forEach(el => el.remove());
          this.folders.forEach(f => this.renderFolder(f));
        }
      });
    }
  }
}

function bootstrapGeminiDesktop() {
  if (window.geminiDesktopInjected) return;
  window.geminiDesktopInjected = true;
  new GeminiDesktop();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapGeminiDesktop);
  window.addEventListener('load', bootstrapGeminiDesktop);
} else {
  bootstrapGeminiDesktop();
}
