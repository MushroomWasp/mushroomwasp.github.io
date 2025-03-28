import * as THREE from 'https://cdn.skypack.dev/three@0.132.2/build/three.module.js';
import { EffectComposer } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/UnrealBloomPass.js';
import * as Tone from 'https://cdn.skypack.dev/tone@14.7.77'; // Restored Tone import

// --- Constants ---
const CYBER_NEON_COLORS = [
    new THREE.Color(0x00ffff), // Cyan
    new THREE.Color(0xff00ff), // Magenta
    new THREE.Color(0x00ff00), // Lime Green
    new THREE.Color(0xffff00), // Yellow
    new THREE.Color(0xff8800), // Orange
];
const RAIN_COUNT = 15000; // Number of raindrops

// --- Error Handling ---
window.addEventListener('error', function(event) {
    console.error('Global error caught:', event.error);
    const errorOutput = document.getElementById('error-output');
     if (errorOutput) errorOutput.innerText += 'SYS_ERROR: ' + event.error.message + '\n';
});
console.log('System Booting...');

// --- DOM Element References ---
let gameInfoElement = null;
let speedometerElement = null;
let uiElement = null;
let messageElement = null;
let startBtnElement = null;
let flashOverlay = null;
let scoreElement = null;
let boostMeterElement = null; // For boost display
let boostLevelElement = null; // The inner bar of the boost meter

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050010);
scene.fog = new THREE.Fog(scene.background, 70, 280);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// --- Post-Processing Setup ---
let composer;
let bloomPass;

// --- Game Variables ---
let car, buildings = [], roadSegments = [];
let speed = 0, targetSpeed = 2, maxSpeed = 10, minSpeed = 1, acceleration = 0.04, deceleration = 0.05;
let baseMinSpeed = 1;
let speedIncreaseRate = 0.0001;
let lane = 0;
const laneWidth = 4;
const roadSegmentLength = 50;
const visibleSegments = 25;
let distanceTraveled = 0;
let nextObstacleSpawnDistance = 60;
const obstacleSpawnDistanceInterval = [90, 180];

// Variables for effects
let collisionShakeTime = 0;
const COLLISION_SHAKE_DURATION = 0.5;
const COLLISION_SHAKE_INTENSITY = 0.5;

// For timing
const clock = new THREE.Clock();
let delta = 0;

let gameOver = false;
let animationFrameId = null;
const SPEED_DISPLAY_MULTIPLIER = 6;

let score = 0;

// --- Boost Variables ---
let isBoosting = false;
let boostFuel = 100;
const boostMaxFuel = 100;
const boostConsumeRate = 35;
const boostRegenRate = 10;
const boostSpeedMultiplier = 1.5;

// --- Effects Variables ---
let nearMissCooldown = 0;
const NEAR_MISS_THRESHOLD = 2.0;
let rainParticles = null;
let carTrail = null;
let trailGeometry = null;
let trailMaterial = null;
const TRAIL_LENGTH = 15;
let isVisuallyDrifting = false;

// --- Audio Variables --- (Restored)
let crashSound = null;
let nearMissSound = null;
let boostSound = null; // Added back
let driftSynth = null; // Added back
let isBoostSoundActive = false; // Renamed from boostEffectActive for clarity
let isDriftSynthActive = false;

// --- Initial Setup ---
function initializeApp() {
    console.log('Initializing Graphics Interface...');
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Get DOM elements
    gameInfoElement = document.getElementById('game-info');
    speedometerElement = document.getElementById('speedometer');
    scoreElement = document.getElementById('score');
    uiElement = document.getElementById('ui');
    messageElement = document.getElementById('message');
    startBtnElement = document.getElementById('startBtn');
    flashOverlay = document.getElementById('flash-overlay');
    boostMeterElement = document.getElementById('boost-meter'); // Container
    boostLevelElement = document.getElementById('boost-level'); // Inner bar

    // --- Setup Post Processing ---
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);
    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.6, 0.1);
    composer.addPass(bloomPass);

    // Updated check
    if (!gameInfoElement || !speedometerElement || !scoreElement || !uiElement || !messageElement || !startBtnElement || !flashOverlay || !boostMeterElement || !boostLevelElement) {
        console.error("Critical UI Components Missing! Aborting.");
        const errorOutput = document.getElementById('error-output');
        if (errorOutput) errorOutput.innerText += 'FATAL: UI Integrity Check Failed.\n';
        return;
    }

    startBtnElement.addEventListener('click', startGame);
    uiElement.style.display = 'flex';
    messageElement.innerText = "Connect to Grid?";
    gameInfoElement.style.display = 'none';

    createRain(); // Create rain particles
    createCarTrail(); // Create the car trail object

    console.log('Interface Ready.');
}

