import kaboom from "kaboom";

const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

let _ = {
  player: {
    size: 30,
  },

  shield: {
    width: 70,
    offset: 20,
  },

  ball: {
    size: 10,
  },

  hold: {
    width: 20,
    height: 20,
  },
};

let gameData = {
  scrollSpeed: 700,
};

kaboom({
  background: [36, 36, 36],
  width: windowWidth,
  height: windowHeight,
  stretch: true,
  letterbox: true,
});

const maxDist = Math.max(width(), height()) / 2;
const centerX = width() / 2;
const centerY = height() / 2;

const getSpawnPosition = (deg) => {
  const rad = (deg * Math.PI) / 180;
  return vec2(
    centerX + Math.cos(rad) * maxDist,
    centerY + Math.sin(rad) * maxDist
  );
};

const dirToCenter = (pos) => {
  const angle = Math.atan2(centerY - pos.y, centerX - pos.x);
  return vec2(Math.cos(angle), Math.sin(angle));
};

const notfi = (
  _text,
  _color = color(255, 255, 255),
  _pos = pos(centerX, centerY)
) => add([text(_text), _pos, _color, lifespan(0.5), move(UP, 100)]);

scene("start", () => {
  add([
    text("Click anywhere", { size: 24 }),
    pos(centerX, centerY + 50),
    anchor("center"),
  ]);

  onClick(() => go("main"));
});

scene("main", () => {
  let gameTime = 0;
  let chartData = [];
  let nextNoteIndex = 0;
  let hasStarted = false;
  let songAudio = null;

  const player = add([
    circle(_.player.size),
    pos(centerX, centerY),
    anchor("center"),
    rotate(0),
    area(),
    "player",
  ]);

  const shield = add([
    rect(20, _.shield.width),
    pos(0, 0),
    anchor("center"),
    rotate(0),
    color(WHITE),
    area(),
    "shield",
  ]);

  const spawnBall = (angle) => {
    const spawnPos = getSpawnPosition(angle);
    const direction = dirToCenter(spawnPos);

    add([
      circle(_.ball.size),
      pos(spawnPos),
      color(RED),
      anchor("center"),
      area(),
      "ball",
      {
        dir: direction,
      },
      move(direction, gameData.scrollSpeed),
    ]);
  };

  const spawnHold = (startAngle, endAngle, duration) => {
    const spawnPos = getSpawnPosition(startAngle);
    const direction = dirToCenter(spawnPos);

    add([
      rect(_.hold.width, _.hold.height),
      pos(spawnPos),
      color(YELLOW),
      anchor("center"),
      area(),
      "hold",
      {
        startAngle,
        endAngle,
        duration,
        dir: direction,
      },
      move(direction, gameData.scrollSpeed),
    ]);
  };

  const loadChart = async (chartName) => {
    try {
      const chartResponse = await fetch(`/maps/${chartName}/chart.json`);
      chartData = await chartResponse.json();

      const audioResponse = await fetch(`/maps/${chartName}/song.ogg`);
      const audioBlob = await audioResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      songAudio = new Audio(audioUrl);

      // Add loading text
      const loadingText = add([
        text("Press SPACE to start", { size: 24 }),
        pos(centerX, centerY),
        anchor("center"),
      ]);

      songAudio
        .play()
        .then(() => {
          hasStarted = true;
          gameTime = 0;
          nextNoteIndex = 0;
          destroy(loadingText);
        })
        .catch((error) => {
          console.error("Failed to play audio:", error);
          notfi(
            "Failed to play audio! Press SPACE to try again",
            color(255, 100, 100)
          );
        });

      // Song end handler
      songAudio.addEventListener("ended", () => {
        hasStarted = false;
        URL.revokeObjectURL(audioUrl);
        go("start");
      });
    } catch (error) {
      console.error("Failed to load chart or audio:", error);
      notfi("Failed to load chart!", color(255, 100, 100));
    }
  };

  const onBallCollide = (ball, isMiss) => {
    notfi(
      isMiss ? "Miss" : "Nice!",
      isMiss ? color(255, 100, 100) : color(255, 255, 255),
      pos(ball.pos.x, ball.pos.y)
    );
    destroy(ball);
  };

  onCollide("ball", "shield", (ball) => {
    onBallCollide(ball, false);
  });

  onCollide("ball", "player", (ball) => {
    onBallCollide(ball, true);
  });

  onCollide("hold", "shield", (hold) => {
    notfi("Hold!", color(255, 255, 100), pos(hold.pos.x, hold.pos.y));
    destroy(hold);
  });

  onCollide("hold", "player", (hold) => {
    onBallCollide(hold, true);
  });

  // Chart playback system
  onUpdate(() => {
    if (!hasStarted) return;

    gameTime = songAudio.currentTime * 2;
    console.log(gameTime);

    // Spawn notes based on time
    while (
      nextNoteIndex < chartData.length &&
      chartData[nextNoteIndex].time <= gameTime
    ) {
      const note = chartData[nextNoteIndex];

      if (note.type === "block") {
        spawnBall(note.angle);
      } else if (note.type === "hold") {
        spawnHold(note.angle, note.angle2, note.duration);
      }

      nextNoteIndex++;
    }

    // Player & Shield handler
    const mouse = mousePos();
    const angle = Math.atan2(mouse.y - player.pos.y, mouse.x - player.pos.x);

    player.angle = rad2deg(angle) + 90;

    const shieldPos = vec2(
      player.pos.x + Math.cos(angle) * (_.player.size + _.shield.offset),
      player.pos.y + Math.sin(angle) * (_.player.size + _.shield.offset)
    );

    shield.pos = shieldPos;
    shield.angle = player.angle + 90;
  });

  // Pause/Resume functionality
  onKeyPress("escape", () => {
    if (songAudio) {
      if (songAudio.paused) {
        songAudio.play();
      } else {
        songAudio.pause();
      }
    }
  });

  // Clean up when scene ends
  onSceneLeave(() => {
    if (songAudio) {
      songAudio.pause();
      songAudio = null;
    }
  });

  // Load the chart
  loadChart("Spin Eternally");
});

// Start with the start screen
go("start");
