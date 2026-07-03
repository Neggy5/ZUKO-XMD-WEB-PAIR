const fs = require('fs')

// ===== BOT IDENTITY =====
// Fill these in with YOUR OWN details via environment variables (see .env.example),
// or edit the fallback values below directly. Do not ship someone else's number here.
global.owner = [process.env.OWNER_NUMBER || 'CHANGE_ME']
global.ownernumber = process.env.OWNER_NUMBER || 'CHANGE_ME'
global.OWNER_NAME = process.env.OWNER_NAME || 'My Bot Owner'
global.DEVELOPER = [process.env.OWNER_NUMBER || 'CHANGE_ME']
global.BOT_NAME = process.env.BOT_NAME || 'My WhatsApp Bot'
global.botName = global.BOT_NAME
global.botname = global.BOT_NAME
global.bankowner = global.BOT_NAME
global.creatorName = global.BOT_NAME
global.ownername = global.OWNER_NAME
global.author = global.OWNER_NAME
global.creator = `${process.env.OWNER_NUMBER || 'CHANGE_ME'}@s.whatsapp.net`

// ===== BOT SETTINGS =====
global.status = false                      // "self/public" section
global.prefa = ['','!','.','#','&']        // prefixes (final, was set twice)
global.xprefix = '.'
global.version = "1.0.1"
global.themeemoji = "🥷"
global.location = "Nigeria,lagos island"

// ===== LINKS & MEDIA =====
global.gambar = process.env.BOT_THUMBNAIL_URL || ''
global.thumbnail = process.env.BOT_THUMBNAIL_URL || ''
global.link = process.env.BOT_GROUP_LINK || ''
global.wagc = process.env.BOT_GROUP_LINK || ''
global.richpp = ' '
global.packname = `Sticker By ${global.BOT_NAME}`

// ===== MENU IMAGE =====
global.menuImage = __dirname + '/../media/logo.jpg'   // local file used as the menu thumbnail

// ===== NEWSLETTER / CHANNEL CONTEXT =====
// Used to make bot messages show a "forwarded from channel" tag with a View channel button.
global.newsletterJid = process.env.NEWSLETTER_JID || ''
global.newsletterName = global.BOT_NAME

// ===== DISPLAY =====
global.footer = "𝕫𝕦𝕜𝕠 ✗𝕞𝕕"             // final (was set twice)
global.onlyowner = `Only 𝐃𝐄𝐕 𝐙𝐔𝐊𝐎 can use this Command 🥶🥷`
global.database = `*To Exist In The Database Contact The Owner of this bot*`

// ===== FEATURES =====
global.autobio = true                      // auto update bio
global.hituet = 0
global.autoviewstatus = false
global.autoread = false                    // auto read messages
global.anti92 = true                       // auto block +92
global.autoswview = true                   // auto view status/story

// ===== MESSAGES =====
global.mess = {
    wait: "*Configurating.......*",
    success: "*Successfully acknowledged ☑️*",
    on: "*Activated ✅*",
    prem: "*Feature For Premium Users only*",
    off: "*Deactivated 📛*",
    query: {
        text: "*Please, Provide A Text Query 📑*",
        link: "Please, provide a valid link 🔗*",
    },
    error: {
        fitur: "*Status 🌐: Feature Or Command error ❌*",
    },
    only: {
        group: "*Group only feature ❌*",
        private: "*Private chat feature only ❌*",
        owner: "*Owner feature only ❌*",
        admin: "*bot owner feature only ❌*",
        badmin: "*Seek admin privilege's to use this command ❌*",
        premium: "*Availabe for premium users only ❌*",
    }
}

let file = require.resolve(__filename)
require('fs').watchFile(file, () => {
  require('fs').unwatchFile(file)
  console.log('\x1b[0;32m'+__filename+' \x1b[1;32mupdated!\x1b[0m')
  delete require.cache[file]
  require(file)
})

//Property of Violetkingdev  
//owner number:+2347059886720
//telegram :@VIOLETKINGDEV
