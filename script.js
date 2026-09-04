// ==========================================
// 1. CONFIGURAÇÃO E SISTEMA SPA
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBtnSIxy1F7di5_PdggW5RAh7EsBuIyXwc",
  authDomain: "dreylly-tabuleiro.firebaseapp.com",
  projectId: "dreylly-tabuleiro",
  storageBucket: "dreylly-tabuleiro.firebasestorage.app",
  messagingSenderId: "884357013795",
  appId: "1:884357013795:web:5b1deb7634c1fdb58bac96",
  databaseURL: "https://dreylly-tabuleiro-default-rtdb.firebaseio.com" // Necessário para o Realtime Database
};

let database = null;
if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
  } catch(e) {
    console.error("Erro ao inicializar Firebase:", e);
  }
}

let currentRoomRef = null;
let currentUserRef = null;
let currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let currentUserName = 'Jogador';

let mockRooms = [
  { id: "sala-1", name: "Mestres do Xadrez", status: "Aguardando jogadores", playersCount: 1, maxPlayers: 2, type: "waiting" },
  { id: "sala-2", name: "Estratégia Avançada", status: "Em andamento", playersCount: 4, maxPlayers: 4, type: "progress" },
  { id: "sala-3", name: "Mesa Casual #12", status: "Aguardando jogadores", playersCount: 3, maxPlayers: 4, type: "waiting" }
];

function navigateTo(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(s => s.classList.remove('active'));
  setTimeout(() => {
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      if (screenId === 'screen-board') {
        resizeCanvas();
      }
    }
  }, 50);
}

// ==========================================
// 2. TELA DE LOGIN E NAVEGAÇÃO
// ==========================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('input-username').value.trim();
    const email = document.getElementById('input-email').value.trim();
    const pass = document.getElementById('input-password').value.trim();

    if (name && email && pass) {
      currentUserName = name;
      renderRooms(mockRooms);
      navigateTo('screen-rooms');
    } else {
      alert("Por favor, preencha todos os campos.");
    }
  });
}

// ==========================================
// 3. TELA DE PESQUISA E CRIAÇÃO DE SALAS
// ==========================================
function renderRooms(rooms) {
  const roomList = document.getElementById('room-list');
  if (!roomList) return;
  roomList.innerHTML = '';

  rooms.forEach(room => {
    const li = document.createElement('li');
    li.className = 'room-item';
    const badgeClass = room.type === 'waiting' ? 'badge-waiting' : 'badge-progress';

    li.innerHTML = `
      <div class="room-info">
        <h3>${room.name}</h3>
        <div class="room-details">
          <span class="badge ${badgeClass}">${room.status}</span> | Jogadores: ${room.playersCount}/${room.maxPlayers}
        </div>
      </div>
      <button class="btn-primary" onclick="connectToRoom('${room.id}', '${room.name}')">Entrar na Sala</button>
    `;
    roomList.appendChild(li);
  });
}

// Criar nova sala
const createRoomForm = document.getElementById('create-room-form');
if (createRoomForm) {
  createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('create-room-name');
    const maxInput = document.getElementById('create-room-max');
    const statusSelect = document.getElementById('create-room-status');

    const name = nameInput.value.trim();
    const maxPlayers = parseInt(maxInput.value) || 4;
    const type = statusSelect.value;
    const statusText = type === 'waiting' ? 'Aguardando jogadores' : 'Em andamento';

    if (!name) return;

    const newRoom = {
      id: 'sala-' + Date.now(),
      name: name,
      status: statusText,
      playersCount: 1,
      maxPlayers: maxPlayers,
      type: type
    };

    mockRooms.unshift(newRoom);
    renderRooms(mockRooms);
    nameInput.value = '';
    
    // Entra direto na sala criada
    connectToRoom(newRoom.id, newRoom.name);
  });
}

// Filtro de Busca
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = mockRooms.filter(r => r.name.toLowerCase().includes(query));
    renderRooms(filtered);
  });
}

