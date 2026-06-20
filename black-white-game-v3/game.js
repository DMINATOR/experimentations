const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 832;
canvas.height = 520;

// --- World ---
const WORLD_W = 3200;
const WORLD_H = 3200;

// --- Player (the light) ---
const player = {
    x: WORLD_W / 2,
    y: WORLD_H / 2,
    vx: 0,
    vy: 0,
    lightRadius: 120,     // base radius of player's light
    lightFlicker: 0,      // animation phase
};

const pmoveSpeed = 2.2;
const pfriction = 0.91;

const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; e.preventDefault(); });
window.addEventListener('keyup', e => keys[e.code] = false);

// --- Camera ---
const camera = { x: 0, y: 0 };

// --- Ancient structures hidden in the dark ---
// Types: 'ruin_wall', 'pillar', 'arch', 'altar', 'obelisk', 'statue'
const structures = [];
const relics = []; // special objects that permanently light an area
const torches = []; // torches near structures, lit when player passes
const litAreas = []; // areas permanently illuminated

function generateWorld() {
    const rng = (min, max) => min + Math.random() * (max - min);

    // Scattered ruins across the world
    for (let i = 0; i < 60; i++) {
        const x = rng(200, WORLD_W - 200);
        const y = rng(200, WORLD_H - 200);
        // Skip near player start
        if (Math.abs(x - WORLD_W / 2) < 200 && Math.abs(y - WORLD_H / 2) < 200) continue;

        const type = ['ruin_wall', 'pillar', 'arch', 'pillar', 'obelisk', 'statue'][Math.floor(Math.random() * 6)];
        structures.push({ x, y, type, discovered: false });
    }

    // Clusters of ruins (old settlements)
    for (let k = 0; k < 8; k++) {
        const cx = rng(400, WORLD_W - 400);
        const cy = rng(400, WORLD_H - 400);
        if (Math.abs(cx - WORLD_W / 2) < 300 && Math.abs(cy - WORLD_H / 2) < 300) continue;
        const count = 5 + Math.floor(Math.random() * 6);
        for (let c = 0; c < count; c++) {
            structures.push({
                x: cx + rng(-120, 120),
                y: cy + rng(-120, 120),
                type: ['ruin_wall', 'pillar', 'arch'][Math.floor(Math.random() * 3)],
                discovered: false
            });
        }
        // Each settlement has a relic at its center
        relics.push({
            x: cx + rng(-30, 30),
            y: cy + rng(-30, 30),
            activated: false,
            lightRadius: 180 + Math.random() * 80,
            pulsePhase: Math.random() * Math.PI * 2
        });
        // Torches around the settlement
        const torchCount = 3 + Math.floor(Math.random() * 4);
        for (let t = 0; t < torchCount; t++) {
            const angle = (t / torchCount) * Math.PI * 2 + Math.random() * 0.5;
            const dist = 60 + Math.random() * 60;
            torches.push({
                x: cx + Math.cos(angle) * dist,
                y: cy + Math.sin(angle) * dist,
                lit: false,
                lightRadius: 50 + Math.random() * 20,
                flickerPhase: Math.random() * Math.PI * 2
            });
        }
    }

    // Additional standalone relics
    for (let i = 0; i < 6; i++) {
        const x = rng(300, WORLD_W - 300);
        const y = rng(300, WORLD_H - 300);
        if (Math.abs(x - WORLD_W / 2) < 250 && Math.abs(y - WORLD_H / 2) < 250) continue;
        relics.push({
            x, y,
            activated: false,
            lightRadius: 140 + Math.random() * 60,
            pulsePhase: Math.random() * Math.PI * 2
        });
    }

    // Scattered torches throughout the world (along ancient paths)
    for (let i = 0; i < 40; i++) {
        const x = rng(150, WORLD_W - 150);
        const y = rng(150, WORLD_H - 150);
        if (Math.abs(x - WORLD_W / 2) < 150 && Math.abs(y - WORLD_H / 2) < 150) continue;
        torches.push({
            x, y,
            lit: false,
            lightRadius: 45 + Math.random() * 25,
            flickerPhase: Math.random() * Math.PI * 2
        });
    }
    }
}
generateWorld();

