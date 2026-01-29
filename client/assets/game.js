const socket = io();
let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');
let WORLD_SIZE, world = [];
let camera = {x: 0, y: 0};
let state = {players: {}, mobs: {}};
let myId, myData = {}, charCreated = false;
let keys = {};
let selectedClass = null;
let shopItems = [];
let audioCtx;
let weather = 'clear'; // clear, rain
let lastMoveTime = 0;

// Init
function init() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.imageSmoothingEnabled = false;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
    document.getElementById('chatInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            let msg = e.target.value.trim();
            if (msg) socket.emit('chat', msg);
            e.target.value = '';
        }
    });
    canvas.addEventListener('click', onClick);
    loop();
}

let time = 0; // For day/night
function loop() {
    update();
    render();
    time += 0.01;
    requestAnimationFrame(loop);
}

function update() {
    if (!charCreated) return;

    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx = -1;
    if (keys['d'] || keys['arrowright']) dx = 1;
    if (keys['w'] || keys['arrowup']) dy = -1;
    if (keys['s'] || keys['arrowdown']) dy = 1;
    if (dx || dy) {
        let now = Date.now();
        if (now - lastMoveTime > 100) { // Throttle to match server tick
            let dir = dx ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
            // Client prediction: Update local pos
            let speed = weather === 'rain' ? 0.5 : 1;
            myData.pos.x += dx * speed;
            myData.pos.y += dy * speed;
            socket.emit('move', { dir, x: myData.pos.x, y: myData.pos.y });
            playSound(440, 50); // Footstep
            lastMoveTime = now;
        }
    }

    // Camera follow
    if (myData.pos) {
        camera.x = myData.pos.x * TILE_SIZE - canvas.width / 2;
        camera.y = myData.pos.y * TILE_SIZE - canvas.height / 2;
    }
}

const TILE_SIZE = 32;
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Day/night tint
    let tint = Math.sin(time) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(0, 20, 50, ${0.3 - tint * 0.1})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Weather overlay
    if (weather === 'rain') {
        ctx.fillStyle = 'rgba(100, 100, 255, 0.2)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Tiles (visible area)
    let startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
    let endX = Math.min(WORLD_SIZE, startX + Math.ceil(canvas.width / TILE_SIZE) + 1);
    let startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
    let endY = Math.min(WORLD_SIZE, startY + Math.ceil(canvas.height / TILE_SIZE) + 1);
    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            let tile = world[y]?.[x] || 'grass';
            let color = tile === 'grass' ? '#4a7c59' : tile === 'tree' ? '#2d5016' : tile === 'water' ? '#1e4d8a' : '#666';
            ctx.fillStyle = color;
            ctx.fillRect(x * TILE_SIZE - camera.x, y * TILE_SIZE - camera.y, TILE_SIZE, TILE_SIZE);
        }
    }

    // Mobs (red)
    Object.values(state.mobs).forEach(m => {
        ctx.fillStyle = 'red';
        ctx.fillRect(m.x * TILE_SIZE - camera.x + 8, m.y * TILE_SIZE - camera.y + 8, 16, 16);
        let barW = 16 * (m.hp / m.maxhp);
        ctx.fillStyle = 'green';
        ctx.fillRect(m.x * TILE_SIZE - camera.x + 8, m.y * TILE_SIZE - camera.y, barW, 3);
    });

    // Players with interpolation
    Object.entries(state.players).forEach(([id, p]) => {
        if (id !== myId) {
            if (p.renderPos) {
                p.renderPos.x = p.renderPos.x * 0.9 + p.pos.x * 0.1;
                p.renderPos.y = p.renderPos.y * 0.9 + p.pos.y * 0.1;
            } else {
                p.renderPos = { ...p.pos };
            }
            let rx = p.renderPos.x * TILE_SIZE - camera.x + 4;
            let ry = p.renderPos.y * TILE_SIZE - camera.y + 4;
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(rx, ry, 24, 24);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, rx + 12, ry + 30);
        } else {
            ctx.fillStyle = '#00aaff';
            ctx.fillRect(myData.pos.x * TILE_SIZE - camera.x + 4, myData.pos.y * TILE_SIZE - camera.y + 4, 24, 24);
            ctx.fillText(myData.name, myData.pos.x * TILE_SIZE - camera.x + 16, myData.pos.y * TILE_SIZE - camera.y + 30);
        }
    });

    renderUI();
}

