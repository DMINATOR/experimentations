const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- World is much larger than the screen ---
const SCALE = 8;
const WORLD_W = 2400; // world pixel width
const WORLD_H = 1600; // world pixel height
const N = Math.floor(WORLD_W / SCALE); // grid cols
const M = Math.floor(WORLD_H / SCALE); // grid rows
const SIZE = (N + 2) * (M + 2);

// Fluid fields
let density = new Float32Array(SIZE);
let densityPrev = new Float32Array(SIZE);
let vx = new Float32Array(SIZE);
let vxPrev = new Float32Array(SIZE);
let vy = new Float32Array(SIZE);
let vyPrev = new Float32Array(SIZE);

const DT = 0.15;
const DIFFUSION = 0.0003;
const VISCOSITY = 0.00005;
const ITERATIONS = 3;

function IX(x, y) { return x + (N + 2) * y; }

// --- Navier-Stokes solver ---
function setBoundary(b, field) {
    for (let i = 1; i <= N; i++) {
        field[IX(i, 0)] = b === 2 ? -field[IX(i, 1)] : field[IX(i, 1)];
        field[IX(i, M + 1)] = b === 2 ? -field[IX(i, M)] : field[IX(i, M)];
    }
    for (let j = 1; j <= M; j++) {
        field[IX(0, j)] = b === 1 ? -field[IX(1, j)] : field[IX(1, j)];
        field[IX(N + 1, j)] = b === 1 ? -field[IX(N, j)] : field[IX(N, j)];
    }
    field[IX(0, 0)] = 0.5 * (field[IX(1, 0)] + field[IX(0, 1)]);
    field[IX(0, M + 1)] = 0.5 * (field[IX(1, M + 1)] + field[IX(0, M)]);
    field[IX(N + 1, 0)] = 0.5 * (field[IX(N, 0)] + field[IX(N + 1, 1)]);
    field[IX(N + 1, M + 1)] = 0.5 * (field[IX(N, M + 1)] + field[IX(N + 1, M)]);
}

function diffuse(b, x, x0, diff, dt) {
    const a = dt * diff * N * M;
    for (let k = 0; k < ITERATIONS; k++) {
        for (let j = 1; j <= M; j++) {
            for (let i = 1; i <= N; i++) {
                x[IX(i, j)] = (x0[IX(i, j)] + a * (
                    x[IX(i - 1, j)] + x[IX(i + 1, j)] +
                    x[IX(i, j - 1)] + x[IX(i, j + 1)]
                )) / (1 + 4 * a);
            }
        }
        setBoundary(b, x);
    }
}

function advect(b, d, d0, u, v, dt) {
    const dt0x = dt * N;
    const dt0y = dt * M;
    for (let j = 1; j <= M; j++) {
        for (let i = 1; i <= N; i++) {
            let x = i - dt0x * u[IX(i, j)];
            let y = j - dt0y * v[IX(i, j)];
            if (x < 0.5) x = 0.5;
            if (x > N + 0.5) x = N + 0.5;
            if (y < 0.5) y = 0.5;
            if (y > M + 0.5) y = M + 0.5;
            const i0 = Math.floor(x), i1 = i0 + 1;
            const j0 = Math.floor(y), j1 = j0 + 1;
            const s1 = x - i0, s0 = 1 - s1;
            const t1 = y - j0, t0 = 1 - t1;
            d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                          s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
        }
    }
    setBoundary(b, d);
}

function project(u, v, p, div) {
    for (let j = 1; j <= M; j++) {
        for (let i = 1; i <= N; i++) {
            div[IX(i, j)] = -0.5 * (
                (u[IX(i + 1, j)] - u[IX(i - 1, j)]) / N +
                (v[IX(i, j + 1)] - v[IX(i, j - 1)]) / M
            );
            p[IX(i, j)] = 0;
        }
    }
    setBoundary(0, div);
    setBoundary(0, p);
    for (let k = 0; k < ITERATIONS; k++) {
        for (let j = 1; j <= M; j++) {
            for (let i = 1; i <= N; i++) {
                p[IX(i, j)] = (div[IX(i, j)] +
                    p[IX(i - 1, j)] + p[IX(i + 1, j)] +
                    p[IX(i, j - 1)] + p[IX(i, j + 1)]
                ) / 4;
            }
        }
        setBoundary(0, p);
    }
    for (let j = 1; j <= M; j++) {
        for (let i = 1; i <= N; i++) {
            u[IX(i, j)] -= 0.5 * N * (p[IX(i + 1, j)] - p[IX(i - 1, j)]);
            v[IX(i, j)] -= 0.5 * M * (p[IX(i, j + 1)] - p[IX(i, j - 1)]);
        }
    }
    setBoundary(1, u);
    setBoundary(2, v);
}