// --- Drawing structures ---
function drawRuinWall(x, y) {
    ctx.fillStyle = '#aaa';
    // Broken wall segments
    ctx.fillRect(x - 20, y - 5, 8, 18);
    ctx.fillRect(x - 8, y - 8, 10, 22);
    ctx.fillRect(x + 5, y - 3, 7, 15);
    ctx.fillRect(x + 14, y - 6, 6, 12);
}

function drawPillar(x, y) {
    ctx.fillStyle = '#bbb';
    ctx.fillRect(x - 4, y - 25, 8, 25);
    // Base
    ctx.fillRect(x - 7, y - 2, 14, 4);
    // Capital (if not broken)
    if (Math.random() > 0.3) {
        ctx.fillRect(x - 6, y - 27, 12, 3);
    }
}

function drawArch(x, y) {
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y - 10, 18, Math.PI, 0);
    ctx.stroke();
    // Pillars on each side
    ctx.fillStyle = '#999';
    ctx.fillRect(x - 20, y - 10, 5, 25);
    ctx.fillRect(x + 15, y - 10, 5, 25);
}

function drawObelisk(x, y) {
    ctx.fillStyle = '#ccc';
    // Tall narrow stone
    ctx.beginPath();
    ctx.moveTo(x, y - 40);
    ctx.lineTo(x - 6, y);
    ctx.lineTo(x + 6, y);
    ctx.closePath();
    ctx.fill();
    // Base
    ctx.fillRect(x - 9, y - 2, 18, 5);
}

function drawStatue(x, y) {
    ctx.fillStyle = '#bbb';
    ctx.beginPath();
    ctx.arc(x, y - 28, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 5, y - 22, 10, 18);
    ctx.fillStyle = '#999';
    ctx.fillRect(x - 10, y - 2, 20, 5);
}

function drawTorch(x, y, lit, time, flickerPhase) {
    // Stick
    ctx.fillStyle = '#665544';
    ctx.fillRect(x - 2, y - 12, 4, 14);
    // Base holder
    ctx.fillStyle = '#887766';
    ctx.fillRect(x - 4, y - 14, 8, 3);

    if (lit) {
        // Flame
        const flicker = Math.sin(time * 12 + flickerPhase) * 2;
        const flicker2 = Math.sin(time * 17 + flickerPhase) * 1.5;

        // Outer flame glow
        const grd = ctx.createRadialGradient(x, y - 18, 0, x + flicker2, y - 22, 12);
        grd.addColorStop(0, 'rgba(255, 220, 100, 0.9)');
        grd.addColorStop(0.4, 'rgba(255, 180, 50, 0.6)');
        grd.addColorStop(1, 'rgba(255, 120, 20, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x + flicker2, y - 20, 12, 0, Math.PI * 2);
        ctx.fill();

        // Inner bright flame
        ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x - 3 + flicker2, y - 14);
        ctx.quadraticCurveTo(x + flicker, y - 26 + flicker2, x + 3 + flicker2, y - 14);
        ctx.fill();
    }
}

function drawStructure(s, screenX, screenY) {
    ctx.save();
    switch (s.type) {
        case 'ruin_wall': drawRuinWall(screenX, screenY); break;
        case 'pillar': drawPillar(screenX, screenY); break;
        case 'arch': drawArch(screenX, screenY); break;
        case 'obelisk': drawObelisk(screenX, screenY); break;
        case 'statue': drawStatue(screenX, screenY); break;
    }
    ctx.restore();
}

