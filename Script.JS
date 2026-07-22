// --- CONFIGURAÇÃO DO FIREBASE ---
// Copie estas chaves do seu Firebase Console (ou deixe como está para testar localmente)
const firebaseConfig = {
  apiKey: "SEU_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Inicializa o Firebase se a biblioteca estiver carregada no HTML
let database = null;
if (typeof firebase !== 'undefined') {
  try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
  } catch (e) {
    console.warn("Firebase não inicializado ou chaves pendentes. Rodando em modo local.");
  }
}

let currentRoomRef = null;
let isRemoteUpdate = false;

// Estado do Tabuleiro
const gameState = {
  gridSize: 20,
  cellSize: 50,
  bgImage: null,
  bgImageDataUrl: null,
  tokens: [],
  drawings: []
};

// Câmera (Pan & Zoom)
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

const canvas = document.getElementById('vtt-canvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');
const inputGridSize = document.getElementById('input-grid-size');

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
  const gridCell = Math.floor(coord / gameState.cellSize);
  return gridCell * gameState.cellSize + cellCenterOffset;
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
    const width = gameState.gridSize * gameState.cellSize;
    const height = gameState.gridSize * gameState.cellSize;
    ctx.drawImage(gameState.bgImage, 0, 0, width, height);
  }
}

function drawGrid() {
  const size = gameState.gridSize * gameState.cellSize;
  ctx.strokeStyle = gameState.bgImage ? 'rgba(255, 255, 255, 0.25)' : '#2a2a30';
  ctx.lineWidth = 1;

  for (let i = 0; i <= gameState.gridSize; i++) {
    const pos = i * gameState.cellSize;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }
}

function drawDrawings() {
  gameState.drawings.forEach(path => {
    if (path.length < 2) return;
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 3 / camera.zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.stroke();
  });
}

function drawTokens() {
  gameState.tokens.forEach(token => {
    const radius = (token.size * gameState.cellSize) / 2 - 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
    ctx.closePath();

    if (token.imageObj) {
      ctx.clip();
      ctx.drawImage(token.imageObj, token.x - radius, token.y - radius, radius * 2, radius * 2);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = token.color;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      ctx.fillStyle = token.color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
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

// --- EVENTOS DE INTERAÇÃO E BOTÕES ---

// Adicionar Token
document.getElementById('btn-add-token').addEventListener('click', () => {
  const name = document.getElementById('token-name').value.trim() || 'Heroi ' + (gameState.tokens.length + 1);
  const color = document.getElementById('token-color').value;
  const size = parseInt(document.getElementById('token-size').value) || 1;
  const imageInput = document.getElementById('token-image');

  const createTokenObject = (dataUrl = null, imgObj = null) => {
    const token = {
      id: Date.now(),
      name: name,
      color: color,
      size: size,
      x: snapToGrid(gameState.cellSize, size),
      y: snapToGrid(gameState.cellSize, size),
      imageDataUrl: dataUrl,
      imageObj: imgObj
    };
    gameState.tokens.push(token);
    render();
  };

  if (imageInput.files && imageInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => createTokenObject(dataUrl, img);
      img.src = dataUrl;
    };
    reader.readAsDataURL(imageInput.files[0]);
  } else {
    createTokenObject(null, null);
  }
});

// Fundo Personalizado
document.getElementById('input-bg-image').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      gameState.bgImageDataUrl = event.target.result;
      const img = new Image();
      img.onload = () => {
        gameState.bgImage = img;
        render();
      };
      img.src = gameState.bgImageDataUrl;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('btn-remove-bg').addEventListener('click', () => {
  gameState.bgImage = null;
  gameState.bgImageDataUrl = null;
  document.getElementById('input-bg-image').value = '';
  render();
});

// Rolador de Dados
document.querySelectorAll('.dice-btn').forEach(button => {
  button.addEventListener('click', (e) => {
    const sides = parseInt(e.target.dataset.dice);
    const result = Math.floor(Math.random() * sides) + 1;
    
    const diceLog = document.getElementById('dice-log');
    const entry = document.createElement('div');
    entry.innerHTML = `<strong>d${sides}:</strong> tirou <b style="color: #8257e5;">${result}</b>`;
    diceLog.prepend(entry);
  });
});

// Ferramentas e Configurações
wrapper.addEventListener('contextmenu', (e) => e.preventDefault());

inputGridSize.addEventListener('change', (e) => {
  gameState.gridSize = Math.max(1, parseInt(e.target.value) || 20);
  render();
});

document.getElementById('tool-select').addEventListener('click', (e) => {
  currentTool = 'select';
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  e.currentTarget.classList.add('active');
});

document.getElementById('tool-draw').addEventListener('click', (e) => {
  currentTool = 'draw';
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  e.currentTarget.classList.add('active');
});

document.getElementById('btn-clear-drawings').addEventListener('click', () => {
  gameState.drawings = [];
  render();
});

document.getElementById('btn-zoom-in').addEventListener('click', () => { camera.zoom *= 1.2; render(); });
document.getElementById('btn-zoom-out').addEventListener('click', () => { camera.zoom /= 1.2; render(); });
document.getElementById('btn-zoom-reset').addEventListener('click', () => { camera.zoom = 1; camera.x = 0; camera.y = 0; render(); });

// Eventos do Mouse no Canvas
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
        const radius = (t.size * gameState.cellSize) / 2;
        const dist = Math.hypot(t.x - worldPos.x, t.y - worldPos.y);
        if (dist <= radius) {
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
  } else if (isDrawing && currentPath) {
    currentPath.push(worldPos);
    render();
  } else if (draggedToken) {
    draggedToken.x = worldPos.x;
    draggedToken.y = worldPos.y;
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
  currentPath = null;
});

wrapper.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomFactor = 1.1;
  if (e.deltaY < 0) camera.zoom *= zoomFactor;
  else camera.zoom /= zoomFactor;
  render();
}, { passive: false });

// Inicialização Inicial
resizeCanvas();
