import express from "express";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());

app.post("/render", async (req, res) => {
  const { images, audio } = req.body;
  const id = Date.now();
  const workDir = `/tmp/${id}`;
  fs.mkdirSync(workDir);

  // Save image list
  const listFile = path.join(workDir, "images.txt");
  fs.writeFileSync(
    listFile,
    images.map(i => `file '${i}'\nduration ${i.duration || 3}`).join("\n")
  );

  const output = `/tmp/video-${id}.mp4`;

  const cmd = `
ffmpeg -y -f concat -safe 0 -i ${listFile} \
-i ${audio} -c:v libx264 -pix_fmt yuv420p \
-shortest ${output}
`;

  exec(cmd, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ video_url: output });
  });
});

app.listen(process.env.PORT || 3000, () =>
  console.log("FFmpeg render API running")
);
