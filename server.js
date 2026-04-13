const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

function escapeText(text) {
  return text
    .replace(/\\/g, "\\\\")   // escape backslash FIRST
    .replace(/'/g, "\\\\'")   // apostrophe FIX (VERY IMPORTANT)
    .replace(/:/g, "\\:")     // colon
    .replace(/"/g, '\\"')     // double quotes
    .replace(/,/g, "\\,")     // commas
    .replace(/\n/g, " ")
    .replace(/\r/g, "");
}

// ✅ 👉 PASTE HERE
function splitText(text, maxWords = 6) {
  const words = text.split(" ");
  const lines = [];

  for (let i = 0; i < words.length; i += maxWords) {
    lines.push(words.slice(i, i + maxWords).join(" "));
  }

  return lines;
}

function buildDrawtext(lines, duration) {
  const minTimePerLine = 2;
  const totalLines = lines.length;

  const durationPerLine = Math.max(duration / totalLines, minTimePerLine);

  return lines.map((line, i) => {
    const start = i * durationPerLine;
    const end = start + durationPerLine;

    const safe = escapeText(line); // ✅ THIS WAS MISSING

    return `drawtext=text=${safe}:fontcolor=white:fontsize=48:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-120:enable='between(t,${start},${end})'`;
  }).join(",");
}

const app = express();
app.use(express.json({ limit: "50mb" })); // 🔥 important for base64 audio

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Download helper (WAITS until finished)
async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
  url,
  method: "GET",
  responseType: "stream",
  maxRedirects: 5,
  headers: {
    "User-Agent": "Mozilla/5.0"
  }
});

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

//////////////////////////////////////////////////////////////
// 🔥 OLD ENDPOINT (KEEP THIS — DO NOT TOUCH)
//////////////////////////////////////////////////////////////

app.post("/render", async (req, res) => {
  try {
    const { images, audios } = req.body;

    if (!images || !audios || images.length !== audios.length) {
      return res.status(400).json({
        error: "Images and audios arrays must exist and match in length.",
      });
    }

    const workDir = path.join(__dirname, "work");

    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const segments = [];

    for (let i = 0; i < images.length; i++) {
      const imgPath = path.join(workDir, `img${i}.png`);
      const audPath = path.join(workDir, `aud${i}.mp3`);
      const segmentPath = path.join(workDir, `segment_${i}.mp4`);

      await downloadFile(images[i], imgPath);
      await downloadFile(audios[i], audPath);

      await new Promise((resolve, reject) => {
        exec(
          `ffmpeg -y -loop 1 -i "${imgPath}" -i "${audPath}" -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "${segmentPath}"`,
          (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      segments.push(segmentPath);
    }

    const concatFile = path.join(workDir, "segments.txt");

    const concatContent = segments
      .map((segment) => `file '${segment}'`)
      .join("\n");

    fs.writeFileSync(concatFile, concatContent);

    const finalVideo = path.join(workDir, "final_video.mp4");

    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalVideo}"`,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.sendFile(finalVideo);
  } catch (error) {
    console.error("Render error:", error);
    res.status(500).json({ error: "Video rendering failed." });
  }
});

//////////////////////////////////////////////////////////////
// 🚀 NEW ENDPOINT (VIDEO + AUDIO PER SCENE)
//////////////////////////////////////////////////////////////

app.post("/render-scene", async (req, res) => {
  try {
    const { video_url, audio_url, duration, narration } = req.body;

if (!video_url || !audio_url || !duration || !narration) {
  return res.status(400).json({
    error: "video_url, audio_url, duration and narration are required",
  });
}

    const workDir = path.join(__dirname, "work_scene");

    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const videoPath = path.join(workDir, "video.mp4");
    const audioPath = path.join(workDir, "audio.mp3");
    const outputPath = path.join(workDir, "output.mp4");

    console.log("Downloading video...");
    await downloadFile(video_url, videoPath);

    console.log("Saving audio...");
    console.log("Downloading audio...");
await downloadFile(audio_url, audioPath);

    console.log("Running FFmpeg...");
   
// ✅ FIX STARTS HERE
let subtitleFilter = "";

if (narration && narration.trim() !== "") {
const safeNarration = escapeText(narration || "");
const lines = splitText(safeNarration, 6);
  subtitleFilter = buildDrawtext(lines, duration);
} else {
  console.log("⚠️ Empty narration, skipping subtitles");
}
    // ✅ GET REAL VIDEO DURATION (CORRECT PLACE)
const getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      (err, stdout) => {
        if (err) reject(err);
        else resolve(parseFloat(stdout));
      }
    );
  });
};

const originalDuration = await getVideoDuration(videoPath);
const stretchFactor = duration / originalDuration;

const filter = subtitleFilter
  ? `[0:v]setpts=${stretchFactor}*PTS,${subtitleFilter}[v]`
  : `[0:v]setpts=${stretchFactor}*PTS[v]`;
    
await new Promise((resolve, reject) => {
  exec(
    `ffmpeg -y -i "${videoPath}" -i "${audioPath}" \
-filter_complex "${filter}" \
-map "[v]" -map 1:a \
-t ${duration} \
-c:v libx264 -pix_fmt yuv420p -c:a aac \
"${outputPath}"`,
    (err, stdout, stderr) => {
      console.error("🔥 FFMPEG STDERR:", stderr);

      if (err) {
        console.error("FFmpeg error:", stderr);
        return reject(err);
      }

      resolve();
    }
  );
});

    console.log("Scene rendered successfully!");

    res.download(outputPath);
  } catch (error) {
    console.error("🔥 FULL ERROR:", error);
    res.status(500).json({ error: "Scene rendering failed." });
  }
});

