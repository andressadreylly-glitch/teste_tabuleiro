// --- CONFIGURAÇÃO DO FIREBASE ---
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

// ESTADO DO JOGO
const gameState = {
  gridSize: 20,
  cellSize: 50,
  bgImage: null,
  bgImageDataUrl: null,
  tokens: [],
  drawings: []
};

// CÂMERA (PAN & ZOOM)
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

// VARIÁVEIS DO MENU CONTEXTUAL E PRESSIONAR E SEGURAR
let selectedTokenForMenu = null;
let pressTimer = null;
const contextMenu = document.getElementById('token-context-menu');
const ctxImageInput = document.getElementById('ctx-image-input');

const canvas = document.getElementById('vtt-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');

function resizeCanvas() {
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;
  render();
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

// --- CONTROLE DE SIDEBAR MOBILE ---
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const btnToggle = document.getElementById('btn-toggle-sidebar');
const btnClose = document.getElementById('btn-close-sidebar');

function toggleSidebar() {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('active');
}

if (btnToggle) btnToggle.addEventListener('click', toggleSidebar);
if (btnClose) btnClose.addEventListener('click', toggleSidebar);
if (overlay) overlay.addEventListener('click', toggleSidebar);

// --- CONEXÃO COM A SALA E GERENCIAMENTO DE USUÁRIOS ---
document.getElementById('btn-connect-room').onclick = () => {
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
  
  if (currentUserRef) {
    currentUserRef.remove();
  }

  currentRoomRef = database.ref('rooms/' + roomId);
  currentUserRef = currentRoomRef.child('users/' + currentUserId);

  currentUserRef.set({
    name: currentUserName,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  });

  currentUserRef.onDisconnect().remove();

  currentRoomRef.child('users').on('value', (snapshot) => {
    const users = snapshot.val() || {};
    updatePlayersList(users);
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

// --- RENDERIZAÇÃO ---
function render() {
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

// --- LÓGICA DO MENU CONTEXTUAL DE TOKENS ---
function showContextMenu(screenX, screenY, token) {
  selectedTokenForMenu = token;
  if (!contextMenu) return;
  contextMenu.style.left = `${screenX}px`;
  contextMenu.style.top = `${screenY}px`;
  contextMenu.style.display = 'block';
}

function hideContextMenu() {
  selectedTokenForMenu = null;
  if (contextMenu) contextMenu.style.display = 'none';
}

document.addEventListener('click', (e) => {
  if (contextMenu && !contextMenu.contains(e.target)) {
    hideContextMenu();
  }
});

// Ações do Menu Contextual
document.getElementById('ctx-edit-name')?.addEventListener('click', () => {
  if (!selectedTokenForMenu) return;
  const newName = prompt('Novo nome do token:', selectedTokenForMenu.name);
  if (newName !== null) {
    selectedTokenForMenu.name = newName.trim() || selectedTokenForMenu.name;
    syncGameState();
    render();
  }
  hideContextMenu();
});

document.getElementById('ctx-edit-color')?.addEventListener('click', () => {
  if (!selectedTokenForMenu) return;
  const newColor = prompt('Nova cor (hex ou nome em inglês):', selectedTokenForMenu.color);
  if (newColor !== null) {
    selectedTokenForMenu.color = newColor.trim() || selectedTokenForMenu.color;
    syncGameState();
    render();
  }
  hideContextMenu();
});

document.getElementById('ctx-edit-size')?.addEventListener('click', () => {
  if (!selectedTokenForMenu) return;
  const newSize = prompt('Novo tamanho em células (ex: 1, 2, 3):', selectedTokenForMenu.size);
  const parsedSize = parseInt(newSize);
  if (!isNaN(parsedSize) && parsedSize > 0) {
    selectedTokenForMenu.size = parsedSize;
    syncGameState();
    render();
  }
  hideContextMenu();
});

document.getElementById('ctx-edit-image')?.addEventListener('click', () => {
  if (!selectedTokenForMenu || !ctxImageInput) return;
  ctxImageInput.click();
});

ctxImageInput?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && selectedTokenForMenu) {
    const reader = new FileReader();
    reader.onload = (event) => {
      selectedTokenForMenu.imageDataUrl = event.target.result;
      selectedTokenForMenu.imageObj = null;
      syncGameState();
      render();
      hideContextMenu();
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('ctx-delete')?.addEventListener('click', () => {
  if (!selectedTokenForMenu) return;
  if (confirm(`Deseja excluir o token "${selectedTokenForMenu.name}"?`)) {
    gameState.tokens = gameState.tokens.filter(t => t.id !== selectedTokenForMenu.id);
    syncGameState();
    render();
  }
  hideContextMenu();
});

// Clique com botão direito (Desktop)
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

// --- EVENTOS TOUCH (CELULAR E TABLET) ---
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
          
          // Inicia o timer de Pressionar e Segurar (Long Press) no celular
          pressTimer = setTimeout(() => {
            draggedToken = null;
            showContextMenu(touch.clientX, touch.clientY, t);
          }, 600);

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
  clearTimeout(pressTimer); // Cancela o menu se arrastar o dedo

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

// --- EVENTOS DE MOUSE (DESKTOP) ---
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

// --- CONTROLES DE ZOOM E FERRAMENTAS ---
document.getElementById('btn-zoom-in').onclick = () => { camera.zoom *= 1.2; render(); };
document.getElementById('btn-zoom-out').onclick = () => { camera.zoom /= 1.2; render(); };
document.getElementById('btn-zoom-reset').onclick = () => { camera.zoom = 1; camera.x = 0; camera.y = 0; render(); };

document.getElementById('tool-select').onclick = (e) => {
  currentTool = 'select';
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
};

document.getElementById('tool-draw').onclick = (e) => {
  currentTool = 'draw';
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
};

document.getElementById('btn-clear-drawings').onclick = () => {
  gameState.drawings = [];
  syncGameState();
  render();
};

// --- CARREGAMENTO DO MAPA DE FUNDO ---
function loadBgImageFromUrl(dataUrl) {
  const img = new Image();
  img.onload = () => {
    gameState.bgImage = img;
    gameState.bgImageDataUrl = dataUrl;
    render();
  };
  img.src = dataUrl;
}

document.getElementById('input-bg-image').addEventListener('change', (e) => {
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

document.getElementById('btn-remove-bg').onclick = () => {
  gameState.bgImage = null;
  gameState.bgImageDataUrl = null;
  document.getElementById('input-bg-image').value = '';
  syncGameState();
  render();
};

document.getElementById('input-grid-size').addEventListener('change', (e) => {
  gameState.gridSize = parseInt(e.target.value) || 20;
  syncGameState();
  render();
});

// --- CRIAÇÃO DE TOKEN COM IMAGEM ---
document.getElementById('btn-add-token').onclick = () => {
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

// --- ROLADOR DE DADOS ---
document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.onclick = () => {
    const faces = parseInt(btn.dataset.dice);
    const result = Math.floor(Math.random() * faces) + 1;
    const log = document.getElementById('dice-log');
    
    // Exibe o nome do jogador, o tipo do dado e o resultado obtido
    log.innerHTML = `<div>🎲 <strong>${currentUserName}</strong> rolou <strong>d${faces}</strong>: <strong>${result}</strong></div>` + log.innerHTML;
  };
});

// Inicialização
resizeCanvas();
