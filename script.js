// ==========================================
// 1. CONFIGURAÇÃO DO FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "SEU_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
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

// VARIÁVEIS DE REDE E SALA
let currentRoomRef = null;
let currentUserRef = null;
let currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let currentUserName = 'Jogador';

// ==========================================
// 2. ESTADO DO JOGO E CÂMERA
// ==========================================
const gameState = {
  gridSize: 20,
  cellSize: 50,
  bgImage: null,
  bgImageDataUrl: null,
  tokens: [],
  drawings: []
};

const camera = {
  x: 0,
  y: 0,
  zoom: 1,
  isPanning: false,
  startPanX: 0,
  startPanY: 0
};

let currentTool = 'select';
let isDrawing = false;
let currentPath = null;
let draggedToken = null;
let initialPinchDistance = null;

// VARIÁVEIS DE MODAL E MENU CONTEXTUAL
let selectedTokenForMenu = null;
let pressTimer = null;
let tempImageDataUrl = null;

// ELEMENTOS DA INTERFACE
const canvas = document.getElementById('vtt-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');

const contextMenu = document.getElementById('token-context-menu');
const modalOverlay = document.getElementById('token-modal-overlay');

const modalInputName = document.getElementById('modal-input-name');
const modalInputColor = document.getElementById('modal-input-color');
const modalInputSize = document.getElementById('modal-input-size');
const modalInputImage = document.getElementById('modal-input-image');
const modalPreview = document.getElementById('modal-token-preview');
const modalPreviewName = document.getElementById('modal-preview-name');

// ==========================================
// 3. AUXILIARES DE CANVAS E CÁLCULOS
// ==========================================
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
  const x = (screenX - rect.left - camera.x) / camera.zoom;
  const y = (screenY - rect.top - camera.y) / camera.zoom;
  return { x, y };
}

function snapToGrid(coord, sizeInCells = 1) {
  const cellCenterOffset = (sizeInCells * gameState.cellSize) / 2;
  return Math.floor(coord / gameState.cellSize) * gameState.cellSize + cellCenterOffset;
}

// ==========================================
// 4. SIDEBAR MOBILE
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

// ==========================================
// 5. CONEXÃO E SINCRONIZAÇÃO EM TEMPO REAL
// ==========================================
const btnConnect = document.getElementById('btn-connect-room');
if (btnConnect) {
  btnConnect.onclick = () => {
    if (!database) {
      alert("Firebase não está configurado!");
      return;
    }

    const usernameInput = document.getElementById('input-username');
    const roomInput = document.getElementById('input-room-id');

    const name = usernameInput.value.trim();
    const roomId = roomInput.value.trim();

    if (!name || !roomId) {
      alert("Por favor, preencha seu Nome e o Código da Sala.");
      return;
    }

    currentUserName = name;
    
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

    alert(`Conectado à sala "${roomId}" como "${currentUserName}"!`);
  };
}

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
        id: t.id,
        name: t.name,
        color: t.color,
        size: t.size,
        imageDataUrl: t.imageDataUrl || null,
        x: t.x,
        y: t.y
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

  const mouseX = Math.min(screenX, window.innerWidth - 170);
  const mouseY = Math.min(screenY, window.innerHeight - 100);

  contextMenu.style.left = `${mouseX}px`;
  contextMenu.style.top = `${mouseY}px`;
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

// Eventos de pré-visualização do Modal
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

// Salvar dados editados no Modal
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

// Eventos dos botões do Menu Contextual e Fechar
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
  if (contextMenu && !contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// Clique com botão direito no Canvas
if (wrapper) {
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const worldPos = screenToWorld(e.clientX, e.clientY);

    for (let i = gameState.tokens.length - 1; i >= 0; i--) {
      const t = gameState.tokens[i];
      const radius = (t.size * gameState.cellSize) / 2;
      if (Math.hypot(t.x - worldPos.x, t.y - worldPos.y) <= radius) {
        showContextMenu(e.clientX, e.clientY, t);
        return;
      }
    }
    hideContextMenu();
  });
}

// ==========================================
// 8. EVENTOS DE TOQUE (TOUCH/MOBILE)
// ==========================================
if (wrapper) {
  wrapper.addEventListener('touchstart', (e) => {
    hideContextMenu();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const worldPos = screenToWorld(touch.clientX, touch.clientY);

      if (currentTool === 'select') {
        for (let i = gameState.tokens.length - 1; i >= 0; i--) {
          const t = gameState.tokens[i];
          const radius = (t.size * gameState.cellSize) / 2;
          if (Math.hypot(t.x - worldPos.x, t.y - worldPos.y) <= radius) {
            draggedToken = t;
            
            // Pressionar e segurar por 500ms abre o menu de edição
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
      camera.isPanning = false;
      draggedToken = null;
      isDrawing = false;
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
      const zoomFactor = currentDistance / initialPinchDistance;
      camera.zoom *= zoomFactor > 1 ? 1.03 : 0.97;
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
    if (isDrawing) {
      syncGameState();
    }
    camera.isPanning = false;
    isDrawing = false;
    initialPinchDistance = null;
  });
}

// ==========================================
// 9. EVENTOS DE MOUSE (DESKTOP)
// ==========================================
if (wrapper) {
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
    if (isDrawing) {
      syncGameState();
    }
    camera.isPanning = false;
    isDrawing = false;
  });

  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
    render();
  }, { passive: false });
}

// ==========================================
// 10. CONTROLES DE INTERFACE E CRIAÇÃO
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

// Carregamento do Mapa de Fundo
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
      const dataUrl = event.target.result;
      loadBgImageFromUrl(dataUrl);
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

// Criar novo token
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
        name: name,
        color: color,
        size: size,
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
      reader.onload = (event) => {
        createToken(event.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      createToken(null);
    }
  };
}

// Rolador de Dados
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

// Inicialização
resizeCanvas();
