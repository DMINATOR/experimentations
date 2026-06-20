const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Dungeon tile map ---
const TILE = 32;
const MAP_W = 80; // tiles wide
const MAP_H = 80; // tiles tall
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

// --- Dungeon generation (BSP-style rooms + corridors) ---
const rooms = [];

function carveRoom(x, y, w, h) {
    const room = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    for (let ty = y; ty < y + h; ty++) {
        for (let tx = x; tx < x + w; tx++) {
            setTile(tx, ty, 1);
        }
    }
    rooms.push(room);
    return room;
}

function carveCorridor(x1, y1, x2, y2) {
    let x = x1, y = y1;
    // Horizontal first, then vertical
    while (x !== x2) {
        setTile(x, y, 1);
        setTile(x, y + 1, 1); // 2-wide corridor
        x += x < x2 ? 1 : -1;
    }
    while (y !== y2) {
        setTile(x, y, 1);
        setTile(x + 1, y, 1);
        y += y < y2 ? 1 : -1;
    }
}

function generateDungeon() {
    // Fill with walls
    map.fill(0);

    // Place rooms
    const roomCount = 15 + Math.floor(Math.random() * 8);
    let attempts = 0;
    while (rooms.length < roomCount && attempts < 500) {
        attempts++;
        const w = 4 + Math.floor(Math.random() * 8);
        const h = 4 + Math.floor(Math.random() * 8);
        const x = 2 + Math.floor(Math.random() * (MAP_W - w - 4));
        const y = 2 + Math.floor(Math.random() * (MAP_H - h - 4));

        // Check overlap with existing rooms (with padding)
        let overlaps = false;
        for (const r of rooms) {
            if (x - 2 < r.x + r.w && x + w + 2 > r.x &&
                y - 2 < r.y + r.h && y + h + 2 > r.y) {
                overlaps = true;
                break;
            }
        }
        if (!overlaps) {
            carveRoom(x, y, w, h);
        }
    }

    // Connect rooms with corridors
    for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i - 1];
        const b = rooms[i];
        if (Math.random() > 0.5) {
            carveCorridor(a.cx, a.cy, b.cx, a.cy);
            carveCorridor(b.cx, a.cy, b.cx, b.cy);
        } else {
            carveCorridor(a.cx, a.cy, a.cx, b.cy);
            carveCorridor(a.cx, b.cy, b.cx, b.cy);
        }
    }

    // Extra corridors for loops
    for (let i = 0; i < 5; i++) {
        const a = rooms[Math.floor(Math.random() * rooms.length)];
        const b = rooms[Math.floor(Math.random() * rooms.length)];
        if (a !== b) {
            carveCorridor(a.cx, a.cy, b.cx, b.cy);
        }
    }
}
generateDungeon();

// --- Player ---
const startRoom = rooms[0];
const player = {
    x: startRoom.cx * TILE + TILE / 2,
    y: startRoom.cy * TILE + TILE / 2,
    vx: 0,
    vy: 0,
    lightRadius: 180
};

const pmoveSpeed = 3;
const pfriction = 0.82;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Camera ---
const camera = { x: 0, y: 0 };

// --- Torches and relics ---
const torches = [];
const relics = [];

function placeObjects() {
    // Torches in corridors and room edges
    for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
            if (tileAt(tx, ty) !== 1) continue;
            // Place torch next to walls occasionally
            const nearWall = tileAt(tx - 1, ty) === 0 || tileAt(tx + 1, ty) === 0 ||
                             tileAt(tx, ty - 1) === 0 || tileAt(tx, ty + 1) === 0;
            if (nearWall && Math.random() < 0.02) {
                torches.push({
                    x: tx * TILE + TILE / 2,
                    y: ty * TILE + TILE / 2,
                    lit: false,
                    lightRadius: 60 + Math.random() * 30,
                    flickerPhase: Math.random() * Math.PI * 2
                });
            }
        }
    }

    // Relics in some rooms (not the starting room)
    for (let i = 1; i < rooms.length; i++) {
        if (Math.random() < 0.4) {
            const r = rooms[i];
            relics.push({
                x: r.cx * TILE + TILE / 2,
                y: r.cy * TILE + TILE / 2,
                activated: false,
                lightRadius: 160 + Math.random() * 60,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }
}
placeObjects();

// --- Wall edge segments for shadow casting ---
// Collect all edges between floor and wall tiles
function getWallEdges() {
    const edges = [];
    for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
            if (tileAt(tx, ty) !== 0) continue; // only walls cast shadows
            const wx = tx * TILE;
            const wy = ty * TILE;
            // Check each side: if neighbor is floor, that's a shadow edge
            if (tileAt(tx, ty - 1) === 1) edges.push({ x1: wx, y1: wy, x2: wx + TILE, y2: wy }); // top
            if (tileAt(tx, ty + 1) === 1) edges.push({ x1: wx, y1: wy + TILE, x2: wx + TILE, y2: wy + TILE }); // bottom
            if (tileAt(tx - 1, ty) === 1) edges.push({ x1: wx, y1: wy, x2: wx, y2: wy + TILE }); // left
            if (tileAt(tx + 1, ty) === 1) edges.push({ x1: wx + TILE, y1: wy, x2: wx + TILE, y2: wy + TILE }); // right
        }
    }
    return edges;
}

