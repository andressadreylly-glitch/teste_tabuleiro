
const firebaseConfig = {
  apiKey: "AIzaSyACbYF5Zh9I6MbKIogDub7poH-6plQNIlc",
  authDomain: "tabuleiro1-25eeb.firebaseapp.com",
  projectId: "tabuleiro1-25eeb",
  storageBucket: "tabuleiro1-25eeb.firebasestorage.app",
  messagingSenderId: "1054841082588",
  appId: "1:1054841082588:web:78f999d0c9f9822b0f5a19",
  measurementId: "G-WJKL8TLRMR"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

let currentRoomRef = null;
let isRemoteUpdate = false; // Evita loops infinitos de re-sincronização

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

// --- INTEGRAÇÃO COM FIREBASE ---

function syncToFirebase() {
  if (!currentRoomRef || isRemoteUpdate) return;

  // Monta objeto serializável
  const dataToSave = {
    gridSize: gameState.gridSize,
    bgImageDataUrl: gameState.bgImageDataUrl || null,
    drawings: gameState.drawings,
    tokens: gameState.tokens.map(t => ({
      id: t.id,
      name: t.name,
      color: t.color,
      size: t.size,
      x: t.x,
      y: t.y,
      imageDataUrl: t.imageDataUrl || null
    }))
  };

  currentRoomRef.set(dataToSave);
}

function connectToRoom(roomId) {
  if (currentRoomRef) {
    currentRoomRef.off(); // Remove ouvintes anteriores
  }

  currentRoomRef = database.ref('rooms/' + roomId);
  document.getElementById('room-status').innerText = `Status: Conectado (${roomId})`;

  currentRoomRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    isRemoteUpdate = true;

    gameState.gridSize = data.gridSize || 20;
    inputGridSize.value = gameState.gridSize;
    gameState.drawings = data.drawings || [];

    // Carregar Imagem do Mapa se mudou
    if (data.bgImageDataUrl !== gameState.bgImageDataUrl) {
      gameState.bgImageDataUrl = data.bgImageDataUrl;
      if (gameState.bgImageDataUrl) {
        const img = new Image();
        img.onload = () => { gameState.bgImage = img; render(); };
        img.src = gameState.bgImageDataUrl;
      } else {
        gameState.bgImage = null;
      }
    }

    // Carregar Tokens
    const remoteTokens = data.tokens || [];
    gameState.tokens = remoteTokens.map(rt => {
      let imageObj = null;
      if (rt.imageDataUrl) {
        imageObj = new Image();
        imageObj.src = rt.imageDataUrl;
      }
      return { ...rt, imageObj };
    });

    render();
    isRemoteUpdate = false;
  });
}

document.getElementById('btn-connect').addEventListener('click', () => {
  const roomId = document.getElementById('room-id').value.trim() || 'default-room';
  connectToRoom(roomId);
});

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

// --- MANIPULAÇÃO DE EVENTOS ---

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
        syncToFirebase();
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
  syncToFirebase();
});

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
    syncToFirebase();
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

// Rolador de Dados com Sincronismo do Chat
document.querySelectorAll('.dice-btn').forEach(button => {
  button.addEventListener('click', (e) => {
    const sides = parseInt(e.target.dataset.dice);
    const result = Math.floor(Math.random() * sides) + 1;
    
    if (currentRoomRef) {
      database.ref('rooms/' + document.getElementById('room-id').value + '/rolls').push({
        dice: sides,
        result: result,
        timestamp: Date.now()
      });
    } else {
      addDiceLogEntry(sides, result);
    }
  });
});

function addDiceLogEntry(sides, result) {
  const diceLog = document.getElementById('dice-log');
  const entry = document.createElement('div');
  entry.innerHTML = `<strong>d${sides}:</strong> tirou <b style="color: #8257e5;">${result}</b>`;
  diceLog.prepend(entry);
}

// Ouvir rolagens de dados remotas no Firebase
function listenToDiceRolls(roomId) {
  database.ref('rooms/' + roomId + '/rolls').limitToLast(10).on('child_added', (snapshot) => {
    const roll = snapshot.val();
    if (roll) {
      addDiceLogEntry(roll.dice, roll.result);
    }
  });
}

wrapper.addEventListener('contextmenu', (e) => e.preventDefault());

inputGridSize.addEventListener('change', (e) => {
  gameState.gridSize = Math.max(1, parseInt(e.target.value) || 20);
  render();
  syncToFirebase();
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
  syncToFirebase();
});

document.getElementById('btn-zoom-in').addEventListener('click', () => { camera.zoom *= 1.2; render(); });
document.getElementById('btn-zoom-out').addEventListener('click', () => { camera.zoom /= 1.2; render(); });
document.getElementById('btn-zoom-reset').addEventListener('click', () => { camera.zoom = 1; camera.x = 0; camera.y = 0; render(); });

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
    syncToFirebase();
  }
  
  if (isDrawing) {
    syncToFirebase();
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

// Conecta automaticamente à sala padrão inicial
connectToRoom('sala-1');
listenToDiceRolls('sala-1');
resizeCanvas();