// --- Lighting (Cyberpunk Style) ---
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xaaaaff, 0.6);
directionalLight.position.set(5, 15, 10);
scene.add(directionalLight);

// --- Audio Setup --- (Restored and Expanded)
function setupAudio() {
    console.log("Setting up Audio Subsystem...");
    // Crash Sound
    crashSound = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0 }
    }).toDestination();
    crashSound.volume.value = -3;

    // Near Miss Sound
    nearMissSound = new Tone.Player({
        url: "https://cdn.freesound.org/previews/510/510495_11159855-lq.mp3",
        autostart: false,
    }).toDestination();
    nearMissSound.volume.value = -10;

    // Boost Sound (Looping)
    boostSound = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.1, decay: 0.05, sustain: 1.0, release: 0.2 },
        volume: -18
    }).toDestination();

    // Drift Sound
    driftSynth = new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.05, release: 0.1 },
        volume: -15
    }).toDestination();
    console.log("Audio Subsystem setup complete.");
}

function startAudioContext() {
    Tone.start().then(() => {
        console.log("Audio Context Started.");
        if (!crashSound) { setupAudio(); } // Setup sounds if not already done
        if (Tone.Transport.state !== 'started') { Tone.Transport.start(); }
         console.log("Audio Subsystem Online.");
    }).catch(e => {
        console.error("Audio Subsystem Failure:", e);
        const errorOutput = document.getElementById('error-output');
        if (errorOutput) errorOutput.innerText += 'AUDIO_ERR: Context init failed.\n';
    });
}

function stopAudio() {
    console.log("Stopping active sounds...");
    if (boostSound && isBoostSoundActive) {
        boostSound.triggerRelease();
        isBoostSoundActive = false;
    }
    if (driftSynth && isDriftSynthActive) {
        driftSynth.triggerRelease();
        isDriftSynthActive = false;
    }
}
// --- End Audio Setup ---

