import { getDir } from "./util.js";
export const SONGS_PATH = "assets/songs/";

export async function decodeOsuFormat(text) {
  let data = {};
  let currentSection;

  const splitText = text.split(/[\r\n]+/); // https://stackoverflow.com/questions/55409195/reading-ini-file-using-javascript

  splitText.forEach((lineText) => {
    const isSection = lineText[0] === "[";

    if (isSection) {
      currentSection = lineText;

      data[currentSection] =
        currentSection == "[TimingPoints]" || "[HitObjects]" || "[Events]"
          ? []
          : {};

      return;
    }

    switch (currentSection) {
      case "[General]":
      case "[Editor]": {
        // After benchmarking and testing, indexOf + substring is faster compare to split()
        const separatorIndex = lineText.indexOf(": ");
        const index = lineText.substring(0, separatorIndex);
        const value = lineText.substring(separatorIndex + 2); // +2 Skips ": "

        data[currentSection][index] = value;
        break;
      }

      case "[Events]": {
        data[currentSection].push(lineText);
        break;
      }

      case "[HitObjects]":
      case "[TimingPoints]": {
        const splitObjects = lineText.split(",");
        data[currentSection].push(splitObjects);
        break;
      }

      default: {
        if (!currentSection) {
          break;
        }
        const colonIndex = lineText.indexOf(":");
        const index = lineText.substring(0, colonIndex);
        const value = lineText.substring(colonIndex + 1);

        data[currentSection][index] = value;
        break;
      }
    }
  });

  return data;
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

    return [];
  }
}
