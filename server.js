const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public")); // serwuje Twoją grę

let players = {};
let ball = { x: 400, y: 250, vx: 3, vy: 2 };

io.on("connection", (socket) => {
  console.log("Nowy gracz:", socket.id);

  // przydziel gracza
  if (!players.player1) {
    players.player1 = { id: socket.id, x: 50, y: 250 };
  } else if (!players.player2) {
    players.player2 = { id: socket.id, x: 750, y: 250 };
  } else {
    socket.emit("full");
    return;
  }

  const playerType = players.player1.id === socket.id ? "player1" : "player2";
  socket.emit("playerType", playerType);

  socket.on("playerMove", ({ x, y }) => {
    if (players[playerType]) {
      players[playerType].x = x;
      players[playerType].y = y;
    }
  });

  socket.on("ballUpdate", (newBall) => {
    ball = newBall;
  });

  socket.on("disconnect", () => {
    console.log("Gracz rozłączony:", socket.id);
    if (players.player1?.id === socket.id) delete players.player1;
    if (players.player2?.id === socket.id) delete players.player2;
  });

  setInterval(() => {
    io.emit("gameState", { players, ball });
  }, 1000 / 60); // 60 razy na sekundę
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Serwer działa na porcie", process.env.PORT || 3000);
});

