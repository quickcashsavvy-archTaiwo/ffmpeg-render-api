const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/render", async (req, res) => {
  const { images, audios } = req.body;

  if (!images || !audios || images.length !== audios.length) {
    return res.status(400).json({ error: "Images and audios must match." });
  }

  const workDir = path.join(__dirname, "work");
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir);

  const listFile = path.join(workDir, "inputs.txt");
  let list = "";

  images.forEach((img, i) => {
    const imgPath = path.join(workDir, `img${i}.png`);
    const audPath = path.join(workDir, `aud${i}.mp3`);

    list += `file '${imgPath}'\n`;
    list += `duration 3\n`;

    exec(`curl -L "${img}" -o "${imgPath}"`);
    exec(`curl -L "${audios[i]}" -o "${audPath}"`);
  });

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
