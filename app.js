const fileInput = document.getElementById("fileInput");
const sampleBtn = document.getElementById("sampleBtn");
const intervalList = document.getElementById("intervalList");
const workoutMeta = document.getElementById("workoutMeta");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resetBtn = document.getElementById("resetBtn");
const currentSegment = document.getElementById("currentSegment");
const currentPower = document.getElementById("currentPower");
const actualPower = document.getElementById("actualPower");
const timeRemaining = document.getElementById("timeRemaining");
const progressBar = document.getElementById("progressBar");
const intervalTemplate = document.getElementById("intervalTemplate");
const ftpInput = document.getElementById("ftpInput");
const connectBtn = document.getElementById("connectBtn");
const connectStatus = document.getElementById("connectStatus");
const targetRangeText = document.getElementById("targetRangeText");
const targetRangeBar = document.getElementById("targetRangeBar");
const actualIndicator = document.getElementById("actualIndicator");
const targetHint = document.getElementById("targetHint");

let currentWorkout = null;
let timerId = null;
let lastTick = null;
let playerState = {
  status: "idle",
  intervalIndex: 0,
  elapsedInInterval: 0,
  totalElapsed: 0,
};
let powerDevice = null;
let powerCharacteristic = null;
let latestPowerWatts = null;

fileInput.addEventListener("change", handleFileChange);
sampleBtn.addEventListener("click", loadSample);
startBtn.addEventListener("click", startWorkout);
pauseBtn.addEventListener("click", pauseWorkout);
resetBtn.addEventListener("click", resetWorkout);
connectBtn.addEventListener("click", connectPowerMeter);
ftpInput.addEventListener("change", () => updatePlayerUi());
intervalList.addEventListener("click", handleIntervalClick);

function handleFileChange(event) {
  const [file] = event.target.files;
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadWorkoutFromText(reader.result);
    } catch (err) {
      showError(err);
    }
  };
  reader.readAsText(file);
}

function loadWorkoutFromText(text) {
  const parsed = parseZwiftXml(text);
  currentWorkout = parsed;
  resetWorkout();
  renderWorkout(parsed);
}

function showError(err) {
  workoutMeta.innerHTML = `<p class="error">Could not read workout: ${err.message}</p>`;
  intervalList.innerHTML = "";
  intervalList.classList.add("empty");
}

function parseZwiftXml(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("File is not valid XML");
  }
  const workoutEl = doc.querySelector("workout");
  if (!workoutEl) {
    throw new Error("Could not find <workout> section");
  }

  const name = (doc.querySelector("name")?.textContent || "Untitled Workout").trim();
  const author = (doc.querySelector("author")?.textContent || "Unknown author").trim();
  const description = (doc.querySelector("description")?.textContent || "").trim();

  const intervals = [];
  for (const child of workoutEl.children) {
    const tag = child.tagName;
    if (tag === "SteadyState") {
      intervals.push({
        type: "steady",
        label: "Steady State",
        durationSec: toNumber(child.getAttribute("Duration")),
        startPower: toNumber(child.getAttribute("Power")),
        endPower: toNumber(child.getAttribute("Power")),
      });
    } else if (tag === "Warmup") {
      intervals.push({
        type: "warmup",
        label: "Warmup",
        durationSec: toNumber(child.getAttribute("Duration")),
        startPower: toNumber(child.getAttribute("PowerLow")),
        endPower: toNumber(child.getAttribute("PowerHigh")),
      });
    } else if (tag === "Cooldown") {
      intervals.push({
        type: "cooldown",
        label: "Cooldown",
        durationSec: toNumber(child.getAttribute("Duration")),
        startPower: toNumber(child.getAttribute("PowerHigh")),
        endPower: toNumber(child.getAttribute("PowerLow")),
      });
    } else if (tag === "FreeRide") {
      intervals.push({
        type: "freeride",
        label: "Free Ride",
        durationSec: toNumber(child.getAttribute("Duration")),
        startPower: null,
        endPower: null,
      });
    } else if (tag === "IntervalsT") {
      const repeat = Math.max(1, Math.round(toNumber(child.getAttribute("Repeat"))));
      const onDuration = toNumber(child.getAttribute("OnDuration"));
      const offDuration = toNumber(child.getAttribute("OffDuration"));
      const onPower = toNumber(child.getAttribute("OnPower"));
      const offPower = toNumber(child.getAttribute("OffPower"));
      for (let i = 0; i < repeat; i++) {
        intervals.push({
          type: "interval-on",
          label: `Interval ${i + 1} - On`,
          durationSec: onDuration,
          startPower: onPower,
          endPower: onPower,
        });
        intervals.push({
          type: "interval-off",
          label: `Interval ${i + 1} - Off`,
          durationSec: offDuration,
          startPower: offPower,
          endPower: offPower,
        });
      }
    }
  }

  if (intervals.length === 0) {
    throw new Error("No intervals found in workout");
  }

  const totalDurationSec = intervals.reduce((sum, i) => sum + i.durationSec, 0);
  return { name, author, description, intervals, totalDurationSec };
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function renderWorkout(workout) {
  workoutMeta.innerHTML = `
    <p><strong>${workout.name}</strong> by ${workout.author}</p>
    ${workout.description ? `<p>${workout.description}</p>` : ""}
    <p>Total time: ${formatTime(workout.totalDurationSec)}</p>
  `;

  intervalList.innerHTML = "";
  intervalList.classList.remove("empty");
  workout.intervals.forEach((interval, idx) => {
    const node = intervalTemplate.content.cloneNode(true);
    const container = node.querySelector(".interval");
    container.dataset.index = idx;
    container.classList.add("clickable");
    node.querySelector(".interval-name").textContent = interval.label || `Block ${idx + 1}`;
    node.querySelector(".interval-meta").textContent = powerText(interval);
    node.querySelector(".interval-duration").textContent = formatTime(interval.durationSec);

    const bar = node.querySelector(".interval-bar");
    bar.style.background = barGradient(interval);
    intervalList.appendChild(node);
  });
}

