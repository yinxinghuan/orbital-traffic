import * as THREE from "three";
import "./style.css";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "stats.js";
import { Earth } from "./Earth.js";
import { Flight } from "./Flight.js";
import { InstancedPlanes } from "./InstancedPlanes.js";
import { ParticlePlanes } from "./ParticlePlanes.js";
import { MergedFlightPaths } from "./MergedFlightPaths.js";
import { Stars } from "./Stars.js";
import { Controls } from "./Controls.js";
import {
  getSunVector3,
  getCurrentUtcTimeHours,
  hoursToTimeString,
  animateCameraToPosition,
  vector3ToLatLng
} from "./Utils.js";
const params = new URLSearchParams(location.search);
const baselineMode = params.get("baseline") === "1";
const forceError = params.get("forceError") === "1";
const compactViewport = Math.min(innerWidth, innerHeight) < 700;
const productFlightCount = compactViewport ? 3500 : 7000;
const baselineDataUrl = "https://raw.githubusercontent.com/jeantimex/flights-tracker/b3be3ae5943103c01b25953cd5c25bb3d9a6296d/src/Data.js";
let flightData = [];
let textureFile = baselineMode
  ? "https://jeantimex.github.io/flights-tracker/world.topo.jpg"
  : "world.topo-2048.jpg";
document.documentElement.classList.toggle("ot-baseline", baselineMode);

let scene,
  camera,
  renderer,
  controls,
  earth,
  flights,
  guiControls,
  instancedPlanes,
  particlePlanes,
  currentPlaneRenderer,
  mergedFlightPaths,
  stats,
  stars,
  ambientLight,
  directionalLight;
let clock = new THREE.Clock();
let interacted = false;
let demoTimers = [];
let interactionPhase = "idle";
let flightSpeedScale = 1;
let freezeStartedAt = 0;
let releaseStartedAt = 0;
let holdTimer = 0;
let holdCancelled = false;
const activePointers = new Map();

function createLoadingScreen() {
  if (!baselineMode) return;
  document.getElementById("loading-screen")?.remove();
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-screen';
  loadingDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000000;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;

  const spinner = document.createElement('div');
  spinner.style.cssText = `
    width: 50px;
    height: 50px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid #58a6ff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  `;

  // Add CSS animation for spinner
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  loadingDiv.appendChild(spinner);
  document.body.appendChild(loadingDiv);
}

function checkReadyToRemoveLoadingScreen() {
  if (window.earthTextureLoaded && window.minTimeElapsed) {
    setInitialCameraPosition();
  }
}

function hideUIElementsDuringLoading() {
  // Hide GUI controls (will be created later but start hidden)
  const guiContainer = document.querySelector('.dg.ac');
  if (guiContainer) {
    guiContainer.style.display = 'none';
  }

  // Hide coordinates in footer (but keep GitHub attribution visible)
  const coordinatesElement = document.getElementById('coordinates');
  if (coordinatesElement) {
    coordinatesElement.style.display = 'none';
  }
}

function showUIElementsAfterLoading() {
  if (!baselineMode) return;
  // Show GUI controls
  const guiContainer = document.querySelector('.dg.ac');
  if (guiContainer) {
    guiContainer.style.display = 'block';
  }

  // Show FPS meter
  if (stats && stats.dom) {
    stats.dom.style.display = 'block';
  }

  // Show coordinates in footer
  const coordinatesElement = document.getElementById('coordinates');
  if (coordinatesElement) {
    coordinatesElement.style.display = 'block';
  }
}

function removeLoadingScreen() {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.5s ease-out';
    setTimeout(() => {
      loadingScreen.remove();
      // Show all UI elements after loading screen is removed
      showUIElementsAfterLoading();
      if (!baselineMode) scheduleGhostDemo();
    }, 500);
  }
}

