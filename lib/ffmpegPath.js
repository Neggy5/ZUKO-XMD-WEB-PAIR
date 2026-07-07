// Resolves a usable ffmpeg binary path so conversions don't depend on
// ffmpeg being installed system-wide. Uses the bundled ffmpeg-static binary,
// and falls back to the system "ffmpeg" on PATH if that package is missing.
let ffmpegPath = 'ffmpeg';

try {
  ffmpegPath = require('ffmpeg-static');
  if (!ffmpegPath) throw new Error('ffmpeg-static returned no path');
} catch (e) {
  console.warn(
    '[ffmpegPath] "ffmpeg-static" not installed/available — falling back to system ffmpeg. ' +
    'Run "npm install ffmpeg-static" to avoid depending on a system install.'
  );
}

module.exports = ffmpegPath;