// --- Game State Functions ---
function resetGame() {
    console.log("Resetting Grid Environment...");
    if (car) scene.remove(car);
    buildings.forEach(b => {
        scene.remove(b);
        if (b.geometry) b.geometry.dispose();
        if (b.material) b.material.dispose();
    });
    roadSegments.forEach(r => {
        while(r.children.length > 0){
            const child = r.children[0];
            r.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        scene.remove(r);
        if (r.geometry) r.geometry.dispose();
        if (r.material) r.material.dispose();
    });
    buildings = [];
    roadSegments = [];

    speed = 0;
    targetSpeed = minSpeed;
    lane = 0;
    distanceTraveled = 0;
    nextObstacleSpawnDistance = 60;
    gameOver = false;
    score = 0;
    boostFuel = boostMaxFuel;
    isBoosting = false;
    isVisuallyDrifting = false;

    // Reset audio flags
    stopAudio(); // Ensure sounds are stopped before reset

    // Reset UI
    if (scoreElement) scoreElement.innerText = `Score: ${score}`;
    if (speedometerElement) speedometerElement.innerText = `SPD: 0.0 km/h`;
    if (boostLevelElement) {
         boostLevelElement.style.width = '100%';
         boostLevelElement.style.backgroundColor = '#ff00ff'; // Reset color
    }
    if (gameInfoElement) gameInfoElement.style.display = 'none';

    // Re-create initial road
    for (let i = 0; i < visibleSegments; i++) {
        createRoadSegment(0 - (i - visibleSegments / 2) * roadSegmentLength);
    }
    roadSegments.sort((a, b) => b.position.z - a.position.z);

    // --- Create Car ---
    // (Car creation code remains the same as your provided version)
    // ... [Car creation code - unchanged] ...
    car = new THREE.Group();
    const bodyColor = 0x220033;
    const accentColor = 0xff00ff;
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: bodyColor, metalness: 0.7, roughness: 0.3 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.5, roughness: 0.2, emissive: accentColor, emissiveIntensity: 0.8 });
    const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x6699ff, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.7 });
    const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.9 });
    const carBodyLower = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 4), bodyMaterial);
    carBodyLower.position.y = 0.35;
    car.add(carBodyLower);
    const carBodyUpper = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 2), bodyMaterial);
    carBodyUpper.position.set(0, 0.8, -0.3);
    car.add(carBodyUpper);
    const windshieldGeo = new THREE.BufferGeometry();
    const windshieldVertices = new Float32Array([-0.85, 0.55, -1.3, 0.85, 0.55, -1.3, 0.85, 1.0, 0.0, -0.85, 0.55, -1.3, 0.85, 1.0, 0.0, -0.85, 1.0, 0.0]);
    windshieldGeo.setAttribute('position', new THREE.BufferAttribute(windshieldVertices, 3));
    windshieldGeo.computeVertexNormals();
    const windshield = new THREE.Mesh(windshieldGeo, glassMaterial);
    car.add(windshield);
    const sideWindow1 = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), glassMaterial);
    sideWindow1.rotation.y = Math.PI / 2;
    sideWindow1.position.set(-0.9, 0.8, -0.3);
    car.add(sideWindow1);
    const sideWindow2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.5), glassMaterial);
    sideWindow2.rotation.y = -Math.PI / 2;
    sideWindow2.position.set(0.9, 0.8, -0.3);
    car.add(sideWindow2);
    const spoilerStand1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), bodyMaterial);
    spoilerStand1.position.set(-0.6, 0.8, -1.8);
    car.add(spoilerStand1);
    const spoilerStand2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), bodyMaterial);
    spoilerStand2.position.set(0.6, 0.8, -1.8);
    car.add(spoilerStand2);
    const spoilerTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.4), accentMaterial);
    spoilerTop.position.set(0, 1.05, -1.8);
    car.add(spoilerTop);
    const wheelPositions = [{ x: -1.05, y: 0.3, z: 1.5 }, { x: 1.05, y: 0.3, z: 1.5 }, { x: -1.05, y: 0.3, z: -1.3 }, { x: 1.05, y: 0.3, z: -1.3 }];
    wheelPositions.forEach(pos => {
        const wheelRim = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16), accentMaterial);
        wheelRim.rotation.z = Math.PI / 2;
        wheelRim.position.set(pos.x, pos.y, pos.z);
        car.add(wheelRim);
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.25, 16), tireMaterial);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(pos.x, pos.y, pos.z);
        car.add(tire);
    });
    const headlightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
    const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffaa, emissiveIntensity: 2 });
    const headlight1 = new THREE.Mesh(headlightGeo, headlightMaterial);
    headlight1.position.set(-0.6, 0.4, 2);
    car.add(headlight1);
    const headlight2 = new THREE.Mesh(headlightGeo, headlightMaterial);
    headlight2.position.set(0.6, 0.4, 2);
    car.add(headlight2);
    const taillightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 1.5 });
    const taillight1 = new THREE.Mesh(headlightGeo, taillightMaterial);
    taillight1.position.set(-0.6, 0.4, -1.9);
    car.add(taillight1);
    const taillight2 = new THREE.Mesh(headlightGeo, taillightMaterial);
    taillight2.position.set(0.6, 0.4, -1.9);
    car.add(taillight2);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.7 });
    const underglow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.8), glowMaterial);
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.05;
    car.add(underglow);
    car.position.y = 0.2;
    car.position.z = 5;
    car.position.x = lane * laneWidth;
    car.rotation.y = Math.PI;
    scene.add(car);
    const headlightLeft = new THREE.SpotLight(0xffffee, 2, 50, Math.PI / 6, 0.5);
    headlightLeft.position.set(-0.6, 0.4, 2);
    headlightLeft.target.position.set(-0.6, 0.4, -1); // Point forward
    car.add(headlightLeft);
    car.add(headlightLeft.target);
    const headlightRight = new THREE.SpotLight(0xffffee, 2, 50, Math.PI / 6, 0.5);
    headlightRight.position.set(0.6, 0.4, 2);
    headlightRight.target.position.set(0.6, 0.4, -1); // Point forward
    car.add(headlightRight);
    car.add(headlightRight.target);
    car.userData.width = 1.9;
    car.userData.depth = 3.8;
    car.userData.height = 1.1;


    // Camera
    camera.position.set(0, 6, car.position.z + 14);
    camera.lookAt(car.position.x, 1, car.position.z);

    // --- Reset Car Trail ---
    if (trailGeometry) {
        const positions = trailGeometry.attributes.position.array;
        for (let i = 0; i < TRAIL_LENGTH; i++) {
             positions[i * 6 + 0] = car.position.x - 0.5;
             positions[i * 6 + 1] = car.position.y - 0.2;
             positions[i * 6 + 2] = car.position.z + i * 0.5;
             positions[i * 6 + 3] = car.position.x + 0.5;
             positions[i * 6 + 4] = car.position.y - 0.2;
             positions[i * 6 + 5] = car.position.z + i * 0.5;
        }
        trailGeometry.attributes.position.needsUpdate = true;
        carTrail.visible = false;
    }

    console.log("Environment Reset Complete.");
}

