const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const axios = require('axios');
const { spawn } = require('child_process');
const BodyForm = require('form-data');

// ─── Use ffmpeg-static if available, fallback to 'ffmpeg' ───
let ffmpegPath = 'ffmpeg';
try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) {
        ffmpegPath = ffmpegStatic;
        console.log('✅ ffmpeg-static loaded:', ffmpegPath);
    }
} catch (e) {
    console.log('⚠️ ffmpeg-static not found, using system ffmpeg');
}

// ─── Check if ffmpeg exists ───
function checkFfmpeg() {
    try {
        const { execSync } = require('child_process');
        execSync(`${ffmpegPath} -version`, { stdio: 'ignore' });
        return true;
    } catch (e) {
        console.error('❌ ffmpeg not found! Install ffmpeg or ffmpeg-static');
        return false;
    }
}
checkFfmpeg();

// ─── FFMPEG CONVERTER (FIXED) ───
function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
    return new Promise(async (resolve, reject) => {
        // Ensure tmp directory exists
        const tmpDir = path.join(__dirname, '../tmp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }

        const timestamp = Date.now();
        const tmp = path.join(tmpDir, `${timestamp}.${ext}`);
        const out = path.join(tmpDir, `${timestamp}.${ext2}`);

        try {
            // Write input file
            await fs.promises.writeFile(tmp, buffer);

            // Build ffmpeg command
            const argsList = [
                '-y',
                '-i', tmp,
                ...args,
                out
            ];

            console.log(`🔧 Running ffmpeg: ${ffmpegPath} ${argsList.join(' ')}`);

            const process = spawn(ffmpegPath, argsList);

            let stderr = '';
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('error', (err) => {
                console.error('❌ ffmpeg spawn error:', err);
                reject(err);
            });

            process.on('close', async (code) => {
                try {
                    // Clean up input file
                    await fs.promises.unlink(tmp).catch(() => {});

                    if (code !== 0) {
                        console.error('❌ ffmpeg exited with code:', code);
                        console.error('❌ stderr:', stderr);
                        return reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
                    }

                    // Read output file
                    if (!fs.existsSync(out)) {
                        return reject(new Error('Output file not created'));
                    }

                    const result = await fs.promises.readFile(out);
                    await fs.promises.unlink(out).catch(() => {});
                    resolve(result);

                } catch (e) {
                    reject(e);
                }
            });

        } catch (e) {
            // Clean up on error
            try { await fs.promises.unlink(tmp).catch(() => {}); } catch {}
            try { await fs.promises.unlink(out).catch(() => {}); } catch {}
            reject(e);
        }
    });
}

// ─── Convert Audio to MP3 ───
function toAudio(buffer, ext) {
    if (!ext) ext = 'm4a';
    return ffmpeg(buffer, [
        '-vn',
        '-ac', '2',
        '-b:a', '128k',
        '-ar', '44100',
        '-f', 'mp3'
    ], ext, 'mp3');
}

// ─── Convert Audio to PTT (Voice Note) ───
function toPTT(buffer, ext) {
    if (!ext) ext = 'm4a';
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '128k',
        '-vbr', 'on',
        '-compression_level', '10',
        '-f', 'opus'
    ], ext, 'opus');
}

// ─── Convert WebP to MP4 (FIXED with ffmpeg) ───
function toVideo(buffer) {
    return new Promise(async (resolve, reject) => {
        try {
            // Ensure tmp directory exists
            const tmpDir = path.join(__dirname, '../tmp');
            if (!fs.existsSync(tmpDir)) {
                fs.mkdirSync(tmpDir, { recursive: true });
            }

            const timestamp = Date.now();
            const inputPath = path.join(tmpDir, `${timestamp}.webp`);
            const outputPath = path.join(tmpDir, `${timestamp}.mp4`);

            // Write input file
            await fs.promises.writeFile(inputPath, buffer);

            // Convert using ffmpeg
            const args = [
                '-y',
                '-i', inputPath,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                outputPath
            ];

            console.log(`🔧 Converting webp to mp4: ${ffmpegPath} ${args.join(' ')}`);

            const process = spawn(ffmpegPath, args);
            let stderr = '';

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('error', (err) => {
                console.error('❌ ffmpeg spawn error:', err);
                reject(err);
            });

            process.on('close', async (code) => {
                try {
                    await fs.promises.unlink(inputPath).catch(() => {});

                    if (code !== 0) {
                        console.error('❌ ffmpeg exited with code:', code);
                        console.error('❌ stderr:', stderr);
                        return reject(new Error(`ffmpeg exited with code ${code}`));
                    }

                    if (!fs.existsSync(outputPath)) {
                        return reject(new Error('Output file not created'));
                    }

                    const result = await fs.promises.readFile(outputPath);
                    await fs.promises.unlink(outputPath).catch(() => {});
                    resolve(result);

                } catch (e) {
                    reject(e);
                }
            });

        } catch (e) {
            reject(e);
        }
    });
}

// ─── Add Case to case.js ───
function addCase(fileName, text) {
    const newCase = `${text}`;

    return new Promise((resolve, reject) => {
        fs.readFile(fileName, 'utf8', (err, data) => {
            if (err) {
                console.error('An error occurred while reading the file:', err);
                return reject({
                    status: false,
                    message: err.message
                });
            }

            const startPosition = data.indexOf("case 'clearuserv3':");
            if (startPosition !== -1) {
                const fullNewCode = data.slice(0, startPosition) + '\n' + newCase + '\n' + data.slice(startPosition);
                fs.writeFile(fileName, fullNewCode, 'utf8', (err) => {
                    if (err) {
                        console.error('An error occurred while writing to the file:', err);
                        return reject({
                            status: false,
                            message: err.message
                        });
                    }
                    resolve({
                        status: true,
                        message: "Successfully added a new case!"
                    });
                });
            } else {
                resolve({
                    status: false,
                    message: "Case ID not found"
                });
            }
        });
    });
}

// ─── Delete Case from case.js ───
function delCase(filePath, caseNameToRemove) {
    return new Promise((resolve, reject) => {
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error('An error occurred:', err);
                return reject({
                    status: false,
                    message: err.message
                });
            }

            const regex = new RegExp(`case\\s+'${caseNameToRemove}':[\\s\\S]*?break`, 'g');
            if (!regex.test(data)) {
                return resolve({
                    status: false,
                    message: "Case not found"
                });
            }

            const modifiedData = data.replace(regex, '');

            fs.writeFile(filePath, modifiedData, 'utf8', (err) => {
                if (err) {
                    console.error('An error occurred while writing to the file:', err);
                    return reject({
                        status: false,
                        message: err.message
                    });
                }

                resolve({
                    status: true,
                    message: `The text from case '${caseNameToRemove}' has been removed from the file.`
                });
            });
        });
    });
}

module.exports = {
    toAudio,
    toPTT,
    toVideo,
    ffmpeg,
    delCase,
    addCase,
    checkFfmpeg,
    ffmpegPath
};