import { getDir } from "./util.js";
export const SONGS_PATH = "assets/songs/";

export async function decodeOsuFormat(text) {
  let data = {};
  let currentSection;

  const splitText = text.split("\n");

  splitText.forEach((linetext) => {
    const isSection = linetext.startsWith("[");

    if (isSection) {
      currentSection = linetext;

      console.log("> " + currentSection);

      data[linetext] = {};

      return;
    }

    if (currentSection == "[General]") {
      console.log("]> ", currentSection);
    }

    // switch (currentSection) {
    //   case "[General]":
    //     const split = linetext.split(":");

    //     data[linetext][split[0]] = split[1];

    //     console.log("HIIIIIIIIIIIIIIIIIi");

    //     break;

    //   default:
    //     break;
    // }
  });

  console.log("-----------");

  return data;
}

export async function getSongsContents() {
  console.log("Init song data...");
  try {
    let songs = (await getDir(SONGS_PATH))
      .map((song) => song.substring(0, song.length - 1))
      .map(async (song) => {
        const path = SONGS_PATH + song;

        const filesData = (await getDir(path))
          .filter((file) => file.endsWith(".osu"))
          .map(async (file) => {
            const osuPath = path + "/" + file;
            let osuData = await fetch(osuPath).then((res) => res.text());
            osuData = await decodeOsuFormat(osuData);

            return [];
          });

        return song;
      });
  } catch (err) {
    console.error(`getSongs error! | ${err}`);
    return [];
  }
}
