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
let tickCounter = 0
const ATTACK_INTERVAL_TICKS = 11  // 550ms ≈ 11 ticks (20 ticks/sec)

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
    
    // Attack on game ticks instead of real-time (scales with server speed)
    bot.on('tick', () => {
      try {
        tickCounter++
        
        if (!bot || !bot.entity) return
        
        if (tickCounter >= ATTACK_INTERVAL_TICKS) {
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
          
          tickCounter = 0
        }
      } catch (e) {}
    })
    
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
    process.exit(0)
  })
}

function startActions () {
  if (drinkInterval) clearInterval(drinkInterval)

  // Continuously drink from offhand (rightclick) - use raw packet to avoid angle reset
  drinkInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      // Send block_place packet directly (1 = off-hand)
      bot._client.write('block_place', {
        location: { x: 0, y: 0, z: 0 },
        direction: 0,
        hand: 1
      })
    } catch (e) {}
  }, 50)

  console.log('🎮 Bot started: drinking from offhand, attacking armor stands every 11 ticks (scales with server speed)')
}

startBot()

