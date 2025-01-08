import { getDir } from "./util.js";

export let songsData;

export const SONGS_PATH = "assets/songs/";

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
  console.log("Init song data...");

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

    return songsData;
  } catch (err) {
    console.error(`getSongs error! | ${err}`);

    return null;
  }
}

export async function renderSongsList() {
  // Cache song data to songsData
  if (!songsData) {
    songsData = await getSongsData();
  }

  // Clear listContainer
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
        console.log(mapData);
      });
    }
  }
}