function init() {
  // Show loading screen first
  createLoadingScreen();

  // Hide UI elements during loading
  hideUIElementsDuringLoading();

  // Setup GUI controls first
  setupGUI();

  // Create scene
  scene = new THREE.Scene();

  // Create camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    20000
  );
  // Initialize loading state
  window.earthTextureLoaded = false;
  window.minTimeElapsed = false;

  // Position camera to show day/night terminator line with delay to show loading screen
  setTimeout(() => {
    window.minTimeElapsed = true;
    checkReadyToRemoveLoadingScreen();
  }, baselineMode ? 2000 : 900);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, baselineMode ? 2 : compactViewport ? 1.35 : 1.75));
  renderer.setClearColor(0x000000);
  document.body.appendChild(renderer.domElement);

  // Create footer with attribution
  if (baselineMode) createFooter();

  // Initialize Stats
  if (baselineMode) {
    stats = new Stats();
    stats.showPanel(0);
    stats.dom.id = "stats";
    stats.dom.style.position = "absolute";
    stats.dom.style.left = "0px";
    stats.dom.style.top = "0px";
    stats.dom.style.display = "none";
    document.body.appendChild(stats.dom);
  } else {
    stats = { begin() {}, end() {} };
  }

  // Add lighting
  ambientLight = new THREE.AmbientLight(0x404040, guiControls.nightBrightness);
  scene.add(ambientLight);

  directionalLight = new THREE.DirectionalLight(0xffffff, guiControls.dayBrightness);

  // Initialize sun position based on real time
  updateSunPosition();

  scene.add(directionalLight);

  // Create and add stars (background starfield)
  stars = new Stars(5000, 10000, 20000);
  stars.addToScene(scene);

  // Create and add Earth with texture loading callback
  earth = new Earth(3000, () => {
    window.earthTextureLoaded = true;
    checkReadyToRemoveLoadingScreen();
  }, textureFile);
  earth.addToScene(scene);

  // Create instanced planes manager with much smaller base size (10x smaller than original)
  instancedPlanes = new InstancedPlanes(flightData.length, 10);
  instancedPlanes.addToScene(scene);
  // Scale by 1.0 so that size=1 gives normal base size (2x bigger than before)
  instancedPlanes.setGlobalScale(guiControls.planeSize * 1.0);
  instancedPlanes.setColorization(guiControls.colorizeePlanes);

  // Create particle planes manager
  particlePlanes = new ParticlePlanes(flightData.length, earth.getRadius());
  particlePlanes.addToScene(scene);
  particlePlanes.setGlobalScale(guiControls.planeSize * 2.0);
  particlePlanes.setColorization(guiControls.colorizeePlanes);

  // Set initial plane renderer based on controls
  currentPlaneRenderer = guiControls.planeRenderType === "particles" ? particlePlanes : instancedPlanes;

  // Hide the non-active renderer
  if (guiControls.planeRenderType === "particles") {
    instancedPlanes.getMesh().visible = false;
    particlePlanes.getMesh().visible = true;
  } else {
    instancedPlanes.getMesh().visible = true;
    particlePlanes.getMesh().visible = false;
  }

  // Create merged flight paths manager
  mergedFlightPaths = new MergedFlightPaths();
  mergedFlightPaths.initialize(flightData.length);
  mergedFlightPaths.addToScene(scene);

  // Create all flights from data with instance IDs
  const allFlights = flightData.map((flightOptions, index) => {
    const flight = new Flight(
      flightOptions,
      earth,
      currentPlaneRenderer,
      index,
      mergedFlightPaths
    );
    return flight;
  });

  // Show only the initial number of flights
  flights = allFlights.slice(0, guiControls.flightCount);
  flights.forEach((flight) => {
    flight.addToScene(scene);
  });

  // Set active count for current plane renderer and flight paths
  currentPlaneRenderer.setActiveCount(guiControls.flightCount);
  mergedFlightPaths.setVisibleFlightCount(guiControls.flightCount);

  // Store all flights for later use
  window.allFlights = allFlights;

  // Initialize OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 3200; // Prevent zooming into Earth surface (Earth radius is 3000)
  controls.maxDistance = 20000;

  if (!baselineMode) setupProductExperience();

  // Handle window resize
  window.addEventListener("resize", onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, baselineMode ? 2 : compactViewport ? 1.35 : 1.75));
}

