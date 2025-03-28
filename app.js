import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';
import * as Tone from 'https://cdn.skypack.dev/tone@14.7.77';

// --- Constants ---
const CYBER_NEON_COLORS = [
    new THREE.Color(0x00ffff), // Cyan
    new THREE.Color(0xff00ff), // Magenta
    new THREE.Color(0x00ff00), // Lime Green
    new THREE.Color(0xffff00), // Yellow
    new THREE.Color(0xff8800), // Orange
];

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

// --- Scene Setup ---
const scene = new THREE.Scene();
// Dark blue/purple background
scene.background = new THREE.Color(0x050010);
// Add fog - color should match background, adjust density/range
scene.fog = new THREE.Fog(scene.background, 50, 250); // Start fog 50 units away, full density at 250

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// --- Initial Setup ---
function initializeApp() {
    console.log('Initializing Graphics Interface...');
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Optional: Enable physically correct lights if using StandardMaterial extensively
    // renderer.physicallyCorrectLights = true; // May impact performance
    document.body.appendChild(renderer.domElement);

    gameInfoElement = document.getElementById('game-info');
    speedometerElement = document.getElementById('speedometer');
    uiElement = document.getElementById('ui');
    messageElement = document.getElementById('message');
    startBtnElement = document.getElementById('startBtn');

    if (!gameInfoElement || !speedometerElement || !uiElement || !messageElement || !startBtnElement) {
        console.error("Critical UI Components Missing! Aborting.");
        const errorOutput = document.getElementById('error-output');
        if (errorOutput) errorOutput.innerText += 'FATAL: UI Integrity Check Failed.\n';
        return;
    }

    startBtnElement.addEventListener('click', startGame);
    uiElement.style.display = 'flex';
    messageElement.innerText = "Connect to Grid?";
    gameInfoElement.style.display = 'none';

    console.log('Interface Ready.');
}

// --- Lighting (Cyberpunk Style) ---
// Lower ambient light for more contrast
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Dim white or slight purple tint (e.g., 0x301040)
scene.add(ambientLight);
// Directional light for some highlights, maybe slightly colored
const directionalLight = new THREE.DirectionalLight(0xaaaaff, 0.6); // Cool blueish tint
directionalLight.position.set(5, 15, 10); // Higher angle
scene.add(directionalLight);

// --- Game Variables ---
let car, buildings = [], roadSegments = [];
let speed = 0, targetSpeed = 2, maxSpeed = 8, minSpeed = 1, acceleration = 0.025, deceleration = 0.04; // Slightly faster accel/decel
let lane = 0;
const laneWidth = 4;
const roadSegmentLength = 50;
const visibleSegments = 25; // See a bit farther
let distanceTraveled = 0;
// --- FIX 1: Reduce initial spawn distance ---
let nextObstacleSpawnDistance = 60; // Spawn the first set much sooner (was 120)
// --- FIX 3: Tweak spawn interval ---
const obstacleSpawnDistanceInterval = [90, 180]; // Slightly tighter interval (was [100, 200])

let gameOver = false;
let animationFrameId = null;
const SPEED_DISPLAY_MULTIPLIER = 6; // Scale displayed speed

// Audio - Define synth and loop outside functions to manage state better
let bassSynth = null;
let synthLoop = null;

// --- Game State Functions ---

function setupAudio() {
    // Use a synth more suited for cyberpunk (FM or AM can sound more metallic/digital)
    bassSynth = new Tone.FMSynth({
        harmonicity: 1.5,
        modulationIndex: 5,
        detune: 0,
        oscillator: { type: "sine" },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
        modulation: { type: "square" },
        modulationEnvelope: { attack: 0.05, decay: 0.01, sustain: 1, release: 0.5 }
    }).toDestination();

    synthLoop = new Tone.Loop((time) => {
        if (!gameOver && bassSynth) {
            // Darker, driving feel - lower pitch range
            const noteFrequency = 40 + (speed / maxSpeed) * 30 + Math.random() * 5; // Lower freq range
            bassSynth.triggerAttackRelease(noteFrequency, '16n', time); // Shorter, faster notes maybe?
        }
    }, '8n'); // Faster loop interval? Or keep '4n' for sparser beat
}