function velocityStep() {
    for (let i = 0; i < SIZE; i++) {
        vx[i] += DT * vxPrev[i];
        vy[i] += DT * vyPrev[i];
    }
    vxPrev.fill(0);
    vyPrev.fill(0);

    [vx, vxPrev] = [vxPrev, vx];
    diffuse(1, vx, vxPrev, VISCOSITY, DT);
    [vy, vyPrev] = [vyPrev, vy];
    diffuse(2, vy, vyPrev, VISCOSITY, DT);
    project(vx, vy, vxPrev, vyPrev);

    [vx, vxPrev] = [vxPrev, vx];
    [vy, vyPrev] = [vyPrev, vy];
    advect(1, vx, vxPrev, vxPrev, vyPrev, DT);
    advect(2, vy, vyPrev, vxPrev, vyPrev, DT);
    project(vx, vy, vxPrev, vyPrev);
}

function densityStep() {
    for (let i = 0; i < SIZE; i++) {
        density[i] += DT * densityPrev[i];
    }
    densityPrev.fill(0);

    [density, densityPrev] = [densityPrev, density];
    diffuse(0, density, densityPrev, DIFFUSION, DT);

    [density, densityPrev] = [densityPrev, density];
    advect(0, density, densityPrev, vx, vy, DT);
}

// --- Player (world coordinates) ---
const player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    vx: 0,
    vy: 0,
    prevX: WORLD_W / 2,
    prevY: WORLD_H / 2,
    // Trail positions for fluid stretching effect
    trail: []
};

const pmoveSpeed = 2.2;
const pfriction = 0.96; // high = slippery/floaty like liquid

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Camera ---
const camera = { x: 0, y: 0 };

function updateCamera() {
    // Smooth follow
    const targetX = player.x - canvas.width / 2;
    const targetY = player.y - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.08;
    camera.y += (targetY - camera.y) * 0.08;

    // Clamp to world bounds
    camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));
}

// --- World density sources ---
// Border around the entire world edge
function injectSources() {
    const borderWidth = 10;

    // World edges
    for (let i = 1; i <= N; i++) {
        for (let t = 0; t < borderWidth; t++) {
            density[IX(i, 1 + t)] = 100;
            density[IX(i, M - t)] = 100;
        }
    }
    for (let j = 1; j <= M; j++) {
        for (let t = 0; t < borderWidth; t++) {
            density[IX(1 + t, j)] = 100;
            density[IX(N - t, j)] = 100;
        }
    }

    // Scattered fluid objects throughout the world
    for (const obj of worldObjects) {
        const cx = Math.floor(obj.x / SCALE);
        const cy = Math.floor(obj.y / SCALE);
        const r = Math.floor(obj.r / SCALE);
        for (let di = -r; di <= r; di++) {
            for (let dj = -r; dj <= r; dj++) {
                if (di * di + dj * dj <= r * r) {
                    const i = cx + di;
                    const j = cy + dj;
                    if (i > 0 && i <= N && j > 0 && j <= M) {
                        density[IX(i, j)] = 80;
                    }
                }
            }
        }
    }
}

// Generate objects spread across the world
const worldObjects = [];
function generateWorld() {
    // Clusters of fluid blobs scattered around
    const count = 30;
    for (let k = 0; k < count; k++) {
        const x = 150 + Math.random() * (WORLD_W - 300);
        const y = 150 + Math.random() * (WORLD_H - 300);
        const r = 20 + Math.random() * 40;
        // Don't place too close to player start
        const dx = x - WORLD_W / 2;
        const dy = y - WORLD_H / 2;
        if (Math.sqrt(dx * dx + dy * dy) < 150) continue;
        worldObjects.push({ x, y, r });
    }

    // Some larger formations
    for (let k = 0; k < 8; k++) {
        const cx = 200 + Math.random() * (WORLD_W - 400);
        const cy = 200 + Math.random() * (WORLD_H - 400);
        const dx2 = cx - WORLD_W / 2;
        const dy2 = cy - WORLD_H / 2;
        if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < 200) continue;
        // Cluster of 3-5 blobs
        const clusterSize = 3 + Math.floor(Math.random() * 3);
        for (let c = 0; c < clusterSize; c++) {
            worldObjects.push({
                x: cx + (Math.random() - 0.5) * 60,
                y: cy + (Math.random() - 0.5) * 60,
                r: 25 + Math.random() * 30
            });
        }
    }
}
generateWorld();

