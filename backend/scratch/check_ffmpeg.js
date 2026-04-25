const ffmpegInstaller = require('ffmpeg-static');
const ffprobeInstaller = require('ffprobe-static');
console.log('FFMPEG Path:', ffmpegInstaller);
console.log('FFPROBE Path:', ffprobeInstaller.path);

const fs = require('fs');
if (ffmpegInstaller && fs.existsSync(ffmpegInstaller)) {
  console.log('FFMPEG binary exists');
} else {
  console.log('FFMPEG binary NOT found');
}