const locale = (() => {
  const override = localStorage.getItem("game_locale");
  if (override === "zh" || override === "en") return override;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
})();
const productCopy = {
  zh: {
    loading: "正在测绘空域",
    hint: "双指静止按住 · 冻结空域",
    idle: count => `${count.toLocaleString("en-US")} 架航班`,
    frozen: "空域已冻结",
    release: "航班潮汐释放",
    errorTitle: "空域不可用",
    errorBody: "轻触重新载入"
  },
  en: {
    loading: "MAPPING AIRSPACE",
    hint: "HOLD TWO FINGERS · FREEZE THE SKY",
    idle: count => `${count.toLocaleString("en-US")} FLIGHTS`,
    frozen: "AIRSPACE HELD",
    release: "TRAFFIC RELEASED",
    errorTitle: "AIRSPACE UNAVAILABLE",
    errorBody: "TAP TO RELOAD"
  }
};

function applyProductCopy() {
  if (baselineMode) return;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach(node => {
    node.textContent = productCopy[locale][node.dataset.i18n];
  });
}

let audioContext = null;
let holdOscillator = null;
let holdGain = null;

function ensureAudio() {
  if (audioContext) return audioContext;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext = new AudioCtor();
  return audioContext;
}

function startHoldSound() {
  const context = ensureAudio();
  if (!context || holdOscillator) return;
  holdOscillator = context.createOscillator();
  holdGain = context.createGain();
  holdOscillator.type = "triangle";
  holdOscillator.frequency.setValueAtTime(84, context.currentTime);
  holdOscillator.frequency.exponentialRampToValueAtTime(110, context.currentTime + 0.16);
  holdGain.gain.setValueAtTime(0.0001, context.currentTime);
  holdGain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.06);
  holdGain.gain.exponentialRampToValueAtTime(0.012, context.currentTime + 0.2);
  holdOscillator.connect(holdGain).connect(context.destination);
  holdOscillator.start();
}

function releaseSound() {
  if (!audioContext) return;
  if (holdOscillator && holdGain) {
    holdGain.gain.cancelScheduledValues(audioContext.currentTime);
    holdGain.gain.setValueAtTime(Math.max(0.0001, holdGain.gain.value), audioContext.currentTime);
    holdGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.14);
    holdOscillator.stop(audioContext.currentTime + 0.15);
    holdOscillator = null;
    holdGain = null;
  }
  [180, 270, 405].forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, audioContext.currentTime + index * 0.028);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.26);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(audioContext.currentTime + index * 0.028);
    oscillator.stop(audioContext.currentTime + 0.28);
  });
}

function setReadout(phase) {
  const readout = document.querySelector(".ot-readout");
  const label = document.querySelector("[data-readout]");
  if (!readout || !label) return;
  readout.classList.toggle("is-frozen", phase === "frozen");
  readout.classList.toggle("is-release", phase === "release");
  label.textContent = phase === "frozen"
    ? productCopy[locale].frozen
    : phase === "release" ? productCopy[locale].release : productCopy[locale].idle(flights?.length || flightData.length);
}

function freezeAirspace(fromDemo = false) {
  if (baselineMode || interactionPhase === "frozen") return;
  interactionPhase = "frozen";
  freezeStartedAt = performance.now();
  mergedFlightPaths?.setOpacity(0.82);
  if (earth?.mesh?.material) earth.mesh.material.color.setScalar(0.55);
  if (directionalLight) directionalLight.intensity = guiControls.dayBrightness * 0.55;
  if (ambientLight) ambientLight.intensity = guiControls.nightBrightness * 0.55;
  document.querySelector(".ot-ghost")?.classList.add("is-holding");
  if (!fromDemo) {
    document.querySelector(".ot-hint")?.classList.add("is-gone");
    startHoldSound();
  }
  setReadout("frozen");
}

function releaseAirspace(fromDemo = false) {
  if (baselineMode || interactionPhase !== "frozen") return;
  interactionPhase = "release";
  flightSpeedScale = 2.4;
  releaseStartedAt = performance.now();
  document.querySelector(".ot-ghost")?.classList.remove("is-holding");
  if (!fromDemo) releaseSound();
  setReadout("release");
}

