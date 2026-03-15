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
  
  // Camera angles (yaw, pitch) - set these to lock camera
  yaw: null,
  pitch: null,
  
  exitOnDisconnect: (process.env.EXIT_ON_DISCONNECT || '1') === '1'
}

let bot = null
let attackInterval = null
let holdInterval = null

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
    console.log('✅ Bot joined. Auto-attacking at', CFG.attackIntervalMs + 'ms')
    bot.on('chat', onChat)
    startAutoAttack()
  })

  bot.on('kicked', r => console.log('⛔ Kicked:', r))
  bot.on('error', e => console.log('⚠️ Error:', e?.message || e))

  bot.on('end', () => {
    console.log('🔌 Disconnected.')
    if (attackInterval) clearInterval(attackInterval)
    if (holdInterval) clearInterval(holdInterval)
    
    if (CFG.exitOnDisconnect) {
      process.exit(1)
    } else {
      process.exit(1)
    }
  })
}

function startAutoAttack () {
  if (attackInterval) clearInterval(attackInterval)
  if (holdInterval) clearInterval(holdInterval)
  
  // Fast loop: hold rightclick and maintain camera angle if locked
  holdInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      
      // Hold rightclick continuously
      bot.activateItem()
      
      // Keep camera angle locked if set
      if (CFG.yaw !== null && CFG.pitch !== null) {
        bot.look(CFG.yaw, CFG.pitch, false)
      }
    } catch (e) {}
  }, 50)
  
  // Attack loop: swing and attack on interval
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

function onChat (username, message) {
  const arg2 = parts[2]
  
  if (cmd === '!speed' || cmd === '!attack') {
    if (!arg1 || isNaN(arg1)) {
      bot.chat(`Current attack interval: ${CFG.attackIntervalMs}ms. Usage: !speed <ms>`)
      return
    }
    
    const newInterval = Number(arg1)
    if (newInterval < 50 || newInterval > 10000) {
      bot.chat('Invalid interval. Range: 50-10000ms')
      return
    }
    
    CFG.attackIntervalMs = newInterval
    startAutoAttack()
    bot.chat(`⚔️ Attack speed set to ${newInterval}ms`)
  }
  
  if (cmd === '!angle' || cmd === '!lock') {
    if (!arg1 || !arg2) {
      bot.chat(`Current lock: Yaw: ${CFG.yaw}, Pitch: ${CFG.pitch}. Usage: !angle <yaw> <pitch> or !angle off`)
      return
    }
    
    if (arg1.toLowerCase() === 'off') {
      CFG.yaw = null
      CFG.pitch = null
      bot.chat('👀 Camera lock disabled')
      return
    }
    
    if (isNaN(arg1) || isNaN(arg2)) {
      bot.chat('Invalid values. Usage: !angle <yaw> <pitch>')
      return
    }
    
    CFG.yaw = Number(arg1)
    CFG.pitch = Number(arg2)
    bot.chat(`👀 Camera locked to Yaw: ${CFG.yaw}, Pitch: ${CFG.pitch}`)
  }
  
  if (cmd === '!help') {
    bot.chat('Commands: !speed <ms>, !angle <yaw> <pitch>, !angle off, !help')
  }
}
  if (cmd === '!help') {
    bot.chat('Commands: !speed <ms> (set attack interval), !help')
  }
}

startBot()
