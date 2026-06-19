const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// Metaball grid resolution (lower = faster, blockier)
const GRID_SIZE = 4;
const COLS = Math.ceil(canvas.width / GRID_SIZE) + 1;
const ROWS = Math.ceil(canvas.height / GRID_SIZE) + 1;
const THRESHOLD = 1.0;

// --- Player ---
const player = {
    x: 400,
    y: 200,
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

// --- Blobs: everything is a blob in the fluid ---
// Types: 'border', 'ground', 'object'
// Each blob has: x, y, radius, strength
const blobs = [];

// Border blobs - form the organic edge
function addBorderBlobs() {
    const spacing = 50;
    // Top edge
    for (let x = -50; x <= canvas.width + 50; x += spacing) {
        blobs.push({ x, y: -20, r: 60 + Math.random() * 20, s: 1, type: 'border' });
    }
    // Left edge
    for (let y = -50; y <= canvas.height + 50; y += spacing) {
        blobs.push({ x: -20, y, r: 55 + Math.random() * 20, s: 1, type: 'border' });
    }
    // Right edge
    for (let y = -50; y <= canvas.height + 50; y += spacing) {
        blobs.push({ x: canvas.width + 20, y, r: 55 + Math.random() * 20, s: 1, type: 'border' });
    }
    // Bottom edge (thinner, merges with ground)
    for (let x = -50; x <= canvas.width + 50; x += spacing) {
        blobs.push({ x, y: canvas.height + 20, r: 40 + Math.random() * 15, s: 1, type: 'border' });
    }
}

// Ground blobs - the terrain floor
function addGroundBlobs() {
    const groundY = 420;
    for (let x = -100; x <= canvas.width + 100; x += 35) {
        const variation = Math.sin(x * 0.01) * 15 + Math.sin(x * 0.03) * 8;
        blobs.push({
            x, y: groundY + variation + 30, r: 50 + Math.random() * 15,
            s: 1, type: 'ground'
        });
    }
    // Sub-surface fill
    for (let x = -100; x <= canvas.width + 100; x += 45) {
        blobs.push({
            x, y: canvas.height - 20, r: 60,
            s: 1, type: 'ground'
        });
    }
}

// Object blobs - tombstones, spires etc that merge with ground fluid
function addObjectBlobs() {
    // Tombstone 1 - cluster of blobs forming a rounded rectangle
    const t1x = 180;
    blobs.push({ x: t1x, y: 390, r: 22, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 370, r: 20, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 352, r: 18, s: 1, type: 'object' });
    blobs.push({ x: t1x, y: 338, r: 16, s: 1, type: 'object' });

    // Cross - blobs forming a cross shape
    const cx = 350;
    blobs.push({ x: cx, y: 400, r: 16, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 380, r: 14, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 360, r: 13, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 345, r: 12, s: 1, type: 'object' });
    blobs.push({ x: cx, y: 330, r: 11, s: 1, type: 'object' });
    // Arms
    blobs.push({ x: cx - 18, y: 355, r: 11, s: 1, type: 'object' });
    blobs.push({ x: cx + 18, y: 355, r: 11, s: 1, type: 'object' });
    blobs.push({ x: cx - 30, y: 355, r: 9, s: 1, type: 'object' });
    blobs.push({ x: cx + 30, y: 355, r: 9, s: 1, type: 'object' });

    // Spire - tall narrow cluster
    const sx = 550;
    for (let i = 0; i < 8; i++) {
        blobs.push({
            x: sx, y: 410 - i * 18,
            r: 18 - i * 1.5, s: 1, type: 'object'
        });
    }

    // Another tombstone
    const t2x = 680;
    blobs.push({ x: t2x, y: 395, r: 20, s: 1, type: 'object' });
    blobs.push({ x: t2x, y: 375, r: 18, s: 1, type: 'object' });
    blobs.push({ x: t2x, y: 358, r: 16, s: 1, type: 'object' });
    blobs.push({ x: t2x, y: 345, r: 15, s: 1, type: 'object' });
}

addBorderBlobs();
addGroundBlobs();
addObjectBlobs();

// --- Metaball field computation ---
// Returns field strength at point (px, py)
function fieldAt(px, py) {
    let sum = 0;
    for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const dx = px - b.x;
        const dy = py - b.y;
        const distSq = dx * dx + dy * dy;
        const rSq = b.r * b.r;
        // Smooth falloff: r^2 / dist^2
        sum += (rSq * b.s) / distSq;
    }
    return sum;
}

