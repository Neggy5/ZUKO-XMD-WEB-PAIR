const fs = require('fs')
const path = require('path')
let cheerio = require('cheerio')
const axios = require('axios')
const { spawn } = require('child_process')
let BodyForm = require('form-data')

function ffmpeg(buffer, args = [], ext = '', ext2 = '') {
  return new Promise(async (resolve, reject) => {
    try {
      let tmp = path.join(__dirname, '../media', + new Date() + '.' + ext)
      let out = tmp + '.' + ext2
      await fs.promises.writeFile(tmp, buffer)
      spawn("ffmpeg", [
        '-y',
        '-i', tmp,
        ...args,
        out
      ])
        .on('error', reject)
        .on('close', async (code) => {
          try {
            await fs.promises.unlink(tmp)
            if (code !== 0) return reject(code)
            const data = await fs.promises.readFile(out)
            await fs.promises.unlink(out)
            resolve(data)
          } catch (e) {
            reject(e)
          }
        })
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Convert Audio to Playable WhatsApp Audio (MP3)
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toAudio(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-ac', '2',
    '-b:a', '128k',
    '-ar', '44100',
    '-f', 'mp3'
  ], ext, 'mp3')
}

/**
 * Convert Audio to Playable WhatsApp PTT (Voice Note)
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension 
 */
function toPTT(buffer, ext) {
  return ffmpeg(buffer, [
    '-vn',
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vbr', 'on',
    '-compression_level', '10',
    '-f', 'ogg'
  ], ext, 'opus')
}

/**
 * Convert WebP Sticker to MP4 Video
 * @param {String} path File path of sticker
 */
function toVideo(path) {
  return new Promise((resolve, reject) => {
    const form = new BodyForm()
    form.append('new-image-url', '')
    form.append('new-image', fs.createReadStream(path))
    axios({
      method: 'post',
      url: 'https://s6.ezgif.com/webp-to-mp4',
      data: form,
      headers: {
        'Content-Type': `multipart/form-data; boundary=${form._boundary}`
      }
    }).then(({ data }) => {
      const bodyFormThen = new BodyForm()
      const $ = cheerio.load(data)
      const file = $('input[name="file"]').attr('value')
      bodyFormThen.append('file', file)
      bodyFormThen.append('convert', "Convert WebP to MP4!")
      axios({
        method: 'post',
        url: 'https://ezgif.com/webp-to-mp4/' + file,
        data: bodyFormThen,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${bodyFormThen._boundary}`
        }
      }).then(({ data }) => {
        const $ = cheerio.load(data)
        const result = 'https:' + $('div#output > p.outfile > video > source').attr('src')
        resolve({
          status: true,
          message: "Conversion successful",
          result: result
        })
      }).catch(reject)
    }).catch(reject)
  })
}

/**
 * Validate if buffer is valid audio
 * @param {Buffer} buffer Audio Buffer
 * @returns {Boolean}
 */
function isValidAudio(buffer) {
  if (!buffer || buffer.length < 1000) return false;
  
  // Check for MP3 header (ID3 or MPEG frame sync)
  const isMP3 = buffer.toString('ascii', 0, 3) === 'ID3' || 
                (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0);
  
  // Check for OGG header
  const isOGG = buffer.toString('ascii', 0, 4) === 'OggS';
  
  // Check for M4A/MP4 header
  const isM4A = buffer.toString('ascii', 0, 4) === 'ftyp';
  
  // Check for WAV header
  const isWAV = buffer.toString('ascii', 0, 4) === 'RIFF';
  
  return isMP3 || isOGG || isM4A || isWAV;
}

/**
 * Detect audio format from buffer
 * @param {Buffer} buffer Audio Buffer
 * @returns {String} Format name
 */
function detectAudioFormat(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  
  const header = buffer.toString('ascii', 0, 4);
  
  if (header === 'ID3') return 'mp3';
  if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'mp3';
  if (header === 'OggS') return 'ogg';
  if (header === 'ftyp') return 'm4a';
  if (header === 'RIFF') return 'wav';
  if (header === 'MThd') return 'midi';
  if (header === 'FLAC') return 'flac';
  
  return 'unknown';
}

/**
 * Convert any audio to WhatsApp compatible MP3
 * @param {Buffer} buffer Audio Buffer
 * @param {String} ext File Extension (optional)
 * @returns {Promise<Buffer>}
 */
async function toWhatsAppAudio(buffer, ext = 'm4a') {
  try {
    // Check if already valid
    if (isValidAudio(buffer)) {
      const format = detectAudioFormat(buffer);
      if (format === 'mp3') return buffer;
      
      // Convert to MP3 if not already
      return await toAudio(buffer, format);
    }
    
    // Try to convert with detected format
    const detectedExt = detectAudioFormat(buffer) || ext;
    return await toAudio(buffer, detectedExt);
  } catch (e) {
    console.error('Conversion error:', e);
    throw e;
  }
}

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
  isValidAudio,
  detectAudioFormat,
  toWhatsAppAudio
}