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
const relicsTotal = relics.length;
let relicsCollected = 0;

// --- Raycasting (efficient: only check tiles in light radius) ---
function castLightPoly(lx, ly, radius) {
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

    // Collect angles to all edge endpoints + offsets
    const angleSet = new Set();
    const angles = [];

    for (let i = 0; i < edges.length; i += 4) {
        const x1 = edges[i], y1 = edges[i + 1], x2 = edges[i + 2], y2 = edges[i + 3];
        const a1 = Math.atan2(y1 - ly, x1 - lx);
        const a2 = Math.atan2(y2 - ly, x2 - lx);
        angles.push(a1 - 0.001, a1, a1 + 0.001);
        angles.push(a2 - 0.001, a2, a2 + 0.001);
    }

    // More fill rays to prevent gaps in open areas
    for (let i = 0; i < 120; i++) {
        angles.push((i / 120) * Math.PI * 2 - Math.PI);
    }
    angles.sort((a, b) => a - b);

    // Cast rays
    const points = [];
    for (let ai = 0; ai < angles.length; ai++) {
        const angle = angles[ai];
        const rdx = Math.cos(angle);
        const rdy = Math.sin(angle);
        let closest = radius;

        for (let i = 0; i < edges.length; i += 4) {
            const sx = edges[i] - lx;
            const sy = edges[i + 1] - ly;
            const ex = edges[i + 2] - edges[i];
            const ey = edges[i + 3] - edges[i + 1];

            const denom = rdx * ey - rdy * ex;
            if (Math.abs(denom) < 0.0001) continue;

            const t = (sx * ey - sy * ex) / denom;
            const u = (sx * rdy - sy * rdx) / denom;

            if (t > 0.5 && u >= 0 && u <= 1 && t < closest) {
                closest = t;
            }
        }
        points.push(lx + rdx * closest, ly + rdy * closest);
    }
    return points;
}

// --- The Shadow (unkillable enemy) ---
const shadow = {
    x: rooms[rooms.length - 1].cx * TILE + TILE / 2,
    y: rooms[rooms.length - 1].cy * TILE + TILE / 2,
    speed: 1.2,
    darkRadius: 120,
    extinguishRadius: 60,
    path: [],
    pathIndex: 0,
    retargetTimer: 0,
    tendrils: Array.from({ length: 8 }, (_, i) => ({
        angle: (i / 8) * Math.PI * 2,
        length: 15 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2
    }))
};

// BFS pathfinding on tile grid
function findPath(fromTX, fromTY, toTX, toTY) {
    if (fromTX === toTX && fromTY === toTY) return [];
    const visited = new Uint8Array(MAP_W * MAP_H);
    const parent = new Int32Array(MAP_W * MAP_H).fill(-1);
    const queue = [fromTY * MAP_W + fromTX];
    visited[fromTY * MAP_W + fromTX] = 1;
    const goal = toTY * MAP_W + toTX;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === goal) {
            // Reconstruct path
            const path = [];
            let c = cur;
            while (c !== -1 && c !== fromTY * MAP_W + fromTX) {
                const cx = c % MAP_W, cy = Math.floor(c / MAP_W);
                path.unshift({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 });
                c = parent[c];
            }
            return path;
        }
        const cx = cur % MAP_W, cy = Math.floor(cur / MAP_W);
        for (const [ddx, ddy] of dirs) {
            const nx = cx + ddx, ny = cy + ddy;
            if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
            const ni = ny * MAP_W + nx;
            if (visited[ni] || tileAt(nx, ny) === 0) continue;
            visited[ni] = 1;
            parent[ni] = cur;
            queue.push(ni);
        }
    }
    return [];
}

function pickShadowTarget() {
    // Prefer rooms with lit torches
    const litRooms = rooms.filter(r =>
        torches.some(t => t.lit &&
            Math.abs(t.x - r.cx * TILE) < (r.w + 2) * TILE &&
            Math.abs(t.y - r.cy * TILE) < (r.h + 2) * TILE)
    );
    const pool = litRooms.length > 0 ? litRooms : rooms;
    const target = pool[Math.floor(Math.random() * pool.length)];

    const fromTX = Math.floor(shadow.x / TILE);
    const fromTY = Math.floor(shadow.y / TILE);
    shadow.path = findPath(fromTX, fromTY, target.cx, target.cy);
    shadow.pathIndex = 0;
}
pickShadowTarget();

