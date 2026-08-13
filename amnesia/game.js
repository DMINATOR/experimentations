const canvas = document.querySelector('#game-canvas');
const ctx = canvas.getContext('2d');
const loopNumber = document.querySelector('#loop-number');
const status = document.querySelector('#status');
const resetButton = document.querySelector('#reset-loop');
const memoryInput = document.querySelector('#memory-input');
const saveMemoryButton = document.querySelector('#save-memory');
const memoryList = document.querySelector('#memory-list');
const memoryCount = document.querySelector('#memory-count');
const STORAGE_KEY = 'amnesia-memory-notes';
const keys = new Set();
const world = { width: canvas.width, height: canvas.height };
let loop = 1;
let memories = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let player, marker, hasInteracted = false;

function startLoop() {
  player = { x: 90, y: world.height / 2, size: 18, speed: 3.2 };
  marker = { x: world.width - 120, y: world.height / 2, radius: 24 };
  hasInteracted = false;
  loopNumber.textContent = loop;
  status.textContent = memories.length ? 'Your notes feel strangely familiar.' : 'You wake with no memories.';
}
function saveMemories() { localStorage.setItem(STORAGE_KEY, JSON.stringify(memories)); renderMemories(); }
function renderMemories() {
  memoryList.innerHTML = '';
  memories.forEach((memory, index) => {
    const item = document.createElement('li'); item.textContent = memory;
    const remove = document.createElement('button'); remove.className = 'delete-memory'; remove.type = 'button'; remove.textContent = '×'; remove.title = 'Forget this note';
    remove.addEventListener('click', () => { memories.splice(index, 1); saveMemories(); });
    item.append(remove); memoryList.append(item);
  });
  memoryCount.textContent = memories.length;
}
function addMemory() { const value = memoryInput.value.trim(); if (!value) return; memories.push(value); memoryInput.value = ''; saveMemories(); status.textContent = 'A fragment has been carried into the next loop.'; }
function isNearMarker() { return Math.hypot(player.x - marker.x, player.y - marker.y) < marker.radius + player.size; }
function update() {
  const horizontal = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const vertical = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  const length = Math.hypot(horizontal, vertical) || 1;
  player.x = Math.max(player.size, Math.min(world.width - player.size, player.x + horizontal / length * player.speed));
  player.y = Math.max(player.size, Math.min(world.height - player.size, player.y + vertical / length * player.speed));
  if (isNearMarker() && (keys.has('e') || keys.has('E')) && !hasInteracted) { hasInteracted = true; status.textContent = 'The marker remembers you. Write down what happened.'; }
}
function draw() {
  ctx.clearRect(0, 0, world.width, world.height);
  const gradient = ctx.createLinearGradient(0, 0, world.width, world.height); gradient.addColorStop(0, '#111b3d'); gradient.addColorStop(1, '#101426'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, world.width, world.height);
  ctx.strokeStyle = 'rgba(112,130,190,.12)'; ctx.lineWidth = 1;
  for (let x = 0; x < world.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke(); }
  for (let y = 0; y < world.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.radius + Math.sin(Date.now() / 300) * 3, 0, Math.PI * 2); ctx.fillStyle = hasInteracted ? '#6c718f' : '#9f8cff'; ctx.shadowBlur = 28; ctx.shadowColor = ctx.fillStyle; ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#e6e2ff'; ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('memory marker', marker.x, marker.y + 48);
  ctx.fillStyle = '#f4f6ff'; ctx.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size); ctx.fillStyle = '#8f9bd1'; ctx.textAlign = 'left'; ctx.fillText('you', player.x - 12, player.y - 18);
  if (isNearMarker() && !hasInteracted) { ctx.fillStyle = '#d7ddff'; ctx.textAlign = 'center'; ctx.fillText('Press E to interact', marker.x, marker.y - 42); }
}
function frame() { update(); draw(); requestAnimationFrame(frame); }
document.addEventListener('keydown', event => { keys.add(event.key); if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key)) event.preventDefault(); });
document.addEventListener('keyup', event => keys.delete(event.key));
resetButton.addEventListener('click', () => { loop += 1; startLoop(); }); saveMemoryButton.addEventListener('click', addMemory); memoryInput.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) addMemory(); });
renderMemories(); startLoop(); frame();