function powerText(interval) {
  if (interval.startPower === null || interval.endPower === null) {
    return "Ride at your choice (ERG off)";
  }
  const start = percent(interval.startPower);
  const end = percent(interval.endPower);
  return start === end ? `${start}% FTP` : `${start}% → ${end}% FTP`;
}

function barGradient(interval) {
  if (interval.startPower === null || interval.endPower === null) {
    return "linear-gradient(90deg, #94a3b8, #cbd5e1)";
  }
  const start = Math.max(0, Math.min(1.4, interval.startPower));
  const end = Math.max(0, Math.min(1.4, interval.endPower));
  const startColor = powerColor(start);
  const endColor = powerColor(end);
  return `linear-gradient(90deg, ${startColor}, ${endColor})`;
}

function powerColor(power) {
  if (power < 0.6) return "#22c55e";
  if (power < 0.8) return "#10b981";
  if (power < 1.0) return "#2563eb";
  if (power < 1.2) return "#f59e0b";
  return "#ef4444";
}

function percent(value) {
  return Math.round(value * 100);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function handleIntervalClick(event) {
  const target = event.target.closest(".interval");
  if (!target || !intervalList.contains(target)) return;
  const idx = Number(target.dataset.index);
  if (!Number.isFinite(idx)) return;
  seekToInterval(idx);
}

function seekToInterval(index) {
  if (!currentWorkout) return;
  if (index < 0 || index >= currentWorkout.intervals.length) return;
  const prefixDuration = currentWorkout.intervals.slice(0, index).reduce((sum, i) => sum + i.durationSec, 0);
  playerState.intervalIndex = index;
  playerState.elapsedInInterval = 0;
  playerState.totalElapsed = prefixDuration;
  if (playerState.status === "finished") {
    playerState.status = "paused";
    startBtn.disabled = false;
    pauseBtn.disabled = true;
  } else if (playerState.status === "idle") {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
  } else if (playerState.status === "running") {
    lastTick = performance.now();
    if (!timerId) timerId = requestAnimationFrame(tick);
  }
  resetBtn.disabled = false;
  updatePlayerUi();
}

function startWorkout() {
  if (!currentWorkout) {
    alert("Import a .zwo workout first.");
    return;
  }
  if (playerState.status === "running") return;
  if (playerState.status === "idle") {
    playerState.status = "running";
  } else if (playerState.status === "paused" || playerState.status === "finished") {
    playerState.status = "running";
  }
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  resetBtn.disabled = false;
  requestFullscreen();
  lastTick = performance.now();
  timerId = requestAnimationFrame(tick);
}

function pauseWorkout() {
  if (playerState.status !== "running") return;
  playerState.status = "paused";
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  if (timerId) cancelAnimationFrame(timerId);
}

function resetWorkout() {
  if (timerId) cancelAnimationFrame(timerId);
  playerState = { status: "idle", intervalIndex: 0, elapsedInInterval: 0, totalElapsed: 0 };
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  resetBtn.disabled = true;
  exitFullscreenIfAny();
  updatePlayerUi();
}

function tick(timestamp) {
  if (playerState.status !== "running" || !currentWorkout) return;
  const deltaSec = (timestamp - lastTick) / 1000;
  lastTick = timestamp;
  playerState.elapsedInInterval += deltaSec;
  playerState.totalElapsed += deltaSec;

  const interval = currentWorkout.intervals[playerState.intervalIndex];
  if (!interval) {
    finishWorkout();
    return;
  }

  if (playerState.elapsedInInterval >= interval.durationSec) {
    const extra = playerState.elapsedInInterval - interval.durationSec;
    playerState.intervalIndex += 1;
    playerState.elapsedInInterval = 0;
    if (playerState.intervalIndex >= currentWorkout.intervals.length) {
      finishWorkout();
      return;
    }
    // carry any extra time into the next interval
    playerState.elapsedInInterval += extra;
  }

  updatePlayerUi();
  timerId = requestAnimationFrame(tick);
}

function finishWorkout() {
  playerState.status = "finished";
  startBtn.disabled = true;
  pauseBtn.disabled = true;
  resetBtn.disabled = false;
  updatePlayerUi(true);
  if (timerId) cancelAnimationFrame(timerId);
  alert("Workout complete!");
}

function updatePlayerUi(forceComplete = false) {
  const ftp = getFtp();
  if (!currentWorkout || forceComplete) {
    currentSegment.textContent = forceComplete ? "Complete" : "—";
    currentPower.textContent = "—";
    actualPower.textContent = "—";
    timeRemaining.textContent = forceComplete
      ? `${formatTime(currentWorkout?.totalDurationSec || 0)} / ${formatTime(currentWorkout?.totalDurationSec || 0)}`
      : "00:00 / 00:00";
    progressBar.style.width = forceComplete ? "100%" : "0%";
    targetRangeText.textContent = "No target loaded";
    targetHint.textContent = "Import a workout and set FTP to see target ranges.";
    updateTargetVisualization(null, latestPowerWatts, ftp);
    return;
  }

  const interval = currentWorkout.intervals[playerState.intervalIndex];
  const elapsed = playerState.elapsedInInterval;
  const totalProgress = Math.min(1, playerState.totalElapsed / currentWorkout.totalDurationSec);
  const target = computeTarget(interval, elapsed, ftp);

  currentSegment.textContent = interval.label;
  currentPower.textContent = target?.currentLabel || powerText(interval);
  actualPower.textContent = latestPowerWatts != null ? `${latestPowerWatts} W` : "—";
  timeRemaining.textContent = `${formatTime(playerState.totalElapsed)} / ${formatTime(currentWorkout.totalDurationSec)}`;
  progressBar.style.width = `${Math.round(totalProgress * 100)}%`;
  targetRangeText.textContent = target?.rangeLabel || "Free ride / ERG off";
  targetHint.textContent = ftp ? "Aim to keep the indicator within the green band." : "Enter your FTP to translate % targets into watts.";
  updateTargetVisualization(target, latestPowerWatts, ftp);
  highlightActiveInterval(playerState.intervalIndex);
}

function getFtp() {
  const value = Number(ftpInput.value);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function computeTarget(interval, elapsed, ftp) {
  if (!interval || interval.startPower === null || interval.endPower === null || !ftp) return null;
  const startW = Math.round(interval.startPower * ftp);
  const endW = Math.round(interval.endPower * ftp);
  const duration = interval.durationSec || 1;
  const progress = Math.min(1, Math.max(0, elapsed / duration));
  const currentW = Math.round(startW + (endW - startW) * progress);
  const rangeLabel =
    startW === endW
      ? `${startW} W (${percent(interval.startPower)}% FTP)`
      : `${startW}-${endW} W (${percent(interval.startPower)}%→${percent(interval.endPower)}% FTP)`;
  const currentLabel = `${currentW} W (${Math.round((currentW / ftp) * 100)}% FTP)`;
  return { startW, endW, currentW, rangeLabel, currentLabel };
}

function updateTargetVisualization(target, actual, ftp) {
  const span = ftp ? ftp * 1.5 : 300;
  if (target && ftp) {
    const min = Math.min(target.startW, target.endW);
    const max = Math.max(target.startW, target.endW);
    const leftPct = clamp((min / span) * 100, 0, 100);
    const rightPct = clamp((max / span) * 100, 0, 100);
    targetRangeBar.style.left = `${leftPct}%`;
    targetRangeBar.style.width = `${Math.max(4, rightPct - leftPct)}%`;
  } else {
    targetRangeBar.style.left = "0%";
    targetRangeBar.style.width = "100%";
  }

  if (actual != null && ftp) {
    const actualPct = clamp((actual / span) * 100, 0, 100);
    actualIndicator.style.left = `${actualPct}%`;
    actualIndicator.style.opacity = 1;
  } else {
    actualIndicator.style.opacity = 0.3;
    actualIndicator.style.left = target ? targetRangeBar.style.left : "0%";
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function highlightActiveInterval(index) {
  const items = intervalList.querySelectorAll(".interval");
  items.forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.index) === index);
  });
}

function requestFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
}

function exitFullscreenIfAny() {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}

async function connectPowerMeter() {
  if (!("bluetooth" in navigator)) {
    connectStatus.textContent = "Bluetooth not supported in this browser.";
    return;
  }
  try {
    connectBtn.disabled = true;
    connectStatus.textContent = "Searching for power meters…";
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ["cycling_power"] }],
      optionalServices: ["cycling_power"],
    });
    powerDevice = device;
    powerDevice.addEventListener("gattserverdisconnected", () => {
      connectStatus.textContent = "Disconnected. Click to reconnect.";
      latestPowerWatts = null;
      updatePlayerUi();
    });
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService("cycling_power");
    powerCharacteristic = await service.getCharacteristic("cycling_power_measurement");
    await powerCharacteristic.startNotifications();
    powerCharacteristic.addEventListener("characteristicvaluechanged", handlePowerMeasurement);
    connectStatus.textContent = `Connected to ${device.name || "power meter"}`;
  } catch (err) {
    connectStatus.textContent = `Connection failed: ${err.message}`;
  } finally {
    connectBtn.disabled = false;
  }
}

function handlePowerMeasurement(event) {
  const data = event.target.value;
  // Flags not used yet; first 2 bytes flags, next 2 bytes instantaneous power in watts
  if (!data || data.byteLength < 4) return;
  const instantaneousPower = data.getInt16(2, true);
  latestPowerWatts = instantaneousPower;
  updatePlayerUi();
}

function loadSample() {
  loadWorkoutFromText(sampleZwo);
}

const sampleZwo = `<?xml version="1.0" encoding="UTF-8"?>
<workout_file>
  <author>CycleTraining Demo</author>
  <name>Sweet Spot Sampler</name>
  <description>Quick sampler with warmup, sweet spot repeats, and cooldown.</description>
  <workout>
    <Warmup Duration="300" PowerLow="0.55" PowerHigh="0.75" />
    <SteadyState Duration="240" Power="0.9" />
    <IntervalsT Repeat="3" OnDuration="180" OffDuration="90" OnPower="0.95" OffPower="0.6" />
    <SteadyState Duration="240" Power="0.88" />
    <Cooldown Duration="240" PowerLow="0.45" PowerHigh="0.75" />
  </workout>
</workout_file>`;

const libraryXml = localStorage.getItem("libraryWorkoutXml");
if (libraryXml) {
  try {
    loadWorkoutFromText(libraryXml);
  } catch (err) {
    showError(err);
  } finally {
    localStorage.removeItem("libraryWorkoutXml");
    localStorage.removeItem("libraryWorkoutName");
  }
}

// Initialize empty UI state
updatePlayerUi();
