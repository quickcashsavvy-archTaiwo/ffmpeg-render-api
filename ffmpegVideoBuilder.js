const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const axios = require('axios');
const express = require('express');
const app = express();
app.use(express.json());

// Promisified exec helper
function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('FFmpeg error:', stderr);
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

// Download helper (if URLs)
async function downloadFile(url, outputPath) {
    const writer = fs.createWriteStream(outputPath);
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

app.post('/create-video', async (req, res) => {
    try {
        const { images, audios } = req.body;
        if (!images || !audios || images.length !== audios.length) {
            return res.status(400).json({ error: 'Images and audios arrays must exist and have the same length' });
        }

        const segments = [];

        // Loop through each image/audio pair
        for (let i = 0; i < images.length; i++) {
            const imagePath = images[i]; // if URL, use downloadFile()
            const audioPath = audios[i];
            const segmentPath = `segment_${i}.mp4`;

            const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${segmentPath}"`;
            console.log(`Creating segment ${i}`);
            await execPromise(cmd);

            segments.push(segmentPath);
        }

        // Concatenate segments
        const concatFile = 'segments.txt';
        fs.writeFileSync(concatFile, segments.map(s => `file '${s}'`).join('\n'));
        const finalVideo = 'final_video.mp4';
        await execPromise(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalVideo}"`);

        // Send final video path (or URL if using static hosting)
        res.json({ video: finalVideo });

        // Optional: cleanup segments
        // segments.forEach(f => fs.unlinkSync(f));
        // fs.unlinkSync(concatFile);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FFmpeg API running on port ${PORT}`));
