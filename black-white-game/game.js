const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- Fluid simulation grid (Jos Stam's Stable Fluids) ---
const SCALE = 4; // each grid cell = 4px
const N = Math.floor(canvas.width / SCALE);  // grid width
const M = Math.floor(canvas.height / SCALE); // grid height
const SIZE = (N + 2) * (M + 2); // include boundary cells

// Fluid fields
let density = new Float32Array(SIZE);
let densityPrev = new Float32Array(SIZE);
let vx = new Float32Array(SIZE);
let vxPrev = new Float32Array(SIZE);
let vy = new Float32Array(SIZE);
let vyPrev = new Float32Array(SIZE);

// Simulation parameters
const DT = 0.1;
const DIFFUSION = 0.0001;
const VISCOSITY = 0.00001;
const ITERATIONS = 4; // Gauss-Seidel iterations

// --- Index helper ---
function IX(x, y) {
    return x + (N + 2) * y;
}

// --- Boundary conditions ---
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

// --- Diffusion (implicit method) ---
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

// --- Advection (semi-Lagrangian) ---
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

            const i0 = Math.floor(x);
            const i1 = i0 + 1;
            const j0 = Math.floor(y);
            const j1 = j0 + 1;
            const s1 = x - i0;
            const s0 = 1 - s1;
            const t1 = y - j0;
            const t0 = 1 - t1;

            d[IX(i, j)] = s0 * (t0 * d0[IX(i0, j0)] + t1 * d0[IX(i0, j1)]) +
                          s1 * (t0 * d0[IX(i1, j0)] + t1 * d0[IX(i1, j1)]);
        }
    }
    setBoundary(b, d);
}

// --- Projection (enforce incompressibility) ---
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

// --- Full velocity step ---
function velocityStep() {
    // Add forces (vxPrev/vyPrev are source terms)
    for (let i = 0; i < SIZE; i++) {
        vx[i] += DT * vxPrev[i];
        vy[i] += DT * vyPrev[i];
    }
    vxPrev.fill(0);
    vyPrev.fill(0);

    // Diffuse
    [vx, vxPrev] = [vxPrev, vx];
    diffuse(1, vx, vxPrev, VISCOSITY, DT);
    [vy, vyPrev] = [vyPrev, vy];
    diffuse(2, vy, vyPrev, VISCOSITY, DT);

    // Project
    project(vx, vy, vxPrev, vyPrev);

    // Advect
    [vx, vxPrev] = [vxPrev, vx];
    [vy, vyPrev] = [vyPrev, vy];
    advect(1, vx, vxPrev, vxPrev, vyPrev, DT);
    advect(2, vy, vyPrev, vxPrev, vyPrev, DT);

    // Project again
    project(vx, vy, vxPrev, vyPrev);
}

// --- Full density step ---
function densityStep() {
    // Add sources
    for (let i = 0; i < SIZE; i++) {
        density[i] += DT * densityPrev[i];
    }
    densityPrev.fill(0);

    // Diffuse
    [density, densityPrev] = [densityPrev, density];
    diffuse(0, density, densityPrev, DIFFUSION, DT);

    // Advect
    [density, densityPrev] = [densityPrev, density];
    advect(0, density, densityPrev, vx, vy, DT);
}

// --- Player ---
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2 - 50,
    vx: 0,
    vy: 0,
    prevX: canvas.width / 2,
    prevY: canvas.height / 2 - 50,
    wingPhase: 0
};

const pgravity = 0.2;
const flapForce = -5;
const pmoveSpeed = 3;
const pfriction = 0.92;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Inject density sources (border, ground, objects) ---
function injectStaticSources() {
    // Border
    for (let i = 1; i <= N; i++) {
        for (let t = 0; t < 6; t++) {
            densityPrev[IX(i, 1 + t)] += 80;    // top
            densityPrev[IX(i, M - t)] += 80;    // bottom
        }
    }
    for (let j = 1; j <= M; j++) {
        for (let t = 0; t < 6; t++) {
            densityPrev[IX(1 + t, j)] += 80;    // left
            densityPrev[IX(N - t, j)] += 80;    // right
        }
    }

    // Ground (bottom third)
    const groundRow = Math.floor(M * 0.78);
    for (let j = groundRow; j <= M; j++) {
        for (let i = 1; i <= N; i++) {
            densityPrev[IX(i, j)] += 60;
        }
    }

    // Tombstone (column of density)
    const t1i = Math.floor(N * 0.19);
    for (let j = groundRow - 12; j <= groundRow; j++) {
        densityPrev[IX(t1i, j)] += 50;
        densityPrev[IX(t1i + 1, j)] += 50;
        densityPrev[IX(t1i - 1, j)] += 50;
    }

    // Cross
    const cxi = Math.floor(N * 0.42);
    const cyj = groundRow - 10;
    for (let j = groundRow - 15; j <= groundRow; j++) {
        densityPrev[IX(cxi, j)] += 50;
        densityPrev[IX(cxi + 1, j)] += 40;
    }
    // Cross arms
    for (let i = cxi - 4; i <= cxi + 4; i++) {
        densityPrev[IX(i, cyj)] += 50;
        densityPrev[IX(i, cyj + 1)] += 40;
    }

    // Spire
    const sxi = Math.floor(N * 0.67);
    for (let j = groundRow - 18; j <= groundRow; j++) {
        const width = Math.max(1, Math.floor((groundRow - j) * 0.15));
        for (let w = -width; w <= width; w++) {
            if (sxi + w > 0 && sxi + w <= N) {
                densityPrev[IX(sxi + w, j)] += 45;
            }
        }
    }
}

