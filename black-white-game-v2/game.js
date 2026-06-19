const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// Render at half-res for performance, scale up
const SCALE = 2;
const W = Math.ceil(canvas.width / SCALE);
const H = Math.ceil(canvas.height / SCALE);
const offscreen = document.createElement('canvas');
offscreen.width = W;
offscreen.height = H;
const offCtx = offscreen.getContext('2d');

// --- SDF smooth minimum (polynomial smooth min) ---
// k controls the smoothness of the merge (higher = smoother blend)
function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * h * k * (1 / 6);
}

// --- World setup ---
const WORLD_W = 2400;
const WORLD_H = 1600;

// Player
const player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    vx: 0,
    vy: 0,
    r: 15,
    trail: [] // for droplet stretching
};

const pmoveSpeed = 2.5;
const pfriction = 0.95;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// Camera
const camera = { x: 0, y: 0 };

// World objects - each is a circle SDF that merges with everything else
const worldObjects = [];

function generateWorld() {
    // Border blobs (ring around the world)
    const borderSpacing = 80;
    // Top & bottom
    for (let x = 0; x <= WORLD_W; x += borderSpacing) {
        worldObjects.push({ x, y: -20, r: 55 + Math.random() * 15, vx: 0, vy: 0, fixed: true });
        worldObjects.push({ x, y: WORLD_H + 20, r: 55 + Math.random() * 15, vx: 0, vy: 0, fixed: true });
    }
    // Left & right
    for (let y = 0; y <= WORLD_H; y += borderSpacing) {
        worldObjects.push({ x: -20, y, r: 55 + Math.random() * 15, vx: 0, vy: 0, fixed: true });
        worldObjects.push({ x: WORLD_W + 20, y, r: 55 + Math.random() * 15, vx: 0, vy: 0, fixed: true });
    }

    // Scattered objects in the world (dynamic - can be pushed)
    for (let i = 0; i < 25; i++) {
        const x = 200 + Math.random() * (WORLD_W - 400);
        const y = 200 + Math.random() * (WORLD_H - 400);
        const dx = x - WORLD_W / 2;
        const dy = y - WORLD_H / 2;
        if (Math.sqrt(dx * dx + dy * dy) < 120) continue; // not too close to start
        worldObjects.push({
            x, y,
            r: 20 + Math.random() * 35,
            vx: 0, vy: 0,
            fixed: false
        });
    }

    // Larger clusters
    for (let k = 0; k < 6; k++) {
        const cx = 250 + Math.random() * (WORLD_W - 500);
        const cy = 250 + Math.random() * (WORLD_H - 500);
        const dx = cx - WORLD_W / 2;
        const dy = cy - WORLD_H / 2;
        if (Math.sqrt(dx * dx + dy * dy) < 180) continue;
        const count = 3 + Math.floor(Math.random() * 4);
        for (let c = 0; c < count; c++) {
            worldObjects.push({
                x: cx + (Math.random() - 0.5) * 80,
                y: cy + (Math.random() - 0.5) * 80,
                r: 25 + Math.random() * 25,
                vx: 0, vy: 0,
                fixed: false
            });
        }
    }
}
generateWorld();

// --- SDF evaluation at a world point ---
// Returns the signed distance to the nearest fluid surface
// Negative = inside fluid, Positive = outside (white space)
function sceneSDF(wx, wy) {
    let d = 99999;
    const BLEND_K = 30; // smooth merge radius

    // Player blob
    const pdx = wx - player.x;
    const pdy = wy - player.y;
    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy) - player.r;
    d = playerDist;

    // Player trail (stretching droplet)
    for (let t = 0; t < player.trail.length; t++) {
        const tr = player.trail[t];
        const tdx = wx - tr.x;
        const tdy = wy - tr.y;
        const trailR = player.r * (1 - t / player.trail.length) * 0.7;
        const trailDist = Math.sqrt(tdx * tdx + tdy * tdy) - trailR;
        d = smin(d, trailDist, BLEND_K);
    }

    // World objects (only check nearby ones for performance)
    for (let i = 0; i < worldObjects.length; i++) {
        const obj = worldObjects[i];
        const odx = wx - obj.x;
        const ody = wy - obj.y;

        // Skip if definitely too far (rough culling)
        if (Math.abs(odx) > obj.r + BLEND_K + 50 || Math.abs(ody) > obj.r + BLEND_K + 50) continue;

        const objDist = Math.sqrt(odx * odx + ody * ody) - obj.r;
        d = smin(d, objDist, BLEND_K);
    }

    return d;
}

// --- Physics: player pushes dynamic objects ---
function physicsStep() {
    const pushRadius = player.r + 40;

    for (const obj of worldObjects) {
        if (obj.fixed) continue;

        const dx = obj.x - player.x;
        const dy = obj.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < pushRadius + obj.r && dist > 0) {
            const overlap = pushRadius + obj.r - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            // Push force proportional to overlap and player speed
            const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
            const force = overlap * 0.05 + speed * 0.3;
            obj.vx += nx * force;
            obj.vy += ny * force;
        }

        // Object friction/drag
        obj.vx *= 0.92;
        obj.vy *= 0.92;
        obj.x += obj.vx;
        obj.y += obj.vy;

        // Keep in world
        if (obj.x < 80) { obj.x = 80; obj.vx *= -0.5; }
        if (obj.x > WORLD_W - 80) { obj.x = WORLD_W - 80; obj.vx *= -0.5; }
        if (obj.y < 80) { obj.y = 80; obj.vy *= -0.5; }
        if (obj.y > WORLD_H - 80) { obj.y = WORLD_H - 80; obj.vy *= -0.5; }
    }
}

// --- Update ---
function update() {
    // Player input (droplet-like: slow accel, high inertia)
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= pmoveSpeed * 0.12;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += pmoveSpeed * 0.12;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= pmoveSpeed * 0.12;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += pmoveSpeed * 0.12;

    player.vx *= pfriction;
    player.vy *= pfriction;
    player.x += player.vx;
    player.y += player.vy;

    // World bounds
    const margin = 70;
    if (player.x < margin) { player.x = margin; player.vx = 0; }
    if (player.x > WORLD_W - margin) { player.x = WORLD_W - margin; player.vx = 0; }
    if (player.y < margin) { player.y = margin; player.vy = 0; }
    if (player.y > WORLD_H - margin) { player.y = WORLD_H - margin; player.vy = 0; }

    // Trail for droplet stretching
    player.trail.unshift({ x: player.x, y: player.y });
    if (player.trail.length > 6) player.trail.pop();

    // Physics
    physicsStep();

    // Camera smooth follow
    const targetX = player.x - canvas.width / 2;
    const targetY = player.y - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.07;
    camera.y += (targetY - camera.y) * 0.07;
    camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));
}

// --- Render using SDF ---
function render() {
    const imageData = offCtx.createImageData(W, H);
    const data = imageData.data;

    for (let py = 0; py < H; py++) {
        const wy = camera.y + py * SCALE;
        for (let px = 0; px < W; px++) {
            const wx = camera.x + px * SCALE;
            const d = sceneSDF(wx, wy);
            const idx = (py * W + px) * 4;

            if (d <= 0) {
                // Inside fluid = black
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
            } else {
                // Outside = white
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
            }
            data[idx + 3] = 255;
        }
    }

    offCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
}

// --- Game loop ---
function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