function startAudio() {
     Tone.start().then(() => {
        console.log("Audio Subsystem Online.");
        if (!bassSynth) { // Create synth if it doesn't exist
            setupAudio();
        }
        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
        if (synthLoop && !synthLoop.started) {
             synthLoop.start(0);
        }
    }).catch(e => {
        console.error("Audio Subsystem Failure:", e);
        const errorOutput = document.getElementById('error-output');
        if (errorOutput) errorOutput.innerText += 'AUDIO_ERR: Context init failed.\n';
    });
}

function stopAudio() {
     if (synthLoop && synthLoop.started) {
         synthLoop.stop();
     }
     // Don't stop transport immediately, allows sounds to finish release phase
     // if (Tone.Transport.state === 'started') {
     //     Tone.Transport.stop();
     // }
}


function resetGame() {
    console.log("Resetting Grid Environment...");
    if (!car) {
         console.log("Vehicle entity not found during reset.");
    }

    if (car) scene.remove(car);
    buildings.forEach(b => {
        scene.remove(b);
        if (b.geometry) b.geometry.dispose();
        if (b.material) b.material.dispose(); // Dispose potentially multiple materials later
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
    nextObstacleSpawnDistance = 60; // Update this value here too (was 120)
    gameOver = false;

    if (gameInfoElement) gameInfoElement.style.display = 'none';
    if (speedometerElement) speedometerElement.innerText = `SPD: 0.0 km/h`;

    // Re-create initial road
    for (let i = 0; i < visibleSegments; i++) {
        createRoadSegment(0 - (i - visibleSegments / 2) * roadSegmentLength);
    }
    roadSegments.sort((a, b) => b.position.z - a.position.z);

    // --- Create a Realistic Cyberpunk Race Car ---
    // Create a group to hold all car parts
    car = new THREE.Group();
    
    // Car body colors and materials
    const bodyColor = 0x220033; // Dark purple base
    const accentColor = 0xff00ff; // Magenta accent
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.7,
        roughness: 0.3,
    });
    
    const accentMaterial = new THREE.MeshStandardMaterial({
        color: accentColor,
        metalness: 0.5,
        roughness: 0.2,
        emissive: accentColor,
        emissiveIntensity: 0.8
    });
    
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x6699ff,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });
    
    const tireMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        metalness: 0.1,
        roughness: 0.9
    });
    
    // Main car body (lower part)
    const carBodyLower = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.5, 4),
        bodyMaterial
    );
    carBodyLower.position.y = 0.35;
    car.add(carBodyLower);
    
    // Car body upper (sloped cabin)
    const carBodyUpper = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.45, 2),
        bodyMaterial
    );
    carBodyUpper.position.set(0, 0.8, -0.3);
    car.add(carBodyUpper);
    
    // Front windshield (sloped)
    const windshieldGeo = new THREE.BufferGeometry();
    const windshieldVertices = new Float32Array([
        // Front face (triangles)
        -0.85, 0.55, -1.3,   0.85, 0.55, -1.3,   0.85, 1.0, 0.0,
        -0.85, 0.55, -1.3,   0.85, 1.0, 0.0,   -0.85, 1.0, 0.0
    ]);
    windshieldGeo.setAttribute('position', new THREE.BufferAttribute(windshieldVertices, 3));
    windshieldGeo.computeVertexNormals();
    const windshield = new THREE.Mesh(windshieldGeo, glassMaterial);
    car.add(windshield);
    
    // Side windows
    const sideWindow1 = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 0.5),
        glassMaterial
    );
    sideWindow1.rotation.y = Math.PI/2;
    sideWindow1.position.set(-0.9, 0.8, -0.3);
    car.add(sideWindow1);
    
    const sideWindow2 = new THREE.Mesh(
        new THREE.PlaneGeometry(2, 0.5),
        glassMaterial
    );
    sideWindow2.rotation.y = -Math.PI/2;
    sideWindow2.position.set(0.9, 0.8, -0.3);
    car.add(sideWindow2);
    
    // Spoiler
    const spoilerStand1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.5, 0.1),
        bodyMaterial
    );
    spoilerStand1.position.set(-0.6, 0.8, -1.8);
    car.add(spoilerStand1);
    
    const spoilerStand2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.5, 0.1),
        bodyMaterial
    );
    spoilerStand2.position.set(0.6, 0.8, -1.8);
    car.add(spoilerStand2);
    
    const spoilerTop = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.1, 0.4),
        accentMaterial
    );
    spoilerTop.position.set(0, 1.05, -1.8);
    car.add(spoilerTop);
    
    // Wheels - create 4 wheels
    const wheelPositions = [
        {x: -1.05, y: 0.3, z: 1.5},  // Front Left
        {x: 1.05, y: 0.3, z: 1.5},   // Front Right
        {x: -1.05, y: 0.3, z: -1.3}, // Rear Left
        {x: 1.05, y: 0.3, z: -1.3}   // Rear Right
    ];
    
    wheelPositions.forEach(pos => {
        // Wheel rim
        const wheelRim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.2, 16),
            accentMaterial
        );
        wheelRim.rotation.z = Math.PI/2;
        wheelRim.position.set(pos.x, pos.y, pos.z);
        car.add(wheelRim);
        
        // Tire
        const tire = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 0.25, 16),
            tireMaterial
        );
        tire.rotation.z = Math.PI/2;
        tire.position.set(pos.x, pos.y, pos.z);
        car.add(tire);
    });
    
    // Headlights
    const headlightGeo = new THREE.BoxGeometry(0.3, 0.15, 0.1);
    
    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffaa,
        emissiveIntensity: 2
    });
    
    const headlight1 = new THREE.Mesh(headlightGeo, headlightMaterial);
    headlight1.position.set(-0.6, 0.4, 2);
    car.add(headlight1);
    
    const headlight2 = new THREE.Mesh(headlightGeo, headlightMaterial);
    headlight2.position.set(0.6, 0.4, 2);
    car.add(headlight2);
    
    // Taillights
    const taillightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 1.5
    });
    
    const taillight1 = new THREE.Mesh(headlightGeo, taillightMaterial);
    taillight1.position.set(-0.6, 0.4, -1.9);
    car.add(taillight1);
    
    const taillight2 = new THREE.Mesh(headlightGeo, taillightMaterial);
    taillight2.position.set(0.6, 0.4, -1.9);
    car.add(taillight2);
    
    // Neon underglow
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.7
    });
    
    const underglow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 3.8),
        glowMaterial
    );
    underglow.rotation.x = -Math.PI/2;
    underglow.position.y = 0.05;
    car.add(underglow);
    
    // Positioning the entire car
    car.position.y = 0.2; // Slightly lower to the ground
    car.position.z = 5;
    car.position.x = lane * laneWidth;
    car.rotation.y = Math.PI; // Rotate to face forward
    scene.add(car);
    
    // Optional: Add headlight effects (uncomment if needed)
    const headlightLeft = new THREE.SpotLight(0xffffee, 2, 50, Math.PI/6, 0.5);
    headlightLeft.position.set(-0.6, 0.4, 2);
    car.add(headlightLeft);
    
    const headlightRight = new THREE.SpotLight(0xffffee, 2, 50, Math.PI/6, 0.5);
    headlightRight.position.set(0.6, 0.4, 2);
    car.add(headlightRight);
    
    // Don't forget to set and store collision dimensions
    // Store collision bounds for the car (slightly smaller than visible model)
    car.userData.width = 1.9;  // Slightly smaller than actual width for forgiving gameplay
    car.userData.depth = 3.8;  // Slightly smaller than actual length
    car.userData.height = 1.1; // Height including spoiler

    // Camera
    camera.position.set(0, 6, car.position.z + 14);
    camera.lookAt(car.position.x, 1, car.position.z);

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
    resetGame();

    gameInfoElement.style.display = 'block';

    startAudio(); // Initialize and start audio

    animate();
}

