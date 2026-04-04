/* ============================================================
   games.js – Minijogos: Jogo da Velha, Tetris, Campo Minado
   ============================================================ */

"use strict";

const Games = (() => {

  // Renderiza os três jogos simultaneamente nos seus containers dedicados
  function renderAll() {
    const areaTetris     = document.getElementById("game-area-tetris");
    const areaMinesweeper = document.getElementById("game-area-minesweeper");
    const areaTtt        = document.getElementById("game-area-ttt");

    if (areaTetris)      tetris.render(areaTetris);
    if (areaMinesweeper) minesweeper.render(areaMinesweeper);
    if (areaTtt)         ttt.render(areaTtt);
  }

  // Mantida por compatibilidade com main.js (chamada em switchTab)
  function selectGame(name) {
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // Nada a fazer aqui — renderAll é chamado via selectGame no main.js
  });

  // ──────────────────────────────────────────────────────────
  // JOGO DA VELHA
  // ──────────────────────────────────────────────────────────
  const ttt = (() => {
    let mode = "bot";       // "bot" | "online"
    let board = Array(9).fill(null);
    let playerSymbol = "X";
    let botSymbol = "O";
    let gameOver = false;
    let currentTurn = "X";
    let onlineData = {};    // dados do jogo online

    const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

    function checkWinner(b) {
      for (const [a,c,d] of WINS) {
        if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
      }
      return null;
    }
    function isDraw(b) { return !b.includes(null); }

    function render(area) {
      area.innerHTML = `
        <div class="ttt-mode-row">
          <button class="game-select-btn ${mode==='bot'?'active':''}" id="ttt-mode-bot">🤖 Contra Bot</button>
          <button class="game-select-btn ${mode==='online'?'active':''}" id="ttt-mode-online">🌐 Online</button>
        </div>
        <div class="ttt-status" id="ttt-status">Sua vez!</div>
        <div class="ttt-board" id="ttt-board">
          ${Array(9).fill(0).map((_,i) => `<div class="ttt-cell" data-index="${i}"></div>`).join('')}
        </div>
        <div style="text-align:center;display:flex;gap:8px;justify-content:center;">
          <button class="btn btn-ghost btn-sm" id="ttt-reset-btn">Reiniciar</button>
          ${mode==='online' ? '<button class="btn btn-primary btn-sm" id="ttt-challenge-btn">Desafiar</button>' : ''}
        </div>
      `;

      resetLocal();

      document.getElementById("ttt-mode-bot").addEventListener("click", () => setMode("bot", area));
      document.getElementById("ttt-mode-online").addEventListener("click", () => setMode("online", area));
      document.getElementById("ttt-reset-btn").addEventListener("click", () => resetLocal());
      document.getElementById("ttt-board").addEventListener("click", (e) => {
        const cell = e.target.closest(".ttt-cell");
        if (!cell) return;
        onCellClick(parseInt(cell.dataset.index));
      });
      if (mode === "online") {
        document.getElementById("ttt-challenge-btn")?.addEventListener("click", sendChallenge);
      }
    }

    function setMode(m, area) {
      mode = m;
      render(area);
    }

    function resetLocal() {
      board = Array(9).fill(null);
      gameOver = false;
      currentTurn = "X";
      playerSymbol = "X";
      renderBoard();
      setStatus(mode === "bot" ? "Sua vez! (X)" : "Aguardando jogo online...");
    }

    function renderBoard(winCells=[]) {
      const cells = document.querySelectorAll(".ttt-cell");
      cells.forEach((cell, i) => {
        cell.textContent = board[i] || "";
        cell.className = "ttt-cell";
        if (board[i]) cell.classList.add("taken", board[i]);
        if (winCells.includes(i)) cell.classList.add("win");
      });
    }

    function setStatus(msg) {
      const el = document.getElementById("ttt-status");
      if (el) el.textContent = msg;
    }

    function onCellClick(index) {
      if (gameOver || board[index]) return;

      if (mode === "bot") {
        if (currentTurn !== playerSymbol) return;
        board[index] = playerSymbol;
        currentTurn = botSymbol;
        renderBoard();
        const winner = checkWinner(board);
        if (winner || isDraw(board)) { endLocal(winner); return; }
        setStatus("Bot pensando...");
        setTimeout(() => {
          const move = getBotMove(board, botSymbol, playerSymbol);
          board[move] = botSymbol;
          currentTurn = playerSymbol;
          renderBoard();
          const w = checkWinner(board);
          if (w || isDraw(board)) endLocal(w);
          else setStatus("Sua vez! (X)");
        }, 350);
      } else {
        // Online: emite para o servidor
        if (App.socket) App.socket.emit("ttt_move", { index });
      }
    }

    function endLocal(winner) {
      gameOver = true;
      let winCells = [];
      if (winner) {
        for (const [a,b,c] of WINS) {
          if (board[a] === winner && board[b] === winner && board[c] === winner) {
            winCells = [a,b,c]; break;
          }
        }
        renderBoard(winCells);
        if (mode === "bot") {
          setStatus(winner === playerSymbol ? "🎉 Você venceu!" : "🤖 Bot venceu!");
        } else {
          const name = onlineData[winner] || winner;
          setStatus(`🏆 ${name} venceu!`);
        }
      } else {
        renderBoard();
        setStatus("🤝 Empate!");
      }
    }

    // ── Bot IA – minimax ──
    function getBotMove(b, bot, player) {
      let best = -Infinity, move = -1;
      for (let i = 0; i < 9; i++) {
        if (!b[i]) {
          b[i] = bot;
          const score = minimax(b, 0, false, bot, player);
          b[i] = null;
          if (score > best) { best = score; move = i; }
        }
      }
      return move;
    }
    function minimax(b, depth, isMax, bot, player) {
      const w = checkWinner(b);
      if (w === bot) return 10 - depth;
      if (w === player) return depth - 10;
      if (isDraw(b)) return 0;
      let best = isMax ? -Infinity : Infinity;
      for (let i = 0; i < 9; i++) {
        if (!b[i]) {
          b[i] = isMax ? bot : player;
          const score = minimax(b, depth+1, !isMax, bot, player);
          b[i] = null;
          best = isMax ? Math.max(best, score) : Math.min(best, score);
        }
      }
      return best;
    }

    // ── Online ──
    function sendChallenge() {
      if (!App.socket) return;
      App.socket.emit("ttt_challenge");
      setStatus("Desafio enviado, aguardando...");
    }

    function onChallenged(data) {
      document.getElementById("ttt-challenge-text").textContent =
        `${data.from} quer jogar Jogo da Velha com você!`;
      document.getElementById("ttt-challenge-modal").classList.remove("hidden");
    }

    function onDeclined(data) {
      setStatus(`${data.by} recusou o desafio.`);
    }

    function onStart(data) {
      board = Array(9).fill(null);
      gameOver = false;
      onlineData = { X: data.X, O: data.O };
      // Determina símbolo do jogador local
      playerSymbol = data.X === App.username ? "X" : "O";
      renderBoard();
      setStatus(data.current_turn === playerSymbol ? "Sua vez!" : `Vez de ${onlineData[data.current_turn]}`);
    }

    function onUpdate(data) {
      board = data.board;
      renderBoard();
      if (data.winner || data.draw) {
        endLocal(data.winner);
      } else {
        const myTurn = data.current_turn === playerSymbol;
        setStatus(myTurn ? "Sua vez!" : `Vez de ${onlineData[data.current_turn] || data.current_turn}`);
      }
    }

    function onReset(data) {
      gameOver = true;
      setStatus(data?.reason || "Jogo encerrado.");
    }

    return { render, onChallenged, onDeclined, onStart, onUpdate, onReset };
  })();

  // ──────────────────────────────────────────────────────────
  // TETRIS
  // ──────────────────────────────────────────────────────────
  const tetris = (() => {
    const COLS = 10, ROWS = 20, SIZE = 24;
    const COLORS = ["#3d78e8","#f59e0b","#22c55e","#ef4444","#a855f7","#06b6d4","#f43f5e"];
    const PIECES = [
      [[1,1,1,1]],
      [[1,1],[1,1]],
      [[0,1,0],[1,1,1]],
      [[1,0,0],[1,1,1]],
      [[0,0,1],[1,1,1]],
      [[0,1,1],[1,1,0]],
      [[1,1,0],[0,1,1]],
    ];

    let canvas, ctx, grid, current, score, gameLoop, running;

    function newGrid() { return Array.from({length:ROWS},()=>Array(COLS).fill(0)); }

    function newPiece() {
      const idx = Math.floor(Math.random() * PIECES.length);
      const shape = PIECES[idx].map(r=>[...r]);
      return { shape, color: COLORS[idx], x: Math.floor((COLS-shape[0].length)/2), y: 0 };
    }

    function valid(p, g, dx=0, dy=0, s=p.shape) {
      return s.every((row,r) =>
        row.every((v,c) => {
          if (!v) return true;
          const nx=p.x+c+dx, ny=p.y+r+dy;
          return nx>=0 && nx<COLS && ny<ROWS && !g[ny]?.[nx];
        })
      );
    }

    function place(p, g) {
      p.shape.forEach((row,r) => row.forEach((v,c) => {
        if (v) g[p.y+r][p.x+c] = p.color;
      }));
    }

    function clearLines(g) {
      let cleared = 0;
      for (let r=ROWS-1; r>=0; r--) {
        if (g[r].every(v=>v)) { g.splice(r,1); g.unshift(Array(COLS).fill(0)); cleared++; r++; }
      }
      return cleared;
    }

    function rotate(shape) {
      return shape[0].map((_,i)=>shape.map(r=>r[i]).reverse());
    }

    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      grid.forEach((row,r) => row.forEach((v,c) => {
        if (v) { ctx.fillStyle=v; ctx.fillRect(c*SIZE,r*SIZE,SIZE-1,SIZE-1); }
      }));
      if (current) {
        ctx.fillStyle = current.color;
        current.shape.forEach((row,r) => row.forEach((v,c) => {
          if (v) ctx.fillRect((current.x+c)*SIZE,(current.y+r)*SIZE,SIZE-1,SIZE-1);
        }));
      }
    }

    function tick() {
      if (!running) return;
      if (valid(current, grid, 0, 1)) {
        current.y++;
      } else {
        place(current, grid);
        const lines = clearLines(grid);
        score += [0,100,300,500,800][lines] || 0;
        document.getElementById("tetris-score-val").textContent = score;
        current = newPiece();
        if (!valid(current, grid)) { endGame(); return; }
      }
      draw();
    }

    function endGame() {
      running = false;
      clearInterval(gameLoop);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle="#fff"; ctx.font="bold 20px Outfit,sans-serif";
      ctx.textAlign="center";
      ctx.fillText("Game Over!", canvas.width/2, canvas.height/2);
      ctx.font="14px Outfit,sans-serif";
      ctx.fillText(`Score: ${score}`, canvas.width/2, canvas.height/2+28);
    }

    function startGame() {
      grid = newGrid(); score = 0; running = true;
      current = newPiece();
      document.getElementById("tetris-score-val").textContent = "0";
      clearInterval(gameLoop);
      gameLoop = setInterval(tick, 500);
    }

    function handleKey(e) {
      // Só intercepta setas e espaço quando o Tetris está ativo
      const tetrisKeys = ["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "];
      if (!running && !tetrisKeys.includes(e.key)) return;
      if (!tetrisKeys.includes(e.key)) return;

      // Bloqueia o scroll da página nas setas e no espaço
      e.preventDefault();

      if (!running || !current) return;
      if (e.key === "ArrowLeft"  && valid(current,grid,-1,0)) { current.x--; draw(); }
      if (e.key === "ArrowRight" && valid(current,grid, 1,0)) { current.x++; draw(); }
      if (e.key === "ArrowDown"  && valid(current,grid, 0,1)) { current.y++; draw(); }
      if (e.key === "ArrowUp") {
        const rot = rotate(current.shape);
        if (valid(current,grid,0,0,rot)) { current.shape=rot; draw(); }
      }
      if (e.key === " ") {
        while (valid(current,grid,0,1)) current.y++;
        tick();
      }
    }

    function render(area) {
      area.innerHTML = `
        <div style="text-align:center;">
          <canvas id="tetris-canvas" width="${COLS*SIZE}" height="${ROWS*SIZE}"></canvas>
          <div class="tetris-info">
            Score: <span class="tetris-score" id="tetris-score-val">0</span>
          </div>
          <div style="margin-top:10px;display:flex;gap:8px;justify-content:center;">
            <button class="btn btn-primary btn-sm" id="tetris-start-btn">▶ Iniciar</button>
          </div>
          <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);">
            ← → Mover · ↑ Girar · ↓ Acelerar · Espaço Cair
          </div>
        </div>
      `;
      canvas = document.getElementById("tetris-canvas");
      ctx = canvas.getContext("2d");
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      document.getElementById("tetris-start-btn").addEventListener("click", startGame);
      // Listener global com opção passive:false para permitir preventDefault
      document.addEventListener("keydown", handleKey, { passive: false });
    }

    return { render };
  })();

  // ──────────────────────────────────────────────────────────
  // CAMPO MINADO
  // ──────────────────────────────────────────────────────────
  const minesweeper = (() => {
    const ROWS=9, COLS=9, MINES=10;
    let board, revealed, flagged, gameOver, firstClick, flagMode;
    let mineCount;

    function newBoard() {
      board    = Array.from({length:ROWS},()=>Array(COLS).fill(0));
      revealed = Array.from({length:ROWS},()=>Array(COLS).fill(false));
      flagged  = Array.from({length:ROWS},()=>Array(COLS).fill(false));
      gameOver = false; firstClick = true; flagMode = false;
      mineCount = MINES;
    }

    function placeMines(avoidR, avoidC) {
      let placed=0;
      while (placed < MINES) {
        const r=Math.floor(Math.random()*ROWS), c=Math.floor(Math.random()*COLS);
        if (board[r][c]===-1 || (Math.abs(r-avoidR)<=1 && Math.abs(c-avoidC)<=1)) continue;
        board[r][c] = -1; placed++;
      }
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
        if (board[r][c]===-1) continue;
        let n=0;
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          const nr=r+dr, nc=c+dc;
          if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS&&board[nr][nc]===-1) n++;
        }
        board[r][c]=n;
      }
    }

    function reveal(r,c) {
      if (r<0||r>=ROWS||c<0||c>=COLS||revealed[r][c]||flagged[r][c]) return;
      revealed[r][c]=true;
      if (board[r][c]===0) {
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) reveal(r+dr,c+dc);
      }
    }

    function checkWin() {
      return board.flat().filter((_,i)=>!revealed[Math.floor(i/COLS)][i%COLS]).length === MINES;
    }

    function renderBoard() {
      const el = document.getElementById("mine-board");
      if (!el) return;
      el.innerHTML = "";
      el.style.gridTemplateColumns = `repeat(${COLS},28px)`;
      for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
        const cell = document.createElement("div");
        cell.className = "mine-cell";
        cell.dataset.r = r; cell.dataset.c = c;
        if (revealed[r][c]) {
          cell.classList.add("revealed");
          if (board[r][c]===-1) { cell.textContent="💣"; cell.classList.add("mine-boom"); }
          else if (board[r][c]>0) { cell.textContent=board[r][c]; cell.dataset.n=board[r][c]; }
        } else if (flagged[r][c]) {
          cell.classList.add("flagged"); cell.textContent="🚩";
        }
        el.appendChild(cell);
      }
      document.getElementById("mine-count-val").textContent = mineCount - Object.values(flagged).flat().filter(Boolean).length;
    }

    function onCellClick(r,c) {
      if (gameOver||revealed[r][c]) return;
      if (flagMode) { onCellFlag(r,c); return; }
      if (flagged[r][c]) return;
      if (firstClick) { placeMines(r,c); firstClick=false; }
      if (board[r][c]===-1) {
        // Boom
        revealed[r][c]=true; renderBoard(); gameOver=true;
        // Revela todas as minas
        for (let i=0;i<ROWS;i++) for (let j=0;j<COLS;j++) {
          if (board[i][j]===-1) revealed[i][j]=true;
        }
        renderBoard();
        document.getElementById("mine-status").textContent="💥 Boom! Você perdeu.";
        return;
      }
      reveal(r,c);
      renderBoard();
      if (checkWin()) { gameOver=true; document.getElementById("mine-status").textContent="🎉 Você venceu!"; }
    }

    function onCellFlag(r,c) {
      if (revealed[r][c]||gameOver) return;
      flagged[r][c]=!flagged[r][c];
      renderBoard();
    }

    function render(area) {
      newBoard();
      area.innerHTML = `
        <div class="minesweeper-info">
          <span>💣 <span id="mine-count-val">${MINES}</span></span>
          <span id="mine-status" style="color:var(--text-secondary);font-size:0.82rem;">Clique para começar</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <button class="btn btn-ghost btn-sm" id="mine-flag-btn">🚩 Bandeira</button>
            <button class="btn btn-ghost btn-sm" id="mine-reset-btn">↺ Reiniciar</button>
          </div>
        </div>
        <div id="mine-board"></div>
        <div style="margin-top:8px;font-size:0.72rem;color:var(--text-muted);text-align:center;">
          Clique esquerdo: revelar · Botão Bandeira: marcar minas
        </div>
      `;
      renderBoard();

      document.getElementById("mine-board").addEventListener("click", (e) => {
        const cell = e.target.closest(".mine-cell");
        if (!cell) return;
        onCellClick(+cell.dataset.r, +cell.dataset.c);
      });
      document.getElementById("mine-board").addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const cell = e.target.closest(".mine-cell");
        if (!cell) return;
        onCellFlag(+cell.dataset.r, +cell.dataset.c);
      });
      document.getElementById("mine-reset-btn").addEventListener("click", () => {
        newBoard(); renderBoard();
        document.getElementById("mine-status").textContent="Clique para começar";
      });
      document.getElementById("mine-flag-btn").addEventListener("click", () => {
        flagMode = !flagMode;
        document.getElementById("mine-flag-btn").classList.toggle("active", flagMode);
      });
    }

    return { render };
  })();

  return { ttt, tetris, minesweeper, selectGame, renderAll };
})();
