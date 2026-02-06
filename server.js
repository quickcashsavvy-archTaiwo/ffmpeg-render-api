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

// Proper download function (WAITS until file is finished)
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

app.post("/render", async (req, res) => {
  const { images, audios } = req.body;

  if (!images || !audios || images.length !== audios.length) {
    return res.status(400).json({ error: "Images and audios must match." });
  }

  const workDir = path.join(__dirname, "work");
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

  const listFile = path.join(workDir, "inputs.txt");
  let list = "";

  // ✅ DOWNLOAD FIRST (and WAIT)
  for (let i = 0; i < images.length; i++) {
    const imgPath = path.join(workDir, `img${i}.png`);
    const audPath = path.join(workDir, `aud${i}.mp3`);

    await downloadFile(images[i], imgPath);
    await downloadFile(audios[i], audPath);

    list += `file '${imgPath}'\n`;
    list += `duration 5\n`;
  }

  fs.writeFileSync(listFile, list);

  const output = path.join(workDir, "video.mp4");

  exec(
    `ffmpeg -y -f concat -safe 0 -i ${listFile} -pix_fmt yuv420p ${output}`,
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "FFmpeg failed" });
      }
      res.sendFile(output);
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
