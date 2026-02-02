const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("FFmpeg Render API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/render", async (req, res) => {
  try {
    const { images, audioUrl } = req.body;

    if (!images || !audioUrl) {
      return res.status(400).json({ error: "images and audioUrl required" });
    }

    const workDir = "/tmp/render";
    fs.mkdirSync(workDir, { recursive: true });

    // download images
    for (let i = 0; i < images.length; i++) {
      const img = path.join(workDir, `img${i}.png`);
      await fetch(images[i])
        .then(r => r.arrayBuffer())
        .then(b => fs.writeFileSync(img, Buffer.from(b)));
    }

    // download audio
    const audioPath = path.join(workDir, "audio.mp3");
    await fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(b => fs.writeFileSync(audioPath, Buffer.from(b)));

    const output = path.join(workDir, "video.mp4");

    const cmd = `ffmpeg -y -r 1 -i ${workDir}/img%d.png -i ${audioPath} -shortest -pix_fmt yuv420p ${output}`;

    exec(cmd, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "ffmpeg failed" });
      }

      res.sendFile(output);
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
