const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Dungeon tile map ---
const TILE = 32;
const MAP_W = 60;
const MAP_H = 60;
const WORLD_W = MAP_W * TILE;
const WORLD_H = MAP_H * TILE;

// 0 = wall, 1 = floor
const map = new Uint8Array(MAP_W * MAP_H);

function tileAt(tx, ty) {
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return 0;
    return map[ty * MAP_W + tx];
}

function setTile(tx, ty, v) {
    if (tx >= 0 && tx < MAP_W && ty >= 0 && ty < MAP_H) {
        map[ty * MAP_W + tx] = v;
    }
}

// --- Dungeon generation ---
const rooms = [];

function carveRoom(x, y, w, h) {
    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    for (let ty = y; ty < y + h; ty++) {
        for (let tx = x; tx < x + w; tx++) {
            setTile(tx, ty, 1);
        }
    }
    rooms.push(room);
}

function carveCorridor(x1, y1, x2, y2) {
    let x = x1, y = y1;
    while (x !== x2) {
        setTile(x, y, 1);
        setTile(x, y + 1, 1);
        x += x < x2 ? 1 : -1;
    }
    while (y !== y2) {
        setTile(x, y, 1);
        setTile(x + 1, y, 1);
        y += y < y2 ? 1 : -1;
    }
}

function generateDungeon() {
    map.fill(0);
    let attempts = 0;
    while (rooms.length < 14 && attempts < 400) {
        attempts++;
        const w = 4 + Math.floor(Math.random() * 7);
        const h = 4 + Math.floor(Math.random() * 7);
        const x = 2 + Math.floor(Math.random() * (MAP_W - w - 4));
        const y = 2 + Math.floor(Math.random() * (MAP_H - h - 4));
        let overlaps = false;
        for (const r of rooms) {
            if (x - 2 < r.x + r.w && x + w + 2 > r.x && y - 2 < r.y + r.h && y + h + 2 > r.y) {
                overlaps = true; break;
            }
        }
        if (!overlaps) carveRoom(x, y, w, h);
    }
    for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i - 1], b = rooms[i];
        carveCorridor(a.cx, a.cy, b.cx, a.cy);
        carveCorridor(b.cx, a.cy, b.cx, b.cy);
    }
    for (let i = 0; i < 4; i++) {
        const a = rooms[Math.floor(Math.random() * rooms.length)];
        const b = rooms[Math.floor(Math.random() * rooms.length)];
        if (a !== b) carveCorridor(a.cx, a.cy, b.cx, b.cy);
    }
}
generateDungeon();

// --- Player ---
const startRoom = rooms[0];
const player = {
    x: startRoom.cx * TILE + TILE / 2,
    y: startRoom.cy * TILE + TILE / 2,
    vx: 0, vy: 0,
    lightRadius: 160
};
const pmoveSpeed = 3;
const pfriction = 0.82;
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Camera ---
const camera = { x: 0, y: 0 };

// --- Torches & relics ---
const torches = [];
const relics = [];