// --- Draw relic (glowing orb when not activated, beacon when activated) ---
function drawRelic(r, screenX, screenY, time) {
    if (!r.activated) {
        // Dim pulsing orb waiting to be discovered
        const pulse = 0.3 + Math.sin(time * 2 + r.pulsePhase) * 0.15;
        ctx.fillStyle = `rgba(255, 255, 200, ${pulse})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 5, 0, Math.PI * 2);
        ctx.fill();
        // Faint glow
        const grd = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, 15);
        grd.addColorStop(0, `rgba(255, 255, 180, ${pulse * 0.4})`);
        grd.addColorStop(1, 'rgba(255, 255, 180, 0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 15, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Activated: bright beacon
        const pulse = 0.8 + Math.sin(time * 1.5 + r.pulsePhase) * 0.2;
        ctx.fillStyle = `rgba(255, 255, 220, ${pulse})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
        ctx.fill();
        // Bright glow ring
        ctx.strokeStyle = `rgba(255, 255, 200, ${pulse * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 10 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();
    }
}

// --- Light mask: everything starts dark, light reveals ---
function applyDarkness(time) {
    // Draw darkness overlay
    // Use a temporary canvas to build the light mask
    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = canvas.width;
    lightCanvas.height = canvas.height;
    const lctx = lightCanvas.getContext('2d');

    // Start fully opaque black
    lctx.fillStyle = '#000';
    lctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cut out light areas using destination-out composite
    lctx.globalCompositeOperation = 'destination-out';

    // Player's light (flickering)
    const flicker = Math.sin(time * 8) * 3 + Math.sin(time * 13) * 2 + Math.sin(time * 21) * 1;
    const playerR = player.lightRadius + flicker;
    const px = player.x - camera.x;
    const py = player.y - camera.y;

    const playerGrd = lctx.createRadialGradient(px, py, 0, px, py, playerR);
    playerGrd.addColorStop(0, 'rgba(0,0,0,1)');
    playerGrd.addColorStop(0.5, 'rgba(0,0,0,0.8)');
    playerGrd.addColorStop(0.8, 'rgba(0,0,0,0.3)');
    playerGrd.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = playerGrd;
    lctx.beginPath();
    lctx.arc(px, py, playerR, 0, Math.PI * 2);
    lctx.fill();

    // Activated relic lights
    for (const r of relics) {
        if (!r.activated) continue;
        const rx = r.x - camera.x;
        const ry = r.y - camera.y;
        if (rx < -r.lightRadius || rx > canvas.width + r.lightRadius ||
            ry < -r.lightRadius || ry > canvas.height + r.lightRadius) continue;

        const pulse = r.lightRadius + Math.sin(time * 1.2 + r.pulsePhase) * 10;
        const relicGrd = lctx.createRadialGradient(rx, ry, 0, rx, ry, pulse);
        relicGrd.addColorStop(0, 'rgba(0,0,0,1)');
        relicGrd.addColorStop(0.4, 'rgba(0,0,0,0.7)');
        relicGrd.addColorStop(0.7, 'rgba(0,0,0,0.3)');
        relicGrd.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = relicGrd;
        lctx.beginPath();
        lctx.arc(rx, ry, pulse, 0, Math.PI * 2);
        lctx.fill();
    }

    // Lit torch lights
    for (const t of torches) {
        if (!t.lit) continue;
        const tx = t.x - camera.x;
        const ty = t.y - camera.y;
        const tr = t.lightRadius;
        if (tx < -tr || tx > canvas.width + tr || ty < -tr || ty > canvas.height + tr) continue;

        const flicker = tr + Math.sin(time * 10 + t.flickerPhase) * 4 + Math.sin(time * 7 + t.flickerPhase * 2) * 2;
        const torchGrd = lctx.createRadialGradient(tx, ty - 16, 0, tx, ty - 16, flicker);
        torchGrd.addColorStop(0, 'rgba(0,0,0,1)');
        torchGrd.addColorStop(0.3, 'rgba(0,0,0,0.7)');
        torchGrd.addColorStop(0.6, 'rgba(0,0,0,0.25)');
        torchGrd.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = torchGrd;
        lctx.beginPath();
        lctx.arc(tx, ty - 16, flicker, 0, Math.PI * 2);
        lctx.fill();
    }

    // Draw the darkness mask on top of the game
    ctx.drawImage(lightCanvas, 0, 0);
}

// --- Ground texture (subtle grid/cracks in the stone floor) ---
function drawGround() {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle stone tile grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 0.5;
    const tileSize = 40;
    const offX = camera.x % tileSize;
    const offY = camera.y % tileSize;
    for (let x = -offX; x < canvas.width; x += tileSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = -offY; y < canvas.height; y += tileSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

// --- Draw player (small glowing figure) ---
function drawPlayer(time) {
    const px = player.x - camera.x;
    const py = player.y - camera.y;

    // Inner warm glow
    const innerGrd = ctx.createRadialGradient(px, py, 0, px, py, 20);
    innerGrd.addColorStop(0, 'rgba(255, 250, 220, 0.9)');
    innerGrd.addColorStop(0.5, 'rgba(255, 240, 180, 0.4)');
    innerGrd.addColorStop(1, 'rgba(255, 230, 150, 0)');
    ctx.fillStyle = innerGrd;
    ctx.beginPath();
    ctx.arc(px, py, 20, 0, Math.PI * 2);
    ctx.fill();

    // Core bright dot
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();

    // Small rays
    ctx.strokeStyle = 'rgba(255, 250, 220, 0.3)';
    ctx.lineWidth = 1;
    const rayCount = 6;
    for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2 + time * 0.5;
        const len = 10 + Math.sin(time * 3 + i) * 4;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(angle) * 5, py + Math.sin(angle) * 5);
        ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
        ctx.stroke();
    }
}

// --- Update ---
let time = 0;

function update() {
    time += 0.016;

    // Player movement
    if (keys['ArrowLeft'] || keys['KeyA']) player.vx -= pmoveSpeed * 0.15;
    if (keys['ArrowRight'] || keys['KeyD']) player.vx += pmoveSpeed * 0.15;
    if (keys['ArrowUp'] || keys['KeyW']) player.vy -= pmoveSpeed * 0.15;
    if (keys['ArrowDown'] || keys['KeyS']) player.vy += pmoveSpeed * 0.15;

    player.vx *= pfriction;
    player.vy *= pfriction;
    player.x += player.vx;
    player.y += player.vy;

    // World bounds
    const margin = 50;
    if (player.x < margin) { player.x = margin; player.vx = 0; }
    if (player.x > WORLD_W - margin) { player.x = WORLD_W - margin; player.vx = 0; }
    if (player.y < margin) { player.y = margin; player.vy = 0; }
    if (player.y > WORLD_H - margin) { player.y = WORLD_H - margin; player.vy = 0; }

    // Mark structures as discovered when in light range
    for (const s of structures) {
        if (!s.discovered) {
            const dx = s.x - player.x;
            const dy = s.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < player.lightRadius * 0.7) {
                s.discovered = true;
            }
        }
    }

    // Activate relics when player touches them
    for (const r of relics) {
        if (!r.activated) {
            const dx = r.x - player.x;
            const dy = r.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < 25) {
                r.activated = true;
                player.lightRadius += 8;
            }
        }
    }

    // Light torches when player passes near
    for (const t of torches) {
        if (!t.lit) {
            const dx = t.x - player.x;
            const dy = t.y - player.y;
            if (Math.sqrt(dx * dx + dy * dy) < 40) {
                t.lit = true;
            }
        }
    }

    // Camera
    const targetX = player.x - canvas.width / 2;
    const targetY = player.y - canvas.height / 2;
    camera.x += (targetX - camera.x) * 0.08;
    camera.y += (targetY - camera.y) * 0.08;
    camera.x = Math.max(0, Math.min(WORLD_W - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_H - canvas.height, camera.y));
}

// --- Render ---
function render() {
    // Dark ground
    drawGround();

    // Draw structures (only if near enough to potentially be visible)
    const viewMargin = 300;
    for (const s of structures) {
        const sx = s.x - camera.x;
        const sy = s.y - camera.y;
        if (sx > -viewMargin && sx < canvas.width + viewMargin &&
            sy > -viewMargin && sy < canvas.height + viewMargin) {
            drawStructure(s, sx, sy);
        }
    }

    // Draw relics
    for (const r of relics) {
        const rx = r.x - camera.x;
        const ry = r.y - camera.y;
        if (rx > -50 && rx < canvas.width + 50 &&
            ry > -50 && ry < canvas.height + 50) {
            drawRelic(r, rx, ry, time);
        }
    }

    // Draw torches
    for (const t of torches) {
        const tx = t.x - camera.x;
        const ty = t.y - camera.y;
        if (tx > -50 && tx < canvas.width + 50 &&
            ty > -50 && ty < canvas.height + 50) {
            drawTorch(tx, ty, t.lit, time, t.flickerPhase);
        }
    }

    // Draw player
    drawPlayer(time);

    // Apply darkness (this is the key - covers everything not lit)
    applyDarkness(time);

    // UI
    const activatedCount = relics.filter(r => r.activated).length;
    ctx.fillStyle = 'rgba(255, 250, 220, 0.6)';
    ctx.font = '12px monospace';
    ctx.fillText(`Relics: ${activatedCount}/${relics.length}`, 15, 20);
    ctx.fillText('WASD to move', 15, canvas.height - 10);
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}

gameLoop();
