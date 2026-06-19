const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Game State ---
const player = {
    x: 200,
    y: 150,
    vx: 0,
    vy: 0,
    wingPhase: 0,
    grounded: false
};

const gravity = 0.3;
const flapForce = -5.5;
const moveSpeed = 3;
const friction = 0.92;

const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

// --- World contour: one continuous flowing line ---
// Everything (ground, tombstones, crosses, spires, trees) is part of one path.
function generateWorldContour() {
    const points = [];
    let x = -200;

    function add(dx, dy) {
        x += dx;
        points.push({ x, y: dy });
    }

    // Left wall
    points.push({ x: -200, y: -100 });
    points.push({ x: -200, y: 420 });
    points.push({ x: -150, y: 430 });
    x = -150;

    // Ground flows into features organically
    add(40, 435);
    add(30, 430);
    add(20, 425);
    add(15, 420);
    add(10, 425);
    add(20, 432);

    // Tombstone emerges from ground
    add(30, 433);
    add(5, 430);
    add(3, 410);
    add(2, 390);
    add(3, 375);
    add(5, 368);
    add(8, 365);
    add(6, 363);
    add(6, 365);
    add(8, 368);
    add(5, 375);
    add(3, 390);
    add(2, 410);
    add(3, 430);
    add(5, 433);

    // Rolling ground
    add(40, 436);
    add(35, 433);
    add(30, 430);

    // Cross grows from terrain
    add(20, 432);
    add(3, 428);
    add(2, 400);
    add(2, 382);
    // Left arm
    add(-10, 380);
    add(-4, 377);
    add(4, 374);
    add(10, 372);
    // Right arm
    add(10, 374);
    add(4, 377);
    add(-4, 380);
    add(-10, 382);
    // Stem continues up
    add(2, 365);
    add(2, 355);
    add(3, 350);
    add(3, 355);
    add(2, 365);
    add(2, 382);
    add(2, 400);
    add(3, 428);

    // Back to ground
    add(25, 434);
    add(50, 436);
    add(40, 432);

    // Gothic spire
    add(20, 430);
    add(5, 420);
    add(5, 395);
    add(4, 365);
    add(3, 335);
    add(2, 305);
    add(1, 285);
    add(1, 305);
    add(2, 335);
    add(3, 365);
    add(4, 395);
    add(5, 420);
    add(5, 430);

    // Ground with gentle undulation
    add(35, 436);
    add(45, 432);
    add(40, 428);
    add(50, 424);
    add(50, 428);
    add(40, 432);
    add(30, 436);

    // Another tombstone, rounder
    add(25, 435);
    add(4, 430);
    add(3, 412);
    add(3, 395);
    add(4, 383);
    add(6, 378);
    add(8, 376);
    add(8, 378);
    add(6, 383);
    add(4, 395);
    add(3, 412);
    add(4, 430);
    add(25, 435);

    // Jagged rocks
    add(20, 433);
    add(10, 425);
    add(5, 418);
    add(8, 425);
    add(5, 415);
    add(8, 422);
    add(10, 430);
    add(25, 435);

    // Large spire
    add(30, 433);
    add(5, 425);
    add(6, 395);
    add(4, 360);
    add(3, 325);
    add(2, 295);
    add(1, 270);
    add(1, 295);
    add(2, 325);
    add(3, 360);
    add(4, 395);
    add(6, 425);
    add(5, 433);

    // More terrain
    add(50, 436);
    add(60, 432);
    add(40, 434);

    // Dead tree trunk with branches
    add(20, 432);
    add(4, 420);
    add(4, 390);
    add(3, 360);
    // Branch left
    add(-6, 345);
    add(-8, 335);
    add(-4, 328);
    add(4, 332);
    add(8, 340);
    add(6, 348);
    // Continue trunk
    add(2, 335);
    add(2, 320);
    // Branch right
    add(8, 312);
    add(6, 305);
    add(2, 300);
    add(-6, 305);
    add(-8, 315);
    // Top
    add(2, 310);
    add(1, 305);
    add(1, 310);
    add(2, 320);
    add(2, 340);
    add(3, 360);
    add(4, 390);
    add(4, 420);
    add(4, 432);

    // Final stretch of ground
    add(60, 436);
    add(80, 433);
    add(60, 435);
    add(80, 432);
    add(100, 434);

    // Right wall
    const lastX = points[points.length - 1].x;
    points.push({ x: lastX + 50, y: 430 });
    points.push({ x: lastX + 50, y: -100 });

    return points;
}

const worldPoints = generateWorldContour();

// Catmull-Rom spline for smooth curves
function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
        (2 * p1) +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}