//////////////////////////////////////////////////////////////
// 🎬 CONCAT ALL SCENE VIDEOS INTO ONE FINAL VIDEO
//////////////////////////////////////////////////////////////

app.post("/concat-scenes", async (req, res) => {
  try {
    const { videos } = req.body;

    if (!videos || videos.length === 0) {
      return res.status(400).json({ error: "videos array required" });
    }

    const workDir = path.join(__dirname, "work_concat");

    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const localVideos = [];

    console.log("Downloading scene videos...");

    // 🔥 Download each rendered scene
    for (let i = 0; i < videos.length; i++) {
      const videoPath = path.join(workDir, `scene_${i}.mp4`);
      await downloadFile(videos[i], videoPath);
      localVideos.push(videoPath);
    }

    // 🔥 Create concat list
    const concatFile = path.join(workDir, "list.txt");
    const content = localVideos.map(v => `file '${v}'`).join("\n");
    fs.writeFileSync(concatFile, content);

    const output = path.join(workDir, "final_video.mp4");

    console.log("Merging scenes...");

    // 🔥 Merge all videos
    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${output}"`,
        (err, stdout, stderr) => {
          if (err) {
            console.error("Concat error:", stderr);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log("Final video created!");

    res.sendFile(output);

  } catch (error) {
    console.error("Concat endpoint error:", error);
    res.status(500).json({ error: "Concatenation failed." });
  }
});

//////////////////////////////////////////////////////////////
// 🎬 CONCAT MULTIPLE SCENES INTO FINAL VIDEO
//////////////////////////////////////////////////////////////

app.post("/concat-videos", async (req, res) => {
  try {
    const { videos, subtitles } = req.body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return res.status(400).json({
        error: "videos array is required",
      });
    }

    const workDir = path.join(__dirname, "work_concat");

    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const localVideos = [];

    // 🔽 Download all videos
    for (let i = 0; i < videos.length; i++) {
      const videoPath = path.join(workDir, `scene_${i}.mp4`);
      console.log(`Downloading video ${i}...`);

      await downloadFile(videos[i], videoPath);
      localVideos.push(videoPath);
    }

    // 🔽 Create concat file
    const concatFile = path.join(workDir, "concat.txt");

    const concatContent = localVideos
      .map((video) => `file '${video}'`)
      .join("\n");

    fs.writeFileSync(concatFile, concatContent);

    const outputPath = path.join(workDir, "final_video.mp4");

    console.log("Running FFmpeg concat...");

   let ffmpegCmd;

if (subtitles) {
  const subtitlePath = path.join(workDir, "subtitles.srt");

  fs.writeFileSync(subtitlePath, subtitles.replace(/\\n/g, "\n"));

  console.log("Subtitles file created!");

  ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -vf subtitles="${subtitlePath}" -c:v libx264 -c:a aac "${outputPath}"`;
} else {
  ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}"`;
}

await new Promise((resolve, reject) => {
  exec(ffmpegCmd, (err, stdout, stderr) => {
    if (err) {
      console.error("FFmpeg error:", stderr);
      reject(err);
    } else {
      resolve();
    }
  });
});

    console.log("Final video created!");

    res.sendFile(outputPath);
  } catch (error) {
    console.error("Concat error:", error);
    res.status(500).json({ error: "Video concatenation failed." });
  }
});

//////////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