const wallEdges = getWallEdges();

// --- Raycasting for hard shadows ---
// Cast rays from a light source; return a polygon of lit area
function castLight(lx, ly, radius) {
    const RAY_COUNT = 180;
    const points = [];

    // Collect unique angles to edge endpoints (+ slight offsets for precision)
    const angles = [];
    const margin = radius + 50;

    for (const edge of wallEdges) {
        // Rough distance culling
        const emx = (edge.x1 + edge.x2) / 2;
        const emy = (edge.y1 + edge.y2) / 2;
        if (Math.abs(emx - lx) > margin || Math.abs(emy - ly) > margin) continue;

        for (const ep of [{ x: edge.x1, y: edge.y1 }, { x: edge.x2, y: edge.y2 }]) {
            const angle = Math.atan2(ep.y - ly, ep.x - lx);
            angles.push(angle - 0.0001);
            angles.push(angle);
            angles.push(angle + 0.0001);
        }
    }

    // Also add regular spread rays
    for (let i = 0; i < RAY_COUNT; i++) {
        angles.push((i / RAY_COUNT) * Math.PI * 2);
    }

    // Sort angles
    angles.sort((a, b) => a - b);

    // Cast each ray
    for (const angle of angles) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        let closestDist = radius;

        // Check against nearby wall edges
        for (const edge of wallEdges) {
            const emx = (edge.x1 + edge.x2) / 2;
            const emy = (edge.y1 + edge.y2) / 2;
            if (Math.abs(emx - lx) > margin || Math.abs(emy - ly) > margin) continue;

            // Ray-segment intersection
            const ex = edge.x2 - edge.x1;
            const ey = edge.y2 - edge.y1;
            const denom = dx * ey - dy * ex;
            if (Math.abs(denom) < 0.0001) continue;

            const t = ((edge.x1 - lx) * ey - (edge.y1 - ly) * ex) / denom;
            const u = ((edge.x1 - lx) * dy - (edge.y1 - ly) * dx) / denom;

            if (t > 0 && u >= 0 && u <= 1 && t < closestDist) {
                closestDist = t;
            }
        }

        points.push({
            x: lx + dx * closestDist,
            y: ly + dy * closestDist,
            angle
        });
    }

    return points;
}

// --- Drawing ---
let time = 0;