function connectToRoom(roomId, roomName) {
  document.getElementById('current-room-title').textContent = roomName;
  
  if (database) {
    if (currentUserRef) currentUserRef.remove();
    currentRoomRef = database.ref('rooms/' + roomId);
    currentUserRef = currentRoomRef.child('users/' + currentUserId);
    currentUserRef.set({
      name: currentUserName,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    currentUserRef.onDisconnect().remove();

    currentRoomRef.child('users').on('value', (snapshot) => {
      updatePlayersList(snapshot.val() || {});
    });

    currentRoomRef.child('state').on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        gameState.tokens = data.tokens || [];
        gameState.drawings = data.drawings || [];
        gameState.gridSize = data.gridSize || 20;
        if (data.bgImageDataUrl && data.bgImageDataUrl !== gameState.bgImageDataUrl) {
          loadBgImageFromUrl(data.bgImageDataUrl);
        }
        render();
      }
    });
  } else {
    updatePlayersList({ [currentUserId]: { name: currentUserName } });
  }

  navigateTo('screen-board');
}

const btnLeaveRoom = document.getElementById('btn-leave-room');
if (btnLeaveRoom) {
  btnLeaveRoom.onclick = () => {
    if (currentUserRef) currentUserRef.remove();
    navigateTo('screen-rooms');
  };
}

// ==========================================
// 4. ESTADO DO JOGO, CÂMERA E CANVAS
// ==========================================
const gameState = {
  gridSize: 20,
  cellSize: 50,
  bgImage: null,
  bgImageDataUrl: null,
  tokens: [],
  drawings: []
};

const camera = { x: 0, y: 0, zoom: 1, isPanning: false, startPanX: 0, startPanY: 0 };
let currentTool = 'select';
let isDrawing = false;
let currentPath = null;
let draggedToken = null;
let initialPinchDistance = null;

let selectedTokenForMenu = null;
let pressTimer = null;
let tempImageDataUrl = null;

const canvas = document.getElementById('vtt-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const wrapper = document.getElementById('canvas-wrapper');
const contextMenu = document.getElementById('token-context-menu');
const modalOverlay = document.getElementById('token-modal-overlay');
const modalInputName = document.getElementById('modal-input-name');
const modalInputColor = document.getElementById('modal-input-color');
const modalInputSize = document.getElementById('modal-input-size');
const modalInputImage = document.getElementById('modal-input-image');
const modalPreview = document.getElementById('modal-token-preview');
const modalPreviewName = document.getElementById('modal-preview-name');

function resizeCanvas() {
  if (wrapper && canvas) {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    render();
  }
}
window.addEventListener('resize', resizeCanvas);

function screenToWorld(screenX, screenY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (screenX - rect.left - camera.x) / camera.zoom,
    y: (screenY - rect.top - camera.y) / camera.zoom
  };
}

function snapToGrid(coord, sizeInCells = 1) {
  const cellCenterOffset = (sizeInCells * gameState.cellSize) / 2;
  return Math.floor(coord / gameState.cellSize) * gameState.cellSize + cellCenterOffset;
}

// ==========================================
// 5. SIDEBAR MOBILE
// ==========================================
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const btnToggle = document.getElementById('btn-toggle-sidebar');
const btnClose = document.getElementById('btn-close-sidebar');

function toggleSidebar() {
  if (sidebar && overlay) {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  }
}
if (btnToggle) btnToggle.addEventListener('click', toggleSidebar);
if (btnClose) btnClose.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);

function updatePlayersList(users) {
  const container = document.getElementById('online-players-list');
  if (!container) return;
  container.innerHTML = '';
  Object.keys(users).forEach(id => {
    const user = users[id];
    const item = document.createElement('div');
    item.className = 'player-item';
    item.innerHTML = `<span class="status-dot"></span> ${user.name} ${id === currentUserId ? '(Você)' : ''}`;
    container.appendChild(item);
  });
}

function syncGameState() {
  if (currentRoomRef) {
    currentRoomRef.child('state').set({
      tokens: gameState.tokens.map(t => ({
        id: t.id, name: t.name, color: t.color, size: t.size,
        imageDataUrl: t.imageDataUrl || null, x: t.x, y: t.y
      })),
      drawings: gameState.drawings,
      gridSize: gameState.gridSize,
      bgImageDataUrl: gameState.bgImageDataUrl || null
    });
  }
}

// ==========================================
// 6. MOTOR DE RENDERIZAÇÃO
// ==========================================
function render() {
  if (!ctx || !canvas) return;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);
  drawMapBackground();
  drawGrid();
  drawDrawings();
  drawTokens();
  ctx.restore();
}

function drawMapBackground() {
  if (gameState.bgImage) {
    const size = gameState.gridSize * gameState.cellSize;
    ctx.drawImage(gameState.bgImage, 0, 0, size, size);
  }
}

