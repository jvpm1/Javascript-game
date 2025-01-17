export const decodeOsuFormat = async (text) => {
  const mapData = {};
  let currentSection;

  const lines = text.split(/[\r\n]+/);

  lines.forEach((line) => {
    const isSection = line[0] === "[";

    if (isSection) {
      currentSection = line;
      mapData[currentSection] = [
        "[TimingPoints]",
        "[HitObjects]",
        "[Events]",
      ].includes(currentSection)
        ? []
        : {};
      return;
    }

    if (!currentSection) {
      return;
    }

    switch (currentSection) {
      case "[General]":
      case "[Editor]": {
        const separatorIndex = line.indexOf(": ");
        const key = line.substring(0, separatorIndex);
        const value = line.substring(separatorIndex + 2);
        mapData[currentSection][key] = value;
        break;
      }
      case "[Events]": {
        if (line.startsWith("//")) break;

        const splitObjects = line.split(",");
        mapData[currentSection].push(splitObjects);
        break;
      }
      case "[HitObjects]":
      case "[TimingPoints]": {
        const splitObjects = line.split(",");
        mapData[currentSection].push(splitObjects);
        break;
      }
      default: {
        const colonIndex = line.indexOf(":");
        const key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);
        mapData[currentSection][key] = value;
      }
    }
  });

  return mapData;
};