function startGame() {
    console.log('Connecting to Grid...');
    if (!uiElement || !gameInfoElement) {
        console.error('UI components offline. Connection aborted.');
        return;
    }
    uiElement.style.display = 'none';
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    // Ensure audio context is started (required by browsers) and sounds are set up
    if (Tone.context.state !== 'running') {
        startAudioContext(); // This will also call setupAudio if needed
    } else if (!crashSound) {
        setupAudio(); // Setup sounds if context is running but sounds aren't ready
    }

    resetGame(); // Reset game state *after* ensuring audio is ready

    gameInfoElement.style.display = 'block';

    if (carTrail) carTrail.visible = true;

    animate();
}

function endGame() {
    gameOver = true;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    // Play crash sound immediately on game over
    if (crashSound) {
        crashSound.triggerAttackRelease(0.4); // Slightly longer crash
    }

    // Visual feedback
    collisionShakeTime = COLLISION_SHAKE_DURATION;
    if (flashOverlay) {
        flashOverlay.style.opacity = '0.7';
        setTimeout(() => { flashOverlay.style.opacity = '0'; }, 100);
    }

    console.log("Grid Connection Terminated.");

    stopAudio(); // Stop any looping sounds

    if (uiElement) uiElement.style.display = 'flex';
    if (messageElement) messageElement.innerText = `Connection Lost!\nScore: ${score}\nDistance: ${Math.floor(distanceTraveled)}m`;
    if (gameInfoElement) gameInfoElement.style.display = 'none';
}

// --- Helper Functions ---
function createRoadSegment(zPosition) {
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.8 });
    const roadGeo = new THREE.PlaneGeometry(laneWidth * 3, roadSegmentLength);
    const roadSegment = new THREE.Mesh(roadGeo, roadMat);
    roadSegment.rotation.x = -Math.PI / 2;
    roadSegment.position.y = 0;
    roadSegment.position.z = zPosition;
    scene.add(roadSegment);
    roadSegments.push(roadSegment);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    for (let i = -1; i <= 1; i += 2) {
        const lineGeo = new THREE.PlaneGeometry(0.15, roadSegmentLength);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(i * laneWidth / 2, 0.01, 0);
        roadSegment.add(line);
    }
    return roadSegment;
}

function spawnBuildingObstacle(zPosition) {
    const lanePositions = [-1, 0, 1];
    const obstacleCount = Math.random() < 0.6 ? 1 : 2;
    const availableLaneIndices = [0, 1, 2];
    const blockedLaneIndices = [];
    while (blockedLaneIndices.length < obstacleCount && availableLaneIndices.length > 0) {
        const randomIndex = Math.floor(Math.random() * availableLaneIndices.length);
        const chosenIndex = availableLaneIndices.splice(randomIndex, 1)[0];
        blockedLaneIndices.push(chosenIndex);
    }
    blockedLaneIndices.forEach(laneIndex => {
        const height = 20 + Math.random() * 40;
        const width = 3.5 + Math.random() * 1.5;
        const depth = width;
        const emissiveColor = CYBER_NEON_COLORS[Math.floor(Math.random() * CYBER_NEON_COLORS.length)];
        const buildingMat = new THREE.MeshStandardMaterial({ color: 0x08080A, metalness: 0.2, roughness: 0.7, emissive: emissiveColor, emissiveIntensity: 1.0 + Math.random() });
        const buildingGeo = new THREE.BoxGeometry(width, height, depth);
        const building = new THREE.Mesh(buildingGeo, buildingMat);
        const xPos = lanePositions[laneIndex] * laneWidth;
        building.position.set(xPos, height / 2, zPosition);
        building.userData.width = width;
        building.userData.depth = depth;
        building.userData.height = height;
        scene.add(building);
        buildings.push(building);
    });
}

