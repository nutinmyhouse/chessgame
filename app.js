const BOARD_SIZE = 8;
const PIECE_ORDER = ["queen", "rook", "bishop", "knight", "pawn"];
const ASSETS = {
  queen: "https://upload.wikimedia.org/wikipedia/commons/4/49/Chess_qlt45.svg",
  rook: "https://upload.wikimedia.org/wikipedia/commons/5/5c/Chess_rlt45.svg",
  bishop: "https://upload.wikimedia.org/wikipedia/commons/9/9b/Chess_blt45.svg",
  knight: "https://upload.wikimedia.org/wikipedia/commons/2/28/Chess_nlt45.svg",
  pawn: "https://upload.wikimedia.org/wikipedia/commons/0/04/Chess_plt45.svg",
};

const state = {
  players: [],
  board: [],
  joinedCount: 0,
  currentTurn: 0,
  active: false,
  selectedSquare: null,
  viewAs: "green",
  logs: [],
  places: [],
  assignedPlayerId: null,
  connected: false,
};

const lobbyEl = document.getElementById("lobby");
const lobbyStatusEl = document.getElementById("lobby-status");
const turnInfoEl = document.getElementById("turn-info");
const gradesEl = document.getElementById("grades");
const boardEl = document.getElementById("board");
const viewSelectEl = document.getElementById("view-select");
const logEl = document.getElementById("log");
const bishopAnnouncementsEl = document.getElementById("bishop-announcements");
const connectionEl = document.getElementById("connection");

const resetButton = document.getElementById("reset");

const toCoord = (row, col) => `${String.fromCharCode(97 + col)}${BOARD_SIZE - row}`;
const getSquareColor = (row, col) => ((row + col) % 2 === 0 ? "light" : "dark");
const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

let socket;