function renderUI() {
    if (myData) {
        document.getElementById('hp').textContent = Math.floor(myData.stats?.hp || 0);
        document.getElementById('maxhp').textContent = myData.stats?.maxhp || 0;
        document.getElementById('mp').textContent = Math.floor(myData.stats?.mp || 0);
        document.getElementById('maxmp').textContent = myData.stats?.maxmp || 0;
        document.getElementById('stamina').textContent = Math.floor(myData.stats?.stamina || 0);
        document.getElementById('hunger').textContent = Math.floor(myData.stats?.hunger || 0);
        document.getElementById('gold').textContent = myData.gold || 0;
        document.getElementById('lvl').textContent = myData.lvl || 1;
        document.getElementById('xp').textContent = Math.floor(myData.xp || 0);
        document.getElementById('quest').textContent = myData.quest?.active ? 
            `Kill ${5 - (myData.quest.progress || 0)}/5 Goblins` : 'Quest Complete!';
    }
    document.getElementById('abilityBtn').disabled = !myData.stats || myData.stats.mp < 20;
    renderInv();
}

function renderInv() {
    if (!myData.inventory) return;
    let ul = document.getElementById('invList');
    ul.innerHTML = myData.inventory.map((item, i) => 
        `<li onclick="useItem(${i})">${item.name} ${item.dmg ? `(DMG ${item.dmg})` : item.heal ? `(HP+${item.heal})` : `(Hunger+${item.hunger || 0})`}</li>`
    ).join('');
}

window.addEventListener('keydown', e => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

function onClick(e) {
    if (!charCreated) return;
    let rect = canvas.getBoundingClientRect();
    let tx = Math.floor((e.clientX - rect.left + camera.x) / TILE_SIZE);
    let ty = Math.floor((e.clientY - rect.top + camera.y) / TILE_SIZE);
    let nearestMob = null;
    let minDist = 999;
    Object.values(state.mobs).forEach(m => {
        let dist = Math.hypot(m.x - tx, m.y - ty);
        if (dist < minDist) {
            minDist = dist;
            nearestMob = m;
        }
    });
    if (nearestMob && minDist < 2) {
        socket.emit('attack', nearestMob.id);
        playSound(220, 100); // Attack sound
    } else {
        socket.emit('interact');
    }
}

function playSound(freq, duration) {
    let osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    let gain = audioCtx.createGain();
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    setTimeout(() => osc.stop(), duration);
}

function selectClass(cls) {
    selectedClass = cls;
    document.querySelectorAll('.classBtn').forEach(btn => btn.classList.remove('selected'));
    event.target.classList.add('selected');
    document.getElementById('createBtn').disabled = false;
}

function createChar() {
    let name = document.getElementById('nameInput').value.trim() || 'Hero';
    if (selectedClass) {
        socket.emit('createChar', { name, class: selectedClass });
    }
}

function useItem(idx) {
    socket.emit('useItem', idx);
}

function showShop(items) {
    shopItems = items;
    let list = document.getElementById('shopList');
    list.innerHTML = items.map(item => 
        `<div onclick="buy('${item.name}')">${item.name} - ${item.price}g</div>`
    ).join('');
    document.getElementById('shopModal').style.display = 'flex';
}

function buy(name) {
    socket.emit('buy', name);
}

function closeShop() {
    document.getElementById('shopModal').style.display = 'none';
}

function useAbility() {
    if (myData.stats.mp >= 20) {
        socket.emit('useAbility');
    }
}

// Socket events
socket.on('init', data => {
    WORLD_SIZE = data.WORLD_SIZE;
    world = data.world;
});

socket.on('charCreated', () => {
    document.getElementById('charModal').style.display = 'none';
    charCreated = true;
    myId = socket.id;
});

socket.on('stateUpdate', data => {
    state.players = data.players;
    state.mobs = data.mobs;
    if (data.myPos && (Math.abs(myData.pos.x - data.myPos.x) > 0.1 || Math.abs(myData.pos.y - data.myPos.y) > 0.1)) {
        myData.pos = data.myPos; // Correct desync
    }
});

socket.on('myUpdate', data => {
    Object.assign(myData, data);
});

socket.on('chatMsg', msg => {
    let log = document.getElementById('chatLog');
    let div = document.createElement('div');
    div.textContent = `${msg.from}: ${msg.msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
});

socket.on('systemMsg', msg => {
    let log = document.getElementById('chatLog');
    let div = document.createElement('div');
    div.style.color = '#00ff00';
    div.textContent = `[System] ${msg}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
});

socket.on('shopOpen', items => showShop(items));

socket.on('weatherUpdate', w => weather = w);

init();
