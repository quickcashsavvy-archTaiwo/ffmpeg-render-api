const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const app = express();
app.use(express.json());

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
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// Render endpoint (OPTION A IMPLEMENTED)
app.post("/render", async (req, res) => {
  try {
    const { images, audios } = req.body;

    if (!images || !audios || images.length !== audios.length) {
      return res.status(400).json({
        error: "Images and audios arrays must exist and match in length.",
      });
    }

    const workDir = path.join(__dirname, "work");

    // Create working directory
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    const segments = [];

    // 🔥 STEP 1: Create scene videos (image + audio)
    for (let i = 0; i < images.length; i++) {
      const imgPath = path.join(workDir, `img${i}.png`);
      const audPath = path.join(workDir, `aud${i}.mp3`);
      const segmentPath = path.join(workDir, `segment_${i}.mp4`);

      console.log(`Downloading image ${i}...`);
      await downloadFile(images[i], imgPath);

      console.log(`Downloading audio ${i}...`);
      await downloadFile(audios[i], audPath);

      console.log(`Creating segment ${i}...`);

      await new Promise((resolve, reject) => {
        exec(
          `ffmpeg -y -loop 1 -i "${imgPath}" -i "${audPath}" -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac "${segmentPath}"`,
          (err, stdout, stderr) => {
            if (err) {
              console.error("FFmpeg segment error:", stderr);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      segments.push(segmentPath);
    }

    // 🔥 STEP 2: Concatenate all scene videos
    const concatFile = path.join(workDir, "segments.txt");

    const concatContent = segments
      .map((segment) => `file '${segment}'`)
      .join("\n");

    fs.writeFileSync(concatFile, concatContent);

    const finalVideo = path.join(workDir, "final_video.mp4");

    console.log("Concatenating segments...");

    await new Promise((resolve, reject) => {
      exec(
        `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalVideo}"`,
        (err, stdout, stderr) => {
          if (err) {
            console.error("FFmpeg concat error:", stderr);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    console.log("Video successfully created!");

    res.sendFile(finalVideo);
  } catch (error) {
    console.error("Render error:", error);
    res.status(500).json({ error: "Video rendering failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port", PORT));
