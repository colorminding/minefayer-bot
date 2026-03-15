/**
 * Minecraft Bot using Mineflayer
 * Constantly drinks from offhand potion
 * Attacks armor stands every 550ms
 * 
 * ENV:
 * MC_HOST, MC_PORT, MC_VERSION, MC_USER (email), PROFILES_DIR, MC_AUTH (microsoft/offline)
 */
require('dotenv').config()
const mineflayer = require('mineflayer')

const CFG = {
  host: process.env.MC_HOST || 'server.colorminding.de',
  port: Number(process.env.MC_PORT || 25566),
  version: process.env.MC_VERSION || '1.21.10',
  username: process.env.MC_USER || 'test@example.com',
  auth: process.env.MC_AUTH || 'microsoft',
  profilesFolder: process.env.PROFILES_DIR || './profiles'
}

let bot = null
let drinkInterval = null
let attackInterval = null

function startBot () {
  console.log('🟦 Starting Mineflayer bot…')

  bot = mineflayer.createBot({
    host: CFG.host,
    port: CFG.port,
    version: CFG.version,
    username: CFG.username,
    auth: CFG.auth,
    profilesFolder: CFG.profilesFolder
  })

  bot.once('spawn', () => {
    console.log('✅ Bot joined.')
    startActions()
  })

  bot.on('kicked', (reason) => {
    console.log('⛔ Kicked:', reason)
  })

  bot.on('error', (err) => {
    console.log('⚠️ Error:', err.message)
  })

  bot.on('end', () => {
    console.log('🔌 Disconnected.')
    if (drinkInterval) clearInterval(drinkInterval)
    if (attackInterval) clearInterval(attackInterval)
    process.exit(0)
  })
}

function startActions () {
  if (drinkInterval) clearInterval(drinkInterval)
  if (attackInterval) clearInterval(attackInterval)

  // Continuously drink from offhand (rightclick)
  drinkInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      bot.activateItem()
    } catch (e) {}
  }, 50)

  // Attack nearby armor stands every 550ms
  attackInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return

      // Find nearest armor stand
      let target = null
      let minDistance = Infinity

      for (const entity of Object.values(bot.entities)) {
        if (entity.name !== 'armor_stand') continue

        const distance = bot.entity.position.distanceTo(entity.position)
        if (distance < minDistance && distance < 10) {
          minDistance = distance
          target = entity
        }
      }

      // Attack the target
      if (target) {
        bot.attack(target)
      }
    } catch (e) {}
  }, 550)

  console.log('🎮 Bot started: drinking from offhand, attacking armor stands every 550ms')
}

startBot()

