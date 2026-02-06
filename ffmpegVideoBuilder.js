const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const axios = require('axios');

// Example input from n8n
const images = ["scene-0.png", "scene-1.png", "scene-2.png", "scene-3.png", "scene-4.png"];
const audios = ["scene-0.mp3", "scene-1.mp3", "scene-2.mp3", "scene-3.mp3", "scene-4.mp3"];
const count = images.length;

// Helper: download file from URL (if needed)
async function downloadFile(url, outputPath) {
    const writer = fs.createWriteStream(outputPath);
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// Main function
async function createVideo() {
    const segments = [];

    for (let i = 0; i < count; i++) {
        const imagePath = images[i]; // Or downloaded path if using URLs
        const audioPath = audios[i]; // Or downloaded path if using URLs
        const segmentPath = `segment_${i}.mp4`;

        // FFmpeg command to pair image and audio
        const ffmpegCmd = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest "${segmentPath}"`;

        console.log(`Creating segment ${i}: ${ffmpegCmd}`);
        await execPromise(ffmpegCmd);

        segments.push(segmentPath);
    }

    // Create the concat text file
    const concatFile = 'segments.txt';
    fs.writeFileSync(concatFile, segments.map(s => `file '${s}'`).join('\n'));

    // Concatenate all segments into final video
    const finalVideo = 'final_video.mp4';
    const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalVideo}"`;
    console.log(`Concatenating segments: ${concatCmd}`);
    await execPromise(concatCmd);

    console.log('✅ Video created successfully:', finalVideo);
}

// Helper: promisified exec
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

// Run
createVideo().catch(console.error);
