const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// Half-res for performance
const SCALE = 3;
const W = Math.ceil(canvas.width / SCALE);
const H = Math.ceil(canvas.height / SCALE);
const offscreen = document.createElement('canvas');
offscreen.width = W;
offscreen.height = H;
const offCtx = offscreen.getContext('2d');

const THRESHOLD = 1.0;

// --- Player state (controls the player blobs) ---
const player = {
    x: 416,
    y: 250,
    vx: 0,
    vy: 0,
    wingPhase: 0
};

const gravity = 0.12;
const flapForce = -3.5;
const moveSpeed = 2;
const friction = 0.93;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- ALL blobs in the world (player is also blobs) ---
const blobs = [];

// Player blobs - these get repositioned every frame
const playerBlobs = [];
function createPlayerBlobs() {
    // Body (center)
    playerBlobs.push({ x: 0, y: 0, r: 14, s: 1 });
    // Left wing tip
    playerBlobs.push({ x: -20, y: -3, r: 9, s: 1 });
    // Right wing tip
    playerBlobs.push({ x: 20, y: -3, r: 9, s: 1 });
    // Left wing mid
    playerBlobs.push({ x: -11, y: -1, r: 10, s: 1 });
    // Right wing mid
    playerBlobs.push({ x: 11, y: -1, r: 10, s: 1 });

    // Add to global blob list
    for (const pb of playerBlobs) {
        blobs.push(pb);
    }
}

// Border blobs
function addBorderBlobs() {
    const spacing = 65;
    for (let x = -80; x <= canvas.width + 80; x += spacing) {
        blobs.push({ x, y: -35, r: 38, s: 1, type: 'border', ox: x, oy: -35, or: 38 });
    }
    for (let y = -80; y <= canvas.height + 80; y += spacing) {
        blobs.push({ x: -35, y, r: 38, s: 1, type: 'border', ox: -35, oy: y, or: 38 });
    }
    for (let y = -80; y <= canvas.height + 80; y += spacing) {
        blobs.push({ x: canvas.width + 35, y, r: 38, s: 1, type: 'border', ox: canvas.width + 35, oy: y, or: 38 });
    }
    blobs.push({ x: -10, y: canvas.height + 30, r: 40, s: 1, type: 'border', ox: -10, oy: canvas.height + 30, or: 40 });
    blobs.push({ x: canvas.width + 10, y: canvas.height + 30, r: 40, s: 1, type: 'border', ox: canvas.width + 10, oy: canvas.height + 30, or: 40 });
}

// Ground blobs
function addGroundBlobs() {
    for (let x = -60; x <= canvas.width + 60; x += 50) {
        const yOff = Math.sin(x * 0.012) * 10;
        blobs.push({ x, y: 455 + yOff, r: 40, s: 1, type: 'ground' });
    }
    for (let x = -60; x <= canvas.width + 60; x += 55) {
        blobs.push({ x, y: 505, r: 38, s: 1, type: 'ground' });
    }
}

// Object blobs (merge with ground and border naturally)
function addObjectBlobs() {
    // Tombstone
    const t1x = 160;
    blobs.push({ x: t1x, y: 425, r: 16, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 408, r: 14, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 393, r: 12, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 380, r: 11, s: 1, type: 'object' });

    // Cross
    const cx = 330;
    blobs.push({ x: cx, y: 432, r: 13, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 416, r: 11, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 402, r: 10, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 389, r: 9, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 377, r: 9, s: 1, type: 'object' });
    blobs.push({ x: cx - 15, y: 395, r: 8, s: 1, type: 'object' });
    blobs.push({ x: cx + 15, y: 395, r: 8, s: 1, type: 'object' });
    blobs.push({ x: cx - 25, y: 395, r: 6, s: 1, type: 'object' });
    blobs.push({ x: cx + 25, y: 395, r: 6, s: 1, type: 'object' });

    // Tall spire
    const sx = 540;
    for (let i = 0; i < 7; i++) {
        blobs.push({ x: sx, y: 440 - i * 15, r: 13 - i * 1.1, s: 1, type: 'object' });
    }

    // Small mound
    blobs.push({ x: 680, y: 440, r: 15, s: 1, type: 'object' });
    blobs.push({ x: 680, y: 425, r: 12, s: 1, type: 'object' });
    blobs.push({ x: 680, y: 412, r: 10, s: 1, type: 'object' });
}

