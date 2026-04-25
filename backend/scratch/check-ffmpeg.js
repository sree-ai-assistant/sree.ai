const ffmpegInstaller = require('ffmpeg-static');
const ffprobeInstaller = require('ffprobe-static');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');

console.log('FFmpeg Installer:', ffmpegInstaller);
console.log('FFprobe Installer:', ffprobeInstaller);

const ffmpegPath = typeof ffmpegInstaller === 'string' ? ffmpegInstaller : ffmpegInstaller.path;
const ffprobePath = typeof ffprobeInstaller === 'string' ? ffprobeInstaller : ffprobeInstaller.path;

console.log('Resolved FFmpeg Path:', ffmpegPath);
console.log('Resolved FFprobe Path:', ffprobePath);

if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    console.log('FFmpeg binary exists');
} else {
    console.log('FFmpeg binary NOT found');
}

if (ffprobePath && fs.existsSync(ffprobePath)) {
    console.log('FFprobe binary exists');
} else {
    console.log('FFprobe binary NOT found');
}
