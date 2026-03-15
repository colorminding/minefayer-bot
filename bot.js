/**
 * Simple Mineflayer Auto-Attacker at Crit Speed
 * 
 * ENV:
 * MC_HOST, MC_PORT, MC_VERSION, MC_USER, MC_AUTH=microsoft, PROFILES_DIR=./profiles
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
  
  // Attack interval: 625ms is max sword speed, but add buffer for sweeping edge (650ms+ recommended)
  attackIntervalMs: 650,
  
  exitOnDisconnect: (process.env.EXIT_ON_DISCONNECT || '1') === '1'
}

let bot = null
let attackInterval = null

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
    console.log('✅ Bot joined. Auto-attacking at crit speed.')
    startAutoAttack()
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

function startAutoAttack () {
  if (attackInterval) clearInterval(attackInterval)
  
  attackInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      
      bot.swingArm('right')
      
      // Attack entity at cursor (no block destruction, no targeting)
      const entity = bot.entityAtCursor(256)
      if (entity && entity !== bot.entity) {
        bot.attack(entity)
      }
    } catch (e) {
      // Silently ignore
    }
  }, CFG.attackIntervalMs)
}

startBot()