// --- Player fluid interaction ---
function playerInteract() {
    const gi = Math.floor(player.x / SCALE);
    const gj = Math.floor(player.y / SCALE);
    const playerVx = player.x - player.prevX;
    const playerVy = player.y - player.prevY;
    const radius = 5;

    for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
            const ci = gi + di;
            const cj = gj + dj;
            if (ci > 0 && ci <= N && cj > 0 && cj <= M) {
                const dist = Math.sqrt(di * di + dj * dj);
                if (dist < radius) {
                    const factor = (1 - dist / radius);
                    // Only push velocity outward from player, not in movement direction
                    const nx = di / (dist + 0.01);
                    const ny = dj / (dist + 0.01);
                    const pushStrength = Math.sqrt(playerVx * playerVx + playerVy * playerVy);
                    vxPrev[IX(ci, cj)] += nx * pushStrength * factor * 3;
                    vyPrev[IX(ci, cj)] += ny * pushStrength * factor * 3;
                    // Clear density around player
                    density[IX(ci, cj)] *= (0.3 + dist / radius * 0.7);
                }
            }
        }
    }

    // Store trail positions (for stretching droplet effect)
    player.trail.unshift({ x: player.x, y: player.y });
    if (player.trail.length > 8) player.trail.pop();

    // Draw player as stretched droplet: main blob + trail blobs with decreasing size
    // Main body
    for (let di = -2; di <= 2; di++) {
        for (let dj = -2; dj <= 2; dj++) {
            const ci = gi + di;
            const cj = gj + dj;
            if (ci > 0 && ci <= N && cj > 0 && cj <= M) {
                if (di * di + dj * dj <= 4) {
                    density[IX(ci, cj)] = 100;
                }
            }
        }
    }

    // Trail (creates stretching/droplet shape)
    for (let t = 0; t < player.trail.length; t++) {
        const tr = player.trail[t];
        const ti = Math.floor(tr.x / SCALE);
        const tj = Math.floor(tr.y / SCALE);
        const trailR = Math.max(1, 2 - Math.floor(t / 3));
        for (let di = -trailR; di <= trailR; di++) {
            for (let dj = -trailR; dj <= trailR; dj++) {
                const ci = ti + di;
                const cj = tj + dj;
                if (ci > 0 && ci <= N && cj > 0 && cj <= M) {
                    if (di * di + dj * dj <= trailR * trailR) {
                        const strength = 90 - t * 10;
                        if (density[IX(ci, cj)] < strength) {
                            density[IX(ci, cj)] = strength;
                        }
                    }
                }
            }
        }
    }
}

// --- Update ---
function update() {
    player.prevX = player.x;
    player.prevY = player.y;

    // Gentle acceleration, high inertia (like a liquid drop sliding)
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= pmoveSpeed * 0.12;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += pmoveSpeed * 0.12;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= pmoveSpeed * 0.12;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += pmoveSpeed * 0.12;

    player.vx *= pfriction;
    player.vy *= pfriction;
    player.x += player.vx;
    player.y += player.vy;

    // World bounds
    const margin = 60;
    if (player.x < margin) { player.x = margin; player.vx = 0; }
    if (player.x > WORLD_W - margin) { player.x = WORLD_W - margin; player.vx = 0; }
    if (player.y < margin) { player.y = margin; player.vy = 0; }
    if (player.y > WORLD_H - margin) { player.y = WORLD_H - margin; player.vy = 0; }

    updateCamera();

    // Fluid sim
    injectSources();
    playerInteract();
    velocityStep();
    densityStep();

    // Decay - faster to clean stray particles
    for (let i = 0; i < SIZE; i++) {
        density[i] *= 0.99;
    }
}

// --- Render (only the visible portion) ---
function render() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    const camGi = Math.floor(camera.x / SCALE);
    const camGj = Math.floor(camera.y / SCALE);
    const viewCols = Math.ceil(canvas.width / SCALE);
    const viewRows = Math.ceil(canvas.height / SCALE);

    for (let py = 0; py < canvas.height; py++) {
        const gj = camGj + Math.floor(py / SCALE);
        for (let px = 0; px < canvas.width; px++) {
            const gi = camGi + Math.floor(px / SCALE);
            const idx = (py * canvas.width + px) * 4;

            if (gi >= 0 && gi <= N + 1 && gj >= 0 && gj <= M + 1) {
                const d = density[IX(gi, gj)];
                if (d > 40) {
                    data[idx] = 0;
                    data[idx + 1] = 0;
                    data[idx + 2] = 0;
                } else {
                    data[idx] = 255;
                    data[idx + 1] = 255;
                    data[idx + 2] = 255;
                }
            } else {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
            }
            data[idx + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
