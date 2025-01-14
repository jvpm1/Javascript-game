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

// Vars
export let songsData;

export const game = {
  stage: {
    active: false,
    speed: 6,
    updateRate: 0.025,
    laneWidth: 100,
    laneGap: 50,
    maxHitDistance: 230,
    hitLineOffset: 200,
    keys: {},
    audio: new Audio(),
    renderLoop: null,
  },
};

// Functions
export const notify = (
  _text,
  _textColor = color(255, 255, 255),
  _position = pos(INNER_WIDTH / 2, INNER_HEIGHT / 2)
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

  if (isActive) {
    await game.stage.audio.pause();
    game.stage.audio.currentTime = 0;
    game.stage.renderLoop.cancel();

    Object.values(game.stage.keys).forEach((keyConnection) => {
      keyConnection.cancel();
    });

    // Clean up game objects
    ["hitLine", "note", "lane", "notification"].forEach((tag) => {
      destroyAll(tag);
    });

    game.stage.active = false;
  }

  return isActive;
};

export const getSongsData = async () => {
  console.log("Caching song data...");

  try {
    const songNames = await getDir(SONGS_PATH);

    const fetchedSongsData = await Promise.all(
      songNames.map(async (songName) => {
        const cleanedSongName = songName.endsWith("/")
          ? songName.slice(0, -1)
          : songName;
        const songFolderDir = `${SONGS_PATH}${cleanedSongName}`;

        const songChildren = await getDir(songFolderDir);
        const osuFiles = songChildren.filter((file) => file.endsWith(".osu"));

        const mapsData = await Promise.all(
          osuFiles.map(async (file) => {
            const osuPath = `${songFolderDir}/${file}`;
            const response = await fetch(osuPath);
            const osuText = await response.text();
            return decodeOsuFormat(osuText);
          })
        );

        return {
          name: cleanedSongName,
          path: songFolderDir,
          maps: mapsData,
        };
      })
    );

    console.log("Done caching song data!");
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

  const buildStage = () => {
    console.debug("[*] Building stage...");

    // Create lanes
    Array.from({ length: 4 }).forEach((_, i) => {
      add([
        rect(game.stage.laneWidth, INNER_HEIGHT),
        pos(laneStartPosition + i * laneGapAndWidth, 0),
        color(30, 30, 30),
        outline(),
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

  const initNotes = () => {
    console.debug("[*] Initializing upcoming notes");

    upcomingNotes = mapData["[HitObjects]"]
      .filter((noteData) => noteData[0] !== "")
      .map((noteData) => ({
        lanePosition: Number(noteData[0]),
        spawnTime: Number(noteData[2]),
      }));

    console.debug("[!] Done initializing notes!");
  };

  const handleNoteHit = (timingDiff, closestNote) => {
    if (timingDiff <= maxHitDistance * 0.4) {
      notify("Perfect!", color(255, 100, 255));
    } else if (timingDiff <= maxHitDistance * 0.7) {
      notify("Great!", color(255, 255, 100));
    } else if (timingDiff <= maxHitDistance) {
      notify("Bad!", color(100, 255, 100));
    }
    destroy(closestNote);
  };

  const update = async () => {
    currentTime = game.stage.audio.currentTime * 1000;

    // Update existing notes
    get("note").forEach((note) => {
      note.move(0, noteUpdateOffset);
      if (note.pos.y > missPositionThreshold) {
        notify("Miss!", color(255, 100, 100));
        destroy(note);
      }
    });

    // Handle next note
    const nextNote = upcomingNotes[0];
    if (!nextNote) {
      await cancelStage();
      await renderSongsList();
      return;
    }

    if (currentTime > nextNote.spawnTime - timeToReachHitLine) {
      add([
        rect(game.stage.laneWidth, 30),
        pos(
          laneStartPosition +
            LANE_POSITIONS[nextNote.lanePosition] * laneGapAndWidth,
          0
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
    }
  };

  buildStage();
  initNotes();

  // Initialize audio
  game.stage.audio.setAttribute(
    "src",
    `${songPath}/${mapData["[General]"].AudioFilename}`
  );
  await game.stage.audio.load();
  await game.stage.audio.play();

  game.stage.renderLoop = loop(game.stage.updateRate, await update);
  game.stage.active = true;

  // Set up key handlers
  Object.entries(KEY_MAP).forEach(([key, laneIndex]) => {
    const laneNumber = Object.entries(LANE_POSITIONS).find(
      ([_, idx]) => idx === laneIndex
    )[0];

    const keyConnection = onKeyPress(key, () => {
      const laneNotes = get("note")
        .filter((note) => note.lanePosition === Number(laneNumber))
        .sort(
          (a, b) =>
            Math.abs(a.pos.y - hitLinePosition) -
            Math.abs(b.pos.y - hitLinePosition)
        );

      if (laneNotes.length > 0) {
        const closestNote = laneNotes[0];
        const timingDiff = Math.abs(closestNote.pos.y - hitLinePosition);
        if (timingDiff <= maxHitDistance) {
          handleNoteHit(timingDiff, closestNote);
        }
      }
    });

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
    const songElement = document.createElement("div");
    songElement.className = "songContent";
    songElement.innerHTML = `
      <button class="songTitle mainButton">
        <h2>${songData.name}</h2>
      </button>
      <div class="mapContainer" id="${mapId}"></div>
    `;

    listContainer.appendChild(songElement);

    const mapContainer = document.getElementById(mapId);
    songData.maps.forEach((mapData) => {
      const { Version } = mapData["[Metadata]"];
      const { OverallDifficulty } = mapData["[Difficulty]"];

      const buttonElement = document.createElement("button");
      buttonElement.className = "mainButton mapButton";
      buttonElement.innerHTML = `<h2>[${OverallDifficulty}] ${Version}</h2>`;

      buttonElement.addEventListener("click", () => {
        listContainer.style.display = "none";
        loadSong(mapData, songData.path);
      });

      mapContainer.appendChild(buttonElement);
    });
  });
};
