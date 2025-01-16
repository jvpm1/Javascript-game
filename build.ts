// Songs directory builder | Dino 2.0
// This script generates a json file for the client to read and navigate to
// Default file locaiton: ./src/songs.json

import * as fs from "node:fs";

type SongFile = {
  name: string;
  files: Object;
};

const defaultJsonLocation = "./src/songsDir.json";

const generateJsonSongsFile = async (
  songsDir: string,
  fileLocation: string = defaultJsonLocation,
) => {
  const songFiles: Object = fs.readdirSync(songsDir).map((fileName: string) => {
    const songFile: SongFile = {
      name: fileName,
      files: fs.readdirSync(`${songsDir}${fileName}/`),
    };

    return songFile;
  });

  fs.writeFileSync(fileLocation, JSON.stringify(songFiles, null, 2));
};

generateJsonSongsFile("./src/assets/songs/");