function placeObjects() {
    for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
            if (tileAt(tx, ty) !== 1) continue;
            const nearWall = tileAt(tx - 1, ty) === 0 || tileAt(tx + 1, ty) === 0 ||
                             tileAt(tx, ty - 1) === 0 || tileAt(tx, ty + 1) === 0;
            if (nearWall && Math.random() < 0.015) {
                torches.push({
                    x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
                    lit: false, lightRadius: 70 + Math.random() * 30,
                    flickerPhase: Math.random() * Math.PI * 2
                });
            }
        }
    }
    for (let i = 1; i < rooms.length; i++) {
        if (Math.random() < 0.45) {
            const r = rooms[i];
            relics.push({
                x: r.cx * TILE + TILE / 2, y: r.cy * TILE + TILE / 2,
                activated: false, lightRadius: 150 + Math.random() * 50,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }
}
placeObjects();

// --- Raycasting (efficient: only check tiles in light radius) ---
function castLightPoly(lx, ly, radius) {
    // Get nearby wall edges only
    const edges = [];
    const tileDist = Math.ceil(radius / TILE) + 1;
    const ltx = Math.floor(lx / TILE);
    const lty = Math.floor(ly / TILE);

    for (let dy = -tileDist; dy <= tileDist; dy++) {
        for (let dx = -tileDist; dx <= tileDist; dx++) {
            const tx = ltx + dx;
            const ty = lty + dy;
            if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
            if (tileAt(tx, ty) !== 0) continue;
            const wx = tx * TILE;
            const wy = ty * TILE;
            if (tileAt(tx, ty - 1) === 1) edges.push(wx, wy, wx + TILE, wy);
            if (tileAt(tx, ty + 1) === 1) edges.push(wx, wy + TILE, wx + TILE, wy + TILE);
            if (tileAt(tx - 1, ty) === 1) edges.push(wx, wy, wx, wy + TILE);
            if (tileAt(tx + 1, ty) === 1) edges.push(wx + TILE, wy, wx + TILE, wy + TILE);
        }
    }

    // Collect angles to endpoints
    const angles = [];
    for (let i = 0; i < edges.length; i += 4) {
        const x1 = edges[i], y1 = edges[i + 1], x2 = edges[i + 2], y2 = edges[i + 3];
        const a1 = Math.atan2(y1 - ly, x1 - lx);
        const a2 = Math.atan2(y2 - ly, x2 - lx);
        angles.push(a1 - 0.0001, a1, a1 + 0.0001);
        angles.push(a2 - 0.0001, a2, a2 + 0.0001);
    }
    // Fill in gaps
    for (let i = 0; i < 60; i++) {
        angles.push((i / 60) * Math.PI * 2 - Math.PI);
    }
    angles.sort((a, b) => a - b);

    // Remove duplicates (close angles)
    const filtered = [angles[0]];
    for (let i = 1; i < angles.length; i++) {
        if (angles[i] - filtered[filtered.length - 1] > 0.00005) {
            filtered.push(angles[i]);
        }
    }

    // Cast rays
    const points = [];
    for (const angle of filtered) {
        const rdx = Math.cos(angle);
        const rdy = Math.sin(angle);
        let closest = radius;

        for (let i = 0; i < edges.length; i += 4) {
            const ex1 = edges[i], ey1 = edges[i + 1];
            const ex = edges[i + 2] - ex1;
            const ey = edges[i + 3] - ey1;
            const denom = rdx * ey - rdy * ex;
            if (Math.abs(denom) < 0.00001) continue;
            const t = ((ex1 - lx) * ey - (ey1 - ly) * ex) / denom;
            const u = ((ex1 - lx) * rdy - (ey1 - ly) * rdx) / denom;
            if (t > 0.1 && u >= 0 && u <= 1 && t < closest) {
                closest = t;
            }
        }
        points.push(lx + rdx * closest, ly + rdy * closest);
    }
    return points;
}

// --- Drawing ---
let time = 0;

function drawDungeon() {
    const startTX = Math.max(0, Math.floor(camera.x / TILE) - 1);
    const startTY = Math.max(0, Math.floor(camera.y / TILE) - 1);
    const endTX = Math.min(MAP_W, Math.ceil((camera.x + canvas.width) / TILE) + 1);
    const endTY = Math.min(MAP_H, Math.ceil((camera.y + canvas.height) / TILE) + 1);

    for (let ty = startTY; ty < endTY; ty++) {
        for (let tx = startTX; tx < endTX; tx++) {
            const sx = tx * TILE - camera.x;
            const sy = ty * TILE - camera.y;
            if (tileAt(tx, ty) === 1) {
                ctx.fillStyle = '#1a1a1a';
                ctx.fillRect(sx, sy, TILE, TILE);
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(sx, sy, TILE, TILE);
            } else {
                ctx.fillStyle = '#0a0a0a';
                ctx.fillRect(sx, sy, TILE, TILE);
            }
        }
    }
}

function drawTorch(x, y, lit, flickerPhase) {
    ctx.fillStyle = '#554433';
    ctx.fillRect(x - 1.5, y - 8, 3, 10);
    ctx.fillStyle = '#776655';
    ctx.fillRect(x - 3, y - 10, 6, 3);
    if (lit) {
        const f1 = Math.sin(time * 12 + flickerPhase) * 1.5;
        const f2 = Math.sin(time * 17 + flickerPhase) * 1;
        ctx.fillStyle = 'rgba(255, 250, 200, 0.85)';
        ctx.beginPath();
        ctx.moveTo(x - 2 + f2, y - 10);
        ctx.quadraticCurveTo(x + f1, y - 19, x + 2 + f2, y - 10);
        ctx.fill();
    }
}

function drawRelic(r, sx, sy) {
    const pulse = r.activated ? 0.8 + Math.sin(time * 1.5 + r.pulsePhase) * 0.2
                              : 0.3 + Math.sin(time * 2 + r.pulsePhase) * 0.15;
    ctx.fillStyle = `rgba(255, 255, 200, ${pulse})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r.activated ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
}

function drawPlayer() {
    const px = player.x - camera.x;
    const py = player.y - camera.y;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    const grd = ctx.createRadialGradient(px, py, 0, px, py, 12);
    grd.addColorStop(0, 'rgba(255, 250, 220, 0.6)');
    grd.addColorStop(1, 'rgba(255, 250, 220, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, 12, 0, Math.PI * 2);
    ctx.fill();
}

// --- Hard shadow darkness ---
function applyDarkness() {
    // Build a light mask canvas
    const lc = document.createElement('canvas');
    lc.width = canvas.width;
    lc.height = canvas.height;
    const lctx = lc.getContext('2d');

    // Start fully dark
    lctx.fillStyle = '#000';
    lctx.fillRect(0, 0, canvas.width, canvas.height);
    lctx.globalCompositeOperation = 'destination-out';

    // Helper to draw a light polygon with gradient
    function drawLightCutout(wx, wy, radius, intensityMod) {
        const points = castLightPoly(wx, wy, radius);
        if (points.length < 6) return;

        const sx = wx - camera.x;
        const sy = wy - camera.y;

        lctx.save();
        lctx.beginPath();
        lctx.moveTo(points[0] - camera.x, points[1] - camera.y);
        for (let i = 2; i < points.length; i += 2) {
            lctx.lineTo(points[i] - camera.x, points[i + 1] - camera.y);
        }
        lctx.closePath();
        lctx.clip();

        // Radial gradient inside the visibility polygon
        const grd = lctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
        grd.addColorStop(0, `rgba(0,0,0,${intensityMod})`);
        grd.addColorStop(0.5, `rgba(0,0,0,${intensityMod * 0.7})`);
        grd.addColorStop(0.8, `rgba(0,0,0,${intensityMod * 0.25})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = grd;
        lctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
        lctx.restore();
    }

    // Player light
    const flicker = player.lightRadius + Math.sin(time * 7) * 3 + Math.sin(time * 13) * 2;
    drawLightCutout(player.x, player.y, flicker, 1.0);

    // Lit torches
    for (const t of torches) {
        if (!t.lit) continue;
        const sx = t.x - camera.x;
        const sy = t.y - camera.y;
        if (sx < -t.lightRadius - 20 || sx > canvas.width + t.lightRadius + 20 ||
            sy < -t.lightRadius - 20 || sy > canvas.height + t.lightRadius + 20) continue;
        const fl = t.lightRadius + Math.sin(time * 9 + t.flickerPhase) * 4;
        drawLightCutout(t.x, t.y, fl, 0.85);
    }

    // Activated relics
    for (const r of relics) {
        if (!r.activated) continue;
        const sx = r.x - camera.x;
        const sy = r.y - camera.y;
        if (sx < -r.lightRadius - 20 || sx > canvas.width + r.lightRadius + 20 ||
            sy < -r.lightRadius - 20 || sy > canvas.height + r.lightRadius + 20) continue;
        const pulse = r.lightRadius + Math.sin(time * 1.2 + r.pulsePhase) * 8;
        drawLightCutout(r.x, r.y, pulse, 0.9);
    }

    // Draw darkness on top
    ctx.drawImage(lc, 0, 0);
}

// --- Wall collision ---
function isWall(wx, wy) {
    return tileAt(Math.floor(wx / TILE), Math.floor(wy / TILE)) === 0;
}

// --- Update ---
function update() {
    time += 0.016;

    let ax = 0, ay = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) ax -= pmoveSpeed * 0.22;
    if (keys['ArrowRight'] || keys['KeyD']) ax += pmoveSpeed * 0.22;
    if (keys['ArrowUp'] || keys['KeyW']) ay -= pmoveSpeed * 0.22;
    if (keys['ArrowDown'] || keys['KeyS']) ay += pmoveSpeed * 0.22;

    player.vx = (player.vx + ax) * pfriction;
    player.vy = (player.vy + ay) * pfriction;

    const r = 5;
    const nx = player.x + player.vx;
    if (!isWall(nx - r, player.y) && !isWall(nx + r, player.y) &&
        !isWall(nx - r, player.y - r) && !isWall(nx + r, player.y + r)) {
        player.x = nx;
    } else { player.vx = 0; }

    const ny = player.y + player.vy;
    if (!isWall(player.x, ny - r) && !isWall(player.x, ny + r) &&
        !isWall(player.x - r, ny) && !isWall(player.x + r, ny)) {
        player.y = ny;
    } else { player.vy = 0; }

    for (const t of torches) {
        if (!t.lit) {
            const dx = t.x - player.x, dy = t.y - player.y;
            if (dx * dx + dy * dy < 900) t.lit = true;
        }
    }
    for (const rl of relics) {
        if (!rl.activated) {
            const dx = rl.x - player.x, dy = rl.y - player.y;
            if (dx * dx + dy * dy < 400) {
                rl.activated = true;
                player.lightRadius += 12;
            }
        }
    }

    const targetX = player.x - canvas.width / 2;
    const targetY = player.y - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.1;
    camera.y += (targetY - camera.y) * 0.1;
    camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));
}

// --- Render ---
function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawDungeon();

    for (const t of torches) {
        const sx = t.x - camera.x, sy = t.y - camera.y;
        if (sx > -50 && sx < canvas.width + 50 && sy > -50 && sy < canvas.height + 50)
            drawTorch(sx, sy, t.lit, t.flickerPhase);
    }
    for (const rl of relics) {
        const sx = rl.x - camera.x, sy = rl.y - camera.y;
        if (sx > -50 && sx < canvas.width + 50 && sy > -50 && sy < canvas.height + 50)
            drawRelic(rl, sx, sy);
    }
    drawPlayer();
    applyDarkness();

    ctx.fillStyle = 'rgba(255,250,220,0.6)';
    ctx.font = '12px monospace';
    const act = relics.filter(r => r.activated).length;
    ctx.fillText(`Relics: ${act}/${relics.length}`, 12, 18);
    ctx.fillText('WASD to move', 12, canvas.height - 8);
}

function gameLoop() { update(); render(); requestAnimationFrame(gameLoop); }
gameLoop();