function endGame() {
    gameOver = true;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    console.log("Grid Connection Terminated.");

    stopAudio(); // Stop the synth loop

    if (uiElement) uiElement.style.display = 'flex';
    if (messageElement) messageElement.innerText = `Connection Lost!\nDistance: ${Math.floor(distanceTraveled)}m`;
    if (gameInfoElement) gameInfoElement.style.display = 'none';
}

// --- Helper Functions ---

function createRoadSegment(zPosition) {
    // Dark road material
    const roadMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a, // Very dark grey
        metalness: 0.1,
        roughness: 0.8 // Make it less reflective
    });
    const roadGeo = new THREE.PlaneGeometry(laneWidth * 3, roadSegmentLength);
    const roadSegment = new THREE.Mesh(roadGeo, roadMat);
    roadSegment.rotation.x = -Math.PI / 2;
    roadSegment.position.y = 0;
    roadSegment.position.z = zPosition;
    scene.add(roadSegment);
    roadSegments.push(roadSegment);

    // --- Neon Lane Lines ---
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Bright Cyan
    // Or use emissive material for glow independent of light:
    // const lineMat = new THREE.MeshStandardMaterial({
    //     emissive: 0x00ffff, // Cyan
    //     emissiveIntensity: 1.0,
    //     color: 0x00ffff // Set base color too if needed
    // });

    for (let i = -1; i <= 1; i += 2) {
        const lineGeo = new THREE.PlaneGeometry(0.15, roadSegmentLength);
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2;
        line.position.set(i * laneWidth / 2, 0.01, 0); // Relative position to segment center
        roadSegment.add(line); // Add as child
    }
    return roadSegment;
}

