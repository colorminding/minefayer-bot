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
  yaw: 136.2,
  pitch: -74.1,
  
  exitOnDisconnect: (process.env.EXIT_ON_DISCONNECT || '1') === '1'
}

let bot = null
let attackInterval = null
let holdInterval = null
let lastLoggedYaw = null
let lastLoggedPitch = null
let startTime = Date.now()

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
    
    // Intercept incoming packets that might reset camera
    const origRead = bot._client.on.bind(bot._client)
    bot._client.on = function(event, cb) {
      if (event === 'packet') {
        return origRead(event, (packet) => {
          if (packet.data) {
            const packetName = packet.data.name || packet.name
            if (packetName === 'entity_look' || packetName === 'player_look' || packetName === 'entity_head_rotation') {
              console.log(`📥 Incoming packet (${packetName}):`, { yaw: packet.data.yaw, pitch: packet.data.pitch })
            }
          }
          cb(packet)
        })
      }
      return origRead(event, cb)
    }
    
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

  // Debug: Monitor ALL move events (camera changes)
  bot.on('move', () => {
    if (bot.entity) {
      const currentYaw = Math.round(bot.entity.yaw * 100) / 100
      const currentPitch = Math.round(bot.entity.pitch * 100) / 100
      const elapsed = Date.now() - startTime
      
      if (lastLoggedYaw !== currentYaw || lastLoggedPitch !== currentPitch) {
        console.log(`[${elapsed}ms] 📷 MOVE event: [${lastLoggedYaw}, ${lastLoggedPitch}] → [${currentYaw}, ${currentPitch}]`)
        lastLoggedYaw = currentYaw
        lastLoggedPitch = currentPitch
      }
    }
  })

  // Catch position_look packets from server (these might reset camera)
  const origWrite = bot._client.write
  bot._client.write = function(packet, ...args) {
    if (packet.name === 'position_look' || packet.name === 'player_look') {
      console.log(`📡 Server packet (${packet.name}):`, packet)
    }
    return origWrite.call(this, packet, ...args)
  }
}

function startAttacking () {
  if (attackInterval) clearInterval(attackInterval)
  if (holdInterval) clearInterval(holdInterval)
  
  // Hold rightclick loop
  holdInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      bot.activateItem()
    } catch (e) {}
  }, 50)
  
  // Slower camera lock: refresh every 500ms to prevent reset without spinning
  let cameraLockInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      const beforeYaw = Math.round(bot.entity.yaw * 100) / 100
      const beforePitch = Math.round(bot.entity.pitch * 100) / 100
      const elapsed = Date.now() - startTime
      
      bot.look(CFG.yaw, CFG.pitch, false)
      
      const afterYaw = Math.round(bot.entity.yaw * 100) / 100
      const afterPitch = Math.round(bot.entity.pitch * 100) / 100
      
      if (beforeYaw !== CFG.yaw || beforePitch !== CFG.pitch) {
        console.log(`[${elapsed}ms] 🔄 look() called: before [${beforeYaw}, ${beforePitch}] → target [${CFG.yaw}, ${CFG.pitch}]`)
      }
    } catch (e) {}
  }, 500)
  
  intervals.push(cameraLockInterval)
  
  // Monitor angle drift every second
  let monitorInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      const currentYaw = Math.round(bot.entity.yaw * 100) / 100
      const currentPitch = Math.round(bot.entity.pitch * 100) / 100
      const yawDrift = Math.abs(currentYaw - CFG.yaw)
      const pitchDrift = Math.abs(currentPitch - CFG.pitch)
      const elapsed = Date.now() - startTime
      
      if (yawDrift > 0.5 || pitchDrift > 0.5) {
        console.log(`[${elapsed}ms] ⚠️  DRIFT DETECTED: current [${currentYaw}, ${currentPitch}] vs target [${CFG.yaw}, ${CFG.pitch}] (Δ${yawDrift.toFixed(2)}, Δ${pitchDrift.toFixed(2)})`)
      }
    } catch (e) {}
  }, 1000)
  
  intervals.push(monitorInterval)
  
  // Attack loop: swing attack on interval
  attackInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) return
      bot.swingArm('right')
    } catch (e) {}
  }, CFG.attackIntervalMs)
}

let intervals = []

startBot()

