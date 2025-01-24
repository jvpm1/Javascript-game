// Imports
import { decodeOsuFormat } from "./parser.js";

// ...
const ctx = new AudioContext();

// ...
const SONGS_PATH = "./assets/songs/";
const INNER_WIDTH = window.innerWidth;
const INNER_HEIGHT = window.innerHeight;

const LANE_POSITIONS = {
  64: 0, // d
  192: 1, // f
  320: 2, // k
  448: 3, // l
};

const KEY_MAP = {
  d: 0,
  f: 1,
  j: 2,
  k: 3,
};

// Elements
const mainCanvas = document.getElementById("mainCanvas");
const mainSongsContainer = document.getElementById("mainSongsContainer");
const songsContainer = document.getElementById("songsContainer");

const mapsContainer = document.getElementById("mapsContainer");
const imgBackground = document.getElementById("imgBackground");

const detailTitle = document.getElementById("detailTitle");
const detailImg = document.getElementById("detailImg");

// Vars
let lastSelectedSong;
let songsData;
let songsDir;

let settings = {
  approachTime: 600,

  hitLineOffset: 150,

  laneWidth: 140,
  laneGap: 20,
};

let _storage = {
  active: false,
  audio: null,

  maxHitDistance: 200,

  eventConnection: {
    renderLoop: null,
    keys: {},
  },
};

// Functions
const initSongsDir = async () => {
  const response = await fetch("./songsDir.json").then((res) => res.text());
  songsDir = JSON.parse(response);
};

function msToTime(s) {
  // https://stackoverflow.com/questions/9763441/milliseconds-to-time-in-javascript
  const ms = s % 1000;
  s = (s - ms) / 1000;
  const secs = s % 60;
  s = (s - secs) / 60;
  const mins = s % 60;

  return mins + ":" + secs;
}

const stopAudio = async () => {
  if (!_storage.audio || !_storage.audio.stop) return;
  await _storage.audio.stop();
};

const playAudio = async (filePath, startTime = 0) => {
  // Mp3 only
  const songData = await fetch(filePath)
    .then((data) => data.arrayBuffer())
    .then((arrayBuffer) => ctx.decodeAudioData(arrayBuffer));

  await stopAudio();

  const audio = ctx.createBufferSource();
  audio.buffer = songData;
  audio.connect(ctx.destination);
  audio.start(ctx.currentTime, startTime);

  _storage.audio = audio;
};

export const saveSettingsToStorage = () => {
  Object.entries(settings).forEach((tbl) => {
    const [name, value] = [tbl[0], tbl[1]];

    localStorage[name] = String(value);
  });
};

export const loadSettingsToStorage = () => {
  Object.entries(settings).forEach((tbl) => {
    const name = tbl[0];

    const localStorageValue = localStorage[name];
    if (!localStorageValue) return;

    settings[name] = Number(localStorageValue);
  });
};

export const notify = (
  _text,
  _textColor = color(255, 255, 255),
  _position = pos(INNER_WIDTH / 2, INNER_HEIGHT / 2),
) =>
  add([
    text(_text),
    _position,
    _textColor,
    lifespan(0.5),
    move(UP, 100),
    "notification",
  ]);

export const cancelStage = async () => {
  const isActive = _storage.active;
  if (!isActive) {
    return isActive;
  }

  // Stop audio
  await stopAudio();

  // Disconnect loop(): function
  await _storage.eventConnection.renderLoop.cancel();

  // Disconnect keys (d, f, j, and k) connect event
  Object.values(_storage.eventConnection.keys).forEach((keyConnection) => {
    keyConnection.cancel();
  });

  // Destroy stage kaboom.js elments
  ["hitLine", "note", "lane", "notification", "score"].forEach((tag) => {
    destroyAll(tag);
  });

  _storage.active = false;

  return isActive;
};

