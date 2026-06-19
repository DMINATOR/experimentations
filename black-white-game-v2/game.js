const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Navier-Stokes grid ---
const SCALE = 4;
const N = Math.floor(canvas.width / SCALE);
const M = Math.floor(canvas.height / SCALE);
const SIZE = (N + 2) * (M + 2);

let density = new Float32Array(SIZE);
let densityPrev = new Float32Array(SIZE);
let vx = new Float32Array(SIZE);
let vxPrev = new Float32Array(SIZE);
let vy = new Float32Array(SIZE);
let vyPrev = new Float32Array(SIZE);

const DT = 0.15;
const DIFFUSION = 0.0002;
const VISCOSITY = 0.00005;
const ITERATIONS = 4;

function IX(x, y) { return x + (N + 2) * y; }

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

// --- Player (top-down, free movement) ---
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    vx: 0,
    vy: 0,
    prevX: canvas.width / 2,
    prevY: canvas.height / 2
};

const pmoveSpeed = 3.5;
const pfriction = 0.88;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Density sources: border ring + scattered objects ---
function injectSources() {
    const borderWidth = 8;

    // Border ring - constant source of fluid creeping inward
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

    // Objects: fixed density blobs in the world
    // These are like "islands" of fluid in the play area
    const objects = [
        { cx: N * 0.25, cy: M * 0.6, r: 5 },
        { cx: N * 0.4, cy: M * 0.35, r: 4 },
        { cx: N * 0.65, cy: M * 0.7, r: 6 },
        { cx: N * 0.75, cy: M * 0.3, r: 4 },
        { cx: N * 0.15, cy: M * 0.3, r: 3 },
        { cx: N * 0.85, cy: M * 0.55, r: 5 },
    ];

    for (const obj of objects) {
        const cx = Math.floor(obj.cx);
        const cy = Math.floor(obj.cy);
        for (let di = -obj.r; di <= obj.r; di++) {
            for (let dj = -obj.r; dj <= obj.r; dj++) {
                if (di * di + dj * dj <= obj.r * obj.r) {
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

// --- Player interacts with fluid ---
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
                    // Push fluid velocity in player's direction
                    vxPrev[IX(ci, cj)] += playerVx * factor * 8;
                    vyPrev[IX(ci, cj)] += playerVy * factor * 8;
                    // Player carves through - reduce density
                    density[IX(ci, cj)] *= (0.5 + dist / radius * 0.5);
                }
            }
        }
    }

    // Player is also a density source (part of the fluid) - set directly so it's visible
    for (let di = -3; di <= 3; di++) {
        for (let dj = -3; dj <= 3; dj++) {
            const ci = gi + di;
            const cj = gj + dj;
            if (ci > 0 && ci <= N && cj > 0 && cj <= M) {
                if (di * di + dj * dj <= 9) {
                    density[IX(ci, cj)] = 100;
                }
            }
        }
    }
}

// --- Update ---
function update() {
    player.prevX = player.x;
    player.prevY = player.y;

    // 8-directional top-down movement
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= pmoveSpeed * 0.2;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += pmoveSpeed * 0.2;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= pmoveSpeed * 0.2;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += pmoveSpeed * 0.2;

    player.vx *= pfriction;
    player.vy *= pfriction;
    player.x += player.vx;
    player.y += player.vy;

    // Bounds
    const margin = 40;
    if (player.x < margin) { player.x = margin; player.vx = 0; }
    if (player.x > canvas.width - margin) { player.x = canvas.width - margin; player.vx = 0; }
    if (player.y < margin) { player.y = margin; player.vy = 0; }
    if (player.y > canvas.height - margin) { player.y = canvas.height - margin; player.vy = 0; }

    // Fluid
    injectSources();
    playerInteract();
    velocityStep();
    densityStep();

    // Gentle global decay to prevent over-saturation
    for (let i = 0; i < SIZE; i++) {
        density[i] *= 0.995;
    }
}

// --- Render ---
function render() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let py = 0; py < canvas.height; py++) {
        const gj = Math.floor(py / SCALE);
        for (let px = 0; px < canvas.width; px++) {
            const gi = Math.floor(px / SCALE);
            const d = density[IX(gi, gj)];
            const idx = (py * canvas.width + px) * 4;

            if (d > 20) {
                data[idx] = 0;
                data[idx + 1] = 0;
                data[idx + 2] = 0;
            } else {
                data[idx] = 255;
                data[idx + 1] = 255;
                data[idx + 2] = 255;
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