// --- Marching squares for smooth contour ---
// We compute the field on a grid and draw filled regions where field > threshold
const fieldGrid = new Float32Array(COLS * ROWS);

function computeField() {
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const px = col * GRID_SIZE;
            const py = row * GRID_SIZE;
            fieldGrid[row * COLS + col] = fieldAt(px, py);
        }
    }
}

// Simple rendering: fill pixels where field > threshold
function renderField() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let row = 0; row < ROWS - 1; row++) {
        for (let col = 0; col < COLS - 1; col++) {
            const val = fieldGrid[row * COLS + col];
            if (val >= THRESHOLD) {
                // Fill this grid cell black
                const startX = col * GRID_SIZE;
                const startY = row * GRID_SIZE;
                for (let py = startY; py < startY + GRID_SIZE && py < canvas.height; py++) {
                    for (let px = startX; px < startX + GRID_SIZE && px < canvas.width; px++) {
                        const idx = (py * canvas.width + px) * 4;
                        data[idx] = 0;
                        data[idx + 1] = 0;
                        data[idx + 2] = 0;
                        data[idx + 3] = 255;
                    }
                }
            } else {
                // White
                const startX = col * GRID_SIZE;
                const startY = row * GRID_SIZE;
                for (let py = startY; py < startY + GRID_SIZE && py < canvas.height; py++) {
                    for (let px = startX; px < startX + GRID_SIZE && px < canvas.width; px++) {
                        const idx = (py * canvas.width + px) * 4;
                        data[idx] = 255;
                        data[idx + 1] = 255;
                        data[idx + 2] = 255;
                        data[idx + 3] = 255;
                    }
                }
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// --- Player (bat) drawn on top ---
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
    ctx.quadraticCurveTo(-15, -9 + wy, -22, -2 + wy * 0.5);
    ctx.quadraticCurveTo(-16, 3, -4, 1);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(4, 0);
    ctx.quadraticCurveTo(15, -9 + wy, 22, -2 + wy * 0.5);
    ctx.quadraticCurveTo(16, 3, 4, 1);
    ctx.fill();

    ctx.restore();
}

// --- Collision: sample field at player position ---
function isInFluid(px, py) {
    return fieldAt(px, py) >= THRESHOLD;
}

function findSurface(px, py, dy) {
    // Move up until we're out of fluid
    let y = py;
    for (let i = 0; i < 60; i++) {
        y += dy;
        if (!isInFluid(px, y)) return y;
    }
    return py;
}

// --- Animate border blobs for fluid feel ---
let time = 0;
const borderBlobOriginals = [];
for (const b of blobs) {
    if (b.type === 'border') {
        borderBlobOriginals.push({ x: b.x, y: b.y, r: b.r });
    }
}

function animateBlobs() {
    let idx = 0;
    for (const b of blobs) {
        if (b.type === 'border') {
            const orig = borderBlobOriginals[idx];
            b.x = orig.x + Math.sin(time * 0.8 + idx * 0.5) * 8;
            b.y = orig.y + Math.cos(time * 0.6 + idx * 0.7) * 6;
            b.r = orig.r + Math.sin(time * 1.2 + idx * 0.3) * 5;
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

    // Move and check collision
    player.x += player.vx;
    player.y += player.vy;

    // Push player out of fluid
    if (isInFluid(player.x, player.y)) {
        player.y = findSurface(player.x, player.y, -1);
        player.vy = 0;
    }

    // Keep in bounds
    if (player.x < 80) player.x = 80;
    if (player.x > canvas.width - 80) player.x = canvas.width - 80;
    if (player.y < 80) { player.y = 80; player.vy = 0; }

    player.wingPhase += 0.2;
}

// --- Render ---
function render() {
    computeField();
    renderField();
    drawBat(player.x, player.y, player.wingPhase);

    ctx.fillStyle = '#000';
    ctx.font = '11px monospace';
    ctx.fillText('WASD / Arrows + Space to fly', 160, canvas.height - 6);
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
