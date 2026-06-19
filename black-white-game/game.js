const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Simplex-like noise for organic cloud border ---
class Noise {
    constructor() {
        this.perm = [];
        for (let i = 0; i < 256; i++) this.perm[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
        }
        this.perm = this.perm.concat(this.perm);
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + t * (b - a); }
    grad(hash, x) {
        return (hash & 1) === 0 ? x : -x;
    }

    noise1D(x) {
        const X = Math.floor(x) & 255;
        x -= Math.floor(x);
        const u = this.fade(x);
        return this.lerp(this.grad(this.perm[X], x), this.grad(this.perm[X + 1], x - 1), u);
    }
}

const noise = new Noise();

// --- Game State ---
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2 - 50,
    vx: 0,
    vy: 0,
    width: 40,
    height: 20,
    wingPhase: 0,
    grounded: false
};

const gravity = 0.3;
const flapForce = -6;
const moveSpeed = 3;
const friction = 0.92;

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// --- World objects (silhouettes) ---
const worldObjects = [];
const groundY = canvas.height - 80;

function generateWorld() {
    // Crosses
    for (let i = 0; i < 5; i++) {
        worldObjects.push({
            type: 'cross',
            x: 100 + i * 160 + Math.random() * 60,
            y: groundY,
            width: 20,
            height: 40 + Math.random() * 20
        });
    }
    // Pointed structures (gothic spires)
    for (let i = 0; i < 3; i++) {
        worldObjects.push({
            type: 'spire',
            x: 200 + i * 250 + Math.random() * 80,
            y: groundY,
            width: 30 + Math.random() * 20,
            height: 60 + Math.random() * 40
        });
    }
}
generateWorld();

// --- Camera ---
const camera = { x: 0, y: 0 };

// --- Cloud border state ---
let cloudTime = 0;
const cloudThickness = 70; // base thickness of the black border cloud

// --- Drawing functions ---
function drawBat(x, y, wingPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#000';

    // Body
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wings
    const wingY = Math.sin(wingPhase) * 8;
    // Left wing
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-25, -15 + wingY, -35, -5 + wingY * 0.5);
    ctx.quadraticCurveTo(-28, 5, -8, 2);
    ctx.fill();

    // Right wing
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.quadraticCurveTo(25, -15 + wingY, 35, -5 + wingY * 0.5);
    ctx.quadraticCurveTo(28, 5, 8, 2);
    ctx.fill();

    ctx.restore();
}

function drawCross(obj) {
    const x = obj.x - camera.x;
    const y = obj.y;
    const w = obj.width;
    const h = obj.height;

    ctx.fillStyle = '#000';
    // Vertical bar
    ctx.fillRect(x - w * 0.2, y - h, w * 0.4, h);
    // Horizontal bar
    ctx.fillRect(x - w * 0.5, y - h * 0.7, w, w * 0.3);
}

function drawSpire(obj) {
    const x = obj.x - camera.x;
    const y = obj.y;
    const w = obj.width;
    const h = obj.height;

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.closePath();
    ctx.fill();
}

function drawGround() {
    ctx.fillStyle = '#000';
    // Uneven ground with slight bumps
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    for (let x = 0; x <= canvas.width; x += 4) {
        const worldX = x + camera.x;
        const bump = noise.noise1D(worldX * 0.01) * 8;
        ctx.lineTo(x, groundY + bump);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();
}

function drawCloudBorder() {
    // Draw organic black cloud border around the edges
    ctx.fillStyle = '#000';

    const segments = 80;

    // Top border
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * canvas.width;
        const noiseVal = noise.noise1D(t * 4 + cloudTime * 0.3) * 0.5 + 0.5;
        const thickness = cloudThickness + noiseVal * 50;
        ctx.lineTo(x, thickness);
    }
    ctx.lineTo(canvas.width, 0);
    ctx.closePath();
    ctx.fill();

    // Left border
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * canvas.height;
        const noiseVal = noise.noise1D(t * 4 + cloudTime * 0.25 + 100) * 0.5 + 0.5;
        const thickness = cloudThickness + noiseVal * 45;
        ctx.lineTo(thickness, y);
    }
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Right border
    ctx.beginPath();
    ctx.moveTo(canvas.width, 0);
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = t * canvas.height;
        const noiseVal = noise.noise1D(t * 4 + cloudTime * 0.28 + 200) * 0.5 + 0.5;
        const thickness = cloudThickness + noiseVal * 45;
        ctx.lineTo(canvas.width - thickness, y);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Bottom border (merges with ground, thinner)
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const x = t * canvas.width;
        const noiseVal = noise.noise1D(t * 4 + cloudTime * 0.22 + 300) * 0.5 + 0.5;
        const thickness = 20 + noiseVal * 30;
        ctx.lineTo(x, canvas.height - thickness);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();
}

// --- Update ---
function update() {
    // Movement
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= moveSpeed * 0.2;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += moveSpeed * 0.2;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['Space']) {
        player.vy = flapForce;
        player.grounded = false;
    }

    // Physics
    player.vy += gravity;
    player.vx *= friction;
    player.x += player.vx;
    player.y += player.vy;

    // Ground collision
    if (player.y >= groundY - 10) {
        player.y = groundY - 10;
        player.vy = 0;
        player.grounded = true;
    }

    // Ceiling
    if (player.y < 30) {
        player.y = 30;
        player.vy = 0;
    }

    // Wing animation
    if (!player.grounded) {
        player.wingPhase += 0.2;
    } else {
        player.wingPhase += 0.05;
    }

    // Camera follows player horizontally
    camera.x += (player.x - canvas.width / 2 - camera.x) * 0.05;

    // Cloud animation
    cloudTime += 0.016;
}

// --- Render ---
function render() {
    // White background (the "visible" area)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw world objects
    for (const obj of worldObjects) {
        const screenX = obj.x - camera.x;
        if (screenX > -100 && screenX < canvas.width + 100) {
            if (obj.type === 'cross') drawCross(obj);
            else if (obj.type === 'spire') drawSpire(obj);
        }
    }

    // Draw ground
    drawGround();

    // Draw player (bat)
    const screenX = player.x - camera.x;
    drawBat(screenX, player.y, player.wingPhase);

    // Draw cloud border on top of everything
    drawCloudBorder();

    // Instructions
    ctx.fillStyle = '#000';
    ctx.font = '12px monospace';
    ctx.fillText('WASD / Arrows to move, Space/Up to flap', 140, canvas.height - 8);
}

// --- Game Loop ---
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