function getSmoothedContour(points, resolution) {
    const smooth = [];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[Math.min(points.length - 1, i + 1)];
        const p3 = points[Math.min(points.length - 1, i + 2)];

        for (let t = 0; t < 1; t += 1 / resolution) {
            smooth.push({
                x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
                y: catmullRom(p0.y, p1.y, p2.y, p3.y, t)
            });
        }
    }
    smooth.push(points[points.length - 1]);
    return smooth;
}

const smoothContour = getSmoothedContour(worldPoints, 8);

// --- Camera ---
const camera = { x: 0, y: 0 };

// --- Cloud border noise ---
let cloudTime = 0;

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
    grad(hash, x) { return (hash & 1) === 0 ? x : -x; }
    noise1D(x) {
        const X = Math.floor(x) & 255;
        x -= Math.floor(x);
        const u = this.fade(x);
        return this.lerp(this.grad(this.perm[X], x), this.grad(this.perm[X + 1], x - 1), u);
    }
}
const noise = new Noise();

// --- Collision with contour ---
function getGroundY(worldX) {
    let bestY = 500;
    for (let i = 0; i < smoothContour.length - 1; i++) {
        const a = smoothContour[i];
        const b = smoothContour[i + 1];
        if (a.x <= worldX && b.x > worldX) {
            const t = (worldX - a.x) / (b.x - a.x);
            const y = a.y + t * (b.y - a.y);
            // Take the highest (smallest y) ground point the player would collide with
            if (y > 250 && y < bestY) bestY = y;
        }
    }
    return bestY;
}

// --- Drawing ---
function drawBat(x, y, wingPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#000';

    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const wy = Math.sin(wingPhase) * 7;
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(-18, -10 + wy, -26, -3 + wy * 0.5);
    ctx.quadraticCurveTo(-20, 4, -5, 2);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.quadraticCurveTo(18, -10 + wy, 26, -3 + wy * 0.5);
    ctx.quadraticCurveTo(20, 4, 5, 2);
    ctx.fill();

    ctx.restore();
}

function drawWorldContour() {
    // Fill below the contour line with black
    ctx.fillStyle = '#000';
    ctx.beginPath();

    let started = false;
    let firstScreenX = 0;
    for (const pt of smoothContour) {
        const sx = pt.x - camera.x;
        if (sx < -100 || sx > canvas.width + 100) continue;
        if (!started) {
            ctx.moveTo(sx, pt.y);
            firstScreenX = sx;
            started = true;
        } else {
            ctx.lineTo(sx, pt.y);
        }
    }
    ctx.lineTo(canvas.width + 100, canvas.height + 10);
    ctx.lineTo(-100, canvas.height + 10);
    ctx.closePath();
    ctx.fill();

    // Draw the contour line on top for crispness
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    started = false;
    for (const pt of smoothContour) {
        const sx = pt.x - camera.x;
        if (sx < -100 || sx > canvas.width + 100) continue;
        if (!started) { ctx.moveTo(sx, pt.y); started = true; }
        else ctx.lineTo(sx, pt.y);
    }
    ctx.stroke();
}

function drawCloudBorder() {
    const seg = 60;
    const thick = 50;
    ctx.fillStyle = '#000';

    // Top
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const n = noise.noise1D(t * 4 + cloudTime * 0.3) * 0.5 + 0.5;
        ctx.lineTo(t * canvas.width, thick + n * 35);
    }
    ctx.lineTo(canvas.width, 0);
    ctx.closePath();
    ctx.fill();

    // Left
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const n = noise.noise1D(t * 4 + cloudTime * 0.25 + 99) * 0.5 + 0.5;
        ctx.lineTo(thick + n * 30, t * canvas.height);
    }
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fill();

    // Right
    ctx.beginPath();
    ctx.moveTo(canvas.width, 0);
    for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const n = noise.noise1D(t * 4 + cloudTime * 0.28 + 199) * 0.5 + 0.5;
        ctx.lineTo(canvas.width - thick - n * 30, t * canvas.height);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();
}

// --- Update ---
function update() {
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= moveSpeed * 0.2;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += moveSpeed * 0.2;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['Space']) {
        player.vy = flapForce;
        player.grounded = false;
    }

    player.vy += gravity;
    player.vx *= friction;
    player.x += player.vx;
    player.y += player.vy;

    const groundY = getGroundY(player.x);
    if (player.y >= groundY - 12) {
        player.y = groundY - 12;
        player.vy = 0;
        player.grounded = true;
    }

    if (player.y < 20) { player.y = 20; player.vy = 0; }

    player.wingPhase += player.grounded ? 0.05 : 0.22;
    camera.x += (player.x - canvas.width / 2 - camera.x) * 0.06;
    cloudTime += 0.016;
}

// --- Render ---
function render() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawWorldContour();
    drawBat(player.x - camera.x, player.y, player.wingPhase);
    drawCloudBorder();

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