function spawnBuildingObstacle(zPosition) {
    const lanePositions = [-1, 0, 1];
    const obstacleCount = Math.floor(Math.random() * 2) + 1;

    const availableLaneIndices = [0, 1, 2];
    const blockedLaneIndices = [];
    while (blockedLaneIndices.length < obstacleCount) {
      const randomIndex = Math.floor(Math.random() * availableLaneIndices.length);
      const chosenIndex = availableLaneIndices.splice(randomIndex, 1)[0];
      blockedLaneIndices.push(chosenIndex);
    }

    blockedLaneIndices.forEach(laneIndex => {
      // --- Taller, Cyberpunk Buildings ---
      const height = 20 + Math.random() * 40; // Much taller buildings
      const width = 3.5 + Math.random() * 1.5; // Slightly wider variance
      const depth = width; // Keep depth similar to width

      // Choose a random neon color for emission
      const emissiveColor = CYBER_NEON_COLORS[Math.floor(Math.random() * CYBER_NEON_COLORS.length)];

      const buildingMat = new THREE.MeshStandardMaterial({
          color: 0x08080A, // Very dark base color
          metalness: 0.2,
          roughness: 0.7,
          emissive: emissiveColor,
          emissiveIntensity: 1.0 + Math.random() // Randomize glow intensity slightly
      });

      const buildingGeo = new THREE.BoxGeometry(width, height, depth);
      const building = new THREE.Mesh(buildingGeo, buildingMat);

      const xPos = lanePositions[laneIndex] * laneWidth;
      // Ensure base is at y=0
      building.position.set(xPos, height / 2, zPosition);

      building.userData.width = width;
      building.userData.depth = depth;
      building.userData.height = height;

      scene.add(building);
      buildings.push(building);
    });
}

// --- Cleanup Functions (Mostly unchanged, but check disposal) ---