function drawGrid() {
  const totalSize = gameState.gridSize * gameState.cellSize;
  ctx.strokeStyle = gameState.bgImage ? 'rgba(255,255,255,0.25)' : '#2a2a30';
  ctx.lineWidth = 1;
  for (let i = 0; i <= gameState.gridSize; i++) {
    const pos = i * gameState.cellSize;
    ctx.beginPath(); ctx.moveTo(pos, 0); ctx.lineTo(pos, totalSize); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, pos); ctx.lineTo(totalSize, pos); ctx.stroke();
  }
}

function drawDrawings() {
  gameState.drawings.forEach(path => {
    if (path.length < 2) return;
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 3 / camera.zoom;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.stroke();
  });
}

function drawTokens() {
  gameState.tokens.forEach(token => {
    const radius = (token.size * gameState.cellSize) / 2 - 2;
    ctx.save();
    if (token.imageDataUrl) {
      if (!token.imageObj) {
        token.imageObj = new Image();
        token.imageObj.onload = () => render();
        token.imageObj.src = token.imageDataUrl;
      }
      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.clip();
      if (token.imageObj.complete && token.imageObj.naturalWidth !== 0) {
        ctx.drawImage(token.imageObj, token.x - radius, token.y - radius, radius * 2, radius * 2);
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = token.color;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = token.color;
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.fillText(token.name, token.x, token.y - radius - 6);
  });
}

// ==========================================
// 7. MENU CONTEXTUAL E MODAL INTERATIVO
// ==========================================
function showContextMenu(screenX, screenY, token) {
  selectedTokenForMenu = token;
  if (!contextMenu) return;
  contextMenu.style.left = `${Math.min(screenX, window.innerWidth - 170)}px`;
  contextMenu.style.top = `${Math.min(screenY, window.innerHeight - 100)}px`;
  contextMenu.style.display = 'block';
}

function hideContextMenu() {
  if (contextMenu) contextMenu.style.display = 'none';
}

function openTokenModal() {
  if (!selectedTokenForMenu || !modalOverlay) return;
  hideContextMenu();
  tempImageDataUrl = selectedTokenForMenu.imageDataUrl || null;
  modalInputName.value = selectedTokenForMenu.name;
  modalInputColor.value = selectedTokenForMenu.color;
  modalInputSize.value = selectedTokenForMenu.size;
  modalInputImage.value = '';
  updateModalPreview();
  modalOverlay.style.display = 'flex';
}

function closeTokenModal() {
  if (modalOverlay) modalOverlay.style.display = 'none';
  selectedTokenForMenu = null;
  tempImageDataUrl = null;
}

function updateModalPreview() {
  if (!modalPreview) return;
  modalPreviewName.textContent = modalInputName.value || 'Token';
  modalPreview.style.borderColor = modalInputColor.value;
  if (tempImageDataUrl) {
    modalPreview.style.backgroundImage = `url(${tempImageDataUrl})`;
    modalPreview.style.backgroundColor = 'transparent';
  } else {
    modalPreview.style.backgroundImage = 'none';
    modalPreview.style.backgroundColor = modalInputColor.value;
  }
}

if (modalInputName) modalInputName.addEventListener('input', updateModalPreview);
if (modalInputColor) modalInputColor.addEventListener('input', updateModalPreview);
if (modalInputImage) {
  modalInputImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        tempImageDataUrl = event.target.result;
        updateModalPreview();
      };
      reader.readAsDataURL(file);
    }
  });
}

const btnSaveModal = document.getElementById('modal-save-btn');
if (btnSaveModal) {
  btnSaveModal.onclick = () => {
    if (!selectedTokenForMenu) return;
    selectedTokenForMenu.name = modalInputName.value.trim() || 'Token';
    selectedTokenForMenu.color = modalInputColor.value;
    selectedTokenForMenu.size = parseInt(modalInputSize.value) || 1;
    if (tempImageDataUrl !== selectedTokenForMenu.imageDataUrl) {
      selectedTokenForMenu.imageDataUrl = tempImageDataUrl;
      selectedTokenForMenu.imageObj = null;
    }
    syncGameState();
    render();
    closeTokenModal();
  };
}

