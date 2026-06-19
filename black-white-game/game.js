const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Player ---
const player = {
    x: 416,
    y: 220,
    vx: 0,
    vy: 0,
    wingPhase: 0,
    r: 12
};

const gravity = 0.18;
const flapForce = -4.5;
const moveSpeed = 2.8;
const friction = 0.93;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Fluid particles (dynamic, affected by physics) ---
const particles = [];
const PARTICLE_COUNT = 120;
const PARTICLE_R = 10;

// Particle physics constants
const P_GRAVITY = 0.1;
const P_FRICTION = 0.97;
const P_REPEL_DIST = 22;
const P_REPEL_FORCE = 0.8;
const P_ATTRACT_DIST = 50;
const P_ATTRACT_FORCE = 0.02;
const P_PLAYER_PUSH = 3.5;
const GROUND_Y = 430;

function initParticles() {
    // Scatter particles along the ground and in clusters
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const x = 60 + Math.random() * (canvas.width - 120);
        const y = GROUND_Y - Math.random() * 40;
        particles.push({
            x, y,
            vx: 0, vy: 0,
            r: PARTICLE_R + Math.random() * 4,
            restY: y // where they "want" to settle
        });
    }
}
initParticles();

// --- Static blobs (border, ground base, objects) ---
const staticBlobs = [];

function addBorderBlobs() {
    const spacing = 40;
    for (let x = -20; x <= canvas.width + 20; x += spacing) {
        staticBlobs.push({ x, y: -15, r: 35, type: 'border', ox: x, oy: -15, or: 35 });
    }
    for (let y = -20; y <= canvas.height + 20; y += spacing) {
        staticBlobs.push({ x: -15, y, r: 35, type: 'border', ox: -15, oy: y, or: 35 });
    }
    for (let y = -20; y <= canvas.height + 20; y += spacing) {
        staticBlobs.push({ x: canvas.width + 15, y, r: 35, type: 'border', ox: canvas.width + 15, oy: y, or: 35 });
    }
    for (let x = -20; x <= canvas.width + 20; x += spacing) {
        staticBlobs.push({ x, y: canvas.height + 15, r: 30, type: 'border', ox: x, oy: canvas.height + 15, or: 30 });
    }
}

function addGroundBlobs() {
    for (let x = -30; x <= canvas.width + 30; x += 30) {
        const yOff = Math.sin(x * 0.013) * 8;
        staticBlobs.push({ x, y: GROUND_Y + 20 + yOff, r: 25, type: 'ground' });
    }
    for (let x = -30; x <= canvas.width + 30; x += 35) {
        staticBlobs.push({ x, y: GROUND_Y + 55, r: 30, type: 'ground' });
    }
    for (let x = -30; x <= canvas.width + 30; x += 40) {
        staticBlobs.push({ x, y: canvas.height + 5, r: 30, type: 'ground' });
    }
}

function addObjectBlobs() {
    // Tombstone
    const t1 = 160;
    staticBlobs.push({ x: t1, y: GROUND_Y + 5, r: 14, type: 'object' });
    staticBlobs.push({ x: t1, y: GROUND_Y - 10, r: 12, type: 'object' });
    staticBlobs.push({ x: t1, y: GROUND_Y - 23, r: 11, type: 'object' });
    staticBlobs.push({ x: t1, y: GROUND_Y - 35, r: 10, type: 'object' });

    // Cross
    const cx = 350;
    staticBlobs.push({ x: cx, y: GROUND_Y + 5, r: 11, type: 'object' });
    staticBlobs.push({ x: cx, y: GROUND_Y - 8, r: 10, type: 'object' });
    staticBlobs.push({ x: cx, y: GROUND_Y - 20, r: 9, type: 'object' });
    staticBlobs.push({ x: cx, y: GROUND_Y - 32, r: 9, type: 'object' });
    staticBlobs.push({ x: cx - 14, y: GROUND_Y - 25, r: 7, type: 'object' });
    staticBlobs.push({ x: cx + 14, y: GROUND_Y - 25, r: 7, type: 'object' });

    // Spire
    const sx = 560;
    for (let i = 0; i < 6; i++) {
        staticBlobs.push({ x: sx, y: GROUND_Y + 5 - i * 14, r: 11 - i * 0.8, type: 'object' });
    }

    // Mound
    staticBlobs.push({ x: 700, y: GROUND_Y + 5, r: 12, type: 'object' });
    staticBlobs.push({ x: 700, y: GROUND_Y - 8, r: 10, type: 'object' });
}

addBorderBlobs();
addGroundBlobs();
addObjectBlobs();

