const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const canvasWidth = 800;
const canvasHeight = 500;
const playerSize = 20;
const ballSize = 12;

let players = {};
let inputs = {};
let ball = {
  x: canvasWidth / 2,
  y: canvasHeight / 2,
  vx: 3,
  vy: 2,
  trail: []
};
let confetti = [];
let matchDuration = 120;
let matchStartTime = null;
let matchEnded = false;
let goalText = "";
let goalTimer = 0;

function createConfetti(x, y, color) {
  for (let i = 0; i < 50; i++) {
    confetti.push({
      x, y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 1) * 6,
      size: Math.random() * 4 + 2,
      color,
      life: 60
    });
  }
}

function resetBall() {
  ball.x = canvasWidth / 2;
  ball.y = canvasHeight / 2;
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * 3;
  ball.vy = (Math.random() > 0.5 ? 1 : -1) * 2;
  ball.trail = [];
}

io.on("connection", (socket) => {
  if (Object.keys(players).length >= 2) {
    socket.emit("full");
    return;
  }

  const type = Object.keys(players).length === 0 ? "player1" : "player2";
  const x = type === "player1" ? 50 : 750;
  const color = type === "player1" ? "blue" : "red";

  players[socket.id] = {
    id: socket.id,
    type,
    name: type === "player1" ? "Niebieski" : "Czerwony",
    x,
    y: canvasHeight / 2,
    color,
    score: 0
  };
  inputs[socket.id] = {};

  socket.emit("playerType", type);

  if (Object.keys(players).length === 2 && !matchStartTime) {
    matchStartTime = Date.now();
    matchEnded = false;
  }

  socket.on("inputs", (input) => {
    inputs[socket.id] = input;
  });

  socket.on("chatMessage", (data) => {
    socket.broadcast.emit("chatMessage", data);
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
    delete inputs[socket.id];
    matchStartTime = null;
    matchEnded = false;
    resetBall();
    goalText = "";
    goalTimer = 0;
  });
});

function update() {
  if (matchEnded) return;

  const now = Date.now();
  if (matchStartTime && now - matchStartTime >= matchDuration * 1000) {
    matchEnded = true;
    let p1 = Object.values(players).find(p => p.type === "player1");
    let p2 = Object.values(players).find(p => p.type === "player2");
    if (p1 && p2) {
      if (p1.score > p2.score) goalText = "Niebiescy wygrywają!";
      else if (p2.score > p1.score) goalText = "Czerwoni wygrywają!";
      else goalText = "Remis!";
    }
    return;
  }

  for (const id in players) {
    const player = players[id];
    const input = inputs[id] || {};
    const speed = 4;
    if (input.up) player.y -= speed;
    if (input.down) player.y += speed;
    if (input.left) player.x -= speed;
    if (input.right) player.x += speed;

    player.x = Math.max(0, Math.min(canvasWidth, player.x));
    player.y = Math.max(0, Math.min(canvasHeight, player.y));
  }

  // Piłka
  ball.x += ball.vx;
  ball.y += ball.vy;

  if (ball.y <= 0 || ball.y >= canvasHeight) ball.vy *= -1;
  if (ball.x <= 0 || ball.x >= canvasWidth) ball.vx *= -1;

  ball.vx *= 0.99;
  ball.vy *= 0.99;

  const speed = Math.hypot(ball.vx, ball.vy);
  const maxSpeed = 6;
  if (speed > maxSpeed) {
    ball.vx *= maxSpeed / speed;
    ball.vy *= maxSpeed / speed;
  }

  ball.trail.push({ x: ball.x, y: ball.y });
  if (ball.trail.length > 10) ball.trail.shift();

  // Kolizje
  for (const id in players) {
    const p = players[id];
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < playerSize + ballSize) {
      const angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * 4;
      ball.vy = Math.sin(angle) * 4;
    }
  }

  const inGoalArea = ball.y > 200 && ball.y < 300;
  if (ball.x < 0 && inGoalArea) {
    const red = Object.values(players).find(p => p.type === "player2");
    if (red) red.score++;
    goalText = "GOOOOOL! CZERWONI!";
    goalTimer = 120;
    createConfetti(canvasWidth / 2, canvasHeight / 2, "red");
    resetBall();
  } else if (ball.x > canvasWidth && inGoalArea) {
    const blue = Object.values(players).find(p => p.type === "player1");
    if (blue) blue.score++;
    goalText = "GOOOOOL! NIEBIESCY!";
    goalTimer = 120;
    createConfetti(canvasWidth / 2, canvasHeight / 2, "cyan");
    resetBall();
  }

  if (goalTimer > 0) goalTimer--;

  // Confetti update
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.2;
    p.life--;
    if (p.life <= 0) confetti.splice(i, 1);
  }
}

setInterval(() => {
  update();
  const now = Date.now();
  const remaining = matchStartTime ? Math.max(0, matchDuration - Math.floor((now - matchStartTime) / 1000)) : matchDuration;

  io.emit("gameState", {
    players: Object.values(players),
    ball,
    confetti,
    goalText,
    goalTimer,
    remaining,
    matchEnded
  });
}, 1000 / 60);

server.listen(process.env.PORT || 3000, () => {
  console.log("Serwer działa na porcie", process.env.PORT || 3000);
});