function updateShadow() {
    shadow.retargetTimer -= 0.016;

    // Follow BFS path
    if (shadow.pathIndex < shadow.path.length) {
        const wp = shadow.path[shadow.pathIndex];
        const dx = wp.x - shadow.x;
        const dy = wp.y - shadow.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 4) {
            shadow.pathIndex++;
        } else {
            shadow.x += (dx / dist) * shadow.speed;
            shadow.y += (dy / dist) * shadow.speed;
        }
    } else {
        // Reached end, pick new target
        if (shadow.retargetTimer <= 0) {
            pickShadowTarget();
            shadow.retargetTimer = 1.0;
        }
    }

    // Extinguish nearby lit torches
    for (const t of torches) {
        if (!t.lit) continue;
        const tdx = t.x - shadow.x;
        const tdy = t.y - shadow.y;
        if (tdx * tdx + tdy * tdy < shadow.extinguishRadius * shadow.extinguishRadius) {
            t.lit = false;
        }
    }

    // Animate tendrils
    for (const tendril of shadow.tendrils) {
        tendril.angle += Math.sin(time * 3 + tendril.phase) * 0.02;
        tendril.length = 15 + Math.sin(time * 4 + tendril.phase) * 8;
    }
}

function drawShadow() {
    const sx = shadow.x - camera.x;
    const sy = shadow.y - camera.y;
    if (sx < -150 || sx > canvas.width + 150 || sy < -150 || sy > canvas.height + 150) return;

    // Dark aura
    const auraGrd = ctx.createRadialGradient(sx, sy, 5, sx, sy, 40);
    auraGrd.addColorStop(0, 'rgba(10, 0, 20, 0.9)');
    auraGrd.addColorStop(0.5, 'rgba(10, 0, 20, 0.4)');
    auraGrd.addColorStop(1, 'rgba(10, 0, 20, 0)');
    ctx.fillStyle = auraGrd;
    ctx.beginPath();
    ctx.arc(sx, sy, 40, 0, Math.PI * 2);
    ctx.fill();

    // Tendrils — writhing dark arms
    ctx.strokeStyle = 'rgba(20, 0, 40, 0.7)';
    ctx.lineWidth = 2.5;
    for (const tendril of shadow.tendrils) {
        const ex = sx + Math.cos(tendril.angle) * tendril.length;
        const ey = sy + Math.sin(tendril.angle) * tendril.length;
        const cx1 = sx + Math.cos(tendril.angle + 0.3) * tendril.length * 0.5;
        const cy1 = sy + Math.sin(tendril.angle + 0.3) * tendril.length * 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx1, cy1, ex, ey);
        ctx.stroke();
    }

    // Core — a dark void
    ctx.fillStyle = '#050010';
    ctx.beginPath();
    ctx.arc(sx, sy, 7 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner "eye" — faint purple glow
    const eyeGrd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 4);
    eyeGrd.addColorStop(0, 'rgba(120, 40, 160, 0.6)');
    eyeGrd.addColorStop(1, 'rgba(80, 20, 120, 0)');
    ctx.fillStyle = eyeGrd;
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fill();
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

    // (Relics are removed on pickup — no persistent light)

    // Shadow's negative light — adds darkness around it (reverse of light cutout)
    // Reset composite to additive darkness
    lctx.globalCompositeOperation = 'source-over';
    const sdx = shadow.x - camera.x;
    const sdy = shadow.y - camera.y;
    const darkPulse = shadow.darkRadius + Math.sin(time * 3) * 15;
    const darkGrd = lctx.createRadialGradient(sdx, sdy, 0, sdx, sdy, darkPulse);
    darkGrd.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    darkGrd.addColorStop(0.4, 'rgba(0, 0, 0, 0.6)');
    darkGrd.addColorStop(0.7, 'rgba(0, 0, 0, 0.2)');
    darkGrd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lctx.fillStyle = darkGrd;
    lctx.beginPath();
    lctx.arc(sdx, sdy, darkPulse, 0, Math.PI * 2);
    lctx.fill();

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
    for (let i = relics.length - 1; i >= 0; i--) {
        const rl = relics[i];
        if (!rl.activated) {
            const dx = rl.x - player.x, dy = rl.y - player.y;
            if (dx * dx + dy * dy < 400) {
                player.lightRadius += 12;
                relicsCollected++;
                relics.splice(i, 1);
            }
        }
    }

    updateShadow();

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
    drawShadow();

    ctx.fillStyle = 'rgba(255,250,220,0.6)';
    ctx.font = '12px monospace';
    const lit = torches.filter(t => t.lit).length;
    ctx.fillText(`Torches: ${lit}/${torches.length}  |  Relics: ${relicsCollected}/${relicsTotal}`, 12, 18);
    ctx.fillText('WASD to move', 12, canvas.height - 8);
}

function gameLoop() { update(); render(); requestAnimationFrame(gameLoop); }
gameLoop();