const btnCtxOpenModal = document.getElementById('ctx-open-modal');
const btnModalClose = document.getElementById('modal-close-btn');
const btnCtxDelete = document.getElementById('ctx-delete');
if (btnCtxOpenModal) btnCtxOpenModal.onclick = openTokenModal;
if (btnModalClose) btnModalClose.onclick = closeTokenModal;
if (btnCtxDelete) {
  btnCtxDelete.onclick = () => {
    if (!selectedTokenForMenu) return;
    if (confirm(`Deseja excluir o token "${selectedTokenForMenu.name}"?`)) {
      gameState.tokens = gameState.tokens.filter(t => t.id !== selectedTokenForMenu.id);
      syncGameState();
      render();
    }
    hideContextMenu();
  };
}

document.addEventListener('click', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
});

if (wrapper) {
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    for (let i = gameState.tokens.length - 1; i >= 0; i--) {
      const t = gameState.tokens[i];
      if (Math.hypot(t.x - worldPos.x, t.y - worldPos.y) <= (t.size * gameState.cellSize) / 2) {
        showContextMenu(e.clientX, e.clientY, t);
        return;
      }
    }
    hideContextMenu();
  });
}

// ==========================================
// 8. EVENTOS DE INTERAÇÃO (MOUSE E TOUCH)
// ==========================================
if (wrapper) {
  // Touch
  wrapper.addEventListener('touchstart', (e) => {
    hideContextMenu();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const worldPos = screenToWorld(touch.clientX, touch.clientY);
      if (currentTool === 'select') {
        for (let i = gameState.tokens.length - 1; i >= 0; i--) {
          const t = gameState.tokens[i];
          if (Math.hypot(t.x - worldPos.x, t.y - worldPos.y) <= (t.size * gameState.cellSize) / 2) {
            draggedToken = t;
            pressTimer = setTimeout(() => {
              draggedToken = null;
              showContextMenu(touch.clientX, touch.clientY, t);
            }, 500);
            break;
          }
        }
        if (!draggedToken) {
          camera.isPanning = true;
          camera.startPanX = touch.clientX - camera.x;
          camera.startPanY = touch.clientY - camera.y;
        }
      } else if (currentTool === 'draw') {
        isDrawing = true;
        currentPath = [worldPos];
        gameState.drawings.push(currentPath);
      }
    } else if (e.touches.length === 2) {
      clearTimeout(pressTimer);
      camera.isPanning = false; draggedToken = null; isDrawing = false;
      initialPinchDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: false });

  wrapper.addEventListener('touchmove', (e) => {
    clearTimeout(pressTimer);
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const worldPos = screenToWorld(touch.clientX, touch.clientY);
      if (camera.isPanning) {
        camera.x = touch.clientX - camera.startPanX;
        camera.y = touch.clientY - camera.startPanY;
        render();
      } else if (draggedToken) {
        draggedToken.x = worldPos.x;
        draggedToken.y = worldPos.y;
        render();
      } else if (isDrawing && currentPath) {
        currentPath.push(worldPos);
        render();
      }
    } else if (e.touches.length === 2 && initialPinchDistance) {
      const currentDistance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      camera.zoom *= (currentDistance / initialPinchDistance) > 1 ? 1.03 : 0.97;
      initialPinchDistance = currentDistance;
      render();
    }
  }, { passive: false });

  wrapper.addEventListener('touchend', () => {
    clearTimeout(pressTimer);
    if (draggedToken) {
      draggedToken.x = snapToGrid(draggedToken.x, draggedToken.size);
      draggedToken.y = snapToGrid(draggedToken.y, draggedToken.size);
      draggedToken = null;
      syncGameState();
      render();
    }
    if (isDrawing) syncGameState();
    camera.isPanning = false; isDrawing = false; initialPinchDistance = null;
  });

  // Mouse
  wrapper.addEventListener('mousedown', (e) => {
    if (e.button !== 2) hideContextMenu();
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      camera.isPanning = true;
      camera.startPanX = e.clientX - camera.x;
      camera.startPanY = e.clientY - camera.y;
    } else if (e.button === 0) {
      if (currentTool === 'draw') {
        isDrawing = true;
        currentPath = [worldPos];
        gameState.drawings.push(currentPath);
      } else if (currentTool === 'select') {
        for (let i = gameState.tokens.length - 1; i >= 0; i--) {
          const t = gameState.tokens[i];
          if (Math.hypot(t.x - worldPos.x, t.y - worldPos.y) <= (t.size * gameState.cellSize) / 2) {
            draggedToken = t;
            break;
          }
        }
      }
    }
  });

  wrapper.addEventListener('mousemove', (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    if (camera.isPanning) {
      camera.x = e.clientX - camera.startPanX;
      camera.y = e.clientY - camera.startPanY;
      render();
    } else if (draggedToken) {
      draggedToken.x = worldPos.x;
      draggedToken.y = worldPos.y;
      render();
    } else if (isDrawing && currentPath) {
      currentPath.push(worldPos);
      render();
    }
  });

  wrapper.addEventListener('mouseup', () => {
    if (draggedToken) {
      draggedToken.x = snapToGrid(draggedToken.x, draggedToken.size);
      draggedToken.y = snapToGrid(draggedToken.y, draggedToken.size);
      draggedToken = null;
      syncGameState();
      render();
    }
    if (isDrawing) syncGameState();
    camera.isPanning = false; isDrawing = false;
  });

  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
    render();
  }, { passive: false });
}

