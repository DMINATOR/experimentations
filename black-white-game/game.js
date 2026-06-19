const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// Use offscreen canvas at half resolution for performance
const SCALE = 2;
const W = Math.ceil(canvas.width / SCALE);
const H = Math.ceil(canvas.height / SCALE);
const offscreen = document.createElement('canvas');
offscreen.width = W;
offscreen.height = H;
const offCtx = offscreen.getContext('2d');

const THRESHOLD = 1.0;

// --- Player ---
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2 - 40,
    vx: 0,
    vy: 0,
    wingPhase: 0
};

const gravity = 0.15;
const flapForce = -4;
const moveSpeed = 2.5;
const friction = 0.94;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Blobs ---
const blobs = [];

function addBorderBlobs() {
    const spacing = 70;
    // Top - pushed far outside
    for (let x = -80; x <= canvas.width + 80; x += spacing) {
        blobs.push({ x, y: -40, r: 40, s: 1, type: 'border', ox: x, oy: -40, or: 40 });
    }
    // Left
    for (let y = -80; y <= canvas.height + 80; y += spacing) {
        blobs.push({ x: -40, y, r: 40, s: 1, type: 'border', ox: -40, oy: y, or: 40 });
    }
    // Right
    for (let y = -80; y <= canvas.height + 80; y += spacing) {
        blobs.push({ x: canvas.width + 40, y, r: 40, s: 1, type: 'border', ox: canvas.width + 40, oy: y, or: 40 });
    }
    // Bottom corners only (ground handles bottom)
    blobs.push({ x: -20, y: canvas.height + 30, r: 45, s: 1, type: 'border', ox: -20, oy: canvas.height + 30, or: 45 });
    blobs.push({ x: canvas.width + 20, y: canvas.height + 30, r: 45, s: 1, type: 'border', ox: canvas.width + 20, oy: canvas.height + 30, or: 45 });
}

function addGroundBlobs() {
    // Main ground layer - a row of blobs at the bottom
    for (let x = -50; x <= canvas.width + 50; x += 55) {
        const yOff = Math.sin(x * 0.015) * 12;
        blobs.push({ x, y: 460 + yOff, r: 45, s: 1, type: 'ground' });
    }
    // Sub layer for solid fill below
    for (let x = -50; x <= canvas.width + 50; x += 60) {
        blobs.push({ x, y: 510, r: 40, s: 1, type: 'ground' });
    }
}

function addObjectBlobs() {
    // Tombstone 1
    const t1x = 150;
    blobs.push({ x: t1x, y: 430, r: 18, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 410, r: 16, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 392, r: 14, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 377, r: 13, s: 1, type: 'object' });

    // Cross
    const cx = 320;
    blobs.push({ x: cx, y: 435, r: 14, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 418, r: 12, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 402, r: 11, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 388, r: 10, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 375, r: 10, s: 1, type: 'object' });
    // Cross arms
    blobs.push({ x: cx - 16, y: 395, r: 9, s: 1, type: 'object' });
    blobs.push({ x: cx + 16, y: 395, r: 9, s: 1, type: 'object' });
    blobs.push({ x: cx - 28, y: 395, r: 7, s: 1, type: 'object' });
    blobs.push({ x: cx + 28, y: 395, r: 7, s: 1, type: 'object' });

    // Spire
    const sx = 530;
    for (let i = 0; i < 7; i++) {
        blobs.push({ x: sx, y: 440 - i * 16, r: 14 - i * 1.2, s: 1, type: 'object' });
    }

    // Small tombstone
    const t2x = 680;
    blobs.push({ x: t2x, y: 435, r: 16, s: 1, type: 'object' });
    blobs.push({ x: t2x, y: 418, r: 14, s: 1, type: 'object' });
    blobs.push({ x: t2x, y: 404, r: 12, s: 1, type: 'object' });
}

addBorderBlobs();
addGroundBlobs();
addObjectBlobs();

// --- Field computation ---
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

// --- Render metaball field to offscreen buffer ---
function renderField() {
    const imageData = offCtx.createImageData(W, H);
    const data = imageData.data;

    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            // Map back to full-res coords
            const worldX = px * SCALE;
            const worldY = py * SCALE;
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

    // Draw scaled up to main canvas
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}

// --- Player drawing ---
function drawBat(x, y, wingPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#000';

    ctx.beginPath();
    ctx.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const wy = Math.sin(wingPhase) * 6;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-14, -8 + wy, -20, -2 + wy * 0.5);
    ctx.quadraticCurveTo(-15, 3, -4, 1);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(14, -8 + wy, 20, -2 + wy * 0.5);
    ctx.quadraticCurveTo(15, 3, 4, 1);
    ctx.fill();

    ctx.restore();
}

// --- Collision ---
function isInFluid(px, py) {
    return fieldAt(px, py) >= THRESHOLD;
}

// --- Animate border blobs ---
let time = 0;

function animateBlobs() {
    let idx = 0;
    for (const b of blobs) {
        if (b.type === 'border') {
            b.x = b.ox + Math.sin(time * 0.7 + idx * 0.6) * 12;
            b.y = b.oy + Math.cos(time * 0.5 + idx * 0.8) * 10;
            b.r = b.or + Math.sin(time * 1.0 + idx * 0.4) * 6;
            idx++;
        }
    }
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

    player.x += player.vx;
    player.y += player.vy;

    // Push out of fluid (simple: move up until free)
    if (isInFluid(player.x, player.y)) {
        for (let i = 0; i < 80; i++) {
            player.y -= 2;
            if (!isInFluid(player.x, player.y)) break;
        }
        player.vy = 0;
    }

    // Bounds
    if (player.x < 60) { player.x = 60; player.vx = 0; }
    if (player.x > canvas.width - 60) { player.x = canvas.width - 60; player.vx = 0; }
    if (player.y < 60) { player.y = 60; player.vy = 0; }

    player.wingPhase += 0.2;
}

// --- Render ---
function render() {
    renderField();
    drawBat(player.x, player.y, player.wingPhase);

    ctx.fillStyle = '#fff';
    ctx.font = '11px monospace';
    ctx.fillText('WASD / Arrows + Space to fly', 250, 505);
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
