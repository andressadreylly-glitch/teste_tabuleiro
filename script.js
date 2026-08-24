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

let currentRoomRef = null;

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

// --- RENDERIZAÇÃO ---
function render() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.translate(camera.x, camera.y);
  ctx.scale(camera.zoom, camera.zoom);

  // 1. Desenhar Mapa
  drawMapBackground();

  // 2. Desenhar Grid
  drawGrid();

  // 3. Desenhar Desenhos Livres
  drawDrawings();

  // 4. Desenhar Tokens
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

// --- EVENTOS TOUCH (CELULAR E TABLET) ---
wrapper.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    const worldPos = screenToWorld(touch.clientX, touch.clientY);

    if (currentTool === 'select') {
      for (let i = gameState.tokens.length - 1; i >= 0; i--) {
        const t = gameState.tokens[i];
        const radius = (t.size * gameState.cellSize) / 2;
        if (Math.hypot(t.x - worldPos.x, t.y - worldPos.y) <= radius) {
          draggedToken = t;
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
  if (draggedToken) {
    draggedToken.x = snapToGrid(draggedToken.x, draggedToken.size);
    draggedToken.y = snapToGrid(draggedToken.y, draggedToken.size);
    draggedToken = null;
    render();
  }
  camera.isPanning = false;
  isDrawing = false;
  initialPinchDistance = null;
});

// --- EVENTOS DE MOUSE (DESKTOP) ---
wrapper.addEventListener('mousedown', (e) => {
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
    render();
  }
  camera.isPanning = false;
  isDrawing = false;
});

wrapper.addEventListener('wheel', (e) => {
  e.preventDefault();
  camera.zoom *= e.deltaY < 0 ? 1.1 : 0.9;
  render();
}, { passive: false });

// --- FERRAMENTAS E CONTROLES DE ZOOM ---
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
  render();
};

// --- CARREGAMENTO DO MAPA DE FUNDO ---
document.getElementById('input-bg-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const dataUrl = event.target.result;
    const img = new Image();
    
    img.onload = () => {
      gameState.bgImage = img;
      gameState.bgImageDataUrl = dataUrl;
      render();
    };
    
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-remove-bg').onclick = () => {
  gameState.bgImage = null;
  gameState.bgImageDataUrl = null;
  document.getElementById('input-bg-image').value = '';
  render();
};

document.getElementById('input-grid-size').addEventListener('change', (e) => {
  gameState.gridSize = parseInt(e.target.value) || 20;
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
    log.innerHTML = `<div>🎲 d${faces}: <strong>${result}</strong></div>` + log.innerHTML;
  };
});

// Inicialização
resizeCanvas();
