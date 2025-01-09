import { getDir } from "./util.js";

export let songsData;
export const SONGS_PATH = "assets/songs/";

export let game = {
  stage: {
    active: false,

    speed: 12,
    laneWidth: 100,
    laneGap: 50,

    // Connections
    keys: {},
    audio: new Audio(),
    renderLoop: null,
  },
};

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

    destroyAll("lane");
    destroyAll("arrow");

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

const HITLINE = window.innerHeight - 200;

export async function loadSong(mapData, songPath) {
  let currentTime = 0;

  const arrows = [];
  const upcomingNotes = [...mapData["[HitObjects]"]];

  // Create lanes
  const lanes = [];
  const totalWidth = game.stage.laneWidth * 4 + game.stage.laneGap * 3;
  const middleStartPosition = window.innerWidth / 2 - totalWidth / 2;

  for (let i = 0; i < 4; i++) {
    const lane = add([
      rect(game.stage.laneWidth, window.innerHeight),
      pos(
        middleStartPosition + i * (game.stage.laneWidth + game.stage.laneGap),
        0
      ),
      color(30, 30, 30),
      outline(),
      "lane",
    ]);

    lanes.push(lane);
  }

  const lane = add([
    rect(totalWidth, 2),
    pos(middleStartPosition, HITLINE),
    color(255, 255, 255),
    "lane",
  ]);

  function updateArrowSystem() {
    currentTime = game.stage.audio.currentTime * 1000;

    // Arrow moving handler
    for (const arrow of arrows) {
      arrow.move(0, game.stage.speed * dt() * 10000);

      if (arrow.pos.y > window.innerHeight) {
        destroy(arrow);
        arrows.splice(arrows.indexOf(arrow), 1);
        console.log("Fial");
      }
    }

    // Key spawning handler
    const nextNote = upcomingNotes[0];
    const spawnTime = Number(nextNote[2]);

    if (currentTime > spawnTime - HITLINE / (game.stage.speed * dt() * 10000)) {
      const laneNumber = Number(nextNote[0]);

      const arrow = add([
        rect(game.stage.laneWidth, 30),
        pos(
          middleStartPosition +
            LANE_POSITIONS[laneNumber] *
              (game.stage.laneWidth + game.stage.laneGap),
          0
        ),
        color(255, 255, 255),
        area(),
        "arrow",
        {
          lane: laneNumber,
        },
      ]);

      arrows.push(arrow);
      upcomingNotes.shift();
    }
  }

  // Create keyPress connection event
  for (const [key, laneIndex] of Object.entries(KEY_MAP)) {
    const keyConnection = onKeyPress(key, () => {
      console.log(key);
    });

    game.stage.keys[key] = keyConnection;
  }

  // Load audio
  game.stage.audio.setAttribute(
    "src",
    songPath + "/" + mapData["[General]"].AudioFilename
  );
  await game.stage.audio.load();
  await game.stage.audio.play();

  // Start the game loop
  game.stage.renderLoop = loop(0.02, () => {
    updateArrowSystem();
  });

  game.stage.active = true;
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