export const getSongsData = async (overwriteSongDir) => {
  console.debug("Caching song data...");

  if (!songsDir) {
    await initSongsDir();
  }

  const songsData = Promise.all(
    (overwriteSongDir || songsDir).map(async (tbl) => {
      const pathToFolder = `${SONGS_PATH}${tbl.name}`;
      const maps = await Promise.all(
        tbl.files
          .filter((fileName) => fileName.endsWith(".osu"))
          .map(async (fileName) => {
            const pathToFile = `${SONGS_PATH}${tbl.name}/${fileName}`;
            const fileContent = await fetch(pathToFile).then((res) =>
              res.text(),
            );
            const osuFormat = await decodeOsuFormat(fileContent);

            return osuFormat;
          }),
      );

      return {
        name: tbl.name,
        path: pathToFolder,
        maps: maps,
      };
    }),
  );

  return songsData;
};

export const loadSong = async (mapData, songPath) => {
  // Cache calculations
  const approachTime = settings.approachTime;
  const lanesDefinedWidth = settings.laneWidth * 4 + settings.laneGap * 3;
  const laneStartPosition = INNER_WIDTH / 2 - lanesDefinedWidth / 2;
  const laneGapAndWidth = settings.laneWidth + settings.laneGap;
  const hitLinePosition = INNER_HEIGHT - settings.hitLineOffset;
  const maxHitDistance = _storage.maxHitDistance;
  const missPositionThreshold = hitLinePosition + maxHitDistance;

  let scoreElement;
  let score = 0;

  let startedTimeline;
  let currentTime = 0;
  let upcomingNotes = [];
  let laneNotes = [];

  const buildStage = () => {
    console.debug("[*] Building stage...");

    // Score element
    scoreElement = add([text("0"), pos(24, 24), "score"]);

    // Create lanes
    Array.from({ length: 4 }).forEach((_, i) => {
      add([
        rect(settings.laneWidth, INNER_HEIGHT),
        pos(laneStartPosition + i * laneGapAndWidth, 0),
        color(30, 30, 30),
        "lane",
      ]);
    });

    // Create hit line
    add([
      rect(lanesDefinedWidth, 2),
      pos(laneStartPosition, hitLinePosition),
      color(255, 255, 255),
      "hitLine",
    ]);

    console.debug("[!] Done building stage!");
  };

  const init = () => {
    console.debug("[*] Initializing upcoming notes");

    upcomingNotes = mapData["[HitObjects]"]
      .filter((noteData) => noteData[0] !== "")
      // .filter((noteData) => noteData[2] < 2000)
      .map((noteData) => ({
        lanePosition: Number(noteData[0]),
        spawnTime: Number(noteData[2]),
      }));

    Object.entries(LANE_POSITIONS).forEach((lanePosition) => {
      laneNotes[lanePosition[0]] = [];
    });

    console.debug("[!] Done initializing notes!");
  };

  const handleNoteHit = (timingDiff, closestNote) => {
    if (timingDiff <= maxHitDistance * 0.3) {
      score += 300;
      notify("Perfect!", color(255, 100, 255));
    } else if (timingDiff <= maxHitDistance * 0.5) {
      score += 200;
      notify("Great!", color(255, 255, 100));
    } else if (timingDiff <= maxHitDistance) {
      score += 20;
      notify("Bad!", color(100, 255, 100));
    } else {
      notify("Miss!", color(255, 100, 100));
    }

    scoreElement.text = score;
  };

  const update = async () => {
    currentTime = (_storage.audio.context.currentTime - startedTimeline) * 1000; // _storage.audio.context.currentTime * 1000;

    // Handle next note
    const nextNote = upcomingNotes[0];
    const notes = get("note");

    // Stop when there's no more notes to be spawned and notes that are rendered
    if (!notes[0] && !nextNote) {
      await wait(2);
      await cancelStage();
      await loadSongsList();
      return;
    }

    // Spawn note
    if (nextNote && currentTime > nextNote.spawnTime - approachTime) {
      const startTime = currentTime;
      const totalDistance = nextNote.spawnTime - startTime;

      const horizontalPosition =
        laneStartPosition +
        LANE_POSITIONS[nextNote.lanePosition] * laneGapAndWidth;

      const note = add([
        rect(settings.laneWidth, 30),
        pos(horizontalPosition, 0),
        color(255, 255, 255),
        area(),
        "note",
        {
          lanePosition: nextNote.lanePosition,
          spawnTime: nextNote.spawnTime,
          startTime: startTime,
          totalDistance: totalDistance,
          xPos: horizontalPosition,
        },
      ]);

      upcomingNotes.shift();
      laneNotes[nextNote.lanePosition].push(note);
    }

    // Update existing notes
    notes.forEach((note) => {
      const currentProgress = currentTime - note.startTime;
      const progressPercentage = currentProgress / note.totalDistance;

      note.moveTo(note.xPos, hitLinePosition * progressPercentage);

      if (note.pos.y > missPositionThreshold) {
        notify("Miss!", color(255, 100, 100));
        destroy(note);
        laneNotes[note.lanePosition].shift();
      }
    });
  };

  buildStage();
  init();

  await wait(1);

  // Initialize audio
  await playAudio(`${songPath}${mapData["[General]"].AudioFilename}`);

  // Update loop
  _storage.eventConnection.renderLoop = onUpdate(update);
  _storage.active = true;
  startedTimeline = _storage.audio.context.currentTime;

  // Initialize keypress event connections
  const laneOnKeyPress = (laneNumber) => {
    const closestNote = laneNotes[laneNumber][0];
    if (!closestNote) return;

    const timingDiff = Math.abs(closestNote.spawnTime - currentTime); // Math.abs(closestNote.pos.y - hitLinePosition);

    if (timingDiff <= maxHitDistance) {
      destroy(closestNote);

      handleNoteHit(timingDiff, closestNote);
      laneNotes[laneNumber].shift();
    }
  };

  Object.entries(KEY_MAP).forEach(([key, laneIndex]) => {
    const laneNumber = Object.entries(LANE_POSITIONS).find(
      ([_, idx]) => idx === laneIndex,
    )[0];

    const keyConnection = onKeyPress(key, () => laneOnKeyPress(laneNumber));

    _storage.eventConnection.keys[key] = keyConnection;
  });
};

