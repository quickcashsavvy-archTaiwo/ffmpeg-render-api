const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

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
    const { video_url, audio_url, duration } = req.body;

if (!video_url || !audio_url || !duration) {
      return res.status(400).json({
        error: "video_url, audio_url and duration are required",
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

    await new Promise((resolve, reject) => {
      const speed = 5 / duration; // original length / target
exec(
  `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -filter_complex "[0:v]setpts=${1/speed}*PTS[v]" -map "[v]" -map 1:a -t ${duration} -c:v libx264 -pix_fmt yuv420p -c:a aac "${outputPath}"`,
        (err, stdout, stderr) => {
          if (err) {
            console.error("FFmpeg error:", stderr);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log("Scene rendered successfully!");

    res.sendFile(outputPath);
  } catch (error) {
    console.error("Render scene error:", error);
    res.status(500).json({ error: "Scene rendering failed." });
  }
});

//////////////////////////////////////////////////////////////

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
