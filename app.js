const BOARD_SIZE = 8;
const EDGE_INDICES = [0, 7];
const PIECE_ORDER = ["queen", "rook", "bishop", "knight", "pawn"];
const COLORS = [
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "red", label: "Red" },
  { id: "purple", label: "Purple" },
];

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
  bishopPlan: null,
};

const lobbyEl = document.getElementById("lobby");
const lobbyStatusEl = document.getElementById("lobby-status");
const turnInfoEl = document.getElementById("turn-info");
const gradesEl = document.getElementById("grades");
const boardEl = document.getElementById("board");
const viewSelectEl = document.getElementById("view-select");
const logEl = document.getElementById("log");
const bishopAnnouncementsEl = document.getElementById("bishop-announcements");

const resetButton = document.getElementById("reset");
resetButton.addEventListener("click", () => initializeGame(true));

const toCoord = (row, col) => `${String.fromCharCode(97 + col)}${BOARD_SIZE - row}`;

const createEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

const getSquareColor = (row, col) => ((row + col) % 2 === 0 ? "light" : "dark");

const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;

const log = (message) => {
  state.logs.unshift({ message, time: new Date() });
  renderLog();
};

const renderLobby = () => {
  lobbyEl.innerHTML = "";
  state.players.forEach((player) => {
    const card = document.createElement("div");
    card.className = "lobby-card";
    const label = document.createElement("span");
    label.textContent = `${player.label} player`;
    const action = document.createElement("button");
    action.textContent = player.joined ? "Joined" : "Join";
    action.disabled = player.joined;
    action.addEventListener("click", () => joinPlayer(player.id));
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
  turnInfoEl.innerHTML = `
    <p><strong>Current turn:</strong> ${currentPlayer.label}</p>
    <p><strong>Viewing as:</strong> ${
      state.players.find((player) => player.id === state.viewAs).label
    }</p>
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
    .map(
      (entry) =>
        `<div><strong>${entry.time.toLocaleTimeString()}:</strong> ${
          entry.message
        }</div>`
    )
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

      const pieceId = state.board[row][col];
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
  if (!state.active) {
    return;
  }
  const currentPlayer = state.players[state.currentTurn];
  if (currentPlayer.finishedPlace) {
    advanceTurn();
    return;
  }
  if (state.viewAs !== currentPlayer.id) {
    log("You can only move while viewing the current player.");
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
    executeMove(currentPlayer, row, col);
    state.selectedSquare = null;
    renderBoard();
    renderGrades();
    renderBishopAnnouncements();
    advanceTurn();
  } else {
    state.selectedSquare = null;
    renderBoard();
  }
};

const initializeGame = (reset = false) => {
  state.players = COLORS.map((color) => ({
    id: color.id,
    label: color.label,
    pieceType: "queen",
    joined: false,
    position: null,
    finishedPlace: null,
    bishopAnnouncement: null,
  }));
  state.board = createEmptyBoard();
  state.joinedCount = 0;
  state.currentTurn = 0;
  state.active = false;
  state.selectedSquare = null;
  state.viewAs = "green";
  state.logs = [];
  state.places = [];
  state.bishopPlan = null;
  renderLobby();
  renderViewSelect();
  renderTurnInfo();
  renderGrades();
  renderBoard();
  renderLog();
  renderBishopAnnouncements();
  lobbyStatusEl.textContent = "Waiting for 4 players to join.";
  if (reset) {
    log("Game reset. Waiting for players to join.");
  }
};

const joinPlayer = (playerId) => {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player || player.joined) {
    return;
  }
  player.joined = true;
  state.joinedCount += 1;
  renderLobby();
  log(`${player.label} joined the lobby.`);
  if (state.joinedCount === 4) {
    startGame();
  } else {
    lobbyStatusEl.textContent = `${state.joinedCount} of 4 players joined.`;
  }
};

const startGame = () => {
  state.active = true;
  lobbyStatusEl.textContent = "Lobby full. Game started!";
  placeInitialQueens();
  state.currentTurn = 0;
  renderBoard();
  renderGrades();
  renderTurnInfo();
  log("All players joined. Queens deployed to the outer ring.");
};

const placeInitialQueens = () => {
  const positions = [];
  const maxAttempts = 200;
  let attempts = 0;
  while (positions.length < 4 && attempts < maxAttempts) {
    attempts += 1;
    const row = EDGE_INDICES[Math.floor(Math.random() * 2)];
    const col = Math.floor(Math.random() * BOARD_SIZE);
    if (!isEdgeSquare(row, col)) {
      continue;
    }
    if (positions.some((pos) => pos.row === row && pos.col === col)) {
      continue;
    }
    const testPosition = { row, col };
    if (positions.some((pos) => isVisibleFrom(pos, testPosition))) {
      continue;
    }
    positions.push(testPosition);
  }

  state.players.forEach((player, index) => {
    const position = positions[index] || getFallbackEdgePosition(index);
    player.position = position;
    state.board[position.row][position.col] = player.id;
  });
};

const getFallbackEdgePosition = (index) => {
  const row = EDGE_INDICES[index % 2];
  const col = index % BOARD_SIZE;
  return { row, col };
};

const isEdgeSquare = (row, col) =>
  EDGE_INDICES.includes(row) || EDGE_INDICES.includes(col);

const getVisibleSquares = (player) => {
  if (!player.position) {
    return new Set();
  }
  const moves = getPieceVision(player, player.position, true);
  moves.add(`${player.position.row},${player.position.col}`);
  return moves;
};

const getLegalMoves = (player) => {
  if (!player.position) {
    return new Set();
  }
  return getPieceVision(player, player.position, false);
};

const getPieceVision = (player, position, forVision) => {
  const moves = new Set();
  const { row, col } = position;
  const pieceType = player.pieceType;

  const addMove = (nextRow, nextCol) => {
    if (!inBounds(nextRow, nextCol)) {
      return false;
    }
    const occupant = state.board[nextRow][nextCol];
    if (occupant) {
      moves.add(`${nextRow},${nextCol}`);
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
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([dr, dc]) => {
        addMove(row + dr, col + dc);
      });
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

const executeMove = (player, row, col) => {
  const target = state.board[row][col];
  const from = player.position;
  if (!from) {
    return;
  }

  if (target && target !== player.id) {
    handleCapture(player, target);
    return;
  }

  state.board[from.row][from.col] = null;
  state.board[row][col] = player.id;
  player.position = { row, col };
  log(`${player.label} moved to ${toCoord(row, col)}.`);
};

const handleCapture = (attacker, targetId) => {
  const targetPlayer = state.players.find((player) => player.id === targetId);
  if (!targetPlayer) {
    return;
  }
  const targetCoord = toCoord(targetPlayer.position.row, targetPlayer.position.col);
  if (attacker.pieceType === "pawn") {
    state.board[attacker.position.row][attacker.position.col] = null;
    attacker.position = null;
    const place = state.places.length + 1;
    attacker.finishedPlace = place;
    state.places.push(attacker.id);
    log(
      `${attacker.label} pawn captured at ${targetCoord} and claimed ${place} place!`
    );
    if (state.places.length === 4) {
      state.active = false;
      log("All places taken. Game over.");
    }
    return;
  }

  downgradePiece(attacker);
  relocateToEdge(attacker);
  if (attacker.pieceType === "bishop") {
    assignBishopAnnouncement(attacker);
  }
  log(
    `${attacker.label} captured ${targetPlayer.label} on ${targetCoord}, downgraded to ${
      attacker.pieceType
    }, and redeployed to the outer ring.`
  );
};

const downgradePiece = (player) => {
  const currentIndex = PIECE_ORDER.indexOf(player.pieceType);
  if (currentIndex < PIECE_ORDER.length - 1) {
    player.pieceType = PIECE_ORDER[currentIndex + 1];
  }

  if (player.pieceType !== "bishop") {
    player.bishopAnnouncement = null;
  }
};

const assignBishopAnnouncement = (player) => {
  if (!player.position) {
    return;
  }
  const squareColor = getSquareColor(player.position.row, player.position.col);
  if (!state.bishopPlan) {
    const remaining = state.players
      .filter((entry) => entry.id !== player.id)
      .map((entry) => entry.id);
    const sameColorAssignee =
      remaining[Math.floor(Math.random() * remaining.length)];
    state.bishopPlan = {
      anchorColor: squareColor,
      sameColorAssignee,
    };
  }
  let requiredColor = "opposite";
  if (state.bishopPlan.sameColorAssignee === player.id) {
    requiredColor = "same";
  }

  const expectedColor =
    requiredColor === "same"
      ? state.bishopPlan.anchorColor
      : state.bishopPlan.anchorColor === "light"
      ? "dark"
      : "light";

  if (squareColor !== expectedColor) {
    relocateToEdge(player, expectedColor);
  }

  player.bishopAnnouncement = expectedColor;
  log(`${player.label} bishop announced on ${expectedColor} squares.`);
};

const relocateToEdge = (player, colorPreference = null) => {
  if (!player.position) {
    return;
  }
  state.board[player.position.row][player.position.col] = null;

  const candidates = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (!isEdgeSquare(row, col)) {
        continue;
      }
      if (state.board[row][col]) {
        continue;
      }
      if (colorPreference && getSquareColor(row, col) !== colorPreference) {
        continue;
      }
      if (isSquareVisibleToAnyOpponent(row, col, player.id)) {
        continue;
      }
      candidates.push({ row, col });
    }
  }

  if (!candidates.length) {
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (isEdgeSquare(row, col) && !state.board[row][col]) {
          candidates.push({ row, col });
        }
      }
    }
  }

  const chosen =
    candidates[Math.floor(Math.random() * candidates.length)] ||
    getFallbackEdgePosition(0);
  player.position = chosen;
  state.board[chosen.row][chosen.col] = player.id;
  if (player.pieceType === "bishop") {
    player.bishopAnnouncement = getSquareColor(chosen.row, chosen.col);
  }
};

const isSquareVisibleToAnyOpponent = (row, col, playerId) =>
  state.players.some((opponent) => {
    if (opponent.id === playerId || opponent.finishedPlace || !opponent.position) {
      return false;
    }
    const visible = getVisibleSquares(opponent);
    return visible.has(`${row},${col}`);
  });

const advanceTurn = () => {
  if (!state.active) {
    return;
  }
  let nextIndex = state.currentTurn;
  for (let i = 0; i < state.players.length; i += 1) {
    nextIndex = (nextIndex + 1) % state.players.length;
    if (!state.players[nextIndex].finishedPlace) {
      break;
    }
  }
  state.currentTurn = nextIndex;
  renderTurnInfo();
  renderBoard();
};

const isVisibleFrom = (origin, target) => {
  const deltaRow = target.row - origin.row;
  const deltaCol = target.col - origin.col;
  if (deltaRow === 0 || deltaCol === 0) {
    return true;
  }
  if (Math.abs(deltaRow) === Math.abs(deltaCol)) {
    return true;
  }
  return false;
};

initializeGame();