// --- Rain Effect (Using Fixed Version) ---
function createRain() {
    const vertices = [];
    const initialRainDepth = 500;
    const initialRainHeight = 300;
    const initialRainWidth = 200;
    for (let i = 0; i < RAIN_COUNT; i++) {
        const x = Math.random() * initialRainWidth - (initialRainWidth / 2);
        const y = Math.random() * initialRainHeight + 50;
        const z = Math.random() * initialRainDepth - (initialRainDepth * 0.8);
        vertices.push(x, y, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeBoundingSphere();
    const material = new THREE.PointsMaterial({ color: 0xaaaaee, size: 0.2, transparent: true, opacity: 0.6, sizeAttenuation: true });
    rainParticles = new THREE.Points(geometry, material);
    rainParticles.frustumCulled = false; // Keep this!
    scene.add(rainParticles);
}

function updateRain(delta) {
    if (!rainParticles || !rainParticles.geometry || !rainParticles.geometry.attributes.position || !car || !camera) {
        return;
    }
    const positions = rainParticles.geometry.attributes.position.array;
    const fallSpeed = 80 + speed * 2;
    const cameraX = camera.position.x;
    const cameraZ = camera.position.z;
    const rainVisibleDepth = 400;
    const rainResetBehindOffset = 80;
    const rainResetAheadBuffer = 100;
    const rainHorizontalSpread = 250;
    const rainResetHeightMin = camera.position.y + 50;
    const rainResetHeightMax = camera.position.y + 150;
    const groundLevel = -10;
    for (let i = 0; i < RAIN_COUNT; i++) {
        const xIndex = i * 3 + 0;
        const yIndex = i * 3 + 1;
        const zIndex = i * 3 + 2;
        positions[yIndex] -= fallSpeed * delta;
        const isBelowGround = positions[yIndex] < groundLevel;
        const isTooFarBehind = positions[zIndex] > cameraZ + rainResetBehindOffset;
        const isTooFarAhead = positions[zIndex] < cameraZ - rainVisibleDepth - rainResetAheadBuffer;
        if (isBelowGround || isTooFarBehind || isTooFarAhead) {
            positions[yIndex] = Math.random() * (rainResetHeightMax - rainResetHeightMin) + rainResetHeightMin;
            positions[xIndex] = cameraX + (Math.random() * rainHorizontalSpread - (rainHorizontalSpread / 2));
            positions[zIndex] = cameraZ - (Math.random() * rainVisibleDepth) - 1;
        }
    }
    rainParticles.geometry.attributes.position.needsUpdate = true;
}
// --- End Rain Effect ---


// --- Car Trail (Unchanged) ---
function createCarTrail() {
    trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(TRAIL_LENGTH * 2 * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colors = new Float32Array(TRAIL_LENGTH * 2 * 3);
    for (let i = 0; i < TRAIL_LENGTH; i++) {
        const intensity = 1.0 - (i / TRAIL_LENGTH);
        colors[i * 6 + 0] = 1.0 * intensity; colors[i * 6 + 1] = 0.0; colors[i * 6 + 2] = 1.0 * intensity;
        colors[i * 6 + 3] = 1.0 * intensity; colors[i * 6 + 4] = 0.0; colors[i * 6 + 5] = 1.0 * intensity;
    }
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    trailMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true, transparent: true, opacity: 0.6 });
    const indices = [];
    for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
        const p1 = i * 2, p2 = i * 2 + 1, p3 = (i + 1) * 2, p4 = (i + 1) * 2 + 1;
        indices.push(p1, p2, p3); indices.push(p2, p4, p3);
    }
    trailGeometry.setIndex(indices);
    carTrail = new THREE.Mesh(trailGeometry, trailMaterial);
    carTrail.frustumCulled = false;
    carTrail.visible = false;
    scene.add(carTrail);
}

