// Imports
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
const mainSongsContainer = document.getElementById("mainSongsContainer");
const songsContainer = document.getElementById("songsContainer");

const mapsContainer = document.getElementById("mapsContainer");
const imgBackground = document.getElementById("imgBackground");

const detailTitle = document.getElementById("detailTitle");
const detailImg = document.getElementById("detailImg");

// Vars
let songsData;
let songsDir;

let songsFolderLocation = "/assets/songs/";

let game = {
  stage: {
    active: false,

    speed: 7,
    updateRate: 0.03,

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
const initSongsDir = async () => {
  const response = await fetch("/songsDir.json/").then((res) => res.text());
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

export const getSongsData = async (overwriteSongDir) => {
  console.debug("Caching song data...");

  if (!songsDir) {
    await initSongsDir();
  }

  const songsData = Promise.all(
    (overwriteSongDir || songsDir).map(async (tbl) => {
      const pathToFolder = `${songsFolderLocation}${tbl.name}`;
      const maps = await Promise.all(
        tbl.files
          .filter((fileName) => fileName.endsWith(".osu"))
          .map(async (fileName) => {
            const pathToFile = `${songsFolderLocation}${tbl.name}/${fileName}`;
            const fileContent = await fetch(pathToFile).then((res) =>
              res.text()
            );
            const osuFormat = await decodeOsuFormat(fileContent);

            return osuFormat;
          })
      );

      return {
        name: tbl.name,
        path: pathToFolder,
        maps: maps,
      };
    })
  );

  // try {
  //   const songNames = await getDir(songsFolderDir);

  //   const fetchedSongsData = await Promise.all(
  //     songNames.map(async (songName) => {
  //       const cleanedSongName = songName.endsWith("/")
  //         ? songName.slice(0, -1)
  //         : songName;
  //       const songFolderDir = `${songsFolderDir}${cleanedSongName}`;

  //       const songChildren = await getDir(songFolderDir);
  //       const osuFiles = songChildren.filter((file) => file.endsWith(".osu"));

  //       const mapsData = await Promise.all(
  //         osuFiles.map(async (file) => {
  //           const osuPath = `${songFolderDir}/${file}`;
  //           const response = await fetch(osuPath);
  //           const osuText = await response.text();
  //           return decodeOsuFormat(osuText);
  //         }),
  //       );

  //       return {
  //         name: cleanedSongName,
  //         path: songFolderDir,
  //         maps: mapsData,
  //       };
  //     }),
  //   );

  //   console.debug("Done caching song data!");

  //   return fetchedSongsData;
  // } catch (error) {
  //   console.error(`getSongs error: ${error}`);

  //   return null;
  // }
  return songsData;
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
      laneNotes[nextNote.lanePosition].push(note);
    }
  };

  buildStage();
  init();

  // Initialize audio
  game.stage.audio.setAttribute(
    "src",
    `${songPath}${mapData["[General]"].AudioFilename}`
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
      ([_, idx]) => idx === laneIndex
    )[0];

    const keyConnection = onKeyPress(key, () => laneOnKeyPress(laneNumber));

    game.stage.keys[key] = keyConnection;
  });
};

export const loadSongDetail = async (songData) => {
  const firstMapData = songData.maps[0];
  const { Title } = firstMapData["[Metadata]"];
  const img = firstMapData["[Events]"][0][2].replaceAll('"', "");
  const imgPath = `./assets/songs/${songData.name}/${img}`;

  // Assign images
  imgBackground.src = imgPath;
  detailImg.src = imgPath;
  detailTitle.innerHTML = Title;

  // Update map elements
  mapsContainer.innerHTML = "";
  songData.maps.forEach((mapData) => {
    const detailButton = document.createElement("button");
    detailButton.className =
      "w-full h-20 bg-zinc-950 rounded-lg font-bold text-2xl text-left p-5";
    detailButton.innerHTML = mapData["[Metadata]"].Version;

    mapsContainer.appendChild(detailButton);
    detailButton.addEventListener("click", async () => {
      mainSongsContainer.style.display = "none";
      await loadSong(mapData, `assets/songs/${songData.name}/`);
    });
  });
};

export const loadSongsList = async () => {
  if (!songsData) {
    songsData = await getSongsData();
  }

  const songsContainer = document.getElementById("songsContainer");
  let hasLoadedDetailPage = false;

  mainSongsContainer.style.display = "grid";
  songsContainer.innerHTML = "";

  songsData.forEach((songData) => {
    const mapData = songData.maps[0];
    if (!mapData) {
      return;
    }

    if (!hasLoadedDetailPage) {
      loadSongDetail(songData);
      hasLoadedDetailPage = true;
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