function cancelHoldCandidate() {
  clearTimeout(holdTimer);
  holdTimer = 0;
  holdCancelled = true;
}

function beginHoldCandidate() {
  cancelHoldCandidate();
  holdCancelled = false;
  activePointers.forEach(point => {
    point.startX = point.x;
    point.startY = point.y;
  });
  holdTimer = window.setTimeout(() => {
    if (!holdCancelled && activePointers.size === 2) freezeAirspace(false);
  }, 650);
}

function cancelGhostDemo() {
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  document.querySelector(".ot-ghost")?.classList.remove("is-visible", "is-holding");
  if (interactionPhase === "frozen") releaseAirspace(true);
}

function scheduleGhostDemo() {
  if (baselineMode || interacted || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ghost = document.querySelector(".ot-ghost");
  demoTimers = [
    setTimeout(() => ghost?.classList.add("is-visible"), 450),
    setTimeout(() => freezeAirspace(true), 1050),
    setTimeout(() => releaseAirspace(true), 2350),
    setTimeout(() => ghost?.classList.remove("is-visible"), 4600)
  ];
}

function setupProductExperience() {
  applyProductCopy();
  setReadout("idle");

  const canvas = renderer.domElement;
  canvas.addEventListener("pointerdown", event => {
    interacted = true;
    cancelGhostDemo();
    ensureAudio()?.resume();
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
    if (activePointers.size === 2) beginHoldCandidate();
  });
  canvas.addEventListener("pointermove", event => {
    const point = activePointers.get(event.pointerId);
    if (!point) return;
    point.x = event.clientX;
    point.y = event.clientY;
    if (activePointers.size === 2 && Math.hypot(point.x - point.startX, point.y - point.startY) > 12) cancelHoldCandidate();
  });
  const endPointer = event => {
    activePointers.delete(event.pointerId);
    if (activePointers.size < 2) {
      cancelHoldCandidate();
      if (interactionPhase === "frozen") releaseAirspace(false);
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  document.querySelector(".ot-replay")?.addEventListener("pointerdown", event => {
    event.stopPropagation();
    cancelGhostDemo();
    setInitialCameraPosition();
  });
  window.addEventListener("keydown", event => {
    if (event.key !== " ") return;
    event.preventDefault();
    freezeAirspace(false);
    setTimeout(() => releaseAirspace(false), 900);
  });
}

function updateProductInteraction(now) {
  if (baselineMode) return;
  if (interactionPhase === "frozen") {
    const progress = Math.min(1, (now - freezeStartedAt) / 220);
    flightSpeedScale = Math.pow(1 - progress, 3);
    return;
  }
  if (interactionPhase === "release") {
    const progress = Math.min(1, (now - releaseStartedAt) / 1800);
    const tail = 1 - progress;
    flightSpeedScale = 1 + 1.4 * tail * tail;
    mergedFlightPaths?.setOpacity(0.6 + 0.22 * tail);
    if (earth?.mesh?.material) earth.mesh.material.color.setScalar(0.55 + 0.45 * progress);
    if (directionalLight) directionalLight.intensity = guiControls.dayBrightness * (0.55 + 0.45 * progress);
    if (ambientLight) ambientLight.intensity = guiControls.nightBrightness * (0.55 + 0.45 * progress);
    if (earth?.atmosphere?.mesh) {
      const pulse = 1 + Math.sin(Math.PI * Math.min(1, progress / 0.4)) * 0.025;
      earth.atmosphere.mesh.scale.setScalar(pulse);
    }
    if (progress >= 1) {
      interactionPhase = "idle";
      flightSpeedScale = 1;
      earth?.atmosphere?.mesh?.scale.setScalar(1);
      setReadout("idle");
    }
  }
}

function createFooter() {
  const footer = document.createElement('div');
  footer.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40px;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    color: white;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    pointer-events: none;
  `;

  footer.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px; pointer-events: auto;">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" style="width: 16px; height: 16px; fill: white;">
        <path d="M173.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM252.8 8c-138.7 0-244.8 105.3-244.8 244 0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1 100-33.2 167.8-128.1 167.8-239 0-138.7-112.5-244-251.2-244zM105.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>
      </svg>
      <span>Made by</span>
      <a href="https://github.com/jeantimex/flights-tracker" target="_blank" rel="noopener noreferrer"
         style="color: #58a6ff; text-decoration: none; font-weight: 500;">
        jeantimex
      </a>
    </div>
    <div id="coordinates" style="pointer-events: none; font-family: monospace; font-size: 12px; opacity: 0.8; display: none;">
      Lat: 0.00°, Lng: 0.00°
    </div>
  `;

  document.body.appendChild(footer);
}

function updateCoordinateDisplay() {
  const coordinatesElement = document.getElementById('coordinates');
  if (coordinatesElement && camera && earth) {
    // Get the direction from camera to center (0,0,0)
    const direction = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize();
    // Scale to earth surface
    const earthSurfacePoint = direction.multiplyScalar(earth.getRadius());
    // Convert to lat/lng
    const coords = vector3ToLatLng(earthSurfacePoint, earth.getRadius());
    // Update display with 2 decimal places
    coordinatesElement.textContent = `Lat: ${coords.lat.toFixed(2)}°, Lng: ${coords.lng.toFixed(2)}°`;
  }
}

function setupGUI() {
  const controls = new Controls();

  const callbacks = {
    onPlaneSizeChange: (value) => {
      if (currentPlaneRenderer) {
        // Apply 2.0 scaling factor for particle planes and 1.0 for instanced planes (2x bigger than before)
        const scaleFactor = currentPlaneRenderer.isParticleRenderer ? 2.0 : 1.0;
        currentPlaneRenderer.setGlobalScale(value * scaleFactor);
      }
    },
    onPlaneRenderTypeChange: switchPlaneRenderer,
    onFlightCountChange: updateFlightCount,
    onShowFlightPathsChange: toggleFlightPaths,
    onShowPlanesChange: togglePlanes,
    onColorizePlanesChange: togglePlaneColorization,
    onDayNightEffectChange: toggleDayNightEffect,
    onAtmosphereEffectChange: toggleAtmosphereEffect,
    onResetSunPosition: () => {
      directionalLight.position.set(0, 1000, 1000);
    },
    onDayBrightnessChange: updateLighting,
    onNightBrightnessChange: updateLighting
  };

  controls.setup(callbacks, flightData.length);
  guiControls = controls.getControls();
  if (!baselineMode) guiControls.flightCount = flightData.length;

  // Store controls instance globally for access in other functions
  window.guiControlsInstance = controls;

  // Hide GUI controls initially during loading
  const guiContainer = document.querySelector('.dg.ac');
  if (guiContainer) {
    guiContainer.style.display = 'none';
  }
}

function switchPlaneRenderer(renderType) {
  // Update the render type in controls
  guiControls.planeRenderType = renderType;

  // Hide current renderer
  if (currentPlaneRenderer && currentPlaneRenderer.getMesh()) {
    currentPlaneRenderer.getMesh().visible = false;
  }

  // Switch to new renderer
  if (renderType === "particles") {
    currentPlaneRenderer = particlePlanes;
  } else {
    currentPlaneRenderer = instancedPlanes;
  }

  // Show new renderer
  if (currentPlaneRenderer && currentPlaneRenderer.getMesh()) {
    currentPlaneRenderer.getMesh().visible = guiControls.showPlanes;
  }

  // Update flights to use new renderer
  if (window.allFlights) {
    window.allFlights.forEach((flight) => {
      flight.setPlaneRenderer(currentPlaneRenderer);
    });
  }

  // Apply current settings to new renderer
  if (currentPlaneRenderer) {
    currentPlaneRenderer.setActiveCount(guiControls.flightCount);
    // Apply appropriate scaling factor based on renderer type (2x bigger than before)
    const scaleFactor = currentPlaneRenderer.isParticleRenderer ? 2.0 : 1.0;
    currentPlaneRenderer.setGlobalScale(guiControls.planeSize * scaleFactor);
    currentPlaneRenderer.setColorization(guiControls.colorizeePlanes);
  }
}

function updateFlightCount(count) {
  // Update flights array to new count
  flights = window.allFlights.slice(0, count);

  // Update current plane renderer active count
  if (currentPlaneRenderer) {
    currentPlaneRenderer.setActiveCount(count);
  }

  // Update merged flight paths visible count
  if (mergedFlightPaths) {
    mergedFlightPaths.setVisibleFlightCount(count);
  }
}

function toggleDayNightEffect(enabled) {
  if (enabled) {
    updateLighting();
  } else {
    // Disable day/night effect - make lighting uniform and bright
    directionalLight.intensity = 0.5;
    ambientLight.intensity = 1.2;
  }
}

function updateLighting() {
  if (guiControls.dayNightEffect) {
    // Use brightness controls for realistic day/night lighting
    directionalLight.intensity = guiControls.dayBrightness;
    ambientLight.intensity = guiControls.nightBrightness;
  }
}

function toggleAtmosphereEffect(enabled) {
  if (earth && earth.atmosphere) {
    earth.atmosphere.mesh.visible = enabled;
  }
}

function toggleFlightPaths(enabled) {
  if (mergedFlightPaths) {
    mergedFlightPaths.setCurvesVisible(enabled);
  }
}

function togglePlanes(enabled) {
  if (currentPlaneRenderer && currentPlaneRenderer.getMesh()) {
    currentPlaneRenderer.getMesh().visible = enabled;
  }
}

function togglePlaneColorization(enabled) {
  if (currentPlaneRenderer) {
    currentPlaneRenderer.setColorization(enabled);
  }
}

function setInitialCameraPosition() {
  // Get current sun position to determine day/night terminator
  const utcTime = getCurrentUtcTimeHours();
  const sunPos = getSunVector3(3000, utcTime);

  // Position camera at the sun position, then pan 90 degrees to the right
  const cameraDistance = 6000;
  const sunDirection = sunPos.clone().normalize();

  // Rotate the sun direction 70 degrees to the right (around Y-axis)
  const angle = (70 * Math.PI) / 180; // Convert 70 degrees to radians
  const rotatedDirection = new THREE.Vector3();
  rotatedDirection.x = sunDirection.x * Math.cos(angle) + sunDirection.z * Math.sin(angle);
  rotatedDirection.y = sunDirection.y;
  rotatedDirection.z = -sunDirection.x * Math.sin(angle) + sunDirection.z * Math.cos(angle);

  const targetPosition = rotatedDirection.multiplyScalar(cameraDistance);

  // Set a closer starting position to avoid the dramatic zoom effect
  const startPosition = targetPosition.clone().multiplyScalar(1.2); // Start only 20% further out
  camera.position.copy(startPosition);

  // Animate camera to target position with 1 second delay
  animateCameraToPosition(camera, startPosition, targetPosition, 2000, 1000);

  // Remove loading screen after camera positioning starts
  removeLoadingScreen();
}

function updateSunPosition() {
  if (directionalLight) {
    if (guiControls.realTimeSun) {
      // Continuously update UTC time for real-time mode
      const currentUtcTime = getCurrentUtcTimeHours();
      guiControls.simulatedTime = currentUtcTime;
      guiControls.timeDisplay = hoursToTimeString(currentUtcTime);

      // Force update GUI controls to reflect real-time changes
      if (window.guiControlsInstance && window.guiControlsInstance.controllers) {
        // Update the time display field
        if (window.guiControlsInstance.controllers.timeDisplay) {
          window.guiControlsInstance.controllers.timeDisplay.updateDisplay();
        }
        // Update the time slider
        if (window.guiControlsInstance.controllers.timeSlider) {
          window.guiControlsInstance.controllers.timeSlider.updateDisplay();
        }
      }

      const sunPosition = getSunVector3(earth ? earth.getRadius() : 3000, guiControls.simulatedTime);
      directionalLight.position.copy(sunPosition);
    } else if (guiControls.dayNightEffect) {
      // Use simulated time for manual time control (already in UTC)
      const sunPosition = getSunVector3(earth ? earth.getRadius() : 3000, guiControls.simulatedTime);
      directionalLight.position.copy(sunPosition);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  stats.begin();

  const delta = clock.getDelta();
  updateProductInteraction(performance.now());

  // Update controls
  controls.update();

  // Update stars animation
  if (stars) {
    stars.update(delta);
  }

  // Update flight animations with speed multiplier (only if planes are visible)
  if (flights && guiControls.showPlanes) {
    const adjustedDelta = delta * guiControls.animationSpeed * flightSpeedScale;
    let needsMatrixUpdate = false;
    let needsPlaneTypeUpdate = false;

    flights.forEach((flight) => {
      flight.update(adjustedDelta);
      // Track if we need updates for batching
      if (currentPlaneRenderer && !currentPlaneRenderer.isParticleRenderer) {
        needsMatrixUpdate = true;
      }
    });

    // Batch update instance matrices for instanced planes only once per frame
    if (needsMatrixUpdate && currentPlaneRenderer && !currentPlaneRenderer.isParticleRenderer) {
      currentPlaneRenderer.forceMatrixUpdate();
    }
  }

  // Update particle planes if active
  if (currentPlaneRenderer === particlePlanes && particlePlanes) {
    particlePlanes.update(delta);
  }

  // Apply batched updates for flight paths (only once per frame)
  if (mergedFlightPaths) {
    mergedFlightPaths.applyBatchedUpdates();
  }

  // Update sun position every frame if real-time sun is enabled
  updateSunPosition();

  // Update coordinate display
  updateCoordinateDisplay();

  renderer.render(scene, camera);

  window.__ORBITAL_TRAFFIC__ = {
    baselineMode,
    phase: interactionPhase,
    flightSpeedScale: Number(flightSpeedScale.toFixed(3)),
    flightCount: flights?.length || 0,
    loadedRouteCount: flightData.length,
    sourceRouteCount: baselineMode ? flightData.length : 34297,
    textureFile,
    activePointers: activePointers.size,
    cameraPosition: camera.position.toArray().map(value => Number(value.toFixed(1))),
    cameraDistance: Number(camera.position.length().toFixed(1)),
    pathOpacity: Number((mergedFlightPaths?.material?.opacity || 0).toFixed(2)),
    earthBrightness: Number((earth?.mesh?.material?.color.r || 0).toFixed(2)),
    canvas: { width: renderer.domElement.width, height: renderer.domElement.height }
  };

  stats.end();
}

// Initialize and start the application
async function bootstrap() {
  applyProductCopy();
  if (forceError && !baselineMode) {
    document.getElementById("loading-screen")?.remove();
    const error = document.querySelector(".ot-error");
    if (error) {
      error.hidden = false;
      error.addEventListener("pointerdown", () => location.reload(), { once: true });
    }
    window.__ORBITAL_TRAFFIC__ = { baselineMode, phase: "error", forceError: true };
    return;
  }

  if (baselineMode) {
    const response = await fetch(baselineDataUrl);
    if (!response.ok) throw new Error(`Baseline data request failed: ${response.status}`);
    const source = await response.text();
    const start = source.indexOf("[");
    const end = source.lastIndexOf("];");
    if (start < 0 || end < start) throw new Error("Baseline data snapshot is malformed");
    flightData = Function(`"use strict"; return (${source.slice(start, end + 1)});`)();
  } else {
    const dataModule = await import("./DataProduct.js");
    flightData = dataModule.flights.slice(0, productFlightCount);
  }
  init();
  animate();
}

bootstrap().catch(error => {
  console.error(error);
  window.__ORBITAL_TRAFFIC_ERROR__ = error.stack || String(error);
  if (!baselineMode) {
    document.getElementById("loading-screen")?.remove();
    const errorScreen = document.querySelector(".ot-error");
    if (errorScreen) errorScreen.hidden = false;
  }
});
