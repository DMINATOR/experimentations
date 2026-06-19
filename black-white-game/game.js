const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Player ---
const player = {
    x: 416,
    y: 250,
    vx: 0,
    vy: 0,
    wingPhase: 0
};

const gravity = 0.18;
const flapForce = -4.5;
const moveSpeed = 2.5;
const friction = 0.93;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- All blobs (circles that merge via CSS blur+contrast) ---
const blobs = [];
const playerBlobs = [];

function createPlayerBlobs() {
    // Body
    playerBlobs.push({ ox: 0, oy: 0, r: 12 });
    // Wings
    playerBlobs.push({ ox: -18, oy: -2, r: 8 });
    playerBlobs.push({ ox: 18, oy: -2, r: 8 });
    playerBlobs.push({ ox: -10, oy: 0, r: 9 });
    playerBlobs.push({ ox: 10, oy: 0, r: 9 });
}

function addBorderBlobs() {
    const spacing = 40;
    // Top
    for (let x = -20; x <= canvas.width + 20; x += spacing) {
        blobs.push({ x, y: -15, r: 35 + Math.random() * 10, type: 'border', ox: x, oy: -15, or: 35 + Math.random() * 10 });
    }
    // Left
    for (let y = -20; y <= canvas.height + 20; y += spacing) {
        blobs.push({ x: -15, y, r: 35 + Math.random() * 10, type: 'border', ox: -15, oy: y, or: 35 + Math.random() * 10 });
    }
    // Right
    for (let y = -20; y <= canvas.height + 20; y += spacing) {
        blobs.push({ x: canvas.width + 15, y, r: 35 + Math.random() * 10, type: 'border', ox: canvas.width + 15, oy: y, or: 35 + Math.random() * 10 });
    }
    // Bottom
    for (let x = -20; x <= canvas.width + 20; x += spacing) {
        blobs.push({ x, y: canvas.height + 15, r: 30 + Math.random() * 8, type: 'border', ox: x, oy: canvas.height + 15, or: 30 + Math.random() * 8 });
    }
}

function addGroundBlobs() {
    for (let x = -30; x <= canvas.width + 30; x += 35) {
        const yOff = Math.sin(x * 0.013) * 12 + Math.sin(x * 0.037) * 5;
        blobs.push({ x, y: 440 + yOff, r: 30, type: 'ground' });
    }
    // Fill below
    for (let x = -30; x <= canvas.width + 30; x += 40) {
        blobs.push({ x, y: 490, r: 35, type: 'ground' });
    }
}

function addObjectBlobs() {
    // Tombstone
    const t1 = 160;
    blobs.push({ x: t1, y: 420, r: 14, type: 'object' });
    blobs.push({ x: t1, y: 405, r: 12, type: 'object' });
    blobs.push({ x: t1, y: 392, r: 11, type: 'object' });
    blobs.push({ x: t1, y: 380, r: 10, type: 'object' });

    // Cross
    const cx = 320;
    blobs.push({ x: cx, y: 425, r: 11, type: 'object' });
    blobs.push({ x: cx, y: 412, r: 10, type: 'object' });
    blobs.push({ x: cx, y: 400, r: 9, type: 'object' });
    blobs.push({ x: cx, y: 388, r: 9, type: 'object' });
    blobs.push({ x: cx, y: 377, r: 8, type: 'object' });
    blobs.push({ x: cx - 14, y: 393, r: 8, type: 'object' });
    blobs.push({ x: cx + 14, y: 393, r: 8, type: 'object' });
    blobs.push({ x: cx - 24, y: 393, r: 6, type: 'object' });
    blobs.push({ x: cx + 24, y: 393, r: 6, type: 'object' });

    // Spire
    const sx = 530;
    for (let i = 0; i < 8; i++) {
        blobs.push({ x: sx, y: 430 - i * 14, r: 12 - i * 0.9, type: 'object' });
    }

    // Small mound
    blobs.push({ x: 680, y: 428, r: 13, type: 'object' });
    blobs.push({ x: 680, y: 415, r: 11, type: 'object' });
    blobs.push({ x: 680, y: 404, r: 9, type: 'object' });
}

createPlayerBlobs();
addBorderBlobs();
addGroundBlobs();
addObjectBlobs();

// --- Animation ---
let time = 0;

function animateBorderBlobs() {
    for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        if (b.type === 'border') {
            b.x = b.ox + Math.sin(time * 0.5 + i * 0.4) * 8;
            b.y = b.oy + Math.cos(time * 0.4 + i * 0.6) * 6;
            b.r = b.or + Math.sin(time * 0.8 + i * 0.3) * 4;
        }
    }
}

// --- Collision (simple distance check to static blobs) ---
function isNearFluid(px, py, margin) {
    for (const b of blobs) {
        const dx = px - b.x;
        const dy = py - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < b.r + margin) return true;
    }
    return false;
}

// --- Update ---
function update() {
    time += 0.016;
    animateBorderBlobs();

    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= moveSpeed * 0.18;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += moveSpeed * 0.18;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['Space']) {
        player.vy = flapForce;
    }

    player.vy += gravity;
    player.vx *= friction;

    const nextX = player.x + player.vx;
    const nextY = player.y + player.vy;

    // Simple collision: bounce off world blobs
    if (isNearFluid(nextX, nextY, -5)) {
        player.vy *= -0.2;
        player.vx *= 0.5;
    } else {
        player.x = nextX;
        player.y = nextY;
    }

    // Bounds
    if (player.x < 60) { player.x = 60; player.vx = 0; }
    if (player.x > canvas.width - 60) { player.x = canvas.width - 60; player.vx = 0; }
    if (player.y < 60) { player.y = 60; player.vy = 0; }
    if (player.y > canvas.height - 60) { player.y = canvas.height - 60; player.vy = 0; }

    player.wingPhase += 0.2;
}

// --- Render (just draw circles, CSS does the merging) ---
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000';

    // Draw world blobs as circles
    for (const b of blobs) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw player blobs
    const wingY = Math.sin(player.wingPhase) * 5;
    for (let i = 0; i < playerBlobs.length; i++) {
        const pb = playerBlobs[i];
        let x = player.x + pb.ox;
        let y = player.y + pb.oy;
        // Wing animation on wing blobs
        if (i >= 1) y += wingY * (i <= 2 ? 1 : 0.5);

        ctx.beginPath();
        ctx.arc(x, y, pb.r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