createPlayerBlobs();
addBorderBlobs();
addGroundBlobs();
addObjectBlobs();

// --- Field at a point (all blobs including player) ---
function fieldAt(px, py) {
    let sum = 0;
    for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const dx = px - b.x;
        const dy = py - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1) { sum += b.r * b.r * b.s; continue; }
        sum += (b.r * b.r * b.s) / distSq;
    }
    return sum;
}

// Field WITHOUT player blobs (for collision detection)
function fieldAtWithoutPlayer(px, py) {
    let sum = 0;
    for (let i = playerBlobs.length; i < blobs.length; i++) {
        const b = blobs[i];
        const dx = px - b.x;
        const dy = py - b.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1) { sum += b.r * b.r * b.s; continue; }
        sum += (b.r * b.r * b.s) / distSq;
    }
    return sum;
}

// --- Render the metaball field ---
function renderField() {
    const imageData = offCtx.createImageData(W, H);
    const data = imageData.data;

    for (let py = 0; py < H; py++) {
        const worldY = py * SCALE;
        for (let px = 0; px < W; px++) {
            const worldX = px * SCALE;
            const val = fieldAt(worldX, worldY);
            const idx = (py * W + px) * 4;
            if (val >= THRESHOLD) {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 255;
            } else {
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
                data[idx + 3] = 255;
            }
        }
    }

    offCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}

// --- Animate border blobs ---
let time = 0;

function animateBlobs() {
    let idx = 0;
    for (const b of blobs) {
        if (b.type === 'border') {
            b.x = b.ox + Math.sin(time * 0.6 + idx * 0.5) * 10;
            b.y = b.oy + Math.cos(time * 0.4 + idx * 0.7) * 8;
            b.r = b.or + Math.sin(time * 0.9 + idx * 0.3) * 5;
            idx++;
        }
    }
}

// --- Update player blob positions ---
function updatePlayerBlobs() {
    const wingY = Math.sin(player.wingPhase) * 5;

    // Body
    playerBlobs[0].x = player.x;
    playerBlobs[0].y = player.y;

    // Left wing tip
    playerBlobs[1].x = player.x - 22;
    playerBlobs[1].y = player.y - 2 + wingY;

    // Right wing tip
    playerBlobs[2].x = player.x + 22;
    playerBlobs[2].y = player.y - 2 + wingY;

    // Left wing mid
    playerBlobs[3].x = player.x - 12;
    playerBlobs[3].y = player.y - 1 + wingY * 0.5;

    // Right wing mid
    playerBlobs[4].x = player.x + 12;
    playerBlobs[4].y = player.y - 1 + wingY * 0.5;
}

// --- Update ---
function update() {
    time += 0.016;
    animateBlobs();

    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= moveSpeed * 0.15;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += moveSpeed * 0.15;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['Space']) {
        player.vy = flapForce;
    }

    player.vy += gravity;
    player.vx *= friction;

    const nextX = player.x + player.vx;
    const nextY = player.y + player.vy;

    // Collision: check if next position would be inside world fluid
    if (fieldAtWithoutPlayer(nextX, nextY) >= THRESHOLD * 0.7) {
        // Push back - find safe position
        player.vy *= -0.3;
        player.vx *= 0.5;
    } else {
        player.x = nextX;
        player.y = nextY;
    }

    // Hard bounds
    if (player.x < 70) { player.x = 70; player.vx = 0; }
    if (player.x > canvas.width - 70) { player.x = canvas.width - 70; player.vx = 0; }
    if (player.y < 70) { player.y = 70; player.vy = 0; }
    if (player.y > canvas.height - 70) { player.y = canvas.height - 70; player.vy = 0; }

    player.wingPhase += 0.18;
    updatePlayerBlobs();
}

// --- Render ---
function render() {
    renderField();

    // Small white eye on the player so you can tell where you are
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(player.x + 3, player.y - 1, 2, 0, Math.PI * 2);
    ctx.fill();
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
