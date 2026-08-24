// --- FIREBASE CONFIG ---
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
  } catch(e) {}
}

let currentRoomRef = null;
let isRemoteUpdate = false;

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

btnToggle.addEventListener('click', toggleSidebar);
if (btnClose) btnClose.addEventListener('click', toggleSidebar);
overlay.addEventListener('click', toggleSidebar);


// --- RENDERIZAÇÃO DOS TOKENS (Corrigido para PC e Celular) ---
function drawTokens() {
  gameState.tokens.forEach(token => {
    const radius = (token.size * gameState.cellSize) / 2 - 2;
    ctx.save();

    // Se o token tem uma imagem em formato DataURL (Base64)
    if (token.imageDataUrl) {
      // Se o objeto de imagem ainda não existe na memória, cria um novo
      if (!token.imageObj) {
        token.imageObj = new Image();
        token.imageObj.onload = () => render(); // Redesenha assim que carregar no PC
        token.imageObj.src = token.imageDataUrl;
      }

      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.clip();
      
      // Desenha a imagem cortada em círculo
      if (token.imageObj.complete && token.imageObj.naturalWidth !== 0) {
        ctx.drawImage(token.imageObj, token.x - radius, token.y - radius, radius * 2, radius * 2);
      }
      ctx.restore();

      // Desenha a borda colorida por cima
      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = token.color;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else {
      // Sem imagem: desenha círculo com a cor selecionada
      ctx.beginPath();
      ctx.arc(token.x, token.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = token.color;
      ctx.fill();
      ctx.restore();
    }

    // Nome do Token
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.fillText(token.name, token.x, token.y - radius - 6);
  });
}

// --- CARREGAMENTO DO MAPA DE FUNDO (PC e Celular) ---
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
      render(); // Redesenha a tela no PC e Mobile
    };
    
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
});

// --- CRIAÇÃO DE TOKEN COM IMAGEM (PC e Celular) ---
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
      imageDataUrl: dataUrl, // Salva o texto Base64
      imageObj: null,        // Será gerado automaticamente pelo drawTokens()
      x: snapToGrid(gameState.cellSize, size),
      y: snapToGrid(gameState.cellSize, size)
    };

    gameState.tokens.push(newToken);
    
    // Limpa os campos do menu
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
