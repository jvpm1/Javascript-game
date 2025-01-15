// Imports
import { getDir } from "./util.js";
import { decodeOsuFormat } from "./parser.js";

// Core
const SONGS_PATH = "assets/songs/";
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

// Vars
export let songsData;

export const game = {
  stage: {
    active: false,

    speed: 7,
    updateRate: 0.025,

    laneWidth: 140,
    laneGap: 20,
    hitLineOffset: 150,
    maxHitDistance: 200,

    renderLoop: null,
    keys: {},
    audio: new Audio(),
  },
};

// Functions
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
  const isActive = game.stage.active;
  if (!isActive) {
    return isActive;
  }

  // Stop audio
  game.stage.audio.pause();
  game.stage.audio.currentTime = 0;

  // Disconnect loop(): function
  await game.stage.renderLoop.cancel();

  // Disconnect keys (d, f, j, and k) connect event
  Object.values(game.stage.keys).forEach((keyConnection) => {
    keyConnection.cancel();
  });

  // Destroy stage kaboom.js elments
  ["hitLine", "note", "lane", "notification"].forEach((tag) => {
    destroyAll(tag);
  });

  game.stage.active = false;

  return isActive;
};

export const getSongsData = async (songsFolderDir = SONGS_PATH) => {
  console.debug("Caching song data...");

  try {
    const songNames = await getDir(songsFolderDir);

    const fetchedSongsData = await Promise.all(
      songNames.map(async (songName) => {
        const cleanedSongName = songName.endsWith("/")
          ? songName.slice(0, -1)
          : songName;
        const songFolderDir = `${songsFolderDir}${cleanedSongName}`;

        const songChildren = await getDir(songFolderDir);
        const osuFiles = songChildren.filter((file) => file.endsWith(".osu"));

        const mapsData = await Promise.all(
          osuFiles.map(async (file) => {
            const osuPath = `${songFolderDir}/${file}`;
            const response = await fetch(osuPath);
            const osuText = await response.text();
            return decodeOsuFormat(osuText);
          }),
        );

        return {
          name: cleanedSongName,
          path: songFolderDir,
          maps: mapsData,
        };
      }),
    );

    console.debug("Done caching song data!");

    return fetchedSongsData;
  } catch (error) {
    console.error(`getSongs error: ${error}`);

    return null;
  }
};

export const loadSong = async (mapData, songPath) => {
  // Cache calculations
  const lanesDefinedWidth = game.stage.laneWidth * 4 + game.stage.laneGap * 3;
  const laneStartPosition = INNER_WIDTH / 2 - lanesDefinedWidth / 2;
  const laneGapAndWidth = game.stage.laneWidth + game.stage.laneGap;
  const hitLinePosition = INNER_HEIGHT - game.stage.hitLineOffset;
  const maxHitDistance = game.stage.maxHitDistance;
  const missPositionThreshold = hitLinePosition + maxHitDistance;
  const noteUpdateOffset = game.stage.speed * (game.stage.updateRate * 10000);
  const timeToReachHitLine =
    (hitLinePosition / (game.stage.speed * (game.stage.updateRate * 10000))) *
    1000;

  let currentTime = 0;
  let upcomingNotes = [];
  let laneNotes = [];

  const buildStage = () => {
    console.debug("[*] Building stage...");

    // Create lanes
    Array.from({ length: 4 }).forEach((_, i) => {
      add([
        rect(game.stage.laneWidth, INNER_HEIGHT),
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
      notify("Perfect!", color(255, 100, 255));
    } else if (timingDiff <= maxHitDistance * 0.5) {
      notify("Great!", color(255, 255, 100));
    } else if (timingDiff <= maxHitDistance) {
      notify("Bad!", color(100, 255, 100));
    } else {
      notify("Miss!", color(255, 100, 100));
    }
  };

  const update = async () => {
    currentTime = game.stage.audio.currentTime * 1000;

    // Update existing notes
    get("note").forEach((note) => {
      note.move(0, noteUpdateOffset);
      if (note.pos.y > missPositionThreshold) {
        notify("Miss!", color(255, 100, 100));
        laneNotes[note.lanePosition].shift();
        destroy(note);
      }
    });

    // Handle next note
    const nextNote = upcomingNotes[0];
    if (!nextNote) {
      await cancelStage();
      await loadSongsList();
      return;
    }

    if (currentTime > nextNote.spawnTime - timeToReachHitLine) {
      const note = add([
        rect(game.stage.laneWidth, 30),
        pos(
          laneStartPosition +
            LANE_POSITIONS[nextNote.lanePosition] * laneGapAndWidth,
          0,
        ),
        color(255, 255, 255),
        area(),
        "note",
        {
          lanePosition: nextNote.lanePosition,
          spawnTime: nextNote.spawnTime,
        },
      ]);

      upcomingNotes.shift();
      laneNotes[nextNote.lanePosition].push(note);
    }
  };

  buildStage();
  init();

  // Initialize audio
  game.stage.audio.setAttribute(
    "src",
    `${songPath}/${mapData["[General]"].AudioFilename}`,
  );
  game.stage.audio.load();
  await game.stage.audio.play();

  // Update loop
  game.stage.renderLoop = loop(game.stage.updateRate, update);
  game.stage.active = true;

  // Initialize keypress event connections
  const laneOnKeyPress = (laneNumber) => {
    const closestNote = laneNotes[laneNumber][0];
    if (!closestNote) return;

    const timingDiff = Math.abs(closestNote.pos.y - hitLinePosition);
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

    game.stage.keys[key] = keyConnection;
  });
};

export const loadSongsList = async () => {
  if (!songsData) {
    songsData = await getSongsData();
  }

  listContainer.style.display = "flex";
  listContainer.innerHTML = "";

  songsData.forEach((songData) => {
    const mapId = `${songData.name}-map`;
    const titleId = `${songData.name}-title`;

    const songElement = document.createElement("div");
    songElement.className = "songContent";
    songElement.innerHTML = `
      <button class="songTitle mainButton">
        <h2 id="${titleId}">...</h2>
      </button>
      <div class="mapContainer" id="${mapId}"></div>
    `;
    listContainer.appendChild(songElement);

    const mapContainer = document.getElementById(mapId);
    const titleElement = document.getElementById(titleId);
    songData.maps.forEach((mapData) => {
      const { Version, Title, Artist } = mapData["[Metadata]"];

      titleElement.innerHTML = `${Title} <br> Song by: ${Artist}`;

      const buttonElement = document.createElement("button");
      buttonElement.className = "mainButton mapButton";
      buttonElement.innerHTML = `<h2>${Version}</h2>`;

      buttonElement.addEventListener("click", async () => {
        listContainer.style.display = "none";

        await loadSong(mapData, songData.path);

        mainCanvas.focus();
      });

      mapContainer.appendChild(buttonElement);
    });
  });
};