function updateCarTrail() {
    if (!carTrail || !car || !trailGeometry) return;
    const positions = trailGeometry.attributes.position.array;
    for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
        positions[i * 6 + 0] = positions[(i - 1) * 6 + 0]; positions[i * 6 + 1] = positions[(i - 1) * 6 + 1]; positions[i * 6 + 2] = positions[(i - 1) * 6 + 2];
        positions[i * 6 + 3] = positions[(i - 1) * 6 + 3]; positions[i * 6 + 4] = positions[(i - 1) * 6 + 4]; positions[i * 6 + 5] = positions[(i - 1) * 6 + 5];
    }
    const trailWidth = car.userData.width * 0.7;
    const trailOffsetZ = car.userData.depth / 2;
    const rearCenterZ = car.position.z + trailOffsetZ;
    const rearY = car.position.y - 0.1;
    positions[0] = car.position.x - trailWidth / 2; positions[1] = rearY; positions[2] = rearCenterZ;
    positions[3] = car.position.x + trailWidth / 2; positions[4] = rearY; positions[5] = rearCenterZ;
    const speedRatio = Math.min(1, speed / (maxSpeed * (isBoosting ? boostSpeedMultiplier : 1))); // Consider boost for trail intensity
    trailMaterial.opacity = 0.3 + speedRatio * 0.5;
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.computeBoundingSphere();
}
// --- End Car Trail ---

// --- Collision / Near Miss Check (With Audio) ---
function checkCollisionsAndNearMisses() {
    if (!car || gameOver) return;

    const carZ = car.position.z;
    const carX = car.position.x;
    const carWidth = car.userData.width || 2;
    const carDepth = car.userData.depth || 3.8;
    const cleanupThresholdZ = carZ + 100;

    let nearMissDetectedThisFrame = false;

    if (nearMissCooldown > 0) {
        nearMissCooldown -= delta;
    }

    for (let i = buildings.length - 1; i >= 0; i--) {
        const building = buildings[i];
        const buildingZ = building.position.z;

        // 1. Cleanup
        if (buildingZ > cleanupThresholdZ) {
            scene.remove(building);
            if (building.geometry) building.geometry.dispose();
            if (building.material) building.material.dispose();
            buildings.splice(i, 1);
            continue;
        }

        const buildingX = building.position.x;
        const buildingWidth = building.userData.width || 3.5;
        const buildingDepth = building.userData.depth || 3.5;

        // 2. Collision Check
        const collisionMargin = 0.9;
        const collisionX = Math.abs(carX - buildingX) * 2 < (carWidth + buildingWidth) * collisionMargin;
        const collisionZ = Math.abs(carZ - buildingZ) * 2 < (carDepth + buildingDepth) * collisionMargin;

        if (collisionX && collisionZ) {
            console.log("Collision Alert! Dropping Connection...");
            endGame(); // endGame will handle sound and visuals
            return; // Exit immediately on collision
        }

        // 3. Near Miss Check
        if (nearMissCooldown <= 0) {
            const nearMissMarginX = carWidth / 2 + buildingWidth / 2 + NEAR_MISS_THRESHOLD;
            const sideProximityZ = Math.abs(carZ - buildingZ) < (carDepth / 2 + buildingDepth / 2);
            const nearX = Math.abs(carX - buildingX) < nearMissMarginX;

            if (nearX && sideProximityZ) {
                nearMissDetectedThisFrame = true;
                score += 50;
                nearMissCooldown = 0.5;
                console.log("Near Miss!");

                // Visual cue (Cyan flash)
                if (flashOverlay) {
                    const originalColor = flashOverlay.style.backgroundColor;
                    flashOverlay.style.backgroundColor = 'rgba(0, 255, 255, 0.5)';
                    flashOverlay.style.opacity = '0.5';
                    setTimeout(() => {
                        flashOverlay.style.opacity = '0';
                        setTimeout(() => flashOverlay.style.backgroundColor = originalColor || 'rgba(255, 0, 0, 0.7)', 50);
                    }, 50);
                }
            }
        }
    } // End building loop

    // Play near miss sound (once per frame max)
    if (nearMissDetectedThisFrame && nearMissSound) {
        if (nearMissSound.state !== "started") {
           nearMissSound.start();
        }
    }
}