const connectSocket = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${window.location.host}`);

  socket.addEventListener("open", () => {
    state.connected = true;
    renderConnectionStatus();
  });

  socket.addEventListener("close", () => {
    state.connected = false;
    renderConnectionStatus();
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      applyState(message.state, message.assignedPlayerId);
    }
  });
};

const applyState = (serverState, assignedPlayerId) => {
  state.players = serverState.players;
  state.board = serverState.board;
  state.joinedCount = serverState.joinedCount;
  state.currentTurn = serverState.currentTurn;
  state.active = serverState.active;
  state.logs = serverState.logs;
  state.places = serverState.places;
  if (assignedPlayerId !== undefined) {
    state.assignedPlayerId = assignedPlayerId;
  }
  if (!state.players.find((player) => player.id === state.viewAs)) {
    state.viewAs = state.players[0]?.id || "green";
  }
  renderLobby();
  renderViewSelect();
  renderTurnInfo();
  renderGrades();
  renderBoard();
  renderLog();
  renderBishopAnnouncements();
  renderLobbyStatus();
};

const renderConnectionStatus = () => {
  if (state.connected) {
    connectionEl.textContent = "Connected to lobby server.";
    connectionEl.classList.add("online");
    connectionEl.classList.remove("offline");
  } else {
    connectionEl.textContent = "Disconnected. Start the server to play.";
    connectionEl.classList.remove("online");
    connectionEl.classList.add("offline");
  }
};

const renderLobbyStatus = () => {
  if (!state.connected) {
    lobbyStatusEl.textContent = "Waiting for server connection.";
    return;
  }
  if (state.joinedCount < 4) {
    lobbyStatusEl.textContent = `${state.joinedCount} of 4 players joined.`;
    return;
  }
  lobbyStatusEl.textContent = state.active
    ? "Lobby full. Game started!"
    : "Lobby full. Preparing game.";
};

const sendMessage = (payload) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
};

resetButton.addEventListener("click", () => {
  sendMessage({ type: "reset" });
});

const renderLobby = () => {
  lobbyEl.innerHTML = "";
  state.players.forEach((player) => {
    const card = document.createElement("div");
    card.className = "lobby-card";
    const label = document.createElement("span");
    const assignedTag =
      state.assignedPlayerId === player.id ? " (you)" : "";
    label.textContent = `${player.label} player${assignedTag}`;
    const action = document.createElement("button");
    action.textContent = player.joined ? "Joined" : "Join";
    action.disabled = player.joined || Boolean(state.assignedPlayerId);
    action.addEventListener("click", () => {
      sendMessage({ type: "join", playerId: player.id });
    });
    card.append(label, action);
    lobbyEl.append(card);
  });
};

const renderViewSelect = () => {
  viewSelectEl.innerHTML = "";
  state.players.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = `${player.label} perspective`;
    viewSelectEl.append(option);
  });
  viewSelectEl.value = state.viewAs;
  viewSelectEl.addEventListener("change", (event) => {
    state.viewAs = event.target.value;
    renderBoard();
    renderTurnInfo();
  });
};

const renderTurnInfo = () => {
  if (!state.active) {
    turnInfoEl.innerHTML = `<p class="muted">Game has not started.</p>`;
    return;
  }
  const currentPlayer = state.players[state.currentTurn];
  const viewingLabel =
    state.players.find((player) => player.id === state.viewAs)?.label ||
    "Unknown";
  const assignedLabel = state.assignedPlayerId
    ? state.players.find((player) => player.id === state.assignedPlayerId)
        ?.label
    : "Spectator";
  turnInfoEl.innerHTML = `
    <p><strong>Current turn:</strong> ${currentPlayer.label}</p>
    <p><strong>Viewing as:</strong> ${viewingLabel}</p>
    <p><strong>Your seat:</strong> ${assignedLabel}</p>
    <p class="muted">Turn order: ${state.players
      .map((player) => player.label)
      .join(" → ")}</p>
  `;
};

const renderGrades = () => {
  gradesEl.innerHTML = "";
  state.players.forEach((player) => {
    const row = document.createElement("div");
    row.textContent = `${player.label}: ${
      player.finishedPlace
        ? `${player.finishedPlace} place (finished)`
        : player.pieceType
    }`;
    gradesEl.append(row);
  });
};

const renderLog = () => {
  if (!state.logs.length) {
    logEl.innerHTML = `<p class="muted">No moves yet.</p>`;
    return;
  }
  logEl.innerHTML = state.logs
    .map((entry) => {
      const time = new Date(entry.time).toLocaleTimeString();
      return `<div><strong>${time}:</strong> ${entry.message}</div>`;
    })
    .join("");
};

const renderBishopAnnouncements = () => {
  const active = state.players.filter((player) => player.bishopAnnouncement);
  if (!active.length) {
    bishopAnnouncementsEl.innerHTML = `<p class="muted">No bishops announced yet.</p>`;
    return;
  }
  bishopAnnouncementsEl.innerHTML = active
    .map(
      (player) =>
        `<div>${player.label} bishop is on <strong>${
          player.bishopAnnouncement
        }</strong> squares.</div>`
    )
    .join("");
};

const renderBoard = () => {
  boardEl.innerHTML = "";
  const currentPlayer = state.players.find(
    (player) => player.id === state.viewAs
  );
  const visibleSquares = state.active
    ? getVisibleSquares(currentPlayer)
    : new Set();
  const legalMoves = state.active
    ? getLegalMoves(currentPlayer)
    : new Set();

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const square = document.createElement("div");
      const color = getSquareColor(row, col);
      square.className = `square ${color}`;
      square.dataset.row = row;
      square.dataset.col = col;

      const key = `${row},${col}`;
      if (state.selectedSquare === key) {
        square.classList.add("selected");
      }
      if (legalMoves.has(key)) {
        square.classList.add("highlight");
      }

      const isVisible = visibleSquares.has(key);
      if (!isVisible && state.active) {
        square.classList.add("fogged");
      }

      const pieceId = state.board[row]?.[col];
      if (pieceId && (isVisible || !state.active)) {
        const player = state.players.find((p) => p.id === pieceId);
        const img = document.createElement("img");
        img.src = ASSETS[player.pieceType];
        img.alt = `${player.label} ${player.pieceType}`;
        img.className = `piece ${player.id}`;
        square.append(img);
      }

      const coord = document.createElement("span");
      coord.className = "coordinate";
      coord.textContent = toCoord(row, col);
      square.append(coord);

      square.addEventListener("click", () => handleSquareClick(row, col));

      boardEl.append(square);
    }
  }
};

const handleSquareClick = (row, col) => {
  if (!state.active || !state.connected) {
    return;
  }
  const currentPlayer = state.players[state.currentTurn];
  if (!currentPlayer || currentPlayer.finishedPlace) {
    return;
  }
  if (!state.assignedPlayerId || state.assignedPlayerId !== currentPlayer.id) {
    return;
  }
  if (state.viewAs !== currentPlayer.id) {
    return;
  }

  const key = `${row},${col}`;
  if (!state.selectedSquare) {
    if (
      currentPlayer.position &&
      currentPlayer.position.row === row &&
      currentPlayer.position.col === col
    ) {
      state.selectedSquare = key;
      renderBoard();
    }
    return;
  }

  const legalMoves = getLegalMoves(currentPlayer);
  if (legalMoves.has(key)) {
    sendMessage({ type: "move", row, col });
    state.selectedSquare = null;
  } else {
    state.selectedSquare = null;
  }
  renderBoard();
};

const getVisibleSquares = (player) => {
  if (!player?.position) {
    return new Set();
  }
  const moves = getPieceVision(player, player.position, true);
  moves.add(`${player.position.row},${player.position.col}`);
  return moves;
};

const getLegalMoves = (player) => {
  if (!player?.position) {
    return new Set();
  }
  return getPieceVision(player, player.position, false);
};

const getPieceVision = (player, position, forVision) => {
  const moves = new Set();
  const { row, col } = position;
  const pieceType = player.pieceType;

  const addMove = (nextRow, nextCol, allowCapture = true) => {
    if (!inBounds(nextRow, nextCol)) {
      return false;
    }
    const occupant = state.board[nextRow][nextCol];
    if (occupant) {
      if (allowCapture || forVision) {
        moves.add(`${nextRow},${nextCol}`);
      }
      return false;
    }
    moves.add(`${nextRow},${nextCol}`);
    return true;
  };

  const ray = (deltaRow, deltaCol) => {
    let nextRow = row + deltaRow;
    let nextCol = col + deltaCol;
    while (inBounds(nextRow, nextCol)) {
      const occupant = state.board[nextRow][nextCol];
      moves.add(`${nextRow},${nextCol}`);
      if (occupant) {
        break;
      }
      nextRow += deltaRow;
      nextCol += deltaCol;
    }
  };

  switch (pieceType) {
    case "queen":
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].forEach(([dr, dc]) => ray(dr, dc));
      break;
    case "rook":
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([dr, dc]) => ray(dr, dc));
      break;
    case "bishop":
      [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ].forEach(([dr, dc]) => ray(dr, dc));
      break;
    case "knight":
      [
        [2, 1],
        [2, -1],
        [-2, 1],
        [-2, -1],
        [1, 2],
        [1, -2],
        [-1, 2],
        [-1, -2],
      ].forEach(([dr, dc]) => {
        addMove(row + dr, col + dc);
      });
      break;
    case "pawn":
      if (forVision) {
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].forEach(([dr, dc]) => {
          addMove(row + dr, col + dc, true);
        });
      } else {
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].forEach(([dr, dc]) => {
          addMove(row + dr, col + dc, false);
        });
        [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ].forEach(([dr, dc]) => {
          const nextRow = row + dr;
          const nextCol = col + dc;
          if (!inBounds(nextRow, nextCol)) {
            return;
          }
          const occupant = state.board[nextRow][nextCol];
          if (occupant && occupant !== player.id) {
            moves.add(`${nextRow},${nextCol}`);
          }
        });
      }
      break;
    default:
      break;
  }

  if (!forVision) {
    return new Set(
      [...moves].filter((key) => {
        const [r, c] = key.split(",").map(Number);
        const occupant = state.board[r][c];
        if (occupant && occupant === player.id) {
          return false;
        }
        return true;
      })
    );
  }

  return moves;
};

connectSocket();
renderConnectionStatus();