export const calcDifficulty = (mapData) => {
  return Math.floor(mapData["[HitObjects]"].length / 100);
};

export const loadSongDetail = async (songData) => {
  const firstMapData = songData.maps[0];

  const { Title } = firstMapData["[Metadata]"];
  const { AudioFilename, PreviewTime } = firstMapData["[General]"];
  const img = firstMapData["[Events]"][0][2].replaceAll('"', "");
  const imgPath = `${SONGS_PATH}${songData.name}/${img}`;

  // Loading text
  detailTitle.innerHTML = "Loading...";
  imgBackground.src = "";
  detailImg.src = "";
  mapsContainer.innerHTML = "";

  // Load song
  await playAudio(
    `${songData.path}/${AudioFilename}`,
    Number(PreviewTime) / 1000,
  );

  // Assign images
  imgBackground.src = imgPath;
  detailImg.src = imgPath;
  detailTitle.innerHTML = Title;

  // Clear elements
  mapsContainer.innerHTML = "";

  // Update map elements
  const maps = songData.maps.sort(
    (a, b) => calcDifficulty(a) - calcDifficulty(b),
  );

  maps.forEach((mapData) => {
    const rating = calcDifficulty(mapData);
    const detailButton = document.createElement("button");
    detailButton.className =
      "relative w-full h-20 bg-zinc-950/70 rounded-lg font-bold text-2xl text-left p-5 mb-5 ";
    detailButton.innerHTML = `[${rating}] ${mapData["[Metadata]"].Version}`;

    mapsContainer.appendChild(detailButton);
    detailButton.addEventListener("click", async () => {
      mainSongsContainer.style.display = "none";

      // lastSelectedSong = songData;

      await loadSong(mapData, `./assets/songs/${songData.name}/`);

      mainCanvas.focus();
    });
  });
};