// --- Cleanup Functions ---
function cleanupOldRoadSegments() {
    if (!car) return;
    const carZ = car.position.z;
    const cleanupThresholdZ = carZ + roadSegmentLength * (visibleSegments / 2 + 4);
    const segmentsToRemove = roadSegments.filter(segment => segment.position.z > cleanupThresholdZ);
    segmentsToRemove.forEach(segment => {
        while(segment.children.length > 0){
            const child = segment.children[0];
            segment.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }
        scene.remove(segment);
        if (segment.geometry) segment.geometry.dispose();
        if (segment.material) segment.material.dispose();
    });
    roadSegments = roadSegments.filter(segment => segment.position.z <= cleanupThresholdZ);
    roadSegments.sort((a, b) => b.position.z - a.position.z);
}

// --- Game Loop ---
function animate() {
    if (gameOver) return;
    animationFrameId = requestAnimationFrame(animate);
    delta = clock.getDelta();

    // --- Update Game Logic ---
    score += Math.floor(speed * delta * 10);
    minSpeed = baseMinSpeed + distanceTraveled * speedIncreaseRate;
    targetSpeed = Math.max(targetSpeed, minSpeed);

    // --- Boost Logic & Sound ---
    const currentMaxSpeed = isBoosting ? maxSpeed * boostSpeedMultiplier : maxSpeed;
    const currentAcceleration = isBoosting ? acceleration * 1.5 : acceleration; // Adjusted boost acceleration

    if (isBoosting) {
        boostFuel -= boostConsumeRate * delta;
        if (boostFuel <= 0) {
            isBoosting = false;
            boostFuel = 0;
            if (boostSound && isBoostSoundActive) { // Stop sound if fuel runs out
                boostSound.triggerRelease();
                isBoostSoundActive = false;
            }
        }
        // Start boost sound if boosting and sound not active
        if (!isBoostSoundActive && boostSound && boostFuel > 0) {
             boostSound.triggerAttack();
             isBoostSoundActive = true;
        }
    } else {
        boostFuel = Math.min(boostMaxFuel, boostFuel + boostRegenRate * delta);
        // Stop boost sound if not boosting and sound is active
        if (isBoostSoundActive && boostSound) {
            boostSound.triggerRelease();
            isBoostSoundActive = false;
        }
    }

    // Update boost meter UI
    if (boostLevelElement) {
        const boostPercentage = (boostFuel / boostMaxFuel) * 100;
        boostLevelElement.style.width = `${boostPercentage}%`;
        // Change color based on boost level
        if (boostPercentage < 25) boostLevelElement.style.backgroundColor = '#ff3333';
        else if (boostPercentage < 50) boostLevelElement.style.backgroundColor = '#ffaa33';
        else boostLevelElement.style.backgroundColor = '#ff00ff';
    }

    // Update speed
    if (speed < targetSpeed) speed = Math.min(speed + currentAcceleration, currentMaxSpeed);
    else if (speed > targetSpeed) speed = Math.max(speed - deceleration, targetSpeed);
    speed = Math.min(speed, currentMaxSpeed);

    if (car) {
        const targetX = lane * laneWidth;
        const oldX = car.position.x;
        car.position.x += (targetX - oldX) * 0.2;
        car.position.z -= speed;
        distanceTraveled += speed;

        // --- Drift Sound Logic ---
        const isCurrentlySwitchingLanes = Math.abs(car.position.x - targetX) > 0.1 && Math.abs(oldX - targetX) > 0.1;
        if (driftSynth) {
             if (isCurrentlySwitchingLanes && !isDriftSynthActive) {
                  driftSynth.triggerAttack();
                  isDriftSynthActive = true;
             } else if (!isCurrentlySwitchingLanes && isDriftSynthActive) {
                  driftSynth.triggerRelease();
                  isDriftSynthActive = false;
             }
        }
        // --- End Drift Sound ---

        // --- Update Camera & FOV ---
        camera.position.z = car.position.z + 14;
        camera.position.y = 7;
        camera.position.x += (car.position.x - camera.position.x) * 0.05;
        camera.lookAt(car.position.x, 1, car.position.z - 15);
        const baseFOV = 75;
        const maxFOVBoost = isBoosting ? 15 : 10; // Boost FOV effect
        camera.fov = baseFOV + (speed / currentMaxSpeed) * maxFOVBoost;
        camera.updateProjectionMatrix();

        // --- Camera Shake ---
        const speedShakeIntensity = speed * 0.005 + (isBoosting ? 0.015 : 0);
        const shakeX = (Math.random() - 0.5) * speedShakeIntensity;
        const shakeY = (Math.random() - 0.5) * speedShakeIntensity;
        camera.position.x += shakeX;
        camera.position.y += shakeY;

        // --- Road & Obstacle Management ---
        if (roadSegments.length > 0) {
            const farthestRoadZ = roadSegments[roadSegments.length - 1].position.z;
            if (car.position.z < farthestRoadZ + roadSegmentLength * (visibleSegments / 2)) {
                 const nextSegmentZ = farthestRoadZ - roadSegmentLength;
                 createRoadSegment(nextSegmentZ);
                 roadSegments.sort((a, b) => b.position.z - a.position.z);
            }
        } else {
            createRoadSegment(car.position.z - roadSegmentLength * (visibleSegments / 2));
            roadSegments.sort((a, b) => b.position.z - a.position.z);
        }
        cleanupOldRoadSegments();

        // Obstacle Spawning
        const currentMinInterval = Math.max(50, 90 - distanceTraveled * 0.01);
        const currentMaxInterval = Math.max(100, 180 - distanceTraveled * 0.02);
        const spawnDistanceAhead = 280;
        const spawnTriggerZ = car.position.z - spawnDistanceAhead;
        if (distanceTraveled > nextObstacleSpawnDistance) {
            spawnBuildingObstacle(spawnTriggerZ);
            const distanceToAdd = currentMinInterval + Math.random() * (currentMaxInterval - currentMinInterval);
            nextObstacleSpawnDistance += distanceToAdd;
            // console.log(`Obstruction spawned @ Z=${spawnTriggerZ.toFixed(0)}. Next trigger @ ${nextObstacleSpawnDistance.toFixed(0)}m`);
        }
        checkCollisionsAndNearMisses();

        // --- Update Visual Effects ---
        updateRain(delta);
        updateCarTrail();

        // --- Update UI ---
        if (speedometerElement) speedometerElement.innerText = `SPD: ${(speed * SPEED_DISPLAY_MULTIPLIER).toFixed(1)} km/h`;
        if (scoreElement) scoreElement.innerText = `Score: ${score}`;
    } else {
         console.warn("Vehicle entity lost in loop!");
    }

    // --- Collision Camera Shake ---
    if (collisionShakeTime > 0) {
        const shakeAmount = COLLISION_SHAKE_INTENSITY * (collisionShakeTime / COLLISION_SHAKE_DURATION);
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
        camera.position.z += (Math.random() - 0.5) * shakeAmount;
        collisionShakeTime -= delta;
    }

    // --- Render ---
    composer.render(delta);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initializeApp);

document.addEventListener('keydown', (e) => {
    if (gameOver) return;
    switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A': if (lane > -1) lane--; break;
        case 'ArrowRight': case 'd': case 'D': if (lane < 1) lane++; break;
        case 'ArrowUp': case 'w': case 'W': targetSpeed = Math.min(targetSpeed + 0.5, maxSpeed); break;
        case 'ArrowDown': case 's': case 'S': targetSpeed = Math.max(targetSpeed - 0.5, minSpeed); break;
        case 'Shift':
            if (boostFuel > 10) {
                 isBoosting = true;
                 // Boost sound starts in animate() loop
            }
            break;
    }
});

document.addEventListener('keyup', (e) => {
     if (gameOver) return;
     if (e.key === 'Shift') {
         isBoosting = false;
         // Boost sound stops in animate() loop
     }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

console.log('System Ready.');