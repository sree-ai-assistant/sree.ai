const ffmpegInstaller = require('ffmpeg-static');
const ffprobeInstaller = require('ffprobe-static');
const fs = require('fs');

console.log('FFmpeg Installer:', ffmpegInstaller);
console.log('FFprobe Installer:', ffprobeInstaller);

if (ffmpegInstaller) {
  const ffmpegPath = typeof ffmpegInstaller === 'string' ? ffmpegInstaller : ffmpegInstaller.path;
  console.log('Resolved FFmpeg Path:', ffmpegPath);
  console.log('FFmpeg Path exists:', fs.existsSync(ffmpegPath));
}

if (ffprobeInstaller) {
  const ffprobePath = typeof ffprobeInstaller === 'string' ? ffprobeInstaller : ffprobeInstaller.path;
  console.log('Resolved FFprobe Path:', ffprobePath);
  console.log('FFprobe Path exists:', fs.existsSync(ffprobePath));
}