function cleanupOldRoadSegments() {
    if (!car) return;
    const carZ = car.position.z;
    // Adjust cleanup threshold based on fog maybe?
    const cleanupThresholdZ = carZ + roadSegmentLength * (visibleSegments / 2 + 4); // Clean a bit further behind

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

function checkCollisionsAndCleanupBuildings() {
    if (!car) return;

    const carZ = car.position.z;
    const carX = car.position.x;
    // Use the stored dimensions instead of geometry parameters, as we now have a Group
    const carWidth = car.userData.width || 2;
    const carDepth = car.userData.depth || 3.8;
    const cleanupThresholdZ = carZ + 100;

    for (let i = buildings.length - 1; i >= 0; i--) {
      const building = buildings[i];
      const buildingZ = building.position.z;

      if (buildingZ > cleanupThresholdZ) {
        scene.remove(building);
        if (building.geometry) building.geometry.dispose();
        if (building.material) building.material.dispose();
        buildings.splice(i, 1);
        continue;
      }

      const buildingX = building.position.x;
      const buildingWidth = building.userData.width || 3.5; // Use updated default
      const buildingDepth = building.userData.depth || 3.5;

      // Slightly tighter collision box for gameplay feel? Adjust as needed.
      const collisionMargin = 0.9;
      const collisionX = Math.abs(carX - buildingX) * 2 < (carWidth + buildingWidth) * collisionMargin;
      const collisionZ = Math.abs(carZ - buildingZ) * 2 < (carDepth + buildingDepth) * collisionMargin;

      if (collisionX && collisionZ) {
        console.log("Collision Alert! Dropping Connection...");
        endGame();
        break;
      }
    }
}

// --- Game Loop ---

function animate() {
    if (gameOver) return;
    animationFrameId = requestAnimationFrame(animate);

    // Update Logic
    if (speed < targetSpeed) speed = Math.min(speed + acceleration, targetSpeed);
    else if (speed > targetSpeed) speed = Math.max(speed - deceleration, targetSpeed);

    if (car) {
        car.position.x += (lane * laneWidth - car.position.x) * 0.1;
        car.position.z -= speed;
        distanceTraveled += speed;

        // Camera follow
        camera.position.z = car.position.z + 14; // Consistent with reset
        camera.position.y = 7; // Slightly higher for better view over car
        camera.position.x += (car.position.x - camera.position.x) * 0.05;
        camera.lookAt(car.position.x, 1, car.position.z - 15); // Look further ahead

        // Road Management
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

        // Obstacle Management
        // --- FIX 2: Calculate spawn Z position relative to car, but much closer ---
        const spawnDistanceAhead = 280; // Spawn obstacles this many units ahead of the car
        const spawnTriggerZ = car.position.z - spawnDistanceAhead; // Spawn closer

        if (distanceTraveled > nextObstacleSpawnDistance) {
            spawnBuildingObstacle(spawnTriggerZ); // Use the adjusted Z position
            const distanceToAdd = obstacleSpawnDistanceInterval[0] + Math.random() * (obstacleSpawnDistanceInterval[1] - obstacleSpawnDistanceInterval[0]);
            nextObstacleSpawnDistance += distanceToAdd;
            // Updated log message for clarity
            console.log(`Obstruction spawned @ Z=${spawnTriggerZ.toFixed(0)}. Next trigger @ ${nextObstacleSpawnDistance.toFixed(0)}m`);
        }
        checkCollisionsAndCleanupBuildings();

        // Update UI
        if (speedometerElement) {
             speedometerElement.innerText = `SPD: ${(speed * SPEED_DISPLAY_MULTIPLIER).toFixed(1)} km/h`;
        }

    } else {
         console.warn("Vehicle entity lost in loop!");
    }

    // Render
    renderer.render(scene, camera);
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', initializeApp);
document.addEventListener('keydown', (e) => {
    if (gameOver) return;
    switch (e.key) {
        case 'ArrowLeft': case 'a': if (lane > -1) lane--; break;
        case 'ArrowRight': case 'd': if (lane < 1) lane++; break;
        case 'ArrowUp': case 'w': targetSpeed = Math.min(targetSpeed + 0.5, maxSpeed); break;
        case 'ArrowDown': case 's': targetSpeed = Math.max(targetSpeed - 0.5, minSpeed); break;
    }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

console.log('System Ready.');