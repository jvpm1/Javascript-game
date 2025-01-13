import { getDir } from "./util.js";

export let songsData;
export const SONGS_PATH = "assets/songs/";

export let game = {
  stage: {
    active: false,

    speed: 17,
    updateRate: 0.03,
    laneWidth: 100,
    laneGap: 50,

    // Connections
    keys: {},
    audio: new Audio(),
    renderLoop: null,
  },
};

const innerWidth = window.innerWidth;
const innerHeight = window.innerHeight;

export const notfi = (
  _text,
  _color = color(255, 255, 255),
  _pos = pos(innerWidth / 2, innerHeight / 2)
) => add([text(_text), _pos, _color, lifespan(0.5), move(UP, 100), "notfi"]);

export async function cancelStage() {
  const isActive = game.stage.active;
  if (isActive) {
    await game.stage.audio.pause();
    game.stage.audio.currentTime = 0;

    game.stage.renderLoop.cancel();

    for (const keyConnection of Object.entries(game.stage.keys)) {
      console.log(keyConnection);
      keyConnection[1].cancel();
    }

    destroyAll("hitLine");
    destroyAll("note");
    destroyAll("lane");
    destroyAll("notfi");

    game.stage.active = false;
  }

  return isActive;
}

export async function decodeOsuFormat(text) {
  let mapData = {};
  let currentSection;

  const splitText = text.split(/[\r\n]+/); // https://stackoverflow.com/questions/55409195/reading-ini-file-using-javascript

  splitText.forEach((lineText) => {
    const isSection = lineText[0] === "[";

    if (isSection) {
      currentSection = lineText;

      mapData[currentSection] =
        currentSection == "[TimingPoints]" || "[HitObjects]" || "[Events]"
          ? []
          : {};

      return;
    }

    switch (currentSection) {
      case "[General]":
      case "[Editor]": {
        // After benchmarking and testing, indexOf + substring is faster compared to split()
        const separatorIndex = lineText.indexOf(": ");
        const index = lineText.substring(0, separatorIndex);
        const value = lineText.substring(separatorIndex + 2); // +2 Skips ": "

        mapData[currentSection][index] = value;
        break;
      }

      case "[Events]": {
        mapData[currentSection].push(lineText);
        break;
      }

      case "[HitObjects]":
      case "[TimingPoints]": {
        const splitObjects = lineText.split(",");
        mapData[currentSection].push(splitObjects);
        break;
      }

      default: {
        if (!currentSection) {
          break;
        }
        const colonIndex = lineText.indexOf(":");
        const index = lineText.substring(0, colonIndex);
        const value = lineText.substring(colonIndex + 1);

        mapData[currentSection][index] = value;
        break;
      }
    }
  });

  return mapData;
}