// ==========================================
// 9. CONTROLES E FERRAMENTAS
// ==========================================
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
if (btnZoomIn) btnZoomIn.onclick = () => { camera.zoom *= 1.2; render(); };
if (btnZoomOut) btnZoomOut.onclick = () => { camera.zoom /= 1.2; render(); };
if (btnZoomReset) btnZoomReset.onclick = () => { camera.zoom = 1; camera.x = 0; camera.y = 0; render(); };

const toolSelect = document.getElementById('tool-select');
const toolDraw = document.getElementById('tool-draw');
if (toolSelect) {
  toolSelect.onclick = (e) => {
    currentTool = 'select';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  };
}
if (toolDraw) {
  toolDraw.onclick = (e) => {
    currentTool = 'draw';
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
  };
}

const btnClearDrawings = document.getElementById('btn-clear-drawings');
if (btnClearDrawings) {
  btnClearDrawings.onclick = () => {
    gameState.drawings = [];
    syncGameState();
    render();
  };
}

function loadBgImageFromUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    gameState.bgImage = img;
    gameState.bgImageDataUrl = dataUrl;
    render();
  };
  img.src = dataUrl;
}

const inputBgImage = document.getElementById('input-bg-image');
if (inputBgImage) {
  inputBgImage.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      loadBgImageFromUrl(event.target.result);
      syncGameState();
    };
    reader.readAsDataURL(file);
  });
}

const btnRemoveBg = document.getElementById('btn-remove-bg');
if (btnRemoveBg) {
  btnRemoveBg.onclick = () => {
    gameState.bgImage = null;
    gameState.bgImageDataUrl = null;
    if (inputBgImage) inputBgImage.value = '';
    syncGameState();
    render();
  };
}

const inputGridSize = document.getElementById('input-grid-size');
if (inputGridSize) {
  inputGridSize.addEventListener('change', (e) => {
    gameState.gridSize = parseInt(e.target.value) || 20;
    syncGameState();
    render();
  });
}

const btnAddToken = document.getElementById('btn-add-token');
if (btnAddToken) {
  btnAddToken.onclick = () => {
    const nameInput = document.getElementById('token-name');
    const name = nameInput.value.trim() || 'Token';
    const color = document.getElementById('token-color').value;
    const size = parseInt(document.getElementById('token-size').value) || 1;
    const imageInput = document.getElementById('token-image');
    const file = imageInput.files[0];

    const createToken = (dataUrl = null) => {
      const newToken = {
        id: Date.now(),
        name, color, size,
        imageDataUrl: dataUrl,
        imageObj: null,
        x: snapToGrid(gameState.cellSize, size),
        y: snapToGrid(gameState.cellSize, size)
      };
      gameState.tokens.push(newToken);
      nameInput.value = '';
      imageInput.value = '';
      syncGameState();
      render();
    };

    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => createToken(event.target.result);
      reader.readAsDataURL(file);
    } else {
      createToken(null);
    }
  };
}

document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.onclick = () => {
    const faces = parseInt(btn.dataset.dice);
    const result = Math.floor(Math.random() * faces) + 1;
    const log = document.getElementById('dice-log');
    if (log) {
      log.innerHTML = `<div>🎲 <strong>${currentUserName}</strong> rolou <strong>d${faces}</strong>: <strong>${result}</strong></div>` + log.innerHTML;
    }
  };
});