// --- Particle physics ---
function updateParticles() {
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Gravity
        p.vy += P_GRAVITY;

        // Player interaction - push particles away
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pushRadius = player.r + p.r + 15;

        if (dist < pushRadius && dist > 0) {
            const force = P_PLAYER_PUSH * (1 - dist / pushRadius);
            const nx = dx / dist;
            const ny = dy / dist;
            p.vx += nx * force;
            p.vy += ny * force;

            // Also transfer player velocity to particles
            p.vx += player.vx * 0.3;
            p.vy += player.vy * 0.2;
        }

        // Particle-particle interaction
        for (let j = i + 1; j < particles.length; j++) {
            const q = particles[j];
            const ddx = p.x - q.x;
            const ddy = p.y - q.y;
            const d = Math.sqrt(ddx * ddx + ddy * ddy);

            if (d < P_REPEL_DIST && d > 0) {
                // Repel when too close
                const f = P_REPEL_FORCE * (1 - d / P_REPEL_DIST);
                const nnx = ddx / d;
                const nny = ddy / d;
                p.vx += nnx * f;
                p.vy += nny * f;
                q.vx -= nnx * f;
                q.vy -= nny * f;
            } else if (d < P_ATTRACT_DIST && d > P_REPEL_DIST) {
                // Weak attraction (cohesion)
                const f = P_ATTRACT_FORCE;
                const nnx = ddx / d;
                const nny = ddy / d;
                p.vx -= nnx * f;
                p.vy -= nny * f;
                q.vx += nnx * f;
                q.vy += nny * f;
            }
        }

        // Collision with static objects
        for (const s of staticBlobs) {
            if (s.type === 'border') continue; // borders handled by bounds
            const sdx = p.x - s.x;
            const sdy = p.y - s.y;
            const sd = Math.sqrt(sdx * sdx + sdy * sdy);
            const minDist = p.r + s.r * 0.6;
            if (sd < minDist && sd > 0) {
                const f = 1.5 * (1 - sd / minDist);
                p.vx += (sdx / sd) * f;
                p.vy += (sdy / sd) * f;
            }
        }

        // Friction
        p.vx *= P_FRICTION;
        p.vy *= P_FRICTION;

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Ground collision
        if (p.y > GROUND_Y + 10) {
            p.y = GROUND_Y + 10;
            p.vy *= -0.3;
            p.vx *= 0.9;
        }

        // Walls
        if (p.x < 50) { p.x = 50; p.vx *= -0.5; }
        if (p.x > canvas.width - 50) { p.x = canvas.width - 50; p.vx *= -0.5; }
        if (p.y < 50) { p.y = 50; p.vy *= -0.3; }
    }
}

// --- Border animation ---
let time = 0;
function animateBorderBlobs() {
    for (let i = 0; i < staticBlobs.length; i++) {
        const b = staticBlobs[i];
        if (b.type === 'border') {
            b.x = b.ox + Math.sin(time * 0.5 + i * 0.4) * 6;
            b.y = b.oy + Math.cos(time * 0.4 + i * 0.6) * 5;
            b.r = b.or + Math.sin(time * 0.8 + i * 0.3) * 3;
        }
    }
}

// --- Player collision with ground/objects ---
function playerCollision() {
    for (const s of staticBlobs) {
        if (s.type === 'border') continue;
        const dx = player.x - s.x;
        const dy = player.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = player.r + s.r * 0.5;
        if (dist < minDist && dist > 0) {
            const push = (minDist - dist) * 0.5;
            player.x += (dx / dist) * push;
            player.y += (dy / dist) * push;
            player.vy *= -0.2;
            player.vx *= 0.7;
        }
    }
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
    player.x += player.vx;
    player.y += player.vy;

    playerCollision();

    // Bounds
    if (player.x < 70) { player.x = 70; player.vx = 0; }
    if (player.x > canvas.width - 70) { player.x = canvas.width - 70; player.vx = 0; }
    if (player.y < 70) { player.y = 70; player.vy = 0; }
    if (player.y > canvas.height - 80) { player.y = canvas.height - 80; player.vy = 0; }

    player.wingPhase += 0.2;

    updateParticles();
}

// --- Render ---
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#000';

    // Static blobs
    for (const b of staticBlobs) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Dynamic fluid particles
    for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
    }

    // Player blobs
    const wingY = Math.sin(player.wingPhase) * 5;
    // Body
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    // Wings
    ctx.beginPath();
    ctx.arc(player.x - 18, player.y - 2 + wingY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x + 18, player.y - 2 + wingY, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x - 10, player.y + wingY * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(player.x + 10, player.y + wingY * 0.5, 9, 0, Math.PI * 2);
    ctx.fill();
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
