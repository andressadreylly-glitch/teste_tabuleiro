<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Mini VTT Online Responsivo</title>
  <link rel="stylesheet" href="style.css">

  <!-- Firebase SDKs (v9 Compat) -->
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
</head>
<body class="dark-theme">

  <div id="app">
    <header class="top-bar">
      <div class="brand">🎲 Mini VTT</div>
      <div class="top-controls">
        <button id="btn-toggle-sidebar" class="mobile-only-btn" title="Menu">☰ Menu</button>
        <button id="btn-zoom-in" title="Aumentar Zoom">+</button>
        <button id="btn-zoom-reset" title="Resetar Zoom">100%</button>
        <button id="btn-zoom-out" title="Diminuir Zoom">-</button>
      </div>
    </header>

    <div class="main-container">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-header mobile-only">
          <h3>Menu do VTT</h3>
          <button id="btn-close-sidebar">✕</button>
        </div>

        <div class="tool-section">
          <h3>🌐 Multiplayer</h3>
          <label for="room-id">Código da Sala:</label>
          <input type="text" id="room-id" value="sala-1">
          <button id="btn-connect" class="secondary">Conectar</button>
          <span id="room-status" class="status-text">Status: Desconectado</span>
        </div>

        <div class="tool-section">
          <h3>Ferramentas</h3>
          <div class="btn-group">
            <button class="tool-btn active" id="tool-select">👆 Mover</button>
            <button class="tool-btn" id="tool-draw">✏️ Desenhar</button>
          </div>
          <button class="tool-btn secondary" id="btn-clear-drawings" style="margin-top: 5px;">🧹 Limpar Desenhos</button>
        </div>

        <div class="tool-section">
          <h3>Mapa & Grid</h3>
          <label for="input-bg-image">Imagem do Mapa:</label>
          <input type="file" id="input-bg-image" accept="image/*">
          <button class="secondary" id="btn-remove-bg" style="margin-top: 5px;">❌ Remover Imagem</button>

          <label for="input-grid-size" style="margin-top: 10px;">Grid (Células):</label>
          <input type="number" id="input-grid-size" value="20" min="5" max="100">
        </div>

        <div class="tool-section">
          <h3>Criar Token</h3>
          <input type="text" id="token-name" placeholder="Nome do Token">
          <div class="flex-row">
            <input type="color" id="token-color" value="#8257e5">
            <select id="token-size">
              <option value="1">1x1 (P/M)</option>
              <option value="2">2x2 (Grande)</option>
              <option value="3">3x3 (Enorme)</option>
            </select>
          </div>
          <label for="token-image" style="margin-top: 5px;">Imagem (Opcional):</label>
          <input type="file" id="token-image" accept="image/*">
          <button id="btn-add-token" style="margin-top: 8px;">+ Criar Token</button>
        </div>

        <div class="tool-section">
          <h3>🎲 Rolador de Dados</h3>
          <div class="dice-grid">
            <button class="dice-btn" data-dice="4">d4</button>
            <button class="dice-btn" data-dice="6">d6</button>
            <button class="dice-btn" data-dice="8">d8</button>
            <button class="dice-btn" data-dice="10">d10</button>
            <button class="dice-btn" data-dice="12">d12</button>
            <button class="dice-btn" data-dice="20">d20</button>
            <button class="dice-btn" data-dice="100">d100</button>
          </div>
          <div id="dice-log" class="dice-log">Histórico...</div>
        </div>
      </aside>

      <div class="sidebar-overlay" id="sidebar-overlay"></div>

      <main class="canvas-wrapper" id="canvas-wrapper">
        <canvas id="vtt-canvas"></canvas>
      </main>
    </div>
  </div>

  <script src="script.js" defer></script>
</body>
</html>