export const loadSongsList = async () => {
  if (!songsData) {
    songsData = await getSongsData();
  }

  // if (lastSelectedSong) {
  //   loadSongDetail(songsData[0]);
  // }

  mainSongsContainer.style.display = "grid";
  songsContainer.innerHTML = "";

  songsData.forEach((songData) => {
    const mapData = songData.maps[0];
    if (!mapData) {
      return;
    }

    const hitObjects = mapData["[HitObjects]"];
    const { Title, Artist, Creator } = mapData["[Metadata]"];
    const img = mapData["[Events]"][0][2].replaceAll('"', "");
    const length = hitObjects[hitObjects.length - 2][2];

    const songButton = document.createElement("button");
    songButton.className =
      "mb-5 relative p-5 flex flex-row items-center gap-5 flex-shrink-0 w-full h-43 rounded-2xl overflow-hidden cursor-pointer border-none m-0 bg-transparent shadow-xl";

    songButton.innerHTML = `
      <img
          src="./assets/songs/${songData.name}/${img}"
          alt=""
          class="absolute inset-0 w-full h-full object-cover scale-150 blur-lg brightness-30"
      />
      <img
          src="./assets/songs/${songData.name}/${img}"
          alt=""
          class="relative flex-shrink-0 w-32 h-32 rounded-xl object-cover shadow-xl shadow-[rgba(0,0,0,0.3)]"
      />
      <div class="relative flex flex-col items-start h-full w-full rounded-xl bg-[rgba(0,0,0,0.7)] shadow-xl shadow-[rgba(0,0,0,0.3)] p-3">
          <div class="text-3xl m-0 text-wrap font-bold">${Title}</div>
          <div class="m-0">Artist: ${Artist}</div>
          <div class="m-0">Mapper: ${Creator}</div>
          <div class="m-0">Length: ${msToTime(length)}</div>
      </div>
      `;

    songButton.addEventListener("click", () => {
      loadSongDetail(songData);
    });

    songsContainer.appendChild(songButton);
  });
};

export const loadSettingsWindow = async () => {
  const settingsWindow = document.createElement("div");
  settingsWindow.id = "settingsWindow";
  settingsWindow.style.display = "none";
  settingsWindow.innerHTML = `
    <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
    >
        <div class="bg-zinc-900/80 rounded-xl p-6 w-96 shadow-xl">
            <div class="flex justify-between items-center mb-6">
                <h2 class="text-xl font-bold">Game Settings</h2>
                <button
                    id="closeSettings"
                    class="p-1 hover:bg-zinc-800 rounded"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="M18 6 6 18"></path>
                        <path d="m6 6 12 12"></path>
                    </svg>
                </button>
            </div>

            <div id="settingsItems" class="space-y-4"></div>

            <div class="mt-6 flex justify-end space-x-3">
                <button
                    id="cancelSettings"
                    class="px-4 py-2 rounded bg-zinc-700"
                >
                    Cancel
                </button>
                <button
                    id="saveSettings"
                    class="px-4 py-2 rounded bg-blue-400"
                >
                    Save Changes
                </button>
            </div>
        </div>
    </div>
  `;

  document.body.appendChild(settingsWindow);

  const settingsItems = document.getElementById("settingsItems");
  const closeBtn = document.getElementById("closeSettings");
  const cancelBtn = document.getElementById("cancelSettings");
  const saveBtn = document.getElementById("saveSettings");

  const inputs = [];

  function closeWindow() {
    settingsWindow.remove();
    inputs.length = 0; // Clear out inputs array
  }

  settingsWindow.style.display = "block";

  function loadSettings() {
    Object.entries(settings).forEach((tbl) => {
      const name = tbl[0];
      const value = tbl[1];

      const container = document.createElement("div");
      const label = document.createElement("label");
      const input = document.createElement("input");

      label.className = "block text-sm mb-1";
      label.textContent = name;

      input.className = "w-full bg-zinc-800 rounded p-2 text-white";
      input.type = "number";
      input.value = value;

      inputs.push({
        name: name,
        // defaultValue: value,

        // container: container,
        // label: label,
        input: input,
      });

      container.appendChild(label);
      container.appendChild(input);
      settingsItems.appendChild(container);
    });
  }

  function saveSettings() {
    inputs.forEach((tbl) => {
      const value = Number(tbl.input.value);
      const name = tbl.name;

      settings[name] = value;
    });

    saveSettingsToStorage();

    closeWindow();
  }

  loadSettings();

  closeBtn.addEventListener("click", closeWindow);
  cancelBtn.addEventListener("click", closeWindow);
  saveBtn.addEventListener("click", saveSettings);
};
