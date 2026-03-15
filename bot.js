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
  
  attackIntervalMs: Number(process.env.ATTACK_INTERVAL_MS || 650),
  
  // Fixed camera angles
  yaw: 0,
  pitch: 0,
  
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
    console.log('✅ Bot joined.')
    startAttacking()
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

function startAttacking () {
  if (attackInterval) clearInterval(attackInterval)
  if (holdInterval) clearInterval(holdInterval)
  
  // Fast loop: hold rightclick and maintain fixed camera angle
  holdInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      
      // Hold rightclick continuously
      bot.activateItem()
      
      // Maintain fixed look angle
      bot.look(CFG.yaw, CFG.pitch, false)
    } catch (e) {}
  }, 50)
  
  // Attack loop: swing attack on interval
  attackInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      bot.swingArm('right')
    } catch (e) {}
  }, CFG.attackIntervalMs)
}

startBot()

