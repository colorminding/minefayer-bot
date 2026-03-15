/**
 * Simple Mineflayer Bot: Hold rightclick + swing attacks
 * 
 * ENV:
 * MC_HOST, MC_PORT, MC_VERSION, MC_USER, MC_AUTH=microsoft, PROFILES_DIR=./profiles
 * ATTACK_INTERVAL_MS=650 (attack swing interval, default 650ms)
 */
require('dotenv').config()
const mineflayer = require('mineflayer')

const CFG = {
  host: process.env.MC_HOST || 'server.colorminding.de',
  port: Number(process.env.MC_PORT || 25566),
  version: process.env.MC_VERSION || '1.21.1',
  username: process.env.MC_USER || 'email@example.com',
  auth: process.env.MC_AUTH || 'microsoft',
  profilesFolder: process.env.PROFILES_DIR || './profiles',
  
  attackIntervalMs: Number(process.env.ATTACK_INTERVAL_MS || 2000),
  
  exitOnDisconnect: (process.env.EXIT_ON_DISCONNECT || '1') === '1'
}

let bot = null
let attackInterval = null
let hadBadOmen = false

function startBot () {
  console.log('🟦 Starting bot…')

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
    
    // Monitor for bad omen effect loss and drink potion
    const effectCheckInterval = setInterval(() => {
      try {
        if (!bot || !bot.entity) return
        
        const badOmenEffect = bot.entity.effects[31] // Bad Omen effect ID
        const hasBadOmen = badOmenEffect !== undefined
        
        // If bot had bad omen but now doesn't, drink potion
        if (hadBadOmen && !hasBadOmen) {
          console.log('🍺 Bad omen lost! Drinking potion from off-hand...')
          bot.activateItem()
        }
        
        hadBadOmen = hasBadOmen
      } catch (e) {}
    }, 100)
    
    startAttacking()
  })

  bot.on('kicked', r => console.log('⛔ Kicked:', r))
  bot.on('error', e => console.log('⚠️ Error:', e?.message || e))

  bot.on('end', () => {
    console.log('🔌 Disconnected.')
    if (attackInterval) clearInterval(attackInterval)
    
    if (CFG.exitOnDisconnect) {
      process.exit(1)
    } else {
      process.exit(1)
    }
  })
}

function startAttacking () {
  if (attackInterval) clearInterval(attackInterval)
  
  // Attack loop: find nearest entity and attack it
  attackInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      
      // Find nearest entity (excluding the bot itself)
      let target = null
      let minDistance = Infinity
      
      for (const entity of Object.values(bot.entities)) {
        if (entity.type === 'object' || entity.type === 'player') continue
        
        const distance = bot.entity.position.distanceTo(entity.position)
        if (distance < minDistance && distance < 50) {
          minDistance = distance
          target = entity
        }
      }
      
      // Attack the target
      if (target) {
        bot.attack(target)
      }
    } catch (e) {}
  }, CFG.attackIntervalMs)
}

startBot()

