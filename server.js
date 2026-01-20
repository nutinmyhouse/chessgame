const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

const BOARD_SIZE = 8;
const EDGE_INDICES = [0, 7];
const PIECE_ORDER = ["queen", "rook", "bishop", "knight", "pawn"];
const COLORS = [
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "red", label: "Red" },
  { id: "purple", label: "Purple" },
];

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname)));

const createEmptyBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

const getSquareColor = (row, col) => ((row + col) % 2 === 0 ? "light" : "dark");
const inBounds = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;
const toCoord = (row, col) => `${String.fromCharCode(97 + col)}${BOARD_SIZE - row}`;
const isEdgeSquare = (row, col) =>
  EDGE_INDICES.includes(row) || EDGE_INDICES.includes(col);

const state = {
  players: [],
  board: createEmptyBoard(),
  joinedCount: 0,
  currentTurn: 0,
  active: false,
  logs: [],
  places: [],
  bishopCounts: { light: 0, dark: 0 },
};

const resetState = () => {
  state.players = COLORS.map((color) => ({
    id: color.id,
    label: color.label,
    pieceType: "queen",
    joined: false,
    position: null,
    finishedPlace: null,
    bishopAnnouncement: null,
    bishopSquareColor: null,
  }));
  state.board = createEmptyBoard();
  state.joinedCount = 0;
  state.currentTurn = 0;
  state.active = false;
  state.logs = [];
  state.places = [];
  state.bishopCounts = { light: 0, dark: 0 };
};

resetState();

const log = (message) => {
  state.logs.unshift({ message, time: new Date().toISOString() });
};

const broadcastState = () => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(
        JSON.stringify({
          type: "state",
          state: {
            ...state,
            board: state.board,
          },
          assignedPlayerId: client.playerId,
        })
      );
    }
  });
};

const placeInitialQueens = () => {
  const positions = [];
  const maxAttempts = 300;
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

const downgradePiece = (player) => {
  const currentIndex = PIECE_ORDER.indexOf(player.pieceType);
  if (currentIndex < PIECE_ORDER.length - 1) {
    player.pieceType = PIECE_ORDER[currentIndex + 1];
  }
  if (player.pieceType !== "bishop" && player.bishopSquareColor) {
    decrementBishopColor(player.bishopSquareColor);
    player.bishopSquareColor = null;
    player.bishopAnnouncement = null;
  }
};

const incrementBishopColor = (color) => {
  state.bishopCounts[color] += 1;
};

const decrementBishopColor = (color) => {
  state.bishopCounts[color] = Math.max(0, state.bishopCounts[color] - 1);
};

const assignBishopAnnouncement = (player) => {
  if (!player.position) {
    return;
  }
  const squareColor = getSquareColor(player.position.row, player.position.col);
  const oppositeColor = squareColor === "light" ? "dark" : "light";

  let chosenColor = squareColor;
  if (state.bishopCounts[squareColor] >= 2) {
    chosenColor = oppositeColor;
  } else if (state.bishopCounts[oppositeColor] >= 2) {
    chosenColor = squareColor;
  } else {
    const remaining = state.players
      .filter((entry) => entry.id !== player.id && entry.pieceType === "bishop")
      .map((entry) => entry.bishopSquareColor)
      .filter(Boolean);
    const sameCount = remaining.filter((color) => color === squareColor).length;
    if (sameCount >= 1) {
      chosenColor = oppositeColor;
    }
  }

  if (squareColor !== chosenColor) {
    relocateToEdge(player, chosenColor);
  }

  if (player.bishopSquareColor) {
    decrementBishopColor(player.bishopSquareColor);
  }
  player.bishopSquareColor = chosenColor;
  incrementBishopColor(chosenColor);
  player.bishopAnnouncement = chosenColor;
  log(`${player.label} bishop announced on ${chosenColor} squares.`);
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
};

const isSquareVisibleToAnyOpponent = (row, col, playerId) =>
  state.players.some((opponent) => {
    if (opponent.id === playerId || opponent.finishedPlace || !opponent.position) {
      return false;
    }
    const visible = getVisibleSquares(opponent);
    return visible.has(`${row},${col}`);
  });

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
  if (!targetPlayer || !targetPlayer.position) {
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
    if (attacker.bishopSquareColor) {
      decrementBishopColor(attacker.bishopSquareColor);
      attacker.bishopSquareColor = null;
      attacker.bishopAnnouncement = null;
    }
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

const startGame = () => {
  state.active = true;
  placeInitialQueens();
  state.currentTurn = 0;
  log("All players joined. Queens deployed to the outer ring.");
};

wss.on("connection", (ws) => {
  ws.playerId = null;

  ws.send(
    JSON.stringify({
      type: "state",
      state,
      assignedPlayerId: ws.playerId,
    })
  );

  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    if (message.type === "join") {
      const player = state.players.find((entry) => entry.id === message.playerId);
      if (!player || player.joined) {
        return;
      }
      player.joined = true;
      ws.playerId = player.id;
      state.joinedCount += 1;
      log(`${player.label} joined the lobby.`);
      if (state.joinedCount === 4) {
        startGame();
      }
      broadcastState();
      return;
    }

    if (message.type === "reset") {
      resetState();
      log("Game reset. Waiting for players to join.");
      wss.clients.forEach((client) => {
        client.playerId = null;
      });
      broadcastState();
      return;
    }

    if (message.type === "move") {
      if (!state.active || !ws.playerId) {
        return;
      }
      const currentPlayer = state.players[state.currentTurn];
      if (!currentPlayer || currentPlayer.id !== ws.playerId) {
        return;
      }
      if (currentPlayer.finishedPlace) {
        advanceTurn();
        broadcastState();
        return;
      }
      const legalMoves = getLegalMoves(currentPlayer);
      const key = `${message.row},${message.col}`;
      if (!legalMoves.has(key)) {
        return;
      }
      executeMove(currentPlayer, message.row, message.col);
      advanceTurn();
      broadcastState();
    }
  });

  ws.on("close", () => {
    if (!ws.playerId) {
      return;
    }
    const player = state.players.find((entry) => entry.id === ws.playerId);
    if (player && player.joined) {
      player.joined = false;
      state.joinedCount = Math.max(0, state.joinedCount - 1);
      log(`${player.label} disconnected.`);
      broadcastState();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