export async function getSongsData() {
  console.log("Caching song data...");

  try {
    let songNames = await getDir(SONGS_PATH);

    const songsData = await Promise.all(
      songNames.map(async (songName) => {
        const cleanedSongName = songName.endsWith("/")
          ? songName.slice(0, -1)
          : songName;
        const songFolderDir = SONGS_PATH + cleanedSongName;

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

    console.log(songsData);

    console.log("Done caching song data!");

    return songsData;
  } catch (err) {
    console.error(`getSongs error! | ${err}`);

    return null;
  }
}

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

const HITLINE = innerHeight - 200;

export async function loadSong(mapData, songPath) {
  // ...
  let currentTime = 0;

  // ...
  let activeNotes = [];
  let upcomingNotes = [];

  // Create lanes
  const lanesDefinedWidth = game.stage.laneWidth * 4 + game.stage.laneGap * 3;
  const laneStartPosition = innerWidth / 2 - lanesDefinedWidth / 2;

  // Functions
  function buildStage() {
    // Creates the 4 lanes seen what starting a song
    // With the lanes it'll also spawn the HitLine
    // All of this is called the stage

    console.debug("[*] Building stage...");

    for (let i = 0; i < 4; i++) {
      add([
        rect(game.stage.laneWidth, innerHeight),
        pos(
          laneStartPosition + i * (game.stage.laneWidth + game.stage.laneGap),
          0
        ),
        color(30, 30, 30),
        outline(),
        "lane",
      ]);
    }

    add([
      rect(lanesDefinedWidth, 2),
      pos(laneStartPosition, HITLINE),
      color(255, 255, 255),
      "hitLine",
    ]);

    console.debug("[!] Done building stage!");
  }

  function init() {
    // This preloads / caches calculations like converting values to seconds or miliseconds
    // Doing this makes it way faster to spawn notes or check a note's position

    console.debug("[*] Initializing upcoming notes");

    // Init upcomingNotes
    for (const noteData of mapData["[HitObjects]"]) {
      const lanePosition = Number(noteData[0]);
      const spawnTime = Number(noteData[2]);

      if (lanePosition == "") {
        continue;
      }

      upcomingNotes.push({
        lanePosition: lanePosition,
        spawnTime: spawnTime,
        spawnTimeHitline: spawnTime - HITLINE,
      });
    }

    console.debug(upcomingNotes);

    console.debug("[!] Done initializing notes!");
  }

  const halfUpdateRate = game.stage.updateRate / 2;
  async function update() {
    currentTime = game.stage.audio.currentTime * 1000;

    // Move all active notes
    const moveOffset = game.stage.speed * 100;
    for (const note of get("note")) {
      note.move(0, moveOffset);

      if (note.pos.y > innerHeight - 50) {
        notfi("Miss!", color(255, 100, 100));

        destroy(note);
      }
    }

    // Note spawning
    const nextNote = upcomingNotes[0];
    const spawnTimeHitline = nextNote.spawnTimeHitline;

    if (currentTime > spawnTimeHitline - moveOffset * halfUpdateRate) {
      const lanePosition = nextNote.lanePosition;

      const note = add([
        rect(game.stage.laneWidth, 30),
        pos(
          laneStartPosition +
            LANE_POSITIONS[lanePosition] *
              (game.stage.laneWidth + game.stage.laneGap),
          0
        ),
        color(255, 255, 255),
        area(),
        "note",
        {
          lanePosition: lanePosition,
          spawnTime: nextNote.spawnTime,
        },
      ]);

      activeNotes.push(note);
      upcomingNotes.shift();
    }
  }

  buildStage();
  init();

  // Load audio
  game.stage.audio.setAttribute(
    "src",
    songPath + "/" + mapData["[General]"].AudioFilename
  );
  await game.stage.audio.load();
  await game.stage.audio.play();

  // Update loop
  game.stage.renderLoop = loop(game.stage.updateRate, await update);

  // idk
  game.stage.active = true;

  // Set up key handlers for each lane
  for (const [key, laneIndex] of Object.entries(KEY_MAP)) {
    const laneNumber = Object.entries(LANE_POSITIONS).find(
      ([_, idx]) => idx === laneIndex
    )[0];

    const keyConnection = onKeyPress(key, () => {
      const laneNotes = get("note")
        .filter((note) => note.lanePosition === Number(laneNumber))
        .sort(
          (a, b) => Math.abs(a.pos.y - HITLINE) - Math.abs(b.pos.y - HITLINE)
        );

      if (laneNotes.length > 0) {
        const closestNote = laneNotes[0];
        const timingDiff = Math.abs(closestNote.pos.y - HITLINE);

        if (timingDiff <= 10) {
          notfi("Perfect!", color(255, 255, 100));

          destroy(closestNote);
        } else if (timingDiff <= 150) {
          notfi("Great!", color(100, 255, 100));

          destroy(closestNote);
        } else if (timingDiff <= 250) {
          notfi("Miss!", color(255, 100, 100));

          destroy(closestNote);
        }
      }
    });

    game.stage.keys[key] = keyConnection;
  }
}
export async function renderSongsList() {
  // Cache song data to songsData
  if (!songsData) {
    songsData = await getSongsData();
  }

  listContainer.style.display = "block";
  listContainer.innerHTML = "";

  for (const songData of songsData) {
    const mapId = `${songData.name}-map`;

    // Create songContent div with the title
    const songElement = document.createElement("div");
    songElement.className = "songContent";
    songElement.innerHTML += `
    <button class="songTitle mainButton">
      <h2>${songData.name}</h2>
    </button>

    <div class="mapContainer" id="${mapId}"></div>
    `;

    listContainer.appendChild(songElement);

    // This creates the buttons in the grid for different maps
    const mapContainer = document.getElementById(mapId);
    for (const mapData of songData.maps) {
      const metaData = mapData["[Metadata]"];
      const difficulty = mapData["[Difficulty]"];

      const buttonElement = document.createElement("button");
      buttonElement.className = "mainButton mapButton";
      buttonElement.innerHTML = `<h2>${
        `[${difficulty.OverallDifficulty}] ` + metaData.Version
      }</h2>`;
      mapContainer.appendChild(buttonElement);

      buttonElement.addEventListener("click", () => {
        listContainer.style.display = "none";
        loadSong(mapData, songData.path);
      });
    }
  }
}