// --- Player injects velocity into fluid ---
function playerInteractWithFluid() {
    const gi = Math.floor(player.x / SCALE);
    const gj = Math.floor(player.y / SCALE);
    const playerVx = player.x - player.prevX;
    const playerVy = player.y - player.prevY;
    const radius = 4;

    for (let di = -radius; di <= radius; di++) {
        for (let dj = -radius; dj <= radius; dj++) {
            const ci = gi + di;
            const cj = gj + dj;
            if (ci > 0 && ci <= N && cj > 0 && cj <= M) {
                const dist = Math.sqrt(di * di + dj * dj);
                if (dist < radius) {
                    const factor = (1 - dist / radius) * 5;
                    vxPrev[IX(ci, cj)] += playerVx * factor;
                    vyPrev[IX(ci, cj)] += playerVy * factor;
                    // Player also pushes density away
                    density[IX(ci, cj)] *= 0.7;
                }
            }
        }
    }

    // Also add density for the player blob itself
    for (let di = -2; di <= 2; di++) {
        for (let dj = -2; dj <= 2; dj++) {
            const ci = gi + di;
            const cj = gj + dj;
            if (ci > 0 && ci <= N && cj > 0 && cj <= M) {
                densityPrev[IX(ci, cj)] += 30;
            }
        }
    }

    // Wing blobs
    const wingY = Math.sin(player.wingPhase) * 3;
    const wings = [
        { dx: -18, dy: -2 + wingY },
        { dx: 18, dy: -2 + wingY },
    ];
    for (const w of wings) {
        const wi = Math.floor((player.x + w.dx) / SCALE);
        const wj = Math.floor((player.y + w.dy) / SCALE);
        if (wi > 0 && wi <= N && wj > 0 && wj <= M) {
            densityPrev[IX(wi, wj)] += 25;
            densityPrev[IX(wi + 1, wj)] += 20;
            densityPrev[IX(wi - 1, wj)] += 20;
        }
    }
}

// --- Simple collision: prevent player from going into high-density areas ---
function playerFluidCollision() {
    const gi = Math.floor(player.x / SCALE);
    const gj = Math.floor(player.y / SCALE);
    // Check density below player
    if (gi > 0 && gi <= N && gj > 0 && gj <= M) {
        const belowDensity = density[IX(gi, gj + 2)] || 0;
        if (belowDensity > 50 && player.vy > 0) {
            player.vy *= -0.3;
            player.y -= 2;
        }
    }
}

// --- Update ---
function update() {
    player.prevX = player.x;
    player.prevY = player.y;

    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= pmoveSpeed * 0.18;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += pmoveSpeed * 0.18;
    if (keys['ArrowUp'] || keys['KeyW'] || keys['Space']) {
        player.vy = flapForce;
    }

    player.vy += pgravity;
    player.vx *= pfriction;
    player.x += player.vx;
    player.y += player.vy;

    // Bounds
    if (player.x < 50) { player.x = 50; player.vx = 0; }
    if (player.x > canvas.width - 50) { player.x = canvas.width - 50; player.vx = 0; }
    if (player.y < 50) { player.y = 50; player.vy = 0; }
    if (player.y > canvas.height - 70) { player.y = canvas.height - 70; player.vy = 0; }

    player.wingPhase += 0.2;

    playerFluidCollision();

    // Fluid simulation
    injectStaticSources();
    playerInteractWithFluid();
    velocityStep();
    densityStep();

    // Density decay (prevents buildup)
    for (let i = 0; i < SIZE; i++) {
        density[i] *= 0.98;
    }
}

// --- Render density field ---
function render() {
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let py = 0; py < canvas.height; py++) {
        const gj = Math.floor(py / SCALE);
        for (let px = 0; px < canvas.width; px++) {
            const gi = Math.floor(px / SCALE);
            const d = density[IX(gi, gj)];
            const idx = (py * canvas.width + px) * 4;

            // Threshold: high density = black, low = white
            if (d > 15) {
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