function drawDungeon() {
    // Only draw visible tiles
    const startTX = Math.max(0, Math.floor(camera.x / TILE) - 1);
    const startTY = Math.max(0, Math.floor(camera.y / TILE) - 1);
    const endTX = Math.min(MAP_W, Math.ceil((camera.x + canvas.width) / TILE) + 1);
    const endTY = Math.min(MAP_H, Math.ceil((camera.y + canvas.height) / TILE) + 1);

    for (let ty = startTY; ty < endTY; ty++) {
        for (let tx = startTX; tx < endTX; tx++) {
            const sx = tx * TILE - camera.x;
            const sy = ty * TILE - camera.y;

            if (tileAt(tx, ty) === 1) {
                // Floor
                ctx.fillStyle = '#222';
                ctx.fillRect(sx, sy, TILE, TILE);
                // Subtle tile lines
                ctx.strokeStyle = '#2a2a2a';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(sx, sy, TILE, TILE);
            } else {
                // Wall
                ctx.fillStyle = '#111';
                ctx.fillRect(sx, sy, TILE, TILE);
                // Wall texture
                ctx.fillStyle = '#181818';
                ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
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
        const grd = ctx.createRadialGradient(x, y - 13, 0, x + f2, y - 16, 8);
        grd.addColorStop(0, 'rgba(255, 220, 100, 0.9)');
        grd.addColorStop(0.5, 'rgba(255, 160, 40, 0.5)');
        grd.addColorStop(1, 'rgba(255, 100, 20, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x + f2, y - 14, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 250, 200, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x - 2 + f2, y - 10);
        ctx.quadraticCurveTo(x + f1, y - 20, x + 2 + f2, y - 10);
        ctx.fill();
    }
}

function drawRelic(r, sx, sy) {
    if (!r.activated) {
        const pulse = 0.3 + Math.sin(time * 2 + r.pulsePhase) * 0.15;
        ctx.fillStyle = `rgba(255, 255, 200, ${pulse})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();
    } else {
        const pulse = 0.8 + Math.sin(time * 1.5 + r.pulsePhase) * 0.2;
        ctx.fillStyle = `rgba(255, 255, 220, ${pulse})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 255, 200, ${pulse * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, 10 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawPlayer() {
    const px = player.x - camera.x;
    const py = player.y - camera.y;

    const grd = ctx.createRadialGradient(px, py, 0, px, py, 14);
    grd.addColorStop(0, 'rgba(255, 250, 220, 0.9)');
    grd.addColorStop(0.5, 'rgba(255, 240, 180, 0.4)');
    grd.addColorStop(1, 'rgba(255, 230, 150, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
}

// --- Hard shadow rendering ---
function renderLightPolygon(lightX, lightY, radius) {
    const points = castLight(lightX, lightY, radius);
    if (points.length < 3) return;

    ctx.save();
    ctx.beginPath();
    const sx = points[0].x - camera.x;
    const sy = points[0].y - camera.y;
    ctx.moveTo(sx, sy);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x - camera.x, points[i].y - camera.y);
    }
    ctx.closePath();
    ctx.clip();

    // Draw light gradient inside the polygon
    const lsx = lightX - camera.x;
    const lsy = lightY - camera.y;
    const grd = ctx.createRadialGradient(lsx, lsy, 0, lsx, lsy, radius);
    grd.addColorStop(0, 'rgba(255, 240, 200, 0.35)');
    grd.addColorStop(0.5, 'rgba(255, 220, 160, 0.15)');
    grd.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function applyDarkness() {
    // Create darkness overlay
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = canvas.width;
    lightCanvas.height = canvas.height;
    const lctx = lightCanvas.getContext('2d');

    lctx.fillStyle = '#000';
    lctx.fillRect(0, 0, canvas.width, canvas.height);
    lctx.globalCompositeOperation = 'destination-out';

    // Player light with hard shadows
    const playerPoints = castLight(player.x, player.y, player.lightRadius);
    if (playerPoints.length >= 3) {
        lctx.beginPath();
        lctx.moveTo(playerPoints[0].x - camera.x, playerPoints[0].y - camera.y);
        for (let i = 1; i < playerPoints.length; i++) {
            lctx.lineTo(playerPoints[i].x - camera.x, playerPoints[i].y - camera.y);
        }
        lctx.closePath();

        const px = player.x - camera.x;
        const py = player.y - camera.y;
        const flicker = player.lightRadius + Math.sin(time * 8) * 3;
        const grd = lctx.createRadialGradient(px, py, 0, px, py, flicker);
        grd.addColorStop(0, 'rgba(0,0,0,1)');
        grd.addColorStop(0.6, 'rgba(0,0,0,0.7)');
        grd.addColorStop(0.85, 'rgba(0,0,0,0.2)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = grd;
        lctx.fill();
    }

    // Lit torch lights with hard shadows
    for (const t of torches) {
        if (!t.lit) continue;
        const tx = t.x - camera.x;
        const ty = t.y - camera.y;
        if (tx < -t.lightRadius - 50 || tx > canvas.width + t.lightRadius + 50 ||
            ty < -t.lightRadius - 50 || ty > canvas.height + t.lightRadius + 50) continue;

        const torchPoints = castLight(t.x, t.y, t.lightRadius);
        if (torchPoints.length < 3) continue;

        lctx.beginPath();
        lctx.moveTo(torchPoints[0].x - camera.x, torchPoints[0].y - camera.y);
        for (let i = 1; i < torchPoints.length; i++) {
            lctx.lineTo(torchPoints[i].x - camera.x, torchPoints[i].y - camera.y);
        }
        lctx.closePath();

        const flicker = t.lightRadius + Math.sin(time * 10 + t.flickerPhase) * 4;
        const grd = lctx.createRadialGradient(tx, ty, 0, tx, ty, flicker);
        grd.addColorStop(0, 'rgba(0,0,0,1)');
        grd.addColorStop(0.3, 'rgba(0,0,0,0.6)');
        grd.addColorStop(0.7, 'rgba(0,0,0,0.2)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = grd;
        lctx.fill();
    }

    // Activated relic lights
    for (const r of relics) {
        if (!r.activated) continue;
        const rx = r.x - camera.x;
        const ry = r.y - camera.y;
        if (rx < -r.lightRadius - 50 || rx > canvas.width + r.lightRadius + 50 ||
            ry < -r.lightRadius - 50 || ry > canvas.height + r.lightRadius + 50) continue;

        const relicPoints = castLight(r.x, r.y, r.lightRadius);
        if (relicPoints.length < 3) continue;

        lctx.beginPath();
        lctx.moveTo(relicPoints[0].x - camera.x, relicPoints[0].y - camera.y);
        for (let i = 1; i < relicPoints.length; i++) {
            lctx.lineTo(relicPoints[i].x - camera.x, relicPoints[i].y - camera.y);
        }
        lctx.closePath();

        const pulse = r.lightRadius + Math.sin(time * 1.2 + r.pulsePhase) * 8;
        const grd = lctx.createRadialGradient(rx, ry, 0, rx, ry, pulse);
        grd.addColorStop(0, 'rgba(0,0,0,1)');
        grd.addColorStop(0.4, 'rgba(0,0,0,0.6)');
        grd.addColorStop(0.8, 'rgba(0,0,0,0.15)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = grd;
        lctx.fill();
    }

    ctx.drawImage(lightCanvas, 0, 0);
}

// --- Wall collision ---
function isWall(wx, wy) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    return tileAt(tx, ty) === 0;
}

// --- Update ---
function update() {
    time += 0.016;

    let ax = 0, ay = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) ax -= pmoveSpeed * 0.2;
    if (keys['ArrowRight'] || keys['KeyD']) ax += pmoveSpeed * 0.2;
    if (keys['ArrowUp'] || keys['KeyW']) ay -= pmoveSpeed * 0.2;
    if (keys['ArrowDown'] || keys['KeyS']) ay += pmoveSpeed * 0.2;

    player.vx = (player.vx + ax) * pfriction;
    player.vy = (player.vy + ay) * pfriction;

    // Collision with walls (separate X and Y)
    const nextX = player.x + player.vx;
    const r = 6;
    if (!isWall(nextX - r, player.y) && !isWall(nextX + r, player.y)) {
        player.x = nextX;
    } else {
        player.vx = 0;
    }

    const nextY = player.y + player.vy;
    if (!isWall(player.x, nextY - r) && !isWall(player.x, nextY + r)) {
        player.y = nextY;
    } else {
        player.vy = 0;
    }

    // Light torches
    for (const t of torches) {
        if (!t.lit) {
            const dx = t.x - player.x;
            const dy = t.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < 30) {
                t.lit = true;
            }
        }
    }

    // Activate relics
    for (const r of relics) {
        if (!r.activated) {
            const dx = r.x - player.x;
            const dy = r.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < 20) {
                r.activated = true;
                player.lightRadius += 15;
            }
        }
    }

    // Camera
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

    // Objects
    for (const t of torches) {
        const sx = t.x - camera.x;
        const sy = t.y - camera.y;
        if (sx > -50 && sx < canvas.width + 50 && sy > -50 && sy < canvas.height + 50) {
            drawTorch(sx, sy, t.lit, t.flickerPhase);
        }
    }

    for (const r of relics) {
        const sx = r.x - camera.x;
        const sy = r.y - camera.y;
        if (sx > -50 && sx < canvas.width + 50 && sy > -50 && sy < canvas.height + 50) {
            drawRelic(r, sx, sy);
        }
    }

    drawPlayer();

    // Hard shadows + lighting
    renderLightPolygon(player.x, player.y, player.lightRadius);
    for (const t of torches) {
        if (!t.lit) continue;
        const sx = t.x - camera.x;
        if (sx > -100 && sx < canvas.width + 100) {
            renderLightPolygon(t.x, t.y, t.lightRadius);
        }
    }

    applyDarkness();

    // UI
    const activatedCount = relics.filter(r => r.activated).length;
    ctx.fillStyle = 'rgba(255, 250, 220, 0.6)';
    ctx.font = '12px monospace';
    ctx.fillText(`Relics: ${activatedCount}/${relics.length}`, 15, 20);
    ctx.fillText('WASD to move', 15, canvas.height - 10);
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
